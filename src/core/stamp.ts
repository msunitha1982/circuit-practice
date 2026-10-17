// Building blocks that component stamps write with. A stamp adds entries to
// the MNA system A·x = z. Row r of a node is its KCL equation: the sum of
// currents leaving that node into components equals zero.

import { type Complex, ZERO, add, mul, neg } from './complex';

/** Writes into A·x = z. A null index means ground and is ignored, so stamps need no special cases. */
export interface Stamper {
  addA(row: number | null, col: number | null, value: Complex): void;
  addZ(row: number | null, value: Complex): void;
}

export interface LinearTerm {
  /** Index of a solver unknown (a node voltage or an extra unknown). */
  readonly index: number;
  readonly coeff: Complex;
}

/** constant + Σ coeff·x[index]: a quantity written in terms of the solver unknowns. */
export interface LinearExpr {
  readonly terms: readonly LinearTerm[];
  readonly constant: Complex;
}

export function linearExpr(terms: readonly LinearTerm[], constant: Complex = ZERO): LinearExpr {
  return { terms, constant };
}

/** Terms for k·(V(a) − V(b)); ground terminals (null) contribute nothing. */
export function voltageTerms(a: number | null, b: number | null, k: Complex): LinearTerm[] {
  const terms: LinearTerm[] = [];
  if (a !== null) terms.push({ index: a, coeff: k });
  if (b !== null) terms.push({ index: b, coeff: neg(k) });
  return terms;
}

export function scaleExpr(e: LinearExpr, k: Complex): LinearExpr {
  return linearExpr(
    e.terms.map((t) => ({ index: t.index, coeff: mul(t.coeff, k) })),
    mul(e.constant, k),
  );
}

/**
 * Stamps a branch current I (given as a linear expression) flowing from
 * point a to point b through a component: +I leaves node a, −I leaves node b.
 */
export function stampBranchCurrent(out: Stamper, a: number | null, b: number | null, current: LinearExpr): void {
  for (const t of current.terms) {
    out.addA(a, t.index, t.coeff);
    out.addA(b, t.index, neg(t.coeff));
  }
  out.addZ(a, neg(current.constant));
  out.addZ(b, current.constant);
}

/** Stamps an admittance y between a and b: current y·(V(a) − V(b)) from a to b. */
export function stampAdmittance(out: Stamper, a: number | null, b: number | null, y: Complex): void {
  stampBranchCurrent(out, a, b, linearExpr(voltageTerms(a, b, y)));
}

/** Evaluates an expression for a given unknown vector. */
export function evaluate(e: LinearExpr, x: readonly Complex[]): Complex {
  let sum = e.constant;
  for (const t of e.terms) {
    const v = x[t.index];
    if (v === undefined) throw new RangeError(`Unknown index ${t.index} out of range`);
    sum = add(sum, mul(t.coeff, v));
  }
  return sum;
}
