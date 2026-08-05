import type { Adventurer, Clan, Contract, GameHistoryEntry, Mission, MissionRecurrence, PrerequisiteMode, SimulationReport } from '../types';
import { decrementMissionLifespan, isMissionExpired } from './missions';
import { recalculateReportEffects, reverseSimulationReportEffects } from './reportEffects';

export interface MissionLifecycleInput {
  missions: Mission[];
  contracts: Contract[];
  allMissions?: Mission[];
  completedMissionIds: string[];
  closedMissionIds?: string[];
  expiredMissionIds?: string[];
  missionRecurrences?: MissionRecurrence[];
  activeClanCount?: number;
  nextDay: number;
}

export interface MissionLifecycleResult {
  missions: Mission[];
  contracts: Contract[];
  completedMissionIds: string[];
  closedMissionIds: string[];
  expiredMissionIds: string[];
  expiredContractIds: string[];
  unlockedMissionIds: string[];
  scenarioDriven: boolean;
  missionRecurrences: MissionRecurrence[];
}

function missionDefinitionId(mission: Mission): string {
  return mission.definitionId ?? mission.id;
}

function scheduleRecurrence(
  queue: MissionRecurrence[],
  mission: Mission,
  trigger: 'SUCCESS' | 'OBJECTIVE_FAILED' | 'PARTY_LOST' | 'EXPIRED',
  nextDay: number
) {
  const repeat = mission.repeat;
  if (!repeat?.enabled || !repeat.repeatAfter.includes(trigger)) return;
  const occurrenceIndex = mission.occurrenceIndex ?? 1;
  if (repeat.maxOccurrences !== null && occurrenceIndex >= repeat.maxOccurrences) return;
  const definitionId = missionDefinitionId(mission);
  const scheduled: MissionRecurrence = {
    definitionId,
    occurrenceIndex: occurrenceIndex + 1,
    nextDay: nextDay + Math.max(1, repeat.cooldownDays) - 1
  };
  if (!queue.some(item => item.definitionId === definitionId && item.occurrenceIndex === scheduled.occurrenceIndex)) queue.push(scheduled);
}

function selectDailyQuota(candidates: Mission[], allMissions: Mission[], activeClanCount?: number): { selected: Mission[]; skipped: Mission[] } {
  if (activeClanCount === undefined) return { selected: candidates, skipped: [] };
  const target = Math.max(0, activeClanCount * 2);
  const excess = Math.max(0, candidates.length - target);
  if (excess === 0) return { selected: candidates, skipped: [] };
  const referencedIds = new Set(allMissions.flatMap(mission => [
    ...(mission.prerequisiteMissionIds ?? []),
    ...(mission.unlocksMissionIds ?? [])
  ]));
  const removable = candidates.filter(mission => {
    if (mission.type !== 'OPERATION' && mission.type !== 'DUMMY') return false;
    if (mission.definitionId || mission.repeat?.enabled) return false;
    if ((mission.chainIds?.length ?? 0) > 0 || (mission.prerequisiteMissionIds?.length ?? 0) > 0) return false;
    if (referencedIds.has(mission.id) || (mission.rewardSpecialItems?.length ?? 0) > 0) return false;
    return true;
  }).sort((left, right) => (left.quotaPriority ?? 0) - (right.quotaPriority ?? 0));
  const dummies = removable.filter(mission => mission.type === 'DUMMY');
  const operations = removable.filter(mission => mission.type === 'OPERATION');
  const dummyGoal = Math.floor(excess / 10);
  const skipped = [...operations.slice(0, excess - dummyGoal), ...dummies.slice(0, dummyGoal)];
  if (skipped.length < excess) {
    const selectedIds = new Set(skipped.map(mission => mission.id));
    skipped.push(...removable.filter(mission => !selectedIds.has(mission.id)).slice(0, excess - skipped.length));
  }
  const skippedIds = new Set(skipped.map(mission => mission.id));
  return { selected: candidates.filter(mission => !skippedIds.has(mission.id)), skipped };
}

