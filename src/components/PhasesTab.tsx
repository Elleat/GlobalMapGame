/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileText, Users, Play, CheckCircle, XCircle, ArrowRight, Shield, Coins, RefreshCw, Trash2 } from 'lucide-react';
import { GameState, Contract, SimulationReport, BasicResourceKey } from '../types';
import {
  getContractTargetPartySize,
  getMaxContractLevelForClan,
  getResourceNameRu,
  getStatusNameRu,
  getTypeRu,
  generateMissionsForDay,
  ensureAdventurerRosterForClans
} from '../utils';
import {
  clanHasSpecialItem,
  getComplicationPositionLabel,
  getMissionGoldReward,
  getReservedSpecialItems,
  getRequiredSpecialItems,
  isBasicResource,
  willMissionExpireAfterDay
} from '../domain/missions';
import {
  getAttachedResourcesValue,
  getDefaultContractPayment,
  getGuildDailyFunding,
  getGuildCommission
} from '../domain/economy';
import { distributePlayerContracts } from '../domain/distribution';
import { createDaySeed, createSeededRandom } from '../domain/random';
import DistributionReportModal from './DistributionReportModal';
import RetreatReportBlock from './RetreatReportBlock';
import { performGuildActions } from '../domain/guild';
import { simulateDayContracts } from '../domain/simulation';
import { advanceMissionLifecycle, reconcileScenarioHistory, upsertReportInHistory } from '../domain/day';
import { recalculateReportEffects } from '../domain/reportEffects';
import { activatePendingClanLevel } from '../domain/clanProgression';
import { findMapRegionAtPoint } from '../domain/mapRegions';
import { getMissionPresentation, getScoutingClanNames } from '../domain/missionPresentation';
import { getActivePlayerClans } from '../domain/clans';
import ReportParticipantsEditor from './ReportParticipantsEditor';

interface PhasesTabProps {
  state: GameState;
  updateState: (newState: Partial<GameState>) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onOpenStore: (clanId: string) => void;
  onRedirectToReports?: () => void;
  onSelectAdventurer?: (id: string) => void;
}

