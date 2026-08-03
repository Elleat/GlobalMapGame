import type {
  Adventurer,
  AdventurerStatus,
  Clan,
  GameState,
  MapRegion,
  Mission,
  MissionResourceKey,
  MissionType
} from '../types';
import { DEFAULT_MAP_URL } from './constants';
import { createInitialGameState, normalizeMission } from './state';
import { normalizeMapRegion } from './mapRegions';

export const DATA_FILE_VERSION = 1;
export const ADVENTURER_FILE_TYPE = 'global-map-adventurers';
export const EVENT_FILE_TYPE = 'global-map-events';
export const SCENARIO_FILE_TYPE = 'global-map-scenario';

export interface AdventurerDataFile {
  type: typeof ADVENTURER_FILE_TYPE;
  version: typeof DATA_FILE_VERSION;
  name: string;
  adventurers: Adventurer[];
}

export interface EventDataFile {
  type: typeof EVENT_FILE_TYPE;
  version: typeof DATA_FILE_VERSION;
  name: string;
  events: Mission[];
}

export interface ScenarioFileData {
  id: string;
  name: string;
  description: string;
  guildName: string;
  guildShortName: string;
  hCost: number;
  nClans: number;
  themeId: string;
  mapWidth: number;
  mapHeight: number;
  spawnPolygon: GameState['spawnPolygon'];
  mapRegions: MapRegion[];
  mapEffectsEnabled: boolean;
  hqPos?: GameState['hqPos'];
  clans: Clan[];
  adventurers: Adventurer[];
  events: Mission[];
}

export interface ScenarioDataFile {
  type: typeof SCENARIO_FILE_TYPE;
  version: typeof DATA_FILE_VERSION;
  scenario: ScenarioFileData;
}

export class DataFileValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('\n'));
    this.name = 'DataFileValidationError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addStringIssue(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'string' || value.trim().length === 0) issues.push(`${path}: требуется непустая строка.`);
}

