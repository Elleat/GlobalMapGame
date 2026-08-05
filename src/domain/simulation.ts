import type {
  Adventurer,
  BasicResourceKey,
  CheckResolution,
  Clan,
  Contract,
  Mission,
  MissionResourceKey,
  PendingStoryComplication,
  ParticipantOutcome,
  RelationChange,
  ResourceLedger,
  RetreatResolution,
  SimulationEffectLedger,
  SimulationReport
} from '../types';
import { BASIC_RESOURCE_KEYS } from '../types';
import { calculateMaxHp, calculatePartyBonus, getResourceNameRu } from '../utils';
import {
  getComplicationSlotDc,
  getMissionComplicationSlots,
  getMissionGoldReward,
  getMissionChecks,
  getMissionComplicationSettings,
  hasFullPreparation
} from './missions';
import { applyRelationDelta, getMissionRelationDelta } from './relations';

const RETREAT_DC = 10;
const LEVEL_THRESHOLDS: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 10 };
const COMPLICATION_RESOURCES: MissionResourceKey[] = ['None', ...BASIC_RESOURCE_KEYS];

export interface ContractSimulationInput {
  contract: Contract;
  mission: Mission;
  adventurers: Adventurer[];
  clans: Clan[];
  day: number;
  hCost?: number;
  random?: () => number;
}

export interface ContractSimulationResult {
  adventurers: Adventurer[];
  clans: Clan[];
  contract: Contract;
  report: SimulationReport;
  logs: string[];
}

export interface DaySimulationInput {
  contracts: Contract[];
  missions: Mission[];
  adventurers: Adventurer[];
  clans: Clan[];
  day: number;
  hCost?: number;
  random?: () => number;
}

export interface DaySimulationResult {
  contracts: Contract[];
  missions: Mission[];
  adventurers: Adventurer[];
  clans: Clan[];
  reports: SimulationReport[];
  logs: string[];
  awaitingStoryMissionIds: string[];
}

function rollD20(random: () => number): number {
  return Math.floor(random() * 20) + 1;
}

function promoteAdventurer(adventurer: Adventurer): Adventurer {
  let level = adventurer.level;
  while (level < 5 && adventurer.successfulMissions >= LEVEL_THRESHOLDS[level]) level += 1;
  if (level === adventurer.level) return adventurer;
  const maxHp = calculateMaxHp(level);
  return { ...adventurer, level, maxHp, hp: maxHp };
}

function getRandomComplicationResource(random: () => number): MissionResourceKey {
  const index = Math.min(COMPLICATION_RESOURCES.length - 1, Math.floor(random() * COMPLICATION_RESOURCES.length));
  return COMPLICATION_RESOURCES[index];
}

function generatePendingStoryComplications(
  mission: Mission,
  random: () => number
): PendingStoryComplication[] {
  const complications: PendingStoryComplication[] = [];
  const settings = getMissionComplicationSettings(mission);
  if (!settings.enabled) return complications;
  for (const slot of getMissionComplicationSlots(mission)) {
    if (!slot.enabled || random() >= slot.chance) continue;
    complications.push({
      id: `${mission.id}-story-complication-${slot.position}-${complications.length}`,
      position: slot.position,
      reqResource: slot.resourceMode === 'RANDOM' ? getRandomComplicationResource(random) : slot.resource,
      dc: getComplicationSlotDc(mission, slot)
    });
    if (!settings.allowMultiple) break;
  }
  return complications;
}

function shouldRetreat(party: Adventurer[]): RetreatResolution['reason'] | null {
  if (party.some(member => member.hp <= 0)) return 'HERO_DOWN';
  const heavilyWounded = party.filter(member => member.hp <= member.maxHp / 2).length;
  return heavilyWounded >= Math.ceil(party.length / 2) ? 'HALF_PARTY_WOUNDED' : null;
}

function addReturnedResources(clans: Clan[], clanId: string | null, resources: BasicResourceKey[]): Clan[] {
  if (!clanId || resources.length === 0) return clans;
  return clans.map(clan => {
    if (clan.id !== clanId) return clan;
    const nextResources = { ...clan.resources };
    resources.forEach(resource => {
      nextResources[resource] = Number(nextResources[resource] || 0) + 1;
    });
    return { ...clan, resources: nextResources };
  });
}

