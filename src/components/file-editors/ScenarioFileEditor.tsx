import { Boxes, Map, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useRef } from 'react';
import type { Clan } from '../../types';
import type { ScenarioFileData } from '../../domain/dataFiles';
import ScenarioRegionsEditor from './ScenarioRegionsEditor';

interface ScenarioFileEditorProps {
  value: ScenarioFileData;
  onChange: (value: ScenarioFileData) => void;
  onImportAdventurers: (file: File) => void;
  onImportEvents: (file: File) => void;
}

function newClan(existing: readonly Clan[]): Clan {
  const base = Date.now().toString(36);
  let id = `clan_custom_${base}`;
  let suffix = 1;
  while (existing.some(clan => clan.id === id)) id = `clan_custom_${base}_${suffix++}`;
  return {
    id,
    name: 'Новый клан',
    trustLevel: 1,
    gold: 120,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0, specialItems: [] }
  };
}

export default function ScenarioFileEditor({ value, onChange, onImportAdventurers, onImportEvents }: ScenarioFileEditorProps) {
  const adventurerInputRef = useRef<HTMLInputElement>(null);
  const eventInputRef = useRef<HTMLInputElement>(null);
  const patch = (change: Partial<ScenarioFileData>) => onChange({ ...value, ...change });

  const updateClan = (id: string, change: Partial<Clan>) => {
    patch({ clans: value.clans.map(clan => clan.id === id ? { ...clan, ...change } : clan) });
  };

  const updateClanResource = (id: string, key: 'Supplies' | 'Equipment' | 'Intelligence' | 'Alchemy', amount: number) => {
    patch({ clans: value.clans.map(clan => clan.id === id ? { ...clan, resources: { ...clan.resources, [key]: Math.max(0, amount) } } : clan) });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <EditorSection title="Основные сведения" icon={<Map className="h-4 w-4" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Название сценария"><input value={value.name} onChange={event => patch({ name: event.target.value })} className="editor-input" /></Field>
          <Field label="ID сценария"><input value={value.id} onChange={event => patch({ id: event.target.value })} className="editor-input" /></Field>
          <Field label="Название Гильдии"><input value={value.guildName} onChange={event => patch({ guildName: event.target.value })} className="editor-input" /></Field>
          <Field label="Короткое название"><input value={value.guildShortName} onChange={event => patch({ guildShortName: event.target.value })} className="editor-input" /></Field>
        </div>
        <Field label="Описание сценария"><textarea value={value.description} onChange={event => patch({ description: event.target.value })} rows={4} className="editor-input resize-y" /></Field>
      </EditorSection>

      <EditorSection title="Экономика и карта" icon={<Boxes className="h-4 w-4" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Стоимость h" value={value.hCost} min={1} onChange={hCost => patch({ hCost })} />
          <NumberField label="Активных кланов" value={value.nClans} min={1} max={Math.max(1, value.clans.filter(clan => clan.id !== 'clan_guild').length)} onChange={nClans => patch({ nClans })} />
          <NumberField label="Ширина карты" value={value.mapWidth} min={1} onChange={mapWidth => patch({ mapWidth })} />
          <NumberField label="Высота карты" value={value.mapHeight} min={1} onChange={mapHeight => patch({ mapHeight })} />
          <Field label="ID темы"><input value={value.themeId} onChange={event => patch({ themeId: event.target.value })} className="editor-input" /></Field>
          <NumberField label="Штаб X, %" value={value.hqPos?.x ?? 50} min={0} max={100} onChange={x => patch({ hqPos: { x, y: value.hqPos?.y ?? 50 } })} />
          <NumberField label="Штаб Y, %" value={value.hqPos?.y ?? 50} min={0} max={100} onChange={y => patch({ hqPos: { x: value.hqPos?.x ?? 50, y } })} />
        </div>
        <p className="text-xs leading-relaxed text-neutral-600">Изображение не вкладывается в `scenario.json`: оно выбирается в мастере новой игры. Для передачи карты внутри одного файла используется `.globalmap`.</p>
      </EditorSection>

      <EditorSection title="Область появления событий" icon={<Map className="h-4 w-4" />}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {value.spawnPolygon.map((point, index) => (
            <div key={`spawn-${index}`} className="flex items-end gap-2 rounded-lg border border-neutral-800 bg-black/30 p-3">
              <NumberField label={`Точка ${index + 1}: X`} value={point.x} min={0} max={100} onChange={x => patch({ spawnPolygon: value.spawnPolygon.map((item, itemIndex) => itemIndex === index ? { ...item, x } : item) })} />
              <NumberField label="Y" value={point.y} min={0} max={100} onChange={y => patch({ spawnPolygon: value.spawnPolygon.map((item, itemIndex) => itemIndex === index ? { ...item, y } : item) })} />
              <button type="button" disabled={value.spawnPolygon.length <= 3} onClick={() => patch({ spawnPolygon: value.spawnPolygon.filter((_, itemIndex) => itemIndex !== index) })} className="mb-0.5 rounded p-2 text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-25"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => patch({ spawnPolygon: [...value.spawnPolygon, { x: 50, y: 50 }] })} className="mt-3 flex items-center gap-2 rounded border border-emerald-500/30 px-3 py-2 font-mono text-xs text-emerald-400 hover:bg-emerald-500/10"><Plus className="h-4 w-4" /> Добавить точку</button>
      </EditorSection>

      <EditorSection title="Регионы и эффекты карты" icon={<Map className="h-4 w-4" />}>
        <ToggleField label="Атмосферные эффекты включены" checked={value.mapEffectsEnabled} onChange={mapEffectsEnabled => patch({ mapEffectsEnabled })} />
        <p className="text-xs leading-relaxed text-neutral-600">Каждый новый регион скрыт от игроков. Общая видимость и слои границы, названия, заливки и тумана настраиваются отдельно.</p>
        <ScenarioRegionsEditor regions={value.mapRegions} onChange={mapRegions => patch({ mapRegions })} />
      </EditorSection>

      <EditorSection title="Кланы" icon={<Users className="h-4 w-4" />}>
        <div className="space-y-3">
          {value.clans.map(clan => (
            <div key={clan.id} className="rounded-xl border border-neutral-800 bg-black/30 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(180px,1.4fr)_110px_130px_repeat(4,100px)_auto] md:items-end">
                <Field label={`Название · ${clan.id}`}><input value={clan.name} onChange={event => updateClan(clan.id, { name: event.target.value })} className="editor-input" /></Field>
                <NumberField label="Доверие" value={clan.trustLevel} min={1} max={5} onChange={trustLevel => updateClan(clan.id, { trustLevel })} />
                <NumberField label="Золото" value={clan.gold} min={0} onChange={gold => updateClan(clan.id, { gold })} />
                {(['Supplies', 'Equipment', 'Intelligence', 'Alchemy'] as const).map(key => (
                  <NumberField key={key} label={key} value={clan.resources[key] ?? 0} min={0} onChange={amount => updateClanResource(clan.id, key, amount)} />
                ))}
                <button type="button" disabled={clan.id === 'clan_guild'} onClick={() => patch({ clans: value.clans.filter(item => item.id !== clan.id), nClans: Math.max(1, Math.min(value.nClans, value.clans.filter(item => item.id !== clan.id && item.id !== 'clan_guild').length)) })} className="mb-0.5 rounded p-2 text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-20" title="Удалить клан"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { const clan = newClan(value.clans); patch({ clans: [...value.clans, clan], nClans: value.nClans + 1 }); }} className="mt-3 flex items-center gap-2 rounded border border-emerald-500/30 px-3 py-2 font-mono text-xs text-emerald-400 hover:bg-emerald-500/10"><Plus className="h-4 w-4" /> Добавить клан</button>
      </EditorSection>

      <EditorSection title="Встроенные наборы" icon={<Upload className="h-4 w-4" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <ImportCard title="Авантюристы" count={value.adventurers.length} description="Импортировать проверенный adventurers.json в сценарий." onClick={() => adventurerInputRef.current?.click()} />
          <ImportCard title="События" count={value.events.length} description="Импортировать проверенный events.json вместе с цепочками." onClick={() => eventInputRef.current?.click()} />
        </div>
        <input ref={adventurerInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onImportAdventurers(file); event.currentTarget.value = ''; }} />
        <input ref={eventInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onImportEvents(file); event.currentTarget.value = ''; }} />
      </EditorSection>
    </div>
  );
}

function EditorSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-5 sm:p-6"><h2 className="mb-5 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">{icon}{title}</h2><div className="space-y-4">{children}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>{children}</label>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" min={min} max={max} value={value} onChange={event => { let next = Number(event.target.value) || 0; if (min !== undefined) next = Math.max(min, next); if (max !== undefined) next = Math.min(max, next); onChange(next); }} className="editor-input" /></Field>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-black/30 px-4 py-3 font-mono text-xs text-neutral-300"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="accent-emerald-500" /></label>;
}

function ImportCard({ title, count, description, onClick }: { title: string; count: number; description: string; onClick: () => void }) {
  return <div className="rounded-xl border border-neutral-800 bg-black/30 p-5"><div className="flex items-center justify-between"><strong className="text-neutral-100">{title}</strong><span className="rounded bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-400">{count}</span></div><p className="mt-2 text-xs leading-relaxed text-neutral-600">{description}</p><button type="button" onClick={onClick} className="mt-4 flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 font-mono text-[10px] uppercase text-neutral-300 transition hover:border-emerald-500/50 hover:text-emerald-300"><Upload className="h-3.5 w-3.5" /> Выбрать JSON</button></div>;
}
