import type { Adventurer, BasicResourceKey, Mission } from '../types';
import { clampRelation } from './economy';
import { hasFullPreparation, hasNoPreparation } from './missions';

export function getMissionRelationDelta(
  mission: Mission,
  attachedResources: readonly BasicResourceKey[],
  isMissionSuccess: boolean
): -1 | 0 | 1 {
  if (hasNoPreparation(mission, attachedResources)) return -1;
  if (isMissionSuccess && hasFullPreparation(mission, attachedResources)) return 1;
  return 0;
}

export function applyRelationDelta(
  adventurer: Adventurer,
  clanId: string,
  delta: number
): Adventurer {
  const current = adventurer.relations?.[clanId] ?? 0;
  return {
    ...adventurer,
    relations: {
      ...adventurer.relations,
      [clanId]: clampRelation(current + delta)
    }
  };
}

