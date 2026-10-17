import { describe, expect, it } from 'vitest';
import { complex } from '../src/core/complex';
import { RESERVED_COMPONENTS, V1_COMPONENTS, defaultRegistry } from '../src/core/components';
import { currentSource } from '../src/core/components/current-source';
import { ground } from '../src/core/components/ground';
import { resistor } from '../src/core/components/resistor';
import { voltageSource } from '../src/core/components/voltage-source';
import { wire } from '../src/core/components/wire';
import { createRegistry, type ResultContext } from '../src/core/registry';
import { strings } from '../src/ui/strings';
import { realPart, recordStamp } from './support/stamp-recorder';

const result = (over: Partial<ResultContext>): ResultContext => ({
  omega: 0, params: {}, terminalVoltages: [], extras: [],
  currentOf: () => { throw new Error('not used'); },
  ...over,
});

describe('resistor stamp (R = 2 Ω, conductance 0.5 S)', () => {
  it('between two unknowns', () => {
    expect(realPart(recordStamp(resistor, 2, { terminals: [0, 1], params: { resistance: 2 } }))).toEqual({
      A: [[0.5, -0.5], [-0.5, 0.5]], z: [0, 0],
    });
  });
  it('with terminal b on ground', () => {
    expect(realPart(recordStamp(resistor, 1, { terminals: [0, null], params: { resistance: 2 } }))).toEqual({
      A: [[0.5]], z: [0],
    });
  });
  it('branch current is (Va − Vb)/R as a linear expression', () => {
    const e = resistor.branchCurrent?.({ omega: 0, params: { resistance: 4 }, terminals: [3, null], extras: [] });
    expect(e).toEqual({ terms: [{ index: 3, coeff: complex(0.25) }], constant: complex(0) });
  });
  it('terminal currents come from its own V/R: 6 V across 2 Ω gives 3 A in at a, out at b', () => {
    const r = resistor.terminalCurrents(result({ params: { resistance: 2 }, terminalVoltages: [complex(10), complex(4)] }));
    // Compare by value: negation gives −0 imaginary parts, which equal 0.
    expect(r.map((c) => [c.re, c.im + 0])).toEqual([[3, 0], [-3, 0]]);
  });
});

describe('voltage source stamp (5 V, a = unknown 0, b = unknown 1, current = unknown 2)', () => {
  it('KCL rows get ±I; constraint row is V(a) − V(b) = 5', () => {
    expect(realPart(recordStamp(voltageSource, 3, { terminals: [0, 1], extras: [2], params: { voltage: complex(5) } }))).toEqual({
      A: [[0, 0, 1], [0, 0, -1], [1, -1, 0]], z: [0, 0, 5],
    });
  });
  it('with b on ground', () => {
    expect(realPart(recordStamp(voltageSource, 2, { terminals: [0, null], extras: [1], params: { voltage: complex(5) } }))).toEqual({
      A: [[0, 1], [1, 0]], z: [0, 5],
    });
  });
  it('branch current is its extra unknown', () => {
    expect(voltageSource.branchCurrent?.({ omega: 0, params: { voltage: complex(5) }, terminals: [0, 1], extras: [7] }))
      .toEqual({ terms: [{ index: 7, coeff: complex(1) }], constant: complex(0) });
  });
  it('constraint residual is V(a) − V(b) − value', () => {
    const r = voltageSource.constraintResiduals?.(result({
      params: { voltage: complex(5) }, terminalVoltages: [complex(9), complex(3)], extras: [complex(0)],
    }));
    expect(r).toEqual([complex(1)]);
  });
});

describe('current source stamp (3 A from a to b through the source)', () => {
  it('3 A leaves node a into the source and arrives at node b', () => {
    expect(realPart(recordStamp(currentSource, 2, { terminals: [0, 1], params: { current: complex(3) } }))).toEqual({
      A: [[0, 0], [0, 0]], z: [-3, 3],
    });
  });
  it('branch current is the constant source value', () => {
    expect(currentSource.branchCurrent?.({ omega: 0, params: { current: complex(3) }, terminals: [0, 1], extras: [] }))
      .toEqual({ terms: [], constant: complex(3) });
  });
});

describe('wire and ground stamps', () => {
  it('wire is a 0 V source', () => {
    expect(realPart(recordStamp(wire, 3, { terminals: [0, 1], extras: [2] }))).toEqual({
      A: [[0, 0, 1], [0, 0, -1], [1, -1, 0]], z: [0, 0, 0],
    });
  });
  it('ground stamps nothing and has one terminal', () => {
    expect(realPart(recordStamp(ground, 1, { terminals: [0] }))).toEqual({ A: [[0]], z: [0] });
    expect(ground.terminals).toHaveLength(1);
  });
});

describe('registry', () => {
  it('holds the five v1 parts and the reserved later parts', () => {
    expect(V1_COMPONENTS.map((t) => t.typeId)).toEqual(['resistor', 'vsource', 'isource', 'ground', 'wire']);
    expect(RESERVED_COMPONENTS.map((t) => t.typeId)).toEqual([
      'capacitor', 'inductor', 'vcvs', 'vccs', 'ccvs', 'cccs', 'opamp', 'diode', 'switch', 'transformer',
    ]);
    expect(defaultRegistry.list()).toHaveLength(15);
  });
  it('reserved parts refuse to stamp', () => {
    for (const t of RESERVED_COMPONENTS) {
      expect(t.status).toBe('reserved');
      expect(() => recordStamp(t, 2, { terminals: [0, 1] })).toThrow(/reserved/);
    }
  });
  it('rejects duplicate type ids and unknown lookups', () => {
    expect(() => createRegistry([resistor, resistor])).toThrow(/Duplicate/);
    expect(() => defaultRegistry.require('nope')).toThrow(/Unknown/);
    expect(defaultRegistry.get('nope')).toBeUndefined();
  });
  it('every part has a display name in the strings table', () => {
    for (const t of defaultRegistry.list()) expect(strings.components[t.nameKey]).toBeTruthy();
  });
  it('labelled parts declare the right unit', () => {
    expect(resistor.label).toEqual({ param: 'resistance', unit: 'Ω' });
    expect(voltageSource.label).toEqual({ param: 'voltage', unit: 'V' });
    expect(currentSource.label).toEqual({ param: 'current', unit: 'A' });
  });
});