function addFiniteIssue(value: unknown, path: string, issues: string[], minimum?: number, maximum?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path}: требуется число.`);
    return;
  }
  if (minimum !== undefined && value < minimum) issues.push(`${path}: значение не может быть меньше ${minimum}.`);
  if (maximum !== undefined && value > maximum) issues.push(`${path}: значение не может быть больше ${maximum}.`);
}

function validateHeader(value: unknown, expectedType: string, issues: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push('Корень файла должен быть JSON-объектом.');
    return false;
  }
  if (value.type !== expectedType) issues.push(`type: ожидалось «${expectedType}».`);
  if (value.version !== DATA_FILE_VERSION) issues.push(`version: поддерживается только версия ${DATA_FILE_VERSION}.`);
  return true;
}

const adventurerStatuses: AdventurerStatus[] = ['READY', 'WOUNDED', 'ON_MISSION', 'DEAD'];
const missionTypes: MissionType[] = ['OPERATION', 'STORY', 'DUMMY'];
const missionResources: MissionResourceKey[] = ['None', 'Supplies', 'Equipment', 'Intelligence', 'Alchemy'];

function validateAdventurerList(value: unknown, path: string, issues: string[]): value is Adventurer[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}: требуется массив.`);
    return false;
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${itemPath}: требуется объект.`);
      return;
    }
    addStringIssue(item.id, `${itemPath}.id`, issues);
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) issues.push(`${itemPath}.id: повторяющийся ID «${item.id}».`);
      ids.add(item.id);
    }
    addStringIssue(item.name, `${itemPath}.name`, issues);
    addStringIssue(item.class, `${itemPath}.class`, issues);
    addFiniteIssue(item.level, `${itemPath}.level`, issues, 1, 5);
    addFiniteIssue(item.hp, `${itemPath}.hp`, issues);
    addFiniteIssue(item.maxHp, `${itemPath}.maxHp`, issues, 1);
    addFiniteIssue(item.successfulMissions, `${itemPath}.successfulMissions`, issues, 0);
    addFiniteIssue(item.totalMissions, `${itemPath}.totalMissions`, issues, 0);
    if (typeof item.hp === 'number' && typeof item.maxHp === 'number' && item.hp > item.maxHp) issues.push(`${itemPath}.hp: текущее HP не может превышать максимальное.`);
    if (typeof item.successfulMissions === 'number' && typeof item.totalMissions === 'number' && item.successfulMissions > item.totalMissions) issues.push(`${itemPath}.successfulMissions: успешных заданий не может быть больше общего числа.`);
    if (!adventurerStatuses.includes(item.status as AdventurerStatus)) issues.push(`${itemPath}.status: неизвестный статус.`);
    if (!isRecord(item.relations)) {
      issues.push(`${itemPath}.relations: требуется объект отношений.`);
    } else {
      Object.entries(item.relations).forEach(([clanId, score]) => addFiniteIssue(score, `${itemPath}.relations.${clanId}`, issues, 0, 10));
    }
    if (item.description !== undefined && typeof item.description !== 'string') issues.push(`${itemPath}.description: требуется строка.`);
    if (item.isPlayer !== undefined && typeof item.isPlayer !== 'boolean') issues.push(`${itemPath}.isPlayer: требуется true или false.`);
  });
  return true;
}

function validateEventList(value: unknown, path: string, issues: string[]): value is Mission[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}: требуется массив.`);
    return false;
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${itemPath}: требуется объект.`);
      return;
    }
    addStringIssue(item.id, `${itemPath}.id`, issues);
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) issues.push(`${itemPath}.id: повторяющийся ID «${item.id}».`);
      ids.add(item.id);
    }
    addStringIssue(item.title, `${itemPath}.title`, issues);
    if (typeof item.desc !== 'string') issues.push(`${itemPath}.desc: требуется строка.`);
    addStringIssue(item.region, `${itemPath}.region`, issues);
    if (!missionTypes.includes(item.type as MissionType)) issues.push(`${itemPath}.type: неизвестный тип события.`);
    if (!missionResources.includes(item.reqResource as MissionResourceKey)) issues.push(`${itemPath}.reqResource: неизвестный ресурс.`);
    addFiniteIssue(item.dc, `${itemPath}.dc`, issues, 0);
    addFiniteIssue(item.x, `${itemPath}.x`, issues, 0, 100);
    addFiniteIssue(item.y, `${itemPath}.y`, issues, 0, 100);
    if (item.lifespan !== null) addFiniteIssue(item.lifespan, `${itemPath}.lifespan`, issues, 1);
    if (item.maxLifespan !== null) addFiniteIssue(item.maxLifespan, `${itemPath}.maxLifespan`, issues, 1);
    if (item.startDay !== undefined) addFiniteIssue(item.startDay, `${itemPath}.startDay`, issues, 1);
    if (item.goldReward !== undefined) addFiniteIssue(item.goldReward, `${itemPath}.goldReward`, issues, 0);
    if (item.successText !== undefined && typeof item.successText !== 'string') issues.push(`${itemPath}.successText: требуется строка.`);
    if (item.failText !== undefined && typeof item.failText !== 'string') issues.push(`${itemPath}.failText: требуется строка.`);
    if (item.pinned !== undefined && typeof item.pinned !== 'boolean') issues.push(`${itemPath}.pinned: требуется true или false.`);
    if (item.intelRevealed !== undefined && typeof item.intelRevealed !== 'boolean') issues.push(`${itemPath}.intelRevealed: требуется true или false.`);
    if (item.scoutedByClanIds !== undefined && (!Array.isArray(item.scoutedByClanIds) || item.scoutedByClanIds.some(clanId => typeof clanId !== 'string'))) issues.push(`${itemPath}.scoutedByClanIds: требуется массив ID кланов.`);
    if (item.rewardSpecialItems !== undefined && (!Array.isArray(item.rewardSpecialItems) || item.rewardSpecialItems.some(reward => typeof reward !== 'string'))) issues.push(`${itemPath}.rewardSpecialItems: требуется массив строк.`);
    if (!Array.isArray(item.checks)) {
      issues.push(`${itemPath}.checks: требуется массив этапов, в том числе пустой для пустышки.`);
    } else {
      item.checks.forEach((check, checkIndex) => {
        const checkPath = `${itemPath}.checks[${checkIndex}]`;
        if (!isRecord(check)) {
          issues.push(`${checkPath}: требуется объект.`);
          return;
        }
        addFiniteIssue(check.dc, `${checkPath}.dc`, issues, 0);
        if (!missionResources.includes((check.reqResource ?? 'None') as MissionResourceKey)) issues.push(`${checkPath}.reqResource: неизвестный ресурс.`);
        if (check.requiredSpecialItem !== undefined && typeof check.requiredSpecialItem !== 'string') issues.push(`${checkPath}.requiredSpecialItem: требуется строка.`);
      });
    }
    if (item.complications !== undefined) {
      if (!isRecord(item.complications)) {
        issues.push(`${itemPath}.complications: требуется объект.`);
      } else {
        if (item.complications.enabled !== undefined && typeof item.complications.enabled !== 'boolean') issues.push(`${itemPath}.complications.enabled: требуется true или false.`);
        if (item.complications.chancePerSlot !== undefined) addFiniteIssue(item.complications.chancePerSlot, `${itemPath}.complications.chancePerSlot`, issues, 0, 1);
        if (item.complications.baseDc !== undefined) addFiniteIssue(item.complications.baseDc, `${itemPath}.complications.baseDc`, issues, 1);
        if (item.complications.allowMultiple !== undefined && typeof item.complications.allowMultiple !== 'boolean') issues.push(`${itemPath}.complications.allowMultiple: требуется true или false.`);
      }
    }
    if (item.prerequisiteMissionIds !== undefined && !Array.isArray(item.prerequisiteMissionIds)) issues.push(`${itemPath}.prerequisiteMissionIds: требуется массив ID.`);
    if (item.prerequisiteMode !== undefined && item.prerequisiteMode !== 'ALL' && item.prerequisiteMode !== 'ANY') issues.push(`${itemPath}.prerequisiteMode: требуется ALL или ANY.`);
  });

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const dependencies = Array.isArray(item.prerequisiteMissionIds) ? item.prerequisiteMissionIds : [];
    dependencies.forEach(dependency => {
      if (typeof dependency !== 'string' || !ids.has(dependency)) issues.push(`${path}[${index}].prerequisiteMissionIds: событие «${String(dependency)}» отсутствует в этом файле.`);
      if (dependency === item.id) issues.push(`${path}[${index}].prerequisiteMissionIds: событие не может зависеть от самого себя.`);
    });
  });

  const graph = new Map<string, string[]>();
  value.forEach(item => {
    if (isRecord(item) && typeof item.id === 'string') {
      graph.set(item.id, Array.isArray(item.prerequisiteMissionIds) ? item.prerequisiteMissionIds.filter((id): id is string => typeof id === 'string' && ids.has(id)) : []);
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) {
      cycleNodes.add(id);
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    let hasCycle = false;
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) {
        cycleNodes.add(id);
        hasCycle = true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  graph.forEach((_, id) => visit(id));
  if (cycleNodes.size > 0) issues.push(`${path}: обнаружен цикл зависимостей (${[...cycleNodes].join(', ')}).`);
  return true;
}

function validateClanList(value: unknown, path: string, issues: string[]): value is Clan[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}: требуется массив.`);
    return false;
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${itemPath}: требуется объект.`);
      return;
    }
    addStringIssue(item.id, `${itemPath}.id`, issues);
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) issues.push(`${itemPath}.id: повторяющийся ID «${item.id}».`);
      ids.add(item.id);
    }
    addStringIssue(item.name, `${itemPath}.name`, issues);
    addFiniteIssue(item.trustLevel, `${itemPath}.trustLevel`, issues, 1, 5);
    addFiniteIssue(item.gold, `${itemPath}.gold`, issues, 0);
    if (!isRecord(item.resources)) {
      issues.push(`${itemPath}.resources: требуется объект ресурсов.`);
    } else {
      ['Supplies', 'Equipment', 'Intelligence', 'Alchemy'].forEach(key => addFiniteIssue(item.resources?.[key], `${itemPath}.resources.${key}`, issues, 0));
    }
  });
  if (!ids.has('clan_guild')) issues.push(`${path}: отсутствует обязательный клан с ID «clan_guild».`);
  return true;
}

function validateMapRegions(value: unknown, path: string, issues: string[]): value is MapRegion[] {
  if (value === undefined) return true;
  if (!Array.isArray(value)) {
    issues.push(`${path}: требуется массив регионов.`);
    return false;
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${itemPath}: требуется объект.`);
      return;
    }
    addStringIssue(item.id, `${itemPath}.id`, issues);
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) issues.push(`${itemPath}.id: повторяющийся ID «${item.id}».`);
      ids.add(item.id);
    }
    addStringIssue(item.name, `${itemPath}.name`, issues);
    if (!Array.isArray(item.points) || item.points.length < 3) {
      issues.push(`${itemPath}.points: требуется не менее трёх точек.`);
    } else {
      item.points.forEach((point, pointIndex) => {
        if (!isRecord(point)) issues.push(`${itemPath}.points[${pointIndex}]: требуется объект точки.`);
        else {
          addFiniteIssue(point.x, `${itemPath}.points[${pointIndex}].x`, issues, 0, 100);
          addFiniteIssue(point.y, `${itemPath}.points[${pointIndex}].y`, issues, 0, 100);
        }
      });
    }
    if (!isRecord(item.labelPosition)) {
      issues.push(`${itemPath}.labelPosition: требуется точка подписи.`);
    } else {
      addFiniteIssue(item.labelPosition.x, `${itemPath}.labelPosition.x`, issues, 0, 100);
      addFiniteIssue(item.labelPosition.y, `${itemPath}.labelPosition.y`, issues, 0, 100);
    }
    if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(item.color)) issues.push(`${itemPath}.color: требуется цвет вида #RRGGBB.`);
    addFiniteIssue(item.fillOpacity, `${itemPath}.fillOpacity`, issues, 0, 0.8);
    addFiniteIssue(item.borderOpacity, `${itemPath}.borderOpacity`, issues, 0, 1);
    ['visibleToPlayers', 'showBoundary', 'showLabel', 'showFill'].forEach(key => {
      if (typeof item[key] !== 'boolean') issues.push(`${itemPath}.${key}: требуется true или false.`);
    });
    if (!isRecord(item.fog)) {
      issues.push(`${itemPath}.fog: требуется объект настроек тумана.`);
    } else {
      if (typeof item.fog.enabled !== 'boolean') issues.push(`${itemPath}.fog.enabled: требуется true или false.`);
      if (!['LOW', 'MEDIUM', 'DENSE'].includes(String(item.fog.density))) issues.push(`${itemPath}.fog.density: требуется LOW, MEDIUM или DENSE.`);
      if (!['SLOW', 'NORMAL', 'FAST'].includes(String(item.fog.speed))) issues.push(`${itemPath}.fog.speed: требуется SLOW, NORMAL или FAST.`);
    }
  });
  return true;
}

