import type {
  BasicResourceKey,
  ComplicationSettings,
  Mission,
  Contract,
  MissionCheck,
  MissionResourceKey
} from '../types';
import { BASIC_RESOURCE_KEYS } from '../types';
import { DEFAULT_COMPLICATION_SETTINGS } from './constants';

export function isMissionExpiring(mission: Mission): boolean {
  return mission.lifespan !== null;
}

export function decrementMissionLifespan(mission: Mission): Mission {
  if (mission.lifespan === null) return mission;
  return { ...mission, lifespan: mission.lifespan - 1 };
}

export function isMissionExpired(mission: Mission): boolean {
  return mission.lifespan !== null && mission.lifespan <= 0;
}

export function willMissionExpireAfterDay(mission: Mission): boolean {
  return mission.lifespan !== null && mission.lifespan <= 1;
}

export function getMissionUrgency(mission: Mission): number {
  return mission.lifespan ?? Number.POSITIVE_INFINITY;
}

export function getMissionChecks(mission: Mission): MissionCheck[] {
  if (mission.checks?.length) return mission.checks;
  return [{
    reqResource: mission.reqResource,
    dc: mission.dc,
    // Compatibility for scenarios created before special items became
    // properties of individual stages.
    requiredSpecialItem: mission.requiredSpecialItem
  }];
}

export function getMissionComplicationSettings(mission: Mission): ComplicationSettings {
  return { ...DEFAULT_COMPLICATION_SETTINGS, ...mission.complications };
}

export function getComplicationSlots(mission: Mission): number {
  const checksCount = getMissionChecks(mission).length;
  // Even a dummy without checks has the outward and return journey.
  return Math.max(2, checksCount + 1);
}

export function getComplicationDc(mission: Mission): number {
  return getMissionComplicationSettings(mission).baseDc + getMissionChecks(mission).length;
}

export function getComplicationPositionLabel(mission: Mission, position: number): string {
  const checksCount = mission.type === 'DUMMY' ? 0 : getMissionChecks(mission).length;
  if (position <= 0) return 'По дороге к заданию';
  if (position >= checksCount) return 'По пути обратно';
  return `После этапа ${position}`;
}

export function getRequiredPreparationResources(mission: Mission): BasicResourceKey[] {
  return getMissionChecks(mission)
    .map(check => check.reqResource)
    .filter((resource): resource is BasicResourceKey =>
      Boolean(resource && resource !== 'None' && BASIC_RESOURCE_KEYS.includes(resource as BasicResourceKey))
    );
}

export function getRequiredSpecialItems(mission: Mission): string[] {
  return [...new Set(
    getMissionChecks(mission)
      .map(check => check.requiredSpecialItem?.trim())
      .filter((item): item is string => Boolean(item))
  )];
}

export function clanHasSpecialItem(
  resources: { specialItems?: string[]; AncientText?: string },
  item: string
): boolean {
  return (resources.specialItems ?? []).includes(item) || resources.AncientText === item;
}

export function getReservedSpecialItems(
  contracts: readonly Contract[],
  clanId: string,
  exceptMissionId?: string
): Set<string> {
  return new Set(
    contracts
      .filter(contract => contract.clanId === clanId && contract.missionId !== exceptMissionId)
      .flatMap(contract => contract.reservedSpecialItems ?? [])
  );
}

export function hasFullPreparation(mission: Mission, resources: readonly BasicResourceKey[]): boolean {
  const remaining = [...resources];
  return getRequiredPreparationResources(mission).every(required => {
    const index = remaining.indexOf(required);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function hasNoPreparation(mission: Mission, resources: readonly BasicResourceKey[]): boolean {
  const required = getRequiredPreparationResources(mission);
  return mission.type !== 'DUMMY'
    && getMissionChecks(mission).length > 1
    && required.length > 0
    && resources.length === 0;
}

export function isBasicResource(resource: MissionResourceKey | string | undefined): resource is BasicResourceKey {
  return BASIC_RESOURCE_KEYS.includes(resource as BasicResourceKey);
}
