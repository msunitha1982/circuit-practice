// Records a single component's stamp into a dense matrix for comparison
// with hand-written expected values.

import { type Complex, ZERO, add } from '../../src/core/complex';
import type { ComponentParams } from '../../src/core/model';
import type { ComponentType, StampContext } from '../../src/core/registry';
import type { LinearExpr, Stamper } from '../../src/core/stamp';

export interface Recorded {
  readonly A: Complex[][];
  readonly z: Complex[];
}

export function recordStamp(
  type: ComponentType,
  size: number,
  ctx: {
    readonly terminals: readonly (number | null)[];
    readonly extras?: readonly number[];
    readonly params?: ComponentParams;
    readonly omega?: number;
    readonly currentOf?: (id: string) => LinearExpr;
  },
): Recorded {
  const A = Array.from({ length: size }, () => Array.from({ length: size }, () => ZERO));
  const z = Array.from({ length: size }, () => ZERO);
  const out: Stamper = {
    addA(row, col, value) {
      if (row === null || col === null) return;
      const r = A[row];
      if (!r || r[col] === undefined) throw new RangeError(`A[${row}][${col}] out of range`);
      r[col] = add(r[col] as Complex, value);
    },
    addZ(row, value) {
      if (row === null) return;
      if (z[row] === undefined) throw new RangeError(`z[${row}] out of range`);
      z[row] = add(z[row] as Complex, value);
    },
  };
  const full: StampContext = {
    omega: ctx.omega ?? 0,
    params: ctx.params ?? {},
    terminals: ctx.terminals,
    extras: ctx.extras ?? [],
    previous: null,
    currentOf: ctx.currentOf ?? (() => {
      throw new Error('currentOf not provided');
    }),
  };
  type.stamp(full, out);
  return { A, z };
}

/** Real parts, after asserting every imaginary part is zero. */
export function realPart(m: Recorded): { A: number[][]; z: number[] } {
  const check = (c: Complex) => {
    if (c.im !== 0) throw new Error(`Unexpected imaginary part ${c.im}`);
    return c.re === 0 ? 0 : c.re; // normalise -0
  };
  return { A: m.A.map((row) => row.map(check)), z: m.z.map(check) };
}
