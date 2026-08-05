import type { Clan, Mission } from '../types';

export const MAX_AUTOMATIC_CLAN_LEVEL = 3;
export const CLAN_LEVEL_THRESHOLDS = {
  1: 0,
  2: 8,
  3: 24
} as const;

function asNonNegativeInteger(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

export function getClanLevelForExperience(experience: number): number {
  const normalized = asNonNegativeInteger(experience);
  if (normalized >= CLAN_LEVEL_THRESHOLDS[3]) return 3;
  if (normalized >= CLAN_LEVEL_THRESHOLDS[2]) return 2;
  return 1;
}

export function getMinimumExperienceForClanLevel(level: number): number {
  if (level >= 3) return CLAN_LEVEL_THRESHOLDS[3];
  if (level >= 2) return CLAN_LEVEL_THRESHOLDS[2];
  return CLAN_LEVEL_THRESHOLDS[1];
}

export function getClanExperience(clan: Clan): number {
  return asNonNegativeInteger(clan.experience, getMinimumExperienceForClanLevel(clan.trustLevel));
}

export function getClanExperienceReward(
  mission: Mission,
  baseObjectiveCompleted: boolean,
  isSuccess: boolean
): number {
  if (mission.type === 'DUMMY') return isSuccess ? 1 : 0;
  if (!baseObjectiveCompleted) return 0;
  return 1 + (mission.checks?.length ?? 1);
}

export function setClanExperience(clan: Clan, experience: number): Clan {
  if (clan.id === 'clan_guild') return clan;
  const normalizedExperience = asNonNegativeInteger(experience);
  const earnedLevel = getClanLevelForExperience(normalizedExperience);
  const pendingTrustLevel = earnedLevel > clan.trustLevel ? earnedLevel : undefined;
  return {
    ...clan,
    experience: normalizedExperience,
    pendingTrustLevel
  };
}

export function addClanExperience(clan: Clan, delta: number): Clan {
  if (clan.id === 'clan_guild' || delta === 0) return clan;
  return setClanExperience(clan, getClanExperience(clan) + delta);
}

export function activatePendingClanLevel(clan: Clan): Clan {
  if (clan.id === 'clan_guild') return clan;
  const pendingLevel = Math.max(clan.trustLevel, Math.min(MAX_AUTOMATIC_CLAN_LEVEL, clan.pendingTrustLevel ?? clan.trustLevel));
  return {
    ...clan,
    trustLevel: pendingLevel,
    experience: getClanExperience(clan),
    pendingTrustLevel: undefined
  };
}

export function normalizeClanProgression(clan: Clan): Clan {
  if (clan.id === 'clan_guild') return { ...clan, experience: undefined, pendingTrustLevel: undefined };
  const trustLevel = Math.max(1, Math.min(5, Math.trunc(clan.trustLevel || 1)));
  return setClanExperience({ ...clan, trustLevel }, getClanExperience({ ...clan, trustLevel }));
}

export function getClanProgressLabel(clan: Clan): string {
  const experience = getClanExperience(clan);
  if (clan.trustLevel >= MAX_AUTOMATIC_CLAN_LEVEL) return `${experience} опыта · максимальный автоматический уровень`;
  const nextLevel = Math.min(MAX_AUTOMATIC_CLAN_LEVEL, clan.trustLevel + 1) as 2 | 3;
  return `${experience}/${CLAN_LEVEL_THRESHOLDS[nextLevel]} опыта до уровня ${nextLevel}`;
}
