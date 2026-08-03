import type { Contract, Mission, PrerequisiteMode, SimulationReport } from '../types';
import { decrementMissionLifespan, isMissionExpired } from './missions';

export interface MissionLifecycleInput {
  missions: Mission[];
  contracts: Contract[];
  allMissions?: Mission[];
  completedMissionIds: string[];
  nextDay: number;
}

export interface MissionLifecycleResult {
  missions: Mission[];
  contracts: Contract[];
  completedMissionIds: string[];
  unlockedMissionIds: string[];
  scenarioDriven: boolean;
}

function reportCompletesObjective(report: SimulationReport): boolean {
  return report.baseObjectiveCompleted ?? report.isSuccess;
}

function prerequisitesSatisfied(
  mission: Mission,
  completedMissionIds: Set<string>
): boolean {
  const prerequisites = mission.prerequisiteMissionIds ?? [];
  if (prerequisites.length === 0) return true;
  const mode: PrerequisiteMode = mission.prerequisiteMode ?? 'ALL';
  return mode === 'ANY'
    ? prerequisites.some(id => completedMissionIds.has(id))
    : prerequisites.every(id => completedMissionIds.has(id));
}

export function advanceMissionLifecycle(input: MissionLifecycleInput): MissionLifecycleResult {
  const allMissions = input.allMissions ?? [];
  const completedMissionIds = new Set(input.completedMissionIds);
  const reportsByMissionId = new Map<string, SimulationReport>();
  const unlockedMissionIds = new Set<string>();

  input.contracts.forEach(contract => {
    if (!contract.simulationReport) return;
    reportsByMissionId.set(contract.missionId, contract.simulationReport);
    if (reportCompletesObjective(contract.simulationReport)) {
      completedMissionIds.add(contract.missionId);
      contract.simulationReport.effects?.unlockedMissionIds.forEach(id => unlockedMissionIds.add(id));
    }
  });

  const missions: Mission[] = [];
  input.missions.forEach(sourceMission => {
    const mission = structuredClone(sourceMission);
    if (mission.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT') {
      missions.push(mission);
      return;
    }

    const report = reportsByMissionId.get(mission.id);
    if (report?.isExpired) return;
    if (report && reportCompletesObjective(report)) return;

    const aged = decrementMissionLifespan(mission);
    if (!isMissionExpired(aged)) missions.push(aged);
  });

  const activeIds = new Set(missions.map(mission => mission.id));
  const scenarioDriven = allMissions.length > 0;
  allMissions.forEach(sourceMission => {
    if (activeIds.has(sourceMission.id) || completedMissionIds.has(sourceMission.id)) return;
    const scheduled = sourceMission.startDay === undefined || sourceMission.startDay <= input.nextDay;
    const explicitlyUnlocked = unlockedMissionIds.has(sourceMission.id);
    if (!scheduled && !explicitlyUnlocked) return;
    if (!prerequisitesSatisfied(sourceMission, completedMissionIds)) return;

    missions.push({
      ...structuredClone(sourceMission),
      storyStatus: sourceMission.type === 'STORY' ? (sourceMission.storyStatus ?? 'AVAILABLE') : sourceMission.storyStatus
    });
    activeIds.add(sourceMission.id);
  });

  const contracts = input.contracts
    .filter(contract => {
      const mission = missions.find(item => item.id === contract.missionId);
      return mission?.type === 'STORY' && mission.storyStatus === 'AWAITING_REPORT';
    })
    .map(contract => ({ ...structuredClone(contract), simulationReport: undefined }));

  return {
    missions,
    contracts,
    completedMissionIds: Array.from(completedMissionIds),
    unlockedMissionIds: Array.from(unlockedMissionIds),
    scenarioDriven
  };
}
