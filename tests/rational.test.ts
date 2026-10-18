import { describe, expect, it } from 'vitest';
import { parallel, q, series, solveExact } from './support/rational';

describe('exact rationals (test helper)', () => {
  it('normalizes and does exact arithmetic', () => {
    expect(q(6, -4).toString()).toBe('-3/2');
    expect(q(1, 3).add(q(1, 6)).toString()).toBe('1/2');
    expect(q(1, 3).mul(q(3)).toString()).toBe('1');
    expect(q(2, 3).div(q(4, 9)).toString()).toBe('3/2');
    expect(q(0, 5).equals(q(0))).toBe(true);
  });
  it('series and parallel: 1 ∥ 2 = 2/3, 3 + 6 = 9, 3 ∥ 6 = 2', () => {
    expect(parallel(q(1), q(2)).toString()).toBe('2/3');
    expect(series(q(3), q(6)).toString()).toBe('9');
    expect(parallel(q(3), q(6)).toString()).toBe('2');
  });
  it('solves a 2×2 system exactly: 6a − 4b = 10, −4a + 7b = −5 gives a = 25/13, b = 5/13', () => {
    const [a, b] = solveExact([[q(6), q(-4)], [q(-4), q(7)]], [q(10), q(-5)]);
    expect([a!.toString(), b!.toString()]).toEqual(['25/13', '5/13']);
  });
  it('refuses non-integers and singular systems', () => {
    expect(() => q(0.5)).toThrow(RangeError);
    expect(() => solveExact([[q(1), q(2)], [q(2), q(4)]], [q(1), q(2)])).toThrow(/Singular/);
  });
});
