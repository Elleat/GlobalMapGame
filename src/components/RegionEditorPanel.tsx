import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Layers3,
  MapPinned,
  Plus,
  Trash2
} from 'lucide-react';
import type { MapRegion } from '../types';
import { getFogOpacity, getRegionCenter, hasSelfIntersection } from '../domain/mapRegions';

interface RegionEditorPanelProps {
  regions: MapRegion[];
  selectedRegionId: string | null;
  effectsEnabled: boolean;
  playerPreview: boolean;
  addPointMode: boolean;
  onSelect: (regionId: string) => void;
  onCreate: () => void;
  onUpdate: (regionId: string, change: Partial<MapRegion>) => void;
  onDuplicate: (regionId: string) => void;
  onDelete: (regionId: string) => void;
  onMove: (regionId: string, direction: -1 | 1) => void;
  onToggleAddPoint: () => void;
  onEffectsEnabledChange: (enabled: boolean) => void;
  onPlayerPreviewChange: (enabled: boolean) => void;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function getPointWord(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'точек';
  const last = count % 10;
  if (last === 1) return 'точка';
  if (last >= 2 && last <= 4) return 'точки';
  return 'точек';
}

export default function RegionEditorPanel({
  regions,
  selectedRegionId,
  effectsEnabled,
  playerPreview,
  addPointMode,
  onSelect,
  onCreate,
  onUpdate,
  onDuplicate,
  onDelete,
  onMove,
  onToggleAddPoint,
  onEffectsEnabledChange,
  onPlayerPreviewChange
}: RegionEditorPanelProps) {
  const selected = regions.find(region => region.id === selectedRegionId) ?? null;
  const selectedIndex = selected ? regions.findIndex(region => region.id === selected.id) : -1;
  const invalidBoundary = selected ? hasSelfIntersection(selected.points) : false;

  const updatePoint = (index: number, axis: 'x' | 'y', value: number) => {
    if (!selected) return;
    onUpdate(selected.id, {
      points: selected.points.map((point, pointIndex) => pointIndex === index
        ? { ...point, [axis]: clampPercent(value) }
        : point)
    });
  };

  return (
    <div className="bg-[#0d0d0d] border border-sky-500/30 p-4 rounded-lg space-y-4 shadow-md font-mono text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/15 pb-3">
        <h3 className="text-sky-400 font-bold uppercase tracking-wider flex items-center gap-2">
          <Layers3 className="w-4 h-4" /> Редактор регионов
        </h3>
        <button type="button" onClick={onCreate} className="p-1.5 rounded border border-sky-500/30 text-sky-300 hover:bg-sky-500/10" title="Создать регион">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Эффекты карты" checked={effectsEnabled} onChange={onEffectsEnabledChange} />
        <Toggle label="Предпросмотр игрока" checked={playerPreview} onChange={onPlayerPreviewChange} />
      </div>

      {regions.length > 0 ? (
        <label className="block space-y-1">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">Выбранный регион</span>
          <select value={selected?.id ?? ''} onChange={event => onSelect(event.target.value)} className="w-full rounded border border-neutral-700 bg-black px-2 py-2 text-neutral-200 outline-none focus:border-sky-500">
            {regions.map(region => (
              <option key={region.id} value={region.id}>{region.name}{region.visibleToPlayers ? '' : ' · скрыт'}</option>
            ))}
          </select>
        </label>
      ) : (
        <button type="button" onClick={onCreate} className="w-full rounded border border-dashed border-sky-500/30 p-5 text-center text-sky-300 hover:bg-sky-500/5">
          <MapPinned className="mx-auto mb-2 h-6 w-6" />
          Создать первый регион
        </button>
      )}

      {selected && (
        <>
          <label className="block space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-neutral-500">Название</span>
            <input value={selected.name} onChange={event => onUpdate(selected.id, { name: event.target.value })} className="w-full rounded border border-neutral-700 bg-black px-2.5 py-2 text-neutral-100 outline-none focus:border-sky-500" />
          </label>

          <div className={`rounded border p-3 ${selected.visibleToPlayers ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-neutral-700 bg-black/30'}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <strong className={selected.visibleToPlayers ? 'text-emerald-400' : 'text-neutral-300'}>
                  {selected.visibleToPlayers ? 'Виден игрокам' : 'Скрыт от игроков'}
                </strong>
                <p className="mt-0.5 text-[9px] leading-relaxed text-neutral-500">Общий переключатель перекрывает настройки отдельных слоёв.</p>
              </div>
              <button
                type="button"
                onClick={() => onUpdate(selected.id, selected.visibleToPlayers
                  ? { visibleToPlayers: false }
                  : { visibleToPlayers: true, showBoundary: true, showLabel: true, showFill: true })}
                className={`shrink-0 rounded border p-2 ${selected.visibleToPlayers ? 'border-rose-500/30 text-rose-400' : 'border-emerald-500/30 text-emerald-400'}`}
                title={selected.visibleToPlayers ? 'Скрыть регион' : 'Открыть регион игрокам'}
              >
                {selected.visibleToPlayers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Граница" checked={selected.showBoundary} onChange={showBoundary => onUpdate(selected.id, { showBoundary })} />
            <Toggle label="Название" checked={selected.showLabel} onChange={showLabel => onUpdate(selected.id, { showLabel })} />
            <Toggle label="Заливка" checked={selected.showFill} onChange={showFill => onUpdate(selected.id, { showFill })} />
            <Toggle label="Туман" checked={selected.fog.enabled} onChange={enabled => onUpdate(selected.id, { fog: { ...selected.fog, enabled } })} />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded border border-neutral-800 bg-black/30 p-3">
            <label className="space-y-1">
              <span className="text-[9px] uppercase text-neutral-500">Цвет региона</span>
              <div className="flex items-center gap-2">
                <input type="color" value={selected.color} onChange={event => onUpdate(selected.id, { color: event.target.value })} className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-black" />
                <span className="text-[10px] text-neutral-400">{selected.color}</span>
              </div>
            </label>
            <RangeField label="Заливка" value={selected.fillOpacity} max={0.8} step={0.05} onChange={fillOpacity => onUpdate(selected.id, { fillOpacity })} />
            <RangeField label="Граница" value={selected.borderOpacity} max={1} step={0.05} onChange={borderOpacity => onUpdate(selected.id, { borderOpacity })} />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded border border-neutral-800 bg-black/30 p-3">
            <label className="space-y-1">
              <span className="text-[9px] uppercase text-neutral-500">Плотность тумана</span>
              <select value={selected.fog.density} onChange={event => {
                const density = event.target.value as MapRegion['fog']['density'];
                onUpdate(selected.id, { fog: { ...selected.fog, density, opacity: getFogOpacity(density) } });
              }} className="w-full rounded border border-neutral-700 bg-black px-2 py-1.5 text-neutral-200">
                <option value="LOW">Слабый</option>
                <option value="MEDIUM">Средний</option>
                <option value="DENSE">Плотный</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase text-neutral-500">Скорость клубов</span>
              <select value={selected.fog.speed} onChange={event => onUpdate(selected.id, { fog: { ...selected.fog, speed: event.target.value as MapRegion['fog']['speed'] } })} className="w-full rounded border border-neutral-700 bg-black px-2 py-1.5 text-neutral-200">
                <option value="SLOW">Медленно</option>
                <option value="NORMAL">Обычно</option>
                <option value="FAST">Быстро</option>
              </select>
            </label>
          </div>

          <div className="rounded border border-neutral-800 bg-black/30 p-3">
            <RangeField label="Прозрачность тумана" value={selected.fog.opacity ?? getFogOpacity(selected.fog.density)} max={1} step={0.01} onChange={opacity => onUpdate(selected.id, { fog: { ...selected.fog, opacity } })} />
          </div>

          <div className="rounded border border-neutral-800 bg-black/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[10px] uppercase tracking-wider text-neutral-400">Граница · {selected.points.length} {getPointWord(selected.points.length)}</strong>
              <button type="button" onClick={onToggleAddPoint} className={`rounded border px-2 py-1 text-[9px] uppercase ${addPointMode ? 'border-amber-400 bg-amber-400 text-black' : 'border-sky-500/30 text-sky-300'}`}>
                {addPointMode ? 'Кликните по карте' : 'Добавить по карте'}
              </button>
            </div>
            {invalidBoundary && (
              <div className="flex gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Граница пересекает сама себя. Исправьте порядок или положение точек.
              </div>
            )}
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {selected.points.map((point, index) => (
                <div key={`${selected.id}-point-${index}`} className="grid grid-cols-[18px_1fr_1fr_auto] items-center gap-1.5">
                  <span className="text-[9px] text-neutral-600">{index + 1}</span>
                  <input aria-label={`Точка ${index + 1} X`} type="number" min="0" max="100" value={point.x} onChange={event => updatePoint(index, 'x', Number(event.target.value))} className="min-w-0 rounded border border-neutral-800 bg-black px-1.5 py-1 text-[10px] text-neutral-300" />
                  <input aria-label={`Точка ${index + 1} Y`} type="number" min="0" max="100" value={point.y} onChange={event => updatePoint(index, 'y', Number(event.target.value))} className="min-w-0 rounded border border-neutral-800 bg-black px-1.5 py-1 text-[10px] text-neutral-300" />
                  <button type="button" disabled={selected.points.length <= 3} onClick={() => onUpdate(selected.id, { points: selected.points.filter((_, pointIndex) => pointIndex !== index) })} className="p-1 text-rose-500 disabled:opacity-20" title="Удалить точку"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded border border-neutral-800 bg-black/30 p-3">
            <NumberInput label="Подпись X" value={selected.labelPosition.x} onChange={x => onUpdate(selected.id, { labelPosition: { ...selected.labelPosition, x } })} />
            <NumberInput label="Подпись Y" value={selected.labelPosition.y} onChange={y => onUpdate(selected.id, { labelPosition: { ...selected.labelPosition, y } })} />
            <button type="button" onClick={() => onUpdate(selected.id, { labelPosition: getRegionCenter(selected.points) })} className="col-span-2 rounded border border-neutral-700 px-2 py-1.5 text-[9px] uppercase text-neutral-300 hover:border-sky-500/40 hover:text-sky-300">Поместить название в центр</button>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            <button type="button" disabled={selectedIndex <= 0} onClick={() => onMove(selected.id, -1)} className="rounded border border-neutral-700 p-2 text-neutral-400 disabled:opacity-20" title="Слой ниже"><ArrowDown className="mx-auto h-3.5 w-3.5" /></button>
            <button type="button" disabled={selectedIndex >= regions.length - 1} onClick={() => onMove(selected.id, 1)} className="rounded border border-neutral-700 p-2 text-neutral-400 disabled:opacity-20" title="Слой выше"><ArrowUp className="mx-auto h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onDuplicate(selected.id)} className="col-span-2 rounded border border-neutral-700 p-2 text-neutral-300 hover:border-sky-500/40" title="Дублировать регион"><Copy className="mx-auto h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { if (confirm(`Удалить регион «${selected.name}»?`)) onDelete(selected.id); }} className="rounded border border-rose-500/30 p-2 text-rose-400" title="Удалить регион"><Trash2 className="mx-auto h-3.5 w-3.5" /></button>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-2.5 py-2 text-[9px] uppercase transition ${checked ? 'border-sky-500/35 bg-sky-500/10 text-sky-300' : 'border-neutral-800 bg-black/30 text-neutral-500'}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="accent-sky-500" />
    </label>
  );
}

function RangeField({ label, value, max, step, onChange }: { label: string; value: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="col-span-2 space-y-1">
      <span className="flex justify-between text-[9px] uppercase text-neutral-500"><span>{label}</span><span>{Math.round(value * 100)}%</span></span>
      <input type="range" min="0" max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="w-full accent-sky-500" />
    </label>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] uppercase text-neutral-500">{label}</span>
      <input type="number" min="0" max="100" value={value} onChange={event => onChange(clampPercent(Number(event.target.value)))} className="w-full rounded border border-neutral-800 bg-black px-2 py-1.5 text-neutral-300" />
    </label>
  );
}
