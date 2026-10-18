// Textbook fixture circuits (decision D5). Each is a classic configuration,
// named by what it is, not by any textbook example. Every expected answer is
// derived here in EXACT rational arithmetic by a method that is not MNA
// (divider formulas, series-parallel reduction, Thevenin, superposition, or
// KVL/KCL equations written by hand and solved with exact fractions).
//
// Each fixture has a hand-written `wiring` line in the format documented in
// tests/support/describe-circuit.ts. A test checks it equals the wiring
// generated from the circuit itself, so the labels used in the comments below
// are the labels of the circuit that is actually solved.
//
// Conventions (decision D9): node voltages are relative to ground node 0; a
// part's current is from its first-listed node to its second, through the
// part (A→B in the wiring line); V(part) = V(first) − V(second); power is
// absorbed power, negative when the part supplies power. For a voltage
// source the first node is +. For a current source the current flows through
// the source from the first node to the second.

import { circuitBuilder } from '../../src/core/circuit';
import { complex } from '../../src/core/complex';
import { defaultRegistry } from '../../src/core/components';
import type { Circuit } from '../../src/core/model';
import { type Q, parallel, q, series, solveExact } from '../support/rational';

export interface Expectation {
  readonly kind: 'node-voltage' | 'current' | 'voltage' | 'power';
  /** Point id for node-voltage, part id otherwise. */
  readonly id: string;
  readonly value: Q;
}

export type FixtureCategory = 'ordinary' | 'special' | 'stress';

export interface Fixture {
  readonly name: string;
  readonly category: FixtureCategory;
  /** How the expected values were derived. */
  readonly method: string;
  /** Hand-written; checked against the circuit (see header). */
  readonly wiring: string;
  readonly circuit: Circuit;
  readonly expect: readonly Expectation[];
}

const V = (v: Q) => ({ voltage: complex(v.toNumber()) });
const I = (i: Q) => ({ current: complex(i.toNumber()) });
const R = (r: Q) => ({ resistance: r.toNumber() });
const sq = (x: Q) => x.mul(x);
const nodeV = (id: string, value: Q): Expectation => ({ kind: 'node-voltage', id, value });
const cur = (id: string, value: Q): Expectation => ({ kind: 'current', id, value });
const volt = (id: string, value: Q): Expectation => ({ kind: 'voltage', id, value });
const pow = (id: string, value: Q): Expectation => ({ kind: 'power', id, value });

// ───────────────────────── Original 12 (Step 7) ─────────────────────────

