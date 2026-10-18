import { describe, expect, it } from 'vitest';
import { type Complex, approxEqual, complex } from '../src/core/complex';
import { solveLinear } from '../src/solver/linear';

const real = (rows: number[][]) => rows.map((r) => r.map((v) => complex(v)));
const close = (got: readonly Complex[], want: readonly Complex[]) =>
  got.length === want.length && got.every((g, i) => approxEqual(g, want[i]!, 1e-12, 1e-15));

describe('complex Gaussian elimination', () => {
  it('solves a real 3×3 system: x = (1, 2, 3)', () => {
    // 2x + y − z = 1;  −3x − y + 2z = 1;  −2x + y + 2z = 6
    const r = solveLinear(real([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]), [1, 1, 6].map((v) => complex(v)));
    expect(r.ok && close(r.x, [complex(1), complex(2), complex(3)])).toBe(true);
  });

  it('needs a row swap when the first pivot is zero', () => {
    const r = solveLinear(real([[0, 1], [1, 0]]), [complex(5), complex(7)]);
    expect(r.ok && close(r.x, [complex(7), complex(5)])).toBe(true);
  });

  it('solves a complex system: (1+j)x = 2j gives x = 1+j; with a coupled second row', () => {
    // (1+j)x + y = 2j + 3;  x − j·y = 1 + j − 3j  (x = 1+j, y = 3)
    const A = [[complex(1, 1), complex(1)], [complex(1), complex(0, -1)]];
    const r = solveLinear(A, [complex(3, 2), complex(1, -2)]);
    expect(r.ok && close(r.x, [complex(1, 1), complex(3)])).toBe(true);
  });

  it('computes the exact 1-norm condition number: [[1,2],[3,4]] gives 21', () => {
    // ‖A‖₁ = 6; A⁻¹ = [[−2, 1], [1.5, −0.5]] so ‖A⁻¹‖₁ = 3.5; 6 × 3.5 = 21.
    const r = solveLinear(real([[1, 2], [3, 4]]), [complex(1), complex(1)]);
    expect(r.ok && Math.abs(r.conditionNumber - 21) < 1e-12).toBe(true);
  });

  it('reports a singular matrix (dependent rows)', () => {
    expect(solveLinear(real([[1, 2], [2, 4]]), [complex(1), complex(2)])).toEqual({ ok: false, reason: 'singular' });
    expect(solveLinear(real([[0, 0], [0, 1]]), [complex(0), complex(1)])).toEqual({ ok: false, reason: 'singular' });
  });

  it('reports a huge condition number for a nearly singular matrix', () => {
    const r = solveLinear(real([[1, 0], [0, 1e-12]]), [complex(1), complex(1)]);
    expect(r.ok && r.conditionNumber >= 1e12).toBe(true);
  });

  it('handles the empty system', () => {
    expect(solveLinear([], [])).toEqual({ ok: true, x: [], conditionNumber: 1 });
  });

  it('does not modify its inputs', () => {
    const A = real([[0, 1], [1, 0]]);
    const z = [complex(5), complex(7)];
    const before = JSON.stringify([A, z]);
    solveLinear(A, z);
    expect(JSON.stringify([A, z])).toBe(before);
  });
});
