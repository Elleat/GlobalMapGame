import type { Adventurer } from '../types';

export const NPCS_PER_ACTIVE_CLAN = 5;
export const DEFAULT_NPC_ROSTER_CLAN_CAPACITY = 15;

/**
 * Every two five-person cohorts contain seven level-1, two level-2 and one
 * level-3 NPC. This keeps every 5N prefix close to the agreed 70/20/10 split.
 */
export function getStartingNpcLevel(index: number): 1 | 2 | 3 {
  const position = Math.max(0, Math.floor(index)) % 10;
  if (position === 4 || position === 8) return 2;
  if (position === 9) return 3;
  return 1;
}

export function getStartingMissionHistory(level: number): number {
  if (level >= 3) return 3;
  if (level >= 2) return 1;
  return 0;
}

export function applyNpcRosterCapacity(adventurers: Adventurer[], activeClanCount: number): Adventurer[] {
  const activeCohorts = Math.max(0, Math.floor(activeClanCount));
  return adventurers.map(adventurer => {
    if (adventurer.isPlayer || adventurer.rosterCohort === undefined) return adventurer;
    return { ...adventurer, isRosterReserve: adventurer.rosterCohort > activeCohorts };
  });
}

export function isAvailableNpc(adventurer: Adventurer): boolean {
  return !adventurer.isPlayer && !adventurer.isRosterReserve && adventurer.status === 'READY';
}
