import type { Clan, Mission, MissionType } from '../types';

export interface MissionPresentation {
  visibleType: MissionType;
  showStoryIdentity: boolean;
  isDelayedStory: boolean;
}

/** Removes the old random display number while preserving the stable internal ID. */
export function cleanMissionTitle(title: string): string {
  return title.replace(/\s+#\d+\s*$/u, '').trim();
}

export function markMissionScouted(mission: Mission, clanId: string): Mission {
  const scoutedByClanIds = [...new Set([...(mission.scoutedByClanIds ?? []), clanId])];
  return { ...mission, intelRevealed: true, scoutedByClanIds };
}

export function getScoutingClanNames(mission: Mission, clans: Clan[]): string[] {
  return (mission.scoutedByClanIds ?? []).map(clanId => {
    return clans.find(clan => clan.id === clanId)?.name ?? clanId;
  });
}

/**
 * A story mission looks like an ordinary operation to players until the day
 * after it was accepted and is still waiting for the GM report.
 */
export function getMissionPresentation(
  mission: Mission,
  day: number,
  isDmMode: boolean
): MissionPresentation {
  const isDelayedStory = mission.type === 'STORY'
    && mission.storyStatus === 'AWAITING_REPORT'
    && mission.storyAcceptedDay !== undefined
    && day > mission.storyAcceptedDay;
  const showStoryIdentity = isDmMode || isDelayedStory;

  return {
    visibleType: mission.type === 'STORY' && !showStoryIdentity ? 'OPERATION' : mission.type,
    showStoryIdentity,
    isDelayedStory
  };
}
