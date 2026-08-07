import assert from 'node:assert/strict';
import test from 'node:test';
import type { Adventurer, Clan, Contract, Mission } from '../types';
import {
  canPaymentSupportParty,
  clampRelation,
  getContractPerceivedValue,
  getDefaultContractPayment
} from './economy';
import { distributePlayerContracts } from './distribution';
import { performGuildActions } from './guild';
import { hasFullPreparation, hasNoPreparation } from './missions';

function adventurer(overrides: Partial<Adventurer> = {}): Adventurer {
  return {
    id: 'adv-1',
    name: 'Тестовый герой',
    class: 'Воин',
    level: 1,
    hp: 1,
    maxHp: 1,
    status: 'READY',
    successfulMissions: 0,
    totalMissions: 0,
    relations: {},
    ...overrides
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    missionId: 'mission-1',
    title: 'Тестовый контракт',
    clanId: 'clan-1',
    confirmed: true,
    contractLevel: 1,
    paymentAmount: 40,
    maxPartySize: 4,
    attachedResources: [],
    partyAdvIds: [],
    ...overrides
  };
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Тестовое событие',
    desc: '',
    reqResource: 'Supplies',
    dc: 12,
    type: 'OPERATION',
    lifespan: 3,
    maxLifespan: 3,
    x: 50,
    y: 50,
    region: 'Тестовый регион',
    checks: [
      { reqResource: 'Supplies', dc: 12 },
      { reqResource: 'Intelligence', dc: 12 }
    ],
    ...overrides
  };
}

test('оплата по умолчанию покрывает четырёх героев ранга контракта', () => {
  assert.equal(getDefaultContractPayment(3, 10), 120);
});

test('псевдонаграда учитывает ресурсы и индивидуальные отношения', () => {
  const hero = adventurer({ relations: { 'clan-1': 2 } });
  const offer = contract({
    paymentAmount: 60,
    attachedResources: ['Supplies', 'Intelligence']
  });
  assert.equal(getContractPerceivedValue(offer, hero, 10), 85);
});

test('реальная оплата ограничивает суммарный уровень отряда', () => {
  const party = [adventurer({ level: 3 }), adventurer({ id: 'adv-2', level: 3 })];
  assert.equal(canPaymentSupportParty(60, party, 10), true);
  assert.equal(canPaymentSupportParty(59, party, 10), false);
});

test('отношения всегда остаются в диапазоне от 0 до 10', () => {
  assert.equal(clampRelation(-3), 0);
  assert.equal(clampRelation(15), 10);
});

test('полная подготовка учитывает повторяющиеся ресурсы', () => {
  const repeated = mission({
    checks: [
      { reqResource: 'Supplies', dc: 12 },
      { reqResource: 'Supplies', dc: 13 }
    ]
  });
  assert.equal(hasFullPreparation(repeated, ['Supplies']), false);
  assert.equal(hasFullPreparation(repeated, ['Supplies', 'Supplies']), true);
});

test('этапы без ключевого ресурса не требуют подготовки и не дают штраф', () => {
  const noResource = mission({
    reqResource: 'None',
    checks: [
      { reqResource: 'None', dc: 12 },
      { reqResource: 'None', dc: 13 }
    ]
  });
  assert.equal(hasFullPreparation(noResource, []), true);
  assert.equal(hasNoPreparation(noResource, []), false);
});

test('при равной оплате герой выбирает клан с лучшими отношениями', () => {
  const hero = adventurer({ relations: { 'clan-1': 0, 'clan-2': 2 } });
  const result = distributePlayerContracts({
    adventurers: [hero],
    contracts: [
      contract({ missionId: 'mission-1', clanId: 'clan-1' }),
      contract({ missionId: 'mission-2', clanId: 'clan-2' })
    ],
    hCost: 10,
    random: () => 0.5,
    generatedAt: '2026-08-03T00:00:00.000Z'
  });
  assert.deepEqual(result.contracts[0].partyAdvIds, []);
  assert.deepEqual(result.contracts[1].partyAdvIds, [hero.id]);
});

test('NPC из резервной когорты не участвует в рыночном распределении', () => {
  const reserve = adventurer({ isRosterReserve: true, rosterCohort: 2 });
  const result = distributePlayerContracts({
    adventurers: [reserve],
    contracts: [contract()],
    hCost: 10,
    random: () => 0.5
  });
  assert.deepEqual(result.contracts[0].partyAdvIds, []);
  assert.equal(result.report.assignedAdventurers, 0);
});

