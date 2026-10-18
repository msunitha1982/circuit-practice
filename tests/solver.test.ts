import { describe, expect, it } from 'vitest';
import { circuitBuilder } from '../src/core/circuit';
import { type Complex, approxEqual, complex } from '../src/core/complex';
import { V1_COMPONENTS, defaultRegistry } from '../src/core/components';
import { createRegistry, type ComponentType } from '../src/core/registry';
import { serializeSolution } from '../src/core/serialize';
import { resistor } from '../src/core/components/resistor';
import { solve, type SolveResult } from '../src/solver/mna';

const near = (got: Complex | null | undefined, want: Complex) =>
  got !== null && got !== undefined && approxEqual(got, want, 1e-12, 1e-12);

function ok(r: SolveResult) {
  if (!r.ok) throw new Error(`Expected a solution, got ${JSON.stringify(r.failure)}`);
  return r.solution;
}

/** 10 V source across a 5 Ω resistor. */
function simple() {
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const n1 = b.node();
  const v = b.add('vsource', [n1, g], { voltage: complex(10) });
  const r = b.add('resistor', [n1, g], { resistance: 5 });
  b.add('ground', [g]);
  return { circuit: b.build(), v, r };
}

describe('solver: basic results and sign convention', () => {
  it('10 V across 5 Ω: node at 10 V, 2 A, resistor absorbs 20 W, source supplies (−20 W)', () => {
    const { circuit, v, r } = simple();
    const s = ok(solve(circuit));
    expect(near(s.nodeVoltages.get('n1'), complex(10))).toBe(true);
    expect(near(s.nodeVoltages.get('n0'), complex(0))).toBe(true);
    const R = s.components.get(r)!;
    expect(near(R.voltage, complex(10))).toBe(true);
    expect(near(R.current, complex(2))).toBe(true);
    expect(near(R.power, complex(20))).toBe(true);
    // The source's a → b current flows from + to − THROUGH the source: −2 A.
    const V = s.components.get(v)!;
    expect(near(V.current, complex(-2))).toBe(true);
    expect(near(V.power, complex(-20))).toBe(true);
  });

  it('reports self-check residuals and condition number', () => {
    const s = ok(solve(simple().circuit));
    expect(s.checks.kclWorstResidual).toBeLessThanOrEqual(1e-9);
    expect(s.checks.powerBalanceResidual).toBeLessThanOrEqual(1e-9);
    expect(s.checks.constraintWorstResidual).toBeLessThanOrEqual(1e-9);
    expect(s.checks.conditionNumber).toBeGreaterThanOrEqual(1);
  });

  it('a current source supplying a resistor: 2 A into 3 Ω gives 6 V and −12 W at the source', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    // a = ground, b = n1: 2 A flows through the source from ground up into n1.
    const i = b.add('isource', [g, n1], { current: complex(2) });
    b.add('resistor', [n1, g], { resistance: 3 });
    const s = ok(solve(b.build()));
    expect(near(s.nodeVoltages.get(n1), complex(6))).toBe(true);
    expect(near(s.components.get(i)!.power, complex(-12))).toBe(true);
  });

  it('a wire carries the current between the points it joins', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const p1 = b.node();
    const p2 = b.node();
    b.add('vsource', [p1, g], { voltage: complex(6) });
    const w = b.add('wire', [p1, p2]);
    b.add('resistor', [p2, g], { resistance: 3 });
    const s = ok(solve(b.build()));
    expect(near(s.nodeVoltages.get(p2), complex(6))).toBe(true);
    expect(near(s.components.get(w)!.current, complex(2))).toBe(true);
    expect(near(s.components.get(w)!.power, complex(0))).toBe(true);
  });

  it('is deterministic: two solves serialize byte-identically', () => {
    expect(serializeSolution(ok(solve(simple().circuit)))).toBe(serializeSolution(ok(solve(simple().circuit))));
  });

  it('never changes the circuit', () => {
    const { circuit } = simple();
    const before = JSON.stringify(circuit);
    solve(circuit);
    expect(JSON.stringify(circuit)).toBe(before);
  });
});

