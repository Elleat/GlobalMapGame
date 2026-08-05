/**
 * Domain model for the Global Map game.
 *
 * UI components import the model from this module, while rules and state
 * transitions live in src/domain. Keeping the model independent from React
 * is important for tests and the future Electron application.
 */

export const GAME_STATE_VERSION = 2;

export const BASIC_RESOURCE_KEYS = [
  'Supplies',
  'Equipment',
  'Intelligence',
  'Alchemy'
] as const;

export type BasicResourceKey = typeof BASIC_RESOURCE_KEYS[number];
export type MissionResourceKey = BasicResourceKey | 'None';

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
  trustLevel: number;
  /** Campaign experience. Automatic progression applies only to player clans. */
  experience?: number;
  /** Level earned during the current day and activated at the next day boundary. */
  pendingTrustLevel?: number;
  gold: number;
  resources: Resources;
  freeResourceBudget?: number;
  freeSuppliesBudget?: number;
  description?: string;
  /** Current campaign participation. Omitted in legacy files and derived from nClans. */
  isActive?: boolean;
}

export type AdventurerStatus = 'READY' | 'WOUNDED' | 'ON_MISSION' | 'DEAD';

export interface Adventurer {
  id: string;
  name: string;
  class: string;
  description?: string;
  level: number;
  hp: number;
  maxHp: number;
  status: AdventurerStatus;
  successfulMissions: number;
  totalMissions: number;
  /** clanId -> relation score from 0 to 10 */
  relations: Record<string, number>;
  isPlayer?: boolean;
  /** Five-NPC capacity group. Cohorts above the active clan count wait in reserve. */
  rosterCohort?: number;
  /** Derived campaign availability; reserve NPCs keep all progress but cannot be assigned. */
  isRosterReserve?: boolean;
  woundedOnDay?: number;
}

export type MissionType = 'STORY' | 'OPERATION' | 'DUMMY';
export type PrerequisiteMode = 'ALL' | 'ANY';
export type StoryMissionStatus = 'AVAILABLE' | 'AWAITING_REPORT' | 'RESOLVED';

export interface MissionCheck {
  id?: string;
  reqResource?: MissionResourceKey;
  dc: number;
  requiredSpecialItem?: string;
  label?: string;
}

export interface ComplicationSettings {
  enabled: boolean;
  /** Independent probability for every possible insertion point, 0..1. */
  chancePerSlot: number;
  /** A value of 12 means DC = 12 + the number of regular checks. */
  baseDc: number;
  allowMultiple: boolean;
}

export type ComplicationResourceMode = 'RANDOM' | 'FIXED';
export type ComplicationDcMode = 'AUTO' | 'FIXED';

/** One independently configured complication opportunity in the mission timeline. */
export interface MissionComplicationSlot {
  id: string;
  /** 0 = outward journey, 1..checks.length = after that check / return journey. */
  position: number;
  enabled: boolean;
  chance: number;
  resourceMode: ComplicationResourceMode;
  resource: MissionResourceKey;
  dcMode: ComplicationDcMode;
  dc: number;
  baseDc: number;
  gmDescription?: string;
}

export type MissionOutcome = 'SUCCESS' | 'OBJECTIVE_FAILED' | 'PARTY_LOST';
export type MissionRepeatTrigger = MissionOutcome | 'EXPIRED';

export interface MissionRepeatSettings {
  enabled: boolean;
  cooldownDays: number;
  /** null means unlimited total appearances. */
  maxOccurrences: number | null;
  repeatAfter: MissionRepeatTrigger[];
}

