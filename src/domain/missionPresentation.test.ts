import assert from 'node:assert/strict';
import test from 'node:test';
import type { Clan, Mission } from '../types';
import {
  cleanMissionTitle,
  getMissionPresentation,
  getScoutingClanNames,
  markMissionScouted
} from './missionPresentation';

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Защита архива #596',
    desc: '',
    reqResource: 'Supplies',
    dc: 12,
    type: 'OPERATION',
    lifespan: 3,
    maxLifespan: 3,
    x: 50,
    y: 50,
    region: 'Архив',
    checks: [{ reqResource: 'Supplies', dc: 12 }],
    ...overrides
  };
}

const clans: Clan[] = [
  {
    id: 'clan-1',
    name: 'Клан Севера',
    trustLevel: 1,
    gold: 0,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0 }
  },
  {
    id: 'clan_guild',
    name: 'Орден Следопытов',
    trustLevel: 5,
    gold: 0,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0 }
  }
];

test('технический номер удаляется только с конца названия', () => {
  assert.equal(cleanMissionTitle('Защита архива #596'), 'Защита архива');
  assert.equal(cleanMissionTitle('Архив #7: второй зал'), 'Архив #7: второй зал');
});

test('разведка запоминает клан и не создаёт повторов', () => {
  const scoutedOnce = markMissionScouted(mission(), 'clan-1');
  const scoutedTwice = markMissionScouted(scoutedOnce, 'clan-1');
  assert.equal(scoutedTwice.intelRevealed, true);
  assert.deepEqual(scoutedTwice.scoutedByClanIds, ['clan-1']);
  assert.deepEqual(getScoutingClanNames(scoutedTwice, clans), ['Клан Севера']);
});

test('сюжетный тип скрыт от игроков до следующего дня ожидания рапорта', () => {
  const story = mission({
    type: 'STORY',
    storyStatus: 'AWAITING_REPORT',
    storyAcceptedDay: 4
  });

  assert.deepEqual(getMissionPresentation(story, 4, false), {
    visibleType: 'OPERATION',
    showStoryIdentity: false,
    isDelayedStory: false
  });
  assert.deepEqual(getMissionPresentation(story, 5, false), {
    visibleType: 'STORY',
    showStoryIdentity: true,
    isDelayedStory: true
  });
  assert.equal(getMissionPresentation({ ...story, intelRevealed: true }, 4, false).visibleType, 'STORY');
  assert.equal(getMissionPresentation({ ...story, storyStatus: 'AVAILABLE' }, 4, true).visibleType, 'STORY');
  assert.equal(getMissionPresentation(mission(), 4, true).showStoryIdentity, false);
});
