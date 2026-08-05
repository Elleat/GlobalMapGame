import { Focus, GitBranch, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Mission, ScenarioChain } from '../../types';

interface ScenarioGraphEditorProps {
  events: Mission[];
  chains: ScenarioChain[];
  selectedMissionId: string | null;
  onSelectedMissionIdChange: (id: string | null) => void;
  onOpenMission?: (id: string) => void;
  onChange: (events: Mission[]) => void;
}

const NODE_WIDTH = 224;
const NODE_HEIGHT = 90;
const COLUMN_PITCH = 304;
const ROW_PITCH = 118;
const TYPE_BORDER: Record<Mission['type'], string> = { OPERATION: '#10b981', STORY: '#8b5cf6', DUMMY: '#a3a3a3' };

function defaultPositions(events: Mission[], chains: ScenarioChain[]) {
  const byDay = new Map<number, Mission[]>();
  events.forEach(event => {
    const day = event.startDay ?? 1;
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  });
  const chainOrder = new Map(chains.map((chain, index) => [chain.id, index]));
  const typeOrder: Record<Mission['type'], number> = { STORY: 0, OPERATION: 1, DUMMY: 2 };
  const result = new Map<string, { x: number; y: number }>();
  [...byDay.entries()].sort((a, b) => a[0] - b[0]).forEach(([, dayEvents], dayIndex) => {
    dayEvents.sort((a, b) => {
      const aChain = Math.min(...(a.chainIds ?? []).map(id => chainOrder.get(id) ?? chains.length), chains.length + 1);
      const bChain = Math.min(...(b.chainIds ?? []).map(id => chainOrder.get(id) ?? chains.length), chains.length + 1);
      return aChain - bChain
        || typeOrder[a.type] - typeOrder[b.type]
        || (a.quotaPriority ?? 0) - (b.quotaPriority ?? 0)
        || a.title.localeCompare(b.title, 'ru');
    });
    dayEvents.forEach((event, index) => result.set(event.id, { x: 52 + dayIndex * COLUMN_PITCH, y: 72 + index * ROW_PITCH }));
  });
  return result;
}

function savedLayoutIsReadable(events: Mission[]) {
  if (!events.every(event => event.graphPosition && Number.isFinite(event.graphPosition.x) && Number.isFinite(event.graphPosition.y))) return false;
  let collisions = 0;
  for (let index = 0; index < events.length; index += 1) {
    const first = events[index].graphPosition!;
    for (let candidateIndex = index + 1; candidateIndex < events.length; candidateIndex += 1) {
      const second = events[candidateIndex].graphPosition!;
      if (Math.abs(first.x - second.x) < NODE_WIDTH + 12 && Math.abs(first.y - second.y) < NODE_HEIGHT + 12) {
        collisions += 1;
        if (collisions > Math.max(2, Math.floor(events.length * 0.01))) return false;
      }
    }
  }
  return true;
}

