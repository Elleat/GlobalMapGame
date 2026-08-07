import assert from 'node:assert/strict';
import test from 'node:test';
import type { Clan, Mission } from '../types';
import {
  activatePendingClanLevel,
  addClanExperience,
  getClanExperienceReward,
  getClanLevelForExperience,
  normalizeClanProgression,
  setClanExperience
} from './clanProgression';

function clan(overrides: Partial<Clan> = {}): Clan {
  return {
    id: 'clan-1',
    name: 'Тестовый клан',
    trustLevel: 1,
    gold: 0,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0 },
    ...overrides
  };
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Тестовая миссия',
    desc: '',
    reqResource: 'None',
    dc: 10,
    type: 'OPERATION',
    lifespan: 2,
    maxLifespan: 2,
    x: 50,
    y: 50,
    region: 'Тест',
    checks: [{ reqResource: 'None', dc: 10 }],
    ...overrides
  };
}

test('уровни клана открываются на 8 и 24 опыте', () => {
  assert.equal(getClanLevelForExperience(7), 1);
  assert.equal(getClanLevelForExperience(8), 2);
  assert.equal(getClanLevelForExperience(23), 2);
  assert.equal(getClanLevelForExperience(24), 3);
});

test('опыт готовит уровень, но активирует его только на следующий день', () => {
  const earned = addClanExperience(clan({ experience: 7 }), 1);
  assert.equal(earned.trustLevel, 1);
  assert.equal(earned.pendingTrustLevel, 2);
  const activated = activatePendingClanLevel(earned);
  assert.equal(activated.trustLevel, 2);
  assert.equal(activated.pendingTrustLevel, undefined);
});

test('обычная миссия даёт единицу плюс число этапов, а успешная пустышка — единицу', () => {
  assert.equal(getClanExperienceReward(mission({ checks: [{ reqResource: 'None', dc: 10 }, { reqResource: 'Supplies', dc: 12 }] }), true, true), 3);
  assert.equal(getClanExperienceReward(mission(), false, false), 0);
  assert.equal(getClanExperienceReward(mission({ type: 'DUMMY', checks: [] }), true, true), 1);
  assert.equal(getClanExperienceReward(mission({ type: 'DUMMY', checks: [] }), true, false), 0);
});

test('ГМ может вручную задать уровень и опыт, автоматическое понижение не происходит', () => {
  const manuallyRaised = setClanExperience(clan({ trustLevel: 3 }), 0);
  assert.equal(manuallyRaised.trustLevel, 3);
  assert.equal(manuallyRaised.pendingTrustLevel, undefined);
  assert.equal(normalizeClanProgression(clan({ trustLevel: 2 })).experience, 8);
});

test('Гильдия не участвует в автоматической прогрессии', () => {
  const guild = clan({ id: 'clan_guild', trustLevel: 5 });
  assert.deepEqual(addClanExperience(guild, 100), guild);
});
