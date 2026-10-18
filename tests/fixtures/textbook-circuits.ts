// Textbook fixture circuits (decision D5). Each is a classic configuration,
// named by what it is, not by any textbook example. Every expected answer is
// derived here in EXACT rational arithmetic by a method that is not MNA
// (divider formulas, series-parallel reduction, mesh equations, Thevenin,
// superposition, supernode/supermesh equations written by hand), so the
// solver is checked against an independent derivation.
//
// Conventions (decision D9): node voltages are relative to ground; a part's
// current is from its terminal a to terminal b through the part; power is
// absorbed power (negative when the part supplies power). For a voltage
// source, terminal a is +. For a current source, the current flows a → b
// through the source and leaves it at b.

import { circuitBuilder } from '../../src/core/circuit';
import { complex } from '../../src/core/complex';
import { defaultRegistry } from '../../src/core/components';
import type { Circuit } from '../../src/core/model';
import { type Q, parallel, q, series, solveExact } from '../support/rational';

export interface Expectation {
  readonly what: string;
  readonly kind: 'node-voltage' | 'current' | 'voltage' | 'power';
  /** Point id for node-voltage, part id otherwise. */
  readonly id: string;
  readonly value: Q;
}

export interface Fixture {
  readonly name: string;
  /** How the expected values below were derived. */
  readonly method: string;
  readonly circuit: Circuit;
  readonly expect: readonly Expectation[];
}

const V = (v: Q) => ({ voltage: complex(v.toNumber()) });
const I = (i: Q) => ({ current: complex(i.toNumber()) });
const R = (r: Q) => ({ resistance: r.toNumber() });
const sq = (x: Q) => x.mul(x);

