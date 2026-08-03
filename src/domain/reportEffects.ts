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

function restoreOriginalEffects(
  adventurers: Adventurer[],
  clans: Clan[],
  contract: Contract,
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
      relations[change.clanId] = change.before;
    });
    return {
      ...adventurer,
      level: outcome.levelBefore,
      hp: outcome.hpBefore,
      maxHp: outcome.maxHpBefore,
      status: outcome.statusBefore,
      woundedOnDay: outcome.woundedOnDayBefore,
      successfulMissions: outcome.successfulMissionsBefore,
      totalMissions: outcome.totalMissionsBefore,
      relations
    };
  });

  const restoredClans = clans.map(clan => {
    const goldDelta = effects.clanGoldDeltas[clan.id] ?? 0;
    if (clan.id !== contract.clanId && goldDelta === 0) return clan;
    const resources = { ...clan.resources };
    if (clan.id === contract.clanId) {
      effects.resourceLedger.returned.forEach(resource => {
        resources[resource] = Math.max(0, Number(resources[resource] || 0) - 1);
      });
      if (effects.awardedSpecialItems.length > 0) {
        const awarded = new Set(effects.awardedSpecialItems);
        resources.specialItems = (resources.specialItems ?? []).filter(item => !awarded.has(item));
      }
    }
    return { ...clan, gold: Math.max(0, clan.gold - goldDelta), resources };
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
  const restored = restoreOriginalEffects(
    structuredClone(input.adventurers),
    structuredClone(input.clans),
    input.contract,
    input.originalReport
  );
  let adventurers = restored.adventurers;
  let clans = restored.clans;
  const squadIds = Array.from(new Set(input.editedReport.squadAdvIds ?? []));
  const squadIdSet = new Set(squadIds);
  const returnedIds = (input.editedReport.returnedAdventurerIds === undefined
    ? squadIds
    : input.editedReport.returnedAdventurerIds
  ).filter(id => squadIdSet.has(id));
  const returnedIdSet = new Set(returnedIds);
  const isSuccess = Boolean(input.editedReport.isSuccess);
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
    adventurer.totalMissions += 1;
    if (isSuccess) adventurer.successfulMissions += 1;

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
    if (!returned && adventurer.hp <= 0) {
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

  const goldReward = isSuccess ? Math.max(0, input.editedReport.goldReward || 0) : 0;
  const awardedSpecialItems: string[] = [];
  const clanGoldDeltas: Record<string, number> = {};
  clans = clans.map(clan => {
    if (clan.id !== input.contract.clanId) return clan;
    const resources = { ...clan.resources };
    resourceLedger.returned.forEach(resource => {
      resources[resource] = Number(resources[resource] || 0) + 1;
    });
    if (isSuccess && (input.mission.rewardSpecialItems?.length ?? 0) > 0) {
      const specialItems = [...(resources.specialItems ?? [])];
      input.mission.rewardSpecialItems?.forEach(item => {
        if (!specialItems.includes(item)) {
          specialItems.push(item);
          awardedSpecialItems.push(item);
        }
      });
      resources.specialItems = specialItems;
    }
    clanGoldDeltas[clan.id] = goldReward;
    return { ...clan, gold: clan.gold + goldReward, resources };
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
        successfulMissionsDelta: isSuccess ? 1 : 0,
        totalMissionsDelta: 1
      };
    })
    .filter(Boolean) as ParticipantOutcome[];

  const effects: SimulationEffectLedger = {
    participantOutcomes,
    relationChanges,
    resourceLedger,
    guildGoldDelta: input.contract.clanId === 'clan_guild' ? goldReward : 0,
    clanGoldDeltas,
    awardedSpecialItems,
    unlockedMissionIds: (input.editedReport.baseObjectiveCompleted ?? isSuccess)
      ? [...(input.mission.unlocksMissionIds ?? [])]
      : []
  };
  const ownerName = clans.find(clan => clan.id === input.contract.clanId)?.name ?? input.editedReport.clanName;
  const report: SimulationReport = {
    ...structuredClone(input.editedReport),
    isSuccess,
    totalRoll: (input.editedReport.roll || 0) + (input.editedReport.partyBonus || 0),
    goldReward,
    damageDealt: damage,
    squadAdvIds: squadIds,
    squadNames: squadIds.map(id => adventurersById.get(id)?.name).filter((name): name is string => Boolean(name)),
    clanName: ownerName,
    attachedResourcesUsed: [...resourceLedger.used],
    returnedAdventurerIds: returnedIds,
    effects,
    wasManuallyResolved: true,
    baseObjectiveCompleted: input.editedReport.baseObjectiveCompleted ?? isSuccess
  };

  return { report, adventurers, clans };
}