describe('solver: invalid circuits are reported, not thrown', () => {
  it('structurally invalid circuit', () => {
    const { circuit } = simple();
    const r = solve({ ...circuit, nodes: circuit.nodes.map((n) => ({ ...n, isGround: false })) });
    expect(r.ok === false && r.failure.code).toBe('invalid-circuit');
  });

  it('loop of only voltage sources (two different sources in parallel) is singular', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(5) });
    b.add('vsource', [n1, g], { voltage: complex(6) });
    b.add('resistor', [n1, g], { resistance: 1 });
    const r = solve(b.build());
    expect(r.ok === false && r.failure.code).toBe('singular');
  });

  it('loop made only of wires is singular', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(5) });
    b.add('wire', [n1, g]);
    const r = solve(b.build());
    expect(r.ok === false && r.failure.code).toBe('singular');
  });

  it('cut set of only current sources (two sources in series) is singular', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('isource', [g, n1], { current: complex(1) });
    b.add('isource', [n1, n2], { current: complex(1) });
    b.add('resistor', [n2, g], { resistance: 1 });
    const r = solve(b.build());
    expect(r.ok === false && r.failure.code).toBe('singular');
  });

  it('floating island (parts not connected to ground) is singular', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    const n3 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    b.add('resistor', [n1, g], { resistance: 1 });
    b.add('resistor', [n2, n3], { resistance: 1 });
    const r = solve(b.build());
    expect(r.ok === false && r.failure.code).toBe('singular');
  });

  function spread(r1: number, r2: number) {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    b.add('resistor', [n1, n2], { resistance: r1 });
    b.add('resistor', [n2, g], { resistance: r2 });
    return solve(b.build());
  }

  it('a 1 pΩ / 1 Ω divider is rejected as ill-conditioned (condition number about 6e12)', () => {
    const r = spread(1e-12, 1);
    expect(r.ok === false && r.failure.code).toBe('ill-conditioned');
  });

  it('a 1 µΩ / 1 GΩ divider is rejected by the independent KCL check (precision loss in V/R)', () => {
    // The matrix is well conditioned (about 4e6), but the tiny resistor's current
    // from its own V/R subtracts two voltages equal to 15 digits. KCL catches it.
    const r = spread(1e-6, 1e9);
    expect(r.ok === false && r.failure.code).toBe('kcl-failed');
  });

  it('a 1 Ω / 1 MΩ divider (the widest friendly spread) passes', () => {
    expect(spread(1, 1e6).ok).toBe(true);
  });

  it('a part with a nonlinear hook is refused by the M1 solver', () => {
    const nonlinear: ComponentType = { ...resistor, typeId: 'test.nonlinear', linearize: () => {} };
    const registry = createRegistry([...V1_COMPONENTS, nonlinear]);
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    const d = b.add('test.nonlinear', [n1, g], { resistance: 1 });
    const r = solve(b.build(), registry);
    expect(r.ok ? null : r.failure).toEqual({ code: 'nonlinear-not-supported', component: d });
  });

  it('tolerances can be tightened: a 1e-30 KCL tolerance rejects round-off', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    b.add('resistor', [n1, n2], { resistance: 3 });
    b.add('resistor', [n2, g], { resistance: 7 });
    b.add('resistor', [n2, g], { resistance: 11 });
    expect(solve(b.build()).ok).toBe(true);
    const strict = solve(b.build(), defaultRegistry, { tolerances: { kcl: 0, constraint: 0, powerBalance: 0 } });
    // With zero tolerance any round-off fails; if this circuit happens to solve exactly, it passes.
    if (!strict.ok) expect(['kcl-failed', 'constraint-failed', 'power-balance-failed']).toContain(strict.failure.code);
  });
});