function createEmptyRetreat(): RetreatResolution {
  return {
    wasTriggered: false,
    usedSupplies: false,
    roll: null,
    bonus: 0,
    total: null,
    isSuccess: true,
    extraDamage: 0,
    deadAdventurerIds: [],
    returnedAdventurerIds: []
  };
}

function createResourceLedger(attached: BasicResourceKey[]): ResourceLedger {
  return { attached: [...attached], used: [], returned: [], lost: [] };
}

function createNoSquadReport(
  contract: Contract,
  mission: Mission,
  clanName: string,
  resourceLedger: ResourceLedger
): SimulationReport {
  const effects: SimulationEffectLedger = {
    participantOutcomes: [],
    relationChanges: [],
    resourceLedger,
    guildGoldDelta: 0,
    clanGoldDeltas: {},
    awardedSpecialItems: [],
    unlockedMissionIds: []
  };
  return {
    isSuccess: false,
    isResourceAutoSuccess: false,
    autoSuccessReason: null,
    roll: 0,
    partyBonus: 0,
    totalRoll: 0,
    dc: mission.dc,
    narrativeText: 'Провал: отряд не собран. Ресурсы не покидали склад и возвращены заказчику.',
    damageDealt: 0,
    goldReward: 0,
    attachedResourcesUsed: [],
    squadNames: [],
    squadAdvIds: [],
    clanName,
    missionTitle: contract.title,
    missionRegion: mission.region,
    missionId: mission.id,
    checkResults: [],
    resolutions: [],
    retreat: createEmptyRetreat(),
    effects,
    baseObjectiveCompleted: false,
    returnedAdventurerIds: [],
    failedChecksCount: 0,
    context: {
      clanId: contract.clanId,
      attachedResources: [...contract.attachedResources],
      contractLevel: contract.contractLevel,
      maxPartySize: contract.maxPartySize,
      mission: structuredClone(mission)
    }
  };
}

