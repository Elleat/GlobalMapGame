import type { BasicResourceKey, ComplicationSettings } from '../types';

export const DEFAULT_GUILD_NAME = 'Гильдия Авантюристов';
export const DEFAULT_GUILD_SHORT_NAME = 'Гильдия';
export const DEFAULT_THEME_ID = 'dark-wardens';
export const DEFAULT_MAP_URL = '/media/GlobalMap.webp';

export const GUILD_COMMISSION_RATE = 0.15;
export const GUILD_DAILY_FUNDING_PER_CLAN_H = 5;
export const RELATION_VALUE_PER_POINT_H = 0.5;
export const MIN_RELATION = 0;
export const MAX_RELATION = 10;

export const DEFAULT_COMPLICATION_SETTINGS: ComplicationSettings = {
  enabled: true,
  chancePerSlot: 0.03,
  baseDc: 12,
  allowMultiple: true
};

export const RESOURCE_COST_MULTIPLIERS: Record<BasicResourceKey, number> = {
  Supplies: 0.5,
  Equipment: 1,
  Intelligence: 1,
  Alchemy: 1.5
};

export const TRUST_DAILY_GOLD_H: Record<number, number> = {
  1: 12,
  2: 20,
  3: 35
};

export const TRUST_FREE_RESOURCES: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3
};

export const TRUST_PAYMENT_LIMIT_H: Record<number, number> = {
  1: 10,
  2: 15,
  3: 25
};

