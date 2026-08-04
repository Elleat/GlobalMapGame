import assert from 'node:assert/strict';
import test from 'node:test';
import type { Adventurer, Clan, Contract, Mission } from '../types';
import { simulateContract, simulateDayContracts } from './simulation';
import { advanceMissionLifecycle } from './day';
import { recalculateReportEffects } from './reportEffects';

function adventurer(overrides: Partial<Adventurer> = {}): Adventurer {
  return {
    id: 'hero-1',
    name: 'Тестовый герой',
    class: 'Воин',
    level: 2,
    hp: 2,
    maxHp: 2,
    status: 'READY',
    successfulMissions: 0,
    totalMissions: 0,
    relations: { 'clan-1': 5 },
    ...overrides
  };
}

function clan(overrides: Partial<Clan> = {}): Clan {
  return {
    id: 'clan-1',
    name: 'Тестовый клан',
    trustLevel: 3,
    gold: 100,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0, specialItems: [] },
    ...overrides
  };
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Тестовая операция',
    desc: '',
    reqResource: 'Equipment',
    dc: 12,
    type: 'OPERATION',
    lifespan: 3,
    maxLifespan: 3,
    x: 10,
    y: 10,
    region: 'Тест',
    checks: [{ reqResource: 'Equipment', dc: 12 }],
    complications: { enabled: false },
    ...overrides
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    missionId: 'mission-1',
    title: 'Тестовая операция',
    clanId: 'clan-1',
    confirmed: true,
    contractLevel: 5,
    paymentAmount: 100,
    maxPartySize: 5,
    attachedResources: [],
    partyAdvIds: ['hero-1'],
    ...overrides
  };
}

function sequence(values: number[], fallback = 0.99): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

test('каждый проваленный этап наносит каждому участнику ровно 1 урон', () => {
  const hero = adventurer({ level: 4, hp: 3, maxHp: 3 });
  const result = simulateContract({
    contract: contract(),
    mission: mission({ checks: [{ reqResource: 'None', dc: 30 }] }),
    adventurers: [hero],
    clans: [clan()],
    day: 1,
    random: sequence([0])
  });
  assert.equal(result.report.failedChecksCount, 1);
  assert.equal(result.report.damageDealt, 1);
  assert.equal(result.adventurers[0].hp, 2);
  assert.equal(result.report.retreat?.wasTriggered, false);
});

test('последовательные провалы накапливают урон до проверки отступления', () => {
  const hero = adventurer({ level: 5, hp: 4, maxHp: 4 });
  const result = simulateContract({
    contract: contract(),
    mission: mission({ checks: [
      { reqResource: 'None', dc: 30 },
      { reqResource: 'None', dc: 30 },
      { reqResource: 'None', dc: 30 }
    ] }),
    adventurers: [hero],
    clans: [clan()],
    day: 1,
    random: sequence([0, 0, 0.99])
  });
  assert.equal(result.report.failedChecksCount, 2);
  assert.equal(result.report.damageDealt, 2);
  assert.equal(result.report.retreat?.isSuccess, true);
  assert.equal(result.adventurers[0].hp, 2);
  assert.equal(result.adventurers[0].status, 'WOUNDED');
});

test('потраченные на этап припасы больше не дают автоуспех отступления', () => {
  const result = simulateContract({
    contract: contract({ attachedResources: ['Supplies'] }),
    mission: mission({ checks: [
      { reqResource: 'Supplies', dc: 30 },
      { reqResource: 'None', dc: 30 }
    ] }),
    adventurers: [adventurer()],
    clans: [clan()],
    day: 1,
    random: sequence([0, 0])
  });
  assert.equal(result.report.retreat?.usedSupplies, false);
  assert.equal(result.report.retreat?.isSuccess, false);
  assert.equal(result.adventurers[0].status, 'DEAD');
});

test('оставшиеся припасы автоматически закрывают отступление и спасают героя с 0 HP', () => {
  const result = simulateContract({
    contract: contract({ attachedResources: ['Supplies'] }),
    mission: mission({ checks: [{ reqResource: 'None', dc: 30 }] }),
    adventurers: [adventurer({ level: 1, hp: 1, maxHp: 1 })],
    clans: [clan()],
    day: 1,
    random: sequence([0])
  });
  assert.equal(result.report.retreat?.usedSupplies, true);
  assert.equal(result.report.retreat?.isSuccess, true);
  assert.equal(result.adventurers[0].hp, 0);
  assert.equal(result.adventurers[0].status, 'WOUNDED');
});

test('осложнения могут возникнуть до операции и после этапа, включая ключевой ресурс None', () => {
  const result = simulateContract({
    contract: contract({ attachedResources: ['Equipment', 'Supplies'] }),
    mission: mission({ complications: { enabled: true, chancePerSlot: 1, allowMultiple: true } }),
    adventurers: [adventurer({ level: 5, hp: 4, maxHp: 4 })],
    clans: [clan()],
    day: 1,
    random: sequence([0, 0, 0.99, 0, 0.25])
  });
  assert.equal(result.report.resolutions?.length, 3);
  assert.deepEqual(result.report.resolutions?.map(item => item.kind), ['COMPLICATION', 'STAGE', 'COMPLICATION']);
  assert.equal(result.report.resolutions?.[0].reqResource, 'None');
  assert.equal(result.report.isSuccess, true);
  assert.equal(result.adventurers[0].relations['clan-1'], 6);
});

