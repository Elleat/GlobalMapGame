import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { MapRegion } from '../../types';
import { createMapRegion, getFogOpacity, getRegionCenter, hasSelfIntersection } from '../../domain/mapRegions';

interface ScenarioRegionsEditorProps {
  regions: MapRegion[];
  onChange: (regions: MapRegion[]) => void;
}

export default function ScenarioRegionsEditor({ regions, onChange }: ScenarioRegionsEditorProps) {
  const patchRegion = (regionId: string, change: Partial<MapRegion>) => {
    onChange(regions.map(region => region.id === regionId ? { ...region, ...change } : region));
  };

  return (
    <div className="space-y-3">
      {regions.map((region, regionIndex) => (
        <details key={region.id} className="rounded-xl border border-neutral-800 bg-black/30 p-4" open={regionIndex === 0}>
          <summary className="cursor-pointer font-mono text-xs font-bold text-neutral-200">
            {region.name} <span className={region.visibleToPlayers ? 'text-emerald-400' : 'text-neutral-600'}>· {region.visibleToPlayers ? 'виден' : 'скрыт'}</span>
          </summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Название"><input value={region.name} onChange={event => patchRegion(region.id, { name: event.target.value })} className="editor-input" /></Field>
              <Field label="ID"><input value={region.id} onChange={event => patchRegion(region.id, { id: event.target.value })} className="editor-input" /></Field>
              <Field label="Цвет"><input type="color" value={region.color} onChange={event => patchRegion(region.id, { color: event.target.value })} className="h-[42px] w-full rounded-lg border border-neutral-800 bg-black p-1" /></Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Toggle label="Виден игрокам" checked={region.visibleToPlayers} onChange={visibleToPlayers => patchRegion(region.id, { visibleToPlayers })} />
              <Toggle label="Граница" checked={region.showBoundary} onChange={showBoundary => patchRegion(region.id, { showBoundary })} />
              <Toggle label="Название" checked={region.showLabel} onChange={showLabel => patchRegion(region.id, { showLabel })} />
              <Toggle label="Заливка" checked={region.showFill} onChange={showFill => patchRegion(region.id, { showFill })} />
              <Toggle label="Туман" checked={region.fog.enabled} onChange={enabled => patchRegion(region.id, { fog: { ...region.fog, enabled } })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="Заливка 0–0.8" value={region.fillOpacity} min={0} max={0.8} step={0.05} onChange={fillOpacity => patchRegion(region.id, { fillOpacity })} />
              <NumberField label="Граница 0–1" value={region.borderOpacity} min={0} max={1} step={0.05} onChange={borderOpacity => patchRegion(region.id, { borderOpacity })} />
              <NumberField label="Подпись X" value={region.labelPosition.x} min={0} max={100} onChange={x => patchRegion(region.id, { labelPosition: { ...region.labelPosition, x } })} />
              <NumberField label="Подпись Y" value={region.labelPosition.y} min={0} max={100} onChange={y => patchRegion(region.id, { labelPosition: { ...region.labelPosition, y } })} />
              <Field label="Плотность тумана"><select value={region.fog.density} onChange={event => { const density = event.target.value as MapRegion['fog']['density']; patchRegion(region.id, { fog: { ...region.fog, density, opacity: getFogOpacity(density) } }); }} className="editor-input"><option value="LOW">Слабый</option><option value="MEDIUM">Средний</option><option value="DENSE">Плотный</option></select></Field>
              <Field label="Скорость тумана"><select value={region.fog.speed} onChange={event => patchRegion(region.id, { fog: { ...region.fog, speed: event.target.value as MapRegion['fog']['speed'] } })} className="editor-input"><option value="SLOW">Медленно</option><option value="NORMAL">Обычно</option><option value="FAST">Быстро</option></select></Field>
              <NumberField label="Прозрачность тумана" value={region.fog.opacity ?? getFogOpacity(region.fog.density)} min={0} max={1} step={0.01} onChange={opacity => patchRegion(region.id, { fog: { ...region.fog, opacity } })} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <strong className="font-mono text-[10px] uppercase text-neutral-500">Граница · {region.points.length} точек</strong>
                <button type="button" onClick={() => patchRegion(region.id, { points: [...region.points, getRegionCenter(region.points)] })} className="rounded border border-emerald-500/30 px-2 py-1 font-mono text-[9px] uppercase text-emerald-400"><Plus className="mr-1 inline h-3 w-3" /> Точка</button>
              </div>
              {hasSelfIntersection(region.points) && <p className="mb-2 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" /> Граница пересекает сама себя.</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {region.points.map((point, pointIndex) => (
                  <div key={`${region.id}-${pointIndex}`} className="flex items-end gap-2 rounded border border-neutral-800 bg-black/30 p-2">
                    <NumberField label={`${pointIndex + 1}: X`} value={point.x} min={0} max={100} onChange={x => patchRegion(region.id, { points: region.points.map((item, index) => index === pointIndex ? { ...item, x } : item) })} />
                    <NumberField label="Y" value={point.y} min={0} max={100} onChange={y => patchRegion(region.id, { points: region.points.map((item, index) => index === pointIndex ? { ...item, y } : item) })} />
                    <button type="button" disabled={region.points.length <= 3} onClick={() => patchRegion(region.id, { points: region.points.filter((_, index) => index !== pointIndex) })} className="mb-1 rounded p-2 text-rose-500 disabled:opacity-20"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => onChange(regions.filter(item => item.id !== region.id))} className="rounded border border-rose-500/30 px-3 py-2 font-mono text-[10px] uppercase text-rose-400"><Trash2 className="mr-1.5 inline h-3.5 w-3.5" /> Удалить регион</button>
          </div>
        </details>
      ))}

      <button type="button" onClick={() => onChange([...regions, createMapRegion(regions.length)])} className="flex items-center gap-2 rounded border border-emerald-500/30 px-3 py-2 font-mono text-xs text-emerald-400 hover:bg-emerald-500/10"><Plus className="h-4 w-4" /> Добавить регион</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-3 py-2 font-mono text-[10px] ${checked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-neutral-800 text-neutral-500'}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="accent-emerald-500" /></label>;
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" min={min} max={max} step={step} value={value} onChange={event => { let next = Number(event.target.value) || 0; if (min !== undefined) next = Math.max(min, next); if (max !== undefined) next = Math.min(max, next); onChange(next); }} className="editor-input" /></Field>;
}
