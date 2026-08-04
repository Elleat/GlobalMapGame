import type { Adventurer, BasicResourceKey, Mission } from '../types';
import { clampRelation } from './economy';
import { hasFullPreparation, hasNoPreparation } from './missions';

export function getMissionRelationDelta(
  mission: Mission,
  attachedResources: readonly BasicResourceKey[],
  isMissionSuccess: boolean
): -1 | 0 | 1 {
  if (mission.type === 'DUMMY') return 0;
  if (hasNoPreparation(mission, attachedResources)) return -1;
  const hasRequiredResources = mission.checks?.some(check => check.reqResource && check.reqResource !== 'None')
    ?? (mission.reqResource !== 'None');
  if (hasRequiredResources && isMissionSuccess && hasFullPreparation(mission, attachedResources)) return 1;
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