test('полностью неподготовленная многоэтапная операция снижает отношения даже при успехе', () => {
  const result = simulateContract({
    contract: contract(),
    mission: mission({ checks: [
      { reqResource: 'Equipment', dc: 1 },
      { reqResource: 'Alchemy', dc: 1 }
    ] }),
    adventurers: [adventurer()],
    clans: [clan()],
    day: 1,
    random: sequence([0.99, 0.99])
  });
  assert.equal(result.report.isSuccess, true);
  assert.equal(result.adventurers[0].relations['clan-1'], 4);
});

test('неиспользованные ресурсы возвращаются, если хотя бы один участник вернулся', () => {
  const result = simulateContract({
    contract: contract({ attachedResources: ['Equipment', 'Alchemy'] }),
    mission: mission(),
    adventurers: [adventurer()],
    clans: [clan()],
    day: 1
  });
  assert.deepEqual(result.report.effects?.resourceLedger.used, ['Equipment']);
  assert.deepEqual(result.report.effects?.resourceLedger.returned, ['Alchemy']);
  assert.equal(result.clans[0].resources.Alchemy, 1);
});

test('оставшиеся ресурсы теряются, если весь отряд погиб', () => {
  const result = simulateContract({
    contract: contract({ attachedResources: ['Alchemy'] }),
    mission: mission({ checks: [{ reqResource: 'None', dc: 30 }] }),
    adventurers: [adventurer({ level: 1, hp: 1, maxHp: 1 })],
    clans: [clan()],
    day: 1,
    random: sequence([0, 0])
  });
  assert.deepEqual(result.report.effects?.resourceLedger.lost, ['Alchemy']);
  assert.equal(result.clans[0].resources.Alchemy, 0);
});

test('выполнение пустышки не даёт опыт и не увеличивает счётчики миссий', () => {
  const result = simulateContract({
    contract: contract(),
    mission: mission({ type: 'DUMMY', checks: [], reqResource: 'None' }),
    adventurers: [adventurer()],
    clans: [clan()],
    day: 1,
    random: sequence([0.99])
  });
  assert.equal(result.adventurers[0].successfulMissions, 0);
  assert.equal(result.adventurers[0].totalMissions, 0);
  assert.equal(result.report.autoSuccessReason, 'Пустышка не требовала основной проверки.');
});

test('сюжетная миссия ждёт ручного рапорта, а предложенные NPC возвращаются в резерв', () => {
  const story = mission({ type: 'STORY', storyStatus: 'AVAILABLE' });
  const result = simulateDayContracts({
    contracts: [contract()],
    missions: [story],
    adventurers: [adventurer()],
    clans: [clan()],
    day: 3
  });
  assert.equal(result.reports.length, 0);
  assert.deepEqual(result.contracts[0].suggestedSquadAdvIds, ['hero-1']);
  assert.deepEqual(result.contracts[0].partyAdvIds, []);
  assert.equal(result.missions[0].storyStatus, 'AWAITING_REPORT');
  assert.equal(result.missions[0].storyAcceptedDay, 3);
  assert.equal(result.adventurers[0].status, 'READY');
});

test('для сюжетной миссии заранее создаются обычные осложнения для ручной сессии', () => {
  const story = mission({
    type: 'STORY',
    storyStatus: 'AVAILABLE',
    checks: [{ reqResource: 'None', dc: 12 }],
    complications: { enabled: true, chancePerSlot: 1, allowMultiple: true, baseDc: 12 }
  });
  const result = simulateDayContracts({
    contracts: [contract()],
    missions: [story],
    adventurers: [adventurer()],
    clans: [clan()],
    day: 3,
    random: sequence([0, 0, 0, 0.99])
  });
  assert.equal(result.contracts[0].pendingStoryComplications?.length, 2);
  assert.deepEqual(result.contracts[0].pendingStoryComplications?.map(item => item.position), [0, 1]);
  assert.deepEqual(result.contracts[0].pendingStoryComplications?.map(item => item.reqResource), ['None', 'Alchemy']);
  assert.deepEqual(result.contracts[0].pendingStoryComplications?.map(item => item.dc), [13, 13]);
});

test('проваленная операция и её контракт закрываются окончательно', () => {
  const failedReport = simulateContract({
    contract: contract(),
    mission: mission({ lifespan: 3 }),
    adventurers: [adventurer({ level: 4, hp: 3, maxHp: 3 })],
    clans: [clan()],
    day: 1,
    random: sequence([0])
  });
  const lifecycle = advanceMissionLifecycle({
    missions: [mission({ lifespan: 3 })],
    contracts: [failedReport.contract],
    completedMissionIds: [],
    nextDay: 2
  });
  assert.equal(lifecycle.missions.length, 0);
  assert.equal(lifecycle.contracts.length, 0);
  assert.deepEqual(lifecycle.closedMissionIds, ['mission-1']);
});

