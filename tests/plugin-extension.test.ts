// Proves later parts plug in through the public interface alone. Every part
// used here is defined in tests/support/test-components.ts; no file under
// src/ knows about them. Solve-level tests (RC divider, RLC resonance, op amp,
// CCCS, broken stamp) are added in Step 6 once the solver exists.

import { describe, expect, it } from 'vitest';
import { complex } from '../src/core/complex';
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
