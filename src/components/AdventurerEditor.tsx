import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, UserRound, Users } from 'lucide-react';
import type { Adventurer, AdventurerStatus, GameState } from '../types';
import { calculateMaxHp } from '../utils';
import { clampRelation } from '../domain/economy';

interface AdventurerEditorProps {
  state: GameState;
  updateState: (change: Partial<GameState>) => void;
  showToast: (message: string, isError?: boolean) => void;
  mode?: 'LIVE' | 'FILE';
}

const STATUS_LABELS: Record<AdventurerStatus, string> = {
  READY: 'Готов',
  WOUNDED: 'Ранен',
  ON_MISSION: 'На задании',
  DEAD: 'Погиб'
};

function createAdventurer(existingIds: readonly string[], clans: GameState['clans']): Adventurer {
  const base = Date.now().toString(36);
  let id = `adv_custom_${base}`;
  let sequence = 1;
  while (existingIds.includes(id)) {
    id = `adv_custom_${base}_${sequence}`;
    sequence += 1;
  }
  return {
    id,
    name: 'Новый авантюрист',
    class: 'Воин',
    description: '',
    level: 1,
    hp: calculateMaxHp(1),
    maxHp: calculateMaxHp(1),
    status: 'READY',
    successfulMissions: 0,
    totalMissions: 0,
    relations: Object.fromEntries(clans.map(clan => [clan.id, 0])),
    isPlayer: false
  };
}

