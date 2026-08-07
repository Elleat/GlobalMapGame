import React, { useMemo, useState } from 'react';
import type { Adventurer, AdventurerStatus } from '../types';

interface ReportParticipantsEditorProps {
  adventurers: Adventurer[];
  selectedIds: string[];
  returnedIds: string[];
  suggestedIds?: string[];
  onToggleSelected: (id: string) => void;
  onToggleReturned: (id: string) => void;
  onOpenDossier?: (id: string) => void;
}

const STATUS_LABELS: Record<AdventurerStatus, string> = {
  READY: 'Готов',
  WOUNDED: 'Ранен',
  ON_MISSION: 'На задании',
  DEAD: 'Погиб'
};

export default function ReportParticipantsEditor({
  adventurers,
  selectedIds,
  returnedIds,
  suggestedIds = [],
  onToggleSelected,
  onToggleReturned,
  onOpenDossier
}: ReportParticipantsEditorProps) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const [suggestedOnly, setSuggestedOnly] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const returnedSet = useMemo(() => new Set(returnedIds), [returnedIds]);
  const suggestedSet = useMemo(() => new Set(suggestedIds), [suggestedIds]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return adventurers
      .filter(adventurer => !adventurer.isArchived || selectedSet.has(adventurer.id) || suggestedSet.has(adventurer.id))
      .filter(adventurer => !normalized || `${adventurer.name} ${adventurer.class}`.toLocaleLowerCase('ru').includes(normalized))
      .filter(adventurer => level === 'ALL' || adventurer.level === Number(level))
      .filter(adventurer => status === 'ALL' || adventurer.status === status)
      .filter(adventurer => kind === 'ALL' || (kind === 'PLAYER' ? adventurer.isPlayer : !adventurer.isPlayer))
      .filter(adventurer => !suggestedOnly || suggestedSet.has(adventurer.id))
      .sort((left, right) => {
        const suggestedOrder = Number(suggestedSet.has(right.id)) - Number(suggestedSet.has(left.id));
        return suggestedOrder || left.level - right.level || left.name.localeCompare(right.name, 'ru');
      });
  }, [adventurers, kind, level, query, selectedSet, status, suggestedOnly, suggestedSet]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по имени или классу" className="editor-input lg:col-span-2" />
        <select value={level} onChange={event => setLevel(event.target.value)} className="editor-input"><option value="ALL">Все уровни</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>Уровень {value}</option>)}</select>
        <select value={status} onChange={event => setStatus(event.target.value)} className="editor-input"><option value="ALL">Все статусы</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={kind} onChange={event => setKind(event.target.value)} className="editor-input"><option value="ALL">Все персонажи</option><option value="NPC">NPC</option><option value="PLAYER">Игроки</option></select>
      </div>
      {suggestedIds.length > 0 && (
        <label className="flex items-center gap-2 text-[10px] uppercase text-amber-400"><input type="checkbox" checked={suggestedOnly} onChange={event => setSuggestedOnly(event.target.checked)} /> Только автоматически распределённые ({suggestedIds.length})</label>
      )}
      <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {filtered.map(adventurer => {
          const selected = selectedSet.has(adventurer.id);
          const returned = returnedSet.has(adventurer.id);
          const suggested = suggestedSet.has(adventurer.id);
          return (
            <div key={adventurer.id} className={`flex items-center justify-between gap-2 rounded border p-2 ${suggested ? 'border-amber-500/60 bg-amber-500/10' : selected ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-neutral-800 bg-black/30'}`}>
              <button type="button" onClick={() => onToggleSelected(adventurer.id)} className={`min-w-0 flex-1 text-left ${selected ? 'text-emerald-300' : suggested ? 'text-amber-300' : 'text-neutral-500'}`}>
                <span className="block truncate">{suggested && '◆ '}{adventurer.name} · ур. {adventurer.level}{adventurer.isPlayer ? ' · Игрок' : ''}</span>
                <span className="block truncate text-[9px] text-neutral-600">{adventurer.class}{adventurer.isArchived ? ' · архив' : ''}</span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {onOpenDossier && <button type="button" onClick={() => onOpenDossier(adventurer.id)} className="rounded border border-neutral-700 px-2 py-1 text-[9px] uppercase text-neutral-400 hover:border-emerald-500 hover:text-emerald-400">Досье</button>}
                {selected && <button type="button" onClick={() => onToggleReturned(adventurer.id)} className={`rounded border px-2 py-1 text-[9px] uppercase ${returned ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}>{returned ? 'Вернулся' : 'Не вернулся'}</button>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="col-span-full p-3 text-center text-[10px] text-neutral-600">По выбранным фильтрам никого не найдено.</p>}
      </div>
    </div>
  );
}
