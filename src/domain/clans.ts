import type { Clan } from '../types';

export const GUILD_CLAN_ID = 'clan_guild';
export const MAX_PLAYER_CLANS = 20;

export function orderClansGuildFirst(clans: Clan[]): Clan[] {
  const guild = clans.find(clan => clan.id === GUILD_CLAN_ID);
  const players = clans.filter(clan => clan.id !== GUILD_CLAN_ID);
  return guild ? [guild, ...players] : players;
}

export function getPlayerClans(clans: Clan[]): Clan[] {
  return clans.filter(clan => clan.id !== GUILD_CLAN_ID);
}

export function clampActiveClanCount(clans: Clan[], requested: number): number {
  const available = Math.min(MAX_PLAYER_CLANS, getPlayerClans(clans).length);
  if (available === 0) return 0;
  const finiteRequested = Number.isFinite(requested) ? Math.floor(requested) : available;
  return Math.min(available, Math.max(0, finiteRequested));
}

export function getActivePlayerClans(clans: Clan[], requested: number): Clan[] {
  const players = getPlayerClans(clans);
  if (players.some(clan => clan.isActive !== undefined)) {
    return players.filter(clan => clan.isActive === true);
  }
  return players.slice(0, clampActiveClanCount(clans, requested));
}

export function applyLegacyActiveClanCount(clans: Clan[], requested: number): Clan[] {
  const activeIds = new Set(getPlayerClans(clans).slice(0, clampActiveClanCount(clans, requested)).map(clan => clan.id));
  return clans.map(clan => clan.id === GUILD_CLAN_ID ? clan : { ...clan, isActive: activeIds.has(clan.id) });
}

export function getActiveClansGuildFirst(clans: Clan[], requested: number): Clan[] {
  const guild = clans.find(clan => clan.id === GUILD_CLAN_ID);
  const activePlayers = getActivePlayerClans(clans, requested);
  return guild ? [guild, ...activePlayers] : activePlayers;
}
