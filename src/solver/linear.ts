// Dense complex linear solver: LU factorization with partial pivoting.
// Circuits here are small (tens of unknowns), so a hand-written O(n³)
// solver is enough and avoids a dependency. Uses only + − × ÷ and sqrt.
// Array indices below are always in range by construction (square n×n
// matrix, length-n vectors), hence the non-null assertions (!).

import { type Complex, ZERO, abs, div, mul, sub } from '../core/complex';

export type LinearResult =
  | { readonly ok: true; readonly x: readonly Complex[]; readonly conditionNumber: number }
  | { readonly ok: false; readonly reason: 'singular' };

/** A pivot smaller than this fraction of the largest entry counts as zero. */
const PIVOT_RELATIVE_TOLERANCE = 1e-13;

interface Lu {
  readonly lu: Complex[][];
  readonly perm: number[];
}

function factor(A: readonly (readonly Complex[])[]): Lu | null {
  const n = A.length;
  const lu = A.map((row) => {
    if (row.length !== n) throw new RangeError('Matrix must be square');
    return row.slice();
  });
  const perm = Array.from({ length: n }, (_, i) => i);
  let maxEntry = 0;
  for (const row of lu) for (const v of row) maxEntry = Math.max(maxEntry, abs(v));
  const tiny = maxEntry * PIVOT_RELATIVE_TOLERANCE;

  for (let k = 0; k < n; k++) {
    // Partial pivoting: largest magnitude in column k at or below row k.
    let p = k;
    let best = abs(lu[k]![k]!);
    for (let i = k + 1; i < n; i++) {
      const m = abs(lu[i]![k]!);
      if (m > best) {
        best = m;
        p = i;
      }
    }
    if (!(best > tiny)) return null;
    if (p !== k) {
      [lu[k], lu[p]] = [lu[p]!, lu[k]!];
      [perm[k], perm[p]] = [perm[p]!, perm[k]!];
    }
    const rowK = lu[k]!;
    const pivot = rowK[k]!;
    for (let i = k + 1; i < n; i++) {
      const rowI = lu[i]!;
      const f = div(rowI[k]!, pivot);
      rowI[k] = f;
      if (f.re === 0 && f.im === 0) continue;
      for (let j = k + 1; j < n; j++) rowI[j] = sub(rowI[j]!, mul(f, rowK[j]!));
    }
  }
  return { lu, perm };
}

function substitute({ lu, perm }: Lu, z: readonly Complex[]): Complex[] {
  const n = lu.length;
  const y = perm.map((p) => z[p]!);
  for (let i = 0; i < n; i++) {
    const row = lu[i]!;
    for (let j = 0; j < i; j++) y[i] = sub(y[i]!, mul(row[j]!, y[j]!));
  }
  for (let i = n - 1; i >= 0; i--) {
    const row = lu[i]!;
    for (let j = i + 1; j < n; j++) y[i] = sub(y[i]!, mul(row[j]!, y[j]!));
    y[i] = div(y[i]!, row[i]!);
  }
  return y;
}

function norm1(columns: readonly (readonly Complex[])[]): number {
  let best = 0;
  for (const col of columns) {
    let s = 0;
    for (const v of col) s += abs(v);
    best = Math.max(best, s);
  }
  return best;
}

/**
 * Solves A·x = z. Also returns the exact 1-norm condition number
 * ‖A‖₁·‖A⁻¹‖₁ (affordable at this size: one extra solve per column).
 */
export function solveLinear(A: readonly (readonly Complex[])[], z: readonly Complex[]): LinearResult {
  const n = A.length;
  if (z.length !== n) throw new RangeError('Right-hand side length must match the matrix');
  if (n === 0) return { ok: true, x: [], conditionNumber: 1 };
  const f = factor(A);
  if (!f) return { ok: false, reason: 'singular' };
  const x = substitute(f, z);

  const columnsOfA = Array.from({ length: n }, (_, j) => A.map((row) => row[j]!));
  const columnsOfInverse = Array.from({ length: n }, (_, j) =>
    substitute(f, Array.from({ length: n }, (_, i) => (i === j ? { re: 1, im: 0 } : ZERO))),
  );
  return { ok: true, x, conditionNumber: norm1(columnsOfA) * norm1(columnsOfInverse) };
}