export function simulateContract(input: ContractSimulationInput): ContractSimulationResult {
  const random = input.random ?? Math.random;
  let adventurers = structuredClone(input.adventurers);
  let clans = structuredClone(input.clans);
  const contract = structuredClone(input.contract);
  const mission = structuredClone(input.mission);
  const logs: string[] = [];
  const clan = clans.find(item => item.id === contract.clanId);
  const clanName = clan?.name ?? 'Неизвестный заказчик';
  const party = contract.partyAdvIds
    .map(id => adventurers.find(adventurer => adventurer.id === id))
    .filter((adventurer): adventurer is Adventurer => Boolean(adventurer));
  const beforeById = new Map(party.map(member => [member.id, structuredClone(member)]));
  const resourceLedger = createResourceLedger(contract.attachedResources ?? []);

  if (party.length === 0) {
    resourceLedger.returned = [...resourceLedger.attached];
    clans = addReturnedResources(clans, contract.clanId, resourceLedger.returned);
    const report = createNoSquadReport(contract, mission, clanName, resourceLedger);
    logs.push(`«${contract.title}» не начато: отряд не собран, выданные ресурсы возвращены.`);
    return { adventurers, clans, contract: { ...contract, simulationReport: report }, report, logs };
  }

  const carriedResources = contract.attachedResources.slice(0, party.length);
  const notCarriedResources = contract.attachedResources.slice(party.length);
  const availableResources = [...carriedResources];
  const partyBonus = calculatePartyBonus(party);
  const checks = mission.type === 'DUMMY' ? [] : getMissionChecks(mission);
  const complicationSettings = getMissionComplicationSettings(mission);
  const complicationSlots = getMissionComplicationSlots(mission);
  const resolutions: CheckResolution[] = [];
  const checkResults: string[] = [];
  const regularStageSuccesses: boolean[] = [];
  const complicationSuccesses: boolean[] = [];
  let failedChecksCount = 0;
  let retreat = createEmptyRetreat();
  let simulationStopped = false;
  let complicationOccurred = false;

  const useResource = (required: MissionResourceKey): BasicResourceKey | undefined => {
    if (required === 'None') return undefined;
    const index = availableResources.indexOf(required);
    if (index < 0) return undefined;
    const [used] = availableResources.splice(index, 1);
    resourceLedger.used.push(used);
    return used;
  };

  const performRetreat = (reason: NonNullable<RetreatResolution['reason']>) => {
    const suppliesIndex = availableResources.indexOf('Supplies');
    let usedSupplies = false;
    let retreatRoll: number | null = null;
    let bonus = 0;
    let total: number | null = null;
    let isSuccess = false;

    if (suppliesIndex >= 0) {
      availableResources.splice(suppliesIndex, 1);
      resourceLedger.used.push('Supplies');
      usedSupplies = true;
      isSuccess = true;
    } else {
      const capableMembers = party.filter(member => member.hp > 0);
      bonus = calculatePartyBonus(capableMembers);
      retreatRoll = rollD20(random);
      total = retreatRoll + bonus;
      isSuccess = total >= RETREAT_DC;
    }

    if (!isSuccess) party.forEach(member => { member.hp -= 1; });
    const deadAdventurerIds = isSuccess ? [] : party.filter(member => member.hp <= 0).map(member => member.id);
    const returnedAdventurerIds = isSuccess
      ? party.map(member => member.id)
      : party.filter(member => member.hp > 0).map(member => member.id);

    retreat = {
      wasTriggered: true,
      reason,
      usedSupplies,
      roll: retreatRoll,
      bonus,
      total,
      isSuccess,
      extraDamage: isSuccess ? 0 : 1,
      deadAdventurerIds,
      returnedAdventurerIds
    };
    simulationStopped = true;
    logs.push(isSuccess
      ? `Отряд «${contract.title}» успешно отступил${usedSupplies ? ' благодаря оставшимся припасам' : ''}.`
      : returnedAdventurerIds.length > 0
        ? `Отступление «${contract.title}» провалено: каждый участник получил ещё 1 урон; выжившие смогли уйти.`
        : `Отступление «${contract.title}» провалено: каждый участник получил ещё 1 урон; никто не вернулся.`
    );
  };

  const resolveCheck = (
    kind: CheckResolution['kind'],
    position: number,
    required: MissionResourceKey,
    dc: number,
    label: string
  ): boolean => {
    const usedResource = useResource(required);
    const roll = usedResource ? null : rollD20(random);
    const total = roll === null ? null : roll + partyBonus;
    const isSuccess = Boolean(usedResource) || (total !== null && total >= dc);
    const damage = isSuccess ? 0 : 1;
    if (!isSuccess) {
      failedChecksCount += 1;
      party.forEach(member => { member.hp -= 1; });
    }
    resolutions.push({
      id: `${contract.missionId}-${kind.toLowerCase()}-${position}-${resolutions.length}`,
      kind,
      position,
      reqResource: required,
      dc,
      roll,
      partyBonus,
      total,
      usedResource,
      isSuccess,
      damage
    });
    const resourceText = required === 'None' ? 'без ключевого ресурса' : `ресурс: ${getResourceNameRu(required)}`;
    checkResults.push(usedResource
      ? `${label}: автоуспех — потрачен «${getResourceNameRu(usedResource)}».`
      : `${label}: d20(${roll}) + ${partyBonus} = ${total} против DC ${dc} (${resourceText}) — ${isSuccess ? 'успех' : 'провал, 1 урон каждому'}.`
    );
    if (!isSuccess) {
      const retreatReason = shouldRetreat(party);
      if (retreatReason) performRetreat(retreatReason);
    }
    return isSuccess;
  };

  const maybeRunComplications = (position: number) => {
    if (!complicationSettings.enabled) return;
    for (const slot of complicationSlots.filter(item => item.position === position)) {
      if (simulationStopped || !slot.enabled) return;
      if (complicationOccurred && !complicationSettings.allowMultiple) return;
      if (random() >= slot.chance) continue;
      complicationOccurred = true;
      const required = slot.resourceMode === 'RANDOM' ? getRandomComplicationResource(random) : slot.resource;
      const success = resolveCheck('COMPLICATION', position, required, getComplicationSlotDc(mission, slot), `Осложнение в позиции ${position}`);
      complicationSuccesses.push(success);
      const returnPosition = mission.type === 'DUMMY' ? 1 : checks.length;
      if (!success && position >= returnPosition && !retreat.wasTriggered) {
        performRetreat('RETURN_COMPLICATION');
      }
    }
  };

  maybeRunComplications(0);
  if (mission.type === 'DUMMY') {
    if (!simulationStopped) maybeRunComplications(1);
  } else {
    checks.forEach((check, index) => {
      if (simulationStopped) return;
      const success = resolveCheck(
        'STAGE',
        index + 1,
        check.reqResource ?? 'None',
        check.dc,
        check.label ?? `Этап ${index + 1}`
      );
      regularStageSuccesses.push(success);
      if (!simulationStopped) maybeRunComplications(index + 1);
    });
  }

  const baseObjectiveCompleted = mission.type === 'DUMMY'
    ? true
    : regularStageSuccesses.length === checks.length && regularStageSuccesses.every(Boolean);
  const allComplicationsPassed = complicationSuccesses.every(Boolean);
  const returnedAdventurerIds = retreat.wasTriggered
    ? retreat.returnedAdventurerIds
    : party.map(member => member.id);
  const isSuccess = baseObjectiveCompleted
    && allComplicationsPassed
    && returnedAdventurerIds.length === party.length
    && !simulationStopped;
  const outcome = isSuccess ? 'SUCCESS' : returnedAdventurerIds.length === 0 ? 'PARTY_LOST' : 'OBJECTIVE_FAILED';

  const relationDelta = getMissionRelationDelta(mission, contract.attachedResources, isSuccess);
  const relationChanges: RelationChange[] = [];
  const returnedSet = new Set(returnedAdventurerIds);

  party.forEach(member => {
    if (mission.type !== 'DUMMY') member.totalMissions += 1;
    if (mission.type !== 'DUMMY' && isSuccess) member.successfulMissions += 1;
    if (contract.clanId && relationDelta !== 0) {
      const before = member.relations?.[contract.clanId] ?? 0;
      const updated = applyRelationDelta(member, contract.clanId, relationDelta);
      member.relations = updated.relations;
      relationChanges.push({
        adventurerId: member.id,
        clanId: contract.clanId,
        before,
        after: member.relations[contract.clanId],
        reason: relationDelta > 0 ? 'FULL_PREPARATION_SUCCESS' : 'NO_PREPARATION'
      });
    }

    const promoted = promoteAdventurer(member);
    Object.assign(member, promoted);
    const returned = returnedSet.has(member.id);
    if (!returned) {
      member.hp = 0;
      member.status = 'DEAD';
      member.woundedOnDay = undefined;
    } else if (member.hp < member.maxHp) {
      member.hp = Math.max(0, member.hp);
      member.status = 'WOUNDED';
      member.woundedOnDay = input.day;
    } else {
      member.status = 'READY';
      member.woundedOnDay = undefined;
    }
  });

  const allPartyDied = returnedAdventurerIds.length === 0;
  if (allPartyDied) resourceLedger.lost = [...availableResources, ...notCarriedResources];
  else resourceLedger.returned = [...availableResources, ...notCarriedResources];
  clans = addReturnedResources(clans, contract.clanId, resourceLedger.returned);

  const goldReward = getMissionGoldReward(mission, input.hCost ?? 10);
  const awardedSpecialItems: string[] = [];
  const clanGoldDeltas: Record<string, number> = {};
  if (isSuccess && contract.clanId) {
    clans = clans.map(item => {
      if (item.id !== contract.clanId) return item;
      const specialItems = [...(item.resources.specialItems ?? [])];
      (mission.rewardSpecialItems ?? []).forEach(reward => {
        if (!specialItems.includes(reward)) {
          specialItems.push(reward);
          awardedSpecialItems.push(reward);
        }
      });
      return {
        ...item,
        gold: item.gold + goldReward,
        resources: { ...item.resources, specialItems }
      };
    });
    clanGoldDeltas[contract.clanId] = goldReward;
  }

  const participantOutcomes: ParticipantOutcome[] = party.map(member => {
    const before = beforeById.get(member.id)!;
    const relationChange = relationChanges.find(change => change.adventurerId === member.id);
    return {
      adventurerId: member.id,
      name: member.name,
      levelBefore: before.level,
      levelAfter: member.level,
      hpBefore: before.hp,
      hpAfter: member.hp,
      maxHpBefore: before.maxHp,
      maxHpAfter: member.maxHp,
      statusBefore: before.status,
      statusAfter: member.status,
      woundedOnDayBefore: before.woundedOnDay,
      woundedOnDayAfter: member.woundedOnDay,
      successfulMissionsBefore: before.successfulMissions,
      successfulMissionsAfter: member.successfulMissions,
      totalMissionsBefore: before.totalMissions,
      totalMissionsAfter: member.totalMissions,
      survived: member.status !== 'DEAD',
      returned: returnedSet.has(member.id),
      relationDelta: relationChange ? relationChange.after - relationChange.before : 0,
      successfulMissionsDelta: mission.type !== 'DUMMY' && isSuccess ? 1 : 0,
      totalMissionsDelta: mission.type !== 'DUMMY' ? 1 : 0
    };
  });

  const effects: SimulationEffectLedger = {
    participantOutcomes,
    relationChanges,
    resourceLedger,
    guildGoldDelta: contract.clanId === 'clan_guild' ? goldReward : 0,
    clanGoldDeltas,
    awardedSpecialItems,
    unlockedMissionIds: baseObjectiveCompleted && outcome !== 'PARTY_LOST' ? [...(mission.unlocksMissionIds ?? [])] : []
  };
  const rolledResolution = resolutions.find(resolution => resolution.roll !== null);
  const allChecksUsedResources = resolutions.length > 0 && resolutions.every(resolution => resolution.isSuccess && Boolean(resolution.usedResource));
  const returnPosition = mission.type === 'DUMMY' ? 1 : checks.length;
  const returnComplicationFailed = complicationSuccesses.length > 0
    && resolutions.some(resolution => resolution.kind === 'COMPLICATION' && resolution.position === returnPosition && !resolution.isSuccess)
    && baseObjectiveCompleted;
  const narrativeText = outcome === 'SUCCESS'
    ? (mission.successText || (mission.type === 'DUMMY' ? 'Донесение оказалось пустышкой; отряд вернулся.' : 'Задание успешно выполнено.'))
    : outcome === 'PARTY_LOST'
      ? 'Отряд не вернулся.'
      : returnComplicationFailed && returnedAdventurerIds.length < party.length
      ? 'Основная задача выполнена, но отряд не смог вернуться из-за осложнения.'
      : (mission.failText || 'Экспедиция потерпела неудачу.');

  const report: SimulationReport = {
    isSuccess,
    outcome,
    isResourceAutoSuccess: allChecksUsedResources || (mission.type === 'DUMMY' && resolutions.length === 0),
    autoSuccessReason: allChecksUsedResources
      ? 'Все возникшие проверки закрыты подготовленными ресурсами.'
      : mission.type === 'DUMMY' && resolutions.length === 0
        ? 'Пустышка не требовала основной проверки.'
        : null,
    roll: rolledResolution?.roll ?? 0,
    partyBonus,
    totalRoll: rolledResolution?.total ?? partyBonus,
    dc: rolledResolution?.dc ?? mission.dc,
    narrativeText,
    damageDealt: failedChecksCount + retreat.extraDamage,
    goldReward,
    rewardGranted: isSuccess,
    rewardAwardedAmount: isSuccess ? goldReward : 0,
    rewardRecipientClanId: contract.clanId,
    attachedResourcesUsed: [...resourceLedger.used],
    squadNames: party.map(member => member.name),
    squadAdvIds: party.map(member => member.id),
    clanName,
    missionTitle: contract.title,
    missionRegion: mission.region,
    missionId: mission.id,
    checkResults,
    resolutions,
    retreat,
    effects,
    baseObjectiveCompleted,
    returnedAdventurerIds,
    failedChecksCount,
    context: {
      clanId: contract.clanId,
      attachedResources: [...contract.attachedResources],
      contractLevel: contract.contractLevel,
      maxPartySize: contract.maxPartySize,
      mission: structuredClone(mission)
    }
  };

  logs.push(`«${contract.title}»: ${isSuccess ? 'успех' : 'провал'}, провалено проверок ${failedChecksCount}, вернулось ${returnedAdventurerIds.length}/${party.length}.`);
  return {
    adventurers,
    clans,
    contract: { ...contract, simulationReport: report },
    report,
    logs
  };
}

