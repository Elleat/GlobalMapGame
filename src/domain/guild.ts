import type { Adventurer, BasicResourceKey, Clan, Contract, Mission } from '../types';
import { getResourceGoldCost } from './economy';
import {
  clanHasSpecialItem,
  getMissionChecks,
  getMissionUrgency,
  getReservedSpecialItems,
  getRequiredPreparationResources,
  getRequiredSpecialItems
} from './missions';
import { markMissionScouted } from './missionPresentation';

export interface GuildActionInput {
  clans: Clan[];
  adventurers: Adventurer[];
  missions: Mission[];
  contracts: Contract[];
  hCost: number;
}

export interface GuildActionResult {
  clans: Clan[];
  missions: Mission[];
  contracts: Contract[];
  createdContracts: number;
  assignedAdventurers: number;
  logs: string[];
}

function acquireResource(guild: Clan, resource: BasicResourceKey, hCost: number): boolean {
  const stock = Number(guild.resources[resource] || 0);
  if (stock > 0) {
    guild.resources[resource] = stock - 1;
    return true;
  }
  const price = getResourceGoldCost(resource, hCost);
  if (guild.gold < price) return false;
  guild.gold -= price;
  return true;
}

function acquireIntelligence(guild: Clan, hCost: number): boolean {
  return acquireResource(guild, 'Intelligence', hCost);
}

function getGuildTargetPartySize(mission: Mission, resources: BasicResourceKey[]): number {
  if (mission.type === 'DUMMY') return 1;
  const hasUnavoidableCheck = getMissionChecks(mission).some(check => !check.reqResource || check.reqResource === 'None');
  return Math.min(5, Math.max(1, resources.length, hasUnavoidableCheck ? 2 : 0));
}

function chooseAffordableParty(
  available: Adventurer[],
  targetSize: number,
  gold: number,
  hCost: number
): Adventurer[] {
  const chosen: Adventurer[] = [];
  let wages = 0;
  const byBestLevel = [...available].sort((left, right) => right.level - left.level || left.name.localeCompare(right.name, 'ru'));
  for (const adventurer of byBestLevel) {
    const wage = adventurer.level * hCost;
    if (wages + wage <= gold) {
      chosen.push(adventurer);
      wages += wage;
    }
    if (chosen.length >= targetSize) break;
  }
  return chosen;
}

export function performGuildActions(input: GuildActionInput): GuildActionResult {
  const clans = structuredClone(input.clans);
  let missions = structuredClone(input.missions);
  const contracts = structuredClone(input.contracts);
  let guild = clans.find(clan => clan.id === 'clan_guild');
  const logs: string[] = [];

  if (!guild) {
    return { clans, missions, contracts, createdContracts: 0, assignedAdventurers: 0, logs: ['Клан Гильдии не найден.'] };
  }

  const assignedIds = new Set(contracts.flatMap(contract => contract.partyAdvIds));
  let available = input.adventurers.filter(adventurer =>
    adventurer.status === 'READY' && !adventurer.isPlayer && !assignedIds.has(adventurer.id)
  );
  const maximumContracts = Math.floor(available.length / 2);
  const contractedMissionIds = new Set(contracts.map(contract => contract.missionId));
  const candidates = missions
    .filter(mission => !contractedMissionIds.has(mission.id))
    .sort((left, right) => getMissionUrgency(left) - getMissionUrgency(right));

  logs.push(`Свободных NPC: ${available.length}. Максимум новых контрактов: ${maximumContracts}.`);

  let createdContracts = 0;
  let assignedAdventurers = 0;

  for (const mission of candidates) {
    if (createdContracts >= maximumContracts || available.length === 0) break;

    const requiredSpecialItems = getRequiredSpecialItems(mission);
    const reservedSpecialItems = getReservedSpecialItems(contracts, guild.id, mission.id);
    const missingSpecialItems = requiredSpecialItems
      .filter(item => !clanHasSpecialItem(guild.resources, item) || reservedSpecialItems.has(item));
    if (missingSpecialItems.length > 0) {
      logs.push(`«${mission.title}» пропущено: нет особых предметов для этапов — ${missingSpecialItems.join(', ')}.`);
      continue;
    }

    const trialGuild = structuredClone(guild);
    if (!acquireIntelligence(trialGuild, input.hCost)) {
      logs.push(`«${mission.title}» не разведано: нет разведданных и денег на их покупку.`);
      continue;
    }

    const requiredResources = mission.type === 'DUMMY' ? [] : getRequiredPreparationResources(mission);
    const attachedResources: BasicResourceKey[] = [];
    let canPrepare = true;
    for (const resource of requiredResources) {
      if (!acquireResource(trialGuild, resource, input.hCost)) {
        canPrepare = false;
        logs.push(`«${mission.title}» пропущено: невозможно обеспечить ресурс «${resource}».`);
        break;
      }
      attachedResources.push(resource);
    }
    if (!canPrepare) continue;

    const targetSize = getGuildTargetPartySize(mission, attachedResources);
    const party = chooseAffordableParty(available, targetSize, trialGuild.gold, input.hCost);
    if (party.length < targetSize) {
      logs.push(`«${mission.title}» пропущено: казна или резерв не позволяют собрать отряд из ${targetSize} чел.`);
      continue;
    }

    const wages = party.reduce((sum, adventurer) => sum + adventurer.level * input.hCost, 0);
    trialGuild.gold -= wages;
    guild = trialGuild;
    const partyIds = new Set(party.map(adventurer => adventurer.id));
    available = available.filter(adventurer => !partyIds.has(adventurer.id));

    missions = missions.map(item => item.id === mission.id ? markMissionScouted(item, 'clan_guild') : item);
    contracts.push({
      missionId: mission.id,
      title: mission.title,
      clanId: 'clan_guild',
      confirmed: true,
      contractLevel: Math.max(...party.map(adventurer => adventurer.level)),
      paymentAmount: wages,
      guildCommission: 0,
      paidAmount: wages,
      paidCommission: 0,
      distributionCompleted: true,
      maxPartySize: targetSize,
      attachedResources,
      reservedSpecialItems: requiredSpecialItems,
      partyAdvIds: party.map(adventurer => adventurer.id),
      isScoutedByGuild: true
    });

    createdContracts += 1;
    assignedAdventurers += party.length;
    logs.push(`Создан контракт «${mission.title}»: ${party.length} чел., оплата ${wages}г, ресурсов ${attachedResources.length}.`);
  }

  const guildIndex = clans.findIndex(clan => clan.id === 'clan_guild');
  clans[guildIndex] = guild;

  return { clans, missions, contracts, createdContracts, assignedAdventurers, logs };
}
