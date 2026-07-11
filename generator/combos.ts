function hashStringToSeed(input: string): number {
  let hash = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type TermCombo = [near: string, far: string];

/**
 * Builds every (near, far) term pair, deterministically shuffled from a
 * seed string (typically the batch name) so re-running the same batch
 * reproduces the same order — required for resuming a partial run.
 */
export function buildCombos(near: string[], far: string[], seed: string): TermCombo[] {
  const all: TermCombo[] = [];
  for (const nearTerm of near) {
    for (const farTerm of far) {
      all.push([nearTerm, farTerm]);
    }
  }
  return shuffle(all, mulberry32(hashStringToSeed(seed)));
}

export function pickCombo(combos: TermCombo[], index: number): TermCombo {
  return combos[index % combos.length];
}
