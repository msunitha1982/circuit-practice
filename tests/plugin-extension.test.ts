// Proves later parts plug in through the public interface alone. Every part
// used here is defined in tests/support/test-components.ts; no file under
// src/ knows about them. Expected answers are closed-form, derived by hand.

import { describe, expect, it } from 'vitest';
import { type Complex, abs2, approxEqual, complex } from '../src/core/complex';
import { solve, type SolveResult } from '../src/solver/mna';
import { circuitBuilder } from '../src/core/circuit';
import { V1_COMPONENTS } from '../src/core/components';
import { createRegistry } from '../src/core/registry';
import { resistor } from '../src/core/components/resistor';
import { recordStamp, type Recorded } from './support/stamp-recorder';
import {
  TEST_COMPONENTS, testCapacitor, testCccs, testInductor, testOpAmp, testVcvs,
} from './support/test-components';

const registry = createRegistry([...V1_COMPONENTS, ...TEST_COMPONENTS]);

const asPairs = (m: Recorded) => ({
  A: m.A.map((row) => row.map((c) => [c.re === 0 ? 0 : c.re, c.im === 0 ? 0 : c.im])),
  z: m.z.map((c) => [c.re === 0 ? 0 : c.re, c.im === 0 ? 0 : c.im]),
});

describe('test-only parts register and build with no core changes', () => {
  it('registers alongside the real parts', () => {
    expect(registry.list().map((t) => t.typeId)).toEqual([
      'resistor', 'vsource', 'isource', 'ground', 'wire',
      'test.capacitor', 'test.inductor', 'test.vcvs', 'test.cccs', 'test.opamp', 'test.broken-resistor',
    ]);
  });

  it('builds a circuit using every test part, including a CCCS controlled by a resistor', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    const n3 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    const r1 = b.add('resistor', [n1, n2], { resistance: 1000 });
    b.add('test.capacitor', [n2, g], { capacitance: 1e-6 });
    b.add('test.inductor', [n2, n3], { inductance: 1e-3 });
    b.add('test.vcvs', [n3, g, n2, g], { gain: complex(2) });
    b.add('test.cccs', [n3, g], { gain: complex(3), control: r1 });
    b.add('test.opamp', [g, n3, n1]);
    const c = b.build(1000);
    expect(c.components.map((x) => x.name)).toEqual(['V1', 'R1', 'C1', 'L1', 'E1', 'F1', 'U1']);
  });

  it('rejects a CCCS whose control is missing or has no branch current', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    b.add('resistor', [n1, g], { resistance: 1 });
    const u = b.add('test.opamp', [g, n1, n1]);
    b.add('test.cccs', [n1, g], { gain: complex(1), control: u });
    b.add('test.cccs', [n1, g], { gain: complex(1), control: 'c99' });
    expect(() => b.build()).toThrow(/bad-control-ref, bad-control-ref/);
  });
});

describe('test-only part stamps (hand-written expected matrices)', () => {
  it('capacitor at ω = 1000, C = 1 mF: admittance j1 S between unknowns 0 and 1', () => {
    const m = recordStamp(testCapacitor, 2, { terminals: [0, 1], omega: 1000, params: { capacitance: 1e-3 } });
    expect(asPairs(m).A).toEqual([[[0, 1], [0, -1]], [[0, -1], [0, 1]]]);
  });

  it('capacitor at ω = 0 stamps nothing (open circuit)', () => {
    const m = recordStamp(testCapacitor, 2, { terminals: [0, 1], omega: 0, params: { capacitance: 1e-3 } });
    expect(asPairs(m).A).toEqual([[[0, 0], [0, 0]], [[0, 0], [0, 0]]]);
  });

  it('inductor at ω = 0 is a 0 V constraint (short circuit)', () => {
    const m = recordStamp(testInductor, 3, { terminals: [0, 1], extras: [2], omega: 0, params: { inductance: 1 } });
    expect(asPairs(m).A).toEqual([
      [[0, 0], [0, 0], [1, 0]],
      [[0, 0], [0, 0], [-1, 0]],
      [[1, 0], [-1, 0], [0, 0]],
    ]);
  });

  it('inductor at ω = 100, L = 0.5 H: constraint row has −j50 on its own current', () => {
    const m = recordStamp(testInductor, 3, { terminals: [0, 1], extras: [2], omega: 100, params: { inductance: 0.5 } });
    expect(asPairs(m).A[2]).toEqual([[1, 0], [-1, 0], [0, -50]]);
  });

  it('VCVS gain 2: row k is V(a) − V(b) − 2·(V(c+) − V(c−)) = 0', () => {
    const m = recordStamp(testVcvs, 5, { terminals: [0, 1, 2, 3], extras: [4], params: { gain: complex(2) } });
    expect(asPairs(m).A.map((row) => row.map(([re]) => re))).toEqual([
      [0, 0, 0, 0, 1],
      [0, 0, 0, 0, -1],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [1, -1, -2, 2, 0],
    ]);
  });

  it('CCCS gain 3 controlled by a 2 Ω resistor between unknowns 0 and 1, output from 2 to ground', () => {
    // Control current = (V0 − V1)/2, so the CCCS current is 1.5·V0 − 1.5·V1 leaving unknown 2.
    const control = resistor.branchCurrent?.({ omega: 0, params: { resistance: 2 }, terminals: [0, 1], extras: [] });
    expect(control).toBeDefined();
    const m = recordStamp(testCccs, 3, {
      terminals: [2, null],
      params: { gain: complex(3), control: 'c0' },
      currentOf: (id) => {
        expect(id).toBe('c0');
        return control!; // checked defined above
      },
    });
    expect(asPairs(m).A.map((row) => row.map(([re]) => re))).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1.5, -1.5, 0],
    ]);
  });

  it('ideal op amp: output current enters KCL at out; row k forces V(in+) = V(in−)', () => {
    const m = recordStamp(testOpAmp, 4, { terminals: [0, 1, 2], extras: [3] });
    expect(asPairs(m).A.map((row) => row.map(([re]) => re))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 1],
      [1, -1, 0, 0],
    ]);
  });
});

