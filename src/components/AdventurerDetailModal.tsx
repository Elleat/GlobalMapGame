/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Heart, Shield, Award, Users, Plus, Minus } from 'lucide-react';
import { Adventurer, Clan, GameState } from '../types';
import { getStatusNameRu, getAdvClassIcon } from '../utils';

interface AdventurerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAdvId: string | null;
  state: GameState;
  onHeal: (id: string) => void;
  onAdjustReputation: (advId: string, clanId: string, delta: number) => void;
  onUpdateAdventurer?: (id: string, updatedFields: Partial<Adventurer>) => void;
}

export default function AdventurerDetailModal({
  isOpen,
  onClose,
  selectedAdvId,
  state,
  onHeal,
  onAdjustReputation,
  onUpdateAdventurer
}: AdventurerDetailModalProps) {
  if (!isOpen || !selectedAdvId) return null;

  const adv = state.adventurers.find(a => a.id === selectedAdvId);
  if (!adv) return null;

  const classIcon = getAdvClassIcon(adv.class);
  const hpPercent = Math.max(0, Math.min(100, (adv.hp / adv.maxHp) * 100));

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <div>
            <h2 className="text-emerald-400 font-mono text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              <span className="text-base">{classIcon}</span>
              {adv.name}
            </h2>
            {state.isDmMode ? (
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase mt-1">
                <span className="text-neutral-400">{adv.class} • Уровень {adv.level} •</span>
                <select
                  value={adv.status}
                  onChange={(e) => onUpdateAdventurer?.(adv.id, { status: e.target.value as any })}
                  className="bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none"
                >
                  <option value="READY">ГОТОВ</option>
                  <option value="WOUNDED">РАНЕН</option>
                  <option value="ON_MISSION">НА МИССИИ</option>
                  <option value="DEAD">ПОГИБ</option>
                </select>
              </div>
            ) : (
              <div className="text-[10px] text-neutral-400 font-mono uppercase mt-0.5">
                {adv.class} • Уровень {adv.level} • {getStatusNameRu(adv.status)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Health & Performance Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#121212] border border-emerald-500/10 p-3 rounded space-y-2">
              <span className="text-xs font-mono text-neutral-400 uppercase flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                Здоровье (HP)
              </span>
              {state.isDmMode ? (
                <div className="flex flex-col gap-1 font-mono text-[10px] text-neutral-400">
                  <div className="flex items-center justify-between">
                    <span>Текущее:</span>
                    <input
                      type="number"
                      min="0"
                      max={adv.maxHp}
                      value={adv.hp}
                      onChange={(e) => onUpdateAdventurer?.(adv.id, { hp: Math.max(0, Math.min(adv.maxHp, parseInt(e.target.value) || 0)) })}
                      className="w-14 bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none text-right font-bold"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Максимум:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={adv.maxHp}
                      onChange={(e) => {
                        const nextMax = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                        onUpdateAdventurer?.(adv.id, { maxHp: nextMax, hp: Math.min(adv.hp, nextMax) });
                      }}
                      className="w-14 bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none text-right font-bold"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-mono text-rose-400">{adv.hp} / {adv.maxHp} HP</span>
                    <span className="text-[10px] font-mono text-neutral-500">({Math.round(hpPercent)}%)</span>
                  </div>
                  <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${adv.hp <= 1 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}
                      style={{ width: `${hpPercent}%` }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="bg-[#121212] border border-emerald-500/10 p-3 rounded space-y-2 flex flex-col justify-between">
              <span className="text-xs font-mono text-neutral-400 uppercase flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-amber-500" />
                Экспедиции
              </span>
              {state.isDmMode ? (
                <div className="flex flex-col gap-1 font-mono text-[10px] text-neutral-400">
                  <div className="flex items-center justify-between">
                    <span>Уровень:</span>
                    <select
                      value={adv.level}
                      onChange={(e) => onUpdateAdventurer?.(adv.id, { level: parseInt(e.target.value) || 1 })}
                      className="w-16 bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none font-bold"
                    >
                      <option value="1">1 Ур.</option>
                      <option value="2">2 Ур.</option>
                      <option value="3">3 Ур.</option>
                      <option value="4">4 Ур.</option>
                      <option value="5">5 Ур.</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Успехов:</span>
                    <input
                      type="number"
                      min="0"
                      value={adv.successfulMissions}
                      onChange={(e) => onUpdateAdventurer?.(adv.id, { successfulMissions: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-14 bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none text-right font-bold"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Всего:</span>
                    <input
                      type="number"
                      min="0"
                      value={adv.totalMissions}
                      onChange={(e) => onUpdateAdventurer?.(adv.id, { totalMissions: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-14 bg-black border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded outline-none text-right font-bold"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm font-bold font-mono text-amber-400">
                    Успехов: {adv.successfulMissions} / {adv.totalMissions}
                  </div>
                  <span className="text-[9px] font-mono text-neutral-500 uppercase">
                    До повышения: {(adv.level === 1) ? 1 - adv.successfulMissions : (adv.level === 2) ? 3 - adv.successfulMissions : (adv.level === 3) ? 6 - adv.successfulMissions : (adv.level === 4) ? 10 - adv.successfulMissions : 'MAX'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Faction Reputation List */}
          <div>
            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-500" />
              🏛️ Репутация в Кланах и Домах
            </h3>
            <p className="text-[10px] font-mono text-neutral-500 leading-relaxed mb-3">
              *Повышается автоматически при успешном завершении миссий с ресурсами клана без потерь в отряде.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {state.clans.map(clan => {
                const currentRep = adv.reputation?.[clan.id] || 0;
                return (
                  <div
                    key={clan.id}
                    className="flex justify-between items-center p-2.5 bg-[#141414] border border-emerald-500/10 hover:border-emerald-500/20 rounded transition-all"
                  >
                    <div>
                      <strong className="text-xs font-mono text-emerald-400">{clan.name}</strong>
                      <div className="text-[10px] font-mono text-neutral-500">
                        Фракционная репутация: <span className="text-amber-500 font-bold">+{currentRep}</span>
                      </div>
                    </div>

                    {state.isDmMode ? (
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => onAdjustReputation(adv.id, clan.id, -1)}
                          className="p-1 bg-black border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-400 rounded font-mono text-xs cursor-pointer transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-xs font-bold text-center w-6 text-neutral-200">
                          {currentRep}
                        </span>
                        <button
                          onClick={() => onAdjustReputation(adv.id, clan.id, 1)}
                          className="p-1 bg-black border border-emerald-500/20 hover:border-emerald-500 hover:text-emerald-400 text-neutral-400 rounded font-mono text-xs cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono text-sm font-bold text-amber-500">
                        +{currentRep}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-500/20 bg-[#080808] flex justify-end gap-3">
          {state.isDmMode && adv.status !== 'DEAD' && (
            <button
              onClick={() => {
                onHeal(adv.id);
                onClose();
              }}
              className="px-4 py-2 bg-emerald-950/20 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 font-mono text-xs font-bold uppercase rounded cursor-pointer transition-all"
            >
              Вылечить
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#161616] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-mono text-xs font-bold uppercase rounded transition-colors"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
}
