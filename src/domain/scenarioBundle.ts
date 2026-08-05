import type { Adventurer, Clan, GameState, MapRegion, Mission, ScenarioChain } from '../types';
import { DEFAULT_MAP_URL } from './constants';
import { loadMapAssetBlob, saveMapBlob } from './mapAssets';
import { getScenarioMissions } from './scenarioEditor';
import { createInitialGameState, normalizeMission } from './state';
import { findMapRegionAtPoint, normalizeMapRegion } from './mapRegions';
import { applyLegacyActiveClanCount, getActivePlayerClans, orderClansGuildFirst } from './clans';
import {
  createScenarioDataFile,
  DATA_FILE_VERSION,
  parseScenarioDataFile,
  SCENARIO_FILE_TYPE,
  type ScenarioFileData
} from './dataFiles';

const BUNDLE_FORMAT = 'global-map-scenario';
const BUNDLE_VERSION = 1;

interface ScenarioBundleData {
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
  mapRegions?: MapRegion[];
  mapEffectsEnabled?: boolean;
  hqPos?: GameState['hqPos'];
  clans: Clan[];
  adventurers: Adventurer[];
  missions: Mission[];
  chains?: ScenarioChain[];
}

interface ScenarioBundleFile {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  exportedAt: string;
  scenario: ScenarioBundleData;
  map: {
    fileName: string;
    mimeType: string;
    base64: string;
  };
}

export interface EditableScenarioBundle {
  scenario: ScenarioFileData;
  mapBlob: Blob;
  mapFileName: string;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'scenario';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать изображение карты.'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function inferMapFileName(url: string, mimeType: string): string {
  try {
    const name = new URL(url, window.location.href).pathname.split('/').pop();
    if (name) return name;
  } catch {
    // Fall through to the MIME based name.
  }
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'img';
  return `map.${extension}`;
}

async function getCurrentMapBlob(state: GameState): Promise<Blob> {
  if (state.mapAssetId) {
    const stored = await loadMapAssetBlob(state.mapAssetId);
    if (stored) return stored;
  }
  const response = await fetch(state.mapBgUrl || DEFAULT_MAP_URL);
  if (!response.ok) throw new Error(`Не удалось вложить карту в сценарий: HTTP ${response.status}.`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Текущая карта не распознана как изображение.');
  return blob;
}

function isBundle(value: unknown): value is ScenarioBundleFile {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<ScenarioBundleFile>;
  const encodedMap = bundle.map?.base64;
  return bundle.format === BUNDLE_FORMAT
    && bundle.version === BUNDLE_VERSION
    && typeof bundle.exportedAt === 'string'
    && Number.isFinite(Date.parse(bundle.exportedAt))
    && Boolean(bundle.scenario)
    && Array.isArray(bundle.scenario?.clans)
    && Array.isArray(bundle.scenario?.adventurers)
    && Array.isArray(bundle.scenario?.missions)
    && typeof bundle.map?.fileName === 'string'
    && typeof bundle.map?.mimeType === 'string'
    && bundle.map.mimeType.startsWith('image/')
    && typeof encodedMap === 'string'
    && encodedMap.length > 0
    && encodedMap.length % 4 === 0
    && /^[a-z0-9+/]+={0,2}$/iu.test(encodedMap);
}

function validateBundleScenario(bundle: ScenarioBundleFile): ScenarioFileData {
  return parseScenarioDataFile({
    type: SCENARIO_FILE_TYPE,
    version: DATA_FILE_VERSION,
    scenario: {
      ...bundle.scenario,
      mapRegions: bundle.scenario.mapRegions ?? [],
      mapEffectsEnabled: bundle.scenario.mapEffectsEnabled ?? true,
      events: bundle.scenario.missions
    }
  }).scenario;
}

export async function createScenarioBundleFile(
  scenarioInput: ScenarioFileData,
  mapBlob: Blob,
  mapFileName: string
): Promise<{ blob: Blob; fileName: string }> {
  if (!mapBlob.type.startsWith('image/')) throw new Error('Карта сценария должна быть изображением.');
  const scenario = parseScenarioDataFile(createScenarioDataFile(scenarioInput)).scenario;
  const { events, ...scenarioFields } = scenario;
  const bundle: ScenarioBundleFile = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    scenario: {
      ...scenarioFields,
      missions: structuredClone(events)
    },
    map: {
      fileName: mapFileName || inferMapFileName(DEFAULT_MAP_URL, mapBlob.type),
      mimeType: mapBlob.type,
      base64: await blobToBase64(mapBlob)
    }
  };
  return {
    blob: new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
    fileName: `${sanitizeFileName(scenario.name)}.globalmap`
  };
}

