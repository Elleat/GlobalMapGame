import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMapRegion,
  getFogDuration,
  getFogOpacity,
  getRegionClipPath,
  hasSelfIntersection,
  normalizeMapRegion
} from './mapRegions';
import { createInitialGameState, parseStoredGameState, serializeGameState } from './state';

test('новый регион скрыт от игроков, но его визуальные слои подготовлены', () => {
  const region = createMapRegion(0);
  assert.equal(region.visibleToPlayers, false);
  assert.equal(region.showBoundary, true);
  assert.equal(region.showLabel, true);
  assert.equal(region.showFill, true);
  assert.equal(region.fog.enabled, false);
  assert.equal(region.fog.opacity, getFogOpacity('MEDIUM'));
  assert.equal(region.points.length, 4);
});

test('нормализация ограничивает координаты и прозрачность', () => {
  const source = createMapRegion(0);
  const region = normalizeMapRegion({
    ...source,
    points: [{ x: -10, y: 20 }, { x: 120, y: 30 }, { x: 50, y: 140 }],
    fillOpacity: 4,
    borderOpacity: -1,
    fog: { ...source.fog, opacity: 4 }
  }, 0);
  assert.deepEqual(region.points, [{ x: 0, y: 20 }, { x: 100, y: 30 }, { x: 50, y: 100 }]);
  assert.equal(region.fillOpacity, 0.8);
  assert.equal(region.borderOpacity, 0);
  assert.equal(region.fog.opacity, 1);
});

test('самопересекающаяся граница определяется до сохранения', () => {
  assert.equal(hasSelfIntersection([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }]), true);
  assert.equal(hasSelfIntersection([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]), false);
});

test('параметры тумана и маска имеют стабильные значения', () => {
  assert.equal(getFogOpacity('LOW') < getFogOpacity('DENSE'), true);
  assert.equal(getFogDuration('SLOW') > getFogDuration('FAST'), true);
  assert.equal(getRegionClipPath([{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]), 'polygon(10% 20%, 30% 40%, 50% 60%)');
});

test('регионы сохраняются вместе с текущей кампанией', () => {
  const state = createInitialGameState({ isDmMode: true });
  state.mapRegions = [{ ...createMapRegion(0), name: 'Туманные топи', visibleToPlayers: true }];
  const restored = parseStoredGameState(serializeGameState(state));
  assert.equal(restored?.mapRegions[0].name, 'Туманные топи');
  assert.equal(restored?.mapRegions[0].visibleToPlayers, true);
});
