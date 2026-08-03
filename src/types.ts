/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Resources {
  Supplies: number;
  Equipment: number;
  Intelligence: number;
  Alchemy: number;
  AncientText?: string;
  specialItems?: string[];
  [key: string]: any;
}

export interface Clan {
  id: string;
  name: string;
  trustLevel: number; // 1, 2, or 3
  gold: number;
  resources: Resources;
  freeResourceBudget?: number;
  freeSuppliesBudget?: number; // legacy fallback
}

export type AdventurerStatus = 'READY' | 'WOUNDED' | 'ON_MISSION' | 'DEAD';

export interface Adventurer {
  id: string;
  name: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  status: AdventurerStatus;
  successfulMissions: number;
  totalMissions: number;
  reputation: Record<string, number>; // clanId -> reputation level
  isPlayer?: boolean;
  woundedOnDay?: number;
}

export type MissionType = 'STORY' | 'OPERATION' | 'DUMMY';

export interface MissionCheck {
  reqResource?: string;
  dc: number;
  requiredSpecialItem?: string;
}

export interface Mission {
  id: string;
  title: string;
  desc: string;
  reqResource: string;
  dc: number;
  type: MissionType;
  lifespan: number;
  maxLifespan: number;
  x: number;
  y: number;
  region: string;
  pinned?: boolean;
  intelRevealed?: boolean;
  successText?: string;
  failText?: string;
  startDay?: number;
  goldReward?: number;
  checks?: MissionCheck[];
  requiredSpecialItem?: string;
  rewardSpecialItems?: string[];
  unlocksMissionIds?: string[];
}

export interface SimulationReport {
  isSuccess: boolean;
  isResourceAutoSuccess: boolean;
  autoSuccessReason: string | null;
  roll: number;
  partyBonus: number;
  totalRoll: number;
  dc: number;
  narrativeText: string;
  damageDealt: number;
  goldReward: number;
  attachedResourcesUsed: string[];
  squadNames: string[];
  squadAdvIds: string[];
  clanName: string;
  missionTitle: string;
  missionRegion: string;
  missionId: string;
  isExpired?: boolean;
  checkResults?: string[];
}

export interface Contract {
  missionId: string;
  title: string;
  clanId: string | null;
  pendingClanId?: string | null;
  confirmed: boolean;
  contractLevel: number;
  paymentAmount: number;
  maxPartySize: number;
  attachedResources: string[];
  partyAdvIds: string[];
  paidAmount?: number;
  isScoutedByGuild?: boolean;
  simulationReport?: SimulationReport;
}

export interface GameHistoryEntry {
  day: number;
  contractsCount: number;
  reports: SimulationReport[];
  logs: string[];
}

export interface GameState {
  day: number;
  nClans: number;
  hCost: number;
  isDmMode: boolean;
  mapBgUrl: string;
  mapWidth: number;
  mapHeight: number;
  currentPhase: number; // 1, 2, or 3
  isDaySimulated: boolean;
  assignedClanFilter: string; // 'ALL' or specific clanId
  spawnPolygon: { x: number; y: number }[];
  clans: Clan[];
  adventurers: Adventurer[];
  missions: Mission[];
  allMissions?: Mission[];
  contracts: Contract[];
  history: GameHistoryEntry[];
  selectedMissionId: string | null;
  lastDistributionLogs: string[];
  hqPos?: { x: number; y: number };
}