export function simulateDayContracts(input: DaySimulationInput): DaySimulationResult {
  const random = input.random ?? Math.random;
  let adventurers = structuredClone(input.adventurers);
  let clans = structuredClone(input.clans);
  let missions = structuredClone(input.missions);
  const contracts: Contract[] = [];
  const reports: SimulationReport[] = [];
  const logs: string[] = [];
  const awaitingStoryMissionIds: string[] = [];

  input.contracts.forEach(sourceContract => {
    const contract = structuredClone(sourceContract);
    if (!contract.confirmed) {
      contracts.push(contract);
      return;
    }
    const mission = missions.find(item => item.id === contract.missionId);
    if (!mission) {
      contracts.push(contract);
      return;
    }

    if (mission.type === 'STORY') {
      if (contract.simulationReport) {
        contracts.push(contract);
        reports.push(contract.simulationReport);
        missions = missions.map(item => item.id === mission.id ? { ...item, storyStatus: 'RESOLVED' } : item);
        logs.push(`Сюжетная миссия «${mission.title}» завершена по ручному рапорту ГМа.`);
        return;
      }
      const suggestedSquadAdvIds = contract.suggestedSquadAdvIds?.length
        ? [...contract.suggestedSquadAdvIds]
        : [...contract.partyAdvIds];
      const pendingStoryComplications = contract.pendingStoryComplications
        ? structuredClone(contract.pendingStoryComplications)
        : generatePendingStoryComplications(mission, random);
      contracts.push({
        ...contract,
        suggestedSquadAdvIds,
        actualSquadAdvIds: [],
        partyAdvIds: [],
        pendingStoryComplications,
        simulationReport: undefined
      });
      missions = missions.map(item => item.id === mission.id ? {
        ...item,
        storyStatus: 'AWAITING_REPORT',
        storyAcceptedDay: item.storyAcceptedDay ?? input.day,
        storyClanId: contract.clanId,
        suggestedSquadAdvIds
      } : item);
      awaitingStoryMissionIds.push(mission.id);
      logs.push(`Сюжетная миссия «${mission.title}» закреплена за заказчиком и ожидает ручного рапорта ГМа. Предложенные NPC возвращены в резерв. Осложнений подготовлено: ${pendingStoryComplications.length}.`);
      return;
    }

    // An empty contract was never attempted. It remains active (and its
    // payment/resources remain in escrow) until it receives a party, is
    // cancelled, or expires together with the report.
    if (contract.partyAdvIds.length === 0) {
      contracts.push(contract);
      logs.push(`«${contract.title}» не начато: ни один авантюрист не нанялся.`);
      return;
    }

    const result = simulateContract({
      contract,
      mission,
      adventurers,
      clans,
      day: input.day,
      hCost: input.hCost,
      random
    });
    adventurers = result.adventurers;
    clans = result.clans;
    contracts.push(result.contract);
    reports.push(result.report);
    logs.push(...result.logs);
  });

  return { contracts, missions, adventurers, clans, reports, logs, awaitingStoryMissionIds };
}

export function wasMissionFullyPrepared(mission: Mission, contract: Contract): boolean {
  return hasFullPreparation(mission, contract.attachedResources);
}
