import { describe, expect, it } from 'vitest';
import { MAX_SEED, createRng, isValidSeed } from '../src/core/rng';

// Independent reference implementation using BigInt arithmetic, written
// separately from the production code, to cross-check the bit operations.
function referenceSequence(seed: number, count: number): number[] {
  const M = 0xffffffffn;
  const u = (x: bigint) => x & M;
  let s = BigInt(seed);
  const words: bigint[] = [];
  for (let k = 0; k < 4; k++) {
    s = u(s + 0x9e3779b9n);
    let z = s;
    z = u((z ^ (z >> 16n)) * 0x21f0aaadn);
    z = u((z ^ (z >> 15n)) * 0x735a2d97n);
    z = z ^ (z >> 15n);
    words.push(z);
  }
  let [a, b, c, d] = words as [bigint, bigint, bigint, bigint];
  const step = () => {
    const t = u(a + b + d);
    d = u(d + 1n);
    a = b ^ (b >> 9n);
    b = u(c + (c << 3n));
    c = u((c << 21n) | (c >> 11n));
    c = u(c + t);
    return Number(t);
  };
  for (let k = 0; k < 12; k++) step();
  return Array.from({ length: count }, step);
}

describe('seeded RNG', () => {
  it('matches an independent BigInt reference implementation', () => {
    for (const seed of [0, 1, 2, 48213, 123456789, MAX_SEED]) {
      const rng = createRng(seed);
      const got = Array.from({ length: 1000 }, () => rng.nextUint32());
      expect(got).toEqual(referenceSequence(seed, 1000));
    }
  });

  it('is pinned: seed 48213 always starts with these values', () => {
    const rng = createRng(48213);
    const got = Array.from({ length: 5 }, () => rng.nextUint32());
    expect(got).toEqual(PINNED_48213);
  });

  it('same seed gives the same sequence; different seeds differ', () => {
    const seq = (s: number) => {
      const r = createRng(s);
      return Array.from({ length: 50 }, () => r.next());
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it('rejects invalid seeds', () => {
    for (const bad of [-1, 1.5, MAX_SEED + 1, Number.NaN]) {
      expect(isValidSeed(bad)).toBe(false);
      expect(() => createRng(bad)).toThrow(RangeError);
    }
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = createRng(1);
    const buckets = new Array<number>(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x >= 0 && x < 1).toBe(true);
      buckets[Math.floor(x * 10)]! += 1;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it('int(min, max) is inclusive, in range, and hits every value', () => {
    const rng = createRng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const x = rng.int(-3, 3);
      expect(Number.isInteger(x) && x >= -3 && x <= 3).toBe(true);
      seen.add(x);
    }
    expect([...seen].sort((p, q) => p - q)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(rng.int(5, 5)).toBe(5);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
  });

  it('chance(p) handles the edges', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
    expect(() => rng.chance(1.1)).toThrow(RangeError);
  });

  it('pick and shuffle use only the given items and leave the input alone', () => {
    const rng = createRng(4);
    const items = ['A', 'B', 'C', 'D', 'E'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    const shuffled = rng.shuffle(items);
    expect([...shuffled].sort()).toEqual([...items]);
    expect(items).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('fork gives an independent, reproducible stream', () => {
    const a = createRng(9).fork();
    const b = createRng(9).fork();
    const c = createRng(9);
    const take = (r: { next(): number }) => Array.from({ length: 10 }, () => r.next());
    const fromA = take(a);
    expect(fromA).toEqual(take(b));
    expect(fromA).not.toEqual(take(c));
  });
});

// Computed once with the BigInt reference above. Never edit to make a test pass.
const PINNED_48213 = [3857211803, 1633697245, 2521886579, 4120613130, 3918477919];
