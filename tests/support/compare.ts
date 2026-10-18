// How fixture answers are compared with the solver (item D).
//
//   |got − want| ≤ RELATIVE·|want| + FLOOR·scale
//
// `scale` is the largest magnitude of the same kind of quantity in that
// circuit's solution (largest voltage for voltages, largest current for
// currents, largest power for powers). The floor therefore shrinks with the
// circuit: in a microamp circuit it is about 1e-18 A, never a bare 1e-9.
// It exists only so an exactly-zero expected value can pass.

import { type Complex, abs, sub } from '../../src/core/complex';
import type { Solution } from '../../src/core/model';

export const RELATIVE = 1e-9;
export const FLOOR = 1e-12;

export type QuantityKind = 'node-voltage' | 'voltage' | 'current' | 'power';

/** Largest magnitude of this kind of quantity anywhere in the solution. */
export function scaleFor(solution: Solution, kind: QuantityKind): number {
  let m = 0;
  if (kind === 'node-voltage' || kind === 'voltage') {
    for (const v of solution.nodeVoltages.values()) m = Math.max(m, abs(v));
    for (const r of solution.components.values()) if (r.voltage) m = Math.max(m, abs(r.voltage));
  } else if (kind === 'current') {
    for (const r of solution.components.values()) for (const i of r.terminalCurrents) m = Math.max(m, abs(i));
  } else {
    for (const r of solution.components.values()) m = Math.max(m, abs(r.power));
  }
  return m;
}

export function allowedError(want: Complex, scale: number): number {
  return RELATIVE * abs(want) + FLOOR * scale;
}

export function withinTolerance(got: Complex, want: Complex, scale: number): boolean {
  return abs(sub(got, want)) <= allowedError(want, scale);
}
