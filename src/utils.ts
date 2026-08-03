/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Clan, Adventurer, Mission, MissionType, Contract, BasicResourceKey, MissionCheck, MissionResourceKey } from './types';
import defaultClansJson from './data/default-clans.json';
import defaultAdventurersJson from './data/default-adventurers.json';

const DEFAULT_CLAN_DATA = defaultClansJson as Clan[];
const DEFAULT_ADVENTURER_DATA = defaultAdventurersJson as Adventurer[];

export const DEFAULT_CLANS: Clan[] = structuredClone(DEFAULT_CLAN_DATA);
export const GUILD_CLAN: Clan = structuredClone(
  DEFAULT_CLANS.find(clan => clan.id === 'clan_guild')!
);

export const DEFAULT_EVENT_TEMPLATES = [
  // Операции (OPERATION)
  { 
    title: 'Засада на Торговом Тракте', 
    type: 'OPERATION' as MissionType, 
    desc: 'Купеческий караван требует сопровождения сквозь опасный перевал.', 
    region: 'ЛЕС ТЕЙН',
    successText: 'Отряд разбил банду грабителей на перевале! Торговый караван доставлен без потерь.',
    failText: 'Бандиты устроили неожиданную засаду. Отряд понес урон и вынужден был отступить.'
  },
  { 
    title: 'Таинственные Руны в Пещерах', 
    type: 'OPERATION' as MissionType, 
    desc: 'В глубинах каменоломни обнаружены Древние Руны и защитные органумы.', 
    region: 'ГОРНЫЙ ПИК',
    successText: 'Древние руны расшифрованы! Обнаружен тайник с манускриптами и сокровищами.',
    failText: 'Магическая защитная ловушка рун сработала, обрушив свод пещеры.'
  },
  { 
    title: 'Зачистка Логова Бандитов', 
    type: 'OPERATION' as MissionType, 
    desc: 'Шайка грабителей оседает в старых развалинах возле поселения.', 
    region: 'ЛЕС ТЕЙН',
    successText: 'Развалины полностью очищены от разбойников, украденные запасы возвращены.',
    failText: 'Бандиты оказались хорошо укреплены и отбили атаку.'
  },
  { 
    title: 'Слежка за Культистами', 
    type: 'OPERATION' as MissionType, 
    desc: 'Разведка требует выследить тайные собрания поклонников Бездны.', 
    region: 'ГИБЛОЕ БОЛОТО',
    successText: 'Тайное убежище культистов выслежено и разгромлено, их ритуал сорван.',
    failText: 'Культисты заметили слежку и скрылись в ядовитых туманах болот.'
  },
  { 
    title: 'Ядовитый Туман на Болотах', 
    type: 'OPERATION' as MissionType, 
    desc: 'Ядовитые испарения угрожают местным поселениям и рощам.', 
    region: 'ГИБЛОЕ БОЛОТО',
    successText: 'Очаг ядовитого миазма нейтрализован при помощи алхимических нейтрализаторов.',
    failText: 'Токсичные испарения оказались слишком плотными, отряд получил отравление.'
  },
  { 
    title: 'Штурм Опасного Замка', 
    type: 'OPERATION' as MissionType, 
    desc: 'Укрепленный замок занят вражескими наемниками и ловушками.', 
    region: 'ГОРНЫЙ ПИК',
    successText: 'Замок взят штурмом, цитадель очищена.',
    failText: 'Защитные укрепления выдержали штурм, отряд вынужден отступить.'
  },
  { 
    title: 'Защита Архива Академии', 
    type: 'OPERATION' as MissionType, 
    desc: 'Охрана редких гримуаров и древних текстов от книжных воров.', 
    region: 'ПЕСКИ ЗАБВЕНИЯ',
    successText: 'Архив спасен, воры переданы властям.',
    failText: 'Часть древних свиток была похищена.'
  },

  // Ложные миссии (DUMMY)
  { 
    title: 'Ложное Донесение о Кладе', 
    type: 'DUMMY' as MissionType, 
    desc: 'Крестьяне болтают о сундуке с золотом в заброшенных дюнах, но это лишь слухи.', 
    region: 'ПЕСКИ ЗАБВЕНИЯ',
    successText: 'Район тщательно обследован. Угрозы и клада не обнаружено, отряд возвращается без потерь.',
    failText: 'Слухи оказались пустой тратой времени.'
  },
  { 
    title: 'Призрачные Огни на Болотах', 
    type: 'DUMMY' as MissionType, 
    desc: 'Слухи о некроманте оказались банальным болотным газом.', 
    region: 'ГИБЛОЕ БОЛОТО',
    successText: 'Отряд проверил топи и убедился в отсутствии некромантов.',
    failText: 'Ложный вызов.'
  },
  { 
    title: 'Паника в Деревне', 
    type: 'DUMMY' as MissionType, 
    desc: 'Жители приняли заплутавшую корову в кустах за дикого оборотня.', 
    region: 'ЛЕС ТЕЙН',
    successText: 'Ситуация прояснилась, животное возвращено владельцам.',
    failText: 'Ложная тревога.'
  },
  { 
    title: 'Сигнал с Вышки', 
    type: 'DUMMY' as MissionType, 
    desc: 'Часовой по ошибке зажег сигнальный костер, приняв оленя за отряд врагов.', 
    region: 'ГОРНЫЙ ПИК',
    successText: 'Отряд прибыл на заставу, но врагов не обнаружил. Безопасность подтверждена.',
    failText: 'Ложный сигнал.'
  }
];