test('повторное распределение сохраняет уже назначенных NPC и заполняет только свободные места', () => {
  const retained = adventurer({ id: 'adv-retained' });
  const newcomer = adventurer({ id: 'adv-new' });
  const result = distributePlayerContracts({
    adventurers: [retained, newcomer],
    contracts: [contract({ maxPartySize: 2, paymentAmount: 20, partyAdvIds: [retained.id] })],
    hCost: 10,
    random: () => 0.5
  });
  assert.deepEqual(result.contracts[0].partyAdvIds, [retained.id, newcomer.id]);
  assert.equal(result.report.assignedAdventurers, 1);
});

test('архивный NPC не участвует в распределении', () => {
  const archived = adventurer({ id: 'adv-archived', isArchived: true });
  const result = distributePlayerContracts({ adventurers: [archived], contracts: [contract()], hCost: 10 });
  assert.deepEqual(result.contracts[0].partyAdvIds, []);
  assert.equal(result.report.availableAdventurers, 0);
});

test('при равной привлекательности ограниченное место получает более сильный кандидат', () => {
  const novice = adventurer({ id: 'adv-level-1', level: 1 });
  const veteran = adventurer({ id: 'adv-level-2', level: 2 });
  const result = distributePlayerContracts({
    adventurers: [novice, veteran],
    contracts: [contract({ contractLevel: 2, paymentAmount: 20, maxPartySize: 1 })],
    hCost: 10,
    random: () => 0.5
  });
  assert.deepEqual(result.contracts[0].partyAdvIds, [veteran.id]);
  assert.equal(result.report.unassignedAdventurers, 1);
});

test('герой не принимает контракт выше допустимого ранга или ниже минимальной оплаты', () => {
  const hero = adventurer({ level: 3 });
  const result = distributePlayerContracts({
    adventurers: [hero],
    contracts: [
      contract({ contractLevel: 2, paymentAmount: 100 }),
      contract({ missionId: 'mission-2', contractLevel: 3, paymentAmount: 29 })
    ],
    hCost: 10,
    random: () => 0.5
  });
  assert.equal(result.report.assignedAdventurers, 0);
  assert.equal(result.report.unassignedAdventurers, 1);
});

test('Гильдия тратит разведданные и оплачивает назначенный отряд', () => {
  const guild: Clan = {
    id: 'clan_guild',
    name: 'Гильдия Авантюристов',
    trustLevel: 5,
    gold: 100,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 1, Alchemy: 0 }
  };
  const guildMission = mission({ type: 'DUMMY', checks: [], reqResource: 'None' });
  const heroes = [1, 2, 3, 4].map(index => adventurer({ id: `adv-${index}` }));
  const result = performGuildActions({
    clans: [guild],
    adventurers: heroes,
    missions: [guildMission],
    contracts: [],
    hCost: 10
  });
  assert.equal(result.createdContracts, 1);
  assert.equal(result.assignedAdventurers, 1);
  assert.equal(result.clans[0].gold, 90);
  assert.equal(result.clans[0].resources.Intelligence, 0);
  assert.equal(result.missions[0].intelRevealed, true);
  assert.deepEqual(result.missions[0].scoutedByClanIds, ['clan_guild']);
});

test('Гильдия не раскрывает и не принимает событие без доступной разведки', () => {
  const guild: Clan = {
    id: 'clan_guild',
    name: 'Гильдия Авантюристов',
    trustLevel: 5,
    gold: 0,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0 }
  };
  const result = performGuildActions({
    clans: [guild],
    adventurers: [1, 2].map(index => adventurer({ id: `adv-${index}` })),
    missions: [mission({ type: 'DUMMY', checks: [], reqResource: 'None', intelRevealed: false })],
    contracts: [],
    hCost: 10
  });
  assert.equal(result.createdContracts, 0);
  assert.equal(result.missions[0].intelRevealed, false);
});

test('Гильдия проверяет особые предметы каждого отдельного этапа', () => {
  const guild: Clan = {
    id: 'clan_guild',
    name: 'Гильдия Авантюристов',
    trustLevel: 5,
    gold: 100,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 2, Alchemy: 0, specialItems: ['Печать первого этапа'] }
  };
  const stagedMission = mission({
    checks: [
      { reqResource: 'None', dc: 12, requiredSpecialItem: 'Печать первого этапа' },
      { reqResource: 'None', dc: 12, requiredSpecialItem: 'Ключ второго этапа' }
    ]
  });
  const blocked = performGuildActions({
    clans: [guild],
    adventurers: [adventurer(), adventurer({ id: 'adv-2' })],
    missions: [stagedMission],
    contracts: [],
    hCost: 10
  });
  assert.equal(blocked.createdContracts, 0);

  const allowed = performGuildActions({
    clans: [{ ...guild, resources: { ...guild.resources, specialItems: ['Печать первого этапа', 'Ключ второго этапа'] } }],
    adventurers: [adventurer(), adventurer({ id: 'adv-2' })],
    missions: [stagedMission],
    contracts: [],
    hCost: 10
  });
  assert.equal(allowed.createdContracts, 1);
});
