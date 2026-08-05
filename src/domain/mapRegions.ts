import type { MapRegion, RegionFogDensity, RegionFogSpeed } from '../types';

const REGION_COLORS = ['#10b981', '#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#84cc16'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function normalizePoint(point: { x?: number; y?: number } | undefined, fallback = 50) {
  return {
    x: clamp(Number(point?.x ?? fallback), 0, 100),
    y: clamp(Number(point?.y ?? fallback), 0, 100)
  };
}

export function getRegionCenter(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 50, y: 50 };
  return {
    x: Math.round((points.reduce((sum, point) => sum + point.x, 0) / points.length) * 10) / 10,
    y: Math.round((points.reduce((sum, point) => sum + point.y, 0) / points.length) * 10) / 10
  };
}

export function createMapRegion(
  index: number,
  anchor: { x: number; y: number } = { x: 50, y: 50 }
): MapRegion {
  const center = normalizePoint(anchor);
  const points = [
    normalizePoint({ x: center.x - 7, y: center.y - 6 }),
    normalizePoint({ x: center.x + 7, y: center.y - 6 }),
    normalizePoint({ x: center.x + 8, y: center.y + 6 }),
    normalizePoint({ x: center.x - 8, y: center.y + 6 })
  ];
  return {
    id: `region_${Date.now().toString(36)}_${index + 1}`,
    name: `Новый регион ${index + 1}`,
    points,
    labelPosition: getRegionCenter(points),
    color: REGION_COLORS[index % REGION_COLORS.length],
    fillOpacity: 0.18,
    borderOpacity: 0.9,
    visibleToPlayers: false,
    showBoundary: true,
    showLabel: true,
    showFill: true,
    fog: {
      enabled: false,
      density: 'MEDIUM',
      speed: 'SLOW',
      opacity: getFogOpacity('MEDIUM')
    }
  };
}

export function normalizeMapRegion(region: Partial<MapRegion>, index: number): MapRegion {
  const fallback = createMapRegion(index);
  const points = Array.isArray(region.points) && region.points.length >= 3
    ? region.points.map(point => normalizePoint(point))
    : fallback.points;
  const density: RegionFogDensity = ['LOW', 'MEDIUM', 'DENSE'].includes(region.fog?.density ?? '')
    ? region.fog!.density
    : 'MEDIUM';
  const speed: RegionFogSpeed = ['SLOW', 'NORMAL', 'FAST'].includes(region.fog?.speed ?? '')
    ? region.fog!.speed
    : 'SLOW';

  return {
    id: typeof region.id === 'string' && region.id.trim() ? region.id : fallback.id,
    name: typeof region.name === 'string' && region.name.trim() ? region.name : fallback.name,
    points,
    labelPosition: region.labelPosition ? normalizePoint(region.labelPosition) : getRegionCenter(points),
    color: typeof region.color === 'string' && /^#[0-9a-f]{6}$/iu.test(region.color) ? region.color : fallback.color,
    fillOpacity: clamp(Number(region.fillOpacity ?? fallback.fillOpacity), 0, 0.8),
    borderOpacity: clamp(Number(region.borderOpacity ?? fallback.borderOpacity), 0, 1),
    visibleToPlayers: Boolean(region.visibleToPlayers),
    showBoundary: region.showBoundary ?? true,
    showLabel: region.showLabel ?? true,
    showFill: region.showFill ?? true,
    fog: {
      enabled: Boolean(region.fog?.enabled),
      density,
      speed,
      opacity: clamp(Number(region.fog?.opacity ?? getFogOpacity(density)), 0, 1)
    }
  };
}

export function pointInMapRegion(point: { x: number; y: number }, region: Pick<MapRegion, 'points'>): boolean {
  let inside = false;
  const polygon = region.points;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses = (current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / ((prior.y - current.y) || Number.EPSILON) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function findMapRegionAtPoint(regions: readonly MapRegion[], point: { x: number; y: number }): MapRegion | undefined {
  return [...regions].reverse().find(region => pointInMapRegion(point, region));
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, c, b))
    || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d))
    || (o4 === 0 && onSegment(c, b, d));
}

export function hasSelfIntersection(points: readonly { x: number; y: number }[]): boolean {
  if (points.length < 4) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second
        || firstNext === second
        || secondNext === first;
      if (adjacent) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

export function getFogOpacity(density: RegionFogDensity): number {
  if (density === 'LOW') return 0.28;
  if (density === 'DENSE') return 0.65;
  return 0.46;
}

export function getFogDuration(speed: RegionFogSpeed): number {
  if (speed === 'FAST') return 12;
  if (speed === 'NORMAL') return 20;
  return 32;
}

export function getRegionClipPath(points: readonly { x: number; y: number }[]): string {
  return `polygon(${points.map(point => `${point.x}% ${point.y}%`).join(', ')})`;
}