function throwIfIssues(issues: string[]) {
  if (issues.length > 0) throw new DataFileValidationError(issues);
}

export function parseAdventurerDataFile(value: unknown): AdventurerDataFile {
  const issues: string[] = [];
  if (validateHeader(value, ADVENTURER_FILE_TYPE, issues)) {
    addStringIssue(value.name, 'name', issues);
    validateAdventurerList(value.adventurers, 'adventurers', issues);
  }
  throwIfIssues(issues);
  return structuredClone(value as unknown as AdventurerDataFile);
}

export function parseEventDataFile(value: unknown): EventDataFile {
  const issues: string[] = [];
  if (validateHeader(value, EVENT_FILE_TYPE, issues)) {
    addStringIssue(value.name, 'name', issues);
    validateEventList(value.events, 'events', issues);
  }
  throwIfIssues(issues);
  const parsed = structuredClone(value as unknown as EventDataFile);
  return { ...parsed, events: parsed.events.map(normalizeMission) };
}

export function parseScenarioDataFile(value: unknown): ScenarioDataFile {
  const issues: string[] = [];
  if (validateHeader(value, SCENARIO_FILE_TYPE, issues)) {
    if (!isRecord(value.scenario)) {
      issues.push('scenario: требуется объект сценария.');
    } else {
      const scenario = value.scenario;
      addStringIssue(scenario.id, 'scenario.id', issues);
      addStringIssue(scenario.name, 'scenario.name', issues);
      if (typeof scenario.description !== 'string') issues.push('scenario.description: требуется строка.');
      addStringIssue(scenario.guildName, 'scenario.guildName', issues);
      addStringIssue(scenario.guildShortName, 'scenario.guildShortName', issues);
      addFiniteIssue(scenario.hCost, 'scenario.hCost', issues, 1);
      addFiniteIssue(scenario.nClans, 'scenario.nClans', issues, 1);
      addStringIssue(scenario.themeId, 'scenario.themeId', issues);
      addFiniteIssue(scenario.mapWidth, 'scenario.mapWidth', issues, 1);
      addFiniteIssue(scenario.mapHeight, 'scenario.mapHeight', issues, 1);
      if (!Array.isArray(scenario.spawnPolygon) || scenario.spawnPolygon.length < 3) {
        issues.push('scenario.spawnPolygon: требуется не менее трёх точек границы появления событий.');
      } else {
        scenario.spawnPolygon.forEach((point, index) => {
          if (!isRecord(point)) issues.push(`scenario.spawnPolygon[${index}]: требуется объект точки.`);
          else {
            addFiniteIssue(point.x, `scenario.spawnPolygon[${index}].x`, issues, 0, 100);
            addFiniteIssue(point.y, `scenario.spawnPolygon[${index}].y`, issues, 0, 100);
          }
        });
      }
      validateMapRegions(scenario.mapRegions, 'scenario.mapRegions', issues);
      if (scenario.mapEffectsEnabled !== undefined && typeof scenario.mapEffectsEnabled !== 'boolean') issues.push('scenario.mapEffectsEnabled: требуется true или false.');
      validateClanList(scenario.clans, 'scenario.clans', issues);
      if (Array.isArray(scenario.clans) && typeof scenario.nClans === 'number') {
        const playerClanCount = scenario.clans.filter(clan => isRecord(clan) && clan.id !== 'clan_guild').length;
        if (scenario.nClans > playerClanCount) issues.push(`scenario.nClans: указано ${scenario.nClans}, но доступно только ${playerClanCount} игровых кланов.`);
      }
      validateAdventurerList(scenario.adventurers, 'scenario.adventurers', issues);
      validateEventList(scenario.events, 'scenario.events', issues);
    }
  }
  throwIfIssues(issues);
  const parsed = structuredClone(value as unknown as ScenarioDataFile);
  return {
    ...parsed,
    scenario: {
      ...parsed.scenario,
      mapRegions: (parsed.scenario.mapRegions ?? []).map(normalizeMapRegion),
      mapEffectsEnabled: parsed.scenario.mapEffectsEnabled ?? true,
      events: parsed.scenario.events.map(normalizeMission)
    }
  };
}

