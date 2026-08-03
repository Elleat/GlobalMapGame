import type { Adventurer, Clan, Contract, GameState, Mission, SimulationReport } from '../types';
import { GAME_STATE_VERSION } from '../types';
import {
  DEFAULT_CLANS,
  DEFAULT_SPAWN_POLYGON,
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

export const GAME_STORAGE_KEY = 'adventurer_guild_state';

function cloneClans(): Clan[] {
  return structuredClone(DEFAULT_CLANS);
}

function normalizeAdventurer(adventurer: Adventurer): Adventurer {
  const relations = Object.fromEntries(
    Object.entries(adventurer.relations ?? {}).map(([clanId, value]) => [clanId, clampRelation(value)])
  );
  return {
    ...adventurer,
    description: adventurer.description ?? '',
    relations
  };
}

export function normalizeMission(mission: Mission): Mission {
  return {
    ...mission,
    title: cleanMissionTitle(mission.title),
    lifespan: mission.lifespan ?? null,
    maxLifespan: mission.maxLifespan ?? null,
    scoutedByClanIds: mission.scoutedByClanIds ?? [],
    prerequisiteMissionIds: mission.prerequisiteMissionIds ?? [],
    prerequisiteMode: mission.prerequisiteMode ?? 'ALL'
  };
}

function normalizeReport(report: SimulationReport): SimulationReport {
  return {
    ...report,
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
  const clansCount = options?.clansCount ?? 6;
  const clans = cloneClans();
  const guild = clans.find(clan => clan.id === 'clan_guild');
  if (guild) guild.name = DEFAULT_GUILD_NAME;

  return {
    schemaVersion: GAME_STATE_VERSION,
    day: 1,
    nClans: clansCount,
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
    clans,
    adventurers: generateAdventurersForClans(clansCount).map(normalizeAdventurer),
    missions: generateMissionsForDay(clansCount, 1, DEFAULT_SPAWN_POLYGON).map(normalizeMission),
    contracts: [],
    history: [],
    completedMissionIds: [],
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
    if (typeof parsed.day !== 'number' || !Array.isArray(parsed.clans) || !Array.isArray(parsed.adventurers)) {
      return null;
    }

    const state = parsed as GameState;
    const guildName = state.guildName || DEFAULT_GUILD_NAME;
    return {
      ...state,
      guildName,
      guildShortName: state.guildShortName || DEFAULT_GUILD_SHORT_NAME,
      themeId: state.themeId || DEFAULT_THEME_ID,
      activeScenarioId: state.activeScenarioId ?? null,
      mapBgUrl: state.mapBgUrl || DEFAULT_MAP_URL,
      mapAssetId: state.mapAssetId ?? null,
      isGuildActionsCompleted: state.isGuildActionsCompleted ?? false,
      completedMissionIds: state.completedMissionIds ?? [],
      distributionReport: state.distributionReport ?? null,
      hqPos: state.hqPos ?? { x: 50, y: 50 },
      clans: state.clans.map(clan => clan.id === 'clan_guild' ? { ...clan, name: guildName } : clan),
      adventurers: state.adventurers.map(normalizeAdventurer),
      missions: state.missions.map(normalizeMission),
      allMissions: state.allMissions?.map(normalizeMission),
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
