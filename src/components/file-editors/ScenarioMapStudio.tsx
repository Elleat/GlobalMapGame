import {
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Focus,
  Layers,
  Lock,
  Map as MapIcon,
  MapPin,
  MousePointer2,
  Pentagon,
  Plus,
  Redo2,
  Search,
  Shield,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapRegion, Mission, MissionType } from '../../types';
import type { ScenarioFileData } from '../../domain/dataFiles';
import { createMapRegion, getFogOpacity, getRegionCenter, getRegionClipPath } from '../../domain/mapRegions';
import { getMissionPresentation } from '../../domain/missionPresentation';
import { createScenarioMission } from '../../domain/scenarioEditor';

type StudioTool = 'SELECT' | 'ADD_EVENT' | 'DRAW_REGION' | 'SPAWN' | 'HQ';
type PreviewMode = 'EDIT' | 'GM' | 'PLAYER';
type StudioLayerKey = 'events' | 'regions' | 'regionLabels' | 'spawn' | 'hq' | 'effects';

interface StudioLayerVisibility {
  events: boolean;
  regions: boolean;
  regionLabels: boolean;
  spawn: boolean;
  hq: boolean;
  effects: boolean;
}

interface MapGeometrySnapshot {
  mapRegions: MapRegion[];
  spawnPolygon: { x: number; y: number }[];
  hqPos?: { x: number; y: number };
  eventPositions: Array<Pick<Mission, 'id' | 'x' | 'y' | 'region' | 'regionId' | 'regionMode'>>;
}

interface ScenarioMapStudioProps {
  value: ScenarioFileData;
  mapUrl: string;
  mapFileName: string;
  selectedMissionId: string | null;
  onSelectedMissionIdChange: (id: string | null) => void;
  onChange: (value: ScenarioFileData) => void;
  onSelectMapFile: (file: File) => void;
}

interface DragTarget {
  kind: 'EVENT' | 'REGION_VERTEX' | 'REGION_LABEL' | 'SPAWN_VERTEX' | 'HQ' | 'PAN';
  id?: string;
  index?: number;
  startClient?: { x: number; y: number };
  startPan?: { x: number; y: number };
}

const DEFAULT_LAYER_VISIBILITY: StudioLayerVisibility = {
  events: true,
  regions: true,
  regionLabels: true,
  spawn: true,
  hq: true,
  effects: true
};

const HISTORY_LIMIT = 40;