export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new DataFileValidationError(['Файл повреждён или не является корректным JSON.']);
  }
}

export function createAdventurerDataFile(name: string, adventurers: Adventurer[]): AdventurerDataFile {
  return { type: ADVENTURER_FILE_TYPE, version: DATA_FILE_VERSION, name: name.trim() || 'Список авантюристов', adventurers: structuredClone(adventurers) };
}

export function createEventDataFile(name: string, events: Mission[]): EventDataFile {
  return { type: EVENT_FILE_TYPE, version: DATA_FILE_VERSION, name: name.trim() || 'Список событий', events: structuredClone(events) };
}

export function createScenarioDataFile(scenario: ScenarioFileData): ScenarioDataFile {
  return { type: SCENARIO_FILE_TYPE, version: DATA_FILE_VERSION, scenario: structuredClone(scenario) };
}

function activeAtDayOne(mission: Mission): boolean {
  return (mission.startDay ?? 1) <= 1 && (mission.prerequisiteMissionIds ?? []).length === 0;
}

export function buildNewCampaign(options: {
  isDmMode: boolean;
  guildName?: string;
  scenarioFile?: ScenarioDataFile | null;
  adventurerFile?: AdventurerDataFile | null;
  eventFile?: EventDataFile | null;
}): GameState {
  const scenario = options.scenarioFile?.scenario;
  const initial = createInitialGameState({ isDmMode: options.isDmMode, clansCount: scenario?.nClans });
  const guildName = options.guildName?.trim() || scenario?.guildName || initial.guildName;
  const clans = structuredClone(scenario?.clans ?? initial.clans).map(clan => clan.id === 'clan_guild' ? { ...clan, name: guildName } : clan);
  const adventurers = structuredClone(options.adventurerFile?.adventurers ?? scenario?.adventurers ?? initial.adventurers);
  const events = structuredClone(options.eventFile?.events ?? scenario?.events ?? initial.allMissions ?? initial.missions).map(normalizeMission);

  return {
    ...initial,
    activeScenarioId: scenario?.id ?? null,
    guildName,
    guildShortName: scenario?.guildShortName || guildName,
    hCost: scenario?.hCost ?? initial.hCost,
    nClans: scenario?.nClans ?? initial.nClans,
    themeId: scenario?.themeId ?? initial.themeId,
    mapBgUrl: DEFAULT_MAP_URL,
    mapAssetId: null,
    mapWidth: scenario?.mapWidth ?? initial.mapWidth,
    mapHeight: scenario?.mapHeight ?? initial.mapHeight,
    spawnPolygon: structuredClone(scenario?.spawnPolygon ?? initial.spawnPolygon),
    mapRegions: structuredClone(scenario?.mapRegions ?? initial.mapRegions).map(normalizeMapRegion),
    mapEffectsEnabled: scenario?.mapEffectsEnabled ?? initial.mapEffectsEnabled,
    hqPos: scenario?.hqPos ? { ...scenario.hqPos } : initial.hqPos,
    clans,
    adventurers,
    allMissions: events,
    missions: events.filter(activeAtDayOne).map(mission => structuredClone(mission)),
    contracts: [],
    history: [],
    completedMissionIds: [],
    selectedMissionId: null,
    lastDistributionLogs: [],
    distributionReport: null
  };
}

export function formatDataFileError(error: unknown): string[] {
  if (error instanceof DataFileValidationError) return error.issues;
  return [error instanceof Error ? error.message : 'Не удалось обработать файл.'];
}