function chainBackground(event: Mission, chains: ScenarioChain[]): string {
  const colors = (event.chainIds ?? []).map(id => chains.find(chain => chain.id === id)?.color).filter((color): color is string => Boolean(color));
  if (colors.length === 0) return 'rgba(10,10,10,0.96)';
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}55, rgba(8,8,8,0.96) 78%)`;
  const segment = 100 / colors.length;
  return `linear-gradient(135deg, ${colors.map((color, index) => `${color}70 ${index * segment}% ${(index + 1) * segment}%`).join(', ')})`;
}

export default function ScenarioGraphEditor({ events, chains, selectedMissionId, onSelectedMissionIdChange, onOpenMission, onChange }: ScenarioGraphEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<null | { kind: 'PAN'; x: number; y: number; pan: { x: number; y: number } } | { kind: 'NODE'; id: string; dx: number; dy: number }>(null);
  const automatic = useMemo(() => defaultPositions(events, chains), [events, chains]);
  const useSavedLayout = useMemo(() => savedLayoutIsReadable(events), [events]);
  const positions = useMemo(() => new Map(events.map(event => [event.id, useSavedLayout ? event.graphPosition! : automatic.get(event.id) ?? { x: 40, y: 40 }])), [events, automatic, useSavedLayout]);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const days = useMemo(() => [...new Set(events.map(event => event.startDay ?? 1))].sort((a, b) => a - b), [events]);
  const relatedMissionIds = useMemo(() => {
    if (!selectedMissionId) return new Set<string>();
    const selected = events.find(event => event.id === selectedMissionId);
    return new Set([
      selectedMissionId,
      ...(selected?.prerequisiteMissionIds ?? []),
      ...events.filter(event => event.prerequisiteMissionIds?.includes(selectedMissionId)).map(event => event.id),
    ]);
  }, [events, selectedMissionId]);
  const canvasWidth = Math.max(1800, ...[...positions.values()].map(position => position.x + NODE_WIDTH + 80));
  const canvasHeight = Math.max(1000, ...[...positions.values()].map(position => position.y + NODE_HEIGHT + 80));

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      if (drag.kind === 'PAN') {
        setPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y });
        return;
      }
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const graphPosition = { x: (event.clientX - viewport.left - pan.x) / zoom - drag.dx, y: (event.clientY - viewport.top - pan.y) / zoom - drag.dy };
      onChange(events.map(item => ({ ...item, graphPosition: item.id === drag.id ? graphPosition : positions.get(item.id) })));
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag, events, onChange, pan, positions, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.max(0.15, Math.min(1.5, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      const rect = viewport.getBoundingClientRect();
      const focus = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const ratio = next / zoom;
      setPan(current => ({ x: focus.x - (focus.x - current.x) * ratio, y: focus.y - (focus.y - current.y) * ratio }));
      setZoom(next);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [zoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Home') {
        event.preventDefault();
        fit();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom(value => Math.min(1.5, value + 0.1));
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom(value => Math.max(0.15, value - 0.1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const autoLayout = () => onChange(events.map(event => ({ ...event, graphPosition: automatic.get(event.id) })));
  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(0.15, Math.min(1, Math.min((viewport.clientWidth - 40) / canvasWidth, (viewport.clientHeight - 40) / canvasHeight)));
    setZoom(next);
    setPan({ x: 20, y: 20 });
  };

  return <section className="space-y-3 rounded-xl border border-emerald-500/20 bg-[#080a09] p-4">
    <div className="flex flex-wrap items-center gap-2">
      <GitBranch className="h-4 w-4 text-emerald-400" /><strong className="font-mono text-xs uppercase text-emerald-300">Граф кампании · {events.length}</strong>
      <label className="relative ml-auto min-w-64"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск в графе" className="editor-input pl-8" /></label>
      <button type="button" onClick={() => setZoom(value => Math.max(0.15, value - 0.1))} className="map-toolbar-button"><ZoomOut className="h-4 w-4" /></button><span className="w-12 text-center font-mono text-[10px] text-neutral-500">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => Math.min(1.5, value + 0.1))} className="map-toolbar-button"><ZoomIn className="h-4 w-4" /></button>
      <button type="button" onClick={fit} className="map-toolbar-button" title="Вписать граф"><Focus className="h-4 w-4" /></button>
      <button type="button" onClick={autoLayout} className="rounded border border-emerald-500/30 px-3 py-2 font-mono text-[9px] uppercase text-emerald-300">Разложить по дням</button>
    </div>
    <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase text-neutral-500"><span className="border-l-4 border-emerald-500 pl-1">Операция</span><span className="border-l-4 border-violet-500 pl-1">Сюжетная</span><span className="border-l-4 border-neutral-400 pl-1">Пустышка</span>{chains.map(chain => <span key={chain.id} className="rounded px-1.5 py-0.5 text-white" style={{ backgroundColor: `${chain.color}88` }}>{chain.name}</span>)}</div>
    <div ref={viewportRef} onPointerDown={event => { if (event.button !== 1 && event.button !== 2) return; event.preventDefault(); setDrag({ kind: 'PAN', x: event.clientX, y: event.clientY, pan }); }} onContextMenu={event => event.preventDefault()} className="relative h-[72vh] min-h-[640px] overflow-hidden rounded-lg border border-neutral-800 bg-black cursor-grab">
      <div className="absolute origin-top-left" style={{ width: canvasWidth, height: canvasHeight, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        {days.map((day, index) => <div key={day} className="pointer-events-none absolute bottom-0 top-0 border-x border-emerald-500/[0.06] bg-emerald-500/[0.015]" style={{ left: 36 + index * COLUMN_PITCH, width: NODE_WIDTH + 32 }}><span className="sticky top-3 ml-3 inline-flex rounded border border-emerald-500/20 bg-black/90 px-2 py-1 font-mono text-[10px] uppercase text-emerald-400">День {day}</span></div>)}
        <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight}>
          {events.flatMap(event => (event.prerequisiteMissionIds ?? []).map(parentId => {
            const from = positions.get(parentId); const to = positions.get(event.id); if (!from || !to) return null;
            const emphasized = !selectedMissionId || (relatedMissionIds.has(parentId) && relatedMissionIds.has(event.id));
            const middleX = (from.x + NODE_WIDTH + to.x) / 2;
            return <path key={`${parentId}-${event.id}`} d={`M ${from.x + NODE_WIDTH} ${from.y + NODE_HEIGHT / 2} C ${middleX} ${from.y + NODE_HEIGHT / 2}, ${middleX} ${to.y + NODE_HEIGHT / 2}, ${to.x} ${to.y + NODE_HEIGHT / 2}`} fill="none" stroke={event.prerequisiteMode === 'ANY' ? '#38bdf8' : '#d4d4d8'} strokeOpacity={emphasized ? 0.72 : 0.12} strokeWidth={emphasized && selectedMissionId ? 3 : 1.5} strokeDasharray={event.prerequisiteMode === 'ANY' ? '7 5' : undefined} />;
          }))}
        </svg>
        {events.map(event => {
          const position = positions.get(event.id)!;
          const matches = !normalizedQuery || `${event.title} ${event.region} ${event.desc}`.toLocaleLowerCase('ru').includes(normalizedQuery);
          const selected = event.id === selectedMissionId;
          const contextVisible = !selectedMissionId || relatedMissionIds.has(event.id);
          return <button key={event.id} type="button" onClick={() => onSelectedMissionIdChange(event.id)} onDoubleClick={() => { onSelectedMissionIdChange(event.id); onOpenMission?.(event.id); }} onPointerDown={pointer => {
            if (pointer.button !== 0) return;
            pointer.stopPropagation();
            const rect = (pointer.currentTarget as HTMLElement).getBoundingClientRect();
            setDrag({ kind: 'NODE', id: event.id, dx: (pointer.clientX - rect.left) / zoom, dy: (pointer.clientY - rect.top) / zoom });
          }} className={`absolute overflow-hidden rounded-lg border-2 px-3 py-2 text-left shadow-lg transition-[opacity,filter] ${selected ? 'z-10 ring-4 ring-amber-300/40' : ''} ${event.repeat?.enabled ? 'border-dashed' : ''}`} style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT, borderColor: TYPE_BORDER[event.type], background: chainBackground(event, chains), opacity: matches ? (contextVisible ? 1 : 0.34) : 0.12, filter: contextVisible ? undefined : 'saturate(0.45)' }}>
            <strong className="block overflow-hidden text-[11px] leading-[14px] text-white" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{event.title}</strong><span className="mt-1 block truncate font-mono text-[8px] uppercase text-neutral-300">День {event.startDay ?? 1} · {event.region}</span><span className="mt-1 flex gap-1 text-[8px] uppercase text-neutral-400">{event.repeat?.enabled && <b>↻</b>}{(event.rewardSpecialItems?.length ?? 0) > 0 && <b>◆ предмет</b>}{(event.prerequisiteMissionIds?.length ?? 0) > 1 && <b>{event.prerequisiteMode === 'ANY' ? 'ИЛИ' : 'И'}</b>}</span>
          </button>;
        })}
      </div>
    </div>
  </section>;
}
