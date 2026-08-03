/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Coins, Gift, ShoppingCart, Plus } from 'lucide-react';
import { GameState, Clan } from '../types';
import { getResourceNameRu } from '../utils';
import { getActiveClansGuildFirst } from '../domain/clans';

interface ResourceStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClanId: string | null;
  state: GameState;
  onBuyResource: (clanId: string, resourceType: string) => void;
  onTransferSpecialItem: (fromClanId: string, itemIndex: number, toClanId: string) => void;
}

export default function ResourceStoreModal({
  isOpen,
  onClose,
  selectedClanId,
  state,
  onBuyResource,
  onTransferSpecialItem
}: ResourceStoreModalProps) {
  const [destinations, setDestinations] = useState<Record<number, string>>({});
  if (!isOpen || !selectedClanId) return null;

  const clan = state.clans.find(c => c.id === selectedClanId);
  if (!clan) return null;

  const h = state.hCost;
  const freeBudget = clan.freeResourceBudget !== undefined ? clan.freeResourceBudget : (clan.freeSuppliesBudget || 0);
  const hasFreeBudget = clan.id !== 'clan_guild' && freeBudget > 0;
  const transferTargets = getActiveClansGuildFirst(state.clans, state.nClans).filter(item => item.id !== clan.id);
  const reservedItems = new Set(
    state.contracts
      .filter(contract => contract.clanId === clan.id)
      .flatMap(contract => contract.reservedSpecialItems ?? [])
  );

  const multipliers: Record<string, number> = {
    'Supplies': 0.5,
    'Equipment': 1.0,
    'Intelligence': 1.0,
    'Alchemy': 1.5
  };

  const renderResourceCard = (resType: string, label: string, icon: string) => {
    const mult = multipliers[resType] || 1.0;
    const price = Math.round(mult * h);
    const stock = clan.resources[resType] || 0;

    return (
      <div className="bg-[#121212] border border-emerald-500/10 hover:border-emerald-500/20 rounded p-4 flex items-center justify-between gap-4 transition-all">
        <div>
          <div className="text-emerald-400 font-mono text-sm font-bold uppercase flex items-center gap-1.5">
            <span>{icon}</span>
            {label}
          </div>
          <div className="text-[11px] font-mono text-neutral-400 mt-1">
            Цена: <strong className="text-amber-500">{hasFreeBudget ? '🎁 Бесплатно (лимит)' : `${price}г`}</strong> | В наличии: <strong className="text-emerald-500">{stock} ед.</strong>
          </div>
        </div>

        <button
          onClick={() => onBuyResource(clan.id, resType)}
          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded flex items-center gap-1 cursor-pointer transition-all"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Купить +1
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-emerald-500/30 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-500/20 flex justify-between items-center bg-[#080808]">
          <div>
            <h2 className="text-emerald-400 font-mono text-sm font-bold tracking-wider uppercase flex items-center gap-1.5">
              <ShoppingCart className="w-5 h-5 text-emerald-500" />
              Закупка ресурсов для: {clan.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#161616] rounded text-rose-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          
          {/* Faction Financial Summary */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded font-mono text-xs space-y-1.5">
            <div className="flex justify-between text-amber-500">
              <span className="flex items-center gap-1">
                <Coins className="w-4 h-4" />
                Казна Клана:
              </span>
              <strong className="text-sm">{clan.gold} Золота</strong>
            </div>
            
            {clan.id !== 'clan_guild' && (
              <div className="flex justify-between text-emerald-400 font-bold border-t border-amber-500/10 pt-1.5">
                <span className="flex items-center gap-1">
                  <Gift className="w-4 h-4" />
                  Выданный лимит (на выбор):
                </span>
                <strong>{freeBudget} ед.</strong>
              </div>
            )}
            
            <div className="text-[10px] text-neutral-500 text-right pt-1.5 border-t border-amber-500/10">
              Базовый h = {h}г
            </div>
          </div>

          {/* Resources Options */}
          <div className="space-y-3">
            {renderResourceCard('Supplies', '🎒 Припасы', '🎒')}
            {renderResourceCard('Equipment', '⚔️ Снаряжение', '⚔️')}
            {renderResourceCard('Intelligence', '🔍 Разведданные', '🔍')}
            {renderResourceCard('Alchemy', '🧪 Алхимия', '🧪')}
          </div>

          {/* Special Items / Embassy Goods */}
          {clan.resources.specialItems && clan.resources.specialItems.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-emerald-500/10">
              <h3 className="text-amber-500 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <span>📜</span> Особые товары посольства:
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {clan.resources.specialItems.map((item, idx) => (
                  <div key={idx} className="bg-[#121212] border border-amber-500/10 hover:border-amber-500/20 rounded p-3 flex items-center justify-between gap-3 transition-all">
                    <div>
                      <div className="text-amber-400 font-mono text-xs font-bold">
                        💎 {item}
                      </div>
                      <div className="text-[9px] font-mono text-neutral-500 mt-0.5 uppercase">
                        Уникальный трофей / реликт
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={destinations[idx] ?? transferTargets[0]?.id ?? ''}
                        onChange={event => setDestinations(previous => ({ ...previous, [idx]: event.target.value }))}
                        disabled={reservedItems.has(item) || transferTargets.length === 0}
                        className="max-w-36 rounded border border-neutral-700 bg-black px-2 py-1 text-[9px] text-neutral-300 disabled:opacity-40"
                      >
                        {transferTargets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                      <button
                        onClick={() => onTransferSpecialItem(clan.id, idx, destinations[idx] ?? transferTargets[0]?.id ?? '')}
                        disabled={reservedItems.has(item) || transferTargets.length === 0}
                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-mono text-[10px] font-bold uppercase rounded flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition-all"
                        title={reservedItems.has(item) ? 'Предмет зарезервирован активным контрактом' : 'Передать другому клану'}
                      >
                        {reservedItems.has(item) ? 'В контракте' : 'Передать'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-500/20 bg-[#080808] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#161616] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 font-mono text-xs font-bold uppercase rounded transition-colors"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
}
