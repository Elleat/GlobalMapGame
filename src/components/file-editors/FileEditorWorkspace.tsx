import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../types';
import { DEFAULT_SPAWN_POLYGON } from '../../utils';
import { DEFAULT_MAP_URL } from '../../domain/constants';
import { createInitialGameState } from '../../domain/state';
import { createScenarioBundleFile, readScenarioBundleFile } from '../../domain/scenarioBundle';
import {
  createAdventurerDataFile,
  createEventDataFile,
  createScenarioDataFile,
  formatDataFileError,
  parseAdventurerDataFile,
  parseEventDataFile,
  parseScenarioDataFile,
  readJsonFile,
  type ScenarioFileData
} from '../../domain/dataFiles';
import type { FileEditorKind } from '../MainMenu';
import FileEditorToolbar from './FileEditorToolbar';
import ScenarioFileEditor from './ScenarioFileEditor';
import HelpModal from '../HelpModal';

const EDITOR_AUTOSAVE_VERSION = 1;

function getAutosaveKey(kind: FileEditorKind) {
  return `global-map-editor-autosave:${kind.toLocaleLowerCase()}`;
}

const AdventurerEditor = lazy(() => import('../AdventurerEditor'));
const EventEditor = lazy(() => import('../EventEditor'));

interface FileEditorWorkspaceProps {
  kind: FileEditorKind;
  onBack: () => void;
}

function blankDraftState(): GameState {
  const state = createInitialGameState({ isDmMode: true });
  return {
    ...state,
    adventurers: [],
    missions: [],
    allMissions: [],
    contracts: [],
    history: [],
    completedMissionIds: []
  };
}

