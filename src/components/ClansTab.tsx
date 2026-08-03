/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Shield, Coins, Star, Package, HelpCircle, Eye, ShoppingCart } from 'lucide-react';
import { GameState, Clan } from '../types';
import { getResourceNameRu, getMaxContractLevelForClan } from '../utils';

interface ClansTabProps {
  state: GameState;
  onSelectClan: (id: string) => void;
  onOpenStore: (id: string) => void;
}

export default function ClansTab({
  state,
  onSelectClan,
  onOpenStore
}: ClansTabProps) {
  const clans = state.clans || [];
  // Limit shown clans to state.nClans, and also append 'clan_guild' if it isn't inside that slice
  const activeClans = clans.slice(0, state.nClans).filter(c => c.id !== 'clan_guild');
  const guildClan = clans.find(c => c.id === 'clan_guild');

  const renderClanCard = (clan: Clan, isGuild: boolean = false) => {
    const maxContractLvl = getMaxContractLevelForClan(clan);
    const freeBudget = clan.freeResourceBudget !== undefined ? clan.freeResourceBudget : (clan.freeSuppliesBudget || 0);

    return (
      <div
        key={clan.id}
        className={`bg-[#0d0d0d] border rounded-lg p-5 flex flex-col justify-between shadow-lg relative transition-all ${isGuild ? 'border-amber-500/30 bg-gradient-to-b from-[#111] to-[#0a0a0a]' : 'border-emerald-500/15'}`}
      >
        <div>
          {/* Header */}
          <div className="flex justify-between items-start gap-3 mb-3">
            <div>
              <h3 className={`font-mono text-sm font-bold uppercase tracking-wider ${isGuild ? 'text-amber-500' : 'text-emerald-400'}`}>
                {clan.name}
              </h3>
              {!isGuild && (
                <div className="flex gap-0.5 mt-1.5" title={`Уровень Доверия: ${clan.trustLevel}`}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${i < (clan.trustLevel || 1) ? 'text-amber-500 fill-amber-500' : 'text-neutral-700'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="text-right">
              {isGuild ? (
                <span className="px-2 py-0.5 bg-amber-950/20 border border-amber-500/30 text-amber-500 text-[9px] font-mono font-bold uppercase rounded">
                  Оверлорд-Гильдия
                </span>
              ) : (
                <span className="px-1.5 py-0.5 bg-neutral-900 border border-neutral-800 text-neutral-400 text-[9px] font-mono uppercase rounded">
                  Ранг {clan.trustLevel}
                </span>
              )}
            </div>
          </div>

          {/* Description line */}
          <p className="text-[11px] font-mono text-neutral-400 leading-snug mb-4">
            {isGuild
              ? 'Главный штаб Гроссмейстера. Получает комиссионные 15% за все симулируемые контракты.'
              : `Клиентский клан уровня доверия ${clan.trustLevel}. Доступные уровни заказов: 1..${maxContractLvl}.`}
          </p>

          {/* Core financial & stock specs */}
          <div className="space-y-2.5 bg-black/50 p-3.5 rounded-md text-xs font-mono">
            <div className="flex justify-between text-neutral-400 border-b border-neutral-900 pb-1.5">
              <span className="flex items-center gap-1">
                <Coins className="w-4 h-4 text-amber-500" />
                Казна (Золото):
              </span>
              <strong className="text-amber-500">{clan.gold}г</strong>
            </div>

            {/* Resources list */}
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[11px]">
              <div className="text-neutral-400">🎒 Припасы: <strong className="text-neutral-200">{clan.resources.Supplies || 0}</strong></div>
              <div className="text-neutral-400">⚔️ Снар: <strong className="text-neutral-200">{clan.resources.Equipment || 0}</strong></div>
              <div className="text-neutral-400">🔍 Развед: <strong className="text-neutral-200">{clan.resources.Intelligence || 0}</strong></div>
              <div className="text-neutral-400">🧪 Алхим: <strong className="text-neutral-200">{clan.resources.Alchemy || 0}</strong></div>
            </div>

            {!isGuild && (
              <div className="flex justify-between items-center text-[10px] text-emerald-400 font-bold border-t border-neutral-900 pt-1.5">
                <span>🎁 Дневной лимит скидки:</span>
                <span>{freeBudget} ед.</span>
              </div>
            )}
          </div>
        </div>

        {/* Card action controls */}
        <div className="flex gap-2.5 mt-5 pt-3 border-t border-neutral-900 font-mono text-xs">
          <button
            onClick={() => onSelectClan(clan.id)}
            className="flex-1 py-1.5 bg-[#161616] hover:bg-[#222] border border-emerald-500/10 hover:border-emerald-500/30 text-neutral-300 rounded text-center cursor-pointer transition-all flex items-center justify-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Досье</span>
          </button>
          
          {!isGuild && (
            <button
              onClick={() => onOpenStore(clan.id)}
              className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded text-center cursor-pointer transition-all flex items-center justify-center gap-1"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Закупка</span>
            </button>
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Intro section */}
      <div className="flex items-center gap-2 bg-[#0d0d0d] border border-emerald-500/10 p-4 rounded-lg">
        <Shield className="w-5 h-5 text-emerald-400 animate-spin-slow" />
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-300">
          Управление Посольствами, Казначействами и складами Квестов
        </span>
      </div>

      {/* Grid of clans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Render Guild 1st if in GM Mode */}
        {state.isDmMode && guildClan && renderClanCard(guildClan, true)}

        {/* Render client clans */}
        {activeClans.map(clan => renderClanCard(clan, false))}

      </div>

    </div>
  );
}
