import type { Adventurer, Clan, Contract, GameState, Mission, SimulationReport } from '../types';
import { GAME_STATE_VERSION } from '../types';
import {
  DEFAULT_CLANS,
  DEFAULT_SPAWN_POLYGON,
  ensureAdventurerRosterForClans,
  generateAdventurersForClans,
  generateMissionsForDay
} from '../utils';
import {
  DEFAULT_GUILD_NAME,
  DEFAULT_GUILD_SHORT_NAME,
  DEFAULT_MAP_URL,
  DEFAULT_THEME_ID
} from './constants';
import { clampRelation } from './economy';
import { cleanMissionTitle } from './missionPresentation';
import { normalizeMapRegion } from './mapRegions';
import { applyLegacyActiveClanCount, clampActiveClanCount, getActivePlayerClans, orderClansGuildFirst } from './clans';
import { applyNpcRosterCapacity, DEFAULT_NPC_ROSTER_CLAN_CAPACITY } from './adventurers';
import { normalizeClanProgression } from './clanProgression';

export const GAME_STORAGE_KEY = 'adventurer_guild_state';

function cloneClans(): Clan[] {
  return orderClansGuildFirst(structuredClone(DEFAULT_CLANS).map(normalizeClanProgression));
}

function normalizeAdventurer(adventurer: Adventurer): Adventurer {
  const relations = Object.fromEntries(
    Object.entries(adventurer.relations ?? {}).map(([clanId, value]) => [clanId, clampRelation(value)])
  );
  return {
    ...adventurer,
    description: adventurer.description ?? '',
    isArchived: Boolean(adventurer.isArchived),
    rosterCohort: adventurer.rosterCohort === undefined ? undefined : Math.max(1, Math.floor(adventurer.rosterCohort)),
    isRosterReserve: Boolean(adventurer.isRosterReserve),
    relations
  };
}

export function normalizeMission(mission: Mission): Mission {
  let checks = mission.type === 'DUMMY' ? [] : mission.checks?.map(check => ({ ...check }));
  if (mission.requiredSpecialItem?.trim() && mission.type !== 'DUMMY') {
    if (!checks?.length) {
      checks = [{
        reqResource: mission.reqResource,
        dc: mission.dc,
        requiredSpecialItem: mission.requiredSpecialItem.trim()
      }];
    } else if (!checks[0].requiredSpecialItem?.trim()) {
      checks[0].requiredSpecialItem = mission.requiredSpecialItem.trim();
    }
  }
  return {
    ...mission,
    checks,
    requiredSpecialItem: undefined,
    title: cleanMissionTitle(mission.title),
    lifespan: mission.lifespan ?? null,
    maxLifespan: mission.maxLifespan ?? null,
    scoutedByClanIds: mission.scoutedByClanIds ?? [],
    prerequisiteMissionIds: mission.prerequisiteMissionIds ?? [],
    prerequisiteMode: mission.prerequisiteMode ?? 'ALL',
    chainIds: mission.chainIds ?? [],
    regionMode: mission.regionMode ?? (mission.regionId ? 'AUTO' : 'MANUAL'),
    repeat: mission.repeat ? {
      enabled: Boolean(mission.repeat.enabled),
      cooldownDays: Math.max(1, mission.repeat.cooldownDays || 1),
      maxOccurrences: mission.repeat.maxOccurrences === null ? null : Math.max(1, mission.repeat.maxOccurrences || 1),
      repeatAfter: mission.repeat.repeatAfter?.length ? [...mission.repeat.repeatAfter] : ['OBJECTIVE_FAILED']
    } : undefined
  };
}

function normalizeReport(report: SimulationReport): SimulationReport {
  return {
    ...report,
    outcome: report.outcome ?? (report.isSuccess ? 'SUCCESS' : (report.returnedAdventurerIds?.length === 0 ? 'PARTY_LOST' : 'OBJECTIVE_FAILED')),
    rewardAwardedAmount: report.rewardAwardedAmount ?? (report.rewardGranted ? report.goldReward : 0),
    rewardSpecialItemsGranted: report.rewardSpecialItemsGranted ?? Boolean(report.rewardGranted),
    missionTitle: cleanMissionTitle(report.missionTitle),
    context: report.context
      ? { ...report.context, mission: normalizeMission(report.context.mission) }
      : report.context
  };
}

function normalizeContract(contract: Contract): Contract {
  return {
    ...contract,
    title: cleanMissionTitle(contract.title),
    simulationReport: contract.simulationReport ? normalizeReport(contract.simulationReport) : undefined
  };
}

