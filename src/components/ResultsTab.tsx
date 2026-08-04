/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Calendar, CheckCircle, XCircle, Search, Clock, Shield, Coins, AlertTriangle, Edit2, Check, X } from 'lucide-react';
import { BasicResourceKey, Contract, GameState, SimulationReport } from '../types';
import { recalculateReportEffects } from '../domain/reportEffects';
import { reconcileScenarioHistory } from '../domain/day';
import { getResourceNameRu } from '../utils';

interface ResultsTabProps {
  state: GameState;
  updateState: (newState: Partial<GameState>) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export default function ResultsTab({ state, updateState, showToast }: ResultsTabProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editingReportIdx, setEditingReportIdx] = useState<number | null>(null);

  // Form states for GM Editing
  const [editSuccess, setEditSuccess] = useState<boolean>(false);
  const [editBaseObjective, setEditBaseObjective] = useState<boolean>(false);
  const [editRewardGranted, setEditRewardGranted] = useState<boolean>(false);
  const [editNarrative, setEditNarrative] = useState<string>('');
  const [editAutoSuccess, setEditAutoSuccess] = useState<boolean>(false);
  const [editAutoReason, setEditAutoReason] = useState<string>('');
  const [editRoll, setEditRoll] = useState<number>(10);
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editDc, setEditDc] = useState<number>(10);
  const [editGold, setEditGold] = useState<number>(0);
  const [editDamage, setEditDamage] = useState<number>(0);
  const [editSquadIds, setEditSquadIds] = useState<string[]>([]);
  const [editReturnedIds, setEditReturnedIds] = useState<string[]>([]);
  const [editResources, setEditResources] = useState<string[]>([]);

  const history = state.history || [];

  const handleSelectDay = (day: number) => {
    setSelectedDay(selectedDay === day ? null : day);
    setEditingReportIdx(null);
  };

  const startEditing = (idx: number, rep: SimulationReport) => {
    setEditingReportIdx(idx);
    setEditSuccess(rep.isSuccess);
    setEditBaseObjective(rep.baseObjectiveCompleted ?? rep.isSuccess);
    setEditRewardGranted(rep.rewardGranted ?? rep.isSuccess);
    setEditNarrative(rep.narrativeText);
    setEditAutoSuccess(rep.isResourceAutoSuccess);
    setEditAutoReason(rep.autoSuccessReason || '');
    setEditRoll(rep.roll);
    setEditBonus(rep.partyBonus);
    setEditDc(rep.dc);
    setEditGold(rep.goldReward);
    setEditDamage(rep.damageDealt);
    setEditSquadIds(rep.squadAdvIds || []);
    setEditReturnedIds(rep.returnedAdventurerIds ?? rep.squadAdvIds ?? []);
    setEditResources(rep.attachedResourcesUsed || []);
  };

  const handleApplyChanges = (idx: number, originalRep: SimulationReport) => {
    if (!selectedDay) return;
    const context = originalRep.context;
    if (!context || originalRep.isExpired) {
      showToast('Этот старый или просроченный рапорт не содержит данных для безопасного пересчёта.', true);
      return;
    }

    const activeContract = selectedDay === state.day
      ? state.contracts.find(contract => contract.missionId === originalRep.missionId)
      : undefined;
    const reportContract: Contract = activeContract ?? {
      missionId: originalRep.missionId,
      title: originalRep.missionTitle,
      clanId: context.clanId,
      confirmed: true,
      contractLevel: context.contractLevel,
      paymentAmount: 0,
      maxPartySize: context.maxPartySize,
      attachedResources: [...context.attachedResources],
      partyAdvIds: [...originalRep.squadAdvIds]
    };
    const finalSuccess = editAutoSuccess ? true : editSuccess;
    const editedReport: SimulationReport = {
      ...originalRep,
      isSuccess: finalSuccess,
      isResourceAutoSuccess: editAutoSuccess,
      autoSuccessReason: editAutoSuccess ? editAutoReason || 'Особое снаряжение' : null,
      roll: editRoll,
      partyBonus: editBonus,
      totalRoll: editRoll + editBonus,
      dc: editDc,
      goldReward: editGold,
      rewardGranted: editRewardGranted && finalSuccess,
      rewardAwardedAmount: editRewardGranted && finalSuccess ? editGold : 0,
      rewardRecipientClanId: context.clanId,
      damageDealt: editDamage,
      narrativeText: editNarrative,
      squadAdvIds: editSquadIds,
      returnedAdventurerIds: editReturnedIds.filter(id => editSquadIds.includes(id)),
      attachedResourcesUsed: editResources,
      baseObjectiveCompleted: editBaseObjective
    };
    const recalculated = originalRep.invalidated
      ? { report: { ...editedReport, invalidated: true, effects: originalRep.effects }, adventurers: state.adventurers, clans: state.clans }
      : recalculateReportEffects({
          originalReport: originalRep,
          editedReport,
          contract: reportContract,
          mission: context.mission,
          adventurers: state.adventurers,
          clans: state.clans,
          day: selectedDay
        });
    const updatedHistory = history.map(dayEntry => dayEntry.day !== selectedDay ? dayEntry : {
      ...dayEntry,
      reports: dayEntry.reports.map((report, reportIndex) => reportIndex === idx ? recalculated.report : report)
    });
    const updatedContracts = selectedDay === state.day
      ? state.contracts.map(contract => contract.missionId === originalRep.missionId
          ? { ...contract, simulationReport: recalculated.report }
          : contract
        )
      : state.contracts;
    const scenarioProgress = reconcileScenarioHistory({
      allMissions: state.allMissions,
      missions: state.missions,
      contracts: updatedContracts,
      history: updatedHistory,
      currentDay: state.day,
      adventurers: recalculated.adventurers,
      clans: recalculated.clans
    });

    updateState({
      adventurers: scenarioProgress.adventurers,
      clans: scenarioProgress.clans,
      contracts: updatedContracts,
      history: scenarioProgress.history,
      missions: scenarioProgress.missions,
      completedMissionIds: scenarioProgress.completedMissionIds,
      closedMissionIds: scenarioProgress.closedMissionIds,
      expiredMissionIds: scenarioProgress.expiredMissionIds
    });

    showToast('Рапорт изменён: все игровые последствия пересчитаны.');
    setEditingReportIdx(null);
  };

  const toggleHeroInSquad = (heroId: string) => {
    if (editSquadIds.includes(heroId)) {
      setEditSquadIds(editSquadIds.filter(id => id !== heroId));
      setEditReturnedIds(editReturnedIds.filter(id => id !== heroId));
    } else {
      setEditSquadIds([...editSquadIds, heroId]);
      setEditReturnedIds([...new Set([...editReturnedIds, heroId])]);
    }
  };

  const toggleHeroReturned = (heroId: string) => {
    if (!editSquadIds.includes(heroId)) return;
    setEditReturnedIds(editReturnedIds.includes(heroId)
      ? editReturnedIds.filter(id => id !== heroId)
      : [...editReturnedIds, heroId]
    );
  };

  const adjustResourceCount = (resource: BasicResourceKey, delta: 1 | -1, attached: BasicResourceKey[]) => {
    const usedCount = editResources.filter(item => item === resource).length;
    const availableCount = attached.filter(item => item === resource).length;
    if (delta > 0) {
      if (usedCount < availableCount) setEditResources([...editResources, resource]);
      return;
    }
    const index = editResources.lastIndexOf(resource);
    if (index >= 0) setEditResources(editResources.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="space-y-6">
      
      {/* Tab intro */}
      <div className="flex items-center gap-2 bg-[#0d0d0d] border border-emerald-500/10 p-4 rounded">
        <Clock className="w-5 h-5 text-emerald-500 animate-pulse" />
        <span className="font-mono text-xs uppercase text-neutral-300">
          Архив Проведенных Экспедиций и Тактических Рапортов
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col (1 Column): Historical Days List */}
        <div className="bg-[#0d0d0d] border border-emerald-500/10 p-5 rounded-lg space-y-4">
          <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider border-b border-emerald-500/5 pb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-500" />
            Список Ходов (Дней)
          </h3>

          <div className="space-y-2 overflow-y-auto max-h-[450px] pr-1">
            {history.length === 0 ? (
              <span className="text-neutral-500 font-mono text-xs text-center block py-12">Нет завершенных дней. Проведите симуляцию в Фазе 3!</span>
            ) : (
              [...history].reverse().map(h => {
                const isSelected = selectedDay === h.day;
                const successes = h.reports.filter(r => r.isSuccess && !r.invalidated).length;
                const fails = h.reports.filter(r => !r.isSuccess && !r.isExpired && !r.invalidated).length;

                return (
                  <div
                    key={h.day}
                    onClick={() => handleSelectDay(h.day)}
                    className={`p-3 bg-[#121212] border rounded cursor-pointer transition-all flex justify-between items-center select-none font-mono text-xs ${isSelected ? 'border-emerald-500 text-emerald-300 bg-emerald-950/5' : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'}`}
                  >
                    <div className="space-y-1">
                      <strong className="text-neutral-200 text-sm block">Рапорт: День {h.day}</strong>
                      <div className="text-[10px] text-neutral-500 uppercase">Экспедиций: {h.contractsCount}</div>
                    </div>

                    <div className="text-right space-y-1 font-mono text-[10px]">
                      <span className="text-emerald-400 font-bold block">Успехов: {successes}</span>
                      <span className="text-rose-400 font-bold block">Провалов: {fails}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col (2 Columns): Detail reports view */}
        <div className="lg:col-span-2 bg-[#0d0d0d] border border-emerald-500/10 p-6 rounded-lg space-y-4">
          <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider border-b border-emerald-500/5 pb-2">
            {selectedDay ? `Детальный отчет симуляции дня ${selectedDay}` : 'Выберите день в левой колонке для просмотра'}
          </h3>

          {!selectedDay ? (
            <div className="py-24 text-center font-mono text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
              <Search className="w-10 h-10 text-neutral-600" />
              <span>Исторические сводки не выбраны. Кликните на день слева, чтобы открыть тактическую архивацию.</span>
            </div>
          ) : (
            <div className="space-y-6 overflow-y-auto max-h-[600px] pr-2">
              {(() => {
                const dayEntry = history.find(h => h.day === selectedDay);
                if (!dayEntry) return null;

                return (
                  <div className="space-y-6">
                    
                    {/* Expedition Cards */}
                    <div className="space-y-4">
                      <span className="text-xs text-neutral-400 font-mono uppercase block font-bold">Рапорты экспедиционных отрядов:</span>
                      
                      {dayEntry.reports.length === 0 ? (
                        <p className="text-neutral-500 font-mono text-xs italic">Экспедиции отсутствовали или не симулировались.</p>
                      ) : (
                        dayEntry.reports.map((rep, idx) => {
                          if (rep.isExpired) return null;

                          const isEditing = editingReportIdx === idx;

                          return (
                            <div
                              key={idx}
                              className={`p-4 bg-[#121212] border rounded-lg space-y-3 font-mono text-xs ${rep.invalidated ? 'border-amber-500/40 opacity-75' : rep.isSuccess ? 'border-emerald-500/30' : 'border-rose-500/30'}`}
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <h4 className="font-bold text-sm text-neutral-200">{rep.missionTitle}</h4>
                                  <span className="text-[10px] text-neutral-500 uppercase block mt-0.5">Клан: {rep.clanName} | Регион: {rep.missionRegion}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {state.isDmMode && !isEditing && (
                                    <button
                                      onClick={() => startEditing(idx, rep)}
                                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-500 font-bold uppercase rounded text-[10px] flex items-center gap-1 transition-all"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      Редактировать
                                    </button>
                                  )}

                                  {rep.isSuccess ? (
                                    <span className="px-2 py-0.5 bg-emerald-950/25 border border-emerald-500 text-emerald-400 text-[10px] font-bold uppercase rounded flex items-center gap-1">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Успех
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-rose-950/25 border border-rose-500 text-rose-400 text-[10px] font-bold uppercase rounded flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      Провал
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Normal non-editing view */}
                              {!isEditing && (
                                <>
                                  {rep.invalidated && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">⚠️ Последствия этого рапорта отменены: {rep.invalidationReason}</div>}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-black/60 p-2.5 rounded text-[10px] text-neutral-400">
                                    {rep.isResourceAutoSuccess ? (
                                      <div className="col-span-4 text-emerald-400 font-bold">
                                        ✨ {rep.autoSuccessReason}
                                      </div>
                                    ) : (
                                      <>
                                        <div>Бросок d20: <strong className="text-white">{rep.roll}</strong></div>
                                        <div>Бонус Уровней: <strong className="text-emerald-400">+{rep.partyBonus}</strong></div>
                                        <div>DC Проверки: <strong className="text-amber-500">DC {rep.dc}</strong></div>
                                        <div>Итоговый бросок: <strong className={rep.isSuccess ? 'text-emerald-400' : 'text-rose-500'}>{rep.totalRoll}</strong></div>
                                      </>
                                    )}
                                  </div>

                                  {rep.checkResults && rep.checkResults.length > 0 && (
                                    <div className="bg-black/80 p-2.5 rounded border border-emerald-500/10 space-y-1">
                                      <span className="text-[10px] text-amber-400 font-bold uppercase block tracking-wider">
                                        Этапы миссии ({rep.checkResults.length}):
                                      </span>
                                      {rep.checkResults.map((cr, crIdx) => (
                                        <div key={crIdx} className="text-[11px] text-neutral-300 flex items-start gap-1.5">
                                          <span className="text-emerald-400 font-bold">•</span>
                                          <span>{cr}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <p className="text-neutral-300 leading-relaxed italic border-l-2 border-emerald-500/20 pl-3">
                                    {rep.narrativeText}
                                  </p>

                                  <div className="flex flex-col gap-1.5 pt-1.5 border-t border-neutral-900">
                                    <span className="text-[10px] text-neutral-500 uppercase">Участники отряда:</span>
                                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                                      {rep.squadNames.map((n, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-black border border-neutral-800 rounded text-neutral-300">
                                          🗡 {n}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center text-[10px] text-neutral-400 pt-2 border-t border-neutral-900">
                                    <span className="flex items-center gap-1">
                                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                                      Награда: <strong className="text-amber-500 text-xs">{rep.goldReward} Золота</strong> · {rep.rewardGranted ? 'выдана' : 'не выдана'}
                                    </span>
                                    {rep.damageDealt > 0 && (
                                      <span className="flex items-center gap-1 text-rose-500">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Урон героям: <strong className="text-rose-500">-{rep.damageDealt} HP</strong>
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}

                              {/* Interactive GM Editor View */}
                              {isEditing && (
                                <div className="space-y-4 p-4 bg-black/80 rounded border border-amber-500/30 text-xs font-mono">
                                  <div className="text-amber-400 font-bold uppercase tracking-wider border-b border-amber-500/10 pb-1.5 mb-3 flex items-center justify-between">
                                    <span>⚙️ Панель Редактирования ГМа</span>
                                    <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 rounded">ИЗМЕНЕНИЕ ДАННЫХ</span>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 bg-neutral-950 border border-neutral-800 rounded p-3">
                                    <div>
                                      <span className="text-neutral-300 font-bold uppercase block">Финальный результат</span>
                                      <small className="text-neutral-600">Пересчитывает опыт, отношения, HP, награды и ресурсы.</small>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSuccess = !editSuccess;
                                        setEditSuccess(nextSuccess);
                                        setEditRewardGranted(false);
                                        if (!nextSuccess) setEditAutoSuccess(false);
                                      }}
                                      className={`px-3 py-1.5 rounded border font-bold uppercase cursor-pointer ${editSuccess ? 'text-emerald-400 border-emerald-500 bg-emerald-950/20' : 'text-rose-400 border-rose-500 bg-rose-950/20'}`}
                                    >
                                      {editSuccess ? 'Успех' : 'Провал'}
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                                      <input type="checkbox" checked={editBaseObjective} onChange={event => setEditBaseObjective(event.target.checked)} />
                                      Основная задача выполнена
                                    </label>
                                    <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                                      <input type="checkbox" checked={editRewardGranted} disabled={!editSuccess} onChange={event => setEditRewardGranted(event.target.checked)} />
                                      Награда фактически выдана
                                    </label>
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <label className="text-neutral-500 text-[10px] uppercase">Художественное описание:</label>
                                    <textarea value={editNarrative} onChange={event => setEditNarrative(event.target.value)} className="min-h-20 bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-2 rounded" />
                                  </div>

                                  {/* Row 1: DC and Auto-success */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Сложность проверки (DC):</label>
                                      <input
                                        type="number"
                                        value={editDc}
                                        onChange={(e) => setEditDc(parseInt(e.target.value) || 0)}
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Бросок d20:</label>
                                      <input
                                        type="number"
                                        value={editRoll}
                                        onChange={(e) => setEditRoll(parseInt(e.target.value) || 0)}
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Бонус отряда:</label>
                                      <input
                                        type="number"
                                        value={editBonus}
                                        onChange={(e) => setEditBonus(parseInt(e.target.value) || 0)}
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded"
                                      />
                                    </div>
                                  </div>

                                  {/* Row 2: Gold, Damage, and Auto Success */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Полученная награда (г):</label>
                                      <input
                                        type="number"
                                        value={editGold}
                                        onChange={(e) => setEditGold(parseInt(e.target.value) || 0)}
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Нанесенный урон (HP):</label>
                                      <input
                                        type="number"
                                        value={editDamage}
                                        onChange={(e) => setEditDamage(parseInt(e.target.value) || 0)}
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Автоуспех:</label>
                                      <div className="flex items-center gap-2 h-8">
                                        <input
                                          type="checkbox"
                                          checked={editAutoSuccess}
                                          onChange={(e) => {
                                            setEditAutoSuccess(e.target.checked);
                                            if (e.target.checked) setEditSuccess(true);
                                          }}
                                          className="w-4 h-4 cursor-pointer"
                                        />
                                        <span className="text-neutral-400">Задействовать ресурс</span>
                                      </div>
                                    </div>
                                  </div>

                                  {editAutoSuccess && (
                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 text-[10px] uppercase">Причина автоуспеха:</label>
                                      <input
                                        type="text"
                                        value={editAutoReason}
                                        onChange={(e) => setEditAutoReason(e.target.value)}
                                        placeholder="Например, Задействовано снаряжение клана"
                                        className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2.5 py-1 rounded w-full"
                                      />
                                    </div>
                                  )}

                                  {/* Squad list selector */}
                                  <div className="flex flex-col gap-1.5 pt-1">
                                    <label className="text-neutral-500 text-[10px] uppercase block font-bold">Фактические участники:</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1 bg-black/40 p-2 rounded border border-neutral-800">
                                      {state.adventurers.map(a => {
                                        const isChecked = editSquadIds.includes(a.id);
                                        const returned = editReturnedIds.includes(a.id);
                                        return (
                                          <div
                                            key={a.id}
                                            className={`p-2 rounded border text-[10px] flex justify-between items-center gap-2 transition-all ${isChecked ? 'bg-amber-500/10 border-amber-500/60 text-amber-400 font-bold' : 'bg-transparent border-neutral-900 text-neutral-400'}`}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => toggleHeroInSquad(a.id)}
                                              className="flex-1 text-left cursor-pointer"
                                            >
                                              🛡️ {a.name} (Ур.{a.level}){a.isPlayer ? ' · Игрок' : ''}
                                            </button>
                                            {isChecked && (
                                              <button
                                                type="button"
                                                onClick={() => toggleHeroReturned(a.id)}
                                                className={`px-2 py-1 rounded border text-[9px] uppercase cursor-pointer ${returned ? 'border-emerald-500/30 text-emerald-400' : 'border-rose-500/30 text-rose-400'}`}
                                              >
                                                {returned ? 'Вернулся' : 'Не вернулся'}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-neutral-500 text-[10px] uppercase block font-bold">Фактически потраченные ресурсы:</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      {(['Supplies', 'Equipment', 'Intelligence', 'Alchemy'] as BasicResourceKey[]).map(resource => {
                                        const attached = (rep.context?.attachedResources ?? []) as BasicResourceKey[];
                                        const attachedCount = attached.filter(item => item === resource).length;
                                        const usedCount = editResources.filter(item => item === resource).length;
                                        return (
                                          <div key={resource} className="bg-black/40 border border-neutral-800 rounded p-2 text-center">
                                            <span className="block text-[9px] text-neutral-500">{getResourceNameRu(resource)} · {usedCount}/{attachedCount}</span>
                                            <div className="flex items-center justify-center gap-2 mt-1">
                                              <button type="button" disabled={usedCount === 0} onClick={() => adjustResourceCount(resource, -1, attached)} className="px-2 border border-neutral-700 disabled:opacity-30 rounded cursor-pointer">−</button>
                                              <strong>{usedCount}</strong>
                                              <button type="button" disabled={usedCount >= attachedCount} onClick={() => adjustResourceCount(resource, 1, attached)} className="px-2 border border-neutral-700 disabled:opacity-30 rounded cursor-pointer">+</button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-900">
                                    <button
                                      type="button"
                                      onClick={() => setEditingReportIdx(null)}
                                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 rounded flex items-center gap-1 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      Отмена
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyChanges(idx, rep)}
                                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Применить изменения
                                    </button>
                                  </div>
                                </div>
                              )}

                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