export const DEFAULT_SPAWN_POLYGON = [
  { x: 49, y: 11 },
  { x: 86, y: 9 },
  { x: 98, y: 26 },
  { x: 86, y: 39 },
  { x: 90, y: 51 },
  { x: 86, y: 71 },
  { x: 68, y: 74 },
  { x: 29, y: 88 },
  { x: 9, y: 71 },
  { x: 31, y: 55 },
  { x: 16, y: 48 },
  { x: 16, y: 30 },
  { x: 26, y: 26 },
  { x: 41, y: 26 }
];

export function chooseRandomStageResource(
  fallback: BasicResourceKey,
  random: () => number = Math.random
): MissionResourceKey {
  return random() < 0.2 ? 'None' : fallback;
}

export function generateRandomMission(
  id: string,
  startDay: number,
  polygon: { x: number; y: number }[] = DEFAULT_SPAWN_POLYGON
): Mission {
  const pt = getRandomPointInSpawnPolygon(polygon);
  const template = DEFAULT_EVENT_TEMPLATES[Math.floor(Math.random() * DEFAULT_EVENT_TEMPLATES.length)];

  if (template.type === 'DUMMY') {
    return {
      id,
      title: template.title,
      desc: template.desc,
      reqResource: 'None',
      dc: 0,
      type: 'DUMMY',
      lifespan: Math.floor(Math.random() * 3) + 2,
      maxLifespan: 4,
      startDay,
      x: pt.x,
      y: pt.y,
      region: template.region,
      checks: [],
      successText: template.successText,
      failText: template.failText,
      intelRevealed: false
    };
  }

  // OPERATION: 1-4 stages
  // Distribution: 10% -> 1 stage, 50% -> 2 stages, 35% -> 3 stages, 5% -> 4 stages
  const rand = Math.random() * 100;
  let stagesCount = 2;
  if (rand < 10) {
    stagesCount = 1;
  } else if (rand < 60) {
    stagesCount = 2;
  } else if (rand < 95) {
    stagesCount = 3;
  } else {
    stagesCount = 4;
  }

  const possibleResources: BasicResourceKey[] = ['Supplies', 'Equipment', 'Intelligence', 'Alchemy'];
  const shuffledRes = [...possibleResources].sort(() => Math.random() - 0.5);

  const checks: MissionCheck[] = [];
  for (let s = 0; s < stagesCount; s++) {
    // Every ordinary stage independently has a 20% chance to have no key
    // resource. The other 80% are distributed between the four resources.
    const res = chooseRandomStageResource(shuffledRes[s % shuffledRes.length]);
    const dc = 10 + Math.floor(Math.random() * 6); // DC 10..15
    checks.push({ reqResource: res, dc });
  }

  return {
    id,
    title: template.title,
    desc: template.desc,
    reqResource: checks[0].reqResource,
    dc: checks[0].dc,
    type: 'OPERATION',
    lifespan: Math.floor(Math.random() * 3) + 2,
    maxLifespan: 4,
    startDay,
    x: pt.x,
    y: pt.y,
    region: template.region,
    checks,
    successText: template.successText,
    failText: template.failText,
    intelRevealed: false
  };
}

export function generateMissionsForDay(
  count: number,
  startDay: number,
  polygon: { x: number; y: number }[] = DEFAULT_SPAWN_POLYGON
): Mission[] {
  const missions: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const id = `mission_day${startDay}_${Math.random().toString(36).substr(2, 6)}`;
    missions.push(generateRandomMission(id, startDay, polygon));
  }
  return missions;
}

export function getResourceNameRu(key: string): string {
  const map: Record<string, string> = {
    'Supplies': 'Припасы',
    'Equipment': 'Снаряжение',
    'Intelligence': 'Разведданные',
    'Alchemy': 'Алхимия',
    'AncientText': 'Особое'
  };
  return map[key] || key;
}