export function createInitialGameState(options?: {
  isDmMode?: boolean;
  clansCount?: number;
}): GameState {
  let clans = cloneClans();
  const clansCount = clampActiveClanCount(clans, options?.clansCount ?? 6);
  clans = applyLegacyActiveClanCount(clans, clansCount);
  const guild = clans.find(clan => clan.id === 'clan_guild');
  if (guild) guild.name = DEFAULT_GUILD_NAME;

  return {
    schemaVersion: GAME_STATE_VERSION,
    day: 1,
    nClans: clansCount,
    pendingClanActivity: {},
    hCost: 10,
    guildName: DEFAULT_GUILD_NAME,
    guildShortName: DEFAULT_GUILD_SHORT_NAME,
    themeId: DEFAULT_THEME_ID,
    activeScenarioId: null,
    isDmMode: options?.isDmMode ?? false,
    mapBgUrl: DEFAULT_MAP_URL,
    mapAssetId: null,
    mapWidth: 910,
    mapHeight: 1303,
    currentPhase: 1,
    isDaySimulated: false,
    isGuildActionsCompleted: false,
    assignedClanFilter: 'ALL',
    spawnPolygon: structuredClone(DEFAULT_SPAWN_POLYGON),
    mapRegions: [],
    mapEffectsEnabled: true,
    clans,
    adventurers: applyNpcRosterCapacity(
      generateAdventurersForClans(Math.max(DEFAULT_NPC_ROSTER_CLAN_CAPACITY, clansCount)),
      clansCount
    ).map(normalizeAdventurer),
    missions: generateMissionsForDay(clansCount, 1, DEFAULT_SPAWN_POLYGON).map(normalizeMission),
    scenarioChains: [],
    missionRecurrences: [],
    contracts: [],
    history: [],
    completedMissionIds: [],
    closedMissionIds: [],
    expiredMissionIds: [],
    selectedMissionId: null,
    lastDistributionLogs: [],
    distributionReport: null,
    hqPos: { x: 50, y: 50 }
  };
}

/**
 * Old prototype saves are intentionally not migrated. A state is accepted
 * only when it already uses the current schema.
 */
export function parseStoredGameState(serialized: string): GameState | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<GameState>;
    if (parsed.schemaVersion !== GAME_STATE_VERSION) return null;
    if (
      typeof parsed.day !== 'number'
      || !Number.isInteger(parsed.day)
      || parsed.day < 1
      || typeof parsed.nClans !== 'number'
      || typeof parsed.hCost !== 'number'
      || typeof parsed.guildName !== 'string'
      || typeof parsed.isDmMode !== 'boolean'
      || !Array.isArray(parsed.clans)
      || !Array.isArray(parsed.adventurers)
      || !Array.isArray(parsed.missions)
      || !Array.isArray(parsed.contracts)
      || !Array.isArray(parsed.history)
    ) {
      return null;
    }

    const state = parsed as GameState;
    const guildName = state.guildName || DEFAULT_GUILD_NAME;
    let clans = orderClansGuildFirst(state.clans
      .map(normalizeClanProgression)
      .map(clan => clan.id === 'clan_guild' ? { ...clan, name: guildName } : clan));
    if (!clans.some(clan => clan.id !== 'clan_guild' && clan.isActive !== undefined)) clans = applyLegacyActiveClanCount(clans, state.nClans);
    const activeCount = getActivePlayerClans(clans, state.nClans).length;
    return {
      ...state,
      nClans: activeCount,
      pendingClanActivity: state.pendingClanActivity ?? {},
      guildName,
      guildShortName: state.guildShortName || DEFAULT_GUILD_SHORT_NAME,
      themeId: state.themeId || DEFAULT_THEME_ID,
      activeScenarioId: state.activeScenarioId ?? null,
      mapBgUrl: state.mapBgUrl || DEFAULT_MAP_URL,
      mapAssetId: state.mapAssetId ?? null,
      isGuildActionsCompleted: state.isGuildActionsCompleted ?? false,
      completedMissionIds: state.completedMissionIds ?? [],
      closedMissionIds: state.closedMissionIds ?? state.completedMissionIds ?? [],
      expiredMissionIds: state.expiredMissionIds ?? [],
      distributionReport: state.distributionReport ?? null,
      hqPos: state.hqPos ?? { x: 50, y: 50 },
      mapRegions: (state.mapRegions ?? []).map(normalizeMapRegion),
      mapEffectsEnabled: state.mapEffectsEnabled ?? true,
      clans,
      adventurers: ensureAdventurerRosterForClans(state.adventurers.map(normalizeAdventurer), activeCount),
      missions: state.missions.map(normalizeMission),
      allMissions: state.allMissions?.map(normalizeMission),
      scenarioChains: state.scenarioChains ?? [],
      missionRecurrences: state.missionRecurrences ?? [],
      contracts: state.contracts.map(normalizeContract),
      history: state.history.map(entry => ({
        ...entry,
        reports: entry.reports.map(normalizeReport)
      }))
    };
  } catch {
    return null;
  }
}

export function loadStoredGameState(storage: Pick<Storage, 'getItem'>): GameState | null {
  const serialized = storage.getItem(GAME_STORAGE_KEY);
  return serialized ? parseStoredGameState(serialized) : null;
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}
