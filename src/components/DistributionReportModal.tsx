import React from 'react';
import { createPortal } from 'react-dom';
import { Coins, FileSearch, Scale, Users, X } from 'lucide-react';
import type { Adventurer, Clan, Contract, DistributionReport } from '../types';
import {
  getAdventurerPaymentShare,
  getAttachedResourcesValue,
  getPartyLevelSum
} from '../domain/economy';

interface DistributionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DistributionReport | null | undefined;
  contracts: Contract[];
  adventurers: Adventurer[];
  clans: Clan[];
  hCost: number;
}

export default function DistributionReportModal({
  isOpen,
  onClose,
  report,
  contracts,
  adventurers,
  clans,
  hCost
}: DistributionReportModalProps) {
  if (!isOpen || !report) return null;

  const contractsByMission = new Map(contracts.map(contract => [contract.missionId, contract]));
  const adventurersById = new Map(adventurers.map(adventurer => [adventurer.id, adventurer]));
  const playerContracts = contracts.filter(contract => contract.confirmed && contract.clanId !== 'clan_guild');

  return createPortal(
    <div className="fixed inset-0 z-[2100] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-hidden bg-[#0b0b0b] border border-emerald-500/30 rounded-xl shadow-2xl flex flex-col">
        <header className="p-5 border-b border-emerald-500/20 flex items-start justify-between gap-4 bg-black/60">
          <div>
            <h2 className="text-emerald-400 font-mono font-bold uppercase tracking-wider flex items-center gap-2">
              <FileSearch className="w-5 h-5" />
              Закрытый рапорт распределения
            </h2>
            <p className="text-[11px] text-neutral-500 font-mono mt-1">
              Только для ГМа · {new Date(report.generatedAt).toLocaleString('ru-RU')}
              {report.randomSeed ? ` · Seed: ${report.randomSeed}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-950/20 rounded cursor-pointer" aria-label="Закрыть рапорт">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 space-y-7">
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard label="Доступно NPC" value={report.availableAdventurers} icon={<Users className="w-5 h-5" />} />
            <SummaryCard label="Нанято" value={report.assignedAdventurers} icon={<Scale className="w-5 h-5" />} accent="emerald" />
            <SummaryCard label="Осталось в резерве" value={report.unassignedAdventurers} icon={<Users className="w-5 h-5" />} accent="amber" />
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-mono font-bold text-neutral-200 uppercase">Состояние контрактов</h3>
              <p className="text-[11px] text-neutral-500 mt-1">Реальные доли оплаты и ценность подготовки после завершения рынка.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {playerContracts.map(contract => {
                const party = contract.partyAdvIds
                  .map(id => adventurersById.get(id))
                  .filter((member): member is Adventurer => Boolean(member));
                const levelSum = getPartyLevelSum(party);
                const preparationValue = getAttachedResourcesValue(contract.attachedResources, hCost);
                const clan = clans.find(item => item.id === contract.clanId);
                return (
                  <article key={contract.missionId} className="bg-[#111] border border-emerald-500/15 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between gap-3">
                      <div>
                        <h4 className="font-mono font-bold text-neutral-200">{contract.title}</h4>
                        <p className="text-[10px] text-neutral-500 uppercase mt-0.5">{clan?.name ?? 'Неизвестный заказчик'} · ранг {contract.contractLevel}</p>
                      </div>
                      <span className="text-xs text-emerald-400 font-mono whitespace-nowrap">{party.length}/{contract.maxPartySize}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <Metric label="Оплата" value={`${contract.paymentAmount}г`} />
                      <Metric label="Сумма уровней" value={String(levelSum)} />
                      <Metric label="Подготовка" value={`+${preparationValue}г`} />
                    </div>

                    {party.length === 0 ? (
                      <p className="text-xs text-rose-400 bg-rose-950/10 border border-rose-500/20 rounded p-2">Отряд не собран.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {party.map(member => (
                          <div key={member.id} className="flex items-center justify-between gap-3 bg-black/50 border border-neutral-800 px-2.5 py-2 rounded font-mono text-xs">
                            <span className="text-neutral-300">{member.name} <small className="text-neutral-600">ур. {member.level}</small></span>
                            <span className="text-amber-400 flex items-center gap-1"><Coins className="w-3 h-3" />{getAdventurerPaymentShare(contract.paymentAmount, member, party).toFixed(1)}г</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-mono font-bold text-neutral-200 uppercase">Решения приключенцев</h3>
              <p className="text-[11px] text-neutral-500 mt-1">Раскрывает личную ценность предложений и причины отказа.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {report.decisions.map(decision => {
                const selected = decision.selectedMissionId ? contractsByMission.get(decision.selectedMissionId) : null;
                return (
                  <details key={decision.adventurerId} className="group bg-[#101010] border border-neutral-800 open:border-emerald-500/30 rounded-lg">
                    <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3 font-mono text-xs">
                      <span className="text-neutral-200 font-bold">{decision.adventurerName}</span>
                      <span className={selected ? 'text-emerald-400' : 'text-amber-400'}>
                        {selected ? `Выбран: ${selected.title}` : 'Остался в резерве'}
                      </span>
                    </summary>
                    <div className="px-3 pb-3 space-y-1.5">
                      {decision.candidates
                        .filter(candidate => contractsByMission.get(candidate.contractMissionId)?.clanId !== 'clan_guild')
                        .sort((a, b) => b.perceivedValue - a.perceivedValue)
                        .map(candidate => {
                          const candidateContract = contractsByMission.get(candidate.contractMissionId);
                          const isSelected = candidate.contractMissionId === decision.selectedMissionId;
                          return (
                            <div key={candidate.contractMissionId} className={`p-2.5 rounded border text-[11px] font-mono ${isSelected ? 'bg-emerald-950/15 border-emerald-500/30' : 'bg-black/40 border-neutral-800'}`}>
                              <div className="flex justify-between gap-2">
                                <strong className="text-neutral-300">{candidateContract?.title ?? candidate.contractMissionId}</strong>
                                <span className="text-emerald-400">Ценность {candidate.perceivedValue.toFixed(1)}</span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 mt-1 text-neutral-500">
                                <span>Отношения: +{candidate.relationBonus.toFixed(1)}</span>
                                <span>Расчётная доля: {candidate.offeredShare.toFixed(1)}г</span>
                              </div>
                              {!candidate.eligible && candidate.reason && <p className="text-rose-400 mt-1">{candidate.reason}</p>}
                            </div>
                          );
                        })}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SummaryCard({ label, value, icon, accent = 'neutral' }: { label: string; value: number; icon: React.ReactNode; accent?: 'neutral' | 'emerald' | 'amber' }) {
  const color = accent === 'emerald' ? 'text-emerald-400 border-emerald-500/20' : accent === 'amber' ? 'text-amber-400 border-amber-500/20' : 'text-neutral-300 border-neutral-800';
  return (
    <div className={`bg-[#111] border rounded-lg p-4 flex items-center justify-between ${color}`}>
      <div><p className="text-[10px] text-neutral-500 uppercase font-mono">{label}</p><strong className="text-2xl font-mono">{value}</strong></div>
      {icon}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-black/50 border border-neutral-800 rounded p-2"><span className="block text-[9px] text-neutral-600 uppercase">{label}</span><strong className="text-neutral-300 text-xs">{value}</strong></div>;
}