export async function createScenarioBundle(state: GameState): Promise<{ blob: Blob; fileName: string }> {
  const mapBlob = await getCurrentMapBlob(state);
  const scenarioId = state.activeScenarioId || `scenario_${Date.now().toString(36)}`;
  return createScenarioBundleFile({
    id: scenarioId,
    name: state.guildName,
    description: `Сценарий для «${state.guildName}»`,
    guildName: state.guildName,
    guildShortName: state.guildShortName,
    hCost: state.hCost,
    nClans: state.nClans,
    themeId: state.themeId,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    spawnPolygon: structuredClone(state.spawnPolygon),
    mapRegions: structuredClone(state.mapRegions),
    mapEffectsEnabled: state.mapEffectsEnabled,
    hqPos: state.hqPos ? { ...state.hqPos } : undefined,
    clans: structuredClone(state.clans),
    adventurers: structuredClone(state.adventurers),
    events: structuredClone(getScenarioMissions(state)),
    chains: structuredClone(state.scenarioChains ?? [])
  }, mapBlob, inferMapFileName(state.mapBgUrl || DEFAULT_MAP_URL, mapBlob.type));
}

export async function readScenarioBundleFile(file: File): Promise<EditableScenarioBundle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл сценария повреждён или не является JSON.');
  }
  if (!isBundle(parsed)) throw new Error('Это не поддерживаемый файл сценария .globalmap.');
  if (!parsed.map.mimeType.startsWith('image/')) throw new Error('Вложение .globalmap не является изображением карты.');
  let mapBlob: Blob;
  try {
    mapBlob = base64ToBlob(parsed.map.base64, parsed.map.mimeType);
  } catch {
    throw new Error('Вложенное изображение .globalmap повреждено.');
  }
  if (mapBlob.size === 0) throw new Error('Вложенная карта .globalmap пуста.');
  return {
    scenario: validateBundleScenario(parsed),
    mapBlob,
    mapFileName: parsed.map.fileName || 'map.img'
  };
}

function prerequisitesSatisfiedAtStart(mission: Mission): boolean {
  return (mission.prerequisiteMissionIds ?? []).length === 0;
}

export async function importScenarioBundle(file: File, isDmMode: boolean): Promise<GameState> {
  const editable = await readScenarioBundleFile(file);
  const scenario = editable.scenario;
  const mapAsset = await saveMapBlob(editable.mapBlob);
  const initial = createInitialGameState({ isDmMode, clansCount: scenario.nClans });
  const mapRegions = structuredClone(scenario.mapRegions ?? []).map(normalizeMapRegion);
  const missions = structuredClone(scenario.events).map(normalizeMission).map(mission => {
    if (mission.regionMode !== 'AUTO') return mission;
    const region = findMapRegionAtPoint(mapRegions, mission);
    return { ...mission, regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ' };
  });
  let clans = orderClansGuildFirst(structuredClone(scenario.clans))
    .map(clan => clan.id === 'clan_guild' ? { ...clan, name: scenario.guildName } : clan);
  if (!clans.some(clan => clan.id !== 'clan_guild' && clan.isActive !== undefined)) clans = applyLegacyActiveClanCount(clans, scenario.nClans);

  return {
    ...initial,
    activeScenarioId: scenario.id,
    guildName: scenario.guildName,
    guildShortName: scenario.guildShortName || scenario.guildName,
    hCost: Math.max(1, scenario.hCost || 10),
    nClans: getActivePlayerClans(clans, scenario.nClans).length,
    themeId: scenario.themeId || initial.themeId,
    mapBgUrl: DEFAULT_MAP_URL,
    mapAssetId: mapAsset.id,
    mapWidth: scenario.mapWidth || mapAsset.width,
    mapHeight: scenario.mapHeight || mapAsset.height,
    spawnPolygon: structuredClone(scenario.spawnPolygon),
    mapRegions,
    mapEffectsEnabled: scenario.mapEffectsEnabled ?? true,
    hqPos: scenario.hqPos ? { ...scenario.hqPos } : initial.hqPos,
    clans,
    adventurers: structuredClone(scenario.adventurers),
    allMissions: missions,
    scenarioChains: structuredClone(scenario.chains ?? []),
    missions: missions
      .filter(mission => (mission.startDay ?? 1) <= 1 && prerequisitesSatisfiedAtStart(mission))
      .map(mission => structuredClone(mission)),
    contracts: [],
    history: [],
    completedMissionIds: [],
    closedMissionIds: [],
    expiredMissionIds: [],
    selectedMissionId: null,
    distributionReport: null,
    lastDistributionLogs: []
  };
}
