// Seeded random number generator. The ONLY source of randomness in the project.
// Algorithm: sfc32 (Small Fast Counting, 32-bit), with its 128-bit state filled
// from the seed by a splitmix32-style integer hash. Uses only 32-bit integer
// operations, so the same seed gives the same sequence in every JS engine.

export type Seed = number;

export const MAX_SEED = 0xffffffff;

export interface Rng {
  /** Uniform integer in [0, 2^32). */
  nextUint32(): number;
  /** Uniform float in [0, 1), with 32 bits of resolution. */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. Unbiased. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** One element of a non-empty array, uniformly. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher-Yates). The input is not changed. */
  shuffle<T>(items: readonly T[]): T[];
  /** A new, independent generator seeded from this one's next output. */
  fork(): Rng;
}

const TWO_POW_32 = 4294967296;

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;
}

function splitmix32(state: number): { value: number; state: number } {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z ^= z >>> 15;
  return { value: z >>> 0, state: next };
}

export function createRng(seed: Seed): Rng {
  if (!isValidSeed(seed)) {
    throw new RangeError(`Seed must be an integer from 0 to ${MAX_SEED}`);
  }
  let s = seed | 0;
  const words: number[] = [];
  for (let k = 0; k < 4; k++) {
    const r = splitmix32(s);
    s = r.state;
    words.push(r.value | 0);
  }
  let [a, b, c, d] = words as [number, number, number, number];

  function nextUint32(): number {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }

  // Warm up so nearby seeds do not start with correlated outputs.
  for (let k = 0; k < 12; k++) nextUint32();

  const rng: Rng = {
    nextUint32,
    next: () => nextUint32() / TWO_POW_32,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError('int(min, max) needs integers with min <= max');
      }
      const range = max - min + 1;
      if (range > TWO_POW_32) throw new RangeError('int(min, max) range is too large');
      // Rejection sampling removes modulo bias.
      const limit = TWO_POW_32 - (TWO_POW_32 % range);
      let x = nextUint32();
      while (x >= limit) x = nextUint32();
      return min + (x % range);
    },
    chance(p) {
      if (!(p >= 0 && p <= 1)) throw new RangeError('chance(p) needs 0 <= p <= 1');
      return rng.next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick() needs a non-empty array');
      return items[rng.int(0, items.length - 1)] as (typeof items)[number];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const k = rng.int(0, i);
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[k] as (typeof out)[number];
        out[k] = tmp;
      }
      return out;
    },
    fork: () => createRng(nextUint32()),
  };
  return rng;
}
