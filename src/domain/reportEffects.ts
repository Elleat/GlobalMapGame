import type {
  Adventurer,
  BasicResourceKey,
  Clan,
  Contract,
  Mission,
  ParticipantOutcome,
  RelationChange,
  ResourceLedger,
  SimulationEffectLedger,
  SimulationReport
} from '../types';
import { BASIC_RESOURCE_KEYS } from '../types';
import { calculateMaxHp } from '../utils';
import { addClanExperience, getClanExperienceReward } from './clanProgression';
import { applyRelationDelta, getMissionRelationDelta } from './relations';

const LEVEL_THRESHOLDS: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 10 };

export interface RecalculateReportInput {
  originalReport?: SimulationReport | null;
  editedReport: SimulationReport;
  contract: Contract;
  mission: Mission;
  adventurers: Adventurer[];
  clans: Clan[];
  day: number;
  /** Historical ledger used only to preserve healing or injuries that happened after this report. */
  participantStateReference?: SimulationReport | null;
}

export interface RecalculateReportResult {
  report: SimulationReport;
  adventurers: Adventurer[];
  clans: Clan[];
}

function isBasicResource(value: string): value is BasicResourceKey {
  return BASIC_RESOURCE_KEYS.includes(value as BasicResourceKey);
}

function promote(adventurer: Adventurer): Adventurer {
  let level = adventurer.level;
  while (level < 5 && adventurer.successfulMissions >= LEVEL_THRESHOLDS[level]) level += 1;
  if (level === adventurer.level) return adventurer;
  const maxHp = calculateMaxHp(level);
  return { ...adventurer, level, maxHp, hp: maxHp };
}

export function reverseSimulationReportEffects(
  adventurers: Adventurer[],
  clans: Clan[],
  originalReport?: SimulationReport | null
): { adventurers: Adventurer[]; clans: Clan[] } {
  const effects = originalReport?.effects;
  if (!effects) return { adventurers, clans };

  const outcomesById = new Map(effects.participantOutcomes.map(outcome => [outcome.adventurerId, outcome]));
  const relationChangesByAdventurer = new Map<string, RelationChange[]>();
  effects.relationChanges.forEach(change => {
    const list = relationChangesByAdventurer.get(change.adventurerId) ?? [];
    list.push(change);
    relationChangesByAdventurer.set(change.adventurerId, list);
  });

  const restoredAdventurers = adventurers.map(adventurer => {
    const outcome = outcomesById.get(adventurer.id);
    if (!outcome) return adventurer;
    const relations = { ...adventurer.relations };
    (relationChangesByAdventurer.get(adventurer.id) ?? []).forEach(change => {
      const delta = change.after - change.before;
      relations[change.clanId] = Math.max(0, Math.min(10, (relations[change.clanId] ?? 0) - delta));
    });
    const hp = adventurer.hp - (outcome.hpAfter - outcome.hpBefore);
    const maxHp = Math.max(1, adventurer.maxHp - (outcome.maxHpAfter - outcome.maxHpBefore));
    const effectCausedDeath = outcome.statusAfter === 'DEAD' && outcome.statusBefore !== 'DEAD';
    const keepLaterDeath = adventurer.status === 'DEAD' && !effectCausedDeath;
    const status = keepLaterDeath
      ? 'DEAD' as const
      : adventurer.status === outcome.statusAfter
        ? outcome.statusBefore
        : adventurer.status;
    return {
      ...adventurer,
      level: Math.max(1, adventurer.level - (outcome.levelAfter - outcome.levelBefore)),
      hp: keepLaterDeath ? 0 : Math.max(0, Math.min(maxHp, hp)),
      maxHp,
      status,
      woundedOnDay: adventurer.woundedOnDay === outcome.woundedOnDayAfter
        ? outcome.woundedOnDayBefore
        : adventurer.woundedOnDay,
      successfulMissions: Math.max(0, adventurer.successfulMissions - outcome.successfulMissionsDelta),
      totalMissions: Math.max(0, adventurer.totalMissions - outcome.totalMissionsDelta),
      relations
    };
  });

  const pendingAwardedItems = [...effects.awardedSpecialItems];
  const ownerClanId = originalReport?.rewardRecipientClanId ?? originalReport?.context?.clanId ?? null;
  const restoredClans = clans.map(clan => {
    const goldDelta = effects.clanGoldDeltas[clan.id] ?? 0;
    const experienceDelta = effects.clanExperienceDeltas?.[clan.id] ?? 0;
    const resources = { ...clan.resources };
    if (clan.id === ownerClanId) {
      effects.resourceLedger.returned.forEach(resource => {
        resources[resource] = Math.max(0, Number(resources[resource] || 0) - 1);
      });
    }
    if (pendingAwardedItems.length > 0) {
      const items = [...(resources.specialItems ?? [])];
      pendingAwardedItems.slice().forEach(awarded => {
        const index = items.indexOf(awarded);
        if (index >= 0) {
          items.splice(index, 1);
          pendingAwardedItems.splice(pendingAwardedItems.indexOf(awarded), 1);
        }
      });
      resources.specialItems = items;
    }
    return addClanExperience({ ...clan, gold: clan.gold - goldDelta, resources }, -experienceDelta);
  });

  return { adventurers: restoredAdventurers, clans: restoredClans };
}

