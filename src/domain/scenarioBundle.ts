import type { Adventurer, Clan, GameState, MapRegion, Mission } from '../types';
import { DEFAULT_MAP_URL } from './constants';
import { loadMapAssetBlob, saveMapBlob } from './mapAssets';
import { getScenarioMissions } from './scenarioEditor';
import { createInitialGameState } from './state';
import { normalizeMapRegion } from './mapRegions';

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

export async function createScenarioBundle(state: GameState): Promise<{ blob: Blob; fileName: string }> {
  const mapBlob = await getCurrentMapBlob(state);
  const mapUrl = state.mapBgUrl || DEFAULT_MAP_URL;
  const scenarioId = state.activeScenarioId || `scenario_${Date.now().toString(36)}`;
  const bundle: ScenarioBundleFile = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    scenario: {
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
      missions: structuredClone(getScenarioMissions(state))
    },
    map: {
      fileName: inferMapFileName(mapUrl, mapBlob.type),
      mimeType: mapBlob.type,
      base64: await blobToBase64(mapBlob)
    }
  };
  return {
    blob: new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
    fileName: `${sanitizeFileName(state.guildName)}.globalmap`
  };
}

function isBundle(value: unknown): value is ScenarioBundleFile {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<ScenarioBundleFile>;
  return bundle.format === BUNDLE_FORMAT
    && bundle.version === BUNDLE_VERSION
    && Boolean(bundle.scenario)
    && Array.isArray(bundle.scenario?.clans)
    && Array.isArray(bundle.scenario?.adventurers)
    && Array.isArray(bundle.scenario?.missions)
    && Boolean(bundle.map?.base64)
    && Boolean(bundle.map?.mimeType);
}

function prerequisitesSatisfiedAtStart(mission: Mission): boolean {
  return (mission.prerequisiteMissionIds ?? []).length === 0;
}

export async function importScenarioBundle(file: File, isDmMode: boolean): Promise<GameState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл сценария повреждён или не является JSON.');
  }
  if (!isBundle(parsed)) throw new Error('Это не поддерживаемый файл сценария .globalmap.');

  const scenario = parsed.scenario;
  const mapBlob = base64ToBlob(parsed.map.base64, parsed.map.mimeType);
  const mapAsset = await saveMapBlob(mapBlob);
  const initial = createInitialGameState({ isDmMode, clansCount: scenario.nClans });
  const missions = structuredClone(scenario.missions);

  return {
    ...initial,
    activeScenarioId: scenario.id,
    guildName: scenario.guildName,
    guildShortName: scenario.guildShortName || scenario.guildName,
    hCost: Math.max(1, scenario.hCost || 10),
    nClans: Math.max(1, scenario.nClans || scenario.clans.length),
    themeId: scenario.themeId || initial.themeId,
    mapBgUrl: DEFAULT_MAP_URL,
    mapAssetId: mapAsset.id,
    mapWidth: scenario.mapWidth || mapAsset.width,
    mapHeight: scenario.mapHeight || mapAsset.height,
    spawnPolygon: structuredClone(scenario.spawnPolygon),
    mapRegions: structuredClone(scenario.mapRegions ?? []).map(normalizeMapRegion),
    mapEffectsEnabled: scenario.mapEffectsEnabled ?? true,
    hqPos: scenario.hqPos ? { ...scenario.hqPos } : initial.hqPos,
    clans: structuredClone(scenario.clans).map(clan => clan.id === 'clan_guild' ? { ...clan, name: scenario.guildName } : clan),
    adventurers: structuredClone(scenario.adventurers),
    allMissions: missions,
    missions: missions
      .filter(mission => (mission.startDay ?? 1) <= 1 && prerequisitesSatisfiedAtStart(mission))
      .map(mission => structuredClone(mission)),
    contracts: [],
    history: [],
    completedMissionIds: [],
    selectedMissionId: null,
    distributionReport: null,
    lastDistributionLogs: []
  };
}