function voltageDivider(): Fixture {
  const vs = q(12), r1 = q(3000), r2 = q(1000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const top = b.node();
  const mid = b.node();
  const src = b.add('vsource', [top, g], V(vs));
  const R1 = b.add('resistor', [top, mid], R(r1));
  const R2 = b.add('resistor', [mid, g], R(r2));
  b.add('ground', [g]);
  // Divider formula: Vout = Vs·R2/(R1 + R2) = 12·1/4 = 3 V. I = Vs/(R1 + R2) = 3 mA.
  const i = vs.div(series(r1, r2));
  return {
    name: 'Voltage divider (12 V, 3 kΩ over 1 kΩ)',
    method: 'Voltage divider formula',
    circuit: b.build(),
    expect: [
      { what: 'V(mid) = 3 V', kind: 'node-voltage', id: mid, value: vs.mul(r2).div(series(r1, r2)) },
      { what: 'I(R1) = 3 mA', kind: 'current', id: R1, value: i },
      { what: 'V(R2) = 3 V', kind: 'voltage', id: R2, value: i.mul(r2) },
      { what: 'P(R1) = 27 mW', kind: 'power', id: R1, value: sq(i).mul(r1) },
      { what: 'P(source) = −36 mW (supplies)', kind: 'power', id: src, value: vs.mul(i).neg() },
      { what: 'I(source) = −3 mA (a → b through it)', kind: 'current', id: src, value: i.neg() },
    ],
  };
}

function loadedDividerWithWires(): Fixture {
  const vs = q(10), r1 = q(2000), r2 = q(3000), rl = q(6000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const p1 = b.node();
  const p2 = b.node();
  const mid = b.node();
  const p4 = b.node();
  b.add('vsource', [p1, g], V(vs));
  const w1 = b.add('wire', [p1, p2]);
  b.add('resistor', [p2, mid], R(r1));
  b.add('resistor', [mid, g], R(r2));
  b.add('wire', [mid, p4]);
  const RL = b.add('resistor', [p4, g], R(rl));
  // Reduction: R2 ∥ RL = 3k ∥ 6k = 2 kΩ; Vmid = 10·2/(2 + 2) = 5 V; total current 10/4k = 2.5 mA.
  const lower = parallel(r2, rl);
  const vmid = vs.mul(lower).div(series(r1, lower));
  return {
    name: 'Loaded voltage divider drawn with wires (10 V, 2 kΩ, 3 kΩ ∥ 6 kΩ load)',
    method: 'Series-parallel reduction, then voltage divider',
    circuit: b.build(),
    expect: [
      { what: 'V(mid) = 5 V', kind: 'node-voltage', id: mid, value: vmid },
      { what: 'V(p4) = 5 V (wire-joined to mid)', kind: 'node-voltage', id: p4, value: vmid },
      { what: 'I(RL) = 5/6 mA', kind: 'current', id: RL, value: vmid.div(rl) },
      { what: 'I(wire from source) = 2.5 mA', kind: 'current', id: w1, value: vs.div(series(r1, lower)) },
    ],
  };
}

function currentDivider(): Fixture {
  const is = q(6, 1000), r1 = q(1000), r2 = q(2000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const a = b.node();
  const src = b.add('isource', [g, a], I(is));
  const R1 = b.add('resistor', [a, g], R(r1));
  const R2 = b.add('resistor', [a, g], R(r2));
  // Current divider: I1 = Is·R2/(R1 + R2) = 4 mA, I2 = Is·R1/(R1 + R2) = 2 mA; V = Is·(R1 ∥ R2) = 4 V.
  const va = is.mul(parallel(r1, r2));
  return {
    name: 'Current divider (6 mA into 1 kΩ ∥ 2 kΩ)',
    method: 'Current divider formula',
    circuit: b.build(),
    expect: [
      { what: 'I(R1) = 4 mA', kind: 'current', id: R1, value: is.mul(r2).div(series(r1, r2)) },
      { what: 'I(R2) = 2 mA', kind: 'current', id: R2, value: is.mul(r1).div(series(r1, r2)) },
      { what: 'V(A) = 4 V', kind: 'node-voltage', id: a, value: va },
      { what: 'P(source) = −24 mW (supplies)', kind: 'power', id: src, value: va.mul(is).neg() },
    ],
  };
}

function r2rLadder(): Fixture {
  const vs = q(16), r = q(1000), r2 = q(2000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const s = b.node();
  const n1 = b.node();
  const n2 = b.node();
  const n3 = b.node();
  b.add('vsource', [s, g], V(vs));
  b.add('resistor', [s, n1], R(r));
  b.add('resistor', [n1, g], R(r2));
  b.add('resistor', [n1, n2], R(r));
  b.add('resistor', [n2, g], R(r2));
  b.add('resistor', [n2, n3], R(r));
  b.add('resistor', [n3, g], R(r2));
  b.add('resistor', [n3, g], R(r2));
  // Reduce from the far end: z3 = 2R ∥ 2R = R; z2 = 2R ∥ (R + z3) = R; z1 = 2R ∥ (R + z2) = R.
  // Then dividers along the chain: each node is half the previous one: 8, 4, 2 V.
  const z3 = parallel(r2, r2);
  const z2 = parallel(r2, series(r, z3));
  const z1 = parallel(r2, series(r, z2));
  const v1 = vs.mul(z1).div(series(r, z1));
  const v2 = v1.mul(z2).div(series(r, z2));
  const v3 = v2.mul(z3).div(series(r, z3));
  return {
    name: 'R-2R ladder, three sections (16 V, R = 1 kΩ)',
    method: 'Series-parallel reduction from the far end, then a divider per section',
    circuit: b.build(),
    expect: [
      { what: 'V(N1) = 8 V', kind: 'node-voltage', id: n1, value: v1 },
      { what: 'V(N2) = 4 V', kind: 'node-voltage', id: n2, value: v2 },
      { what: 'V(N3) = 2 V', kind: 'node-voltage', id: n3, value: v3 },
    ],
  };
}

function twoLoopMesh(): Fixture {
  const v1 = q(10), v2 = q(5), r1 = q(2), r2 = q(4), r3 = q(3);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const n1 = b.node();
  const a = b.node();
  const n2 = b.node();
  b.add('vsource', [n1, g], V(v1));
  const R1 = b.add('resistor', [n1, a], R(r1));
  const R2 = b.add('resistor', [a, g], R(r2));
  const R3 = b.add('resistor', [a, n2], R(r3));
  const src2 = b.add('vsource', [n2, g], V(v2));
  // Mesh currents, both clockwise. Left: up V1, R1 (n1 → A), down R2. Right: up R2, R3 (A → n2), down V2.
  //   Left KVL:  (R1 + R2)·i1 − R2·i2 = V1      →  6·i1 − 4·i2 = 10
  //   Right KVL: −R2·i1 + (R2 + R3)·i2 = −V2    → −4·i1 + 7·i2 = −5
  // Solution: i1 = 25/13 A, i2 = 5/13 A. V(A) = R2·(i1 − i2) = 80/13 V.
  const [i1, i2] = solveExact(
    [[series(r1, r2), r2.neg()], [r2.neg(), series(r2, r3)]],
    [v1, v2.neg()],
  ) as [Q, Q];
  return {
    name: 'Two-loop circuit with two voltage sources (10 V and 5 V; 2 Ω, 4 Ω shared, 3 Ω)',
    method: 'Mesh analysis, solved exactly',
    circuit: b.build(),
    expect: [
      { what: 'I(R1) = 25/13 A', kind: 'current', id: R1, value: i1 },
      { what: 'I(R3) = 5/13 A', kind: 'current', id: R3, value: i2 },
      { what: 'I(R2) = 20/13 A', kind: 'current', id: R2, value: i1.sub(i2) },
      { what: 'V(A) = 80/13 V', kind: 'node-voltage', id: a, value: r2.mul(i1.sub(i2)) },
      // V2 carries i2 from + to − through itself, so it ABSORBS power (it is being charged).
      { what: 'P(V2) = +25/13 W (absorbs)', kind: 'power', id: src2, value: v2.mul(i2) },
    ],
  };
}

function balancedBridge(): Fixture {
  const vs = q(10), r1 = q(1000), r2 = q(2000), r3 = q(3000), r4 = q(6000), rg = q(5000);
  if (!r1.mul(r4).equals(r2.mul(r3))) throw new Error('Fixture is not balanced');
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const t = b.node();
  const a = b.node();
  const c = b.node();
  b.add('vsource', [t, g], V(vs));
  b.add('resistor', [t, a], R(r1));
  b.add('resistor', [a, g], R(r2));
  b.add('resistor', [t, c], R(r3));
  b.add('resistor', [c, g], R(r4));
  const RG = b.add('resistor', [a, c], R(rg));
  // Balanced (R1·R4 = R2·R3), so the bridge resistor carries no current and each side is a plain divider:
  // V(A) = 10·2/3, V(B) = 10·6/9, both 20/3 V.
  return {
    name: 'Balanced Wheatstone bridge (10 V; 1 k/2 k and 3 k/6 k arms; 5 kΩ across)',
    method: 'Balance condition, then voltage divider on each arm',
    circuit: b.build(),
    expect: [
      { what: 'V(A) = 20/3 V', kind: 'node-voltage', id: a, value: vs.mul(r2).div(series(r1, r2)) },
      { what: 'V(B) = 20/3 V', kind: 'node-voltage', id: c, value: vs.mul(r4).div(series(r3, r4)) },
      { what: 'I(bridge) = 0', kind: 'current', id: RG, value: q(0) },
    ],
  };
}

function unbalancedBridge(): Fixture {
  const vs = q(12), r1 = q(1), r2 = q(2), r3 = q(2), r4 = q(1), rg = q(1);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const t = b.node();
  const a = b.node();
  const c = b.node();
  const src = b.add('vsource', [t, g], V(vs));
  b.add('resistor', [t, a], R(r1));
  b.add('resistor', [a, g], R(r2));
  b.add('resistor', [t, c], R(r3));
  b.add('resistor', [c, g], R(r4));
  const RG = b.add('resistor', [a, c], R(rg));
  // Thevenin seen by the bridge resistor:
  //   open-circuit V(A) = 12·2/3 = 8, V(B) = 12·1/3 = 4, so Vth = 4 V;
  //   Rth = (R1 ∥ R2) + (R3 ∥ R4) = 2/3 + 2/3 = 4/3 Ω;
  //   I(bridge, A → B) = Vth/(Rth + Rg) = 4/(7/3) = 12/7 A.
  // Back-substitute: V(A) = 8 − (12/7)(2/3) = 48/7 V, V(B) = 4 + (12/7)(2/3) = 36/7 V.
  const vaOpen = vs.mul(r2).div(series(r1, r2));
  const vbOpen = vs.mul(r4).div(series(r3, r4));
  const rth = series(parallel(r1, r2), parallel(r3, r4));
  const ig = vaOpen.sub(vbOpen).div(series(rth, rg));
  const va = vaOpen.sub(ig.mul(parallel(r1, r2)));
  const vb = vbOpen.add(ig.mul(parallel(r3, r4)));
  const total = vs.sub(va).div(r1).add(vs.sub(vb).div(r3));
  return {
    name: 'Unbalanced Wheatstone bridge (12 V; 1 Ω/2 Ω and 2 Ω/1 Ω arms; 1 Ω across)',
    method: 'Thevenin equivalent seen by the bridge resistor',
    circuit: b.build(),
    expect: [
      { what: 'I(bridge) = 12/7 A', kind: 'current', id: RG, value: ig },
      { what: 'V(A) = 48/7 V', kind: 'node-voltage', id: a, value: va },
      { what: 'V(B) = 36/7 V', kind: 'node-voltage', id: c, value: vb },
      { what: 'P(source) = −720/7 W', kind: 'power', id: src, value: vs.mul(total).neg() },
    ],
  };
}

function mixedSourcesSuperposition(): Fixture {
  const vs = q(9), is = q(2), r1 = q(3), r2 = q(6);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const n1 = b.node();
  const a = b.node();
  const v = b.add('vsource', [n1, g], V(vs));
  const R1 = b.add('resistor', [n1, a], R(r1));
  b.add('resistor', [a, g], R(r2));
  const i = b.add('isource', [g, a], I(is));
  // Superposition: V alone (I open): V(A) = 9·6/9 = 6 V. I alone (V shorted): V(A) = 2·(3 ∥ 6) = 4 V. Total 10 V.
  const va = vs.mul(r2).div(series(r1, r2)).add(is.mul(parallel(r1, r2)));
  const iR1 = vs.sub(va).div(r1); // −1/3 A: current flows back INTO the voltage source's + terminal
  return {
    name: 'Voltage source and current source together (9 V, 2 A, 3 Ω, 6 Ω)',
    method: 'Superposition',
    circuit: b.build(),
    expect: [
      { what: 'V(A) = 10 V', kind: 'node-voltage', id: a, value: va },
      { what: 'I(R1) = −1/3 A', kind: 'current', id: R1, value: iR1 },
      { what: 'P(current source) = −20 W', kind: 'power', id: i, value: va.mul(is).neg() },
      // Current enters the voltage source at + (1/3 A a → b through it), so it absorbs 3 W.
      { what: 'P(voltage source) = +3 W (absorbs)', kind: 'power', id: v, value: vs.mul(iR1.neg()) },
    ],
  };
}

function currentSourceIntoNetwork(): Fixture {
  const is = q(3, 1000), r1 = q(2000), r2 = q(1000), r3 = q(3000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const a = b.node();
  const c = b.node();
  b.add('isource', [g, a], I(is));
  const R1 = b.add('resistor', [a, g], R(r1));
  const R2 = b.add('resistor', [a, c], R(r2));
  b.add('resistor', [c, g], R(r3));
  // Branches from A: 2 kΩ, and 1 kΩ + 3 kΩ = 4 kΩ. Current divider: 2 mA and 1 mA. V(A) = 4 V, V(B) = 3 V.
  const branch = series(r2, r3);
  const iR1 = is.mul(branch).div(series(r1, branch));
  const iR2 = is.mul(r1).div(series(r1, branch));
  return {
    name: 'Current source feeding a resistor in parallel with a series pair (3 mA; 2 kΩ ∥ (1 kΩ + 3 kΩ))',
    method: 'Series reduction, then current divider',
    circuit: b.build(),
    expect: [
      { what: 'I(R1) = 2 mA', kind: 'current', id: R1, value: iR1 },
      { what: 'I(R2) = 1 mA', kind: 'current', id: R2, value: iR2 },
      { what: 'V(A) = 4 V', kind: 'node-voltage', id: a, value: iR1.mul(r1) },
      { what: 'V(B) = 3 V', kind: 'node-voltage', id: c, value: iR2.mul(r3) },
    ],
  };
}

function supernode(): Fixture {
  const is = q(3), vs = q(6), r1 = q(3), r2 = q(6);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const a = b.node();
  const c = b.node();
  b.add('isource', [g, a], I(is));
  const v = b.add('vsource', [a, c], V(vs)); // floating source, + at A
  b.add('resistor', [a, g], R(r1));
  b.add('resistor', [c, g], R(r2));
  // Supernode around the floating source: KCL  Is = V(A)/R1 + V(B)/R2, constraint V(A) − V(B) = Vs.
  //   Unknowns (V(A), V(B)): [1/3, 1/6] = 3 and [1, −1] = 6  →  V(A) = 8 V, V(B) = 2 V.
  const [va, vb] = solveExact([[r1.inv(), r2.inv()], [q(1), q(-1)]], [is, vs]) as [Q, Q];
  return {
    name: 'Supernode: floating voltage source between two nodes (3 A, 6 V, 3 Ω, 6 Ω)',
    method: 'Supernode KCL plus the source constraint, solved exactly',
    circuit: b.build(),
    expect: [
      { what: 'V(A) = 8 V', kind: 'node-voltage', id: a, value: va },
      { what: 'V(B) = 2 V', kind: 'node-voltage', id: c, value: vb },
      // a → b through the floating source equals the current down through R2.
      { what: 'I(voltage source) = 1/3 A', kind: 'current', id: v, value: vb.div(r2) },
      { what: 'P(voltage source) = +2 W (absorbs)', kind: 'power', id: v, value: vs.mul(vb.div(r2)) },
    ],
  };
}

function supermesh(): Fixture {
  const vs = q(10), is = q(1), r1 = q(2), r2 = q(3), r3 = q(5);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const n1 = b.node();
  const a = b.node();
  const c = b.node();
  b.add('vsource', [n1, g], V(vs));
  const R1 = b.add('resistor', [n1, a], R(r1));
  b.add('isource', [g, a], I(is)); // shared branch between the two meshes, pushing 1 A up into A
  const R2 = b.add('resistor', [a, c], R(r2));
  b.add('resistor', [c, g], R(r3));
  // Mesh currents, both clockwise. The current source sits in the shared branch, so:
  //   constraint: upward current in that branch = i2 − i1 = Is            → −i1 + i2 = 1
  //   supermesh KVL around the outside: R1·i1 + (R2 + R3)·i2 = Vs          →  2·i1 + 8·i2 = 10
  // Solution: i1 = 1/5 A, i2 = 6/5 A. V(A) = 10 − 2·(1/5) = 48/5 V, V(B) = 5·(6/5) = 6 V.
  const [i1, i2] = solveExact([[q(-1), q(1)], [r1, series(r2, r3)]], [is, vs]) as [Q, Q];
  return {
    name: 'Supermesh: current source shared by two meshes (10 V, 1 A, 2 Ω, 3 Ω, 5 Ω)',
    method: 'Supermesh KVL plus the source constraint, solved exactly',
    circuit: b.build(),
    expect: [
      { what: 'I(R1) = 1/5 A', kind: 'current', id: R1, value: i1 },
      { what: 'I(R2) = 6/5 A', kind: 'current', id: R2, value: i2 },
      { what: 'V(A) = 48/5 V', kind: 'node-voltage', id: a, value: vs.sub(r1.mul(i1)) },
      { what: 'V(B) = 6 V', kind: 'node-voltage', id: c, value: r3.mul(i2) },
    ],
  };
}

function equivalentResistance(): Fixture {
  const vs = q(12), r1 = q(6), r2 = q(12), r3 = q(4), r4 = q(8);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const t = b.node();
  const a = b.node();
  const c = b.node();
  const src = b.add('vsource', [t, g], V(vs));
  b.add('resistor', [t, a], R(r1));
  b.add('resistor', [a, g], R(r2));
  b.add('resistor', [a, c], R(r3));
  b.add('resistor', [c, g], R(r4));
  // Req = R1 + R2 ∥ (R3 + R4) = 6 + 12 ∥ 12 = 12 Ω, so the source delivers 12/12 = 1 A.
  const req = series(r1, parallel(r2, series(r3, r4)));
  const itotal = vs.div(req);
  return {
    name: 'Equivalent resistance of a series-parallel network (6 Ω + 12 Ω ∥ (4 Ω + 8 Ω))',
    method: 'Series-parallel reduction to one equivalent resistance',
    circuit: b.build(),
    expect: [
      { what: 'Source current = −1 A (a → b through it), so Req = 12 Ω', kind: 'current', id: src, value: itotal.neg() },
      { what: 'V(A) = 6 V', kind: 'node-voltage', id: a, value: vs.sub(itotal.mul(r1)) },
    ],
  };
}

export const TEXTBOOK_FIXTURES: readonly Fixture[] = [
  voltageDivider(),
  loadedDividerWithWires(),
  currentDivider(),
  r2rLadder(),
  twoLoopMesh(),
  balancedBridge(),
  unbalancedBridge(),
  mixedSourcesSuperposition(),
  currentSourceIntoNetwork(),
  supernode(),
  supermesh(),
  equivalentResistance(),
];