export function getStatusNameRu(key: string): string {
  const map: Record<string, string> = {
    'READY': 'Готов',
    'WOUNDED': 'Тяжело ранен',
    'ON_MISSION': 'На миссии',
    'DEAD': 'Погиб'
  };
  return map[key] || key;
}

export function getTypeRu(key: string): string {
  if (key === 'STORY') return 'Особое Задание';
  if (key === 'DUMMY') return 'Ложная';
  if (key === 'OPERATION') return 'Операция';
  return key;
}

export function getAdvClassIcon(cls: string): string {
  switch (cls) {
    case 'Варвар': return '🪓';
    case 'Бард': return '🪕';
    case 'Жрец': return '✨';
    case 'Друид': return '🌿';
    case 'Воин': return '⚔️';
    case 'Монах': return '🥋';
    case 'Паладин': return '🛡️';
    case 'Следопыт': return '🏹';
    case 'Плут': return '🗡️';
    case 'Чародей': return '⚡';
    case 'Колдун': return '👁️';
    case 'Волшебник': return '🔮';
    default: return '🗡️';
  }
}

export function calculateMaxHp(level: number): number {
  if (level === 1) return 1;
  if (level === 2) return 2;
  if (level === 3) return 2;
  if (level === 4) return 3;
  if (level >= 5) return 4;
  return 1;
}

export function calculatePartyBonus(partyAdventurers: Adventurer[]): number {
  if (!partyAdventurers || partyAdventurers.length === 0) return 0;
  const sumLevels = partyAdventurers.reduce((sum, a) => sum + a.level, 0);
  return Math.ceil(sumLevels / 4);
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  if (!polygon || polygon.length < 3) return true;
  const x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getRandomPointInSpawnPolygon(polygon: { x: number; y: number }[]): { x: number; y: number } {
  const poly = (polygon && polygon.length >= 3) ? polygon : DEFAULT_SPAWN_POLYGON;
  const minX = Math.min(...poly.map(p => p.x));
  const maxX = Math.max(...poly.map(p => p.x));
  const minY = Math.min(...poly.map(p => p.y));
  const maxY = Math.max(...poly.map(p => p.y));

  for (let attempt = 0; attempt < 250; attempt++) {
    const testX = Math.round(minX + Math.random() * (maxX - minX));
    const testY = Math.round(minY + Math.random() * (maxY - minY));
    if (isPointInPolygon({ x: testX, y: testY }, poly)) {
      return { x: testX, y: testY };
    }
  }
  return { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) };
}

export function generateAdventurersForClans(clansCount: number): Adventurer[] {
  const count = clansCount * 5;
  if (count <= 0 || DEFAULT_ADVENTURER_DATA.length === 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const template = structuredClone(DEFAULT_ADVENTURER_DATA[index % DEFAULT_ADVENTURER_DATA.length]);
    const isAdditionalCopy = index >= DEFAULT_ADVENTURER_DATA.length;
    return {
      ...template,
      id: isAdditionalCopy ? `adv_${index + 1}` : template.id,
      name: isAdditionalCopy ? `${template.name} ${Math.floor(index / DEFAULT_ADVENTURER_DATA.length) + 1}` : template.name,
      relations: { ...template.relations }
    };
  });
}

/**
 * Bug 5 Fix: Safe evaluation of contract target party size to prevent runtime crash.
 */
export function getContractTargetPartySize(c: Contract | null | undefined, missions: Mission[] = []): number {
  if (!c) return 5;
  if (c.clanId === 'clan_guild') {
    const mission = missions ? missions.find(m => m.id === c.missionId) : null;
    if (mission && mission.type === 'DUMMY') {
      return 1;
    }
    const checksToRun = mission?.checks && mission.checks.length > 0 
      ? mission.checks 
      : (mission?.reqResource ? [{ reqResource: mission.reqResource }] : []);
    const reqResourcesList = checksToRun.map(ch => ch.reqResource).filter(r => r && r !== 'None');
    const hasKeyResource = reqResourcesList.length > 0 && reqResourcesList.every(r => c.attachedResources && c.attachedResources.includes(r!));
    if (hasKeyResource) {
      return (c.attachedResources && c.attachedResources.length) || 1;
    }
  }
  return c.maxPartySize || 5;
}

export function getMaxContractLevelForClan(clan: Clan | null | undefined): number {
  if (!clan) return 5;
  const trust = clan.trustLevel || 1;
  if (trust === 1) return 3;
  if (trust === 2) return 4;
  return 5;
}