export default function AdventurerEditor({ state, updateState, showToast, mode = 'LIVE' }: AdventurerEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(state.adventurers[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return state.adventurers;
    return state.adventurers.filter(adventurer =>
      `${adventurer.name} ${adventurer.class} ${adventurer.description ?? ''}`
        .toLocaleLowerCase('ru')
        .includes(normalized)
    );
  }, [query, state.adventurers]);

  const selected = state.adventurers.find(item => item.id === selectedId) ?? null;

  const updateAdventurer = (change: Partial<Adventurer>) => {
    if (!selected) return;
    updateState({
      adventurers: state.adventurers.map(item => item.id === selected.id ? { ...item, ...change } : item)
    });
  };

  const addAdventurer = () => {
    const adventurer = createAdventurer(state.adventurers.map(item => item.id), state.clans);
    updateState({ adventurers: [...state.adventurers, adventurer] });
    setSelectedId(adventurer.id);
    showToast(`Добавлен авантюрист «${adventurer.name}».`);
  };

  const deleteAdventurer = (id: string) => {
    const adventurer = state.adventurers.find(item => item.id === id);
    updateState({
      adventurers: state.adventurers.filter(item => item.id !== id),
      contracts: state.contracts.map(contract => ({
        ...contract,
        partyAdvIds: contract.partyAdvIds.filter(item => item !== id),
        suggestedSquadAdvIds: contract.suggestedSquadAdvIds?.filter(item => item !== id),
        actualSquadAdvIds: contract.actualSquadAdvIds?.filter(item => item !== id)
      })),
      missions: state.missions.map(mission => ({
        ...mission,
        suggestedSquadAdvIds: mission.suggestedSquadAdvIds?.filter(item => item !== id)
      }))
    });
    setPendingDeleteId(null);
    setSelectedId(state.adventurers.find(item => item.id !== id)?.id ?? null);
    showToast(`Авантюрист «${adventurer?.name ?? id}» удалён.`);
  };

  return (
    <section className="space-y-5" aria-label="Редактор приключенцев">
      <div className="rounded-xl border border-emerald-500/20 bg-black/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-500">{mode === 'FILE' ? 'Файловый редактор' : 'Текущая кампания'}</p>
            <h2 className="mt-1 text-xl font-bold text-white">Список авантюристов</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              {mode === 'FILE'
                ? 'Изменения остаются в черновике этого редактора до скачивания JSON и не затрагивают текущую игру.'
                : 'Изменения сохраняются автоматически и сразу используются игрой. Описание видно игрокам только по отдельной кнопке в досье.'}
            </p>
          </div>
          <button
            type="button"
            onClick={addAdventurer}
            className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2.5 font-mono text-xs font-bold uppercase text-black transition hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" /> Новый авантюрист
          </button>
        </div>
      </div>

      <div className="grid min-h-[650px] gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Поиск по списку..."
              className="w-full rounded-lg border border-neutral-800 bg-black py-2.5 pl-9 pr-3 text-sm text-neutral-200 outline-none transition focus:border-emerald-500/60"
            />
          </label>
          <div className="mt-4 space-y-2 overflow-y-auto lg:max-h-[720px]">
            {filtered.map(adventurer => (
              <button
                type="button"
                key={adventurer.id}
                onClick={() => { setSelectedId(adventurer.id); setPendingDeleteId(null); }}
                className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === adventurer.id ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-neutral-800 bg-black/40 hover:border-neutral-700'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-sm text-neutral-100">{adventurer.name}</strong>
                  {adventurer.isPlayer && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-400">Игрок</span>}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase text-neutral-600">
                  {adventurer.class} · ур. {adventurer.level} · {STATUS_LABELS[adventurer.status]}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="py-8 text-center text-xs text-neutral-600">Ничего не найдено</p>}
          </div>
        </aside>

        <div className="rounded-xl border border-emerald-500/15 bg-[#0b0b0b] p-5 sm:p-6">
          {!selected ? (
            <div className="flex min-h-[500px] flex-col items-center justify-center text-center text-neutral-600">
              <UserRound className="mb-3 h-10 w-10" />
              <p>Выберите авантюриста или создайте нового.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 border-b border-neutral-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase text-neutral-600">ID: {selected.id}</p>
                  <h3 className="mt-1 text-lg font-bold text-emerald-400">Карточка персонажа</h3>
                </div>
                {pendingDeleteId === selected.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-300">Удалить безвозвратно?</span>
                    <button type="button" onClick={() => deleteAdventurer(selected.id)} className="rounded border border-rose-500 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-300">Да</button>
                    <button type="button" onClick={() => setPendingDeleteId(null)} className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400">Нет</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPendingDeleteId(selected.id)} className="flex items-center gap-2 rounded border border-rose-500/30 px-3 py-2 font-mono text-xs text-rose-400 transition hover:bg-rose-500/10">
                    <Trash2 className="h-4 w-4" /> Удалить
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Имя">
                  <input value={selected.name} onChange={event => updateAdventurer({ name: event.target.value })} className="editor-input" />
                </Field>
                <Field label="Класс">
                  <input value={selected.class} onChange={event => updateAdventurer({ class: event.target.value })} className="editor-input" />
                </Field>
                <Field label="Уровень">
                  <input type="number" min={1} max={5} value={selected.level} onChange={event => updateAdventurer({ level: Math.max(1, Math.min(5, Number(event.target.value) || 1)) })} className="editor-input" />
                </Field>
                <Field label="Статус">
                  <select value={selected.status} onChange={event => updateAdventurer({ status: event.target.value as AdventurerStatus })} className="editor-input">
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Текущее HP">
                  <input type="number" max={selected.maxHp} value={selected.hp} onChange={event => updateAdventurer({ hp: Math.min(selected.maxHp, Number(event.target.value) || 0) })} className="editor-input" />
                </Field>
                <Field label="Максимальное HP">
                  <input type="number" min={1} value={selected.maxHp} onChange={event => { const maxHp = Math.max(1, Number(event.target.value) || 1); updateAdventurer({ maxHp, hp: Math.min(selected.hp, maxHp) }); }} className="editor-input" />
                </Field>
                <Field label="Успешных заданий">
                  <input type="number" min={0} value={selected.successfulMissions} onChange={event => updateAdventurer({ successfulMissions: Math.max(0, Number(event.target.value) || 0) })} className="editor-input" />
                </Field>
                <Field label="Всего заданий">
                  <input type="number" min={0} value={selected.totalMissions} onChange={event => updateAdventurer({ totalMissions: Math.max(0, Number(event.target.value) || 0) })} className="editor-input" />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-neutral-300">
                <input type="checkbox" checked={Boolean(selected.isPlayer)} onChange={event => updateAdventurer({ isPlayer: event.target.checked })} className="h-4 w-4 accent-amber-500" />
                Это персонаж игрока — рынок контрактов не распределяет его автоматически
              </label>

              <Field label="Описание">
                <textarea
                  value={selected.description ?? ''}
                  onChange={event => updateAdventurer({ description: event.target.value })}
                  rows={5}
                  placeholder="Несколько слов о герое. Пустое описание не показывается в игре."
                  className="editor-input resize-y leading-relaxed"
                />
              </Field>

              <div>
                <h4 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Users className="h-4 w-4" /> Отношения с заказчиками
                </h4>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {state.clans.map(clan => {
                    const value = clampRelation(selected.relations?.[clan.id] ?? 0);
                    return (
                      <label key={clan.id} className="rounded-lg border border-neutral-800 bg-black/40 p-3">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-neutral-300">{clan.name}</span>
                          <strong className="font-mono text-amber-400">{value} / 10</strong>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={value}
                          onChange={event => updateAdventurer({ relations: { ...selected.relations, [clan.id]: clampRelation(Number(event.target.value)) } })}
                          className="mt-2 w-full accent-amber-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
