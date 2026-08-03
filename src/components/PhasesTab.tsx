/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileText, Users, Play, CheckCircle, XCircle, ArrowRight, Shield, AlertTriangle, Coins, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { GameState, Contract, Mission, Clan, Adventurer, SimulationReport } from '../types';
import {
  getContractTargetPartySize,
  getMaxContractLevelForClan,
  calculatePartyBonus,
  rollD20,
  getResourceNameRu,
  getStatusNameRu,
  getTypeRu,
  generateMissionsForDay
} from '../utils';

interface PhasesTabProps {
  state: GameState;
  updateState: (newState: Partial<GameState>) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onOpenStore: (clanId: string) => void;
  onRedirectToReports?: () => void;
}

export default function PhasesTab({
  state,
  updateState,
  showToast,
  onOpenStore,
  onRedirectToReports
}: PhasesTabProps) {
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const [selectedClanId, setSelectedClanId] = useState('');
  const [contractLevel, setContractLevel] = useState(1);
  const [maxPartySize, setMaxPartySize] = useState(5);
  const [attachedResources, setAttachedResources] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(state.hCost * 2);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editingReportData, setEditingReportData] = useState<Partial<SimulationReport> | null>(null);

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
  const playableClans = state.clans.slice(0, state.nClans).filter(c => c.id !== 'clan_guild');
  
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
      setPaymentAmount(suggestedLvl * state.hCost * 2);
    }
  };

  // Handle level change in Phase 1
  const handleLevelChange = (lvl: number) => {
    setContractLevel(lvl);
    setPaymentAmount(lvl * state.hCost * 2);
  };

  // Toggle resource attachment check in Phase 1
  const handleToggleResource = (resType: string) => {
    if (attachedResources.includes(resType)) {
      setAttachedResources(attachedResources.filter(r => r !== resType));
    } else {
      if (attachedResources.length >= maxPartySize) {
        showToast(`Максимум ресурсов на миссию: ${maxPartySize} (по 1 на участника)!`, true);
        return;
      }
      setAttachedResources([...attachedResources, resType]);
    }
  };

  // Create & confirm contract
  const handleConfirmContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMissionId || !selectedClanId) {
      showToast('Выберите миссию и клан-заказчик!', true);
      return;
    }

    const mission = state.missions.find(m => m.id === selectedMissionId);
    const clan = state.clans.find(c => c.id === selectedClanId);
    if (!mission || !clan) return;

    // Check required special item if specified
    if (mission.requiredSpecialItem) {
      const clanSpecialItems = clan.resources.specialItems || [];
      const hasSpecial = clanSpecialItems.includes(mission.requiredSpecialItem) || clan.resources.AncientText === mission.requiredSpecialItem;
      if (!hasSpecial) {
        showToast(`У клана ${clan.name} нет требуемого особого предмета "${mission.requiredSpecialItem}"!`, true);
        return;
      }
    }

    // Check gold and prevent negative balance
    if (clan.gold < paymentAmount || clan.gold <= 0) {
      showToast(`У клана ${clan.name} недостаточно золота или отрицательный баланс (${clan.gold}г)! Оплата невозможна.`, true);
      return;
    }

    // Check resources availability
    for (const r of attachedResources) {
      if ((clan.resources[r] || 0) < 1) {
        showToast(`У клана ${clan.name} на складе нет ресурса "${getResourceNameRu(r)}"!`, true);
        return;
      }
    }

    // Deduct payments
    const updatedClans = state.clans.map(c => {
      if (c.id === clan.id) {
        const updatedResources = { ...c.resources };
        attachedResources.forEach(r => {
          updatedResources[r] = (updatedResources[r] || 1) - 1;
        });

        return {
          ...c,
          gold: c.gold - paymentAmount,
          resources: updatedResources
        };
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
      paidAmount: paymentAmount,
      maxPartySize,
      attachedResources: [...attachedResources],
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

    showToast(`✅ Контракт "${mission.title}" успешно оформлен! Списано: ${paymentAmount}г из казны ${clan.name}.`);

    // Reset inputs
    setSelectedMissionId('');
    setSelectedClanId('');
    setAttachedResources([]);
  };

  // Bug 1 Fix: Correctly unassign contract and refund assets, also clearing squads
  const handleUnassignContract = (missionId: string) => {
    const contract = state.contracts.find(c => c.missionId === missionId);
    if (!contract) return;

    let updatedClans = [...state.clans];
    if (contract.confirmed && contract.clanId && contract.paidAmount) {
      updatedClans = state.clans.map(c => {
        if (c.id === contract.clanId) {
          const updatedResources = { ...c.resources };
          if (contract.attachedResources) {
            contract.attachedResources.forEach(r => {
              updatedResources[r] = (updatedResources[r] || 0) + 1;
            });
          }
          return {
            ...c,
            gold: c.gold + (contract.paidAmount || 0),
            resources: updatedResources
          };
        }
        return c;
      });
    }

    updateState({
      clans: updatedClans,
      contracts: state.contracts.filter(c => c.missionId !== missionId)
    });

    showToast(`Оформление контракта "${contract.title}" отменено. Золото и ресурсы возвращены в казну.`);
  };

  // Phase 2: Toggle adventurer on contract (strictly GM Override check!)
  const handleToggleAdventurer = (contract: Contract, advId: string) => {
    // Bug 4 Fix: restrict manual party editing strictly to GM mode!
    if (!state.isDmMode) {
      showToast('⚠️ Ошибка: Только Гейм-Мастер (GM) может напрямую собирать отряды вручную. Используйте автоматическое распределение Гильдии!', true);
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

  const handleRemoveAdventurerFromAllContracts = (advId: string) => {
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

  const updateEditingField = (field: keyof SimulationReport, value: any) => {
    setEditingReportData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleSaveReportEdit = (missionId: string) => {
    if (!editingReportData) return;
    
    // Find the original contract/report
    const originalContract = state.contracts.find(c => c.missionId === missionId);
    if (!originalContract || !originalContract.simulationReport) return;
    const originalRep = originalContract.simulationReport;

    // Recalculate success dynamically
    const finalRoll = editingReportData.roll ?? 0;
    const finalBonus = editingReportData.partyBonus ?? 0;
    const finalTotal = finalRoll + finalBonus;
    const finalDc = editingReportData.dc ?? 0;
    const finalAutoSuccess = editingReportData.isResourceAutoSuccess ?? false;
    
    const finalSuccess = finalAutoSuccess ? true : (finalTotal >= finalDc);

    const updatedReport: SimulationReport = {
      ...editingReportData as SimulationReport,
      isSuccess: finalSuccess,
      isResourceAutoSuccess: finalAutoSuccess,
      autoSuccessReason: finalAutoSuccess ? (editingReportData.autoSuccessReason || 'Особое снаряжение') : null,
      totalRoll: finalTotal
    };

    // Calculate HP adjustments for adventurers in the squad
    const damageDiff = originalRep.damageDealt - (editingReportData.damageDealt ?? 0);
    const updatedAdvs = state.adventurers.map(adv => {
      if (updatedReport.squadAdvIds?.includes(adv.id)) {
        let nextHp = adv.hp + damageDiff;
        let nextStatus = adv.status;

        if (nextHp > adv.maxHp) nextHp = adv.maxHp;
        if (nextHp <= 0) {
          nextHp = 0;
          nextStatus = 'DEAD';
        } else {
          if (nextStatus === 'DEAD') nextStatus = 'READY';
          if (nextHp < adv.maxHp && nextStatus === 'READY') {
            nextStatus = 'WOUNDED';
          } else if (nextHp === adv.maxHp && nextStatus === 'WOUNDED') {
            nextStatus = 'READY';
          }
        }
        return {
          ...adv,
          hp: nextHp,
          status: nextStatus
        };
      }
      return adv;
    });

    // Calculate Gold adjustment for clans
    const goldDiff = (editingReportData.goldReward ?? 0) - originalRep.goldReward;
    const updatedClans = state.clans.map(clan => {
      if (clan.name === originalRep.clanName) {
        return {
          ...clan,
          gold: Math.max(0, clan.gold + goldDiff)
        };
      }
      return clan;
    });

    // 1. Update contracts state
    const updatedContracts = state.contracts.map(c => {
      if (c.missionId === missionId) {
        return { ...c, simulationReport: updatedReport };
      }
      return c;
    });

    // 2. Update history state (the latest entry's reports)
    const updatedHistory = [...state.history];
    if (updatedHistory.length > 0) {
      const lastIndex = updatedHistory.length - 1;
      const lastEntry = { ...updatedHistory[lastIndex] };
      lastEntry.reports = lastEntry.reports.map(rep => {
        if (rep.missionId === missionId) {
          return updatedReport;
        }
        return rep;
      });
      updatedHistory[lastIndex] = lastEntry;
    }

    updateState({
      adventurers: updatedAdvs,
      clans: updatedClans,
      contracts: updatedContracts,
      history: updatedHistory
    });

    setEditingMissionId(null);
    setEditingReportData(null);
    showToast('⚖️ Рапорт успешно изменен ГМом и показатели пересчитаны!');
  };

  // Phase 2: Guild Actions (AI Guild logic)
  const handleAutoAssign = () => {
    // 1. Reset non-player adventurer assignments from player contracts only
    const resetContracts = state.contracts.map(c => {
      if (c.clanId === 'clan_guild') return c; // don't touch Guild contracts
      // Keep player assignments, filter out NPC assignments
      const players = (c.partyAdvIds || []).filter(id => {
        const adv = state.adventurers.find(a => a.id === id);
        return adv?.isPlayer;
      });
      return { ...c, partyAdvIds: players };
    });

    const logs: string[] = [];
    logs.push(`🏰 [РАСПРЕДЕЛЕНИЕ] Запущен тактический совет по распределению бойцов.`);

    // 2. Calculate remaining unassigned READY adventurers
    const assignedAdventurerIds = new Set(resetContracts.flatMap(c => c.partyAdvIds));
    const unassignedAdvs = state.adventurers.filter(a => 
      a.status === 'READY' && 
      !assignedAdventurerIds.has(a.id)
    );

    // Filter available NPCs (non-player adventurers)
    let availableNPCs = unassignedAdvs.filter(a => !a.isPlayer);

    // Sort remaining available NPCs by level descending to maximize success chance
    availableNPCs.sort((x, y) => y.level - x.level);

    // Group formation for player contracts only
    let changed = true;
    let assignedCount = 0;
    while (changed) {
      changed = false;
      for (const c of resetContracts) {
        if (c.clanId === 'clan_guild') continue; // Skip Guild contracts, ONLY player contracts!
        const targetSize = getContractTargetPartySize(c, state.missions);
        if (c.partyAdvIds.length < targetSize) {
          const eligibleNPCIndex = availableNPCs.findIndex(a => a.level <= c.contractLevel);
          if (eligibleNPCIndex >= 0) {
            const adv = availableNPCs[eligibleNPCIndex];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(eligibleNPCIndex, 1);
            changed = true;
            assignedCount++;
            logs.push(`⚔️ [ГРУППА] ${adv.name} (Ур.${adv.level}) добавлен в отряд контракта "${c.title}".`);
          }
        }
      }
    }

    updateState({
      contracts: resetContracts,
      lastDistributionLogs: logs
    });

    showToast(`🧙‍♂️ Назначено свободных NPC-приключенцев по контрактам игроков: ${assignedCount}.`);
  };

  // Phase 3: Autonomous Guild Actions (Honest resource spending/buying)
  const handleGuildActionsPhase3 = () => {
    const logs: string[] = [];
    logs.push(`🏰 [АКТИВНОСТЬ ГИЛЬДИИ] Запущен тактический совет Гильдии в Фазе 3.`);

    // 1. Find all currently assigned adventurer IDs in existing contracts
    const currentAssignedIds = new Set(state.contracts.flatMap(c => c.partyAdvIds));

    // 2. Filter available READY NPC adventurers (unassigned non-players)
    let availableNPCs = state.adventurers.filter(a => 
      a.status === 'READY' && 
      !a.isPlayer && 
      !currentAssignedIds.has(a.id)
    );

    // 3. Compute n = Floor(availableNPCs.length / 2)
    const n = Math.floor(availableNPCs.length / 2);
    logs.push(`ℹ️ Свободных дееспособных NPC приключенцев: ${availableNPCs.length}. Совет сформирует ${n} контрактов Гильдии.`);

    let updatedClans = JSON.parse(JSON.stringify(state.clans)) as Clan[];
    let updatedMissions = JSON.parse(JSON.stringify(state.missions)) as Mission[];
    let updatedContracts = JSON.parse(JSON.stringify(state.contracts)) as Contract[];

    const guildClan = updatedClans.find(cl => cl.id === 'clan_guild');
    if (!guildClan) {
      showToast('Ошибка: Клан Гильдии не найден!', true);
      return;
    }

    const multipliers: Record<string, number> = {
      'Supplies': 0.5,
      'Equipment': 1.0,
      'Intelligence': 1.0,
      'Alchemy': 1.5
    };

    if (n > 0) {
      // Find uncontracted missions
      const contractedMissionIds = new Set(updatedContracts.map(c => c.missionId));
      const uncontractedMissions = updatedMissions.filter(m => !contractedMissionIds.has(m.id));

      // Sort uncontracted missions by urgency (lifespan ascending)
      const urgentMissions = [...uncontractedMissions].sort((a, b) => a.lifespan - b.lifespan);

      // Select top n missions
      const selectedMissionsForGuild = urgentMissions.slice(0, n);

      selectedMissionsForGuild.forEach(m => {
        // Check special item requirement if present
        if (m.requiredSpecialItem) {
          const guildItems = guildClan.resources.specialItems || [];
          const hasItem = guildItems.includes(m.requiredSpecialItem) || guildClan.resources.AncientText === m.requiredSpecialItem;
          if (!hasItem) {
            logs.push(`⚠️ [ОСОБЫЙ ПРЕДМЕТ] У Гильдии нет предметa "${m.requiredSpecialItem}" для сдачи контракта "${m.title}".`);
            return;
          }
        }

        // Pick adventurer FIRST
        const chosenAdv = availableNPCs.shift();
        const contractLvl = chosenAdv ? chosenAdv.level : 1;

        // Spend or buy Intelligence to reveal intel!
        const intelPrice = Math.round(state.hCost);
        if ((guildClan.resources.Intelligence || 0) >= 1) {
          guildClan.resources.Intelligence = (guildClan.resources.Intelligence || 0) - 1;
          logs.push(`🔍 [РАЗВЕДКА] Гильдия потратила 1 Intelligence со склада для раскрытия донесения "${m.title}".`);
        } else if (guildClan.gold >= intelPrice) {
          guildClan.gold -= intelPrice;
          logs.push(`🛒 [ЗАКУПКА РАЗВЕДКИ] Гильдия за золото (${intelPrice}г) приобрела 1 Intelligence для раскрытия донесения "${m.title}".`);
        } else {
          logs.push(`⚠️ [РАЗВЕДКА] У Гильдии нет Intelligence и не хватает золота (${guildClan.gold}г) для закупки! Донесение "${m.title}" исследуется вслепую.`);
        }

        // Reveal intel
        updatedMissions = updatedMissions.map(mi => {
          if (mi.id === m.id) {
            return { ...mi, intelRevealed: true };
          }
          return mi;
        });

        const attachedResources: string[] = [];

        if (m.type === 'DUMMY') {
          // Dummy mission requires no resources
        } else {
          // Gather all required stage resources
          const checksList = m.checks && m.checks.length > 0 
            ? m.checks 
            : [{ reqResource: m.reqResource, dc: m.dc }];

          let reqResourcesList = checksList
            .map(ch => ch.reqResource)
            .filter(r => r && r !== 'None');

          if (reqResourcesList.length === 0) {
            reqResourcesList.push('Supplies');
          }

          reqResourcesList.forEach(resType => {
            if ((guildClan.resources[resType] || 0) >= 1) {
              guildClan.resources[resType] = (guildClan.resources[resType] || 0) - 1;
              attachedResources.push(resType);
              logs.push(`✨ [РЕСУРС] Выделен ресурс "${getResourceNameRu(resType)}" из хранилища для контракта "${m.title}".`);
            } else {
              const price = Math.round((multipliers[resType] || 1.0) * state.hCost);
              if (guildClan.gold >= price) {
                guildClan.gold -= price;
                attachedResources.push(resType);
                logs.push(`🛒 [ЗАКУПКА] Куплен ресурс "${getResourceNameRu(resType)}" за ${price}г для контракта "${m.title}".`);
              } else {
                logs.push(`⚠️ [РЕСУРСЫ] Не удалось закупить "${getResourceNameRu(resType)}" (нужно ${price}г, у Гильдии ${guildClan.gold}г).`);
              }
            }
          });
        }

        updatedContracts.push({
          missionId: m.id,
          title: m.title,
          clanId: 'clan_guild',
          confirmed: true,
          contractLevel: contractLvl,
          paymentAmount: 0,
          paidAmount: 0,
          maxPartySize: 5,
          attachedResources,
          partyAdvIds: chosenAdv ? [chosenAdv.id] : []
        });
      });
    }

    // Now, assign adventurers:
    // "Сначала гильдия формирует контракты, которые могут быть выполнены автоматически с помощью ресурсов, гильдия отправлят туда ровно столько приключенцев, сколько нужно для донесения ресурсов."
    updatedContracts.forEach(c => {
      if (c.clanId === 'clan_guild' && c.confirmed) {
        const neededForRes = c.attachedResources ? c.attachedResources.length : 0;
        while (c.partyAdvIds.length < neededForRes && availableNPCs.length > 0) {
          const eligibleIdx = availableNPCs.findIndex(a => a.level <= c.contractLevel);
          if (eligibleIdx >= 0) {
            const adv = availableNPCs[eligibleIdx];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(eligibleIdx, 1);
            logs.push(`🗡️ [НАЗНАЧЕНИЕ (РЕСУРСЫ)] ${adv.name} (Ур.${adv.level}) отправлен доставить ресурсы на "${c.title}".`);
          } else if (availableNPCs.length > 0) {
            const adv = availableNPCs[0];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(0, 1);
            logs.push(`🗡️ [НАЗНАЧЕНИЕ (РЕСУРСЫ)] ${adv.name} (Ур.${adv.level}) отправлен доставить ресурсы на "${c.title}".`);
          }
        }
      }
    });

    // "Потом она распределяет оставшихся НЕРАСПРЕДЕЛЕННЫХ приключенцев так, чтобы иметь наибольший шансы выполнения оставшихся контрактов."
    // Let's fill ALL confirmed contracts up to their target party size with the remaining available NPCs.
    availableNPCs.sort((x, y) => y.level - x.level);

    let changed = true;
    let npcAssigned = 0;
    while (changed) {
      changed = false;
      for (const c of updatedContracts) {
        if (!c.confirmed) continue;
        const targetSize = getContractTargetPartySize(c, updatedMissions);
        if (c.partyAdvIds.length < targetSize) {
          const eligibleIdx = availableNPCs.findIndex(a => a.level <= c.contractLevel);
          if (eligibleIdx >= 0) {
            const adv = availableNPCs[eligibleIdx];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(eligibleIdx, 1);
            npcAssigned++;
            logs.push(`⚔️ [ГРУППА] ${adv.name} (Ур.${adv.level}) добавлен в отряд контракта "${c.title}".`);
            changed = true;
          }
        }
      }
    }

    updateState({
      clans: updatedClans,
      missions: updatedMissions,
      contracts: updatedContracts,
      lastDistributionLogs: logs
    });

    showToast(`🏰 Действия Гильдии в Фазе 3 завершены! Создано контрактов: ${n}, распределено бойцов: ${npcAssigned}.`);
  };

  // Phase 3: Simulate Day!
  const handleSimulateDay = () => {
    const dayLogs: string[] = [];
    const reports: SimulationReport[] = [];

    dayLogs.push(`--- ДЕНЬ ${state.day}: ЗАПУСК ТАКТИЧЕСКОЙ СИМУЛЯЦИИ ---`);

    const updatedAdvs = JSON.parse(JSON.stringify(state.adventurers)) as Adventurer[];
    const updatedClans = JSON.parse(JSON.stringify(state.clans)) as Clan[];
    let updatedMissions = JSON.parse(JSON.stringify(state.missions)) as Mission[];

    const tempContracts = JSON.parse(JSON.stringify(state.contracts)) as Contract[];

    // 1. Guild Council Formulation (ONLY in Phase 3!)
    // Find Guild Clan
    const guildClan = updatedClans.find(cl => cl.id === 'clan_guild');
    
    // Find currently assigned adventurer IDs (players or others from previous settings)
    const currentAssignedIds = new Set(tempContracts.flatMap(c => c.partyAdvIds));
    
    // Filter available READY NPC adventurers (non-players, unassigned)
    let availableNPCs = updatedAdvs.filter(a => 
      a.status === 'READY' && 
      !a.isPlayer && 
      !currentAssignedIds.has(a.id)
    );

    // Calculate n = Floor(availableNPCs.length / 2)
    const n = Math.floor(availableNPCs.length / 2);
    dayLogs.push(`🏰 [СОВЕТ ГИЛЬДИИ] Свободных дееспособных NPC приключенцев: ${availableNPCs.length}. Совет решил заняться ${n} новыми донесениями.`);

    if (n > 0) {
      // Find uncontracted missions
      const contractedMissionIds = new Set(tempContracts.map(c => c.missionId));
      const uncontractedMissions = updatedMissions.filter(m => !contractedMissionIds.has(m.id));
      
      // Sort uncontracted missions by urgency (lifespan ascending)
      const urgentMissions = [...uncontractedMissions].sort((a, b) => a.lifespan - b.lifespan);
      
      // Select top n missions
      const selectedMissionsForGuild = urgentMissions.slice(0, n);
      const selectedMissionsIds = new Set(selectedMissionsForGuild.map(m => m.id));

      // Update these missions to have intelRevealed = true
      updatedMissions = updatedMissions.map(m => {
        if (selectedMissionsIds.has(m.id)) {
          return { ...m, intelRevealed: true };
        }
        return m;
      });

      // Formulate Guild contracts for these missions and honestly spend/buy resources
      const multipliers: Record<string, number> = {
        'Supplies': 0.5,
        'Equipment': 1.0,
        'Intelligence': 1.0,
        'Alchemy': 1.5
      };

      selectedMissionsForGuild.forEach(m => {
        if (m.requiredSpecialItem && guildClan) {
          const guildItems = guildClan.resources.specialItems || [];
          const hasItem = guildItems.includes(m.requiredSpecialItem) || guildClan.resources.AncientText === m.requiredSpecialItem;
          if (!hasItem) {
            dayLogs.push(`⚠️ [ОСОБЫЙ ПРЕДМЕТ] У Гильдии нет предмета "${m.requiredSpecialItem}" для сдачи контракта "${m.title}".`);
            return;
          }
        }

        const chosenAdv = availableNPCs.shift();
        const contractLvl = chosenAdv ? chosenAdv.level : 1;
        const attachedResources: string[] = [];

        if (m.type === 'DUMMY') {
          // Dummy mission requires no resources
        } else {
          // Gather all required stage resources
          const checksList = m.checks && m.checks.length > 0 
            ? m.checks 
            : [{ reqResource: m.reqResource, dc: m.dc }];

          let reqResourcesList = checksList
            .map(ch => ch.reqResource)
            .filter(r => r && r !== 'None');

          if (reqResourcesList.length === 0) {
            reqResourcesList.push('Supplies');
          }

          reqResourcesList.forEach(resType => {
            if (guildClan && (guildClan.resources[resType] || 0) > 0) {
              guildClan.resources[resType] = (guildClan.resources[resType] || 1) - 1;
              attachedResources.push(resType);
              dayLogs.push(`✨ [РЕСУРС] Гильдия выделила ресурс "${getResourceNameRu(resType)}" из хранилища для миссии "${m.title}".`);
            } else {
              const price = Math.round((multipliers[resType] || 1.0) * state.hCost);
              if (guildClan && guildClan.gold >= price) {
                guildClan.gold -= price;
                attachedResources.push(resType);
                dayLogs.push(`🛒 [ЗАКУПКА] Гильдия за золото (${price}г) купила ресурс "${getResourceNameRu(resType)}" для миссии "${m.title}".`);
              } else {
                dayLogs.push(`⚠️ [РЕСУРСЫ] У Гильдии нет ресурса "${getResourceNameRu(resType)}" и не хватает золота для закупки!`);
              }
            }
          });
        }

        tempContracts.push({
          missionId: m.id,
          title: m.title,
          clanId: 'clan_guild',
          confirmed: true,
          contractLevel: contractLvl,
          paymentAmount: 0,
          paidAmount: 0,
          maxPartySize: 5,
          attachedResources,
          partyAdvIds: chosenAdv ? [chosenAdv.id] : []
        });
      });
    }

    // 2. Assign available ready non-player adventurers to ALL confirmed/active contracts
    let aiAssignedCount = 0;
    const assignedIds = new Set(tempContracts.flatMap(c => c.partyAdvIds));
    availableNPCs = updatedAdvs.filter(a => 
      a.status === 'READY' && 
      !a.isPlayer && 
      !assignedIds.has(a.id)
    );

    // Step A: Assign exactly 1 adventurer to contracts that have auto-success key resources attached
    tempContracts.forEach(c => {
      if (c.confirmed) {
        const neededForRes = c.attachedResources ? c.attachedResources.length : 0;
        while (c.partyAdvIds.length < neededForRes && availableNPCs.length > 0) {
          const eligibleIdx = availableNPCs.findIndex(a => a.level <= c.contractLevel);
          if (eligibleIdx >= 0) {
            const adv = availableNPCs[eligibleIdx];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(eligibleIdx, 1);
            dayLogs.push(`🗡️ [НАЗНАЧЕНИЕ] ${adv.name} (Ур.${adv.level}) отправлен доставить ресурсы на "${c.title}".`);
            aiAssignedCount++;
          } else if (availableNPCs.length > 0) {
            const adv = availableNPCs[0];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(0, 1);
            dayLogs.push(`🗡️ [НАЗНАЧЕНИЕ] ${adv.name} (Ур.${adv.level}) отправлен доставить ресурсы на "${c.title}".`);
            aiAssignedCount++;
          }
        }
      }
    });

    // Step B: Fill other contracts up to target size
    availableNPCs.sort((x, y) => y.level - x.level);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of tempContracts) {
        if (!c.confirmed) continue;
        const targetSize = getContractTargetPartySize(c, updatedMissions);
        if (c.partyAdvIds.length < targetSize) {
          const eligibleIdx = availableNPCs.findIndex(a => a.level <= c.contractLevel);
          if (eligibleIdx >= 0) {
            const adv = availableNPCs[eligibleIdx];
            c.partyAdvIds.push(adv.id);
            availableNPCs.splice(eligibleIdx, 1);
            dayLogs.push(`⚔️ [ГРУППА] ${adv.name} (Ур.${adv.level}) добавлен в отряд контракта "${c.title}".`);
            aiAssignedCount++;
            changed = true;
          }
        }
      }
    }

    if (aiAssignedCount > 0) {
      showToast(`🏰 Распорядитель Гильдии распределил ${aiAssignedCount} свободных приключенцев по контрактам!`);
    }

    // Process each contract
    const simulatedContracts = tempContracts.map(c => {
      if (!c.confirmed) return c;

      const mission = updatedMissions.find(m => m.id === c.missionId);
      if (!mission) return c;

      const squad = (c.partyAdvIds || []).map(id => updatedAdvs.find(a => a.id === id)).filter(Boolean) as Adventurer[];
      const clan = updatedClans.find(cl => cl.id === c.clanId);
      const clanName = clan ? clan.name : 'Неизвестный Клан';

      if (squad.length === 0) {
        dayLogs.push(`⚠️ Контракт "${c.title}" провален: Ни один приключенец не отправился на миссию!`);
        
        const report: SimulationReport = {
          isSuccess: false,
          isResourceAutoSuccess: false,
          autoSuccessReason: null,
          roll: 0,
          partyBonus: 0,
          totalRoll: 0,
          dc: mission.dc,
          narrativeText: 'Провал: Отряд не собран!',
          damageDealt: 0,
          goldReward: 0,
          attachedResourcesUsed: c.attachedResources || [],
          squadNames: [],
          squadAdvIds: [],
          clanName,
          missionTitle: c.title,
          missionRegion: mission.region,
          missionId: mission.id
        };

        return { ...c, simulationReport: report };
      }

      let isSuccess = true;
      let isResourceAutoSuccess = false;
      let autoSuccessReason = null;
      let roll = 0;
      let partyBonus = calculatePartyBonus(squad);
      let totalRoll = 0;
      const checkResults: string[] = [];

      if (mission.type === 'DUMMY') {
        isSuccess = true;
        isResourceAutoSuccess = true;
        autoSuccessReason = 'Ложная миссия: проверенный район оказался спокоен, угрозы не было.';
        roll = rollD20();
        totalRoll = roll + partyBonus;
        dayLogs.push(`ℹ️ [ЛОЖНАЯ МИССИЯ] Контракт "${c.title}" (${clanName}): Донесение оказалось ложным. Отряд без потерь возвращается на базу.`);
      } else {
        // Multi-check and Auto-Success check
        const checksToRun = mission.checks && mission.checks.length > 0 
          ? mission.checks 
          : [{ reqResource: mission.reqResource, dc: mission.dc }];

        let resourcesBypassedCount = 0;
        const maxCarried = squad.length > 0 ? squad.length : 1;
        let availableRes = (c.attachedResources || []).slice(0, maxCarried);

        if ((c.attachedResources || []).length > maxCarried) {
          dayLogs.push(`⚠️ [ЛИМИТ СНАРЯЖЕНИЯ] Отряд из ${squad.length} чел. смог взять только ${maxCarried} рес. из ${c.attachedResources.length} выданных.`);
        }

        checksToRun.forEach((ch, idx) => {
          const reqRes = ch.reqResource;
          const resIdx = reqRes && reqRes !== 'None' ? availableRes.indexOf(reqRes) : -1;

          if (resIdx !== -1) {
            // Consume resource for THIS stage
            availableRes.splice(resIdx, 1);
            resourcesBypassedCount++;
            checkResults.push(`Этап #${idx + 1} (DC ${ch.dc}, требуется ${getResourceNameRu(reqRes || '')}): ✨ АВТО-УСПЕХ (задействован ресурс)`);
          } else {
            const checkRoll = rollD20();
            if (roll === 0) {
              roll = checkRoll;
              totalRoll = checkRoll + partyBonus;
            }
            const checkTotal = checkRoll + partyBonus;
            const checkPassed = checkTotal >= ch.dc;
            if (!checkPassed) {
              isSuccess = false;
            }
            checkResults.push(`Этап #${idx + 1} (DC ${ch.dc}${reqRes && reqRes !== 'None' ? `, требуется ${getResourceNameRu(reqRes)}` : ''}): 🎲 d20=${checkRoll} + Бонус=+${partyBonus} = Итого: ${checkTotal}. ${checkPassed ? 'УСПЕХ' : 'ПРОВАЛ'}`);
          }
        });

        if (roll === 0) {
          roll = rollD20();
          totalRoll = roll + partyBonus;
        }

        if (isSuccess) {
          if (resourcesBypassedCount === checksToRun.length) {
            isResourceAutoSuccess = true;
            autoSuccessReason = `Особая подготовка: все этапы (${checksToRun.length}) пройдены с использованием ресурсов.`;
          }
          dayLogs.push(`✨ [УСПЕХ] Контракт "${c.title}" (${clanName}) успешно завершен!\n - ${checkResults.join('\n - ')}`);
        } else {
          dayLogs.push(`❌ [ПРОВАЛ] Контракт "${c.title}" (${clanName}) провален!\n - ${checkResults.join('\n - ')}`);
        }
      }

      let dmgDealt = 0;
      let goldReward = mission.goldReward !== undefined ? mission.goldReward : (c.paymentAmount || 100);

      if (isSuccess) {
        // Success: reward adventurers with reputation and XP
        squad.forEach(adv => {
          adv.successfulMissions += 1;
          adv.totalMissions += 1;
          
          // Increment reputation with customer clan
          if (c.clanId) {
            adv.reputation[c.clanId] = (adv.reputation[c.clanId] || 0) + 1;
          }

          // Level up logic (reputation check or XP milestone)
          const lvlUpNeeded = adv.level === 1 ? 1 : adv.level === 2 ? 3 : adv.level === 3 ? 6 : adv.level === 4 ? 10 : 999;
          if (adv.successfulMissions >= lvlUpNeeded && adv.level < 5) {
            adv.level += 1;
            adv.maxHp = adv.level === 1 ? 1 : adv.level === 2 ? 2 : adv.level === 3 ? 2 : adv.level === 4 ? 3 : 4;
            adv.hp = adv.maxHp; // Heal to full on level up
            dayLogs.push(`🎖️ [ПОВЫШЕНИЕ] Герой ${adv.name} достиг Уровня ${adv.level}! HP увеличены.`);
          }
        });

        // 15% guild commission
        const guild = updatedClans.find(g => g.id === 'clan_guild');
        if (guild) {
          const comm = Math.round(c.paymentAmount * 0.15);
          if (comm > 0) {
            guild.gold += comm;
            dayLogs.push(`🪙 [НАЛОГ] Гильдия получила комиссию 15% (${comm}г) от контракта "${c.title}".`);
          }
          // Also reward custom gold directly if specified!
          if (mission.goldReward !== undefined && mission.goldReward > 0) {
            guild.gold += mission.goldReward;
            dayLogs.push(`🪙 [НАГРАДА] В казну Гильдии зачислено золото: +${mission.goldReward}г за успешное выполнение особого контракта.`);
          }
          // Reward special items
          if (mission.rewardSpecialItems && mission.rewardSpecialItems.length > 0) {
            if (!guild.resources.specialItems) {
              guild.resources.specialItems = [];
            }
            mission.rewardSpecialItems.forEach(item => {
              if (!guild.resources.specialItems?.includes(item)) {
                guild.resources.specialItems?.push(item);
              }
              dayLogs.push(`💎 [НАГРАДА] Получен особый предмет: "${item}"!`);
            });
          }
        }
      } else {
        // Failure: Damage & Casualties
        dmgDealt = Math.floor(Math.random() * 2) + 1; // 1 or 2 HP damage
        dayLogs.push(`💥 [УРОН] Отряд понес урон -${dmgDealt} HP из-за провала контракта "${c.title}".`);

        let anyHeroDown = false;
        squad.forEach(adv => {
          adv.totalMissions += 1;
          adv.hp -= dmgDealt;
          if (adv.hp <= 0) {
            anyHeroDown = true;
          }
        });

        if (anyHeroDown) {
          const hasSupplies = c.attachedResources?.includes('Supplies');
          let isEscapeSuccess = false;
          let escapeRoll = 0;
          let escapeBonus = 0;
          let escapeTotal = 0;

          if (hasSupplies) {
            isEscapeSuccess = true;
            dayLogs.push(`📦 [ОТСТУПЛЕНИЕ] Благодаря выделенным припасам (Supplies) отряд совершил автоматическое успешное бегство!`);
          } else {
            escapeRoll = Math.floor(Math.random() * 20) + 1;
            // Party bonus from members who still have HP > 0 AFTER taking damage
            const survivingMembers = squad.filter(a => a.hp > 0);
            escapeBonus = calculatePartyBonus(survivingMembers);
            escapeTotal = escapeRoll + escapeBonus;
            isEscapeSuccess = escapeTotal >= 10;
            dayLogs.push(`🎲 [ПОПЫТКА БЕГСТВА] Бросок спасения отряда: d20(${escapeRoll}) + Бонус(${escapeBonus}) = ${escapeTotal} vs Сложность 10.`);
          }

          squad.forEach(adv => {
            if (adv.hp <= 0) {
              if (isEscapeSuccess) {
                adv.hp = 1;
                adv.status = 'WOUNDED';
                adv.woundedOnDay = state.day;
                dayLogs.push(`🏃‍♂️ [БЕГСТВО: СПАСЕН] ${adv.name} потерял все ОЗ, но отряд успешно сбежал! Герой выжил, но тяжело ранен.`);
              } else {
                adv.hp = 0;
                adv.status = 'DEAD';
                dayLogs.push(`💀 [ГЕРОЙ ПОГИБ] Бегство провалилось! Тяжело раненый ${adv.name} не сумел спастись и погиб на поле боя!`);
              }
            } else {
              adv.status = 'WOUNDED';
              adv.woundedOnDay = state.day;
            }
          });
        } else {
          // No one is down, they just take damage and are wounded
          squad.forEach(adv => {
            adv.status = 'WOUNDED';
            adv.woundedOnDay = state.day;
          });
        }

        goldReward = 0; // No gold payout for fail
      }

      // Mark assigned adventurers status
      squad.forEach(adv => {
        if (adv.status !== 'DEAD' && adv.status !== 'WOUNDED') {
          adv.status = 'ON_MISSION';
        }
      });

      const report: SimulationReport = {
        isSuccess,
        isResourceAutoSuccess,
        autoSuccessReason,
        roll,
        partyBonus,
        totalRoll,
        dc: mission.dc,
        narrativeText: isSuccess ? mission.successText || 'Миссия успешно выполнена!' : mission.failText || 'Экспедиция потерпела крах.',
        damageDealt: dmgDealt,
        goldReward: isSuccess ? goldReward : 0,
        attachedResourcesUsed: c.attachedResources || [],
        squadNames: squad.map(a => a.name),
        squadAdvIds: squad.map(a => a.id),
        clanName,
        missionTitle: c.title,
        missionRegion: mission.region,
        missionId: mission.id,
        checkResults
      };

      reports.push(report);
      return { ...c, simulationReport: report };
    });

    // Check for expired unconfirmed missions (lifespan <= 1)
    updatedMissions.forEach(m => {
      const isAssigned = simulatedContracts.some(c => c.missionId === m.id && c.confirmed);
      if (!isAssigned && m.lifespan <= 1) {
        dayLogs.push(`⏳ [ПРОСРОЧЕНО] Донесение "${m.title}" в регионе ${m.region} осталось без внимания и бесследно исчезло.`);
        reports.push({
          isSuccess: false,
          isResourceAutoSuccess: false,
          autoSuccessReason: null,
          roll: 0,
          partyBonus: 0,
          totalRoll: 0,
          dc: m.dc,
          narrativeText: 'Донесение просрочено и исчезло.',
          damageDealt: 0,
          goldReward: 0,
          attachedResourcesUsed: [],
          squadNames: [],
          squadAdvIds: [],
          clanName: 'Гильдия',
          missionTitle: m.title,
          missionRegion: m.region,
          missionId: m.id,
          isExpired: true
        });
      }
    });

    // Append to logs
    const finalActiveContractsCount = simulatedContracts.filter(c => c.confirmed).length;
    const newHistoryEntry = {
      day: state.day,
      contractsCount: finalActiveContractsCount,
      reports,
      logs: dayLogs
    };

    updateState({
      adventurers: updatedAdvs,
      clans: updatedClans,
      contracts: simulatedContracts,
      isDaySimulated: true,
      missions: updatedMissions,
      history: [...state.history, newHistoryEntry]
    });

    showToast(`🔥 Симуляция дня завершена! Сводка логов сохранена в архивах.`);
  };

  // Switch to next day
  const handleNextDay = () => {
    // Keep contracts that were NOT successful AND whose missions still exist and have lifespan > 1
    const nextDayContracts = state.contracts
      .filter(c => {
        if (c.simulationReport && c.simulationReport.isSuccess) {
          return false; // Successful contract completes
        }
        const m = state.missions.find(mi => mi.id === c.missionId);
        if (!m || m.lifespan <= 1) {
          return false; // Mission deleted or expired
        }
        return true;
      })
      .map(c => {
        // Reset contract daily values for reassignment
        return {
          ...c,
          confirmed: false,
          clanId: null,
          attachedResources: [],
          partyAdvIds: [],
          simulationReport: undefined
        };
      });

    // Handle wounded healing & clear ON_MISSION status back to READY
    const nextDayAdvs = state.adventurers.map(adv => {
      if (adv.status === 'WOUNDED') {
        if (adv.woundedOnDay !== undefined && adv.woundedOnDay === state.day) {
          // Just got wounded on the day being simulated. Do NOT heal yet.
          // They must remain resting for the entire next day.
          return adv;
        } else {
          // They rested for at least 1 full day, so they now heal to full!
          return {
            ...adv,
            hp: adv.maxHp,
            status: 'READY' as const,
            woundedOnDay: undefined
          };
        }
      }
      if (adv.status === 'ON_MISSION') {
        return {
          ...adv,
          status: 'READY' as const
        };
      }
      return adv;
    });

    // Bug 2 Fix: Gold payout for clans according to rank
    // Rank 1: 12h, Rank 2: 20h, Rank 3: 35h
    const nextDayClans = state.clans.map(clan => {
      if (clan.id === 'clan_guild') return clan;
      const rank = clan.trustLevel || 1;
      let dailyPayout = 0;
      if (rank === 1) dailyPayout = 12 * state.hCost;
      else if (rank === 2) dailyPayout = 20 * state.hCost;
      else if (rank >= 3) dailyPayout = 35 * state.hCost;

      // Also reset resource freeResourceBudget for shopping
      const nextFreeRes = rank === 1 ? 2 : rank === 2 ? 4 : 6;

      return {
        ...clan,
        gold: clan.gold + dailyPayout,
        freeResourceBudget: nextFreeRes,
        freeSuppliesBudget: nextFreeRes // back-compat
      };
    });

    // Reduce mission lifespan & filter out simulated (completed/failed) or expired missions
    const simulatedMissionIds = new Set(
      state.contracts
        .filter(c => c.confirmed && c.simulationReport)
        .map(c => c.missionId)
    );

    const nextDayMissions = state.missions
      .filter(m => !simulatedMissionIds.has(m.id))
      .map(m => ({ ...m, lifespan: m.lifespan - 1 }))
      .filter(m => m.lifespan > 0);

    // 1. Process Quest Chain Unlocks:
    const unlockedMissionsToSpawn: Mission[] = [];
    state.contracts.forEach(c => {
      if (c.confirmed && c.simulationReport && c.simulationReport.isSuccess) {
        const originalM = state.missions.find(m => m.id === c.missionId) || (state.allMissions || []).find(m => m.id === c.missionId);
        if (originalM && originalM.unlocksMissionIds) {
          originalM.unlocksMissionIds.forEach(uId => {
            const targetM = (state.allMissions || []).find(m => m.id === uId);
            if (targetM) {
              // Avoid duplicate spawning if already in active missions
              if (!nextDayMissions.some(m => m.id === targetM.id)) {
                unlockedMissionsToSpawn.push({
                  ...targetM,
                  startDay: state.day + 1, // dynamically unlock for the next day
                  lifespan: targetM.lifespan !== undefined ? targetM.lifespan : 3,
                  maxLifespan: targetM.maxLifespan !== undefined ? targetM.maxLifespan : (targetM.lifespan || 3)
                });
              }
            }
          });
        }
      }
    });

    // 2. Process Scenario Days:
    // If we have imported missions for the next day:
    const scenarioMissionsForNextDay = (state.allMissions || [])
      .filter(m => m.startDay === state.day + 1)
      .map(m => ({
        ...m,
        lifespan: m.lifespan !== undefined ? m.lifespan : 3,
        maxLifespan: m.maxLifespan !== undefined ? m.maxLifespan : (m.lifespan || 3)
      }));

    const nextDayScenarioMissions = [...scenarioMissionsForNextDay, ...unlockedMissionsToSpawn];

    // Check if we are running a scenario or have unlocked missions
    const isRunningScenario = (state.allMissions || []).some(m => m.startDay !== undefined && m.startDay > 1) || unlockedMissionsToSpawn.length > 0;

    if (isRunningScenario) {
      // Add pre-defined or unlocked missions only! Avoid random spawning to keep balancing intact!
      nextDayMissions.push(...nextDayScenarioMissions);
    } else {
      // Spawn new random missions: count = number of clans
      const clansCount = state.clans.filter(c => c.id !== 'clan_guild').length || state.nClans || 6;
      const spawnedMissions = generateMissionsForDay(clansCount, state.day + 1, state.spawnPolygon);
      nextDayMissions.push(...spawnedMissions);
    }

    updateState({
      day: state.day + 1,
      currentPhase: 1, // Reset to formulation
      isDaySimulated: false,
      adventurers: nextDayAdvs,
      clans: nextDayClans,
      missions: nextDayMissions,
      contracts: nextDayContracts
    });

    showToast(`☀️ Наступил День ${state.day + 1}! Казна кланов пополнена, раненые вылечились, новые донесения разнеслись по тавернам.`);
    onRedirectToReports?.();
  };

  const handleNextPhase = () => {
    if (currentPhase < 3) {
      updateState({ currentPhase: currentPhase + 1 });
    }
  };

  const handlePrevPhase = () => {
    if (currentPhase > 1) {
      updateState({ currentPhase: currentPhase - 1 });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Phases Chevron Navigator */}
      <div className="flex bg-[#0d0d0d] border border-emerald-500/15 rounded-lg overflow-hidden divide-x divide-emerald-500/10 font-mono text-xs shadow-md">
        
        <button
          onClick={() => updateState({ currentPhase: 1 })}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 cursor-pointer transition-all ${currentPhase === 1 ? 'bg-emerald-950/20 text-emerald-400 border-b-2 border-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}`}
        >
          <FileText className="w-4 h-4" />
          <span>Фаза 1: Оформление контрактов</span>
        </button>

        <button
          onClick={() => updateState({ currentPhase: 2 })}
          className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 cursor-pointer transition-all ${currentPhase === 2 ? 'bg-emerald-950/20 text-emerald-400 border-b-2 border-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}`}
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
                              <span className="font-bold text-[11px] leading-tight line-clamp-1">{m.title}</span>
                              {m.intelRevealed && (
                                <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1 rounded uppercase shrink-0 font-bold">
                                  DC {m.dc}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-neutral-500 uppercase mt-1">
                              <span>📍 {m.region}</span>
                              <span className="text-rose-500 font-bold">⏳ {m.lifespan}дн</span>
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
                              setPaymentAmount(maxLvl * state.hCost * 2);
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

                        if (!selM.intelRevealed) {
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
                                {getTypeRu(selM.type)}
                              </span>
                            </div>

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
                                      {ch.reqResource && ch.reqResource !== 'None' ? (
                                        <span className="text-emerald-400 font-bold">Особый ресурс: {getResourceNameRu(ch.reqResource)}</span>
                                      ) : (
                                        <span className="text-neutral-500">Без спец. ресурса</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {selM.requiredSpecialItem && (
                                  <div className="text-amber-400 text-[11px] pt-1">
                                    💎 <strong>Требуемый особый предмет:</strong> {selM.requiredSpecialItem}
                                  </div>
                                )}
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
                    {['Supplies', 'Equipment', 'Intelligence', 'Alchemy'].map(r => {
                      const isAttached = attachedResources.includes(r);
                      const selectedClan = playableClans.find(c => c.id === selectedClanId);
                      const resourceCount = selectedClan ? (selectedClan.resources[r] || 0) : 0;
                      return (
                        <div
                          key={r}
                          onClick={() => handleToggleResource(r)}
                          className={`p-2.5 rounded border text-center cursor-pointer select-none transition-all ${isAttached ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400 font-bold' : 'bg-black border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
                        >
                          <span className="text-xs uppercase block">{getResourceNameRu(r)}</span>
                          <span className="text-[10px] text-neutral-500 block mt-1">
                            {selectedClan ? `Доступно: ${resourceCount} шт` : 'Выберите клан'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

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
                          {c.attachedResources.map(r => (
                            <span key={r} className="px-1.5 py-0.5 bg-emerald-950/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-bold uppercase">
                              {getResourceNameRu(r)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-[11px] text-neutral-500 flex justify-between pt-1 border-t border-neutral-900">
                        <span>Сумма: <strong className="text-amber-500">{c.paymentAmount}г</strong></span>
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
                                  onClick={() => handleToggleAdventurer(c, id)}
                                  className="px-2.5 py-1.5 bg-neutral-900 border border-emerald-500/30 rounded text-xs font-mono hover:border-rose-500 hover:text-rose-400 text-emerald-300 flex items-center gap-1.5 cursor-pointer select-none transition-all uppercase"
                                >
                                  <span>🗡️ {adv.name}</span>
                                  <span className="text-[9px] bg-emerald-950 px-1 rounded text-emerald-400 font-bold">Lvl {adv.level}</span>
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

              <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1">
                {(() => {
                  const readyAdvs = state.adventurers
                    .filter(a => a.status === 'READY')
                    .sort((a, b) => a.level - b.level);
                  
                  const woundedAdvs = state.adventurers
                    .filter(a => a.status === 'WOUNDED');
                  
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
                          // Click assigns them to the first active contract if in GM mode
                          const firstC = state.contracts[0];
                          if (firstC) {
                            handleToggleAdventurer(firstC, adv.id);
                          } else {
                            showToast('Сначала оформите хотя бы один контракт на Фазе 1!', true);
                          }
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

          {/* AI Logs block */}
          {state.isDmMode && state.lastDistributionLogs && state.lastDistributionLogs.length > 0 && (
            <div className="bg-[#090909] border border-emerald-500/10 p-4 rounded font-mono text-[10px] text-emerald-400 space-y-1">
              <span className="text-xs font-bold uppercase block text-neutral-400 mb-1">📋 Терминал распределения ИИ Гильдии:</span>
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {state.lastDistributionLogs.map((logStr, idx) => (
                  <div key={idx}>{logStr}</div>
                ))}
              </div>
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
                    disabled={state.contracts.some(c => c.clanId === 'clan_guild')}
                    className={`px-6 py-3 font-mono text-xs font-bold uppercase rounded transition-all flex items-center gap-1.5 ${state.contracts.some(c => c.clanId === 'clan_guild') ? 'bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed' : 'bg-[#111] hover:bg-neutral-800 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 cursor-pointer'}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    {state.contracts.some(c => c.clanId === 'clan_guild') ? 'Совет Гильдии проведен' : 'Действия Гильдии (ИИ)'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSimulateDay}
                    className="px-10 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase tracking-widest rounded shadow-[0_0_20px_rgba(0,255,102,0.3)] hover:scale-105 transition-all cursor-pointer"
                  >
                    Запустить симуляцию
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
                    Игроки: {state.contracts.filter(c => c.confirmed && c.clanId !== 'clan_guild').length} | Гильдия: {state.contracts.filter(c => c.confirmed && c.clanId === 'clan_guild').length}
                  </span>
                </div>

                {state.contracts.filter(c => c.confirmed).length === 0 ? (
                  <div className="text-center py-6 text-neutral-500 text-xs font-mono">
                    Нет активных контрактов. Запустите Действия Гильдии (ИИ) или вернитесь на предыдущие фазы.
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
                                {isGuild ? '🏰 Гильдия (ИИ)' : `🛡️ Клан: ${clan?.name}`}
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
                                      <span key={id} className="px-1.5 py-0.5 bg-black/60 border border-neutral-800 rounded text-[10px] text-emerald-300">
                                        🗡️ {adv.name} (Lvl {adv.level})
                                      </span>
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

              {/* Simulation Result Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {state.contracts.filter(c => c.confirmed).map((c, index) => {
                  const r = c.simulationReport;
                  if (!r) return null;

                  const isEditing = editingMissionId === c.missionId && editingReportData;

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

                          {/* Success outcome dynamically displayed */}
                          {(() => {
                            const curTotalRoll = (editingReportData.roll ?? 0) + (editingReportData.partyBonus ?? 0);
                            const isSucc = editingReportData.isResourceAutoSuccess ? true : (curTotalRoll >= (editingReportData.dc ?? 0));
                            return (
                              <div className="flex items-center justify-between bg-black/20 p-2.5 rounded border border-neutral-900">
                                <span className="text-neutral-400 uppercase text-[10px] font-bold">Итог (вычисляемый):</span>
                                <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${isSucc ? 'bg-emerald-950/20 border-emerald-500 text-emerald-400' : 'bg-rose-950/20 border-rose-500 text-rose-400'}`}>
                                  {isSucc ? 'Успех' : 'Провал'}
                                </span>
                              </div>
                            );
                          })()}

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
                                  onChange={(e) => updateEditingField('isResourceAutoSuccess', e.target.checked)}
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
                              <button
                                onClick={() => handleStartEditingReport(c)}
                                className="p-1 hover:bg-neutral-800 rounded border border-transparent hover:border-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer text-xs"
                                title="Редактировать отчет"
                              >
                                ✏️
                              </button>
                            </div>
                          </div>

                          {/* Mechanics roll breakdown */}
                          <div className="grid grid-cols-3 gap-2 bg-black/60 p-3 rounded font-mono text-[10px] text-neutral-400">
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
                          </div>

                          {/* Narrative outcome text */}
                          <p className="text-xs font-mono text-neutral-300 leading-relaxed italic border-l-2 border-emerald-500/30 pl-3">
                            {r.narrativeText}
                          </p>

                          {/* Damage and Gold outcomes */}
                          {(r.damageDealt > 0 || r.goldReward > 0) && (
                            <div className="flex flex-wrap gap-4 font-mono text-[10px] pt-1.5">
                              {r.damageDealt > 0 && (
                                <span className="text-rose-500 font-bold flex items-center gap-1 bg-rose-950/10 px-2 py-1 rounded border border-rose-500/10">
                                  💥 Урон отряду: -{r.damageDealt} HP
                                </span>
                              )}
                              {r.goldReward > 0 && (
                                <span className="text-amber-500 font-bold flex items-center gap-1 bg-amber-950/10 px-2 py-1 rounded border border-amber-500/10">
                                  🪙 Получено золота: +{r.goldReward}г
                                </span>
                              )}
                            </div>
                          )}

                          {/* Squad members roster list */}
                          <div className="space-y-1.5 pt-2 border-t border-neutral-900">
                            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Участники экспедиции:</span>
                            <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                              {r.squadNames.map((n, i) => (
                                <span key={i} className="px-2 py-1 bg-[#141414] border border-neutral-800 rounded text-neutral-300">
                                  🗡️ {n}
                                </span>
                              ))}
                            </div>
                          </div>
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
                      Донесение осталось без внимания и затерялось в тумане войны со временем. Кланы разочарованы бездействием Гильдии.
                    </p>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
