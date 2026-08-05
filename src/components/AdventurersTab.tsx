/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Search, UserPlus, Shield, Heart, Award, Eye, UserCheck, Archive } from 'lucide-react';
import { GameState, Adventurer, AdventurerStatus } from '../types';
import { getAdvClassIcon, getStatusNameRu, calculateMaxHp } from '../utils';

interface AdventurersTabProps {
  state: GameState;
  onOpenRecruit: () => void;
  onSelectAdv: (id: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

type AdventurerSortKey = 'name' | 'level' | 'hp' | 'status' | 'missions';
type SortDirection = 'asc' | 'desc';

export default function AdventurersTab({
  state,
  onOpenRecruit,
  onSelectAdv,
  showToast
}: AdventurersTabProps) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<AdventurerSortKey>('level');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const adventurers = state.adventurers || [];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const filteredAdvs = adventurers.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesClass = classFilter === '' || a.class === classFilter;
    const matchesStatus = statusFilter === '' || a.status === statusFilter;
    return matchesSearch && matchesClass && matchesStatus;
  });

  const statusOrder: Record<AdventurerStatus, number> = { READY: 0, ON_MISSION: 1, WOUNDED: 2, DEAD: 3 };
  const sortedAdvs = [...filteredAdvs].sort((left, right) => {
    let comparison = 0;
    if (sortKey === 'name') comparison = left.name.localeCompare(right.name, 'ru');
    if (sortKey === 'level') comparison = left.level - right.level;
    if (sortKey === 'hp') comparison = left.hp - right.hp || left.maxHp - right.maxHp;
    if (sortKey === 'status') comparison = statusOrder[left.status] - statusOrder[right.status];
    if (sortKey === 'missions') comparison = left.totalMissions - right.totalMissions || left.successfulMissions - right.successfulMissions;
    if (comparison === 0 && sortKey !== 'name') return left.name.localeCompare(right.name, 'ru');
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const livingAdvs = sortedAdvs.filter(a => a.status !== 'DEAD');
  const deadAdvs = sortedAdvs.filter(a => a.status === 'DEAD');

  const players = livingAdvs.filter(a => a.isPlayer);
  const npcs = livingAdvs.filter(a => !a.isPlayer && !a.isRosterReserve);
  const reserveNpcs = livingAdvs.filter(a => !a.isPlayer && a.isRosterReserve);

  const classesList = Array.from(new Set(adventurers.map(a => a.class)));

  const handleSort = (nextKey: AdventurerSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'name' || nextKey === 'status' ? 'asc' : 'desc');
  };

  const renderAdventurerRow = (adv: Adventurer) => {
    const classIcon = getAdvClassIcon(adv.class);
    const hpPercent = Math.max(0, Math.min(100, (adv.hp / adv.maxHp) * 100));

    return (
      <tr
        key={adv.id}
        className="border-b border-emerald-500/5 hover:bg-emerald-950/5 transition-all font-mono text-xs"
      >
        {/* Class symbol & Name */}
        <td className="py-3 px-4 font-bold text-neutral-200">
          <div className="flex items-center gap-2">
            <span className="text-sm select-none" title={adv.class}>{classIcon}</span>
            <div>
              <span className="block">{adv.name}</span>
              <span className="text-[10px] text-neutral-500 uppercase font-normal">{adv.class}</span>
            </div>
          </div>
        </td>

        {/* Level */}
        <td className="py-3 px-4 text-center">
          <span className="px-1.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded font-bold text-[10px] text-emerald-400">
            {adv.level} Ур.
          </span>
        </td>

        {/* Health */}
        <td className="py-3 px-4 w-32">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>HP: {adv.hp} / {adv.maxHp}</span>
              <span>{Math.round(hpPercent)}%</span>
            </div>
            <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden border border-neutral-900">
              <div
                className={`h-full rounded-full transition-all ${adv.status === 'DEAD' ? 'bg-neutral-800' : adv.hp <= 1 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}
                style={{ width: `${adv.status === 'DEAD' ? 0 : hpPercent}%` }}
              />
            </div>
          </div>
        </td>

        {/* Status Badge */}
        <td className="py-3 px-4 text-center">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${adv.isRosterReserve ? 'bg-sky-950/20 border border-sky-700 text-sky-400' : adv.status === 'READY' ? 'bg-emerald-950/25 border border-emerald-500 text-emerald-400' : adv.status === 'WOUNDED' ? 'bg-rose-950/20 border border-rose-500 text-rose-400 animate-pulse' : adv.status === 'ON_MISSION' ? 'bg-amber-950/20 border border-amber-500 text-amber-500' : 'bg-neutral-900 border border-neutral-700 text-neutral-500'}`}>
            {adv.isRosterReserve ? 'Резерв' : getStatusNameRu(adv.status)}
          </span>
        </td>

        {/* Missions count */}
        <td className="py-3 px-4 text-center text-neutral-300">
          {adv.successfulMissions} / {adv.totalMissions}
        </td>

        {/* Action Button */}
        <td className="py-3 px-4 text-right">
          <button
            onClick={() => onSelectAdv(adv.id)}
            className="p-1 px-2.5 bg-[#161616] border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-400 rounded transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Досье</span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Top action header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0d0d0d] border border-emerald-500/10 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-500" />
          <span className="font-mono text-xs uppercase tracking-wider text-neutral-300">
            Реестр приключенцев и рекрутов гильдии
          </span>
        </div>

        <button
          onClick={onOpenRecruit}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Нанять нового героя ({5 * state.hCost}г)</span>
        </button>
      </div>

      {/* Filter and Search controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#0d0d0d] border border-emerald-500/10 p-4 rounded-lg font-mono text-xs">
        
        {/* Search Input */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-500 uppercase text-[10px]">Поиск по Имени:</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Введите имя..."
              value={search}
              onChange={handleSearchChange}
              className="w-full bg-black border border-emerald-500/20 text-neutral-200 pl-8 pr-3 py-2 rounded focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Filter by class */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-500 uppercase text-[10px]">Класс персонажа:</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded focus:border-emerald-500 outline-none"
          >
            <option value="">Все классы</option>
            {classesList.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        {/* Filter by status */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-500 uppercase text-[10px]">Физическое состояние:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded focus:border-emerald-500 outline-none"
          >
            <option value="">Все статусы</option>
            <option value="READY">Готовы к миссии</option>
            <option value="WOUNDED">Тяжело ранены</option>
            <option value="ON_MISSION">На миссиях</option>
            <option value="DEAD">Погибли</option>
          </select>
        </div>

      </div>

      {/* Roster Tables */}
      <div className="space-y-6">
        
        {/* Roster Part 1: Player Characters (isPlayer: true) */}
        <div className="bg-[#0d0d0d] border border-amber-500/20 rounded-lg overflow-hidden shadow-md">
          <div className="px-5 py-3 border-b border-amber-500/20 bg-amber-500/5 flex justify-between items-center">
            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-amber-500" />
              Персонажи Игроков (Игровые Герои) — Ручное Управление ({players.length})
            </h3>
            <span className="text-[10px] text-neutral-400 font-mono italic">
              *{state.guildName} никогда не распределяет этих героев автоматически!
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <RosterTableHead accent="amber" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-neutral-500 font-mono text-xs">
                      Нет активных игровых персонажей, удовлетворяющих фильтрам.
                    </td>
                  </tr>
                ) : (
                  players.map(renderAdventurerRow)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Roster Part 2: Guild NPCs (isPlayer !== true) */}
        <div className="bg-[#0d0d0d] border border-emerald-500/15 rounded-lg overflow-hidden shadow-md">
          <div className="px-5 py-3 border-b border-emerald-500/10 bg-black/40">
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
              NPC-авантюристы «{state.guildName}» — авто-распределение ({npcs.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <RosterTableHead accent="emerald" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <tbody>
                {npcs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-neutral-500 font-mono text-xs">
                      Нет приключенцев NPC, удовлетворяющих фильтрам.
                    </td>
                  </tr>
                ) : (
                  npcs.map(renderAdventurerRow)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {state.isDmMode && reserveNpcs.length > 0 && <div className="bg-[#0d0d0d] border border-sky-500/15 rounded-lg overflow-hidden shadow-md">
          <div className="px-5 py-3 border-b border-sky-500/10 bg-sky-500/5 flex items-center justify-between gap-3">
            <h3 className="text-sky-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Archive className="w-4 h-4" /> Резерв кампании ({reserveNpcs.length})
            </h3>
            <span className="text-[10px] text-neutral-500 font-mono">Вернутся на рынок при увеличении числа активных кланов</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <RosterTableHead accent="emerald" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <tbody>{reserveNpcs.map(renderAdventurerRow)}</tbody>
            </table>
          </div>
        </div>}

        {/* Roster Part 3: Memorial of Fallen Heroes (Dead Adventurers) */}
        <div className="bg-[#0d0d0d] border border-rose-500/20 rounded-lg overflow-hidden shadow-md">
          <div className="px-5 py-3 border-b border-rose-500/20 bg-rose-950/20 flex justify-between items-center">
            <h3 className="text-rose-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-sm">🪦</span>
              Мемориал Павших Героев ({deadAdvs.length})
            </h3>
            <span className="text-[10px] text-neutral-500 font-mono italic">
              Пали в опасных подземельях и экспедициях
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <RosterTableHead accent="rose" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <tbody>
                {deadAdvs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-neutral-600 font-mono text-xs">
                      Павших героев нет. Все гильдейцы живы!
                    </td>
                  </tr>
                ) : (
                  deadAdvs.map(renderAdventurerRow)
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}

function RosterTableHead({
  accent,
  sortKey,
  sortDirection,
  onSort
}: {
  accent: 'amber' | 'emerald' | 'rose';
  sortKey: AdventurerSortKey;
  sortDirection: SortDirection;
  onSort: (key: AdventurerSortKey) => void;
}) {
  const borderClass = accent === 'amber' ? 'border-amber-500/10' : accent === 'rose' ? 'border-rose-500/10' : 'border-emerald-500/5';
  const header = (key: AdventurerSortKey, label: string, alignment = 'text-left') => (
    <th className={`px-4 py-2.5 font-semibold ${alignment}`}>
      <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 transition hover:text-emerald-300 ${sortKey === key ? 'text-emerald-400' : ''}`} title={`Сортировать: ${label}`}>
        {label}<span aria-hidden="true">{sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
  return (
    <thead>
      <tr className={`border-b ${borderClass} bg-black/40 font-mono text-[10px] uppercase tracking-wider text-neutral-400`}>
        {header('name', 'Имя & Класс')}
        {header('level', 'Уровень', 'text-center')}
        {header('hp', 'HP Здоровье')}
        {header('status', 'Статус', 'text-center')}
        {header('missions', 'Экспедиции (Успехи/Всего)', 'text-center')}
        <th className="px-4 py-2.5 text-right font-semibold">Действие</th>
      </tr>
    </thead>
  );
}
