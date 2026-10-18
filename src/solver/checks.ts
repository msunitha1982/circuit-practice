// Independent self-checks. These use each part's OWN relation (V/R, source
// values, solved source and wire currents via terminalCurrents), never the
// matrix residual, so a wrong stamp shows up as a failed check (decision D16).

import { type Complex, ZERO, abs, add, neg } from '../core/complex';
import type { Circuit, ComponentId, ComponentResult, NodeId } from '../core/model';

export interface Tolerances {
  /** Relative to the largest current magnitude in the circuit. */
  readonly kcl: number;
  /** Relative to the largest component power magnitude. */
  readonly powerBalance: number;
  /** Relative to the largest voltage magnitude. */
  readonly constraint: number;
  readonly maxConditionNumber: number;
}

/** Decision D10. */
export const DEFAULT_TOLERANCES: Tolerances = {
  kcl: 1e-9,
  powerBalance: 1e-9,
  constraint: 1e-9,
  maxConditionNumber: 1e12,
};

const relative = (residual: number, scale: number) => (scale > 0 ? residual / scale : residual);

export interface KclReport {
  readonly worst: number;
  readonly worstNode: NodeId | null;
}

/**
 * KCL at every point, including ground. A part whose terminal currents do not
 * sum to zero (an ideal op amp's output) returns the difference through an
 * implicit terminal on ground.
 */
export function checkKcl(circuit: Circuit, results: ReadonlyMap<ComponentId, ComponentResult>): KclReport {
  const sums = new Map<NodeId, Complex>(circuit.nodes.map((n) => [n.id, ZERO]));
  const groundId = circuit.nodes.find((n) => n.isGround)?.id;
  let scale = 0;
  for (const c of circuit.components) {
    const r = results.get(c.id);
    if (!r) continue;
    let imbalance = ZERO;
    c.terminals.forEach((node, k) => {
      const i = r.terminalCurrents[k] ?? ZERO;
      scale = Math.max(scale, abs(i));
      sums.set(node, add(sums.get(node) ?? ZERO, i));
      imbalance = add(imbalance, i);
    });
    if (groundId !== undefined) sums.set(groundId, add(sums.get(groundId) ?? ZERO, neg(imbalance)));
  }
  let worst = 0;
  let worstNode: NodeId | null = null;
  for (const [node, sum] of sums) {
    const rel = relative(abs(sum), scale);
    if (rel > worst) {
      worst = rel;
      worstNode = node;
    }
  }
  return { worst, worstNode };
}

/** |Σ power absorbed| relative to the largest single power. Should be 0 (Tellegen's theorem). */
export function checkPowerBalance(results: ReadonlyMap<ComponentId, ComponentResult>): number {
  let total = ZERO;
  let scale = 0;
  for (const r of results.values()) {
    total = add(total, r.power);
    scale = Math.max(scale, abs(r.power));
  }
  return relative(abs(total), scale);
}

export interface ConstraintReport {
  readonly worst: number;
  readonly worstComponent: ComponentId | null;
}

/** Worst constraint residual, relative to the largest voltage in the circuit. */
export function checkConstraints(
  residuals: ReadonlyMap<ComponentId, readonly Complex[]>,
  nodeVoltages: ReadonlyMap<NodeId, Complex>,
): ConstraintReport {
  let scale = 0;
  for (const v of nodeVoltages.values()) scale = Math.max(scale, abs(v));
  let worst = 0;
  let worstComponent: ComponentId | null = null;
  for (const [id, list] of residuals) {
    for (const r of list) {
      const rel = relative(abs(r), scale);
      if (rel > worst) {
        worst = rel;
        worstComponent = id;
      }
    }
  }
  return { worst, worstComponent };
}