export interface ScenarioChain {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface MissionRecurrence {
  definitionId: string;
  nextDay: number;
  occurrenceIndex: number;
}

export interface Mission {
  id: string;
  title: string;
  desc: string;
  reqResource: MissionResourceKey;
  dc: number;
  type: MissionType;
  /** null means the mission never expires. */
  lifespan: number | null;
  maxLifespan: number | null;
  x: number;
  y: number;
  region: string;
  regionId?: string;
  regionMode?: 'AUTO' | 'MANUAL';
  pinned?: boolean;
  intelRevealed?: boolean;
  /** Clan IDs that spent Intelligence to reveal this report. */
  scoutedByClanIds?: string[];
  successText?: string;
  failText?: string;
  startDay?: number;
  goldReward?: number;
  checks?: MissionCheck[];
  requiredSpecialItem?: string;
  rewardSpecialItems?: string[];
  /** Legacy outgoing links retained while scenarios are moved to prerequisites. */
  unlocksMissionIds?: string[];
  prerequisiteMissionIds?: string[];
  prerequisiteMode?: PrerequisiteMode;
  complications?: Partial<ComplicationSettings>;
  complicationSlots?: MissionComplicationSlot[];
  repeat?: MissionRepeatSettings;
  /** Base scenario mission for generated repeat occurrences. */
  definitionId?: string;
  occurrenceIndex?: number;
  chainIds?: string[];
  graphPosition?: { x: number; y: number };
  quotaPriority?: number;
  storyStatus?: StoryMissionStatus;
  storyAcceptedDay?: number;
  storyClanId?: string | null;
  suggestedSquadAdvIds?: string[];
}

export interface CheckResolution {
  id: string;
  kind: 'STAGE' | 'COMPLICATION' | 'RETREAT';
  position: number;
  reqResource: MissionResourceKey;
  dc: number;
  roll: number | null;
  partyBonus: number;
  total: number | null;
  usedResource?: BasicResourceKey;
  isSuccess: boolean;
  damage: number;
}

/**
 * An unresolved complication prepared for a story mission. Story missions are
 * played at the table, so the application determines that the complication
 * exists, its position and its mechanics, while the GM records the outcome in
 * the manual report.
 */
export interface PendingStoryComplication {
  id: string;
  position: number;
  reqResource: MissionResourceKey;
  dc: number;
}

export interface ParticipantOutcome {
  adventurerId: string;
  name: string;
  levelBefore: number;
  levelAfter: number;
  hpBefore: number;
  hpAfter: number;
  maxHpBefore: number;
  maxHpAfter: number;
  statusBefore: AdventurerStatus;
  statusAfter: AdventurerStatus;
  woundedOnDayBefore?: number;
  woundedOnDayAfter?: number;
  successfulMissionsBefore: number;
  successfulMissionsAfter: number;
  totalMissionsBefore: number;
  totalMissionsAfter: number;
  survived: boolean;
  returned: boolean;
  relationDelta: number;
  successfulMissionsDelta: number;
  totalMissionsDelta: number;
}

export interface RetreatResolution {
  wasTriggered: boolean;
  reason?: 'HERO_DOWN' | 'HALF_PARTY_WOUNDED' | 'RETURN_COMPLICATION';
  usedSupplies: boolean;
  roll: number | null;
  bonus: number;
  total: number | null;
  isSuccess: boolean;
  extraDamage: number;
  deadAdventurerIds: string[];
  returnedAdventurerIds: string[];
}

export interface ResourceLedger {
  attached: BasicResourceKey[];
  used: BasicResourceKey[];
  returned: BasicResourceKey[];
  lost: BasicResourceKey[];
}

export interface RelationChange {
  adventurerId: string;
  clanId: string;
  before: number;
  after: number;
  reason: 'FULL_PREPARATION_SUCCESS' | 'NO_PREPARATION';
}

export interface SimulationEffectLedger {
  participantOutcomes: ParticipantOutcome[];
  relationChanges: RelationChange[];
  resourceLedger: ResourceLedger;
  guildGoldDelta: number;
  clanGoldDeltas: Record<string, number>;
  /** Experience awarded to client clans; optional for reports from older saves. */
  clanExperienceDeltas?: Record<string, number>;
  awardedSpecialItems: string[];
  unlockedMissionIds: string[];
}

export interface SimulationReportContext {
  clanId: string | null;
  attachedResources: BasicResourceKey[];
  contractLevel: number;
  maxPartySize: number;
  mission: Mission;
}

export interface SimulationReport {
  isSuccess: boolean;
  outcome?: MissionOutcome;
  isResourceAutoSuccess: boolean;
  autoSuccessReason: string | null;
  roll: number;
  partyBonus: number;
  totalRoll: number;
  dc: number;
  narrativeText: string;
  damageDealt: number;
  goldReward: number;
  /** Whether the configured reward was actually transferred to the customer. */
  rewardGranted?: boolean;
  /** Actual amount transferred; kept separate from the displayed reward. */
  rewardAwardedAmount?: number;
  rewardRecipientClanId?: string | null;
  attachedResourcesUsed: string[];
  squadNames: string[];
  squadAdvIds: string[];
  clanName: string;
  missionTitle: string;
  missionRegion: string;
  missionId: string;
  isExpired?: boolean;
  checkResults?: string[];
  resolutions?: CheckResolution[];
  retreat?: RetreatResolution;
  effects?: SimulationEffectLedger;
  wasManuallyResolved?: boolean;
  baseObjectiveCompleted?: boolean;
  returnedAdventurerIds?: string[];
  failedChecksCount?: number;
  context?: SimulationReportContext;
  /** A later report whose prerequisites became false remains in the archive, but its effects are reversed. */
  invalidated?: boolean;
  invalidationReason?: string;
}

export interface ContractCandidateDecision {
  contractMissionId: string;
  eligible: boolean;
  perceivedValue: number;
  relationBonus: number;
  offeredShare: number;
  reason?: string;
}

export interface AdventurerDistributionDecision {
  adventurerId: string;
  adventurerName: string;
  selectedMissionId: string | null;
  candidates: ContractCandidateDecision[];
}

export interface DistributionReport {
  generatedAt: string;
  randomSeed?: string;
  availableAdventurers: number;
  assignedAdventurers: number;
  unassignedAdventurers: number;
  decisions: AdventurerDistributionDecision[];
  logs: string[];
}

export interface Contract {
  missionId: string;
  title: string;
  clanId: string | null;
  pendingClanId?: string | null;
  confirmed: boolean;
  contractLevel: number;
  /** Gold divided between adventurers. Guild commission is stored separately. */
  paymentAmount: number;
  guildCommission?: number;
  maxPartySize: number;
  attachedResources: BasicResourceKey[];
  partyAdvIds: string[];
  suggestedSquadAdvIds?: string[];
  actualSquadAdvIds?: string[];
  paidAmount?: number;
  paidCommission?: number;
  distributionCompleted?: boolean;
  isScoutedByGuild?: boolean;
  pendingStoryComplications?: PendingStoryComplication[];
  /** Non-consumable stage items locked for this contract until it closes. */
  reservedSpecialItems?: string[];
  simulationReport?: SimulationReport;
}

export interface GameHistoryEntry {
  day: number;
  randomSeed?: string;
  contractsCount: number;
  reports: SimulationReport[];
  logs: string[];
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  cssFile?: string;
}

export type RegionFogDensity = 'LOW' | 'MEDIUM' | 'DENSE';
export type RegionFogSpeed = 'SLOW' | 'NORMAL' | 'FAST';

export interface MapRegionFog {
  enabled: boolean;
  density: RegionFogDensity;
  speed: RegionFogSpeed;
  /** Explicit video opacity. Omitted legacy values use the selected density preset. */
  opacity?: number;
}

export interface MapRegion {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  labelPosition: { x: number; y: number };
  color: string;
  fillOpacity: number;
  borderOpacity: number;
  /** Master switch. A new region is hidden from players by default. */
  visibleToPlayers: boolean;
  showBoundary: boolean;
  showLabel: boolean;
  showFill: boolean;
  fog: MapRegionFog;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description?: string;
  guildName: string;
  guildShortName: string;
  hCost: number;
  mapBgUrl: string;
  mapWidth: number;
  mapHeight: number;
  mapRegions: MapRegion[];
  mapEffectsEnabled: boolean;
  clans: Clan[];
  adventurers: Adventurer[];
  missions: Mission[];
  chains?: ScenarioChain[];
}

export interface GameState {
  schemaVersion: number;
  day: number;
  nClans: number;
  /** Clan activity changes selected by the GM and applied on the next day. */
  pendingClanActivity?: Record<string, boolean>;
  hCost: number;
  guildName: string;
  guildShortName: string;
  themeId: string;
  activeScenarioId: string | null;
  isDmMode: boolean;
  mapBgUrl: string;
  mapAssetId?: string | null;
  mapWidth: number;
  mapHeight: number;
  currentPhase: number;
  isDaySimulated: boolean;
  isGuildActionsCompleted: boolean;
  assignedClanFilter: string;
  spawnPolygon: { x: number; y: number }[];
  mapRegions: MapRegion[];
  mapEffectsEnabled: boolean;
  clans: Clan[];
  adventurers: Adventurer[];
  missions: Mission[];
  allMissions?: Mission[];
  scenarioChains?: ScenarioChain[];
  missionRecurrences?: MissionRecurrence[];
  contracts: Contract[];
  history: GameHistoryEntry[];
  completedMissionIds: string[];
  /** Missions resolved by either success or failure; a failed mission is also terminal. */
  closedMissionIds: string[];
  /** Scenario missions that expired are terminal and must never be spawned again. */
  expiredMissionIds: string[];
  selectedMissionId: string | null;
  lastDistributionLogs: string[];
  distributionReport?: DistributionReport | null;
  hqPos?: { x: number; y: number };
}