const TYPE_COLORS: Record<MissionType, string> = {
  OPERATION: '#10b981',
  STORY: '#8b5cf6',
  DUMMY: '#a3a3a3'
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function eventTypeLabel(type: MissionType) {
  if (type === 'STORY') return 'Сюжетная миссия';
  if (type === 'DUMMY') return 'Пустышка';
  return 'Операция';
}

function pointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function snapshotGeometry(value: ScenarioFileData): MapGeometrySnapshot {
  return {
    mapRegions: structuredClone(value.mapRegions),
    spawnPolygon: structuredClone(value.spawnPolygon),
    hqPos: value.hqPos ? { ...value.hqPos } : undefined,
    eventPositions: value.events.map(event => ({
      id: event.id,
      x: event.x,
      y: event.y,
      region: event.region,
      regionId: event.regionId,
      regionMode: event.regionMode
    }))
  };
}

function geometryChanged(left: MapGeometrySnapshot, right: MapGeometrySnapshot): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function applyGeometrySnapshot(value: ScenarioFileData, snapshot: MapGeometrySnapshot): ScenarioFileData {
  const positions = new Map(snapshot.eventPositions.map(position => [position.id, position]));
  return {
    ...value,
    mapRegions: structuredClone(snapshot.mapRegions),
    spawnPolygon: structuredClone(snapshot.spawnPolygon),
    hqPos: snapshot.hqPos ? { ...snapshot.hqPos } : undefined,
    events: value.events.map(event => {
      const position = positions.get(event.id);
      return position ? { ...event, ...position } : event;
    })
  };
}

export default function ScenarioMapStudio({
  value,
  mapUrl,
  mapFileName,
  selectedMissionId,
  onSelectedMissionIdChange,
  onChange,
  onSelectMapFile
}: ScenarioMapStudioProps) {
  const [tool, setTool] = useState<StudioTool>('SELECT');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('EDIT');
  const [previewDay, setPreviewDay] = useState(1);
  const [zoom, setZoom] = useState(60);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [query, setQuery] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{ regionId: string; index: number } | null>(null);
  const [draftRegionPoints, setDraftRegionPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingRegion, setIsDrawingRegion] = useState(false);
  const [regionGeometryUnlocked, setRegionGeometryUnlocked] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<StudioLayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [previewCompletedIds, setPreviewCompletedIds] = useState<string[]>([]);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const movedRef = useRef(false);
  const valueRef = useRef(value);
  const undoStackRef = useRef<MapGeometrySnapshot[]>([]);
  const redoStackRef = useRef<MapGeometrySnapshot[]>([]);
  const pendingHistoryRef = useRef<MapGeometrySnapshot | null>(null);

  valueRef.current = value;

  const selectedMission = value.events.find(event => event.id === selectedMissionId) ?? null;
  const selectedRegion = value.mapRegions.find(region => region.id === selectedRegionId) ?? null;
  const maxDay = Math.max(1, ...value.events.map(event => event.startDay ?? 1));
  const canUndo = historyRevision >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyRevision >= 0 && redoStackRef.current.length > 0;

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return value.events.filter(event => !normalized
      || `${event.title} ${event.region} ${event.desc}`.toLocaleLowerCase('ru').includes(normalized));
  }, [query, value.events]);

  const filteredRegions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return value.mapRegions.filter(region => !normalized
      || region.name.toLocaleLowerCase('ru').includes(normalized));
  }, [query, value.mapRegions]);

  const patch = (change: Partial<ScenarioFileData>) => {
    const next = { ...valueRef.current, ...change };
    valueRef.current = next;
    onChange(next);
  };
  const patchMission = (missionId: string, change: Partial<Mission>) => {
    patch({ events: valueRef.current.events.map(event => event.id === missionId ? { ...event, ...change } : event) });
  };
  const patchMissionPosition = (missionId: string, coords: { x: number; y: number }) => {
    const current = valueRef.current;
    const mission = current.events.find(event => event.id === missionId);
    if (!mission || mission.regionMode === 'MANUAL') {
      patchMission(missionId, coords);
      return;
    }
    const region = [...current.mapRegions].reverse().find(item => pointInPolygon(coords, item.points));
    patchMission(missionId, { ...coords, regionMode: 'AUTO', regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ' });
  };
  const patchRegion = (regionId: string, change: Partial<MapRegion>) => {
    patch({ mapRegions: valueRef.current.mapRegions.map(region => region.id === regionId ? { ...region, ...change } : region) });
  };

  const pushUndoSnapshot = (snapshot: MapGeometrySnapshot) => {
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-HISTORY_LIMIT);
    redoStackRef.current = [];
    setHistoryRevision(revision => revision + 1);
  };

  const beginGeometryChange = () => {
    if (!pendingHistoryRef.current) pendingHistoryRef.current = snapshotGeometry(valueRef.current);
  };

  const commitGeometryChange = () => {
    const before = pendingHistoryRef.current;
    pendingHistoryRef.current = null;
    if (!before) return;
    const after = snapshotGeometry(valueRef.current);
    if (geometryChanged(before, after)) pushUndoSnapshot(before);
  };

  const applyImmediateGeometryChange = (change: Partial<ScenarioFileData>) => {
    const before = snapshotGeometry(valueRef.current);
    patch(change);
    if (geometryChanged(before, snapshotGeometry(valueRef.current))) pushUndoSnapshot(before);
  };

  const undoGeometry = () => {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    const current = snapshotGeometry(valueRef.current);
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, current].slice(-HISTORY_LIMIT);
    const restored = applyGeometrySnapshot(valueRef.current, previous);
    valueRef.current = restored;
    onChange(restored);
    setSelectedVertex(null);
    setHistoryRevision(revision => revision + 1);
  };

  const redoGeometry = () => {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    const current = snapshotGeometry(valueRef.current);
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, current].slice(-HISTORY_LIMIT);
    const restored = applyGeometrySnapshot(valueRef.current, next);
    valueRef.current = restored;
    onChange(restored);
    setSelectedVertex(null);
    setHistoryRevision(revision => revision + 1);
  };

  const setStudioTool = (nextTool: StudioTool) => {
    setTool(nextTool);
    setDraftRegionPoints([]);
    setIsDrawingRegion(false);
    setSelectedVertex(null);
    if (nextTool !== 'DRAW_REGION') setRegionGeometryUnlocked(false);
    if (nextTool === 'DRAW_REGION') onSelectedMissionIdChange(null);
    if (nextTool !== 'DRAW_REGION') setSelectedRegionId(null);
  };

  const toggleLayer = (layer: StudioLayerKey) => {
    setLayerVisibility(current => ({ ...current, [layer]: !current[layer] }));
  };

  const getCoords = (clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: Math.round(clamp(((clientX - rect.left) / rect.width) * 100) * 10) / 10,
      y: Math.round(clamp(((clientY - rect.top) / rect.height) * 100) * 10) / 10
    };
  };

  const fitMap = () => {
    const container = containerRef.current;
    if (!container) return;
    const nextZoom = clamp(Math.min(
      ((container.clientWidth - 32) / Math.max(1, value.mapWidth)) * 100,
      ((container.clientHeight - 32) / Math.max(1, value.mapHeight)) * 100
    ), 20, 220);
    const width = value.mapWidth * nextZoom / 100;
    const height = value.mapHeight * nextZoom / 100;
    setZoom(nextZoom);
    setPan({ x: (container.clientWidth - width) / 2, y: (container.clientHeight - height) / 2 });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const focus = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1.12 : 0.88;
      const nextZoom = clamp(zoom * factor, 20, 300);
      const ratio = nextZoom / zoom;
      setPan(current => ({
        x: focus.x - (focus.x - current.x) * ratio,
        y: focus.y - (focus.y - current.y) * ratio
      }));
      setZoom(nextZoom);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoom]);

  useEffect(() => {
    if (!dragTarget) return;
    const onMove = (event: PointerEvent) => {
      movedRef.current = true;
      if (dragTarget.kind === 'PAN' && dragTarget.startClient && dragTarget.startPan) {
        setPan({
          x: dragTarget.startPan.x + event.clientX - dragTarget.startClient.x,
          y: dragTarget.startPan.y + event.clientY - dragTarget.startClient.y
        });
        return;
      }
      const coords = getCoords(event.clientX, event.clientY);
      if (dragTarget.kind === 'EVENT' && dragTarget.id) {
        patchMissionPosition(dragTarget.id, coords);
      }
      if (dragTarget.kind === 'HQ') patch({ hqPos: coords });
      if (dragTarget.kind === 'SPAWN_VERTEX' && dragTarget.index !== undefined) {
        patch({ spawnPolygon: valueRef.current.spawnPolygon.map((point, index) => index === dragTarget.index ? coords : point) });
      }
      if (dragTarget.kind === 'REGION_VERTEX' && dragTarget.id && dragTarget.index !== undefined) {
        const region = valueRef.current.mapRegions.find(item => item.id === dragTarget.id);
        if (region) patchRegion(region.id, { points: region.points.map((point, index) => index === dragTarget.index ? coords : point) });
      }
      if (dragTarget.kind === 'REGION_LABEL' && dragTarget.id) patchRegion(dragTarget.id, { labelPosition: coords });
    };
    const onUp = () => {
      if (dragTarget.kind !== 'PAN') commitGeometryChange();
      setDragTarget(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const undoRequested = event.ctrlKey && !event.shiftKey && event.key.toLocaleLowerCase() === 'z';
      const redoRequested = event.ctrlKey && (event.key.toLocaleLowerCase() === 'y'
        || (event.shiftKey && event.key.toLocaleLowerCase() === 'z'));
      if (undoRequested && isDrawingRegion && draftRegionPoints.length > 0) {
        event.preventDefault();
        setDraftRegionPoints(points => points.slice(0, -1));
        return;
      }
      if (undoRequested) {
        event.preventDefault();
        undoGeometry();
        return;
      }
      if (redoRequested) {
        event.preventDefault();
        redoGeometry();
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        fitMap();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom(current => clamp(current * 1.15, 20, 300));
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom(current => clamp(current * 0.85, 20, 300));
        return;
      }
      if (event.key === 'Escape') {
        setStudioTool('SELECT');
        setRegionGeometryUnlocked(false);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedVertex && tool === 'DRAW_REGION' && regionGeometryUnlocked) {
        const region = valueRef.current.mapRegions.find(item => item.id === selectedVertex.regionId);
        if (!region || region.points.length <= 3) return;
        event.preventDefault();
        const before = snapshotGeometry(valueRef.current);
        patchRegion(region.id, { points: region.points.filter((_, index) => index !== selectedVertex.index) });
        pushUndoSnapshot(before);
        setSelectedVertex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draftRegionPoints.length, isDrawingRegion, regionGeometryUnlocked, selectedVertex, tool]);

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-map-control]')) return;
    const coords = getCoords(event.clientX, event.clientY);
    const current = valueRef.current;

    if (tool === 'ADD_EVENT') {
      const created = createScenarioMission(previewDay, current.events.map(item => item.id));
      const region = [...current.mapRegions].reverse().find(item => pointInPolygon(coords, item.points));
      const mission = { ...created, ...coords, regionMode: 'AUTO' as const, regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ', startDay: previewDay };
      patch({ events: [...current.events, mission] });
      onSelectedMissionIdChange(mission.id);
      return;
    }
    if (tool === 'DRAW_REGION') {
      if (isDrawingRegion) {
        setDraftRegionPoints(points => [...points, coords]);
        return;
      }
      if (!layerVisibility.regions) return;
      const region = [...current.mapRegions].reverse().find(item => pointInPolygon(coords, item.points));
      setSelectedRegionId(region?.id ?? null);
      setSelectedVertex(null);
      onSelectedMissionIdChange(null);
      return;
    }
    if (tool === 'SPAWN') {
      if (!layerVisibility.spawn) return;
      applyImmediateGeometryChange({ spawnPolygon: [...current.spawnPolygon, coords] });
      return;
    }
    if (tool === 'HQ') {
      if (!layerVisibility.hq) return;
      applyImmediateGeometryChange({ hqPos: coords });
      setStudioTool('SELECT');
      return;
    }
    onSelectedMissionIdChange(null);
    setSelectedRegionId(null);
  };

  const finishRegion = () => {
    if (draftRegionPoints.length < 3) return;
    const current = valueRef.current;
    const base = createMapRegion(current.mapRegions.length, getRegionCenter(draftRegionPoints));
    const region = { ...base, points: draftRegionPoints, labelPosition: getRegionCenter(draftRegionPoints) };
    applyImmediateGeometryChange({ mapRegions: [...current.mapRegions, region] });
    setSelectedRegionId(region.id);
    setDraftRegionPoints([]);
    setIsDrawingRegion(false);
    setRegionGeometryUnlocked(false);
  };

  const visibleRegions = value.mapRegions.filter(region => previewMode !== 'PLAYER' || region.visibleToPlayers);
  const completedPreviewSet = new Set(previewCompletedIds);
  const visibleEvents = (layerVisibility.events ? value.events : []).filter(event => {
    if (previewMode === 'EDIT') return true;
    if ((event.startDay ?? 1) > previewDay) return false;
    if (completedPreviewSet.has(event.id)) return false;
    const lifespan = event.maxLifespan ?? event.lifespan;
    if (lifespan !== null && previewDay >= (event.startDay ?? 1) + lifespan) return false;
    const prerequisites = event.prerequisiteMissionIds ?? [];
    if (prerequisites.length === 0) return true;
    return (event.prerequisiteMode ?? 'ALL') === 'ANY'
      ? prerequisites.some(id => completedPreviewSet.has(id))
      : prerequisites.every(id => completedPreviewSet.has(id));
  });
  const visibleEventIds = new Set(visibleEvents.map(event => event.id));
  const selectedLinks = layerVisibility.events && previewMode !== 'PLAYER' && selectedMission && (previewMode === 'EDIT' || visibleEventIds.has(selectedMission.id))
    ? value.events.filter(event => (selectedMission.prerequisiteMissionIds ?? []).includes(event.id)
      || (event.prerequisiteMissionIds ?? []).includes(selectedMission.id)).filter(event => previewMode === 'EDIT' || visibleEventIds.has(event.id))
    : [];

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-emerald-500/20 bg-[#080b09] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-500">Студия кампании</p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-100">Интерактивная карта сценария</h2>
            <p className="mt-1 text-xs text-neutral-500">{mapFileName} · {value.mapWidth}×{value.mapHeight} · {value.events.length} событий · {value.mapRegions.length} регионов</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ModeButton active={previewMode === 'EDIT'} onClick={() => setPreviewMode('EDIT')} icon={<MousePointer2 className="h-3.5 w-3.5" />} label="Редактор" />
            <ModeButton active={previewMode === 'GM'} onClick={() => { setPreviewMode('GM'); setStudioTool('SELECT'); }} icon={<Shield className="h-3.5 w-3.5" />} label="ГМ" />
            <ModeButton active={previewMode === 'PLAYER'} onClick={() => { setPreviewMode('PLAYER'); setStudioTool('SELECT'); }} icon={<Eye className="h-3.5 w-3.5" />} label="Игрок" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border border-emerald-500/15 bg-black">
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-[#0b0b0b] p-3">
            <ToolButton active={tool === 'SELECT'} disabled={previewMode !== 'EDIT'} onClick={() => setStudioTool('SELECT')} icon={<MousePointer2 />} label="Выбор" />
            <ToolButton active={tool === 'ADD_EVENT'} disabled={previewMode !== 'EDIT'} onClick={() => setStudioTool(tool === 'ADD_EVENT' ? 'SELECT' : 'ADD_EVENT')} icon={<Plus />} label="Событие" />
            <ToolButton active={tool === 'DRAW_REGION'} disabled={previewMode !== 'EDIT'} onClick={() => setStudioTool(tool === 'DRAW_REGION' ? 'SELECT' : 'DRAW_REGION')} icon={<Pentagon />} label="Регион" />
            <ToolButton active={tool === 'SPAWN'} disabled={previewMode !== 'EDIT'} onClick={() => setStudioTool(tool === 'SPAWN' ? 'SELECT' : 'SPAWN')} icon={<Focus />} label="Область донесений" />
            <ToolButton active={tool === 'HQ'} disabled={previewMode !== 'EDIT'} onClick={() => setStudioTool(tool === 'HQ' ? 'SELECT' : 'HQ')} icon={<Shield />} label="Штаб" />
            <span className="mx-1 h-6 w-px bg-neutral-800" />
            <button type="button" disabled={!canUndo} onClick={undoGeometry} className="map-toolbar-button disabled:cursor-not-allowed disabled:opacity-25" title="Отменить изменение карты (Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
            <button type="button" disabled={!canRedo} onClick={redoGeometry} className="map-toolbar-button disabled:cursor-not-allowed disabled:opacity-25" title="Повторить изменение карты (Ctrl+Shift+Z / Ctrl+Y)"><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setLayersOpen(open => !open)} className={`map-toolbar-button ${layersOpen ? 'border-sky-500/60 text-sky-300' : ''}`} title="Слои карты"><Layers className="h-4 w-4" /></button>
            <span className="mx-1 h-6 w-px bg-neutral-800" />
            <button type="button" onClick={() => setZoom(current => clamp(current * 0.85, 20, 300))} className="map-toolbar-button" title="Уменьшить"><ZoomOut className="h-4 w-4" /></button>
            <span className="min-w-12 text-center font-mono text-[10px] text-neutral-500">{Math.round(zoom)}%</span>
            <button type="button" onClick={() => setZoom(current => clamp(current * 1.15, 20, 300))} className="map-toolbar-button" title="Увеличить"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={fitMap} className="map-toolbar-button" title="Вписать карту"><MapIcon className="h-4 w-4" /></button>
            <button type="button" onClick={() => mapInputRef.current?.click()} className="ml-auto flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-2 font-mono text-[9px] uppercase text-neutral-300 hover:border-emerald-500/50 hover:text-emerald-300"><Upload className="h-3.5 w-3.5" /> Другая карта</button>
            <input ref={mapInputRef} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onSelectMapFile(file); event.currentTarget.value = ''; }} />
          </div>

          {layersOpen && (
            <div className="grid gap-2 border-b border-neutral-800 bg-[#080a09] p-3 sm:grid-cols-2 xl:grid-cols-3">
              <LayerToggle label="События" visible={layerVisibility.events} locked={previewMode !== 'EDIT' || tool !== 'ADD_EVENT'} onToggle={() => toggleLayer('events')} />
              <LayerToggle label="Регионы" visible={layerVisibility.regions} locked={previewMode !== 'EDIT' || tool !== 'DRAW_REGION' || !regionGeometryUnlocked} onToggle={() => toggleLayer('regions')} />
              <LayerToggle label="Названия регионов" visible={layerVisibility.regionLabels} locked={previewMode !== 'EDIT' || tool !== 'DRAW_REGION' || !regionGeometryUnlocked} onToggle={() => toggleLayer('regionLabels')} />
              <LayerToggle label="Область донесений" visible={layerVisibility.spawn} locked={previewMode !== 'EDIT' || tool !== 'SPAWN'} onToggle={() => toggleLayer('spawn')} />
              <LayerToggle label="Штаб" visible={layerVisibility.hq} locked={previewMode !== 'EDIT' || tool !== 'HQ'} onToggle={() => toggleLayer('hq')} />
              <LayerToggle label="Атмосферные эффекты" visible={layerVisibility.effects} locked onToggle={() => toggleLayer('effects')} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-900 bg-black/80 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-emerald-500" />
            <span className="font-mono text-[10px] uppercase text-neutral-500">Предпросмотр дня</span>
            <input type="range" min={1} max={Math.max(12, maxDay)} value={previewDay} onChange={event => setPreviewDay(Number(event.target.value))} className="w-48 accent-emerald-500" />
            <input type="number" min={1} value={previewDay} onChange={event => setPreviewDay(Math.max(1, Number(event.target.value) || 1))} className="w-16 rounded border border-neutral-800 bg-black px-2 py-1 text-center font-mono text-xs text-neutral-200" />
            <span className="ml-auto text-[10px] text-neutral-600">
              {tool === 'SELECT' && 'Безопасный режим: объекты можно выбирать, но нельзя перемещать'}
              {tool === 'ADD_EVENT' && 'Режим добавления включён: нажимайте на карту'}
              {tool === 'DRAW_REGION' && isDrawingRegion && `Новый регион: ${draftRegionPoints.length} вершин`}
              {tool === 'DRAW_REGION' && !isDrawingRegion && !regionGeometryUnlocked && 'Щёлкните внутри региона, чтобы выбрать его; геометрия заблокирована'}
              {tool === 'DRAW_REGION' && !isDrawingRegion && regionGeometryUnlocked && 'Геометрия выбранного региона разблокирована'}
              {tool === 'SPAWN' && 'Нажатие добавляет вершину области; существующие вершины можно перетаскивать'}
              {tool === 'HQ' && 'Выберите новое положение штаба'}
            </span>
            {previewCompletedIds.length > 0 && <button type="button" onClick={() => setPreviewCompletedIds([])} className="rounded border border-neutral-800 px-2 py-1 font-mono text-[9px] uppercase text-neutral-500 hover:text-neutral-200">Сбросить выполненные ({previewCompletedIds.length})</button>}
            {tool === 'DRAW_REGION' && !isDrawingRegion && (
              <>
                <button type="button" onClick={() => { setIsDrawingRegion(true); setDraftRegionPoints([]); setRegionGeometryUnlocked(false); setSelectedRegionId(null); }} className="flex items-center gap-1 rounded border border-sky-500/40 px-2 py-1 text-[10px] text-sky-300"><Plus className="h-3 w-3" /> Новый регион</button>
                {selectedRegion && <button type="button" onClick={() => { setRegionGeometryUnlocked(unlocked => !unlocked); setSelectedVertex(null); }} className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${regionGeometryUnlocked ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' : 'border-neutral-700 text-neutral-400'}`}>{regionGeometryUnlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {regionGeometryUnlocked ? 'Заблокировать вершины' : 'Разблокировать вершины'}</button>}
              </>
            )}
            {tool === 'DRAW_REGION' && isDrawingRegion && (
              <>
                <button type="button" disabled={draftRegionPoints.length < 3} onClick={finishRegion} className="flex items-center gap-1 rounded border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-300 disabled:opacity-30"><Check className="h-3 w-3" /> Завершить</button>
                <button type="button" onClick={() => { setDraftRegionPoints([]); setIsDrawingRegion(false); }} className="rounded border border-rose-500/30 p-1 text-rose-400" title="Отменить создание региона"><X className="h-3 w-3" /></button>
              </>
            )}
          </div>

          <div
            ref={containerRef}
            className={`relative h-[72vh] min-h-[620px] overflow-hidden bg-[#050505] ${dragTarget?.kind === 'PAN' ? 'cursor-grabbing' : tool === 'SELECT' ? 'cursor-default' : 'cursor-crosshair'}`}
            onPointerDown={event => {
              const panRequested = event.button === 1 || event.button === 2;
              if (!panRequested || (event.target as HTMLElement).closest('[data-map-control]')) return;
              event.preventDefault();
              movedRef.current = false;
              setDragTarget({ kind: 'PAN', startClient: { x: event.clientX, y: event.clientY }, startPan: pan });
            }}
            onContextMenu={event => event.preventDefault()}
            onClick={handleMapClick}
          >
            <div
              ref={mapRef}
              className="absolute origin-top-left select-none overflow-hidden shadow-2xl ring-1 ring-emerald-500/20"
              style={{
                width: value.mapWidth * zoom / 100,
                height: value.mapHeight * zoom / 100,
                transform: `translate(${pan.x}px, ${pan.y}px)`
              }}
              onDragStart={event => event.preventDefault()}
            >
              <img src={mapUrl} alt="Карта сценария" className="absolute inset-0 h-full w-full object-fill" draggable={false} />

              {visibleRegions.map(region => (
                <div key={`region-fill-${region.id}`} className="pointer-events-none absolute inset-0">
                  {layerVisibility.regions && region.showFill && <div className="absolute inset-0" style={{ clipPath: getRegionClipPath(region.points), backgroundColor: region.color, opacity: region.fillOpacity }} />}
                  {layerVisibility.effects && value.mapEffectsEnabled && region.fog.enabled && (
                    <div className="region-fog-mask absolute inset-0 overflow-hidden" style={{ clipPath: getRegionClipPath(region.points), opacity: region.fog.opacity ?? getFogOpacity(region.fog.density) }}>
                      <video className="region-fog-video" src="/effects/AmbientFog001_001_Loop_White_1200x1200.webm" autoPlay muted loop playsInline preload="auto" onCanPlay={event => { void event.currentTarget.play().catch(() => undefined); }} />
                    </div>
                  )}
                </div>
              ))}

              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {layerVisibility.regions && visibleRegions.map(region => region.showBoundary && (
                  <polygon key={`region-border-${region.id}`} points={region.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={region.color} strokeOpacity={region.borderOpacity} strokeWidth={selectedRegionId === region.id ? 0.55 : 0.32} strokeDasharray="1.2 0.8" />
                ))}
                {previewMode === 'EDIT' && layerVisibility.spawn && <polygon points={value.spawnPolygon.map(point => `${point.x},${point.y}`).join(' ')} fill="rgba(245,158,11,0.08)" stroke="#f59e0b" strokeWidth="0.35" strokeDasharray="1 0.7" />}
                {isDrawingRegion && draftRegionPoints.length > 0 && <polyline points={draftRegionPoints.map(point => `${point.x},${point.y}`).join(' ')} fill="rgba(16,185,129,0.12)" stroke="#34d399" strokeWidth="0.45" strokeDasharray="1 0.6" />}
                {selectedMission && selectedLinks.map(link => (
                  <line key={`link-${link.id}`} x1={selectedMission.x} y1={selectedMission.y} x2={link.x} y2={link.y} stroke="#fbbf24" strokeWidth="0.35" strokeDasharray="1 0.7" />
                ))}
              </svg>

              {layerVisibility.regionLabels && visibleRegions.map(region => region.showLabel && (
                <button
                  type="button"
                  data-map-control
                  key={`region-label-${region.id}`}
                  onClick={event => { event.stopPropagation(); setSelectedRegionId(region.id); onSelectedMissionIdChange(null); }}
                  onPointerDown={event => {
                    if (previewMode !== 'EDIT' || tool !== 'DRAW_REGION' || !regionGeometryUnlocked || selectedRegionId !== region.id) return;
                    event.stopPropagation();
                    movedRef.current = false;
                    beginGeometryChange();
                    setDragTarget({ kind: 'REGION_LABEL', id: region.id });
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded border bg-black/75 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider shadow ${selectedRegionId === region.id ? 'border-white text-white' : 'border-black/50 text-neutral-100'}`}
                  style={{ left: `${region.labelPosition.x}%`, top: `${region.labelPosition.y}%`, color: region.color, pointerEvents: previewMode !== 'EDIT' || tool === 'SELECT' || tool === 'DRAW_REGION' ? 'auto' : 'none' }}
                >{region.name}</button>
              ))}

              {previewMode === 'EDIT' && tool === 'DRAW_REGION' && layerVisibility.regions && regionGeometryUnlocked && selectedRegion && selectedRegion.points.map((point, index) => (
                <button
                  type="button"
                  data-map-control
                  key={`region-vertex-${selectedRegion.id}-${index}`}
                  onPointerDown={event => { event.stopPropagation(); movedRef.current = false; beginGeometryChange(); setSelectedVertex({ regionId: selectedRegion.id, index }); setDragTarget({ kind: 'REGION_VERTEX', id: selectedRegion.id, index }); }}
                  className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ${selectedVertex?.regionId === selectedRegion.id && selectedVertex.index === index ? 'border-white ring-2 ring-white/50' : 'border-black'}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: selectedRegion.color }}
                  title={`${selectedRegion.name}: вершина ${index + 1}`}
                />
              ))}

              {previewMode === 'EDIT' && tool === 'SPAWN' && layerVisibility.spawn && value.spawnPolygon.map((point, index) => (
                <button
                  type="button"
                  data-map-control
                  key={`spawn-${index}`}
                  onPointerDown={event => { event.stopPropagation(); movedRef.current = false; beginGeometryChange(); setDragTarget({ kind: 'SPAWN_VERTEX', index }); }}
                  onDoubleClick={event => {
                    event.stopPropagation();
                    pendingHistoryRef.current = null;
                    if (valueRef.current.spawnPolygon.length > 3) applyImmediateGeometryChange({ spawnPolygon: valueRef.current.spawnPolygon.filter((_, itemIndex) => itemIndex !== index) });
                  }}
                  className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-amber-400 shadow"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title="Вершина области донесений · двойной щелчок удаляет"
                />
              ))}

              {layerVisibility.hq && <button
                type="button"
                data-map-control
                onPointerDown={event => {
                  if (previewMode !== 'EDIT' || tool !== 'HQ') return;
                  event.stopPropagation();
                  movedRef.current = false;
                  beginGeometryChange();
                  setDragTarget({ kind: 'HQ' });
                }}
                className="absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400 bg-black text-amber-300 shadow-lg"
                style={{ left: `${value.hqPos?.x ?? 50}%`, top: `${value.hqPos?.y ?? 50}%`, pointerEvents: previewMode === 'EDIT' && tool !== 'HQ' ? 'none' : 'auto' }}
                title="Штаб Гильдии"
              ><Shield className="h-4 w-4" /></button>}

              {visibleEvents.map(mission => {
                const presentation = getMissionPresentation(mission, previewDay, previewMode !== 'PLAYER');
                const color = TYPE_COLORS[presentation.visibleType];
                const selected = mission.id === selectedMissionId;
                const future = (mission.startDay ?? 1) > previewDay;
                const locked = (mission.prerequisiteMissionIds ?? []).length > 0;
                return (
                  <button
                    type="button"
                    data-map-control
                    key={mission.id}
                    onClick={event => { event.stopPropagation(); onSelectedMissionIdChange(mission.id); setSelectedRegionId(null); }}
                    onPointerDown={event => {
                      if (previewMode !== 'EDIT' || tool !== 'ADD_EVENT') return;
                      event.stopPropagation();
                      movedRef.current = false;
                      beginGeometryChange();
                      setDragTarget({ kind: 'EVENT', id: mission.id });
                    }}
                    className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 ${previewMode === 'EDIT' && (future || locked) ? 'opacity-55' : ''}`}
                    style={{ left: `${mission.x}%`, top: `${mission.y}%`, pointerEvents: previewMode === 'EDIT' && tool !== 'SELECT' && tool !== 'ADD_EVENT' ? 'none' : 'auto' }}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-black shadow-lg transition group-hover:scale-110" style={{ borderColor: color, color, boxShadow: selected ? `0 0 0 4px ${color}55` : undefined }}>
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <span className={`pointer-events-none absolute left-1/2 top-8 min-w-max -translate-x-1/2 rounded border border-neutral-700 bg-black/90 px-2 py-1 text-[9px] text-neutral-200 shadow-xl ${selected ? 'block' : 'hidden group-hover:block'}`}>
                      {mission.title} · день {mission.startDay ?? 1}
                    </span>
                  </button>
                );
              })}

              {isDrawingRegion && draftRegionPoints.map((point, index) => <span key={`draft-${index}`} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-emerald-400" style={{ left: `${point.x}%`, top: `${point.y}%` }} />)}
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Событие или регион..." className="editor-input pl-9" />
          </label>

          {tool !== 'DRAW_REGION' && <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {filteredEvents.map(event => (
              <button type="button" key={event.id} onClick={() => { onSelectedMissionIdChange(event.id); setSelectedRegionId(null); }} className={`w-full rounded border p-2 text-left ${selectedMissionId === event.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-neutral-800 bg-black/30 hover:border-neutral-700'}`}>
                <span className="block truncate text-xs text-neutral-200">{event.title}</span>
                <span className="mt-1 block font-mono text-[9px] uppercase text-neutral-600">День {event.startDay ?? 1} · {eventTypeLabel(event.type)} · {event.region}</span>
              </button>
            ))}
          </div>}

          {selectedMission && (
            <div className="space-y-3 border-t border-neutral-800 pt-4">
              <p className="font-mono text-[10px] uppercase text-emerald-500">Выбранное событие</p>
              <Field label="Название"><input value={selectedMission.title} onChange={event => patchMission(selectedMission.id, { title: event.target.value })} className="editor-input" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="День"><input type="number" min={1} value={selectedMission.startDay ?? 1} onChange={event => patchMission(selectedMission.id, { startDay: Math.max(1, Number(event.target.value) || 1) })} className="editor-input" /></Field>
                <Field label="Тип"><select value={selectedMission.type} onChange={event => patchMission(selectedMission.id, { type: event.target.value as MissionType })} className="editor-input"><option value="OPERATION">Операция</option><option value="STORY">Сюжетная</option><option value="DUMMY">Пустышка</option></select></Field>
              </div>
              <Field label="Регион"><select value={selectedMission.regionMode ?? 'MANUAL'} onChange={event => {
                const regionMode = event.target.value as 'AUTO' | 'MANUAL';
                if (regionMode === 'MANUAL') patchMission(selectedMission.id, { regionMode });
                else {
                  const region = [...value.mapRegions].reverse().find(item => pointInPolygon(selectedMission, item.points));
                  patchMission(selectedMission.id, { regionMode, regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ' });
                }
              }} className="editor-input mb-2"><option value="AUTO">Автоматически по точке</option><option value="MANUAL">Указать вручную</option></select><input value={selectedMission.region} readOnly={(selectedMission.regionMode ?? 'MANUAL') === 'AUTO'} onChange={event => patchMission(selectedMission.id, { region: event.target.value, regionId: undefined })} className="editor-input read-only:opacity-60" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="X, %"><input type="number" min={0} max={100} value={selectedMission.x} onChange={event => patchMissionPosition(selectedMission.id, { x: clamp(Number(event.target.value) || 0), y: selectedMission.y })} className="editor-input" /></Field>
                <Field label="Y, %"><input type="number" min={0} max={100} value={selectedMission.y} onChange={event => patchMissionPosition(selectedMission.id, { x: selectedMission.x, y: clamp(Number(event.target.value) || 0) })} className="editor-input" /></Field>
              </div>
              <Toggle
                checked={previewCompletedIds.includes(selectedMission.id)}
                onChange={completed => setPreviewCompletedIds(current => completed ? [...new Set([...current, selectedMission.id])] : current.filter(id => id !== selectedMission.id))}
                label="Считать выполненным в предпросмотре"
              />
              <p className="text-[10px] leading-relaxed text-neutral-600">Все этапы, зависимости, награды, особые предметы и осложнения редактируются во вкладке «События». Выбор синхронизирован с маркером.</p>
            </div>
          )}

          {selectedRegion && (
            <div className="space-y-3 border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase text-sky-400">Выбранный регион</p>
                <button type="button" onClick={() => { setSelectedRegionId(null); setSelectedVertex(null); setRegionGeometryUnlocked(false); }} className="rounded border border-neutral-800 p-1 text-neutral-500 hover:text-neutral-200" title="Вернуться к списку регионов"><X className="h-3 w-3" /></button>
              </div>
              <Field label="Название"><input value={selectedRegion.name} onChange={event => patchRegion(selectedRegion.id, { name: event.target.value })} className="editor-input" /></Field>
              <Field label="Цвет"><input type="color" value={selectedRegion.color} onChange={event => patchRegion(selectedRegion.id, { color: event.target.value })} className="h-10 w-full rounded border border-neutral-800 bg-black p-1" /></Field>
              <Toggle checked={selectedRegion.visibleToPlayers} onChange={visibleToPlayers => patchRegion(selectedRegion.id, { visibleToPlayers })} label="Виден игрокам" />
              <Toggle checked={selectedRegion.showBoundary} onChange={showBoundary => patchRegion(selectedRegion.id, { showBoundary })} label="Показывать границу" />
              <Toggle checked={selectedRegion.showLabel} onChange={showLabel => patchRegion(selectedRegion.id, { showLabel })} label="Показывать название" />
              <Toggle checked={selectedRegion.showFill} onChange={showFill => patchRegion(selectedRegion.id, { showFill })} label="Показывать заливку" />
              <Toggle checked={selectedRegion.fog.enabled} onChange={enabled => patchRegion(selectedRegion.id, { fog: { ...selectedRegion.fog, enabled } })} label="Атмосферный туман" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Плотность"><select value={selectedRegion.fog.density} onChange={event => { const density = event.target.value as MapRegion['fog']['density']; patchRegion(selectedRegion.id, { fog: { ...selectedRegion.fog, density, opacity: getFogOpacity(density) } }); }} className="editor-input"><option value="LOW">Слабый</option><option value="MEDIUM">Средний</option><option value="DENSE">Плотный</option></select></Field>
                <Field label="Скорость"><select value={selectedRegion.fog.speed} onChange={event => patchRegion(selectedRegion.id, { fog: { ...selectedRegion.fog, speed: event.target.value as MapRegion['fog']['speed'] } })} className="editor-input"><option value="SLOW">Медленно</option><option value="NORMAL">Обычно</option><option value="FAST">Быстро</option></select></Field>
              </div>
              <Field label={`Прозрачность · ${Math.round((selectedRegion.fog.opacity ?? getFogOpacity(selectedRegion.fog.density)) * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={selectedRegion.fog.opacity ?? getFogOpacity(selectedRegion.fog.density)} onChange={event => patchRegion(selectedRegion.id, { fog: { ...selectedRegion.fog, opacity: Number(event.target.value) } })} className="w-full accent-emerald-500" /></Field>
            </div>
          )}

          {!selectedMission && !selectedRegion && tool === 'DRAW_REGION' && (
            <div className="space-y-2 border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase text-sky-400">Регионы · {filteredRegions.length}</p>
                <span className="text-[9px] text-neutral-600">Выберите из списка или на карте</span>
              </div>
              <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                {filteredRegions.map(region => (
                  <button type="button" key={region.id} onClick={() => { setSelectedRegionId(region.id); setSelectedVertex(null); }} className="flex w-full items-center gap-2 rounded border border-neutral-800 bg-black/30 p-2 text-left hover:border-sky-500/40">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: region.color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{region.name}</span>
                    {region.visibleToPlayers ? <Eye className="h-3.5 w-3.5 text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5 text-neutral-600" />}
                  </button>
                ))}
                {filteredRegions.length === 0 && <p className="rounded border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-600">По фильтру регионы не найдены.</p>}
              </div>
            </div>
          )}

          {!selectedMission && !selectedRegion && tool !== 'DRAW_REGION' && <div className="rounded border border-dashed border-neutral-800 p-5 text-center text-xs leading-relaxed text-neutral-600">Режим «Выбор» безопасен: объекты можно выделять, но нельзя случайно переместить. Для редактирования выберите отдельный инструмент.</div>}
        </aside>
      </div>
    </section>
  );
}

function ToolButton({ active, disabled = false, onClick, icon, label }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex items-center gap-1.5 rounded border px-2.5 py-2 font-mono text-[9px] uppercase transition disabled:cursor-not-allowed disabled:opacity-30 ${active ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-neutral-800 text-neutral-500 hover:text-neutral-200'}`}>{<span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}{label}</button>;
}

function LayerToggle({ label, visible, locked, onToggle }: { label: string; visible: boolean; locked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded border border-neutral-800 bg-black/35 px-2 py-1.5">
      <button type="button" onClick={onToggle} className={`rounded p-1 ${visible ? 'text-sky-300' : 'text-neutral-600'}`} title={visible ? `Скрыть слой «${label}»` : `Показать слой «${label}»`}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-300">{label}</span>
      <span className={`flex items-center gap-1 font-mono text-[8px] uppercase ${locked ? 'text-neutral-600' : 'text-amber-300'}`} title={locked ? 'Слой защищён от изменений' : 'Слой доступен активному инструменту'}>
        {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        {locked ? 'защищён' : 'активен'}
      </span>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded border px-3 py-2 font-mono text-[9px] uppercase ${active ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-neutral-800 text-neutral-500'}`}>{icon}{label}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-600">{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-3 py-2 text-[10px] ${checked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-neutral-800 text-neutral-500'}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="accent-emerald-500" /></label>;
}