export default function PhasesTab({
  state,
  updateState,
  showToast,
  onOpenStore,
  onRedirectToReports,
  onSelectAdventurer
}: PhasesTabProps) {
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const [selectedClanId, setSelectedClanId] = useState('');
  const [contractLevel, setContractLevel] = useState(1);
  const [maxPartySize, setMaxPartySize] = useState(5);
  const [attachedResources, setAttachedResources] = useState<BasicResourceKey[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(getDefaultContractPayment(1, state.hCost));
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editingReportData, setEditingReportData] = useState<Partial<SimulationReport> | null>(null);
  const [isDistributionReportOpen, setIsDistributionReportOpen] = useState(false);

  // Sync selectedMissionId deep link from map
  useEffect(() => {
    if (state.selectedMissionId) {
      const alreadyHasContract = state.contracts.some(c => c.missionId === state.selectedMissionId);
      if (!alreadyHasContract) {
        handleMissionChange(state.selectedMissionId);
      }
    }
  }, [state.selectedMissionId]);

  const currentPhase = state.currentPhase;

  // Active clans (excluding Guild itself)
  const playableClans = getActivePlayerClans(state.clans, state.nClans);
  
  // Available missions that do NOT already have a contract
  const activeContractsMissionIds = new Set(state.contracts.map(c => c.missionId));
  const availableMissions = state.missions.filter(m => !activeContractsMissionIds.has(m.id));

  // Handle selected mission change in Phase 1
  const handleMissionChange = (mId: string) => {
    setSelectedMissionId(mId);
    const m = state.missions.find(x => x.id === mId);
    if (m && m.dc) {
      // Suggest level based on DC
      const suggestedLvl = Math.max(1, Math.min(5, Math.ceil(m.dc / 4)));
      setContractLevel(suggestedLvl);
      setPaymentAmount(getDefaultContractPayment(suggestedLvl, state.hCost));
    }
  };

  // Handle level change in Phase 1
  const handleLevelChange = (lvl: number) => {
    setContractLevel(lvl);
    setPaymentAmount(getDefaultContractPayment(lvl, state.hCost));
  };

  const handleAddResource = (resType: BasicResourceKey) => {
    if (attachedResources.length >= maxPartySize) {
      showToast(`Максимум ресурсов на миссию: ${maxPartySize} (по 1 на участника)!`, true);
      return;
    }
    const clan = state.clans.find(item => item.id === selectedClanId);
    const selectedCount = attachedResources.filter(resource => resource === resType).length;
    const availableCount = Number(clan?.resources[resType] || 0);
    if (selectedCount >= availableCount) {
      showToast(`На складе недостаточно ресурса «${getResourceNameRu(resType)}».`, true);
      return;
    }
    setAttachedResources([...attachedResources, resType]);
  };

  const handleRemoveResource = (resType: BasicResourceKey) => {
    const index = attachedResources.lastIndexOf(resType);
    if (index < 0) return;
    setAttachedResources(attachedResources.filter((_, resourceIndex) => resourceIndex !== index));
  };

  // Create & confirm contract
  const handleConfirmContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.isGuildActionsCompleted) {
      showToast(`Действия «${state.guildName}» уже завершены. Новые контракты можно оформить на следующий день.`, true);
      return;
    }
    if (!selectedMissionId || !selectedClanId) {
      showToast('Выберите миссию и клан-заказчик!', true);
      return;
    }

    const mission = state.missions.find(m => m.id === selectedMissionId);
    const clan = state.clans.find(c => c.id === selectedClanId);
    const guild = state.clans.find(c => c.id === 'clan_guild');
    if (!mission || !clan || !guild) return;

    if (paymentAmount <= 0) {
      showToast('Оплата контракта должна быть больше нуля!', true);
      return;
    }

    const requiredSpecialItems = getRequiredSpecialItems(mission);
    const reservedSpecialItems = getReservedSpecialItems(state.contracts, clan.id, mission.id);
    const missingSpecialItems = requiredSpecialItems
      .filter(item => !clanHasSpecialItem(clan.resources, item) || reservedSpecialItems.has(item));
    if (missingSpecialItems.length > 0) {
      showToast(`У клана ${clan.name} нет особых предметов для этапов: ${missingSpecialItems.join(', ')}.`, true);
      return;
    }

    const guildCommission = getGuildCommission(paymentAmount);
    const totalCharge = paymentAmount + guildCommission;

    if (clan.gold < totalCharge) {
      showToast(`Казне ${clan.name} нужно ${totalCharge}г: ${paymentAmount}г оплаты и ${guildCommission}г комиссии.`, true);
      return;
    }

    for (const resource of new Set(attachedResources)) {
      const requiredCount = attachedResources.filter(item => item === resource).length;
      if (Number(clan.resources[resource] || 0) < requiredCount) {
        showToast(`У клана ${clan.name} недостаточно ресурса «${getResourceNameRu(resource)}»: нужно ${requiredCount}.`, true);
        return;
      }
    }

    const updatedClans = state.clans.map(c => {
      if (c.id === clan.id) {
        const updatedResources = { ...c.resources };
        attachedResources.forEach(r => {
          updatedResources[r] = Number(updatedResources[r] || 0) - 1;
        });

        return {
          ...c,
          gold: c.gold - totalCharge,
          resources: updatedResources
        };
      }
      if (c.id === guild.id) {
        return { ...c, gold: c.gold + guildCommission };
      }
      return c;
    });

    // Create new contract
    const newContract: Contract = {
      missionId: selectedMissionId,
      title: mission.title,
      clanId: selectedClanId,
      confirmed: true,
      contractLevel,
      paymentAmount,
      guildCommission,
      paidAmount: paymentAmount,
      paidCommission: guildCommission,
      distributionCompleted: false,
      maxPartySize,
      attachedResources: [...attachedResources],
      reservedSpecialItems: requiredSpecialItems,
      partyAdvIds: []
    };

    const existingIndex = state.contracts.findIndex(c => c.missionId === selectedMissionId);
    let updatedContracts = [...state.contracts];
    if (existingIndex >= 0) {
      updatedContracts[existingIndex] = newContract;
    } else {
      updatedContracts.push(newContract);
    }

    updateState({
      clans: updatedClans,
      contracts: updatedContracts,
      selectedMissionId: null
    });

    showToast(`✅ Контракт «${mission.title}» оформлен: ${paymentAmount}г отряду и ${guildCommission}г комиссии ${state.guildShortName}.`);

    // Reset inputs
    setSelectedMissionId('');
    setSelectedClanId('');
    setAttachedResources([]);
  };

  const handleUnassignContract = (missionId: string) => {
    if (state.isGuildActionsCompleted) {
      showToast(`После действий «${state.guildName}» состав контрактов зафиксирован до конца дня.`, true);
      return;
    }
    const contract = state.contracts.find(c => c.missionId === missionId);
    if (!contract) return;

    const refundCommission = !contract.distributionCompleted;
    const commission = refundCommission ? (contract.paidCommission || 0) : 0;
    const updatedClans = state.clans.map(c => {
      if (c.id === contract.clanId) {
        const updatedResources = { ...c.resources };
        contract.attachedResources.forEach(resource => {
          updatedResources[resource] = Number(updatedResources[resource] || 0) + 1;
        });
        return {
          ...c,
          gold: c.gold + (contract.paidAmount || 0) + commission,
          resources: updatedResources
        };
      }
      if (c.id === 'clan_guild' && commission > 0) {
        return { ...c, gold: Math.max(0, c.gold - commission) };
      }
      return c;
    });

    updateState({
      clans: updatedClans,
      contracts: state.contracts.filter(c => c.missionId !== missionId)
    });

    showToast(refundCommission
      ? `Контракт «${contract.title}» отменён до распределения. Оплата, комиссия и ресурсы возвращены.`
      : `Контракт «${contract.title}» отменён после распределения. Оплата и ресурсы возвращены, комиссия удержана.`
    );
  };

  // Phase 2: Toggle adventurer on contract (strictly GM Override check!)
  const handleToggleAdventurer = (contract: Contract, advId: string) => {
    if (state.isGuildActionsCompleted) {
      showToast('После действий Гильдии отряды зафиксированы до симуляции.', true);
      return;
    }
    // Bug 4 Fix: restrict manual party editing strictly to GM mode!
    if (!state.isDmMode) {
      showToast(`⚠️ Только ГМ может напрямую собирать отряды вручную. Используйте автоматическое распределение «${state.guildName}».`, true);
      return;
    }

    const currentParty = contract.partyAdvIds || [];
    const idx = currentParty.indexOf(advId);
    
    let updatedParty = [...currentParty];
    if (idx >= 0) {
      updatedParty.splice(idx, 1);
    } else {
      const adv = state.adventurers.find(a => a.id === advId);
      if (adv && adv.level > contract.contractLevel) {
        showToast(`⚠️ Ошибка: Уровень приключенца (${adv.level}) превышает уровень контракта (${contract.contractLevel})!`, true);
        return;
      }
      const limit = getContractTargetPartySize(contract, state.missions);
      if (currentParty.length >= limit) {
        showToast(`Достигнут лимит отряда (${limit} чел.) для этого контракта!`, true);
        return;
      }
      updatedParty.push(advId);
    }

    const updatedContracts = state.contracts.map(c => {
      if (c.missionId === contract.missionId) {
        return { ...c, partyAdvIds: updatedParty };
      }
      // Remove this adventurer from other contracts if newly added here
      if (idx < 0) {
        return {
          ...c,
          partyAdvIds: (c.partyAdvIds || []).filter(id => id !== advId)
        };
      }
      return c;
    });

    updateState({ contracts: updatedContracts });
  };

  // Phase 2: Drag and drop specific assign/remove logic
  const handleAssignAdventurerToContract = (contract: Contract, advId: string) => {
    if (state.isGuildActionsCompleted) {
      showToast('После действий Гильдии отряды зафиксированы до симуляции.', true);
      return;
    }
    if (!state.isDmMode) {
      showToast('⚠️ Ошибка: Только Гейм-Мастер (GM) может вручную менять составы отрядов.', true);
      return;
    }

    const currentParty = contract.partyAdvIds || [];
    if (currentParty.includes(advId)) return; // Already in this squad

    const adv = state.adventurers.find(a => a.id === advId);
    if (adv && adv.level > contract.contractLevel) {
      showToast(`⚠️ Ошибка: Уровень приключенца (${adv.level}) превышает уровень контракта (${contract.contractLevel})!`, true);
      return;
    }

    const limit = getContractTargetPartySize(contract, state.missions);
    if (currentParty.length >= limit) {
      showToast(`Достигнут лимит отряда (${limit} чел.) для этого контракта!`, true);
      return;
    }

    const updatedContracts = state.contracts.map(c => {
      if (c.missionId === contract.missionId) {
        return { ...c, partyAdvIds: [...currentParty, advId] };
      }
      // Remove from other contracts
      return {
        ...c,
        partyAdvIds: (c.partyAdvIds || []).filter(id => id !== advId)
      };
    });

    updateState({ contracts: updatedContracts });
    showToast('🛡️ Герой добавлен в отряд.');
  };

  const handleAssignAdventurerToNearestSlot = (advId: string) => {
    const adventurer = state.adventurers.find(item => item.id === advId);
    if (!adventurer || adventurer.isArchived) return;
    const assignedContract = state.contracts.find(contract => contract.partyAdvIds?.includes(advId));
    if (assignedContract) {
      showToast(`«${adventurer.name}» уже назначен в отряд «${assignedContract.title}».`);
      return;
    }
    const nearest = state.contracts.find(contract =>
      contract.confirmed
      && contract.clanId !== 'clan_guild'
      && adventurer.level <= contract.contractLevel
      && (contract.partyAdvIds?.length ?? 0) < getContractTargetPartySize(contract, state.missions)
    );
    if (!nearest) {
      showToast('Нет ближайшего свободного слота подходящего ранга.', true);
      return;
    }
    handleAssignAdventurerToContract(nearest, advId);
  };

  const handleRemoveAdventurerFromAllContracts = (advId: string) => {
    if (state.isGuildActionsCompleted) {
      showToast('После действий Гильдии отряды зафиксированы до симуляции.', true);
      return;
    }
    if (!state.isDmMode) {
      showToast('⚠️ Ошибка: Только Гейм-Мастер (GM) может вручную менять составы отрядов.', true);
      return;
    }

    const updatedContracts = state.contracts.map(c => ({
      ...c,
      partyAdvIds: (c.partyAdvIds || []).filter(id => id !== advId)
    }));

    updateState({ contracts: updatedContracts });
    showToast('🍃 Герой возвращен в резерв.');
  };

  // Phase 3: Edit simulation reports
  const handleStartEditingReport = (c: Contract) => {
    if (c.simulationReport) {
      setEditingMissionId(c.missionId);
      setEditingReportData({ ...c.simulationReport });
    }
  };

  const handleStartStoryReport = (contract: Contract) => {
    const mission = state.missions.find(item => item.id === contract.missionId);
    if (!mission || mission.type !== 'STORY') return;
    const clanName = state.clans.find(clan => clan.id === contract.clanId)?.name ?? 'Неизвестный заказчик';
    const pendingComplications = contract.pendingStoryComplications ?? [];
    const draft: SimulationReport = {
      isSuccess: false,
      outcome: 'OBJECTIVE_FAILED',
      isResourceAutoSuccess: false,
      autoSuccessReason: null,
      roll: 0,
      partyBonus: 0,
      totalRoll: 0,
      dc: mission.dc,
      narrativeText: 'Сюжетная миссия завершена по решению ГМа.',
      damageDealt: 0,
      goldReward: getMissionGoldReward(mission, state.hCost),
      rewardGranted: false,
      rewardAwardedAmount: 0,
      rewardSpecialItemsGranted: false,
      rewardRecipientClanId: contract.clanId,
      attachedResourcesUsed: [],
      squadNames: [],
      squadAdvIds: [],
      clanName,
      missionTitle: mission.title,
      missionRegion: mission.region,
      missionId: mission.id,
      wasManuallyResolved: true,
      baseObjectiveCompleted: false,
      returnedAdventurerIds: [],
      failedChecksCount: 0,
      checkResults: pendingComplications.map(complication => {
        const resource = complication.reqResource === 'None'
          ? 'без ключевого ресурса'
          : `ресурс: ${getResourceNameRu(complication.reqResource)}`;
        return `Сюжетное осложнение — ${getComplicationPositionLabel(mission, complication.position)}: DC ${complication.dc}, ${resource}. Исход определяет ГМ.`;
      }),
      context: {
        clanId: contract.clanId,
        attachedResources: [...contract.attachedResources],
        contractLevel: contract.contractLevel,
        maxPartySize: contract.maxPartySize,
        suggestedSquadAdvIds: [...(contract.suggestedSquadAdvIds ?? contract.partyAdvIds)],
        mission: structuredClone(mission)
      }
    };
    setEditingMissionId(contract.missionId);
    setEditingReportData(draft);
  };

  const toggleEditingParticipant = (adventurerId: string) => {
    setEditingReportData(previous => {
      if (!previous) return previous;
      const squad = previous.squadAdvIds ?? [];
      const returned = previous.returnedAdventurerIds ?? [];
      const isSelected = squad.includes(adventurerId);
      return {
        ...previous,
        squadAdvIds: isSelected ? squad.filter(id => id !== adventurerId) : [...squad, adventurerId],
        returnedAdventurerIds: isSelected
          ? returned.filter(id => id !== adventurerId)
          : [...new Set([...returned, adventurerId])]
      };
    });
  };

  const toggleEditingReturn = (adventurerId: string) => {
    setEditingReportData(previous => {
      if (!previous?.squadAdvIds?.includes(adventurerId)) return previous;
      const returned = previous.returnedAdventurerIds ?? [];
      return {
        ...previous,
        returnedAdventurerIds: returned.includes(adventurerId)
          ? returned.filter(id => id !== adventurerId)
          : [...returned, adventurerId]
      };
    });
  };

  const adjustEditingResource = (resource: BasicResourceKey, delta: 1 | -1) => {
    const contract = state.contracts.find(item => item.missionId === editingMissionId);
    if (!contract) return;
    setEditingReportData(previous => {
      if (!previous) return previous;
      const used = (previous.attachedResourcesUsed ?? []).filter(isBasicResource);
      if (delta < 0) {
        const index = used.lastIndexOf(resource);
        if (index < 0) return previous;
        return { ...previous, attachedResourcesUsed: used.filter((_, itemIndex) => itemIndex !== index) };
      }
      const availableCount = contract.attachedResources.filter(item => item === resource).length;
      const usedCount = used.filter(item => item === resource).length;
      if (usedCount >= availableCount) return previous;
      return { ...previous, attachedResourcesUsed: [...used, resource] };
    });
  };

  const updateEditingField = (field: keyof SimulationReport, value: any) => {
    setEditingReportData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const updateEditingOutcome = (outcome: NonNullable<SimulationReport['outcome']>) => {
    setEditingReportData(previous => previous ? {
      ...previous,
      outcome,
      isSuccess: outcome === 'SUCCESS',
      baseObjectiveCompleted: outcome === 'SUCCESS' ? true : previous.baseObjectiveCompleted,
      returnedAdventurerIds: outcome === 'PARTY_LOST' ? [] : previous.returnedAdventurerIds,
      narrativeText: outcome === 'PARTY_LOST' ? 'Отряд не вернулся.' : previous.narrativeText,
      rewardGranted: false,
      rewardAwardedAmount: 0,
      rewardSpecialItemsGranted: false,
      isResourceAutoSuccess: outcome === 'SUCCESS' ? previous.isResourceAutoSuccess : false,
      autoSuccessReason: outcome === 'SUCCESS' ? previous.autoSuccessReason : null
    } : previous);
  };

  const handleSaveReportEdit = (missionId: string) => {
    if (!editingReportData) return;
    
    // Find the original contract/report
    const originalContract = state.contracts.find(c => c.missionId === missionId);
    if (!originalContract) return;
    const originalRep = originalContract.simulationReport ?? null;

    {
      const mission = state.missions.find(item => item.id === missionId)
        ?? state.allMissions?.find(item => item.id === missionId);
      if (!mission) {
        showToast('Исходное событие для рапорта не найдено.', true);
        return;
      }
      const sourceReport = originalRep ?? editingReportData as SimulationReport;
      const outcome = editingReportData.outcome ?? (editingReportData.isSuccess ? 'SUCCESS' : ((editingReportData.returnedAdventurerIds?.length ?? 0) === 0 ? 'PARTY_LOST' : 'OBJECTIVE_FAILED'));
      const editedSuccess = outcome === 'SUCCESS';
      const editedReport = {
        ...sourceReport,
        ...editingReportData,
        isSuccess: editedSuccess,
        outcome,
        returnedAdventurerIds: outcome === 'PARTY_LOST' ? [] : editingReportData.returnedAdventurerIds ?? sourceReport.returnedAdventurerIds,
        narrativeText: outcome === 'PARTY_LOST' ? 'Отряд не вернулся.' : editingReportData.narrativeText ?? sourceReport.narrativeText,
        totalRoll: (editingReportData.roll ?? sourceReport.roll) + (editingReportData.partyBonus ?? sourceReport.partyBonus),
        baseObjectiveCompleted: editedSuccess
          ? true
          : (editingReportData.baseObjectiveCompleted ?? sourceReport.baseObjectiveCompleted ?? false),
        rewardAwardedAmount: editedSuccess
          ? Math.max(0, Math.min(editingReportData.goldReward ?? sourceReport.goldReward, editingReportData.rewardAwardedAmount ?? 0))
          : 0,
        rewardGranted: editedSuccess && (editingReportData.rewardAwardedAmount ?? 0) > 0,
        rewardSpecialItemsGranted: editedSuccess && Boolean(editingReportData.rewardSpecialItemsGranted),
        rewardRecipientClanId: originalContract.clanId
      } as SimulationReport;
      const recalculated = recalculateReportEffects({
        originalReport: originalRep,
        editedReport,
        contract: originalContract,
        mission,
        adventurers: state.adventurers,
        clans: state.clans,
        day: state.day
      });
      const updatedContracts = state.contracts.map(contract => contract.missionId === missionId
        ? {
            ...contract,
            partyAdvIds: [...recalculated.report.squadAdvIds],
            actualSquadAdvIds: [...recalculated.report.squadAdvIds],
            simulationReport: recalculated.report
          }
        : contract
      );
      const targetReportDay = mission.type === 'STORY'
        ? (mission.storyAcceptedDay ?? state.day)
        : state.history.find(entry => entry.reports.some(report => report.missionId === missionId))?.day ?? state.day;
      const updatedHistory = upsertReportInHistory(state.history, recalculated.report, targetReportDay);
      const isDeferredStoryReport = mission.type === 'STORY' && originalRep === null && targetReportDay < state.day;
      const contractsForProgress = isDeferredStoryReport
        ? updatedContracts.filter(contract => contract.missionId !== missionId)
        : updatedContracts;
      const scenarioProgress = reconcileScenarioHistory({
        allMissions: state.allMissions,
        missions: state.missions,
        contracts: contractsForProgress,
        history: updatedHistory,
        currentDay: state.day,
        adventurers: recalculated.adventurers,
        clans: recalculated.clans,
        missionRecurrences: state.missionRecurrences
      });
      updateState({
        adventurers: scenarioProgress.adventurers,
        clans: scenarioProgress.clans,
        contracts: contractsForProgress,
        missions: scenarioProgress.missions,
        history: scenarioProgress.history,
        completedMissionIds: scenarioProgress.completedMissionIds,
        closedMissionIds: scenarioProgress.closedMissionIds,
        expiredMissionIds: scenarioProgress.expiredMissionIds,
        missionRecurrences: scenarioProgress.missionRecurrences,
        selectedMissionId: state.selectedMissionId === missionId ? null : state.selectedMissionId
      });
      setEditingMissionId(null);
      setEditingReportData(null);
      showToast('Рапорт изменён: HP, опыт, отношения, золото и ресурсы пересчитаны из исходного состояния.');
      return;
    }

  };

  const handleAutoAssign = () => {
    if (state.isGuildActionsCompleted) {
      showToast('Распределение уже зафиксировано действиями Гильдии.', true);
      return;
    }
    const randomSeed = createDaySeed(state.day);
    const result = distributePlayerContracts({
      adventurers: state.adventurers,
      contracts: state.contracts,
      hCost: state.hCost,
      randomSeed,
      random: createSeededRandom(randomSeed)
    });

    const updatedContracts = result.contracts.map(contract =>
      contract.clanId === 'clan_guild'
        ? contract
        : { ...contract, distributionCompleted: true }
    );

    updateState({
      contracts: updatedContracts,
      distributionReport: result.report,
      lastDistributionLogs: result.report.logs
    });

    showToast(`Рынок контрактов завершён: нанято ${result.report.assignedAdventurers}, в резерве ${result.report.unassignedAdventurers}.`);
  };

  // Phase 3: Autonomous Guild Actions (Honest resource spending/buying)
  const handleGuildActionsPhase3 = () => {
    if (state.isGuildActionsCompleted) {
      showToast(`Действия «${state.guildName}» в этом дне уже завершены.`, true);
      return;
    }

    const result = performGuildActions({
      clans: state.clans,
      adventurers: state.adventurers,
      missions: state.missions,
      contracts: state.contracts,
      hCost: state.hCost
    });

    updateState({
      clans: result.clans,
      missions: result.missions,
      contracts: result.contracts,
      lastDistributionLogs: result.logs,
      isGuildActionsCompleted: true,
      currentPhase: 3
    });
    showToast(`Действия ${state.guildShortName} завершены: создано ${result.createdContracts}, назначено ${result.assignedAdventurers}.`);
    return;

  };

  // Phase 3: Simulate Day!
  const handleSimulateDay = () => {
    if (!state.isGuildActionsCompleted) {
      showToast(`Сначала завершите действия ${state.guildShortName}.`, true);
      return;
    }
    if (state.isDaySimulated) {
      showToast('Этот день уже просчитан.', true);
      return;
    }

    const simulationSeed = createDaySeed(state.day);
    const simulation = simulateDayContracts({
      contracts: state.contracts,
      missions: state.missions,
      adventurers: state.adventurers,
      clans: state.clans,
      day: state.day,
      hCost: state.hCost,
      random: createSeededRandom(simulationSeed)
    });
    const simulationLogs = [
      `--- ДЕНЬ ${state.day}: ПОСЛЕДОВАТЕЛЬНАЯ СИМУЛЯЦИЯ ---`,
      ...simulation.logs
    ];
    const expirationReports: SimulationReport[] = simulation.missions
      .filter(mission => {
        const waitingForStoryReport = mission.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT';
        return !waitingForStoryReport && willMissionExpireAfterDay(mission);
      })
      .map(mission => ({
        isSuccess: false,
        outcome: 'OBJECTIVE_FAILED',
        isResourceAutoSuccess: false,
        autoSuccessReason: null,
        roll: 0,
        partyBonus: 0,
        totalRoll: 0,
        dc: mission.dc,
        narrativeText: 'Донесение просрочено и исчезло.',
        damageDealt: 0,
        goldReward: 0,
        attachedResourcesUsed: [],
        squadNames: [],
        squadAdvIds: [],
        clanName: state.guildName,
        missionTitle: mission.title,
        missionRegion: mission.region,
        missionId: mission.id,
        isExpired: true,
        baseObjectiveCompleted: false,
        returnedAdventurerIds: [],
        failedChecksCount: 0
      }));
    expirationReports.forEach(report => {
      simulationLogs.push(`Донесение «${report.missionTitle}» просрочено и исчезнет с карты.`);
    });
    const newReports = [...simulation.reports, ...expirationReports];

    updateState({
      adventurers: simulation.adventurers,
      clans: simulation.clans,
      contracts: simulation.contracts,
      missions: simulation.missions,
      isDaySimulated: true,
      history: [...state.history, {
        day: state.day,
        randomSeed: simulationSeed,
        contractsCount: simulation.contracts.filter(contract => contract.confirmed).length,
        reports: newReports,
        logs: simulationLogs
      }]
    });

    const storySuffix = simulation.awaitingStoryMissionIds.length > 0
      ? ` Сюжетных миссий ожидают рапорта ГМа: ${simulation.awaitingStoryMissionIds.length}.`
      : '';
    showToast(`Симуляция дня завершена. Обычных рапортов: ${simulation.reports.length}.${storySuffix}`);
    return;

  };

  // Switch to next day
  const handleNextDay = () => {
    if (!state.isDaySimulated) {
      showToast('Сначала завершите симуляцию текущего дня.', true);
      return;
    }

    {
      const nextDay = state.day + 1;
      const levelledClanNames: string[] = [];
      const nextActivityClans = state.clans.map(clan => {
        const levelled = activatePendingClanLevel(clan);
        if (levelled.trustLevel > clan.trustLevel) levelledClanNames.push(`${clan.name}: ${clan.trustLevel} → ${levelled.trustLevel}`);
        if (clan.id === 'clan_guild') return levelled;
        return state.pendingClanActivity?.[clan.id] === undefined
          ? levelled
          : { ...levelled, isActive: state.pendingClanActivity[clan.id] };
      });
      const nextActiveClanCount = getActivePlayerClans(nextActivityClans, state.nClans).length;
      const lifecycle = advanceMissionLifecycle({
        missions: state.missions,
        contracts: state.contracts,
        allMissions: state.allMissions,
        completedMissionIds: state.completedMissionIds,
        closedMissionIds: state.closedMissionIds,
        expiredMissionIds: state.expiredMissionIds,
        missionRecurrences: state.missionRecurrences,
        activeClanCount: nextActiveClanCount,
        nextDay
      });
      const nextDayMissions = [...lifecycle.missions];
      if (!lifecycle.scenarioDriven) {
        const generated = generateMissionsForDay(nextActiveClanCount, nextDay, state.spawnPolygon).map(mission => {
          const region = findMapRegionAtPoint(state.mapRegions, mission);
          return { ...mission, regionMode: 'AUTO' as const, regionId: region?.id, region: region?.name ?? 'ВНЕ РЕГИОНОВ' };
        });
        const existingIds = new Set(nextDayMissions.map(mission => mission.id));
        nextDayMissions.push(...generated.filter(mission => !existingIds.has(mission.id)));
      }

      const healedAdventurers = state.adventurers.map(adventurer => {
        if (adventurer.isArchived) return adventurer;
        if (adventurer.status === 'WOUNDED') {
          if (adventurer.woundedOnDay === state.day) return adventurer;
          return {
            ...adventurer,
            hp: adventurer.maxHp,
            status: 'READY' as const,
            woundedOnDay: undefined
          };
        }
        if (adventurer.status === 'ON_MISSION') return { ...adventurer, status: 'READY' as const };
        return adventurer;
      });
      const nextDayAdventurers = ensureAdventurerRosterForClans(healedAdventurers, nextActiveClanCount);

      const activePlayerClanIds = new Set(getActivePlayerClans(nextActivityClans, nextActiveClanCount).map(clan => clan.id));
      const playableClansCount = activePlayerClanIds.size;
      const expiredContracts = state.contracts.filter(contract => lifecycle.expiredContractIds.includes(contract.missionId));
      const nextDayClans = nextActivityClans.map(clan => {
        const clanExpiredContracts = expiredContracts.filter(contract => contract.clanId === clan.id);
        const refundedGold = clanExpiredContracts.reduce((sum, contract) => sum + (contract.paidAmount ?? contract.paymentAmount ?? 0), 0);
        const refundedResources = { ...clan.resources };
        clanExpiredContracts.forEach(contract => contract.attachedResources.forEach(resource => {
          refundedResources[resource] = Number(refundedResources[resource] || 0) + 1;
        }));
        if (clan.id === 'clan_guild') {
          return {
            ...clan,
            gold: clan.gold + refundedGold + getGuildDailyFunding(playableClansCount, state.hCost),
            resources: refundedResources
          };
        }
        if (!activePlayerClanIds.has(clan.id)) return { ...clan, gold: clan.gold + refundedGold, resources: refundedResources };
        const trust = Math.max(1, Math.min(3, clan.trustLevel || 1));
        const dailyGoldH = trust === 1 ? 12 : trust === 2 ? 20 : 35;
        const freeResources = trust;
        return {
          ...clan,
          gold: clan.gold + refundedGold + dailyGoldH * state.hCost,
          resources: refundedResources,
          freeResourceBudget: freeResources,
          freeSuppliesBudget: freeResources
        };
      });

      updateState({
        day: nextDay,
        nClans: nextActiveClanCount,
        pendingClanActivity: {},
        currentPhase: 1,
        isDaySimulated: false,
        isGuildActionsCompleted: false,
        adventurers: nextDayAdventurers,
        clans: nextDayClans,
        missions: nextDayMissions,
        contracts: lifecycle.contracts,
        completedMissionIds: lifecycle.completedMissionIds,
        closedMissionIds: lifecycle.closedMissionIds,
        expiredMissionIds: lifecycle.expiredMissionIds,
        missionRecurrences: lifecycle.missionRecurrences,
        distributionReport: null,
        lastDistributionLogs: []
      });
      setIsDistributionReportOpen(false);
      showToast(`Наступил день ${nextDay}. Проваленные события сохранены, ожидающие сюжетные миссии остаются за заказчиками.${levelledClanNames.length ? ` Новый уровень: ${levelledClanNames.join('; ')}.` : ''}`);
      onRedirectToReports?.();
      return;
    }

  };

  const handleNextPhase = () => {
    if (state.isGuildActionsCompleted) return;
    if (currentPhase < 3) {
      updateState({ currentPhase: currentPhase + 1 });
    }
  };

  const handlePrevPhase = () => {
    if (state.isGuildActionsCompleted) return;
    if (currentPhase > 1) {
      updateState({ currentPhase: currentPhase - 1 });
    }
  };

  return (
    <div className="space-y-6">
      {state.isDmMode && !state.isDaySimulated && state.contracts.some(contract => {
        const mission = state.missions.find(item => item.id === contract.missionId);
        return mission?.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT' && !contract.simulationReport;
      }) && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/10 p-4 space-y-3">
          <div>
            <h3 className="font-mono text-sm font-bold uppercase text-amber-400">Отложенные сюжетные миссии</h3>
            <p className="mt-1 text-xs text-neutral-500">Рапорт можно заполнить до любых действий нового дня.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.contracts.filter(contract => {
              const mission = state.missions.find(item => item.id === contract.missionId);
              return mission?.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT' && !contract.simulationReport;
            }).map(contract => (
              <div key={contract.missionId} className="flex items-center justify-between gap-3 rounded border border-amber-500/15 bg-black/40 p-3">
                <div>
                  <strong className="block text-sm text-neutral-200">{contract.title}</strong>
                  <small className="text-neutral-500">Осложнений: {contract.pendingStoryComplications?.length ?? 0}</small>
                </div>
                <button type="button" onClick={() => handleStartStoryReport(contract)} className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-xs font-bold uppercase text-amber-400 hover:bg-amber-500 hover:text-black">
                  Заполнить рапорт
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {state.isDmMode && !state.isDaySimulated && editingMissionId && editingReportData && (() => {
        const contract = state.contracts.find(item => item.missionId === editingMissionId);
        if (!contract) return null;
        const mission = state.missions.find(item => item.id === editingMissionId) ?? editingReportData.context?.mission;
        return (
          <div className="space-y-4 rounded-lg border border-amber-500/40 bg-[#0d0d0d] p-5 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-bold uppercase text-amber-400">Рапорт: {editingReportData.missionTitle}</h3>
              <button type="button" onClick={() => { setEditingMissionId(null); setEditingReportData(null); }} className="text-neutral-500 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select value={editingReportData.outcome ?? (editingReportData.isSuccess ? 'SUCCESS' : 'OBJECTIVE_FAILED')} onChange={event => updateEditingOutcome(event.target.value as NonNullable<SimulationReport['outcome']>)} className="editor-input font-bold uppercase"><option value="SUCCESS">Успех</option><option value="OBJECTIVE_FAILED">Провал задачи · отряд вернулся</option><option value="PARTY_LOST">Отряд не вернулся</option></select>
              <label className="flex items-center gap-2 rounded border border-neutral-800 p-2"><input type="checkbox" disabled={editingReportData.isSuccess} checked={editingReportData.isSuccess || (editingReportData.baseObjectiveCompleted ?? false)} onChange={event => updateEditingField('baseObjectiveCompleted', event.target.checked)} /> Основная задача выполнена</label>
              <label className="space-y-1 rounded border border-neutral-800 p-2"><span className="block text-[9px] uppercase text-neutral-500">Выдано золотом</span><input type="number" min={0} max={editingReportData.goldReward ?? 0} disabled={!editingReportData.isSuccess} value={editingReportData.rewardAwardedAmount ?? 0} onChange={event => updateEditingField('rewardAwardedAmount', Math.max(0, Math.min(editingReportData.goldReward ?? 0, Number(event.target.value) || 0)))} className="editor-input" /></label>
            </div>
            {(mission?.rewardSpecialItems?.length ?? 0) > 0 && <label className="flex items-center gap-2 rounded border border-violet-500/20 bg-violet-500/5 p-2"><input type="checkbox" disabled={!editingReportData.isSuccess} checked={editingReportData.rewardSpecialItemsGranted ?? false} onChange={event => updateEditingField('rewardSpecialItemsGranted', event.target.checked)} /> Особая награда выдана: {mission?.rewardSpecialItems?.join(', ')}</label>}
            <textarea value={editingReportData.narrativeText ?? ''} onChange={event => updateEditingField('narrativeText', event.target.value)} className="editor-input min-h-24" placeholder="Описание результата" />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {([
                ['dc', 'DC'], ['roll', 'd20'], ['partyBonus', 'Бонус'], ['goldReward', 'Награда'], ['damageDealt', 'Урон']
              ] as const).map(([field, label]) => <label key={field} className="space-y-1 text-neutral-500"><span>{label}</span><input type="number" value={Number(editingReportData[field] ?? 0)} onChange={event => updateEditingField(field, Number(event.target.value) || 0)} className="editor-input" /></label>)}
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editingReportData.isResourceAutoSuccess ?? false} onChange={event => updateEditingField('isResourceAutoSuccess', event.target.checked)} /> Автоуспех</label>
            {editingReportData.isResourceAutoSuccess && <input value={editingReportData.autoSuccessReason ?? ''} onChange={event => updateEditingField('autoSuccessReason', event.target.value)} className="editor-input" placeholder="Причина автоуспеха" />}
            <ReportParticipantsEditor adventurers={state.adventurers} selectedIds={editingReportData.squadAdvIds ?? []} returnedIds={editingReportData.returnedAdventurerIds ?? []} suggestedIds={contract.suggestedSquadAdvIds ?? editingReportData.context?.suggestedSquadAdvIds ?? contract.partyAdvIds ?? mission?.suggestedSquadAdvIds ?? []} onToggleSelected={toggleEditingParticipant} onToggleReturned={toggleEditingReturn} onOpenDossier={onSelectAdventurer} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['Supplies', 'Equipment', 'Intelligence', 'Alchemy'] as BasicResourceKey[]).map(resource => {
                const used = (editingReportData.attachedResourcesUsed ?? []).filter(item => item === resource).length;
                const attached = contract.attachedResources.filter(item => item === resource).length;
                return <div key={resource} className="rounded border border-neutral-800 p-2 text-center"><span className="block text-neutral-500">{getResourceNameRu(resource)} {used}/{attached}</span><div className="mt-1 flex justify-center gap-2"><button type="button" onClick={() => adjustEditingResource(resource, -1)} disabled={used === 0}>−</button><strong>{used}</strong><button type="button" onClick={() => adjustEditingResource(resource, 1)} disabled={used >= attached}>+</button></div></div>;
              })}
            </div>
            <div className="flex justify-end"><button type="button" onClick={() => handleSaveReportEdit(editingMissionId)} className="rounded bg-emerald-500 px-4 py-2 font-bold uppercase text-black">Сохранить рапорт</button></div>
          </div>
        );
      })()}
      
      {/* Phases Chevron Navigator */}
      <div className="flex bg-[#0d0d0d] border border-emerald-500/15 rounded-lg overflow-hidden divide-x divide-emerald-500/10 font-mono text-xs shadow-md">
        
        <button
          disabled={state.isGuildActionsCompleted}
          onClick={() => !state.isGuildActionsCompleted && updateState({ currentPhase: 1 })}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-all ${state.isGuildActionsCompleted ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${currentPhase === 1 ? 'bg-emerald-950/20 text-emerald-400 border-b-2 border-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}`}
        >
          <FileText className="w-4 h-4" />
          <span>Фаза 1: Оформление контрактов</span>
        </button>

        <button
          disabled={state.isGuildActionsCompleted}
          onClick={() => !state.isGuildActionsCompleted && updateState({ currentPhase: 2 })}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-all ${state.isGuildActionsCompleted ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${currentPhase === 2 ? 'bg-emerald-950/20 text-emerald-400 border-b-2 border-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}`}
        >
          <Users className="w-4 h-4" />
          <span>Фаза 2: Сбор отрядов</span>
        </button>

        <button
          onClick={() => updateState({ currentPhase: 3 })}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 cursor-pointer transition-all ${currentPhase === 3 ? 'bg-emerald-950/20 text-emerald-400 border-b-2 border-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}`}
        >
          <Play className="w-4 h-4" />
          <span>Фаза 3: Симуляция & Итоги</span>
        </button>

      </div>

      {/* ==============================================
          PHASE 1: CONTRACT FORMULATION
          ============================================== */}
      {currentPhase === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Block: Setup Form (2 columns) */}
          <div className="lg:col-span-2 bg-[#0d0d0d] border border-emerald-500/10 p-6 rounded-lg space-y-5">
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-500/5 pb-2">
              <FileText className="w-4 h-4" />
              Оформление Нового Контракта
            </h3>

            {availableMissions.length === 0 ? (
              <div className="p-4 bg-emerald-950/5 border border-dashed border-emerald-500/20 rounded text-center font-mono text-xs text-neutral-400">
                📭 Все донесения и сообщения уже прикреплены к активным контрактам! Ожидайте новых донесений завтра.
              </div>
            ) : (
              <form onSubmit={handleConfirmContract} className="space-y-4 font-mono text-xs">
                
                <div className="space-y-3">
                  {/* Compact list of immediately visible and clickable contracts */}
                  <div className="flex flex-col gap-1">
                    <label className="text-emerald-400 uppercase text-[10px] font-mono tracking-wider font-bold">Доступные сообщения с карты (Кликните для выбора):</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1 bg-black/40 p-2 rounded border border-emerald-500/10">
                      {availableMissions.map(m => {
                        const isSelected = selectedMissionId === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => handleMissionChange(m.id)}
                            className={`p-2 rounded border cursor-pointer select-none transition-all flex flex-col justify-between ${isSelected ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/20' : 'bg-black/80 border-neutral-800 hover:border-neutral-700 hover:bg-[#121212] text-neutral-400'}`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <span className="font-bold text-[11px] leading-tight line-clamp-2">
                                {m.title}
                                {m.intelRevealed && ` (разведано: ${getScoutingClanNames(m, state.clans).join(', ') || 'источник не указан'})`}
                              </span>
                              {m.intelRevealed && (
                                <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1 rounded uppercase shrink-0 font-bold">
                                  DC {m.dc}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-neutral-500 uppercase mt-1">
                              <span>📍 {m.region}</span>
                              <span className="text-rose-500 font-bold">⏳ {m.lifespan === null ? 'Без срока' : `${m.lifespan}дн`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Select Customer Clan */}
                    <div className="flex flex-col gap-1">
                      <label className="text-neutral-400 uppercase text-[10px]">Клан-Заказчик:</label>
                      <select
                        value={selectedClanId}
                        onChange={(e) => {
                          const newClanId = e.target.value;
                          setSelectedClanId(newClanId);
                          if (newClanId) {
                            const selectedClan = playableClans.find(c => c.id === newClanId);
                            const maxLvl = getMaxContractLevelForClan(selectedClan);
                            if (contractLevel > maxLvl) {
                              setContractLevel(maxLvl);
                              setPaymentAmount(getDefaultContractPayment(maxLvl, state.hCost));
                            }
                          }
                        }}
                        required
                        className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded focus:border-emerald-500 outline-none"
                      >
                        <option value="">-- Выберите клан --</option>
                        {playableClans.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {selectedClanId && (() => {
                        const clan = playableClans.find(c => c.id === selectedClanId);
                        if (!clan) return null;
                        return (
                          <div className="flex gap-4 mt-2 bg-neutral-900/60 p-2 rounded border border-neutral-800">
                            <div className="flex items-center gap-1.5 text-neutral-300">
                              <Shield className="w-4 h-4 text-emerald-500" />
                              <span className="font-semibold text-neutral-400">Уровень:</span>
                              <span className="text-emerald-400 font-bold">{clan.trustLevel}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-neutral-300">
                              <Coins className="w-4 h-4 text-amber-500" />
                              <span className="font-semibold text-neutral-400">Казна:</span>
                              <span className="text-amber-500 font-bold">{clan.gold}г</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Selected Mission Details Indicator */}
                    <div className="flex flex-col gap-1">
                      <label className="text-neutral-400 uppercase text-[10px]">Выбранное донесение:</label>
                      {(() => {
                        const selM = availableMissions.find(m => m.id === selectedMissionId);
                        if (!selM) {
                          return (
                            <div className="w-full bg-neutral-900 border border-neutral-800 text-neutral-500 px-3 py-2 rounded text-xs font-mono">
                              Ничего не выбрано
                            </div>
                          );
                        }
                        const checksList = selM.checks && selM.checks.length > 0 
                          ? selM.checks 
                          : [{ reqResource: selM.reqResource, dc: selM.dc }];
                        const presentation = getMissionPresentation(selM, state.day, state.isDmMode);
                        const scoutingClanNames = getScoutingClanNames(selM, state.clans);

                        if (!selM.intelRevealed && !state.isDmMode) {
                          return (
                            <div className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded space-y-2 text-xs font-mono">
                              <div className="flex justify-between items-center">
                                <span className="text-neutral-300 font-bold">{selM.title}</span>
                                <span className="text-[10px] bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-neutral-400 font-bold">
                                  🔒 Не раскрыто
                                </span>
                              </div>
                              <div className="text-amber-500/90 text-[11px] bg-amber-500/10 border border-amber-500/20 p-2.5 rounded font-mono">
                                🔒 <strong>Недостаточно разведданных</strong>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="w-full bg-neutral-950 border border-emerald-500/20 p-3 rounded space-y-2 text-xs font-mono">
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-400 font-bold">{selM.title}</span>
                              <span className="text-[10px] bg-neutral-800 px-2 py-0.5 rounded text-neutral-300">
                                {getTypeRu(presentation.visibleType)}
                              </span>
                            </div>

                            {selM.intelRevealed && (
                              <div className="text-[10px] text-emerald-500/80">
                                Разведано: {scoutingClanNames.join(', ') || 'источник не указан'}
                              </div>
                            )}

                            {selM.type === 'DUMMY' ? (
                              <div className="text-amber-400 text-[11px] bg-amber-500/10 border border-amber-500/20 p-2 rounded">
                                ℹ️ <strong>Ложное донесение:</strong> 0 этапов. Особые ресурсы и проверки не требуются. Награда: 0г.
                              </div>
                            ) : (
                              <div className="space-y-1.5 pt-1 border-t border-neutral-900">
                                <div className="flex justify-between items-center text-[11px] text-neutral-400">
                                  <span>Всего этапов: <strong className="text-white">{checksList.length}</strong></span>
                                  <span className="text-amber-400">Раскрыто в Штабе</span>
                                </div>
                                <div className="space-y-1">
                                  {checksList.map((ch, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-black/60 px-2 py-1 rounded border border-neutral-800 text-[11px]">
                                      <span className="text-neutral-300">Этап #{idx + 1}: <strong className="text-amber-400">DC {ch.dc}</strong></span>
                                      <span className="text-right">
                                        {ch.reqResource && ch.reqResource !== 'None' ? (
                                          <span className="block text-emerald-400 font-bold">Ресурс: {getResourceNameRu(ch.reqResource)}</span>
                                        ) : (
                                          <span className="block text-neutral-500">Без ключевого ресурса</span>
                                        )}
                                        {ch.requiredSpecialItem && <span className="block text-amber-400">💎 {ch.requiredSpecialItem}</span>}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Contract level & Payout sliders */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Ранг контракта:</label>
                    <select
                      value={contractLevel}
                      onChange={(e) => handleLevelChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded outline-none"
                    >
                      {Array.from({ length: selectedClanId ? getMaxContractLevelForClan(playableClans.find(c => c.id === selectedClanId)) : 5 }, (_, i) => i + 1).map(lvl => (
                        <option key={lvl} value={lvl}>{lvl} Уровень</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Сумма оплаты:</label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                      className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-neutral-400 uppercase text-[10px]">Лимит участников:</label>
                    <select
                      value={maxPartySize}
                      onChange={(e) => setMaxPartySize(parseInt(e.target.value) || 5)}
                      className="w-full bg-black border border-emerald-500/20 text-neutral-200 px-3 py-2 rounded outline-none"
                    >
                      <option value="1">1 участник</option>
                      <option value="2">2 участника</option>
                      <option value="3">3 участника</option>
                      <option value="4">4 участника</option>
                      <option value="5">5 участников</option>
                    </select>
                  </div>
                </div>

                {/* Attach resources */}
                <div>
                  <label className="text-neutral-400 uppercase text-[10px] block mb-2">
                    Выдать снаряжение со склада Клана (макс. {maxPartySize} шт., по 1 на участника):
                  </label>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(['Supplies', 'Equipment', 'Intelligence', 'Alchemy'] as BasicResourceKey[]).map(r => {
                      const selectedCount = attachedResources.filter(resource => resource === r).length;
                      const isAttached = selectedCount > 0;
                      const selectedClan = playableClans.find(c => c.id === selectedClanId);
                      const resourceCount = selectedClan ? Number(selectedClan.resources[r] || 0) : 0;
                      return (
                        <div
                          key={r}
                          className={`p-2.5 rounded border text-center select-none transition-all ${isAttached ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 font-bold' : 'bg-black border-neutral-800 text-neutral-400'}`}
                        >
                          <span className="text-xs uppercase block">{getResourceNameRu(r)}</span>
                          <span className="text-[10px] text-neutral-500 block mt-1">
                            {selectedClan ? `Доступно: ${resourceCount} шт` : 'Выберите клан'}
                          </span>
                          <div className="flex items-center justify-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveResource(r)}
                              disabled={selectedCount === 0}
                              className="w-7 h-6 rounded border border-neutral-700 disabled:opacity-30 hover:border-rose-500 hover:text-rose-400 cursor-pointer"
                            >
                              −
                            </button>
                            <strong className="min-w-5 text-sm">{selectedCount}</strong>
                            <button
                              type="button"
                              onClick={() => handleAddResource(r)}
                              disabled={!selectedClan || selectedCount >= resourceCount || attachedResources.length >= maxPartySize}
                              className="w-7 h-6 rounded border border-neutral-700 disabled:opacity-30 hover:border-emerald-500 hover:text-emerald-400 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedClanId && (() => {
                  const clan = playableClans.find(item => item.id === selectedClanId);
                  if (!clan) return null;
                  const commission = getGuildCommission(paymentAmount);
                  const totalCharge = paymentAmount + commission;
                  const preparationValue = getAttachedResourcesValue(attachedResources, state.hCost);
                  return (
                    <div className="grid grid-cols-2 gap-3 rounded border border-amber-500/20 bg-amber-950/10 p-3 md:grid-cols-4">
                      <div><span className="block text-[9px] text-neutral-500 uppercase">Приключенцам</span><strong className="text-amber-400">{paymentAmount}г</strong></div>
                      <div><span className="block text-[9px] text-neutral-500 uppercase">Комиссия 15%</span><strong className="text-amber-400">{commission}г</strong></div>
                      <div><span className="block text-[9px] text-neutral-500 uppercase">Всего из казны</span><strong className={totalCharge > clan.gold ? 'text-rose-400' : 'text-white'}>{totalCharge}г</strong></div>
                      <div><span className="block text-[9px] text-neutral-500 uppercase">Ценность подготовки</span><strong className="text-emerald-400">+{preparationValue}г</strong></div>
                    </div>
                  );
                })()}

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-all cursor-pointer"
                  >
                    Оформить & Оплатить
                  </button>
                </div>

              </form>
            )}
          </div>

          {/* Right Block: Active Formulations List */}
          <div className="bg-[#0d0d0d] border border-emerald-500/10 p-6 rounded-lg space-y-4">
            <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-between border-b border-emerald-500/5 pb-2">
              <span>Оформленные контракты ({state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length})</span>
            </h3>

            <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1 font-mono text-xs">
              {state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length === 0 ? (
                <span className="text-neutral-500 block text-center py-8">Контракты не оформлены.</span>
              ) : (
                state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').map(c => {
                  const clanName = state.clans.find(cl => cl.id === c.clanId)?.name || 'Неизвестно';
                  return (
                    <div
                      key={c.missionId}
                      className="p-3 bg-[#121212] border border-emerald-500/10 rounded space-y-2 relative"
                    >
                      <div className="pr-6">
                        <strong className="text-neutral-200 block text-sm leading-snug">{c.title}</strong>
                        <span className="text-[10px] text-neutral-400 uppercase block mt-0.5">Клан: {clanName}</span>
                      </div>

                      {/* Attached assets badge */}
                      {c.attachedResources && c.attachedResources.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.attachedResources.map((r, resourceIndex) => (
                            <span key={`${r}-${resourceIndex}`} className="px-1.5 py-0.5 bg-emerald-950/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-bold uppercase">
                              {getResourceNameRu(r)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-[11px] text-neutral-500 flex justify-between pt-1 border-t border-neutral-900">
                        <span>Оплата: <strong className="text-amber-500">{c.paymentAmount}г</strong> + {c.guildCommission || 0}г комиссии</span>
                        <span>Уровень: <strong>{c.contractLevel}</strong></span>
                      </div>

                      <button
                        onClick={() => handleUnassignContract(c.missionId)}
                        className="absolute top-2 right-2 text-rose-500 hover:text-rose-400 p-1 hover:bg-[#1f1a1a] rounded transition-all cursor-pointer"
                        title="Расторгнуть контракт"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length > 0 && (
              <button
                onClick={handleNextPhase}
                className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 font-bold uppercase rounded transition-all font-mono text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Перейти к Сбору Отрядов</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>
      )}

      {/* ==============================================
          PHASE 2: SQUAD ASSEMBLY & EDITING
          ============================================== */}
      {currentPhase === 2 && (
        <div className="space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d0d] border border-emerald-500/10 p-3 rounded">
            <span className="font-mono text-xs text-neutral-400 uppercase">
              Активных контрактов для отправки: <strong>{state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length}</strong>
            </span>
            <button
              onClick={handleAutoAssign}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded shadow-[0_0_15px_rgba(0,255,102,0.3)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
              Отправить контракты в гильдию
            </button>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Col (2 Columns): Confirmed contracts assemblies */}
            <div className="lg:col-span-2 space-y-4">
              {state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length === 0 ? (
                <div className="p-12 bg-[#0d0d0d] border border-dashed border-emerald-500/10 rounded text-center text-neutral-500 font-mono text-sm">
                  Нет оформленных контрактов для распределения. Вернитесь на Фазу 1.
                </div>
              ) : (
                state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').map(c => {
                  const targetSize = getContractTargetPartySize(c, state.missions);
                  const currentParty = c.partyAdvIds || [];
                  const clanName = state.clans.find(cl => cl.id === c.clanId)?.name || 'Неизвестно';
                  const isFull = currentParty.length >= targetSize;

                  return (
                    <div
                      key={c.missionId}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        if (id) {
                          handleAssignAdventurerToContract(c, id);
                        }
                      }}
                      className="bg-[#0d0d0d] border border-emerald-500/15 rounded-lg p-5 space-y-4 relative"
                    >
                      {/* Header details */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-neutral-200 font-mono text-base font-bold leading-tight">{c.title}</h4>
                          <span className="text-[10px] text-neutral-400 font-mono uppercase mt-0.5 block">Заказчик: {clanName}</span>
                        </div>
                        <div className="text-right">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${isFull ? 'bg-emerald-950/20 border border-emerald-500 text-emerald-400' : 'bg-amber-950/20 border border-amber-500 text-amber-500'}`}>
                            Собрано: {currentParty.length} / {targetSize}
                          </span>
                        </div>
                      </div>

                      {/* Display assigned members */}
                      <div className="bg-[#121212] border border-emerald-500/5 p-3.5 rounded">
                        <span className="text-[10px] font-mono uppercase text-neutral-500 block mb-2">Назначенный отряд:</span>
                        {currentParty.length === 0 ? (
                          <span className="text-neutral-500 font-mono text-xs block py-2">Отряд не сформирован. Нажмите ИИ распределение или выберите ГМ-ом вручную.</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {currentParty.map(id => {
                              const adv = state.adventurers.find(a => a.id === id);
                              if (!adv) return null;
                              return (
                                <div
                                  key={id}
                                  draggable={state.isDmMode}
                                  onDragStart={(e) => {
                                    if (!state.isDmMode) return;
                                    e.dataTransfer.setData('text/plain', id);
                                  }}
                                  className="px-2.5 py-1.5 bg-neutral-900 border border-emerald-500/30 rounded text-xs font-mono text-emerald-300 flex items-center gap-1.5 select-none transition-all uppercase"
                                >
                                  <button type="button" onClick={() => onSelectAdventurer?.(adv.id)} className="hover:text-white">🗡️ {adv.name}</button>
                                  <span className="text-[9px] bg-emerald-950 px-1 rounded text-emerald-400 font-bold">Lvl {adv.level}</span>
                                  {state.isDmMode && <button type="button" onClick={() => handleToggleAdventurer(c, id)} className="ml-1 text-rose-500 hover:text-rose-300" title="Снять с задания">✕</button>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* Right Col: Available Adventurers selector list */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) {
                  handleRemoveAdventurerFromAllContracts(id);
                }
              }}
              className="bg-[#0d0d0d] border border-emerald-500/10 p-5 rounded-lg space-y-4"
            >
              <h3 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider border-b border-emerald-500/5 pb-2">
                Список приключенцев
              </h3>

              <div className="space-y-2 pr-1">
                {(() => {
                  const readyAdvs = state.adventurers
                    .filter(a => !a.isArchived && a.status === 'READY' && !a.isRosterReserve)
                    .sort((a, b) => a.level - b.level);
                  
                  const woundedAdvs = state.adventurers
                    .filter(a => !a.isArchived && a.status === 'WOUNDED');
                  
                  const displayedAdvs = [...readyAdvs, ...woundedAdvs];

                  return displayedAdvs.map(adv => {
                    const isWounded = adv.status === 'WOUNDED';
                    const isAssigned = state.contracts.some(c => c.partyAdvIds?.includes(adv.id));
                    const assignedToContract = state.contracts.find(c => c.partyAdvIds?.includes(adv.id));

                    if (isWounded) {
                      return (
                        <div
                          key={adv.id}
                          className="p-2.5 bg-rose-950/25 border border-rose-500/30 rounded text-xs font-mono transition-all flex justify-between items-center opacity-85 select-none"
                        >
                          <div>
                            <strong className="text-neutral-200 block">{adv.name}</strong>
                            <div className="text-[9px] text-rose-400 uppercase mt-0.5">
                              {adv.class} • Lvl {adv.level} {adv.isPlayer && <span className="text-amber-500 font-bold ml-1">• ИГРОК</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] bg-rose-950 text-rose-400 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase font-bold">
                              Тяжело ранен
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={adv.id}
                        draggable={state.isDmMode}
                        onDragStart={(e) => {
                          if (!state.isDmMode) return;
                          e.dataTransfer.setData('text/plain', adv.id);
                        }}
                        onClick={() => {
                           if (!state.isDmMode) return;
                           handleAssignAdventurerToNearestSlot(adv.id);
                        }}
                        className={`p-2.5 bg-[#121212] border rounded text-xs font-mono transition-all flex justify-between items-center cursor-pointer select-none ${isAssigned ? 'border-emerald-500 text-emerald-300' : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'}`}
                      >
                        <div>
                          <strong className="text-neutral-200 block">{adv.name}</strong>
                          <div className="text-[9px] text-neutral-500 uppercase mt-0.5">
                            {adv.class} • Lvl {adv.level} {adv.isPlayer && <span className="text-amber-500 font-bold ml-1">• ИГРОК</span>}
                          </div>
                        </div>

                        <div className="text-right">
                          {isAssigned ? (
                            <span className="text-[9px] bg-emerald-950 border border-emerald-500/30 text-emerald-400 font-bold px-1.5 py-0.5 rounded uppercase">
                              Назначен: {assignedToContract?.title.substring(0, 10)}...
                            </span>
                          ) : (
                            <span className="text-[9px] bg-neutral-900 text-neutral-500 border border-neutral-800 px-1.5 py-0.5 rounded uppercase font-bold">
                              Свободен
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {state.contracts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-emerald-500/5">
                  <button
                    onClick={handleNextPhase}
                    className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500 border border-emerald-500 hover:text-black text-emerald-400 font-bold uppercase rounded transition-all font-mono text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Перейти к Симуляции Дня</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>

          </div>

          {state.isDmMode && state.distributionReport && (
            <div className="bg-[#090909] border border-emerald-500/15 p-4 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <strong className="text-xs font-mono uppercase text-neutral-300">Закрытый рапорт рынка</strong>
                <p className="text-[10px] font-mono text-neutral-500 mt-1">
                  Нанято: {state.distributionReport.assignedAdventurers} · В резерве: {state.distributionReport.unassignedAdventurers}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDistributionReportOpen(true)}
                className="px-4 py-2 bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 rounded font-mono text-xs font-bold uppercase cursor-pointer"
              >
                Открыть подробный рапорт
              </button>
            </div>
          )}

        </div>
      )}

      {/* ==============================================
          PHASE 3: SIMULATION & REPORT CARD
          ============================================== */}
      {currentPhase === 3 && (
        <div className="space-y-6">
          
          {/* Main Simulation Action Area */}
          {!state.isDaySimulated ? (
            <div className="space-y-6 flex flex-col items-center">
              <div className="w-full bg-[#0e0e0e] border border-emerald-500/30 p-12 rounded-lg text-center space-y-6 shadow-2xl flex flex-col items-center justify-center">
                <Play className="w-16 h-16 text-emerald-500 animate-pulse" />
                <div className="max-w-lg space-y-2">
                  <h3 className="text-xl font-mono text-emerald-400 font-bold uppercase">Тактическая Симуляция Дня {state.day}</h3>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                  <button
                    type="button"
                    onClick={handleGuildActionsPhase3}
                    disabled={state.isGuildActionsCompleted}
                    className={`px-6 py-3 font-mono text-xs font-bold uppercase rounded transition-all flex items-center gap-1.5 ${state.isGuildActionsCompleted ? 'bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-[#111] hover:bg-neutral-800 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 cursor-pointer'}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    {state.isGuildActionsCompleted ? `Совет: ${state.guildShortName} завершила действия` : `Действия: ${state.guildShortName}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleSimulateDay}
                    disabled={!state.isGuildActionsCompleted}
                    className="px-10 py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none disabled:cursor-not-allowed text-black font-mono text-xs font-bold uppercase tracking-widest rounded shadow-[0_0_20px_rgba(0,255,102,0.3)] hover:enabled:scale-105 transition-all cursor-pointer"
                  >
                    {state.isGuildActionsCompleted ? 'Запустить симуляцию' : `Сначала действия: ${state.guildShortName}`}
                  </button>
                </div>
              </div>

              {/* Prepared Contracts List before Simulation */}
              <div className="w-full max-w-4xl space-y-4">
                <div className="border-b border-emerald-500/10 pb-2 flex items-center justify-between">
                  <h4 className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
                    Подготовленные к симуляции контракты ({state.contracts.filter(c => c.confirmed).length})
                  </h4>
                  <span className="text-neutral-500 font-mono text-[10px] uppercase">
                    Игроки: {state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length} | {state.guildName}: {state.contracts.filter(c => c.confirmed && c.clanId === 'clan_guild').length}
                  </span>
                </div>

                {state.contracts.filter(c => c.confirmed).length === 0 ? (
                  <div className="text-center py-6 text-neutral-500 text-xs font-mono">
                    Нет активных контрактов. Запустите действия «{state.guildName}» или вернитесь на предыдущие фазы.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {state.contracts.filter(c => c.confirmed).map(c => {
                      const clan = state.clans.find(cl => cl.id === c.clanId);
                      const isGuild = c.clanId === 'clan_guild';
                      const party = c.partyAdvIds || [];
                      return (
                        <div key={c.missionId} className={`p-4 rounded-lg border text-left space-y-3 font-mono text-xs ${isGuild ? 'bg-amber-950/5 border-amber-500/20' : 'bg-neutral-900/40 border-emerald-500/15'}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <strong className="text-neutral-200 text-sm leading-snug block">{c.title}</strong>
                              <span className={`text-[10px] font-bold uppercase ${isGuild ? 'text-amber-500' : 'text-emerald-400'}`}>
                                {isGuild ? `🏰 ${state.guildName}` : `🛡️ Клан: ${clan?.name}`}
                              </span>
                            </div>
                            <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded border border-neutral-800 text-neutral-400 font-bold">
                              DC {state.missions.find(m => m.id === c.missionId)?.dc || '?'}
                            </span>
                          </div>

                          {/* Resources and Squad details */}
                          <div className="space-y-1.5 text-[11px] pt-1 border-t border-neutral-900">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Снаряжение:</span>
                              <span className="text-neutral-300">
                                {c.attachedResources.length > 0 
                                  ? c.attachedResources.map(r => getResourceNameRu(r)).join(', ') 
                                  : 'Нет'}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block mb-1">Отряд ({party.length}):</span>
                              {party.length === 0 ? (
                                <span className="text-rose-500 italic text-[10px]">Пустой отряд!</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {party.map(id => {
                                    const adv = state.adventurers.find(a => a.id === id);
                                    if (!adv) return null;
                                    return (
                                      <button type="button" key={id} onClick={() => onSelectAdventurer?.(id)} className="px-1.5 py-0.5 bg-black/60 border border-neutral-800 rounded text-[10px] text-emerald-300 hover:border-emerald-500 hover:text-white">
                                        🗡️ {adv.name} (Lvl {adv.level})
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Day final transition Ribbon */}
              <div className="p-4 bg-emerald-950/25 border border-emerald-500 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="font-mono text-xs">
                  <span className="text-emerald-400 font-bold block text-sm uppercase">День {state.day} успешно симулирован!</span>
                  Все результаты d20 и отчеты сведены в сводку ниже. Ознакомьтесь и завершите ход.
                </div>
                <button
                  onClick={handleNextDay}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase rounded cursor-pointer transition-all uppercase shadow-[0_0_15px_rgba(0,255,102,0.3)] shrink-0"
                >
                  ☀️ Завершить День & Начать День {state.day + 1}
                </button>
              </div>

              {state.contracts.some(contract => {
                const mission = state.missions.find(item => item.id === contract.missionId);
                return mission?.type === 'STORY' && !contract.simulationReport;
              }) && (
                <div className="bg-amber-950/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
                  <div>
                    <h3 className="text-amber-400 font-mono font-bold uppercase text-sm">Сюжетные миссии ожидают решения ГМа</h3>
                    <p className="text-neutral-500 text-xs mt-1">Предложенные рынком NPC не считаются участниками. Укажите фактический состав в ручном рапорте.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {state.contracts.filter(contract => {
                      const mission = state.missions.find(item => item.id === contract.missionId);
                      return mission?.type === 'STORY' && !contract.simulationReport;
                    }).map(contract => {
                      const storyMission = state.missions.find(item => item.id === contract.missionId)!;
                      return (
                      <div key={contract.missionId} className="bg-black/40 border border-amber-500/15 rounded p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <strong className="text-neutral-200 text-sm block">{contract.title}</strong>
                          <small className="text-neutral-500">Предложено NPC: {contract.suggestedSquadAdvIds?.length ?? 0}</small>
                          {state.isDmMode && ((contract.pendingStoryComplications?.length ?? 0) > 0 ? (
                              <div className="space-y-1 rounded border border-amber-500/15 bg-amber-500/5 p-2">
                                <span className="block text-[9px] font-bold uppercase text-amber-400">Осложнения для D&amp;D-сессии</span>
                                {contract.pendingStoryComplications?.map(complication => (
                                  <div key={complication.id} className="text-[10px] leading-relaxed text-neutral-400">
                                    {getComplicationPositionLabel(storyMission, complication.position)} · DC {complication.dc} · {complication.reqResource === 'None' ? 'без ключевого ресурса' : getResourceNameRu(complication.reqResource)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <small className="block text-neutral-600">Автоматических осложнений не возникло.</small>
                            ))}
                        </div>
                        {state.isDmMode && (
                          <button
                            type="button"
                            onClick={() => handleStartStoryReport(contract)}
                            className="px-3 py-2 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500 hover:text-black text-amber-400 rounded font-mono text-xs font-bold uppercase cursor-pointer"
                          >
                            Заполнить рапорт
                          </button>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              )}

              {/* Simulation Result Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {state.contracts.filter(c => c.confirmed).map((contract, originalIndex) => ({ contract, originalIndex })).sort((left, right) => {
                  const leftStory = state.missions.find(mission => mission.id === left.contract.missionId)?.type === 'STORY';
                  const rightStory = state.missions.find(mission => mission.id === right.contract.missionId)?.type === 'STORY';
                  return Number(rightStory) - Number(leftStory) || left.originalIndex - right.originalIndex;
                }).map(({ contract: c, originalIndex: index }) => {
                  const r = c.simulationReport ?? (editingMissionId === c.missionId ? editingReportData as SimulationReport : null);
                  if (!r) return null;
                  const reportMission = state.missions.find(mission => mission.id === c.missionId) ?? r.context?.mission;

                  const isEditing = editingMissionId === c.missionId && editingReportData;
                  const hideLostPartyDetails = !state.isDmMode && (r.outcome === 'PARTY_LOST' || (!r.isSuccess && (r.returnedAdventurerIds?.length ?? 0) === 0));

                  return (
                    <div
                      key={index}
                      className={`bg-[#0d0d0d] border rounded-lg p-5 space-y-4 shadow-md transition-all ${r.isSuccess ? 'border-emerald-500/30' : 'border-rose-500/30'}`}
                    >
                      {isEditing ? (
                        <div className="space-y-4 font-mono text-xs">
                          {/* Editing mode header */}
                          <div className="border-b border-neutral-900 pb-2 flex items-center justify-between">
                            <h4 className="text-emerald-400 font-bold uppercase text-[11px] block">Редактирование донесения: {r.missionTitle}</h4>
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 rounded">ИЗМЕНЕНИЕ ДАННЫХ</span>
                          </div>

                          <div className="flex items-center justify-between gap-3 bg-black/20 p-2.5 rounded border border-neutral-900">
                            <div>
                              <span className="text-neutral-400 uppercase text-[10px] font-bold block">Итог ГМа:</span>
                              <small className="text-neutral-600">Меняет все связанные последствия рапорта.</small>
                            </div>
                            <select value={editingReportData.outcome ?? (editingReportData.isSuccess ? 'SUCCESS' : 'OBJECTIVE_FAILED')} onChange={event => updateEditingOutcome(event.target.value as NonNullable<SimulationReport['outcome']>)} className="rounded border border-neutral-700 bg-black px-3 py-1 text-[10px] font-bold uppercase text-neutral-200"><option value="SUCCESS">Успех</option><option value="OBJECTIVE_FAILED">Провал задачи</option><option value="PARTY_LOST">Отряд не вернулся</option></select>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 rounded border border-neutral-800 bg-black/30 p-2.5 text-[10px] text-neutral-300">
                              <input
                                type="checkbox"
                                disabled={editingReportData.isSuccess}
                                checked={editingReportData.isSuccess || (editingReportData.baseObjectiveCompleted ?? false)}
                                onChange={event => updateEditingField('baseObjectiveCompleted', event.target.checked)}
                              />
                              Основная задача выполнена
                            </label>
                            <label className="rounded border border-neutral-800 bg-black/30 p-2.5 text-[10px] text-neutral-300">
                              <span className="mb-1 block text-neutral-500">Фактически выдано золотом</span>
                              <input type="number" min={0} max={editingReportData.goldReward ?? 0} value={editingReportData.rewardAwardedAmount ?? 0} disabled={!editingReportData.isSuccess} onChange={event => updateEditingField('rewardAwardedAmount', Math.max(0, Math.min(editingReportData.goldReward ?? 0, Number(event.target.value) || 0)))} className="editor-input" />
                            </label>
                          </div>
                          {(reportMission?.rewardSpecialItems?.length ?? 0) > 0 && <label className="flex items-center gap-2 rounded border border-violet-500/20 bg-violet-500/5 p-2.5 text-[10px] text-violet-300"><input type="checkbox" checked={editingReportData.rewardSpecialItemsGranted ?? false} disabled={!editingReportData.isSuccess} onChange={event => updateEditingField('rewardSpecialItemsGranted', event.target.checked)} /> Особая награда выдана: {reportMission?.rewardSpecialItems?.join(', ')}</label>}

                          {/* Narrative output */}
                          <div className="space-y-1">
                            <label className="text-neutral-400 uppercase text-[10px] font-bold block">Художественное описание:</label>
                            <textarea
                              value={editingReportData.narrativeText || ''}
                              onChange={(e) => updateEditingField('narrativeText', e.target.value)}
                              className="w-full h-24 p-2.5 bg-[#080808] border border-neutral-800 rounded text-neutral-200 text-xs focus:border-emerald-500 outline-none resize-none"
                            />
                          </div>

                          {/* Numeric modifiers grid */}
                          <div className="grid grid-cols-2 gap-3 bg-black/40 p-3 rounded border border-neutral-900 text-[10px] text-neutral-400">
                            <div className="space-y-1">
                              <span>Сложность (DC):</span>
                              <input
                                type="number"
                                value={editingReportData.dc ?? 0}
                                onChange={(e) => updateEditingField('dc', parseInt(e.target.value) || 0)}
                                className="w-full p-1 bg-black border border-neutral-850 rounded text-xs text-neutral-200 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>Бросок d20:</span>
                              <input
                                type="number"
                                value={editingReportData.roll ?? 0}
                                onChange={(e) => updateEditingField('roll', parseInt(e.target.value) || 0)}
                                className="w-full p-1 bg-black border border-neutral-850 rounded text-xs text-neutral-200 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>Бонус отряда:</span>
                              <input
                                type="number"
                                value={editingReportData.partyBonus ?? 0}
                                onChange={(e) => updateEditingField('partyBonus', parseInt(e.target.value) || 0)}
                                className="w-full p-1 bg-black border border-neutral-850 rounded text-xs text-neutral-200 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>Награда золотом (г):</span>
                              <input
                                type="number"
                                value={editingReportData.goldReward ?? 0}
                                onChange={(e) => updateEditingField('goldReward', parseInt(e.target.value) || 0)}
                                className="w-full p-1 bg-black border border-neutral-850 rounded text-xs text-neutral-200 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>Нанесенный урон (HP):</span>
                              <input
                                type="number"
                                value={editingReportData.damageDealt ?? 0}
                                onChange={(e) => updateEditingField('damageDealt', parseInt(e.target.value) || 0)}
                                className="w-full p-1 bg-black border border-neutral-850 rounded text-xs text-neutral-200 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <span>Автоуспех:</span>
                              <div className="flex items-center gap-2 h-7">
                                <input
                                  type="checkbox"
                                  checked={editingReportData.isResourceAutoSuccess ?? false}
                                  onChange={(e) => setEditingReportData(previous => previous ? {
                                    ...previous,
                                    isResourceAutoSuccess: e.target.checked,
                                    isSuccess: e.target.checked ? true : previous.isSuccess
                                  } : previous)}
                                  className="w-4 h-4 cursor-pointer"
                                />
                                <span className="text-neutral-500 text-[9px]">По ресурсу</span>
                              </div>
                            </div>
                          </div>

                          {editingReportData.isResourceAutoSuccess && (
                            <div className="space-y-1">
                              <label className="text-neutral-500 text-[9px] uppercase">Причина автоуспеха:</label>
                              <input
                                type="text"
                                value={editingReportData.autoSuccessReason || ''}
                                onChange={(e) => updateEditingField('autoSuccessReason', e.target.value)}
                                placeholder="Особый задействованный ресурс"
                                className="bg-neutral-900 border border-neutral-800 text-neutral-200 px-2 py-1 rounded w-full text-xs outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-neutral-400 uppercase text-[10px] font-bold block">Фактические участники:</label>
                            <ReportParticipantsEditor adventurers={state.adventurers} selectedIds={editingReportData.squadAdvIds ?? []} returnedIds={editingReportData.returnedAdventurerIds ?? []} suggestedIds={c.suggestedSquadAdvIds ?? editingReportData.context?.suggestedSquadAdvIds ?? c.partyAdvIds ?? reportMission?.suggestedSquadAdvIds ?? []} onToggleSelected={toggleEditingParticipant} onToggleReturned={toggleEditingReturn} onOpenDossier={onSelectAdventurer} />
                          </div>

                          <div className="space-y-2">
                            <label className="text-neutral-400 uppercase text-[10px] font-bold block">Фактически потраченные ресурсы:</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {(['Supplies', 'Equipment', 'Intelligence', 'Alchemy'] as BasicResourceKey[]).map(resource => {
                                const attachedCount = c.attachedResources.filter(item => item === resource).length;
                                const usedCount = (editingReportData.attachedResourcesUsed ?? []).filter(item => item === resource).length;
                                return (
                                  <div key={resource} className="bg-black/40 border border-neutral-800 rounded p-2 text-center">
                                    <span className="block text-[9px] text-neutral-500">{getResourceNameRu(resource)} · {usedCount}/{attachedCount}</span>
                                    <div className="flex items-center justify-center gap-2 mt-1">
                                      <button type="button" disabled={usedCount === 0} onClick={() => adjustEditingResource(resource, -1)} className="px-2 border border-neutral-700 disabled:opacity-30 rounded cursor-pointer">−</button>
                                      <strong>{usedCount}</strong>
                                      <button type="button" disabled={usedCount >= attachedCount} onClick={() => adjustEditingResource(resource, 1)} className="px-2 border border-neutral-700 disabled:opacity-30 rounded cursor-pointer">+</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Action Controls */}
                          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-900">
                            <button
                              type="button"
                              onClick={() => { setEditingMissionId(null); setEditingReportData(null); }}
                              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-bold uppercase rounded cursor-pointer border border-neutral-800"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveReportEdit(c.missionId)}
                              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase rounded cursor-pointer shadow-[0_0_10px_rgba(0,255,102,0.2)]"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Header */}
                          <div className="flex justify-between items-start gap-3 border-b border-neutral-900 pb-3">
                            <div>
                              <h4 className="font-mono text-base font-bold text-neutral-200">{r.missionTitle}</h4>
                              <span className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5 block">Заказчик: {r.clanName} | {r.missionRegion}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {r.isSuccess ? (
                                <span className="px-2.5 py-0.5 bg-emerald-950/20 border border-emerald-500 text-emerald-400 text-[10px] font-mono font-bold rounded uppercase flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  Успешно
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-rose-950/20 border border-rose-500 text-rose-400 text-[10px] font-mono font-bold rounded uppercase flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                  Провал
                                </span>
                              )}
                              {state.isDmMode && <button
                                onClick={() => handleStartEditingReport(c)}
                                className="p-1 hover:bg-neutral-800 rounded border border-transparent hover:border-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer text-xs"
                                title="Редактировать отчет"
                              >
                                ✏️
                              </button>}
                            </div>
                          </div>

                          {/* Mechanics roll breakdown */}
                          {!hideLostPartyDetails && <div className="grid grid-cols-3 gap-2 bg-black/60 p-3 rounded font-mono text-[10px] text-neutral-400">
                            {r.isResourceAutoSuccess ? (
                              <div className="col-span-3 text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                <span>✨</span>
                                {r.autoSuccessReason}
                              </div>
                            ) : (
                              <>
                                <div>Бросок d20: <strong className="text-white text-xs">{r.roll}</strong></div>
                                <div>Бонус Уровней: <strong className="text-emerald-400">+{r.partyBonus}</strong></div>
                                <div>Итого: <strong className={`text-xs ${r.isSuccess ? 'text-emerald-400' : 'text-rose-500'}`}>{r.totalRoll} / DC {r.dc}</strong></div>
                              </>
                            )}
                          </div>}

                          {state.isDmMode && r.retreat?.wasTriggered && (
                            <RetreatReportBlock retreat={r.retreat} squadAdvIds={r.squadAdvIds} squadNames={r.squadNames} />
                          )}

                          {/* Narrative outcome text */}
                          <p className="text-xs font-mono text-neutral-300 leading-relaxed italic border-l-2 border-emerald-500/30 pl-3">
                            {r.narrativeText}
                          </p>

                          {/* Damage and Gold outcomes */}
                          {!hideLostPartyDetails && (r.damageDealt > 0 || r.goldReward > 0) && (
                            <div className="flex flex-wrap gap-4 font-mono text-[10px] pt-1.5">
                              {r.damageDealt > 0 && (
                                <span className="text-rose-500 font-bold flex items-center gap-1 bg-rose-950/10 px-2 py-1 rounded border border-rose-500/10">
                                  💥 Урон отряду: -{r.damageDealt} HP
                                </span>
                              )}
                              {r.goldReward > 0 && (
                                <span className="text-amber-500 font-bold flex items-center gap-1 bg-amber-950/10 px-2 py-1 rounded border border-amber-500/10">
                                  🪙 Награда: {r.goldReward}г · выдано {r.rewardAwardedAmount ?? (r.rewardGranted ? r.goldReward : 0)}г
                                </span>
                              )}
                              {(reportMission?.rewardSpecialItems?.length ?? 0) > 0 && (
                                <span className={`font-bold flex items-center gap-1 px-2 py-1 rounded border ${r.rewardSpecialItemsGranted ? 'border-violet-500/30 bg-violet-500/10 text-violet-300' : 'border-neutral-800 bg-black/20 text-neutral-500'}`}>
                                  ◆ {reportMission?.rewardSpecialItems?.join(', ')} · {r.rewardSpecialItemsGranted ? 'выдано' : 'не выдано'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Squad members roster list */}
                          {!hideLostPartyDetails && <div className="space-y-1.5 pt-2 border-t border-neutral-900">
                            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Участники экспедиции:</span>
                            <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                              {r.squadNames.map((n, i) => (
                                <button type="button" onClick={() => r.squadAdvIds[i] && onSelectAdventurer?.(r.squadAdvIds[i])} key={i} className="px-2 py-1 bg-[#141414] border border-neutral-800 rounded text-neutral-300 hover:border-emerald-500 hover:text-white">
                                  🗡️ {n}
                                </button>
                              ))}
                            </div>
                          </div>}
                        </>
                      )}

                    </div>
                  );
                })}

                {/* Expired missions card */}
                {state.history[state.history.length - 1]?.reports.filter(rep => rep.isExpired).map((exp, idx) => (
                  <div key={idx} className="bg-[#0d0d0d] border border-dashed border-rose-500/30 rounded-lg p-5 flex flex-col justify-between shadow-md">
                    <div>
                      <h4 className="font-mono text-base font-bold text-rose-400">{exp.missionTitle}</h4>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase mt-0.5 block">{exp.missionRegion}</span>
                    </div>
                    <p className="text-xs font-mono text-neutral-400 leading-relaxed italic mt-4 pl-3 border-l-2 border-rose-500/20">
                      Донесение осталось без внимания и затерялось в тумане войны. Кланы недовольны бездействием «{state.guildName}».
                    </p>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>
      )}

      <DistributionReportModal
        isOpen={state.isDmMode && isDistributionReportOpen}
        onClose={() => setIsDistributionReportOpen(false)}
        report={state.distributionReport}
        contracts={state.contracts}
        adventurers={state.adventurers}
        clans={state.clans}
        hCost={state.hCost}
      />
    </div>
  );
}