function resolveUsedResources(contract: Contract, requested: readonly string[]): ResourceLedger {
  const remaining = [...contract.attachedResources];
  const used: BasicResourceKey[] = [];
  requested.filter(isBasicResource).forEach(resource => {
    const index = remaining.indexOf(resource);
    if (index < 0) return;
    remaining.splice(index, 1);
    used.push(resource);
  });
  return { attached: [...contract.attachedResources], used, returned: [], lost: [] };
}

export function recalculateReportEffects(input: RecalculateReportInput): RecalculateReportResult {
  const currentBeforeEditById = new Map(input.adventurers.map(adventurer => [adventurer.id, structuredClone(adventurer)]));
  const stateReference = input.participantStateReference ?? input.originalReport;
  const referenceOutcomes = new Map(
    (stateReference?.effects?.participantOutcomes ?? []).map(outcome => [outcome.adventurerId, outcome])
  );
  const restored = reverseSimulationReportEffects(
    structuredClone(input.adventurers),
    structuredClone(input.clans),
    input.originalReport
  );
  let adventurers = restored.adventurers;
  let clans = restored.clans;
  const squadIds = Array.from(new Set(input.editedReport.squadAdvIds ?? []));
  const squadIdSet = new Set(squadIds);
  const legacyOutcome = input.editedReport.isSuccess
    ? 'SUCCESS'
    : (input.editedReport.returnedAdventurerIds?.length ?? 0) === 0
      ? 'PARTY_LOST'
      : 'OBJECTIVE_FAILED';
  // New editors change `outcome` and `isSuccess` together. Older callers only
  // changed `isSuccess`, leaving the spread report's outcome untouched. Detect
  // that exact conflict so archived saves and integrations keep working.
  const legacySuccessWasEdited = Boolean(
    input.originalReport
    && input.editedReport.isSuccess !== input.originalReport.isSuccess
    && input.editedReport.outcome === input.originalReport.outcome
  );
  const outcome = legacySuccessWasEdited ? legacyOutcome : (input.editedReport.outcome ?? legacyOutcome);
  const returnedIds = (outcome === 'PARTY_LOST' ? [] : input.editedReport.returnedAdventurerIds === undefined
    ? squadIds
    : input.editedReport.returnedAdventurerIds
  ).filter(id => squadIdSet.has(id));
  const returnedIdSet = new Set(returnedIds);
  const isSuccess = outcome === 'SUCCESS';
  const baseObjectiveCompleted = legacySuccessWasEdited
    && input.originalReport
    && input.editedReport.baseObjectiveCompleted === input.originalReport.baseObjectiveCompleted
      ? isSuccess
      : (input.editedReport.baseObjectiveCompleted ?? isSuccess);
  const damage = Math.max(0, Math.trunc(input.editedReport.damageDealt || 0));
  const relationDelta = getMissionRelationDelta(input.mission, input.contract.attachedResources, isSuccess);
  const beforeById = new Map(
    adventurers.filter(adventurer => squadIdSet.has(adventurer.id)).map(adventurer => [adventurer.id, structuredClone(adventurer)])
  );
  const relationChanges: RelationChange[] = [];

  adventurers = adventurers.map(source => {
    if (!squadIdSet.has(source.id)) return source;
    let adventurer = { ...source, relations: { ...source.relations } };
    adventurer.hp -= damage;
    const grantsExperience = input.mission.type !== 'DUMMY';
    if (grantsExperience) adventurer.totalMissions += 1;
    if (grantsExperience && isSuccess) adventurer.successfulMissions += 1;

    if (input.contract.clanId && relationDelta !== 0) {
      const before = adventurer.relations[input.contract.clanId] ?? 0;
      adventurer = applyRelationDelta(adventurer, input.contract.clanId, relationDelta);
      relationChanges.push({
        adventurerId: adventurer.id,
        clanId: input.contract.clanId,
        before,
        after: adventurer.relations[input.contract.clanId],
        reason: relationDelta > 0 ? 'FULL_PREPARATION_SUCCESS' : 'NO_PREPARATION'
      });
    }
    adventurer = promote(adventurer);

    const returned = returnedIdSet.has(adventurer.id);
    if (!returned) {
      adventurer.hp = 0;
      adventurer.status = 'DEAD';
      adventurer.woundedOnDay = undefined;
    } else if (adventurer.hp < adventurer.maxHp) {
      adventurer.hp = Math.max(0, adventurer.hp);
      adventurer.status = 'WOUNDED';
      adventurer.woundedOnDay = input.day;
    } else {
      adventurer.status = 'READY';
      adventurer.woundedOnDay = undefined;
    }

    const currentBeforeEdit = currentBeforeEditById.get(adventurer.id);
    const referenceOutcome = referenceOutcomes.get(adventurer.id);
    const hasLaterParticipantState = Boolean(currentBeforeEdit && referenceOutcome && (
      currentBeforeEdit.totalMissions !== referenceOutcome.totalMissionsAfter
      || currentBeforeEdit.status !== referenceOutcome.statusAfter
      || currentBeforeEdit.woundedOnDay !== referenceOutcome.woundedOnDayAfter
    ));
    if (returned && hasLaterParticipantState && currentBeforeEdit && referenceOutcome) {
      if (currentBeforeEdit.status === 'DEAD' && referenceOutcome.statusAfter !== 'DEAD') {
        adventurer.hp = 0;
        adventurer.status = 'DEAD';
        adventurer.woundedOnDay = undefined;
      } else if (currentBeforeEdit.status !== 'DEAD') {
        const laterHealthLoss = Math.max(0, currentBeforeEdit.maxHp - currentBeforeEdit.hp);
        adventurer.hp = Math.max(0, adventurer.maxHp - laterHealthLoss);
        adventurer.status = currentBeforeEdit.status;
        adventurer.woundedOnDay = currentBeforeEdit.woundedOnDay;
      }
    }
    return adventurer;
  });

  const resourceLedger = resolveUsedResources(input.contract, input.editedReport.attachedResourcesUsed ?? []);
  if (squadIds.length === 0 || returnedIds.length > 0) {
    const usedRemaining = [...resourceLedger.used];
    resourceLedger.returned = resourceLedger.attached.filter(resource => {
      const index = usedRemaining.indexOf(resource);
      if (index < 0) return true;
      usedRemaining.splice(index, 1);
      return false;
    });
  } else {
    const usedRemaining = [...resourceLedger.used];
    resourceLedger.lost = resourceLedger.attached.filter(resource => {
      const index = usedRemaining.indexOf(resource);
      if (index < 0) return true;
      usedRemaining.splice(index, 1);
      return false;
    });
  }

  const goldReward = Math.max(0, input.editedReport.goldReward || 0);
  const rewardGranted = isSuccess && Boolean(input.editedReport.rewardGranted ?? true);
  const rewardWasExplicitlyRestored = Boolean(
    rewardGranted
    && input.originalReport
    && input.originalReport.rewardGranted === false
    && input.editedReport.rewardGranted === true
  );
  const rewardAwardedAmount = rewardGranted
    ? Math.max(0, rewardWasExplicitlyRestored ? goldReward : (input.editedReport.rewardAwardedAmount ?? goldReward))
    : 0;
  const awardedSpecialItems: string[] = [];
  const clanGoldDeltas: Record<string, number> = {};
  const clanExperienceDeltas: Record<string, number> = {};
  const clanExperienceReward = getClanExperienceReward(input.mission, baseObjectiveCompleted, isSuccess);
  clans = clans.map(clan => {
    if (clan.id !== input.contract.clanId) return clan;
    const resources = { ...clan.resources };
    resourceLedger.returned.forEach(resource => {
      resources[resource] = Number(resources[resource] || 0) + 1;
    });
    if (rewardGranted && (input.mission.rewardSpecialItems?.length ?? 0) > 0) {
      const specialItems = [...(resources.specialItems ?? [])];
      input.mission.rewardSpecialItems?.forEach(item => {
        if (!specialItems.includes(item)) {
          specialItems.push(item);
          awardedSpecialItems.push(item);
        }
      });
      resources.specialItems = specialItems;
    }
    clanGoldDeltas[clan.id] = rewardAwardedAmount;
    if (clan.id !== 'clan_guild' && clanExperienceReward > 0) clanExperienceDeltas[clan.id] = clanExperienceReward;
    return addClanExperience(
      { ...clan, gold: clan.gold + rewardAwardedAmount, resources },
      clanExperienceDeltas[clan.id] ?? 0
    );
  });

  const adventurersById = new Map(adventurers.map(adventurer => [adventurer.id, adventurer]));
  const participantOutcomes = squadIds
    .map((id): ParticipantOutcome | null => {
      const before = beforeById.get(id);
      const after = adventurersById.get(id);
      if (!before || !after) return null;
      const relationChange = relationChanges.find(change => change.adventurerId === id);
      return {
        adventurerId: id,
        name: after.name,
        levelBefore: before.level,
        levelAfter: after.level,
        hpBefore: before.hp,
        hpAfter: after.hp,
        maxHpBefore: before.maxHp,
        maxHpAfter: after.maxHp,
        statusBefore: before.status,
        statusAfter: after.status,
        woundedOnDayBefore: before.woundedOnDay,
        woundedOnDayAfter: after.woundedOnDay,
        successfulMissionsBefore: before.successfulMissions,
        successfulMissionsAfter: after.successfulMissions,
        totalMissionsBefore: before.totalMissions,
        totalMissionsAfter: after.totalMissions,
        survived: after.status !== 'DEAD',
        returned: returnedIdSet.has(id),
        relationDelta: relationChange ? relationChange.after - relationChange.before : 0,
        successfulMissionsDelta: input.mission.type !== 'DUMMY' && isSuccess ? 1 : 0,
        totalMissionsDelta: input.mission.type !== 'DUMMY' ? 1 : 0
      };
    })
    .filter(Boolean) as ParticipantOutcome[];

  const effects: SimulationEffectLedger = {
    participantOutcomes,
    relationChanges,
    resourceLedger,
    guildGoldDelta: input.contract.clanId === 'clan_guild' ? rewardAwardedAmount : 0,
    clanGoldDeltas,
    clanExperienceDeltas,
    awardedSpecialItems,
    unlockedMissionIds: outcome !== 'PARTY_LOST' && baseObjectiveCompleted
      ? [...(input.mission.unlocksMissionIds ?? [])]
      : []
  };
  const ownerName = clans.find(clan => clan.id === input.contract.clanId)?.name ?? input.editedReport.clanName;
  const report: SimulationReport = {
    ...structuredClone(input.editedReport),
    isSuccess,
    outcome,
    narrativeText: outcome === 'PARTY_LOST' ? 'Отряд не вернулся.' : input.editedReport.narrativeText,
    totalRoll: (input.editedReport.roll || 0) + (input.editedReport.partyBonus || 0),
    goldReward,
    rewardGranted,
    rewardAwardedAmount,
    rewardRecipientClanId: input.contract.clanId,
    damageDealt: damage,
    squadAdvIds: squadIds,
    squadNames: squadIds.map(id => adventurersById.get(id)?.name).filter((name): name is string => Boolean(name)),
    clanName: ownerName,
    attachedResourcesUsed: [...resourceLedger.used],
    returnedAdventurerIds: returnedIds,
    effects,
    wasManuallyResolved: true,
    baseObjectiveCompleted
  };

  return { report, adventurers, clans };
}