test('сюжетная миссия без рапорта не стареет и сохраняет заказчика', () => {
  const story = mission({ type: 'STORY', storyStatus: 'AWAITING_REPORT', lifespan: 1, storyClanId: 'clan-1' });
  const lifecycle = advanceMissionLifecycle({
    missions: [story],
    contracts: [contract({ partyAdvIds: [], suggestedSquadAdvIds: ['hero-1'] })],
    completedMissionIds: [],
    nextDay: 4
  });
  assert.equal(lifecycle.missions[0].lifespan, 1);
  assert.equal(lifecycle.missions[0].storyClanId, 'clan-1');
  assert.equal(lifecycle.contracts.length, 1);
});

test('событие с режимом ALL открывается только после выполнения всех зависимостей', () => {
  const dependent = mission({
    id: 'mission-b',
    startDay: 2,
    prerequisiteMissionIds: ['mission-a1', 'mission-a2'],
    prerequisiteMode: 'ALL'
  });
  const blocked = advanceMissionLifecycle({
    missions: [],
    contracts: [],
    allMissions: [dependent],
    completedMissionIds: ['mission-a1'],
    nextDay: 3
  });
  assert.equal(blocked.missions.length, 0);

  const unlocked = advanceMissionLifecycle({
    missions: [],
    contracts: [],
    allMissions: [dependent],
    completedMissionIds: ['mission-a1', 'mission-a2'],
    nextDay: 3
  });
  assert.deepEqual(unlocked.missions.map(item => item.id), ['mission-b']);
});

test('редактор рапорта откатывает старые эффекты и полностью применяет новый результат', () => {
  const operation = mission({ goldReward: 20 });
  const signedContract = contract({ attachedResources: ['Equipment', 'Alchemy'] });
  const guild = clan({
    id: 'clan_guild',
    name: 'Гильдия Авантюристов',
    gold: 500,
    resources: { Supplies: 0, Equipment: 0, Intelligence: 0, Alchemy: 0, specialItems: [] }
  });
  const successful = simulateContract({
    contract: signedContract,
    mission: operation,
    adventurers: [adventurer()],
    clans: [clan(), guild],
    day: 1
  });
  assert.equal(successful.clans.find(item => item.id === 'clan-1')?.gold, 120);
  assert.equal(successful.clans.find(item => item.id === 'clan_guild')?.gold, 500);

  const failed = recalculateReportEffects({
    originalReport: successful.report,
    editedReport: { ...successful.report, isSuccess: false, damageDealt: 1 },
    contract: signedContract,
    mission: operation,
    adventurers: successful.adventurers,
    clans: successful.clans,
    day: 1
  });
  assert.equal(failed.report.goldReward, 20);
  assert.equal(failed.report.rewardGranted, false);
  assert.equal(failed.adventurers[0].successfulMissions, 0);
  assert.equal(failed.adventurers[0].totalMissions, 1);
  assert.equal(failed.adventurers[0].relations['clan-1'], 5);
  assert.equal(failed.adventurers[0].hp, 1);
  assert.equal(failed.clans.find(item => item.id === 'clan-1')?.gold, 100);
  assert.equal(failed.clans.find(item => item.id === 'clan_guild')?.gold, 500);

  const restoredSuccess = recalculateReportEffects({
    originalReport: failed.report,
    editedReport: { ...failed.report, isSuccess: true, rewardGranted: true, goldReward: 20, damageDealt: 0 },
    contract: signedContract,
    mission: operation,
    adventurers: failed.adventurers,
    clans: failed.clans,
    day: 1
  });
  assert.equal(restoredSuccess.adventurers[0].successfulMissions, 1);
  assert.equal(restoredSuccess.adventurers[0].totalMissions, 1);
  assert.equal(restoredSuccess.adventurers[0].relations['clan-1'], 6);
  assert.equal(restoredSuccess.clans.find(item => item.id === 'clan-1')?.gold, 120);
  assert.equal(restoredSuccess.clans.find(item => item.id === 'clan_guild')?.gold, 500);
});

test('редактирование старого рапорта сохраняет более поздний прогресс как дельту', () => {
  const operation = mission({ goldReward: 20 });
  const signedContract = contract();
  const first = simulateContract({
    contract: signedContract,
    mission: operation,
    adventurers: [adventurer()],
    clans: [clan()],
    day: 1,
    random: sequence([0.99])
  });
  const afterLaterMission = first.adventurers.map(hero => ({
    ...hero,
    totalMissions: hero.totalMissions + 1,
    successfulMissions: hero.successfulMissions + 1
  }));
  const edited = recalculateReportEffects({
    originalReport: first.report,
    editedReport: { ...first.report, isSuccess: false, rewardGranted: false, damageDealt: 1 },
    contract: signedContract,
    mission: operation,
    adventurers: afterLaterMission,
    clans: first.clans,
    day: 1
  });
  assert.equal(edited.adventurers[0].totalMissions, 2);
  assert.equal(edited.adventurers[0].successfulMissions, 1);
});