function reportCompletesObjective(report: SimulationReport): boolean {
  const outcome = report.outcome ?? (report.isSuccess ? 'SUCCESS' : 'OBJECTIVE_FAILED');
  return outcome !== 'PARTY_LOST' && (report.baseObjectiveCompleted ?? report.isSuccess);
}

function prerequisitesSatisfied(
  mission: Mission,
  completedMissionIds: Set<string>
): boolean {
  const prerequisites = mission.prerequisiteMissionIds ?? [];
  if (prerequisites.length === 0) return true;
  const mode: PrerequisiteMode = mission.prerequisiteMode ?? 'ALL';
  return mode === 'ANY'
    ? prerequisites.some(id => completedMissionIds.has(id))
    : prerequisites.every(id => completedMissionIds.has(id));
}

export interface RecalculateScenarioProgressInput {
  allMissions?: Mission[];
  missions: Mission[];
  contracts: Contract[];
  history: GameHistoryEntry[];
  currentDay: number;
}

export interface RecalculateScenarioProgressResult {
  missions: Mission[];
  completedMissionIds: string[];
}

/**
 * Rebuilds scenario completion and availability after an archived report was
 * edited. Current mission lifespan values are preserved. Newly unlocked
 * missions start from their scenario definition, while an already contracted
 * mission is never removed underneath the GM.
 */
export function recalculateScenarioProgress(
  input: RecalculateScenarioProgressInput
): RecalculateScenarioProgressResult {
  const definitions = input.allMissions ?? [];
  if (definitions.length === 0) {
    return { missions: input.missions, completedMissionIds: [] };
  }

  const reports = [
    ...input.history.flatMap(entry => entry.reports),
    ...input.contracts.flatMap(contract => contract.simulationReport ? [contract.simulationReport] : [])
  ];
  const expiredMissionIds = new Set(reports.filter(report => report.isExpired).map(report => report.missionId));
  const definitionsById = new Map(definitions.map(mission => [mission.id, mission]));
  const completedMissionIds = new Set<string>();
  const explicitlyUnlocked = new Set<string>();
  const chronologicalBatches = [
    ...[...input.history]
      .sort((left, right) => left.day - right.day)
      .map(entry => entry.reports),
    input.contracts.flatMap(contract => contract.simulationReport ? [contract.simulationReport] : [])
  ];

  chronologicalBatches.forEach(batch => {
    const completedBeforeDay = new Set(completedMissionIds);
    batch.forEach(report => {
      if (report.isExpired || !reportCompletesObjective(report)) return;
      const definition = definitionsById.get(report.missionId);
      if (definition && !prerequisitesSatisfied(definition, completedBeforeDay)) return;
      completedMissionIds.add(report.missionId);
      report.effects?.unlockedMissionIds.forEach(id => explicitlyUnlocked.add(id));
    });
  });
  const contractedMissionIds = new Set(input.contracts.map(contract => contract.missionId));
  const currentById = new Map(input.missions.map(mission => [mission.id, mission]));
  const missions: Mission[] = [];

  definitions.forEach(definition => {
    if (completedMissionIds.has(definition.id) || expiredMissionIds.has(definition.id)) return;
    const scheduled = (definition.startDay ?? 1) <= input.currentDay || explicitlyUnlocked.has(definition.id);
    const eligible = scheduled && prerequisitesSatisfied(definition, completedMissionIds);
    const current = currentById.get(definition.id);
    if (!eligible && !contractedMissionIds.has(definition.id)) return;
    missions.push(current ? structuredClone(current) : structuredClone(definition));
  });

  // Preserve runtime missions that are absent from the scenario definition.
  input.missions.forEach(mission => {
    if (definitions.some(definition => definition.id === mission.id)) return;
    if (!completedMissionIds.has(mission.id) && !expiredMissionIds.has(mission.id)) {
      missions.push(structuredClone(mission));
    }
  });

  return { missions, completedMissionIds: [...completedMissionIds] };
}

export interface ReconcileScenarioHistoryInput extends RecalculateScenarioProgressInput {
  adventurers: Adventurer[];
  clans: Clan[];
  missionRecurrences?: MissionRecurrence[];
}

