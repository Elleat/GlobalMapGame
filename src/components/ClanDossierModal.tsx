/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Shield, Coins, Package, Plus, Trash2 } from 'lucide-react';
import { Clan, GameState } from '../types';
import { getResourceNameRu, getMaxContractLevelForClan } from '../utils';
import { getClanExperience, getClanProgressLabel, setClanExperience } from '../domain/clanProgression';

interface ClanDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClanId: string | null;
  state: GameState;
  updateClan: (updatedClan: Clan) => void;
  onOpenStore: (clanId: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export default function ClanDossierModal({
  isOpen,
  onClose,
  selectedClanId,
  state,
  updateClan,
  onOpenStore,
  showToast
}: ClanDossierModalProps) {
  const [newItemText, setNewItemText] = useState('');

  if (!isOpen || !selectedClanId) return null;

  const clan = state.clans.find(c => c.id === selectedClanId);
  if (!clan) return null;

  // Initialize special items if missing
  const specialItems = clan.resources.specialItems || (clan.resources.AncientText ? [clan.resources.AncientText] : []);

  const handleGmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.isDmMode) return;

    const trust = parseInt((document.getElementById('cd-edit-trust') as HTMLSelectElement)?.value) || 1;
    const experience = parseInt((document.getElementById('cd-edit-experience') as HTMLInputElement)?.value) || 0;
    const gold = parseInt((document.getElementById('cd-edit-gold') as HTMLInputElement)?.value) || 0;
    const freeRes = parseInt((document.getElementById('cd-edit-freeRes') as HTMLInputElement)?.value) || 0;

    const supplies = parseInt((document.getElementById('cd-edit-Supplies') as HTMLInputElement)?.value) || 0;
    const equipment = parseInt((document.getElementById('cd-edit-Equipment') as HTMLInputElement)?.value) || 0;
    const intel = parseInt((document.getElementById('cd-edit-Intelligence') as HTMLInputElement)?.value) || 0;
    const alchemy = parseInt((document.getElementById('cd-edit-Alchemy') as HTMLInputElement)?.value) || 0;

    const updatedClan: Clan = setClanExperience({
      ...clan,
      trustLevel: trust,
      gold,
      freeResourceBudget: freeRes,
      freeSuppliesBudget: freeRes, // back-compat
      resources: {
        ...clan.resources,
        Supplies: supplies,
        Equipment: equipment,
        Intelligence: intel,
        Alchemy: alchemy,
        specialItems,
        AncientText: specialItems.join(', ')
      }
    }, experience);

    updateClan(updatedClan);
    showToast(`Параметры и ресурсы клана "${clan.name}" изменены ГМом!`);
    onClose();
  };

  const handleAddSpecialItem = () => {
    const txt = newItemText.trim();
    if (!txt) return;

    const updatedSpecialItems = [...specialItems, txt];
    const updatedClan: Clan = {
      ...clan,
      resources: {
        ...clan.resources,
        specialItems: updatedSpecialItems,
        AncientText: updatedSpecialItems.join(', ')
      }
    };

    updateClan(updatedClan);
    setNewItemText('');
    showToast(`Особый предмет "${txt}" добавлен клану ${clan.name}!`);
  };

  const handleRemoveSpecialItem = (index: number) => {
    const updatedSpecialItems = [...specialItems];
    const removedItem = updatedSpecialItems[index];
    const isReserved = state.contracts.some(contract =>
      contract.clanId === clan.id && (contract.reservedSpecialItems ?? []).includes(removedItem)
    );
    if (isReserved) {
      showToast(`Особый предмет «${removedItem}» зарезервирован активным контрактом.`, true);
      return;
    }
    updatedSpecialItems.splice(index, 1);
    
    const updatedClan: Clan = {
      ...clan,
      resources: {
        ...clan.resources,
        specialItems: updatedSpecialItems,
        AncientText: updatedSpecialItems.join(', ')
      }
    };

    updateClan(updatedClan);
    showToast(`Особый предмет "${removedItem}" удален.`);
  };

  const maxContractLvl = getMaxContractLevelForClan(clan);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <div>
            <h2 className="text-emerald-400 font-mono text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Досье Клана: {clan.name}
            </h2>
            <div className="text-[10px] text-neutral-400 font-mono uppercase mt-0.5">
              Уровень клана: {clan.trustLevel}{clan.id !== 'clan_guild' ? ` | Опыт: ${getClanExperience(clan)}` : ''} | Казна: {clan.gold} Золота
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form or Info body */}
        {state.isDmMode ? (
          <form onSubmit={handleGmSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded text-xs font-mono text-amber-500">
              👑 <strong>Редактирование Клана (ГМ):</strong> Измените числовые параметры, казначейство или ресурсы.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">Текущий уровень:</label>
                <select
                  id="cd-edit-trust"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs focus:border-emerald-500 outline-none"
                  defaultValue={clan.trustLevel}
                >
                  <option value="1">Уровень 1 (до 3 ур. контрактов)</option>
                  <option value="2">Уровень 2 (до 4 ур. контрактов)</option>
                  <option value="3">Уровень 3 (до 5 ур. контрактов)</option>
                  <option value="4">Уровень 4 (ручной уровень ГМа)</option>
                  <option value="5">Уровень 5 (ручной уровень ГМа)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">Казна Клана (Золото):</label>
                <input
                  type="number"
                  id="cd-edit-gold"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs focus:border-emerald-500 outline-none"
                  defaultValue={clan.gold}
                  min="0"
                />
              </div>
            </div>

            {clan.id !== 'clan_guild' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Опыт клана:</label>
                  <input
                    type="number"
                    id="cd-edit-experience"
                    className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs focus:border-emerald-500 outline-none"
                    defaultValue={getClanExperience(clan)}
                    min="0"
                  />
                </div>
                <div className="flex items-end pb-1 text-[10px] font-mono leading-relaxed text-neutral-500">
                  Пороги: 8 опыта — уровень 2; 24 — уровень 3. Автоповышение действует со следующего дня.
                </div>
              </div>
            )}

            <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider pt-2 border-t border-emerald-500/10">Запасы Ресурсов Клана:</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">🎒 Припасы:</label>
                <input
                  type="number"
                  id="cd-edit-Supplies"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs outline-none"
                  defaultValue={clan.resources.Supplies || 0}
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">⚔️ Снаряжение:</label>
                <input
                  type="number"
                  id="cd-edit-Equipment"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs outline-none"
                  defaultValue={clan.resources.Equipment || 0}
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">🔍 Разведданные:</label>
                <input
                  type="number"
                  id="cd-edit-Intelligence"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs outline-none"
                  defaultValue={clan.resources.Intelligence || 0}
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono uppercase text-neutral-400">🧪 Алхимия:</label>
                <input
                  type="number"
                  id="cd-edit-Alchemy"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs outline-none"
                  defaultValue={clan.resources.Alchemy || 0}
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-[10px] font-mono uppercase text-neutral-400">🎁 Выданный дневной лимит бесплатных ресурсов:</label>
                <input
                  type="number"
                  id="cd-edit-freeRes"
                  className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-1.5 rounded font-mono text-xs outline-none"
                  defaultValue={clan.freeResourceBudget !== undefined ? clan.freeResourceBudget : (clan.freeSuppliesBudget || 0)}
                  min="0"
                />
              </div>
            </div>

            {/* Special Artifacts */}
            <div className="space-y-2 pt-2 border-t border-emerald-500/10">
              <label className="text-[10px] font-mono uppercase text-neutral-400 block">📜 Особые трофеи и квестовые вещи:</label>
              
              <div className="space-y-1.5">
                {specialItems.length === 0 ? (
                  <span className="text-[11px] font-mono text-neutral-500 block">Предметов нет.</span>
                ) : (
                  specialItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center bg-[#141414] p-2 rounded border border-emerald-500/5 text-xs font-mono text-neutral-200"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialItem(index)}
                        className="text-rose-500 hover:text-rose-400 p-0.5 hover:bg-[#222] rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Добавить предмет (карта руин, идол...)"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  className="flex-1 bg-black border border-emerald-500/20 text-neutral-200 px-2.5 py-1 rounded font-mono text-xs focus:border-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddSpecialItem}
                  className="p-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded transition-colors flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Save Buttons in Footer below form */}
            <div className="pt-4 border-t border-emerald-500/10 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#161616] border border-neutral-700 text-neutral-300 font-mono text-xs font-bold uppercase rounded"
              >
                Закрыть
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)]"
              >
                Сохранить ГМ
              </button>
            </div>

          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="text-xs font-mono text-neutral-300 leading-relaxed">
              Уровень клана: <strong className="text-emerald-400">Уровень {clan.trustLevel}</strong>.<br />
              {clan.id !== 'clan_guild' && <><span className="text-neutral-500">{getClanProgressLabel(clan)}{clan.pendingTrustLevel ? `; уровень ${clan.pendingTrustLevel} вступит в силу завтра` : ''}.</span><br /></>}
              Допустимые уровни контрактов для оформления: <strong className="text-amber-500 font-bold">1..{maxContractLvl}</strong>.
            </div>

            <div className="bg-[#121212] border border-emerald-500/10 p-4 rounded space-y-3">
              <h3 className="text-xs font-mono text-amber-500 font-bold uppercase flex items-center gap-1">
                <Package className="w-4 h-4" />
                Запасы ресурсов на складе:
              </h3>
              <div className="divide-y divide-emerald-500/5 text-xs font-mono">
                <div className="py-2 flex justify-between"><span>🎒 Припасы:</span> <strong>{clan.resources.Supplies || 0} ед.</strong></div>
                {clan.id !== 'clan_guild' && (
                  <div className="py-2 flex justify-between text-emerald-400 font-bold">
                    <span>🎁 Выданный лимит (на выбор):</span>
                    <strong>{clan.freeResourceBudget !== undefined ? clan.freeResourceBudget : (clan.freeSuppliesBudget || 0)} ед.</strong>
                  </div>
                )}
                <div className="py-2 flex justify-between"><span>⚔️ Снаряжение:</span> <strong>{clan.resources.Equipment || 0} ед.</strong></div>
                <div className="py-2 flex justify-between"><span>🔍 Разведданные:</span> <strong>{clan.resources.Intelligence || 0} ед.</strong></div>
                <div className="py-2 flex justify-between"><span>🧪 Алхимия:</span> <strong>{clan.resources.Alchemy || 0} ед.</strong></div>
                
                <div className="pt-3 pb-1 space-y-1">
                  <span className="text-amber-500 font-bold block">📜 Особое:</span>
                  {specialItems.length === 0 ? (
                    <span className="text-neutral-500 text-[11px] block pl-2">нет</span>
                  ) : (
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-neutral-200 pl-2">
                      {specialItems.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="pt-4 border-t border-emerald-500/10 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#161616] border border-neutral-700 text-neutral-300 font-mono text-xs font-bold uppercase rounded"
              >
                Закрыть
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenStore(clan.id);
                }}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] cursor-pointer"
              >
                🛒 Купить ресурсы
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
