import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from './state';
import { createScenarioMission, deleteScenarioMission, getScenarioMissions, saveScenarioMission } from './scenarioEditor';

test('scenario editor includes active missions missing from the definition list', () => {
  const state = createInitialGameState();
  const scenarioOnly = { ...createScenarioMission(3, []), id: 'future' };
  state.allMissions = [scenarioOnly];
  const visible = getScenarioMissions(state);
  assert.equal(visible.some(item => item.id === 'future'), true);
  assert.equal(visible.some(item => item.id === state.missions[0].id), true);
  assert.equal(new Set(visible.map(item => item.id)).size, visible.length);
});

test('future scenario mission stays outside the active map', () => {
  const state = createInitialGameState();
  const mission = { ...createScenarioMission(state.day, []), id: 'future', startDay: state.day + 2 };
  const change = saveScenarioMission(state, mission);
  assert.equal(change.allMissions?.some(item => item.id === 'future'), true);
  assert.equal(change.missions?.some(item => item.id === 'future'), false);
});

test('mission with ALL prerequisites activates only after all are complete', () => {
  const state = {
    ...createInitialGameState(),
    completedMissionIds: ['first']
  };
  const mission = {
    ...createScenarioMission(state.day, []),
    id: 'dependent',
    prerequisiteMissionIds: ['first', 'second'],
    prerequisiteMode: 'ALL' as const
  };
  const change = saveScenarioMission(state, mission);
  assert.equal(change.missions?.some(item => item.id === 'dependent'), false);

  const anyChange = saveScenarioMission(state, { ...mission, prerequisiteMode: 'ANY' });
  assert.equal(anyChange.missions?.some(item => item.id === 'dependent'), true);
});

test('deleting a scenario mission removes contracts and dependency references', () => {
  const state = createInitialGameState();
  const first = { ...createScenarioMission(1, []), id: 'first' };
  const second = {
    ...createScenarioMission(1, ['first']),
    id: 'second',
    prerequisiteMissionIds: ['first']
  };
  state.missions = [first, second];
  state.allMissions = [first, second];
  state.contracts = [{
    missionId: 'first',
    title: first.title,
    clanId: null,
    confirmed: false,
    contractLevel: 1,
    paymentAmount: 0,
    maxPartySize: 4,
    attachedResources: [],
    partyAdvIds: []
  }];

  const change = deleteScenarioMission(state, 'first');
  assert.equal(change.contracts?.length, 0);
  assert.deepEqual(change.allMissions?.find(item => item.id === 'second')?.prerequisiteMissionIds, []);
});
