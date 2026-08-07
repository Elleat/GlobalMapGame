import type { Clan, MapRegion, Mission, ScenarioChain } from '../types';
import { getMissionChecks, getMissionGoldReward, getRequiredSpecialItems } from './missions';
import { findMapRegionAtPoint } from './mapRegions';

export type ScenarioIssueSeverity = 'ERROR' | 'WARNING' | 'INFO';
export interface ScenarioIssue { severity: ScenarioIssueSeverity; message: string; missionId?: string; }

export interface ScenarioDayBalance {
  day: number;
  events: number;
  operations: number;
  stories: number;
  dummies: number;
  stages: number;
  autoRewardH: number;
  requiredResources: number;
  noResourceStages: number;
  easyChecks: number;
  mediumChecks: number;
  hardChecks: number;
  extremeChecks: number;
  impossibleChecks: number;
}

export function analyzeScenario(events: Mission[], regions: MapRegion[], chains: ScenarioChain[], clans: Clan[], activeClans: number): { issues: ScenarioIssue[]; days: ScenarioDayBalance[] } {
  const issues: ScenarioIssue[] = [];
  const ids = new Set(events.map(event => event.id));
  const chainIds = new Set(chains.map(chain => chain.id));
  const initialSpecialItems = new Set<string>();
  clans.forEach(clan => (clan.resources.specialItems ?? []).forEach(item => initialSpecialItems.add(item)));

  const graph = new Map(events.map(event => [event.id, (event.prerequisiteMissionIds ?? []).filter(id => ids.has(id))]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (graph.get(id) ?? []).some(visit);
    visiting.delete(id); visited.add(id);
    return cyclic;
  };
  events.forEach(event => {
    if (visit(event.id)) issues.push({ severity: 'ERROR', missionId: event.id, message: `Циклическая зависимость: «${event.title}».` });
    (event.prerequisiteMissionIds ?? []).filter(id => !ids.has(id)).forEach(id => issues.push({ severity: 'ERROR', missionId: event.id, message: `Отсутствует условие ${id}.` }));
    (event.chainIds ?? []).filter(id => !chainIds.has(id)).forEach(id => issues.push({ severity: 'WARNING', missionId: event.id, message: `Неизвестная цепочка ${id}.` }));
    if (event.type === 'DUMMY' && (event.checks?.length ?? 0) > 0) issues.push({ severity: 'ERROR', missionId: event.id, message: 'Пустышка содержит основной этап.' });
    if (event.repeat?.enabled && event.repeat.repeatAfter.length === 0) issues.push({ severity: 'WARNING', missionId: event.id, message: 'Возобновляемая миссия не имеет условия повторения.' });
    getRequiredSpecialItems(event).filter(item => !initialSpecialItems.has(item) && !events.some(source => source.id !== event.id && (source.rewardSpecialItems ?? []).includes(item))).forEach(item => issues.push({ severity: 'ERROR', missionId: event.id, message: `Особый предмет «${item}» нигде до этой миссии не выдаётся и отсутствует у кланов.` }));
    if ((event.regionMode ?? 'MANUAL') === 'AUTO' && !findMapRegionAtPoint(regions, event)) issues.push({ severity: 'WARNING', missionId: event.id, message: 'Автоматическое событие находится вне всех регионов.' });
    getMissionChecks(event).filter(check => check.dc >= 22).forEach(() => issues.push({ severity: 'INFO', missionId: event.id, message: `«${event.title}»: DC 22+ невозможно для базовой партии без ресурса.` }));
    if (event.complicationSlots && event.complicationSlots.length !== (event.type === 'DUMMY' ? 2 : getMissionChecks(event).length + 1)) issues.push({ severity: 'WARNING', missionId: event.id, message: 'Число сохранённых точек осложнений не совпадает с текущей структурой этапов; редактор синхронизирует их автоматически.' });
  });

  chains.filter(chain => !events.some(event => (event.chainIds ?? []).includes(chain.id))).forEach(chain => issues.push({ severity: 'INFO', message: `Цепочка «${chain.name}» пока не содержит событий.` }));

  const grouped = new Map<number, Mission[]>();
  events.forEach(event => grouped.set(event.startDay ?? 1, [...(grouped.get(event.startDay ?? 1) ?? []), event]));
  const days = [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([day, dayEvents]) => {
    const checks = dayEvents.flatMap(getMissionChecks);
    const limit = activeClans * 2;
    if (dayEvents.length > limit) issues.push({ severity: 'WARNING', message: `День ${day}: ${dayEvents.length} событий при квоте ${limit}.` });
    const expectedDummies = Math.round(dayEvents.length * 0.1);
    const actualDummies = dayEvents.filter(event => event.type === 'DUMMY').length;
    if (Math.abs(expectedDummies - actualDummies) > 1) issues.push({ severity: 'INFO', message: `День ${day}: пустышек ${actualDummies}, ориентир 10% — ${expectedDummies}.` });
    return {
      day,
      events: dayEvents.length,
      operations: dayEvents.filter(event => event.type === 'OPERATION').length,
      stories: dayEvents.filter(event => event.type === 'STORY').length,
      dummies: actualDummies,
      stages: checks.length,
      autoRewardH: dayEvents.reduce((sum, event) => sum + getMissionGoldReward(event, 1), 0),
      requiredResources: checks.filter(check => check.reqResource && check.reqResource !== 'None').length,
      noResourceStages: checks.filter(check => !check.reqResource || check.reqResource === 'None').length,
      easyChecks: checks.filter(check => check.dc <= 8).length,
      mediumChecks: checks.filter(check => check.dc > 8 && check.dc <= 12).length,
      hardChecks: checks.filter(check => check.dc > 12 && check.dc <= 16).length,
      extremeChecks: checks.filter(check => check.dc > 16 && check.dc <= 20).length,
      impossibleChecks: checks.filter(check => check.dc > 20).length
    };
  });
  return { issues, days };
}