const near = (got: Complex | null | undefined, want: Complex) =>
  got !== null && got !== undefined && approxEqual(got, want, 1e-12, 1e-12);

function solved(r: SolveResult) {
  if (!r.ok) throw new Error(`Expected a solution, got ${JSON.stringify(r.failure)}`);
  return r.solution;
}

describe('test-only parts solve correctly (complex path)', () => {
  it('RC divider at ω = 1/(RC): |Vout| = 1/√2 and phase −45° (Vout = 1/(1 + j) = 0.5 − 0.5j)', () => {
    // R = 1 kΩ, C = 1 µF, so 1/(RC) = 1000 rad/s. Vout/Vin = (1/jωC)/(R + 1/jωC) = 1/(1 + jωRC) = 1/(1 + j).
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const out = b.node();
    b.add('vsource', [n1, g], { voltage: complex(1) });
    b.add('resistor', [n1, out], { resistance: 1000 });
    b.add('test.capacitor', [out, g], { capacitance: 1e-6 });
    const v = solved(solve(b.build(1000), registry)).nodeVoltages.get(out)!;
    expect(near(v, complex(0.5, -0.5))).toBe(true);
    expect(Math.abs(abs2(v) - 0.5)).toBeLessThan(1e-12); // |V|² = 1/2, so |V| = 1/√2
    expect(v.re > 0 && Math.abs(v.im + v.re) < 1e-12).toBe(true); // im = −re with re > 0: phase −45°
  });

  it('series RLC at resonance: current V/R in phase, V_L = −V_C = jω₀L·I', () => {
    // V = 10 V, R = 5 Ω, L = 0.1 H, C = 10 µF: ω₀ = 1/√(LC) = 1000 rad/s.
    // jω₀L = j100 Ω and 1/(jω₀C) = −j100 Ω cancel, so I = 10/5 = 2 A,
    // V_L = j100 × 2 = j200 V, V_C = −j200 V, V_R = 10 V.
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    const n3 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    const r = b.add('resistor', [n1, n2], { resistance: 5 });
    const l = b.add('test.inductor', [n2, n3], { inductance: 0.1 });
    const c = b.add('test.capacitor', [n3, g], { capacitance: 1e-5 });
    const s = solved(solve(b.build(1000), registry));
    expect(near(s.components.get(r)!.current, complex(2))).toBe(true);
    expect(near(s.components.get(r)!.voltage, complex(10))).toBe(true);
    expect(near(s.components.get(l)!.voltage, complex(0, 200))).toBe(true);
    expect(near(s.components.get(c)!.voltage, complex(0, -200))).toBe(true);
    // Reactive parts absorb no real power; the resistor absorbs all 20 W.
    expect(near(s.components.get(r)!.power, complex(20))).toBe(true);
  });

  it('at ω = 0 a capacitor is open: no current, it holds the full 10 V', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    b.add('resistor', [n1, n2], { resistance: 1000 });
    const c = b.add('test.capacitor', [n2, g], { capacitance: 1e-6 });
    const s = solved(solve(b.build(0), registry));
    expect(near(s.components.get(c)!.current, complex(0))).toBe(true);
    expect(near(s.components.get(c)!.voltage, complex(10))).toBe(true);
  });

  it('at ω = 0 an inductor is a short: 10 V / 2 Ω = 5 A through it, 0 V across it', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    b.add('resistor', [n1, n2], { resistance: 2 });
    const l = b.add('test.inductor', [n2, g], { inductance: 0.5 });
    const s = solved(solve(b.build(0), registry));
    expect(near(s.components.get(l)!.current, complex(5))).toBe(true);
    expect(near(s.components.get(l)!.voltage, complex(0))).toBe(true);
  });

  it('CCCS controlled by a resistor current: 3 × (10 V / 2 Ω) = 15 A into 4 Ω gives 60 V', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    const r1 = b.add('resistor', [n1, g], { resistance: 2 }); // 5 A from n1 to ground
    // a = ground, b = n2: 15 A flows through the source from ground up into n2.
    const f = b.add('test.cccs', [g, n2], { gain: complex(3), control: r1 });
    b.add('resistor', [n2, g], { resistance: 4 });
    const s = solved(solve(b.build(), registry));
    expect(near(s.nodeVoltages.get(n2), complex(60))).toBe(true);
    expect(near(s.components.get(f)!.current, complex(15))).toBe(true);
    expect(near(s.components.get(f)!.power, complex(-900))).toBe(true); // supplies 60 V × 15 A
  });

  it('ideal op amp, inverting amplifier: Vout = −(Rf/Rin)·Vin = −(10k/1k)·1 V = −10 V', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const vin = b.node();
    const inv = b.node();
    const out = b.node();
    b.add('vsource', [vin, g], { voltage: complex(1) });
    b.add('resistor', [vin, inv], { resistance: 1000 });
    b.add('resistor', [inv, out], { resistance: 10000 });
    const u = b.add('test.opamp', [g, inv, out]);
    b.add('resistor', [out, g], { resistance: 2000 }); // load
    const s = solved(solve(b.build(), registry));
    expect(near(s.nodeVoltages.get(out), complex(-10))).toBe(true);
    expect(near(s.nodeVoltages.get(inv), complex(0))).toBe(true); // virtual ground
    // Current into the op amp at "out", by KCL at node out:
    //   through Rf, inv (0 V) → out (−10 V): 10 V / 10 kΩ = 1 mA arrives at out;
    //   through the load, out → ground: −10 V / 2 kΩ = −5 mA, i.e. 5 mA arrives at out.
    //   6 mA arrives, so 6 mA flows into the op amp output.
    expect(near(s.components.get(u)!.terminalCurrents[2], complex(0.006))).toBe(true);
  });

  it('VCVS gain 2 driven by a 3 V node gives 6 V across a 2 Ω load (3 A)', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(3) });
    b.add('resistor', [n1, g], { resistance: 1000 });
    b.add('test.vcvs', [n2, g, n1, g], { gain: complex(2) });
    const load = b.add('resistor', [n2, g], { resistance: 2 });
    const s = solved(solve(b.build(), registry));
    expect(near(s.nodeVoltages.get(n2), complex(6))).toBe(true);
    expect(near(s.components.get(load)!.current, complex(3))).toBe(true);
  });
});

describe('independent self-checks catch a wrong stamp (item B)', () => {
  it('a resistor whose stamp uses 2/R instead of 1/R fails KCL', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    b.add('resistor', [n1, n2], { resistance: 5 });
    b.add('test.broken-resistor', [n2, g], { resistance: 5 });
    const r = solve(b.build(), registry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.code).toBe('kcl-failed');
      // The matrix thinks the broken part is 2.5 Ω, so V(n2) = 10 × 2.5/7.5 = 3.33 V.
      // Its own relation then gives 3.33/5 = 0.667 A, but R1 carries 6.67/5 = 1.333 A: KCL off by 0.667 A.
    }
  });

  it('the same circuit with a correct resistor passes', () => {
    const b = circuitBuilder(registry);
    const g = b.node({ ground: true });
    const n1 = b.node();
    const n2 = b.node();
    b.add('vsource', [n1, g], { voltage: complex(10) });
    b.add('resistor', [n1, n2], { resistance: 5 });
    b.add('resistor', [n2, g], { resistance: 5 });
    expect(solve(b.build(), registry).ok).toBe(true);
  });
});
