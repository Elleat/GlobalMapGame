import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../types';
import { DEFAULT_SPAWN_POLYGON } from '../../utils';
import { createInitialGameState } from '../../domain/state';
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
    hqPos: state.hqPos,
    clans: structuredClone(state.clans),
    adventurers: [],
    events: []
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

export default function FileEditorWorkspace({ kind, onBack }: FileEditorWorkspaceProps) {
  const [draftState, setDraftState] = useState<GameState>(() => blankDraftState());
  const [scenario, setScenario] = useState<ScenarioFileData>(() => blankScenario());
  const [fileName, setFileName] = useState(() => kind === 'ADVENTURERS' ? 'Мои авантюристы' : kind === 'EVENTS' ? 'Мои события' : 'Мой сценарий');
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<{ message: string; isError?: boolean } | null>(null);

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
    setFileName(kind === 'ADVENTURERS' ? 'Новый список авантюристов' : kind === 'EVENTS' ? 'Новый список событий' : 'Новый сценарий');
    setDirty(false);
    setRevision(value => value + 1);
    showStatus('Создан новый пустой черновик.');
  };

  const handleOpen = async (file: File) => {
    if (!confirmDiscard()) return;
    try {
      const raw = await readJsonFile(file);
      if (kind === 'ADVENTURERS') {
        const parsed = parseAdventurerDataFile(raw);
        setDraftState({ ...blankDraftState(), adventurers: parsed.adventurers });
        setFileName(parsed.name);
      } else if (kind === 'EVENTS') {
        const parsed = parseEventDataFile(raw);
        setDraftState({ ...blankDraftState(), missions: parsed.events, allMissions: parsed.events });
        setFileName(parsed.name);
      } else {
        const parsed = parseScenarioDataFile(raw);
        setScenario(parsed.scenario);
        setFileName(parsed.scenario.name);
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
        const data = createEventDataFile(fileName, draftState.allMissions ?? draftState.missions);
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
      updateScenario({ ...scenario, events: parsed.events });
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
      />
      <Suspense fallback={<div className="p-10 text-center font-mono text-xs text-emerald-400">Открываем файловый редактор…</div>}>
        {kind === 'ADVENTURERS' && <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><AdventurerEditor key={`adventurers-${revision}`} state={draftState} updateState={updateDraft} showToast={showStatus} mode="FILE" /></div>}
        {kind === 'EVENTS' && <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><EventEditor key={`events-${revision}`} state={draftState} updateState={updateDraft} showToast={showStatus} mode="FILE" /></div>}
        {kind === 'SCENARIO' && <ScenarioFileEditor value={scenario} onChange={updateScenario} onImportAdventurers={importScenarioAdventurers} onImportEvents={importScenarioEvents} />}
      </Suspense>
    </div>
  );
}