export interface ReconcileScenarioHistoryResult extends RecalculateScenarioProgressResult {
  history: GameHistoryEntry[];
  adventurers: Adventurer[];
  clans: Clan[];
  closedMissionIds: string[];
  expiredMissionIds: string[];
  missionRecurrences: MissionRecurrence[];
}

/**
 * Revalidates archived reports in chronological order. Reports that could not
 * legally open lose only their own recorded effects; they remain readable in
 * the archive and can become valid again after a later GM correction.
 */
export function reconcileScenarioHistory(
  input: ReconcileScenarioHistoryInput
): ReconcileScenarioHistoryResult {
  const definitions = input.allMissions ?? [];
  const definitionsById = new Map(definitions.map(mission => [mission.id, mission]));
  let adventurers = structuredClone(input.adventurers);
  let clans = structuredClone(input.clans);
  const completedMissionIds = new Set<string>();
  const closedMissionIds = new Set<string>();
  const expiredMissionIds = new Set<string>();
  const explicitlyUnlockedMissionIds = new Set<string>();
  const historyByDay = new Map<number, GameHistoryEntry>();

  [...input.history]
    .sort((left, right) => left.day - right.day)
    .forEach(entry => {
      const completedBeforeDay = new Set(completedMissionIds);
      const reports = entry.reports.map(sourceReport => {
        let report = structuredClone(sourceReport);
        if (report.isExpired) {
          expiredMissionIds.add(report.missionId);
          return report;
        }
        const definition = definitionsById.get(report.missionId) ?? report.context?.mission;
        const prerequisitesValid = !definition || prerequisitesSatisfied(definition, completedBeforeDay);

        if (!prerequisitesValid && !report.invalidated) {
          const reversed = reverseSimulationReportEffects(adventurers, clans, report);
          adventurers = reversed.adventurers;
          clans = reversed.clans;
          report = {
            ...report,
            invalidated: true,
            invalidationReason: 'Предпосылки события не были выполнены к началу этого дня.'
          };
        } else if (prerequisitesValid && report.invalidated && definition && report.context) {
          const context = report.context;
          const contract: Contract = {
            missionId: report.missionId,
            title: report.missionTitle,
            clanId: context.clanId,
            confirmed: true,
            contractLevel: context.contractLevel,
            paymentAmount: 0,
            maxPartySize: context.maxPartySize,
            attachedResources: [...context.attachedResources],
            partyAdvIds: [...report.squadAdvIds]
          };
          const reapplied = recalculateReportEffects({
            editedReport: { ...report, invalidated: false, invalidationReason: undefined },
            contract,
            mission: definition,
            adventurers,
            clans,
            day: entry.day,
            participantStateReference: report
          });
          adventurers = reapplied.adventurers;
          clans = reapplied.clans;
          report = reapplied.report;
        }

        if (!report.invalidated) {
          closedMissionIds.add(report.missionId);
          if (reportCompletesObjective(report)) {
            completedMissionIds.add(report.missionId);
            report.effects?.unlockedMissionIds.forEach(id => explicitlyUnlockedMissionIds.add(id));
          }
        }
        return report;
      });
      historyByDay.set(entry.day, { ...entry, reports });
    });

  const history = input.history.map(entry => historyByDay.get(entry.day) ?? entry);
  const currentById = new Map(input.missions.map(mission => [mission.id, mission]));
  const contractedMissionIds = new Set(input.contracts.map(contract => contract.missionId));
  const missions: Mission[] = [];
  definitions.forEach(definition => {
    if (closedMissionIds.has(definition.id) || expiredMissionIds.has(definition.id)) return;
    const scheduled = (definition.startDay ?? 1) <= input.currentDay || explicitlyUnlockedMissionIds.has(definition.id);
    const eligible = scheduled && prerequisitesSatisfied(definition, completedMissionIds);
    if (!eligible && !contractedMissionIds.has(definition.id)) return;
    missions.push(structuredClone(currentById.get(definition.id) ?? definition));
  });
  input.missions.forEach(mission => {
    if (definitionsById.has(mission.id)) return;
    if (!closedMissionIds.has(mission.id) && !expiredMissionIds.has(mission.id)) missions.push(structuredClone(mission));
  });

  const recurrenceByKey = new Map<string, MissionRecurrence>();
  const reportsWithDays = history.flatMap(entry => entry.reports.map(report => ({ day: entry.day, report })));
  const reportedDefinitions = new Set<string>();
  const observedOccurrences = new Set<string>();
  reportsWithDays.forEach(({ report }) => {
    const mission = report.context?.mission ?? definitionsById.get(report.missionId);
    if (!mission) return;
    const definitionId = missionDefinitionId(mission);
    reportedDefinitions.add(definitionId);
    observedOccurrences.add(`${definitionId}:${mission.occurrenceIndex ?? 1}`);
  });
  missions.forEach(mission => observedOccurrences.add(`${missionDefinitionId(mission)}:${mission.occurrenceIndex ?? 1}`));
  reportsWithDays.forEach(({ day, report }) => {
    if (report.invalidated) return;
    const mission = report.context?.mission ?? definitionsById.get(report.missionId);
    const repeat = mission?.repeat;
    if (!mission || !repeat?.enabled) return;
    const trigger = report.isExpired
      ? 'EXPIRED'
      : report.outcome ?? (report.isSuccess ? 'SUCCESS' : ((report.returnedAdventurerIds?.length ?? 0) === 0 ? 'PARTY_LOST' : 'OBJECTIVE_FAILED'));
    if (!repeat.repeatAfter.includes(trigger)) return;
    const occurrenceIndex = mission.occurrenceIndex ?? 1;
    const nextOccurrence = occurrenceIndex + 1;
    if (repeat.maxOccurrences !== null && nextOccurrence > repeat.maxOccurrences) return;
    const definitionId = missionDefinitionId(mission);
    const key = `${definitionId}:${nextOccurrence}`;
    if (observedOccurrences.has(key)) return;
    recurrenceByKey.set(key, { definitionId, occurrenceIndex: nextOccurrence, nextDay: day + Math.max(1, repeat.cooldownDays) });
  });
  (input.missionRecurrences ?? []).forEach(recurrence => {
    if (reportedDefinitions.has(recurrence.definitionId)) return;
    recurrenceByKey.set(`${recurrence.definitionId}:${recurrence.occurrenceIndex}`, recurrence);
  });

  return {
    history,
    adventurers,
    clans,
    missions,
    completedMissionIds: [...completedMissionIds],
    closedMissionIds: [...closedMissionIds],
    expiredMissionIds: [...expiredMissionIds],
    missionRecurrences: [...recurrenceByKey.values()]
  };
}

