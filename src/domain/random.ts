/** Small deterministic PRNG used to make a simulated day reproducible. */
export function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDaySeed(day: number): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `day-${day}-${Date.now().toString(36)}-${randomPart}`;
}

export function rollDie(sides: number, random: () => number = Math.random): number {
  return Math.floor(random() * sides) + 1;
}

