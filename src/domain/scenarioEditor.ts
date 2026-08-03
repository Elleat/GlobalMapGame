import type { GameState, Mission, PrerequisiteMode } from '../types';

function prerequisitesSatisfied(
  mission: Mission,
  completedMissionIds: ReadonlySet<string>
): boolean {
  const prerequisites = mission.prerequisiteMissionIds ?? [];
  if (prerequisites.length === 0) return true;
  const mode: PrerequisiteMode = mission.prerequisiteMode ?? 'ALL';
  return mode === 'ANY'
    ? prerequisites.some(id => completedMissionIds.has(id))
    : prerequisites.every(id => completedMissionIds.has(id));
}

export function getScenarioMissions(state: GameState): Mission[] {
  const definitions = state.allMissions ?? [];
  const definitionIds = new Set(definitions.map(mission => mission.id));
  return [
    ...definitions,
    ...state.missions.filter(mission => !definitionIds.has(mission.id))
  ];
}

export function shouldMissionBeActive(state: GameState, mission: Mission): boolean {
  if (state.completedMissionIds.includes(mission.id)) return false;
  if ((mission.startDay ?? 1) > state.day) return false;
  return prerequisitesSatisfied(mission, new Set(state.completedMissionIds));
}

/**
 * Saves a scenario definition and mirrors editable fields to an already active
 * copy. A contracted mission is never removed merely because its schedule was
 * edited; this prevents the scenario editor from orphaning a live contract.
 */
export function saveScenarioMission(state: GameState, mission: Mission): Partial<GameState> {
  const scenario = getScenarioMissions(state);
  const existsInScenario = scenario.some(item => item.id === mission.id);
  const allMissions = existsInScenario
    ? scenario.map(item => item.id === mission.id ? structuredClone(mission) : item)
    : [...scenario, structuredClone(mission)];

  const activeIndex = state.missions.findIndex(item => item.id === mission.id);
  const hasContract = state.contracts.some(contract => contract.missionId === mission.id);
  const shouldBeActive = shouldMissionBeActive(state, mission);
  let missions = [...state.missions];

  if (activeIndex >= 0) {
    if (shouldBeActive || hasContract) {
      const active = state.missions[activeIndex];
      missions[activeIndex] = {
        ...structuredClone(mission),
        storyStatus: active.storyStatus,
        storyAcceptedDay: active.storyAcceptedDay,
        storyClanId: active.storyClanId,
        suggestedSquadAdvIds: active.suggestedSquadAdvIds
      };
    } else {
      missions = missions.filter(item => item.id !== mission.id);
    }
  } else if (shouldBeActive) {
    missions.push(structuredClone(mission));
  }

  return { allMissions, missions };
}

export function deleteScenarioMission(state: GameState, missionId: string): Partial<GameState> {
  const removeReference = (mission: Mission): Mission => ({
    ...mission,
    prerequisiteMissionIds: (mission.prerequisiteMissionIds ?? []).filter(id => id !== missionId),
    unlocksMissionIds: (mission.unlocksMissionIds ?? []).filter(id => id !== missionId)
  });

  return {
    allMissions: getScenarioMissions(state)
      .filter(mission => mission.id !== missionId)
      .map(removeReference),
    missions: state.missions
      .filter(mission => mission.id !== missionId)
      .map(removeReference),
    contracts: state.contracts.filter(contract => contract.missionId !== missionId),
    selectedMissionId: state.selectedMissionId === missionId ? null : state.selectedMissionId
  };
}

export function createScenarioMission(day: number, existingIds: readonly string[]): Mission {
  let suffix = Date.now().toString(36);
  let id = `event_${suffix}`;
  let sequence = 1;
  while (existingIds.includes(id)) {
    id = `event_${suffix}_${sequence}`;
    sequence += 1;
  }

  return {
    id,
    title: 'Новое событие',
    desc: '',
    reqResource: 'None',
    dc: 12,
    type: 'OPERATION',
    lifespan: 3,
    maxLifespan: 3,
    x: 50,
    y: 50,
    region: 'ДИКИЕ ЗЕМЛИ',
    startDay: day,
    goldReward: 0,
    checks: [{ id: `${id}_stage_1`, label: 'Этап 1', reqResource: 'None', dc: 12 }],
    rewardSpecialItems: [],
    prerequisiteMissionIds: [],
    prerequisiteMode: 'ALL',
    complications: {
      enabled: true,
      chancePerSlot: 0.03,
      baseDc: 12,
      allowMultiple: true
    }
  };
}