function voltageDivider(): Fixture {
  const vs = q(12), r1 = q(3000), r2 = q(1000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const V1 = b.add('vsource', [nA, g], V(vs));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const R2 = b.add('resistor', [nB, g], R(r2));
  b.add('ground', [g]);
  // One loop: V1 drives R1 then R2 back to ground. Divider: V(B) = Vs·R2/(R1 + R2) = 3 V.
  // Loop current A→B→0 = Vs/(R1 + R2) = 3 mA. V1 carries it from − to + (0→A), so its A→0 current is −3 mA.
  const i = vs.div(series(r1, r2));
  return {
    name: 'Voltage divider', category: 'ordinary', method: 'Voltage divider formula',
    wiring: 'V1 12 V +A −0; R1 3 kΩ A→B; R2 1 kΩ B→0; GND1 at 0',
    circuit: b.build(),
    expect: [
      nodeV(nB, vs.mul(r2).div(series(r1, r2))),
      cur(R1, i),
      volt(R2, i.mul(r2)),
      pow(R1, sq(i).mul(r1)),
      pow(V1, vs.mul(i).neg()),
      cur(V1, i.neg()),
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
  const W1 = b.add('wire', [p1, p2]);
  b.add('resistor', [p2, mid], R(r1));
  b.add('resistor', [mid, g], R(r2));
  b.add('wire', [mid, p4]);
  const R3 = b.add('resistor', [p4, g], R(rl));
  // Wires make drawn points A.1 (p1), A.2 (p2) one node A, and B.1 (mid), B.2 (p4) one node B.
  // V1 sits on A.1; W1 joins A.1→A.2; R1 runs A.2→B.1; R2 B.1→0; W2 joins B.1→B.2; R3 B.2→0.
  // R2 ∥ R3 = 3k ∥ 6k = 2 kΩ. V(B) = 10·2/(2 + 2) = 5 V at both B.1 and B.2.
  // All of V1's current passes through W1 from A.1 to A.2: 10/4k = 2.5 mA.
  const lower = parallel(r2, rl);
  const vB = vs.mul(lower).div(series(r1, lower));
  return {
    name: 'Loaded voltage divider drawn with wires', category: 'ordinary',
    method: 'Series-parallel reduction, then voltage divider',
    wiring: 'V1 10 V +A.1 −0; W1 wire A.1→A.2; R1 2 kΩ A.2→B.1; R2 3 kΩ B.1→0; W2 wire B.1→B.2; R3 6 kΩ B.2→0',
    circuit: b.build(),
    expect: [nodeV(mid, vB), nodeV(p4, vB), cur(R3, vB.div(rl)), cur(W1, vs.div(series(r1, lower)))],
  };
}

function currentDivider(): Fixture {
  const is = q(6, 1000), r1 = q(1000), r2 = q(2000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const I1 = b.add('isource', [g, nA], I(is));
  const R1 = b.add('resistor', [nA, g], R(r1));
  const R2 = b.add('resistor', [nA, g], R(r2));
  // I1 pushes 6 mA up into A; it splits through R1 and R2 back down to 0.
  // Current divider: I(R1) = Is·R2/(R1 + R2) = 4 mA, I(R2) = Is·R1/(R1 + R2) = 2 mA. V(A) = Is·(R1 ∥ R2) = 4 V.
  // I1 power: V(0) − V(A) = −4 V times 6 mA = −24 mW (supplies).
  const vA = is.mul(parallel(r1, r2));
  return {
    name: 'Current divider', category: 'ordinary', method: 'Current divider formula',
    wiring: 'I1 6 mA 0→A; R1 1 kΩ A→0; R2 2 kΩ A→0',
    circuit: b.build(),
    expect: [
      cur(R1, is.mul(r2).div(series(r1, r2))),
      cur(R2, is.mul(r1).div(series(r1, r2))),
      nodeV(nA, vA),
      pow(I1, vA.mul(is).neg()),
    ],
  };
}

function r2rLadder(): Fixture {
  const vs = q(16), r = q(1000), r2 = q(2000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  const nD = b.node();
  b.add('vsource', [nA, g], V(vs));
  b.add('resistor', [nA, nB], R(r));
  b.add('resistor', [nB, g], R(r2));
  b.add('resistor', [nB, nC], R(r));
  b.add('resistor', [nC, g], R(r2));
  b.add('resistor', [nC, nD], R(r));
  b.add('resistor', [nD, g], R(r2));
  b.add('resistor', [nD, g], R(r2));
  // Ladder: series 1 kΩ steps A→B→C→D along the top; 2 kΩ rungs from B, C, D down to 0; D has a second 2 kΩ (R7).
  // Reduce from the far end: z(D) = R6 ∥ R7 = 1k; z(C) = R4 ∥ (R5 + z(D)) = 1k; z(B) = R2 ∥ (R3 + z(C)) = 1k.
  // Then one divider per step: V(B) = 16·z(B)/(1k + z(B)) = 8, V(C) = 4, V(D) = 2.
  const zD = parallel(r2, r2);
  const zC = parallel(r2, series(r, zD));
  const zB = parallel(r2, series(r, zC));
  const vB = vs.mul(zB).div(series(r, zB));
  const vC = vB.mul(zC).div(series(r, zC));
  const vD = vC.mul(zD).div(series(r, zD));
  return {
    name: 'R-2R ladder, three sections', category: 'ordinary',
    method: 'Series-parallel reduction from the far end, then a divider per section',
    wiring: 'V1 16 V +A −0; R1 1 kΩ A→B; R2 2 kΩ B→0; R3 1 kΩ B→C; R4 2 kΩ C→0; R5 1 kΩ C→D; R6 2 kΩ D→0; R7 2 kΩ D→0',
    circuit: b.build(),
    expect: [nodeV(nB, vB), nodeV(nC, vC), nodeV(nD, vD)],
  };
}

/** Shared by the original two-loop fixture and its moved-ground twin. */
const TWO_LOOP = { v1: q(10), v2: q(5), r1: q(2), r2: q(4), r3: q(3) };
function twoLoopMeshCurrents(): [Q, Q] {
  const { v1, v2, r1, r2, r3 } = TWO_LOOP;
  // Mesh currents, both clockwise with ground at the bottom.
  // Left mesh i1: up through V1 (0→A), R1 (A→B), down R2 (B→0).
  // Right mesh i2: up R2 (0→B), R3 (B→C), down through V2 (C→0, + to −).
  //   Left KVL:  (R1 + R2)·i1 − R2·i2 = V1      →  6·i1 − 4·i2 = 10
  //   Right KVL: −R2·i1 + (R2 + R3)·i2 = −V2    → −4·i1 + 7·i2 = −5
  // Solution: i1 = 25/13 A, i2 = 5/13 A.
  return solveExact([[series(r1, r2), r2.neg()], [r2.neg(), series(r2, r3)]], [v1, v2.neg()]) as [Q, Q];
}

function twoLoopMesh(): Fixture {
  const { v1, v2, r1, r2, r3 } = TWO_LOOP;
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('vsource', [nA, g], V(v1));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const R2 = b.add('resistor', [nB, g], R(r2));
  const R3 = b.add('resistor', [nB, nC], R(r3));
  const V2 = b.add('vsource', [nC, g], V(v2));
  const [i1, i2] = twoLoopMeshCurrents();
  // I(R1) A→B = i1; I(R3) B→C = i2; I(R2) B→0 = i1 − i2; V(B) = R2·(i1 − i2) = 80/13.
  // V2 carries i2 from + (C) to − (0) through itself, so it ABSORBS V2·i2 = 25/13 W.
  return {
    name: 'Two-loop circuit with two voltage sources', category: 'ordinary', method: 'Mesh analysis, solved exactly',
    wiring: 'V1 10 V +A −0; R1 2 Ω A→B; R2 4 Ω B→0; R3 3 Ω B→C; V2 5 V +C −0',
    circuit: b.build(),
    expect: [cur(R1, i1), cur(R3, i2), cur(R2, i1.sub(i2)), nodeV(nB, r2.mul(i1.sub(i2))), pow(V2, v2.mul(i2))],
  };
}

function balancedBridge(): Fixture {
  const vs = q(10), r1 = q(1000), r2 = q(2000), r3 = q(3000), r4 = q(6000), r5 = q(5000);
  if (!r1.mul(r4).equals(r2.mul(r3))) throw new Error('Fixture is not balanced');
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('vsource', [nA, g], V(vs));
  b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  b.add('resistor', [nA, nC], R(r3));
  b.add('resistor', [nC, g], R(r4));
  const R5 = b.add('resistor', [nB, nC], R(r5));
  // Bridge: top node A; left arm R1 (A→B) over R2 (B→0); right arm R3 (A→C) over R4 (C→0); R5 bridges B→C.
  // Balanced (R1·R4 = R2·R3), so R5 carries no current and each arm is a plain divider:
  // V(B) = 10·2/3 = 20/3, V(C) = 10·6/9 = 20/3.
  return {
    name: 'Balanced Wheatstone bridge', category: 'special', method: 'Balance condition, then a voltage divider on each arm',
    wiring: 'V1 10 V +A −0; R1 1 kΩ A→B; R2 2 kΩ B→0; R3 3 kΩ A→C; R4 6 kΩ C→0; R5 5 kΩ B→C',
    circuit: b.build(),
    expect: [nodeV(nB, vs.mul(r2).div(series(r1, r2))), nodeV(nC, vs.mul(r4).div(series(r3, r4))), cur(R5, q(0))],
  };
}

/** Thevenin solution of a bridge seen by its bridging resistor. Returns [I(bridge B→C), V(B), V(C), source current]. */
function bridgeByThevenin(vs: Q, r1: Q, r2: Q, r3: Q, r4: Q, r5: Q): [Q, Q, Q, Q] {
  // Remove R5: open-circuit V(B) = Vs·R2/(R1 + R2), V(C) = Vs·R4/(R3 + R4); Vth = V(B) − V(C).
  // Rth seen between B and C with the source shorted = (R1 ∥ R2) + (R3 ∥ R4).
  // I(R5, B→C) = Vth/(Rth + R5). Then V(B) drops and V(C) rises by that current times each arm's Rth.
  const vBopen = vs.mul(r2).div(series(r1, r2));
  const vCopen = vs.mul(r4).div(series(r3, r4));
  const rth = series(parallel(r1, r2), parallel(r3, r4));
  const i5 = vBopen.sub(vCopen).div(series(rth, r5));
  const vB = vBopen.sub(i5.mul(parallel(r1, r2)));
  const vC = vCopen.add(i5.mul(parallel(r3, r4)));
  const total = vs.sub(vB).div(r1).add(vs.sub(vC).div(r3));
  return [i5, vB, vC, total];
}

function unbalancedBridge(): Fixture {
  const vs = q(12), r1 = q(1), r2 = q(2), r3 = q(2), r4 = q(1), r5 = q(1);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  const V1 = b.add('vsource', [nA, g], V(vs));
  b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  b.add('resistor', [nA, nC], R(r3));
  b.add('resistor', [nC, g], R(r4));
  const R5 = b.add('resistor', [nB, nC], R(r5));
  // Same bridge shape as above. Open-circuit V(B) = 8, V(C) = 4, Vth = 4 V; Rth = 2/3 + 2/3 = 4/3 Ω;
  // I(R5, B→C) = 4/(7/3) = 12/7 A; V(B) = 8 − (12/7)(2/3) = 48/7; V(C) = 4 + 8/7 = 36/7.
  // V1 delivers (12 − 48/7)/1 + (12 − 36/7)/2 = 60/7 A, so P(V1) = −12·60/7 = −720/7 W.
  const [i5, vB, vC, total] = bridgeByThevenin(vs, r1, r2, r3, r4, r5);
  return {
    name: 'Unbalanced Wheatstone bridge', category: 'ordinary', method: 'Thevenin equivalent seen by the bridge resistor',
    wiring: 'V1 12 V +A −0; R1 1 Ω A→B; R2 2 Ω B→0; R3 2 Ω A→C; R4 1 Ω C→0; R5 1 Ω B→C',
    circuit: b.build(),
    expect: [cur(R5, i5), nodeV(nB, vB), nodeV(nC, vC), pow(V1, vs.mul(total).neg())],
  };
}

function mixedSourcesSuperposition(): Fixture {
  const vs = q(9), is = q(2), r1 = q(3), r2 = q(6);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const V1 = b.add('vsource', [nA, g], V(vs));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  const I1 = b.add('isource', [g, nB], I(is));
  // Superposition. V1 alone (I1 open): V(B) = 9·6/9 = 6. I1 alone (V1 shorted): V(B) = 2·(3 ∥ 6) = 4. Total V(B) = 10 V.
  // I(R1, A→B) = (9 − 10)/3 = −1/3 A, i.e. 1/3 A flows from B back into V1's + terminal:
  // V1's A→0 current is +1/3 A, so V1 ABSORBS 9·(1/3) = 3 W. I1: V(0) − V(B) = −10 V times 2 A = −20 W.
  const vB = vs.mul(r2).div(series(r1, r2)).add(is.mul(parallel(r1, r2)));
  const iR1 = vs.sub(vB).div(r1);
  return {
    name: 'Voltage source and current source together', category: 'ordinary', method: 'Superposition',
    wiring: 'V1 9 V +A −0; R1 3 Ω A→B; R2 6 Ω B→0; I1 2 A 0→B',
    circuit: b.build(),
    expect: [nodeV(nB, vB), cur(R1, iR1), pow(I1, vB.mul(is).neg()), pow(V1, vs.mul(iR1.neg()))],
  };
}

function currentSourceIntoNetwork(): Fixture {
  const is = q(3, 1000), r1 = q(2000), r2 = q(1000), r3 = q(3000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  b.add('isource', [g, nA], I(is));
  const R1 = b.add('resistor', [nA, g], R(r1));
  const R2 = b.add('resistor', [nA, nB], R(r2));
  b.add('resistor', [nB, g], R(r3));
  // From A: R1 (2 kΩ) to 0, and the series pair R2 + R3 = 4 kΩ to 0. Current divider: 2 mA and 1 mA.
  const branch = series(r2, r3);
  const iR1 = is.mul(branch).div(series(r1, branch));
  const iR2 = is.mul(r1).div(series(r1, branch));
  return {
    name: 'Current source feeding a resistor in parallel with a series pair', category: 'ordinary',
    method: 'Series reduction, then current divider',
    wiring: 'I1 3 mA 0→A; R1 2 kΩ A→0; R2 1 kΩ A→B; R3 3 kΩ B→0',
    circuit: b.build(),
    expect: [cur(R1, iR1), cur(R2, iR2), nodeV(nA, iR1.mul(r1)), nodeV(nB, iR2.mul(r3))],
  };
}

function supernode(): Fixture {
  const is = q(3), vs = q(6), r1 = q(3), r2 = q(6);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  b.add('isource', [g, nA], I(is));
  const V1 = b.add('vsource', [nA, nB], V(vs));
  b.add('resistor', [nA, g], R(r1));
  b.add('resistor', [nB, g], R(r2));
  // V1 floats between A (+) and B (−). Supernode {A, B}: KCL  Is = V(A)/R1 + V(B)/R2; constraint V(A) − V(B) = 6.
  //   [1/3, 1/6]·(V(A), V(B)) = 3 and [1, −1]·(V(A), V(B)) = 6  →  V(A) = 8, V(B) = 2.
  // V1's A→B current equals R2's current down to 0: 2/6 = 1/3 A, so V1 absorbs 6·(1/3) = 2 W.
  const [vA, vB] = solveExact([[r1.inv(), r2.inv()], [q(1), q(-1)]], [is, vs]) as [Q, Q];
  return {
    name: 'Supernode: floating voltage source between two nodes', category: 'special',
    method: 'Supernode KCL plus the source constraint, solved exactly',
    wiring: 'I1 3 A 0→A; V1 6 V +A −B; R1 3 Ω A→0; R2 6 Ω B→0',
    circuit: b.build(),
    expect: [nodeV(nA, vA), nodeV(nB, vB), cur(V1, vB.div(r2)), pow(V1, vs.mul(vB.div(r2)))],
  };
}

function supermesh(): Fixture {
  const vs = q(10), is = q(1), r1 = q(2), r2 = q(3), r3 = q(5);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('vsource', [nA, g], V(vs));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  b.add('isource', [g, nB], I(is));
  const R2 = b.add('resistor', [nB, nC], R(r2));
  b.add('resistor', [nC, g], R(r3));
  // Drawn as two windows over a ground rail: left window V1 (0 up to A), R1 (A→B), and the shared middle branch I1
  // (0 up to B); right window R2 (B→C) and R3 (C down to 0). Mesh currents clockwise: i1 left, i2 right.
  //   The shared branch carries i2 − i1 upward, and I1 forces it:   −i1 + i2 = 1
  //   Supermesh KVL around the outside (V1, R1, R2, R3):            R1·i1 + (R2 + R3)·i2 = 10 → 2·i1 + 8·i2 = 10
  // Solution: i1 = 1/5 A (= I(R1), A→B), i2 = 6/5 A (= I(R2), B→C). V(B) = 10 − 2·(1/5) = 48/5, V(C) = 5·(6/5) = 6.
  const [i1, i2] = solveExact([[q(-1), q(1)], [r1, series(r2, r3)]], [is, vs]) as [Q, Q];
  return {
    name: 'Supermesh: current source shared by two meshes', category: 'special',
    method: 'Supermesh KVL plus the source constraint, solved exactly',
    wiring: 'V1 10 V +A −0; R1 2 Ω A→B; I1 1 A 0→B; R2 3 Ω B→C; R3 5 Ω C→0',
    circuit: b.build(),
    expect: [cur(R1, i1), cur(R2, i2), nodeV(nB, vs.sub(r1.mul(i1))), nodeV(nC, r3.mul(i2))],
  };
}

function equivalentResistance(): Fixture {
  const vs = q(12), r1 = q(6), r2 = q(12), r3 = q(4), r4 = q(8);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  const V1 = b.add('vsource', [nA, g], V(vs));
  b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  b.add('resistor', [nB, nC], R(r3));
  b.add('resistor', [nC, g], R(r4));
  // Seen by V1: R1 + R2 ∥ (R3 + R4) = 6 + 12 ∥ 12 = 12 Ω, so V1 delivers 1 A (its A→0 current is −1 A). V(B) = 12 − 6 = 6.
  const itotal = vs.div(series(r1, parallel(r2, series(r3, r4))));
  return {
    name: 'Equivalent resistance of a series-parallel network', category: 'ordinary',
    method: 'Series-parallel reduction to one equivalent resistance',
    wiring: 'V1 12 V +A −0; R1 6 Ω A→B; R2 12 Ω B→0; R3 4 Ω B→C; R4 8 Ω C→0',
    circuit: b.build(),
    expect: [cur(V1, itotal.neg()), nodeV(nB, vs.sub(itotal.mul(r1)))],
  };
}

// ───────────────────────── New ordinary problems (A) ─────────────────────────

/** Single loop with three sources; `flipV3` reverses V3 (fixture A6 twin). */
function singleLoop(flipV3: boolean): Fixture {
  const v1 = q(24), v2 = q(6), v3 = q(3), r1 = q(1), r2 = q(2), r3 = q(3), r4 = q(4);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const [nA, nB, nC, nD, nE, nF] = [b.node(), b.node(), b.node(), b.node(), b.node(), b.node()] as [string, string, string, string, string, string];
  const V1 = b.add('vsource', [nA, g], V(v1));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const V2 = b.add('vsource', [nB, nC], V(v2));
  const R2 = b.add('resistor', [nC, nD], R(r2));
  const R3 = b.add('resistor', [nD, nE], R(r3));
  const V3 = b.add('vsource', flipV3 ? [nF, nE] : [nE, nF], V(v3));
  const R4 = b.add('resistor', [nF, g], R(r4));
  // One loop, traversed 0→A→B→C→D→E→F→0. I is the loop current in that direction.
  // KVL (rises = drops): V1 raises by 24 (− to +). V2 is met + first (B→C), so it drops 6: it opposes V1.
  // Original: V3 is met + first (E→F) and drops 3: it opposes too. Net 24 − 6 − 3 = 15 V; ΣR = 10 Ω; I = 3/2 A.
  // Flipped:  V3 is met − first and raises 3: it aids.          Net 24 − 6 + 3 = 21 V; I = 21/10 A.
  // Resistor voltages in the loop direction: V(Rk) = I·Rk.
  const net = v1.sub(v2).add(flipV3 ? v3 : v3.neg());
  const i = net.div(series(r1, r2, r3, r4));
  // V3's own current, first node to second: original E→F is the loop direction (+I); flipped F→E is against it (−I).
  const iV3 = flipV3 ? i.neg() : i;
  return {
    name: flipV3 ? 'Single-loop KVL, V3 reversed (now aiding)' : 'Single-loop KVL with two opposing sources',
    category: 'ordinary', method: 'KVL around the single loop, exact',
    wiring: flipV3
      ? 'V1 24 V +A −0; R1 1 Ω A→B; V2 6 V +B −C; R2 2 Ω C→D; R3 3 Ω D→E; V3 3 V +F −E; R4 4 Ω F→0'
      : 'V1 24 V +A −0; R1 1 Ω A→B; V2 6 V +B −C; R2 2 Ω C→D; R3 3 Ω D→E; V3 3 V +E −F; R4 4 Ω F→0',
    circuit: b.build(),
    expect: [
      cur(R1, i),
      volt(R1, i.mul(r1)), volt(R2, i.mul(r2)), volt(R3, i.mul(r3)), volt(R4, i.mul(r4)),
      pow(V1, v1.mul(i).neg()),
      pow(V2, v2.mul(i)), // V2 carries I from + to −: absorbs
      pow(V3, v3.mul(iV3)),
      nodeV(nF, i.mul(r4)),
    ],
  };
}

function kclOneNode(): Fixture {
  const v1 = q(10), v2 = q(6), r1 = q(2), r2 = q(1);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  b.add('vsource', [nB, g], V(v1));
  const R1 = b.add('resistor', [nB, nA], R(r1));
  const R2 = b.add('resistor', [nA, g], R(r2));
  const V2 = b.add('vsource', [nA, g], V(v2));
  // Node A has three branches: R1 from B (held at 10 V by V1), R2 down to 0, and V2 holding A at 6 V.
  // Branch 1: I(R1, B→A) = (10 − 6)/2 = 2 A into A.  Branch 2: I(R2, A→0) = 6/1 = 6 A out of A.
  // KCL at A: the third branch (V2) must supply 6 − 2 = 4 A into A, so V2's A→0 current is −4 A and P(V2) = −24 W.
  const iR1 = v1.sub(v2).div(r1);
  const iR2 = v2.div(r2);
  const iV2 = iR1.sub(iR2); // A→0 through V2 = (in from R1) − (out through R2)
  return {
    name: 'KCL at one node: find the third branch current', category: 'ordinary', method: 'Branch currents from Ohm’s law, then KCL',
    wiring: 'V1 10 V +B −0; R1 2 Ω B→A; R2 1 Ω A→0; V2 6 V +A −0',
    circuit: b.build(),
    expect: [cur(R1, iR1), cur(R2, iR2), cur(V2, iV2), pow(V2, v2.mul(iV2))],
  };
}

function threeMesh(): Fixture {
  const v1 = q(20), v2 = q(5), v3 = q(10);
  const r1 = q(2), r2 = q(4), r3 = q(1), r4 = q(3), r5 = q(2), r6 = q(6);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const [nA, nB, nC, nD, nE, nF] = [b.node(), b.node(), b.node(), b.node(), b.node(), b.node()] as [string, string, string, string, string, string];
  b.add('vsource', [nA, g], V(v1));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const R2 = b.add('resistor', [nB, g], R(r2));
  const R3 = b.add('resistor', [nB, nC], R(r3));
  b.add('vsource', [nC, nE], V(v2));
  const R4 = b.add('resistor', [nE, g], R(r4));
  const R5 = b.add('resistor', [nC, nD], R(r5));
  const R6 = b.add('resistor', [nD, nF], R(r6));
  b.add('vsource', [nF, g], V(v3));
  // Three windows in a row over the ground rail. Top rail A→B→C→D (R1, R3, R5).
  // Verticals: V1 (0 up to A, + at A); R2 (B down to 0); V2 then R4 (C, + of V2; E between them; R4 E down to 0);
  // R6 then V3 (D down to F through R6; V3 from F, its +, down to 0).
  // Mesh currents clockwise: i1 (V1, R1, R2), i2 (R2, R3, V2+R4), i3 (V2+R4, R5, R6+V3).
  //   i1: −V1 + R1·i1 + R2·(i1 − i2) = 0                         →  6·i1 − 4·i2        = 20
  //   i2:  R2·(i2 − i1) + R3·i2 + V2 + R4·(i2 − i3) = 0          → −4·i1 + 8·i2 − 3·i3 = −5
  //   i3:  R4·(i3 − i2) − V2 + R5·i3 + R6·i3 + V3 = 0             →        −3·i2 + 11·i3 = −5
  // Solution: i1 = 650/149, i2 = 230/149, i3 = −5/149 A.
  const [i1, i2, i3] = solveExact(
    [
      [series(r1, r2), r2.neg(), q(0)],
      [r2.neg(), series(r2, r3, r4), r4.neg()],
      [q(0), r4.neg(), series(r4, r5, r6)],
    ],
    [v1, v2.neg(), v2.sub(v3)],
  ) as [Q, Q, Q];
  return {
    name: 'Three-mesh circuit with three voltage sources', category: 'ordinary', method: 'Mesh analysis (3 meshes), solved exactly',
    wiring: 'V1 20 V +A −0; R1 2 Ω A→B; R2 4 Ω B→0; R3 1 Ω B→C; V2 5 V +C −E; R4 3 Ω E→0; R5 2 Ω C→D; R6 6 Ω D→F; V3 10 V +F −0',
    circuit: b.build(),
    expect: [
      cur(R1, i1), cur(R2, i1.sub(i2)), cur(R3, i2), cur(R4, i2.sub(i3)), cur(R5, i3), cur(R6, i3),
      nodeV(nB, r2.mul(i1.sub(i2))), nodeV(nE, r4.mul(i2.sub(i3))), nodeV(nD, v3.add(r6.mul(i3))),
    ],
  };
}

function threeNodeTwoCurrentSources(): Fixture {
  const i1 = q(2), i2 = q(3), r1 = q(2), r2 = q(1), r3 = q(4), r4 = q(2), r5 = q(4);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('isource', [g, nA], I(i1));
  b.add('isource', [g, nC], I(i2));
  b.add('resistor', [nA, g], R(r1));
  const R2 = b.add('resistor', [nA, nB], R(r2));
  b.add('resistor', [nB, g], R(r3));
  const R4 = b.add('resistor', [nB, nC], R(r4));
  const R5 = b.add('resistor', [nA, nC], R(r5));
  // KCL written by hand at each node (current leaving through resistors = current pushed in by sources):
  //   A:  V(A)/R1 + (V(A) − V(B))/R2 + (V(A) − V(C))/R5 = I1
  //   B:  (V(B) − V(A))/R2 + V(B)/R3 + (V(B) − V(C))/R4 = 0
  //   C:  (V(C) − V(B))/R4 + (V(C) − V(A))/R5 = I2
  const g1 = r1.inv(), g2 = r2.inv(), g3 = r3.inv(), g4 = r4.inv(), g5 = r5.inv();
  const [vA, vB, vC] = solveExact(
    [
      [g1.add(g2).add(g5), g2.neg(), g5.neg()],
      [g2.neg(), g2.add(g3).add(g4), g4.neg()],
      [g5.neg(), g4.neg(), g4.add(g5)],
    ],
    [i1, q(0), i2],
  ) as [Q, Q, Q];
  return {
    name: 'Three nodes, two current sources, five resistors', category: 'ordinary', method: 'KCL at each node, solved exactly',
    wiring: 'I1 2 A 0→A; I2 3 A 0→C; R1 2 Ω A→0; R2 1 Ω A→B; R3 4 Ω B→0; R4 2 Ω B→C; R5 4 Ω A→C',
    circuit: b.build(),
    expect: [
      nodeV(nA, vA), nodeV(nB, vB), nodeV(nC, vC),
      cur(R2, vA.sub(vB).div(r2)), cur(R4, vB.sub(vC).div(r4)), cur(R5, vA.sub(vC).div(r5)),
    ],
  };
}

function threeCurrentSources(): Fixture {
  const i1 = q(1), i2 = q(2), i3 = q(1, 2);
  const r1 = q(10), r2 = q(5), r3 = q(20), r4 = q(10), r5 = q(5), r6 = q(20);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('isource', [g, nA], I(i1));
  const I2 = b.add('isource', [nA, nB], I(i2));
  const I3 = b.add('isource', [nC, g], I(i3));
  b.add('resistor', [nA, g], R(r1));
  const R2 = b.add('resistor', [nA, nB], R(r2));
  b.add('resistor', [nB, g], R(r3));
  const R4 = b.add('resistor', [nB, nC], R(r4));
  b.add('resistor', [nC, g], R(r5));
  const R6 = b.add('resistor', [nA, nC], R(r6));
  // I1 pushes 1 A into A; I2 moves 2 A from A to B (out of A, into B); I3 draws 1/2 A from C to 0.
  // KCL (current leaving through resistors = net source current in):
  //   A:  V(A)/R1 + (V(A) − V(B))/R2 + (V(A) − V(C))/R6 = I1 − I2 = −1
  //   B:  (V(B) − V(A))/R2 + V(B)/R3 + (V(B) − V(C))/R4 = I2 = 2
  //   C:  (V(C) − V(B))/R4 + V(C)/R5 + (V(C) − V(A))/R6 = −I3 = −1/2
  const g1 = r1.inv(), g2 = r2.inv(), g3 = r3.inv(), g4 = r4.inv(), g5 = r5.inv(), g6 = r6.inv();
  const [vA, vB, vC] = solveExact(
    [
      [g1.add(g2).add(g6), g2.neg(), g6.neg()],
      [g2.neg(), g2.add(g3).add(g4), g4.neg()],
      [g6.neg(), g4.neg(), g4.add(g5).add(g6)],
    ],
    [i1.sub(i2), i2, i3.neg()],
  ) as [Q, Q, Q];
  return {
    name: 'Three current sources with a six-resistor network', category: 'ordinary', method: 'KCL at each node, solved exactly',
    wiring: 'I1 1 A 0→A; I2 2 A A→B; I3 500 mA C→0; R1 10 Ω A→0; R2 5 Ω A→B; R3 20 Ω B→0; R4 10 Ω B→C; R5 5 Ω C→0; R6 20 Ω A→C',
    circuit: b.build(),
    expect: [
      nodeV(nA, vA), nodeV(nB, vB), nodeV(nC, vC),
      cur(R2, vA.sub(vB).div(r2)), cur(R4, vB.sub(vC).div(r4)), cur(R6, vA.sub(vC).div(r6)),
      pow(I2, vA.sub(vB).mul(i2)), // V(first) − V(second) times its current
      pow(I3, vC.mul(i3)),
    ],
  };
}

function twoLoopGroundMoved(): Fixture {
  const { v1, v2, r1, r2, r3 } = TWO_LOOP;
  const b = circuitBuilder(defaultRegistry);
  // Same parts, same drawn points, same order as the two-loop fixture; only the ground flag moves
  // from its bottom point to its middle point (the old node B). New labels: old 0 → A, old A → B, old B → 0, old C → C.
  const pOldGround = b.node();
  const pLeft = b.node();
  const pMid = b.node({ ground: true });
  const pRight = b.node();
  b.add('vsource', [pLeft, pOldGround], V(v1));
  const R1 = b.add('resistor', [pLeft, pMid], R(r1));
  const R2 = b.add('resistor', [pMid, pOldGround], R(r2));
  const R3 = b.add('resistor', [pMid, pRight], R(r3));
  b.add('vsource', [pRight, pOldGround], V(v2));
  const [i1, i2] = twoLoopMeshCurrents();
  // Mesh currents do not depend on where ground is, so every current is unchanged.
  // Node voltages, walking from the new ground (0, the middle point):
  //   R2 runs 0→A carrying i1 − i2, so V(A) = 0 − R2·(i1 − i2) = −80/13 V.
  //   V1 has + at B, − at A: V(B) = V(A) + 10 = 50/13 V.  V2 has + at C, − at A: V(C) = V(A) + 5 = −15/13 V.
  const vA = r2.mul(i1.sub(i2)).neg();
  return {
    name: 'Two-loop circuit with ground moved to the middle node', category: 'ordinary',
    method: 'Same mesh currents (ground-independent), then KVL walk from the new ground',
    wiring: 'V1 10 V +B −A; R1 2 Ω B→0; R2 4 Ω 0→A; R3 3 Ω 0→C; V2 5 V +C −A',
    circuit: b.build(),
    expect: [
      cur(R1, i1), cur(R3, i2), cur(R2, i1.sub(i2)),
      nodeV(pOldGround, vA), nodeV(pLeft, vA.add(v1)), nodeV(pRight, vA.add(v2)),
    ],
  };
}

function shortedAndZeroBranch(): Fixture {
  const v1 = q(10), v2 = q(4), r1 = q(6), r2 = q(4), r3 = q(7), r4 = q(7);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const pB1 = b.node();
  const pB2 = b.node();
  const nC = b.node();
  const V1 = b.add('vsource', [nA, g], V(v1));
  const R1 = b.add('resistor', [nA, pB1], R(r1));
  b.add('resistor', [pB1, g], R(r2));
  b.add('wire', [pB1, pB2]);
  const R3 = b.add('resistor', [pB2, pB1], R(r3)); // shorted: a wire joins its two ends
  const R4 = b.add('resistor', [pB1, nC], R(r4));
  const V2 = b.add('vsource', [nC, g], V(v2));
  // Node B has two drawn points joined by W1 (B.1→B.2). R3 runs B.2→B.1, so it sits across the wire:
  // zero voltage, zero current.
  // R4 runs from B.1 to C, where V2 holds C at 4 V. KCL at B (R3 carries nothing):
  //   (10 − V(B))/6 = V(B)/4 + (V(B) − 4)/7   →   V(B) = 4 V  (exact solve below).
  // So R4 carries zero current. This is not symmetry (R1 = 6 Ω and R2 = 4 Ω differ): it happens because V2 equals
  // the unloaded divider voltage 10·4/(6 + 4) = 4 V.
  const [vB] = solveExact([[r1.inv().add(r2.inv()).add(r4.inv())]], [v1.div(r1).add(v2.div(r4))]) as [Q];
  return {
    name: 'Resistor shorted by a wire, and a zero-current branch not caused by symmetry', category: 'special',
    method: 'Short gives V = 0; KCL at B, solved exactly',
    wiring: 'V1 10 V +A −0; R1 6 Ω A→B.1; R2 4 Ω B.1→0; W1 wire B.1→B.2; R3 7 Ω B.2→B.1; R4 7 Ω B.1→C; V2 4 V +C −0',
    circuit: b.build(),
    expect: [
      cur(R3, q(0)), volt(R3, q(0)),
      nodeV(pB1, vB), cur(R4, vB.sub(v2).div(r4)), cur(V2, vB.sub(v2).div(r4).neg()),
      cur(R1, v1.sub(vB).div(r1)), cur(V1, v1.sub(vB).div(r1).neg()),
    ],
  };
}

function mixedMagnitudes(): Fixture {
  const vs = q(5), r1 = q(100), r2 = q(4700), r3 = q(1000000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  b.add('vsource', [nA, g], V(vs));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  const R3 = b.add('resistor', [nB, g], R(r3));
  // R2 ∥ R3 = 4.7k ∥ 1M = 4700000000/1004700 Ω (about 4678.0 Ω).
  // V(B) = 5·Rp/(100 + Rp) ≈ 4.8953 V; I(R3) ≈ 4.8953 µA (microamp scale); I(R1) ≈ 1.0465 mA.
  const rp = parallel(r2, r3);
  const vB = vs.mul(rp).div(series(r1, rp));
  return {
    name: 'Mixed magnitudes: 100 Ω, 4.7 kΩ and 1 MΩ', category: 'ordinary',
    method: 'Series-parallel reduction, then voltage divider',
    wiring: 'V1 5 V +A −0; R1 100 Ω A→B; R2 4.7 kΩ B→0; R3 1 MΩ B→0',
    circuit: b.build(),
    expect: [nodeV(nB, vB), cur(R3, vB.div(r3)), cur(R1, vs.sub(vB).div(r1)), volt(R1, vs.sub(vB))],
  };
}

// ───────────────────────── Stress fixtures (B) ─────────────────────────

function fourMeshGrid(): Fixture {
  const v1 = q(12), v2 = q(6);
  const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = [1, 2, 3, 1, 2, 2, 4, 1, 3, 5].map((x) => q(x)) as
    [Q, Q, Q, Q, Q, Q, Q, Q, Q, Q];
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true }); // bottom-left corner
  // 3×3 grid of points. Top row A B C, middle row D E F, bottom row 0 G H.
  const [nA, nB, nC, nD, nE, nF, nG, nH] =
    [b.node(), b.node(), b.node(), b.node(), b.node(), b.node(), b.node(), b.node()] as
    [string, string, string, string, string, string, string, string];
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const R2 = b.add('resistor', [nB, nC], R(r2));
  const R3 = b.add('resistor', [nD, nE], R(r3));
  const R4 = b.add('resistor', [nE, nF], R(r4));
  const R5 = b.add('resistor', [g, nG], R(r5));
  const R6 = b.add('resistor', [nB, nE], R(r6));
  const R7 = b.add('resistor', [nC, nF], R(r7));
  const R8 = b.add('resistor', [nD, g], R(r8));
  const R9 = b.add('resistor', [nE, nG], R(r9));
  const R10 = b.add('resistor', [nG, nH], R(r10));
  b.add('vsource', [nA, nD], V(v1)); // left upper vertical, + at A (top)
  b.add('vsource', [nF, nH], V(v2)); // right lower vertical, + at F (middle)
  // Four windows, mesh currents clockwise: i1 top-left (A,B,E,D), i2 top-right (B,C,F,E),
  // i3 bottom-left (D,E,G,0), i4 bottom-right (E,F,H,G).
  //   i1: R1·i1 + R6·(i1 − i2) + R3·(i1 − i3) − V1 = 0
  //   i2: R2·i2 + R7·i2 + R4·(i2 − i4) + R6·(i2 − i1) = 0
  //   i3: R3·(i3 − i1) + R9·(i3 − i4) + R5·i3 + R8·i3 = 0
  //   i4: R4·(i4 − i2) + V2 + R10·i4 + R9·(i4 − i3) = 0
  const [i1, i2, i3, i4] = solveExact(
    [
      [series(r1, r6, r3), r6.neg(), r3.neg(), q(0)],
      [r6.neg(), series(r2, r7, r4, r6), q(0), r4.neg()],
      [r3.neg(), q(0), series(r3, r9, r5, r8), r9.neg()],
      [q(0), r4.neg(), r9.neg(), series(r4, r10, r9)],
    ],
    [v1, q(0), q(0), v2.neg()],
  ) as [Q, Q, Q, Q];
  // Resistor currents in each resistor's own direction (from its first node to its second):
  // R1 A→B = i1; R2 B→C = i2; R3 D→E = i3 − i1; R4 E→F = i4 − i2; R5 0→G = −i3 (i3 runs G→0 along the bottom);
  // R6 B→E = i1 − i2; R7 C→F = i2; R8 D→0 = −i3 (i3 runs 0→D up the left side); R9 E→G = i3 − i4; R10 G→H = −i4.
  return {
    name: 'Four-mesh grid with ten resistors and two sources', category: 'stress', method: 'Mesh analysis (4 meshes), solved exactly',
    wiring: 'R1 1 Ω A→B; R2 2 Ω B→C; R3 3 Ω D→E; R4 1 Ω E→F; R5 2 Ω 0→G; R6 2 Ω B→E; R7 4 Ω C→F; R8 1 Ω D→0; R9 3 Ω E→G; R10 5 Ω G→H; V1 12 V +A −D; V2 6 V +F −H',
    circuit: b.build(),
    expect: [
      cur(R1, i1), cur(R2, i2), cur(R3, i3.sub(i1)), cur(R4, i4.sub(i2)), cur(R5, i3.neg()),
      cur(R6, i1.sub(i2)), cur(R7, i2), cur(R8, i3.neg()), cur(R9, i3.sub(i4)), cur(R10, i4.neg()),
      nodeV(nD, r8.mul(i3.neg())), nodeV(nA, r8.mul(i3.neg()).add(v1)),
    ],
  };
}

function wideRatio(): Fixture {
  const vs = q(10), r1 = q(10), r2 = q(4700000), r3 = q(10), r4 = q(4700000);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  b.add('vsource', [nA, g], V(vs));
  const R1 = b.add('resistor', [nA, nB], R(r1));
  const R2 = b.add('resistor', [nB, g], R(r2));
  const R3 = b.add('resistor', [nB, nC], R(r3));
  b.add('resistor', [nC, g], R(r4));
  // Ladder A→B→C with 10 Ω steps and 4.7 MΩ rungs to 0 (ratio 470 000).
  // z(B) = R2 ∥ (R3 + R4); V(B) = 10·z(B)/(R1 + z(B)); V(C) = V(B)·R4/(R3 + R4).
  // Currents are about 2 µA; the 10 Ω drops are about 43 µV, a tiny difference of two ~10 V node voltages.
  const zB = parallel(r2, series(r3, r4));
  const vB = vs.mul(zB).div(series(r1, zB));
  const vC = vB.mul(r4).div(series(r3, r4));
  return {
    name: 'Wide value ratio: 10 Ω with 4.7 MΩ', category: 'stress', method: 'Series-parallel reduction, then dividers',
    wiring: 'V1 10 V +A −0; R1 10 Ω A→B; R2 4.7 MΩ B→0; R3 10 Ω B→C; R4 4.7 MΩ C→0',
    circuit: b.build(),
    expect: [
      nodeV(nB, vB), nodeV(nC, vC),
      cur(R1, vs.sub(vB).div(r1)), volt(R1, vs.sub(vB)), cur(R2, vB.div(r2)),
      cur(R3, vB.sub(vC).div(r3)), volt(R3, vB.sub(vC)),
    ],
  };
}

function e12AwkwardBridge(): Fixture {
  const vs = q(9), r1 = q(2200), r2 = q(3300), r3 = q(4700), r4 = q(6800), r5 = q(8200);
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const nA = b.node();
  const nB = b.node();
  const nC = b.node();
  const V1 = b.add('vsource', [nA, g], V(vs));
  b.add('resistor', [nA, nB], R(r1));
  b.add('resistor', [nB, g], R(r2));
  b.add('resistor', [nA, nC], R(r3));
  b.add('resistor', [nC, g], R(r4));
  const R5 = b.add('resistor', [nB, nC], R(r5));
  // Same bridge shape as the unbalanced bridge, with E12 values. Thevenin as before; the exact answers have
  // large, awkward denominators (shown in the test titles).
  const [i5, vB, vC, total] = bridgeByThevenin(vs, r1, r2, r3, r4, r5);
  return {
    name: 'E12-value bridge with awkward exact answers', category: 'stress', method: 'Thevenin equivalent seen by the bridge resistor',
    wiring: 'V1 9 V +A −0; R1 2.2 kΩ A→B; R2 3.3 kΩ B→0; R3 4.7 kΩ A→C; R4 6.8 kΩ C→0; R5 8.2 kΩ B→C',
    circuit: b.build(),
    expect: [cur(R5, i5), nodeV(nB, vB), nodeV(nC, vC), cur(V1, total.neg()), pow(V1, vs.mul(total).neg())],
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
  singleLoop(false),
  kclOneNode(),
  threeMesh(),
  threeNodeTwoCurrentSources(),
  threeCurrentSources(),
  singleLoop(true),
  twoLoopGroundMoved(),
  shortedAndZeroBranch(),
  mixedMagnitudes(),
  fourMeshGrid(),
  wideRatio(),
  e12AwkwardBridge(),
];
