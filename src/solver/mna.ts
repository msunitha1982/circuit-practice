// Modified nodal analysis over complex numbers. Produces the ground truth for
// every point voltage and part current, then runs the independent self-checks.
// A failed check is reported, never thrown, so the generator can re-roll.

import { type CircuitIssue, validateCircuit } from '../core/circuit';
import { type Complex, ZERO, add, conj, isFiniteComplex, mul, sub } from '../core/complex';
import { defaultRegistry } from '../core/components';
import type { Circuit, Component, ComponentId, ComponentResult, NodeId, Solution } from '../core/model';
import type {
  BranchContext, ComponentRegistry, ComponentType, ResultContext, StampContext,
} from '../core/registry';
import type { LinearExpr, Stamper } from '../core/stamp';
import { DEFAULT_TOLERANCES, type Tolerances, checkConstraints, checkKcl, checkPowerBalance } from './checks';
import { solveLinear } from './linear';

export type SolveFailure =
  | { readonly code: 'invalid-circuit'; readonly issues: readonly CircuitIssue[] }
  | { readonly code: 'nonlinear-not-supported'; readonly component: ComponentId }
  | { readonly code: 'singular' }
  | { readonly code: 'ill-conditioned'; readonly conditionNumber: number }
  | { readonly code: 'non-finite' }
  | { readonly code: 'kcl-failed'; readonly node: NodeId; readonly residual: number }
  | { readonly code: 'power-balance-failed'; readonly residual: number }
  | { readonly code: 'constraint-failed'; readonly component: ComponentId; readonly residual: number };

export type SolveResult =
  | { readonly ok: true; readonly solution: Solution }
  | { readonly ok: false; readonly failure: SolveFailure };

export interface SolveOptions {
  readonly tolerances?: Partial<Tolerances>;
}

interface Placed {
  readonly component: Component;
  readonly type: ComponentType;
  readonly branch: BranchContext;
}

