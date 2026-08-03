/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Calendar, Compass, Search, HelpCircle, Shield, AlertTriangle } from 'lucide-react';
import { Mission, Clan, GameState } from '../types';
import { willMissionExpireAfterDay } from '../domain/missions';
import { getResourceNameRu, getTypeRu } from '../utils';

interface MissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMissionId: string | null;
  state: GameState;
  onUseIntel: (clanId: string) => void;
  onAssignContract: () => void;
  onDeleteMission?: (missionId: string) => void;
}

export default function MissionModal({
  isOpen,
  onClose,
  selectedMissionId,
  state,
  onUseIntel,
  onAssignContract,
  onDeleteMission
}: MissionModalProps) {
  if (!isOpen || !selectedMissionId) return null;

  const m = state.missions.find(x => x.id === selectedMissionId);
  if (!m) return null;

  const isUrgent = willMissionExpireAfterDay(m);
  const isRevealed = state.isDmMode || m.intelRevealed;

  // Find clans with at least 1 intelligence
  const eligibleClans = state.clans.filter(c => c.id !== 'clan_guild' && (c.resources.Intelligence || 0) >= 1);

  const handleIntelConfirm = () => {
    const sel = document.getElementById('select-intel-clan') as HTMLSelectElement;
    if (sel && sel.value) {
      onUseIntel(sel.value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <h2 className="text-emerald-400 font-mono text-sm font-bold tracking-wider uppercase flex items-center gap-2">
            <Compass className={`w-5 h-5 ${isUrgent ? 'text-rose-500 animate-spin' : 'text-emerald-500'}`} />
            Донесение: {m.title}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Metadata badges */}
          <div className="flex gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${isUrgent ? 'bg-rose-950/35 border border-rose-500 text-rose-400 animate-pulse' : 'bg-emerald-950/35 border border-emerald-500/40 text-emerald-400'}`}>
              <Calendar className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {m.lifespan === null ? 'Без срока' : `Осталось дней: ${m.lifespan}`}
            </span>
            <span className="px-2 py-0.5 bg-[#161616] border border-neutral-700 rounded text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
              Регион: {m.region}
            </span>
          </div>

          {/* Description */}
          <p className="text-neutral-200 text-sm leading-relaxed font-mono">
            {m.desc}
          </p>

          {/* Secret / Revealed Data Box */}
          {isRevealed ? (
            <div className="bg-emerald-950/10 border border-emerald-500/40 p-4 rounded-md space-y-3">
              <div className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-4 h-4 text-emerald-400" />
                Рассекреченные Данные (Разведка Клана):
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono">
                <div className="text-neutral-400 col-span-2">Тип события: <span className="text-white font-bold">{getTypeRu(m.type)}</span></div>
                
                {m.type === 'DUMMY' ? (
                  <div className="text-neutral-300 col-span-2 bg-neutral-900/60 p-2.5 rounded border border-neutral-700/50 text-xs font-mono">
                    ℹ️ <span className="text-amber-300 font-semibold">Ложное донесение:</span> Ресурсы и проверки не требуются. Если приключенцы отправятся сюда, они вернутся невредимыми.
                  </div>
                ) : m.checks && m.checks.length > 0 ? (
                  <div className="text-neutral-400 col-span-2 space-y-1">
                    <div className="text-emerald-400 font-bold uppercase text-[10px] tracking-wider mt-1 mb-1">Этапы миссии ({m.checks.length}):</div>
                    {m.checks.map((ch, idx) => (
                      <div key={idx} className="pl-2 border-l border-emerald-500/30 text-white flex justify-between items-center bg-black/25 px-2 py-1 rounded">
                        <span>Этап {idx + 1}: <span className="text-amber-400 font-bold">DC {ch.dc}</span></span>
                        {ch.reqResource && ch.reqResource !== 'None' ? (
                          <span className="text-neutral-400 text-[10px]">Ресурс: <span className="text-emerald-400 underline">{getResourceNameRu(ch.reqResource)}</span></span>
                        ) : (
                          <span className="text-neutral-500 text-[10px]">Ресурса обхода нет</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="text-neutral-400">Сложность (DC): <span className="text-amber-400 font-bold">DC {m.dc}</span></div>
                    <div className="text-neutral-400 col-span-2">
                      Ключевой ресурс: <span className="text-emerald-400 font-bold underline">{getResourceNameRu(m.reqResource)}</span>
                    </div>
                  </>
                )}
                
                {m.requiredSpecialItem && (
                  <div className="text-amber-400 font-bold col-span-2 bg-amber-950/20 border border-amber-500/30 p-2 rounded text-xs mt-1 flex items-center gap-1.5">
                    <span>💎 Требуется особый предмет для старта: <strong className="text-amber-300 underline">{m.requiredSpecialItem}</strong></span>
                  </div>
                )}

                <div className="text-neutral-400 col-span-2 mt-2 pt-2 border-t border-emerald-500/10">
                  Награда за успех: <span className="text-amber-500 font-bold">{m.type === 'DUMMY' ? '0г' : (m.goldReward !== undefined ? `${m.goldReward}г` : `${state.hCost * 2}г`)}</span>
                  {m.rewardSpecialItems && m.rewardSpecialItems.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 items-center">
                      <span className="text-neutral-400 text-[10px]">Особые предметы:</span>
                      {m.rewardSpecialItems.map(item => (
                        <span key={item} className="px-1.5 py-0.5 bg-purple-950/30 border border-purple-500/30 rounded text-[10px] text-purple-400 font-bold">
                          💎 {item}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.unlocksMissionIds && m.unlocksMissionIds.length > 0 && (
                    <div className="mt-1.5 text-[10px] text-blue-400 font-bold flex items-center gap-1">
                      <span>🔗 Открывает цепочку квестов после успешного выполнения!</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#141414] border border-dashed border-neutral-700 p-4 rounded-md flex flex-col items-center justify-center text-center gap-2">
              <HelpCircle className="w-8 h-8 text-neutral-500" />
              <div className="text-neutral-300 font-mono text-xs font-bold uppercase tracking-wider">Параметры скрыты туманом войны</div>
              <p className="text-[11px] text-neutral-500 font-mono max-w-[280px]">
                ГМ видит параметры автоматически. Обычные игроки должны задействовать разведданные.
              </p>
            </div>
          )}

          {/* Active Contract on this mission */}
          {(() => {
            const activeContract = state.contracts.find(c => c.missionId === selectedMissionId);
            if (!activeContract) return null;
            const customerClan = state.clans.find(c => c.id === activeContract.clanId)?.name || 'Гильдия';
            return (
              <div className="bg-[#121212] border border-emerald-500/40 p-4 rounded-md space-y-2 font-mono">
                <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>📜 Активный Контракт Оформлен</span>
                  <span className="text-[10px] text-amber-500">Ур. {activeContract.contractLevel} • {activeContract.paymentAmount}г</span>
                </div>
                <div className="text-xs text-neutral-300">
                  Заказчик: <strong className="text-white">{customerClan}</strong>
                </div>
                {activeContract.attachedResources && activeContract.attachedResources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeContract.attachedResources.map(r => (
                      <span key={r} className="px-1.5 py-0.5 bg-emerald-950/30 border border-emerald-500/30 rounded text-[10px] text-emerald-400 font-bold uppercase">
                        {getResourceNameRu(r)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-900 flex justify-between">
                  <span>Назначено бойцов: <strong className="text-emerald-400">{activeContract.partyAdvIds.length} / {activeContract.maxPartySize}</strong></span>
                  {activeContract.partyAdvIds.length > 0 && (
                    <span className="truncate max-w-[200px]">
                      ({activeContract.partyAdvIds.map(id => state.adventurers.find(a => a.id === id)?.name).filter(Boolean).join(', ')})
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Intelligence Action Box */}
          <div className="border-t border-emerald-500/10 pt-4">
            {isRevealed ? (
              <p className="text-xs font-mono text-emerald-500/80 bg-emerald-950/10 border border-emerald-500/20 p-2.5 rounded text-center">
                ✨ Все механические параметры этой миссии успешно разведаны!
              </p>
            ) : eligibleClans.length > 0 ? (
              <div className="space-y-3">
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Задействовать 1 ед. Разведданных:</div>
                <div className="flex gap-2">
                  <select
                    id="select-intel-clan"
                    className="flex-1 bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded font-mono text-xs outline-none focus:border-emerald-500"
                  >
                    {eligibleClans.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Казна: {c.resources.Intelligence} ед.)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleIntelConfirm}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded cursor-pointer transition-all shrink-0"
                  >
                    Разведать
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 items-start bg-rose-950/10 border border-rose-500/20 p-3 rounded">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-mono text-rose-400">
                  ⚠️ Ни у одного из кланов нет в наличии 1 ед. Разведданных! Закупите данный ресурс в Посольстве кланов.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-500/20 bg-[#080808] flex justify-between items-center gap-3">
          <div>
            {state.isDmMode && onDeleteMission && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Вы уверены, что хотите бесследно удалить это донесение и все его контракты?')) {
                    onDeleteMission(m.id);
                  }
                }}
                className="px-3 py-2 bg-rose-950/40 border border-rose-500 hover:bg-rose-900/40 text-rose-400 font-mono text-xs font-bold uppercase rounded transition-colors"
              >
                Удалить донесение (ГМ)
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#161616] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-mono text-xs font-bold uppercase rounded transition-colors"
            >
              Закрыть
            </button>
            <button
              onClick={onAssignContract}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-colors"
            >
              Оформить контракт
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
