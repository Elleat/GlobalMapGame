import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from './state';
import {
  buildNewCampaign,
  createAdventurerDataFile,
  createEventDataFile,
  createScenarioDataFile,
  DataFileValidationError,
  parseAdventurerDataFile,
  parseEventDataFile,
  parseScenarioDataFile
} from './dataFiles';

test('файл авантюристов требует тип, версию и уникальные ID', () => {
  const state = createInitialGameState();
  const file = createAdventurerDataFile('Тест', [state.adventurers[0], { ...state.adventurers[0] }]);
  assert.throws(() => parseAdventurerDataFile(file), DataFileValidationError);
});

test('файл событий отклоняет ссылку на отсутствующее событие', () => {
  const state = createInitialGameState();
  const mission = { ...state.missions[0], prerequisiteMissionIds: ['missing_event'] };
  const file = createEventDataFile('Тест', [mission]);
  assert.throws(() => parseEventDataFile(file), DataFileValidationError);
});

test('файл событий отклоняет циклические зависимости', () => {
  const state = createInitialGameState();
  const first = { ...state.missions[0], id: 'first', prerequisiteMissionIds: ['second'] };
  const second = { ...state.missions[1], id: 'second', prerequisiteMissionIds: ['first'] };
  assert.throws(() => parseEventDataFile(createEventDataFile('Цикл', [first, second])), DataFileValidationError);
});

test('валидные отдельные файлы проходят проверку без изменения данных', () => {
  const state = createInitialGameState();
  const adventurers = createAdventurerDataFile('Герои', state.adventurers.slice(0, 2));
  const events = createEventDataFile('События', state.missions.slice(0, 2));
  assert.equal(parseAdventurerDataFile(adventurers).adventurers.length, 2);
  assert.equal(parseEventDataFile(events).events.length, 2);
});

test('сценарий и отдельные наборы собирают новую кампанию с приоритетом отдельных файлов', () => {
  const state = createInitialGameState();
  const scenario = createScenarioDataFile({
    id: 'scenario_test',
    name: 'Тестовый сценарий',
    description: '',
    guildName: 'Старая Гильдия',
    guildShortName: 'Гильдия',
    hCost: 25,
    nClans: state.nClans,
    themeId: state.themeId,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    spawnPolygon: state.spawnPolygon,
    hqPos: state.hqPos,
    clans: state.clans,
    adventurers: state.adventurers.slice(0, 3),
    events: state.missions.slice(0, 3)
  });
  const parsedScenario = parseScenarioDataFile(scenario);
  const overrideAdventurers = createAdventurerDataFile('Другие герои', state.adventurers.slice(0, 1));
  const campaign = buildNewCampaign({
    isDmMode: true,
    guildName: 'Новая Гильдия',
    scenarioFile: parsedScenario,
    adventurerFile: overrideAdventurers
  });
  assert.equal(campaign.guildName, 'Новая Гильдия');
  assert.equal(campaign.hCost, 25);
  assert.equal(campaign.adventurers.length, 1);
  assert.equal(campaign.contracts.length, 0);
  assert.equal(campaign.day, 1);
});