function blankScenario(): ScenarioFileData {
  const state = createInitialGameState({ isDmMode: true });
  return {
    id: `scenario_${Date.now().toString(36)}`,
    name: 'Новый сценарий',
    description: '',
    guildName: state.guildName,
    guildShortName: state.guildShortName,
    hCost: state.hCost,
    nClans: state.nClans,
    themeId: state.themeId,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    spawnPolygon: structuredClone(DEFAULT_SPAWN_POLYGON),
    mapRegions: [],
    mapEffectsEnabled: true,
    hqPos: state.hqPos,
    clans: structuredClone(state.clans),
    adventurers: [],
    events: [],
    chains: []
  };
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'data';
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFileName(fileName)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function FileEditorWorkspace({ kind, onBack }: FileEditorWorkspaceProps) {
  const [draftState, setDraftState] = useState<GameState>(() => blankDraftState());
  const [scenario, setScenario] = useState<ScenarioFileData>(() => blankScenario());
  const [fileName, setFileName] = useState(() => kind === 'ADVENTURERS' ? 'Мои авантюристы' : kind === 'EVENTS' ? 'Мои события' : 'Новый сценарий');
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const [scenarioMapBlob, setScenarioMapBlob] = useState<Blob | null>(null);
  const [scenarioMapFileName, setScenarioMapFileName] = useState('GlobalMap.webp');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [autosaveReady, setAutosaveReady] = useState(false);

  const scenarioMapUrl = useMemo(
    () => scenarioMapBlob ? URL.createObjectURL(scenarioMapBlob) : DEFAULT_MAP_URL,
    [scenarioMapBlob]
  );

  const title = useMemo(() => kind === 'ADVENTURERS' ? 'Редактор авантюристов' : kind === 'EVENTS' ? 'Редактор событий' : 'Редактор сценариев', [kind]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    try {
      const serialized = localStorage.getItem(getAutosaveKey(kind));
      if (!serialized) return;
      const saved = JSON.parse(serialized) as { version?: number; fileName?: string; draftState?: GameState; scenario?: ScenarioFileData; savedAt?: string };
      if (saved.version !== EDITOR_AUTOSAVE_VERSION || typeof saved.fileName !== 'string') return;
      if (kind === 'SCENARIO' && saved.scenario) setScenario(saved.scenario);
      if (kind !== 'SCENARIO' && saved.draftState) setDraftState(saved.draftState);
      setFileName(saved.fileName);
      setDirty(true);
      setRevision(value => value + 1);
      setStatus({ message: `Восстановлен локальный черновик${saved.savedAt ? ` от ${new Date(saved.savedAt).toLocaleString('ru-RU')}` : ''}. Изображение пользовательской карты при необходимости выберите заново.` });
    } catch {
      localStorage.removeItem(getAutosaveKey(kind));
    } finally {
      setAutosaveReady(true);
    }
  }, [kind]);

  useEffect(() => {
    if (!autosaveReady || !dirty) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(getAutosaveKey(kind), JSON.stringify({
          version: EDITOR_AUTOSAVE_VERSION,
          fileName,
          savedAt: new Date().toISOString(),
          ...(kind === 'SCENARIO' ? { scenario } : { draftState })
        }));
      } catch {
        setStatus({ message: 'Локальный черновик не помещается в хранилище браузера. Скачайте файл вручную.', isError: true });
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autosaveReady, dirty, draftState, fileName, kind, scenario]);

  useEffect(() => () => {
    if (scenarioMapBlob) URL.revokeObjectURL(scenarioMapUrl);
  }, [scenarioMapBlob, scenarioMapUrl]);

  const showStatus = (message: string, isError = false) => setStatus({ message, isError });
  const updateDraft = (change: Partial<GameState>) => {
    setDraftState(current => ({ ...current, ...change }));
    setDirty(true);
  };
  const updateScenario = (value: ScenarioFileData) => {
    setScenario(value);
    setFileName(value.name);
    setDirty(true);
  };
  const confirmDiscard = () => !dirty || window.confirm('Несохранённые изменения будут потеряны. Продолжить?');

  const handleBack = () => {
    if (confirmDiscard()) onBack();
  };

  const handleNew = () => {
    if (!confirmDiscard()) return;
    setDraftState(blankDraftState());
    setScenario(blankScenario());
    setScenarioMapBlob(null);
    setScenarioMapFileName('GlobalMap.webp');
    setFileName(kind === 'ADVENTURERS' ? 'Новый список авантюристов' : kind === 'EVENTS' ? 'Новый список событий' : 'Новый сценарий');
    setDirty(false);
    setRevision(value => value + 1);
    localStorage.removeItem(getAutosaveKey(kind));
    showStatus('Создан новый пустой черновик.');
  };

  const handleOpen = async (file: File) => {
    if (!confirmDiscard()) return;
    try {
      const raw = file.name.toLocaleLowerCase().endsWith('.globalmap') ? null : await readJsonFile(file);
      if (kind === 'ADVENTURERS') {
        const parsed = parseAdventurerDataFile(raw);
        setDraftState({ ...blankDraftState(), adventurers: parsed.adventurers });
        setFileName(parsed.name);
      } else if (kind === 'EVENTS') {
        const parsed = parseEventDataFile(raw);
        setDraftState({ ...blankDraftState(), missions: parsed.events, allMissions: parsed.events, scenarioChains: parsed.chains ?? [] });
        setFileName(parsed.name);
      } else {
        if (file.name.toLocaleLowerCase().endsWith('.globalmap')) {
          const parsed = await readScenarioBundleFile(file);
          setScenario(parsed.scenario);
          setFileName(parsed.scenario.name);
          setScenarioMapBlob(parsed.mapBlob);
          setScenarioMapFileName(parsed.mapFileName);
        } else {
          const parsed = parseScenarioDataFile(raw);
          setScenario(parsed.scenario);
          setFileName(parsed.scenario.name);
          setScenarioMapBlob(null);
          setScenarioMapFileName('GlobalMap.webp');
        }
      }
      setDirty(false);
      setRevision(value => value + 1);
      showStatus(`Файл «${file.name}» проверен и открыт.`);
    } catch (error) {
      showStatus(formatDataFileError(error).join(' '), true);
    }
  };

  const handleDownload = () => {
    try {
      if (kind === 'ADVENTURERS') {
        const data = createAdventurerDataFile(fileName, draftState.adventurers);
        parseAdventurerDataFile(data);
        downloadJson(data, fileName || 'adventurers');
      } else if (kind === 'EVENTS') {
        const data = createEventDataFile(fileName, draftState.allMissions ?? draftState.missions, draftState.scenarioChains ?? []);
        parseEventDataFile(data);
        downloadJson(data, fileName || 'events');
      } else {
        const data = createScenarioDataFile({ ...scenario, name: fileName.trim() || scenario.name });
        parseScenarioDataFile(data);
        downloadJson(data, fileName || 'scenario');
      }
      setDirty(false);
      showStatus('JSON проверен и сохранён в папку загрузок.');
    } catch (error) {
      showStatus(`Файл не сохранён: ${formatDataFileError(error).join(' ')}`, true);
    }
  };

  const handleDownloadBundle = async () => {
    try {
      const mapBlob = scenarioMapBlob ?? await fetch(DEFAULT_MAP_URL).then(response => {
        if (!response.ok) throw new Error(`Не удалось загрузить стандартную карту: HTTP ${response.status}.`);
        return response.blob();
      });
      const bundle = await createScenarioBundleFile(
        { ...scenario, name: fileName.trim() || scenario.name },
        mapBlob,
        scenarioMapFileName
      );
      downloadBlob(bundle.blob, bundle.fileName);
      setDirty(false);
      showStatus(`Сценарий с картой сохранён в «${bundle.fileName}».`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Не удалось сохранить .globalmap.', true);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      if (kind === 'SCENARIO') void handleDownloadBundle();
      else handleDownload();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSelectScenarioMap = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showStatus('Выбранный файл не является изображением.', true);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setScenario(current => ({ ...current, mapWidth: bitmap.width, mapHeight: bitmap.height }));
      bitmap.close();
      setScenarioMapBlob(file);
      setScenarioMapFileName(file.name);
      setDirty(true);
      showStatus(`Карта «${file.name}» добавлена в проект сценария.`);
    } catch {
      showStatus('Не удалось прочитать размеры изображения карты.', true);
    }
  };

  const importScenarioAdventurers = async (file: File) => {
    try {
      const parsed = parseAdventurerDataFile(await readJsonFile(file));
      updateScenario({ ...scenario, adventurers: parsed.adventurers });
      showStatus(`В сценарий добавлено авантюристов: ${parsed.adventurers.length}.`);
    } catch (error) {
      showStatus(formatDataFileError(error).join(' '), true);
    }
  };

  const importScenarioEvents = async (file: File) => {
    try {
      const parsed = parseEventDataFile(await readJsonFile(file));
      updateScenario({ ...scenario, events: parsed.events, chains: parsed.chains ?? [] });
      showStatus(`В сценарий добавлено событий: ${parsed.events.length}.`);
    } catch (error) {
      showStatus(formatDataFileError(error).join(' '), true);
    }
  };

  return (
    <div className="relative z-10 min-h-screen">
      <FileEditorToolbar
        title={title}
        fileName={fileName}
        dirty={dirty}
        status={status}
        onFileNameChange={value => { setFileName(value); if (kind === 'SCENARIO') setScenario(current => ({ ...current, name: value })); setDirty(true); }}
        onBack={handleBack}
        onNew={handleNew}
        onOpen={handleOpen}
        onDownload={handleDownload}
        accept={kind === 'SCENARIO' ? '.json,.globalmap,application/json' : undefined}
        openLabel={kind === 'SCENARIO' ? 'Открыть проект' : 'Открыть JSON'}
        downloadLabel="Скачать JSON"
        onDownloadBundle={kind === 'SCENARIO' ? handleDownloadBundle : undefined}
        onHelp={() => setIsHelpOpen(true)}
      />
      <Suspense fallback={<div className="p-10 text-center font-mono text-xs text-emerald-400">Открываем файловый редактор…</div>}>
        {kind === 'ADVENTURERS' && <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><AdventurerEditor key={`adventurers-${revision}`} state={draftState} updateState={updateDraft} showToast={showStatus} mode="FILE" /></div>}
        {kind === 'EVENTS' && <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><EventEditor key={`events-${revision}`} state={draftState} updateState={updateDraft} showToast={showStatus} mode="FILE" /></div>}
        {kind === 'SCENARIO' && <ScenarioFileEditor
          value={scenario}
          onChange={updateScenario}
          onImportAdventurers={importScenarioAdventurers}
          onImportEvents={importScenarioEvents}
          mapUrl={scenarioMapUrl}
          mapFileName={scenarioMapFileName}
          onSelectMapFile={handleSelectScenarioMap}
          showStatus={showStatus}
        />}
      </Suspense>
      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}