export function solve(circuit: Circuit, registry: ComponentRegistry = defaultRegistry, options: SolveOptions = {}): SolveResult {
  const tol: Tolerances = { ...DEFAULT_TOLERANCES, ...options.tolerances };
  const issues = validateCircuit(circuit, registry);
  if (issues.length > 0) return fail({ code: 'invalid-circuit', issues });

  // 1. Unknowns: one voltage per non-ground point (circuit order), then each part's extras (circuit order).
  const nodeIndex = new Map<NodeId, number | null>();
  let n = 0;
  for (const node of circuit.nodes) nodeIndex.set(node.id, node.isGround ? null : n++);
  const placed = new Map<ComponentId, Placed>();
  for (const component of circuit.components) {
    const type = registry.require(component.type);
    if (type.linearize) return fail({ code: 'nonlinear-not-supported', component: component.id });
    const extras = Array.from({ length: type.extraUnknowns }, () => n++);
    const terminals = component.terminals.map((t) => nodeIndex.get(t) ?? null);
    placed.set(component.id, {
      component, type,
      branch: { omega: circuit.omega, params: component.params, terminals, extras },
    });
  }

  // 2. Stamp every part into A·x = z.
  const A = Array.from({ length: n }, () => Array.from({ length: n }, (): Complex => ZERO));
  const z = Array.from({ length: n }, (): Complex => ZERO);
  const out: Stamper = {
    addA(row, col, value) {
      if (row === null || col === null) return;
      const r = A[row];
      if (!r || r[col] === undefined) throw new RangeError(`Stamp outside the matrix at (${row}, ${col})`);
      r[col] = add(r[col] as Complex, value);
    },
    addZ(row, value) {
      if (row === null) return;
      if (z[row] === undefined) throw new RangeError(`Stamp outside the vector at ${row}`);
      z[row] = add(z[row] as Complex, value);
    },
  };
  const currentExpr = (id: ComponentId): LinearExpr => {
    const p = placed.get(id);
    if (!p?.type.branchCurrent) throw new Error(`Part "${id}" has no branch current`);
    return p.type.branchCurrent(p.branch);
  };
  for (const p of placed.values()) {
    const ctx: StampContext = { ...p.branch, currentOf: currentExpr, previous: null };
    p.type.stamp(ctx, out);
  }

  // 3. Solve.
  const linear = solveLinear(A, z);
  if (!linear.ok) return fail({ code: 'singular' });
  if (!(linear.conditionNumber <= tol.maxConditionNumber)) {
    return fail({ code: 'ill-conditioned', conditionNumber: linear.conditionNumber });
  }
  const x = linear.x;
  if (!x.every(isFiniteComplex)) return fail({ code: 'non-finite' });

  // 4. Point voltages, then each part's V, I, P from its own relation.
  const valueAt = (i: number | null): Complex => (i === null ? ZERO : (x[i] as Complex));
  const nodeVoltages = new Map<NodeId, Complex>(circuit.nodes.map((node) => [node.id, valueAt(nodeIndex.get(node.id) ?? null)]));

  const currentsMemo = new Map<ComponentId, readonly Complex[]>();
  const resultContext = (p: Placed): ResultContext => ({
    omega: circuit.omega,
    params: p.component.params,
    terminalVoltages: p.component.terminals.map((t) => nodeVoltages.get(t) ?? ZERO),
    extras: p.branch.extras.map(valueAt),
    currentOf: (id) => {
      const target = placed.get(id);
      if (!target || target.component.terminals.length !== 2) throw new Error(`Part "${id}" has no branch current`);
      return terminalCurrentsOf(target)[0] as Complex;
    },
  });
  const terminalCurrentsOf = (p: Placed): readonly Complex[] => {
    const memo = currentsMemo.get(p.component.id);
    if (memo) return memo;
    const currents = p.type.terminalCurrents(resultContext(p));
    currentsMemo.set(p.component.id, currents);
    return currents;
  };

  const results = new Map<ComponentId, ComponentResult>();
  const residuals = new Map<ComponentId, readonly Complex[]>();
  for (const p of placed.values()) {
    const ctx = resultContext(p);
    const terminalCurrents = terminalCurrentsOf(p);
    let power = ZERO;
    ctx.terminalVoltages.forEach((v, k) => {
      power = add(power, mul(v, conj(terminalCurrents[k] ?? ZERO)));
    });
    const two = ctx.terminalVoltages.length === 2;
    results.set(p.component.id, Object.freeze({
      terminalVoltages: Object.freeze([...ctx.terminalVoltages]),
      terminalCurrents: Object.freeze([...terminalCurrents]),
      voltage: two ? sub(ctx.terminalVoltages[0] as Complex, ctx.terminalVoltages[1] as Complex) : null,
      current: two ? (terminalCurrents[0] as Complex) : null,
      power,
    }));
    residuals.set(p.component.id, p.type.constraintResiduals?.(ctx) ?? []);
  }
  for (const r of results.values()) {
    if (!r.terminalCurrents.every(isFiniteComplex) || !isFiniteComplex(r.power)) return fail({ code: 'non-finite' });
  }

  // 5. Independent self-checks.
  const kcl = checkKcl(circuit, results);
  if (!(kcl.worst <= tol.kcl)) {
    return fail({ code: 'kcl-failed', node: kcl.worstNode ?? '', residual: kcl.worst });
  }
  const constraints = checkConstraints(residuals, nodeVoltages);
  if (!(constraints.worst <= tol.constraint)) {
    return fail({ code: 'constraint-failed', component: constraints.worstComponent ?? '', residual: constraints.worst });
  }
  const powerResidual = checkPowerBalance(results);
  if (!(powerResidual <= tol.powerBalance)) return fail({ code: 'power-balance-failed', residual: powerResidual });

  return {
    ok: true,
    solution: Object.freeze({
      omega: circuit.omega,
      nodeVoltages,
      components: results,
      checks: Object.freeze({
        kclWorstResidual: kcl.worst,
        powerBalanceResidual: powerResidual,
        constraintWorstResidual: constraints.worst,
        conditionNumber: linear.conditionNumber,
      }),
    }),
  };
}

function fail(failure: SolveFailure): SolveResult {
  return { ok: false, failure };
}