export function advanceMissionLifecycle(input: MissionLifecycleInput): MissionLifecycleResult {
  const allMissions = input.allMissions ?? [];
  const completedMissionIds = new Set(input.completedMissionIds);
  const closedMissionIds = new Set(input.closedMissionIds ?? input.completedMissionIds);
  const expiredMissionIds = new Set(input.expiredMissionIds ?? []);
  const reportsByMissionId = new Map<string, SimulationReport>();
  const unlockedMissionIds = new Set<string>();
  const missionRecurrences = structuredClone(input.missionRecurrences ?? []);

  input.contracts.forEach(contract => {
    if (!contract.simulationReport) return;
    reportsByMissionId.set(contract.missionId, contract.simulationReport);
    if (!contract.simulationReport.isExpired) closedMissionIds.add(contract.missionId);
    const reportMission = contract.simulationReport.context?.mission;
    const definitionId = reportMission ? missionDefinitionId(reportMission) : contract.missionId;
    if (reportCompletesObjective(contract.simulationReport)) {
      completedMissionIds.add(definitionId);
      contract.simulationReport.effects?.unlockedMissionIds.forEach(id => unlockedMissionIds.add(id));
    }
    if (reportMission) {
      const trigger = contract.simulationReport.outcome
        ?? (contract.simulationReport.isSuccess ? 'SUCCESS' : ((contract.simulationReport.returnedAdventurerIds?.length ?? 0) === 0 ? 'PARTY_LOST' : 'OBJECTIVE_FAILED'));
      scheduleRecurrence(missionRecurrences, reportMission, trigger, input.nextDay);
    }
  });

  const missions: Mission[] = [];
  input.missions.forEach(sourceMission => {
    const mission = structuredClone(sourceMission);
    if (mission.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT') {
      missions.push(mission);
      return;
    }

    const report = reportsByMissionId.get(mission.id);
    if (report?.isExpired) {
      expiredMissionIds.add(mission.id);
      return;
    }
    // Any attempted ordinary mission is terminal: both success and failure
    // remove the report and its contract from the active map.
    if (report) return;

    const aged = decrementMissionLifespan(mission);
    if (!isMissionExpired(aged)) missions.push(aged);
    else {
      expiredMissionIds.add(mission.id);
      scheduleRecurrence(missionRecurrences, mission, 'EXPIRED', input.nextDay);
    }
  });

  const activeIds = new Set(missions.map(mission => mission.id));
  const scenarioDriven = allMissions.length > 0;
  const candidates: Mission[] = [];
  allMissions.forEach(sourceMission => {
    if (
      activeIds.has(sourceMission.id)
      || completedMissionIds.has(sourceMission.id)
      || closedMissionIds.has(sourceMission.id)
      || expiredMissionIds.has(sourceMission.id)
    ) return;
    const scheduled = sourceMission.startDay === undefined || sourceMission.startDay <= input.nextDay;
    const explicitlyUnlocked = unlockedMissionIds.has(sourceMission.id);
    if (!scheduled && !explicitlyUnlocked) return;
    if (!prerequisitesSatisfied(sourceMission, completedMissionIds)) return;

    candidates.push({
      ...structuredClone(sourceMission),
      storyStatus: sourceMission.type === 'STORY' ? (sourceMission.storyStatus ?? 'AVAILABLE') : sourceMission.storyStatus
    });
  });

  const dueRecurrences = missionRecurrences.filter(item => item.nextDay <= input.nextDay);
  const recurrenceMissionKeys = new Map<string, string>();
  dueRecurrences.forEach(recurrence => {
    const definition = allMissions.find(mission => mission.id === recurrence.definitionId);
    if (!definition || !prerequisitesSatisfied(definition, completedMissionIds)) return;
    const occurrenceId = `${definition.id}__repeat_${recurrence.occurrenceIndex}`;
    candidates.push({
      ...structuredClone(definition),
      id: occurrenceId,
      definitionId: definition.id,
      occurrenceIndex: recurrence.occurrenceIndex,
      startDay: input.nextDay,
      lifespan: definition.maxLifespan,
      storyStatus: definition.type === 'STORY' ? 'AVAILABLE' : definition.storyStatus,
      intelRevealed: false,
      scoutedByClanIds: []
    });
    recurrenceMissionKeys.set(occurrenceId, `${recurrence.definitionId}:${recurrence.occurrenceIndex}`);
  });
  const quota = selectDailyQuota(candidates, allMissions, input.activeClanCount);
  quota.selected.forEach(mission => {
    missions.push(mission);
    activeIds.add(mission.id);
  });
  quota.skipped.forEach(mission => expiredMissionIds.add(mission.id));
  const consumedRecurrenceKeys = new Set(
    quota.selected
      .map(mission => recurrenceMissionKeys.get(mission.id))
      .filter((key): key is string => Boolean(key))
  );
  const remainingRecurrences = missionRecurrences.filter(item => !consumedRecurrenceKeys.has(`${item.definitionId}:${item.occurrenceIndex}`));

  const activeMissionIds = new Set(missions.map(mission => mission.id));
  const expiredContractIds = input.contracts
    .filter(contract => !contract.simulationReport && !activeMissionIds.has(contract.missionId))
    .map(contract => contract.missionId);
  const contracts = input.contracts
    .filter(contract => !contract.simulationReport && activeMissionIds.has(contract.missionId))
    .map(contract => ({ ...structuredClone(contract), simulationReport: undefined }));

  return {
    missions,
    contracts,
    completedMissionIds: Array.from(completedMissionIds),
    closedMissionIds: Array.from(closedMissionIds),
    expiredMissionIds: Array.from(expiredMissionIds),
    expiredContractIds,
    unlockedMissionIds: Array.from(unlockedMissionIds),
    scenarioDriven,
    missionRecurrences: remainingRecurrences
  };
}
