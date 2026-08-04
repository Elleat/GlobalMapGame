/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Shield, Coins, Users, UserCheck } from 'lucide-react';
import { GameState, Clan } from '../types';
import { getActivePlayerClans } from '../domain/clans';

interface RecruitModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: GameState;
  onRecruit: (clanId: string, name: string, cls: string, level: number, isPlayer: boolean) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export default function RecruitModal({
  isOpen,
  onClose,
  state,
  onRecruit,
  showToast
}: RecruitModalProps) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState('Воин');
  const [level, setLevel] = useState(1);
  const [isPlayer, setIsPlayer] = useState(false);
  const [selectedClanId, setSelectedClanId] = useState('');

  if (!isOpen) return null;

  const defaultNames = [
    'Ариан Светоносный', 'Галеон Теней', 'Торвальд Молот', 'Изольда Мудрая', 'Корвин Быстрый', 'Морган Заря',
    'Эвелин Шторм', 'Гром Железный', 'Сильвия Зеленая', 'Ульрих Стальной', 'Тара Дикая', 'Эмери Меч'
  ];

  const cost = 5 * state.hCost;
  const clansList = getActivePlayerClans(state.clans, state.nClans);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalClanId = selectedClanId;
    if (!finalClanId) {
      if (state.isDmMode) {
        finalClanId = 'FREE_GM';
      } else if (clansList.length > 0) {
        finalClanId = clansList[0].id;
      } else {
        showToast('Нет доступных кланов для найма!', true);
        return;
      }
    }

    const finalName = name.trim() || defaultNames[Math.floor(Math.random() * defaultNames.length)];
    onRecruit(finalClanId, finalName, cls, state.isDmMode ? level : 1, isPlayer);
    
    // Reset state
    setName('');
    setCls('Воин');
    setLevel(1);
    setIsPlayer(false);
    setSelectedClanId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <h2 className="text-emerald-400 font-mono text-sm font-bold tracking-wider uppercase flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" />
            Найм Нового Приключенца
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Cost Indicator */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs font-mono text-amber-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Coins className="w-4 h-4" />
              Стоимость найма:
            </span>
            <strong className="text-sm">
              {state.isDmMode ? '👑 ГМ Бесплатно' : `${cost} Золота`}
            </strong>
          </div>

          {/* Recruiter Clan */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono uppercase text-neutral-400">Клан-Наниматель (Оплачивает из казны):</label>
            <select
              value={selectedClanId}
              onChange={(e) => setSelectedClanId(e.target.value)}
              className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-xs focus:border-emerald-500 outline-none"
            >
              {state.isDmMode && (
                <option value="FREE_GM">👑 Без Оплаты / Назначения Клана (ГМ Бесплатно)</option>
              )}
              {clansList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Казна: {c.gold}г)
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono uppercase text-neutral-400">Имя Приключенца:</label>
            <input
              type="text"
              placeholder="Например: Ариан Светоносный"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-xs focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Class and Level Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono uppercase text-neutral-400">Класс:</label>
              <select
                value={cls}
                onChange={(e) => setCls(e.target.value)}
                className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-xs focus:border-emerald-500 outline-none"
              >
                <option value="Варвар">🪓 Варвар</option>
                <option value="Бард">🪕 Бард</option>
                <option value="Жрец">✨ Жрец</option>
                <option value="Друид">🌿 Друид</option>
                <option value="Воин">⚔️ Воин</option>
                <option value="Монах">🥋 Монах</option>
                <option value="Паладин">🛡️ Паладин</option>
                <option value="Следопыт">🏹 Следопыт</option>
                <option value="Плут">🗡️ Плут</option>
                <option value="Чародей">⚡ Чародей</option>
                <option value="Колдун">👁️ Колдун</option>
                <option value="Волшебник">🔮 Волшебник</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono uppercase text-neutral-400">Начальный Уровень (1-10):</label>
              <input
                type="number"
                min="1"
                max="10"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
                disabled={!state.isDmMode}
                className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-xs focus:border-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* User Flag Checkbox */}
          <div className="p-3 bg-[#111] border border-amber-500/10 rounded flex items-start gap-2.5">
            <input
              type="checkbox"
              id="recruit-is-player-cb"
              checked={isPlayer}
              onChange={(e) => setIsPlayer(e.target.checked)}
              className="w-4 h-4 cursor-pointer mt-0.5 accent-amber-500"
            />
            <label htmlFor="recruit-is-player-cb" className="text-xs font-mono text-amber-500 font-bold cursor-pointer select-none">
              👤 Сделать Игроком (Ручное управление)
              <p className="text-[10px] text-neutral-500 font-normal mt-0.5 leading-normal">
                Герои с пометкой Игрока никогда не распределяются автоматическим ботом. Их можно снаряжать на задания только вручную ГМом.
              </p>
            </label>
          </div>

          {/* Footer inside modal */}
          <div className="pt-4 border-t border-emerald-500/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#161616] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-mono text-xs font-bold uppercase rounded transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-colors"
            >
              {state.isDmMode ? '⚔️ Принять бесплатно' : '⚔️ Оплатить из казны'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
