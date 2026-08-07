import type { Adventurer, BasicResourceKey, Clan, Contract } from '../types';
import {
  GUILD_COMMISSION_RATE,
  GUILD_DAILY_FUNDING_PER_CLAN_H,
  MAX_RELATION,
  MIN_RELATION,
  RELATION_VALUE_PER_POINT_H,
  RESOURCE_COST_MULTIPLIERS
} from './constants';

export function clampRelation(value: number): number {
  return Math.max(MIN_RELATION, Math.min(MAX_RELATION, Math.trunc(value)));
}

export function getResourceGoldCost(resource: BasicResourceKey, hCost: number): number {
  return Math.round(RESOURCE_COST_MULTIPLIERS[resource] * hCost);
}

export function getAttachedResourcesValue(resources: readonly BasicResourceKey[], hCost: number): number {
  return resources.reduce((sum, resource) => sum + getResourceGoldCost(resource, hCost), 0);
}

export function getGuildCommission(paymentAmount: number): number {
  return Math.round(Math.max(0, paymentAmount) * GUILD_COMMISSION_RATE);
}

export function getDefaultContractPayment(contractLevel: number, hCost: number): number {
  return Math.max(1, contractLevel) * Math.max(0, hCost) * 4;
}

export function getAdventurerMinimumPayment(adventurer: Pick<Adventurer, 'level'>, hCost: number): number {
  return adventurer.level * hCost;
}

export function getPartyLevelSum(party: readonly Pick<Adventurer, 'level'>[]): number {
  return party.reduce((sum, adventurer) => sum + adventurer.level, 0);
}

export function canPaymentSupportParty(
  paymentAmount: number,
  party: readonly Pick<Adventurer, 'level'>[],
  hCost: number
): boolean {
  return paymentAmount >= getPartyLevelSum(party) * hCost;
}

export function getAdventurerPaymentShare(
  paymentAmount: number,
  adventurer: Pick<Adventurer, 'level'>,
  party: readonly Pick<Adventurer, 'level'>[]
): number {
  const levelSum = getPartyLevelSum(party);
  if (levelSum <= 0) return 0;
  return paymentAmount * adventurer.level / levelSum;
}

export function getRelationBonus(adventurer: Adventurer, clanId: string | null, hCost: number): number {
  if (!clanId) return 0;
  const relation = clampRelation(adventurer.relations?.[clanId] ?? 0);
  return relation * RELATION_VALUE_PER_POINT_H * hCost;
}

export function getContractPerceivedValue(
  contract: Contract,
  adventurer: Adventurer,
  hCost: number
): number {
  return contract.paymentAmount
    + getAttachedResourcesValue(contract.attachedResources, hCost)
    + getRelationBonus(adventurer, contract.clanId, hCost);
}

export function getGuildDailyFunding(clansCount: number, hCost: number): number {
  return Math.max(0, clansCount) * Math.max(0, hCost) * GUILD_DAILY_FUNDING_PER_CLAN_H;
}
