import { describe, expect, it } from 'vitest';
import { CircuitValidationError, circuitBuilder, validateCircuit } from '../src/core/circuit';
import { complex } from '../src/core/complex';
import { defaultRegistry } from '../src/core/components';
import type { Circuit } from '../src/core/model';

function divider(): Circuit {
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const top = b.node();
  const mid = b.node();
  b.add('vsource', [top, g], { voltage: complex(10) });
  b.add('resistor', [top, mid], { resistance: 1000 });
  b.add('resistor', [mid, g], { resistance: 2000 });
  b.add('ground', [g]);
  return b.build();
}

const codes = (c: Circuit) => validateCircuit(c, defaultRegistry).map((i) => i.code);

describe('circuit builder', () => {
  it('gives structural ids and per-prefix names', () => {
    const c = divider();
    expect(c.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2']);
    expect(c.components.map((x) => [x.id, x.name])).toEqual([
      ['c0', 'V1'], ['c1', 'R1'], ['c2', 'R2'], ['c3', 'GND1'],
    ]);
    expect(c.omega).toBe(0);
  });

  it('the same build steps give an identical circuit (no global counters)', () => {
    expect(divider()).toEqual(divider());
  });

  it('returns a deep-frozen circuit', () => {
    const c = divider();
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.components[1]?.params)).toBe(true);
    expect(() => {
      (c.components as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it('accepts an explicit name', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const n = b.node();
    b.add('resistor', [n, g], { resistance: 1 }, { name: 'Rload' });
    b.add('isource', [n, g], { current: complex(1) });
    expect(b.build().components[0]?.name).toBe('Rload');
  });

  it('throws listing every issue', () => {
    const b = circuitBuilder(defaultRegistry);
    b.node();
    b.add('resistor', ['n0'], { resistance: -1 });
    try {
      b.build();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitValidationError);
      expect((e as CircuitValidationError).issues.map((i) => i.code)).toEqual([
        'ground-count', 'terminal-count', 'bad-param',
      ]);
    }
  });
});

describe('validateCircuit catches each structural problem', () => {
  const base = divider();
  const withComponents = (f: (cs: Circuit['components']) => Circuit['components']): Circuit =>
    ({ ...base, components: f(base.components) });

  it('a valid circuit has no issues', () => expect(codes(base)).toEqual([]));
  it('unknown type', () => expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'flux', name: 'X1', terminals: ['n0'], params: {} }]))).toEqual(['unknown-type']));
  it('reserved type', () => expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'capacitor', name: 'C1', terminals: ['n1', 'n0'], params: {} }]))).toEqual(['reserved-type']));
  it('missing node', () => expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'resistor', name: 'R9', terminals: ['n1', 'n7'], params: { resistance: 1 } }]))).toEqual(['missing-node']));
  it('missing, wrong-kind and unexpected params', () => {
    expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'resistor', name: 'R9', terminals: ['n1', 'n0'], params: {} }]))).toEqual(['bad-param']);
    expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'resistor', name: 'R9', terminals: ['n1', 'n0'], params: { resistance: 0 } }]))).toEqual(['bad-param']);
    expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'vsource', name: 'V9', terminals: ['n1', 'n0'], params: { voltage: 5 } }]))).toEqual(['bad-param']);
    expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'resistor', name: 'R9', terminals: ['n1', 'n0'], params: { resistance: 1, tol: 5 } }]))).toEqual(['bad-param']);
  });
  it('ground marker off the ground point', () => expect(codes(withComponents((cs) => [...cs, { id: 'c9', type: 'ground', name: 'GND9', terminals: ['n1'], params: {} }]))).toEqual(['ground-marker-off-ground']));
  it('two grounds, or none', () => {
    expect(codes({ ...base, nodes: base.nodes.map((n) => ({ ...n, isGround: true })) })).toEqual(['ground-count']);
    expect(codes({ ...base, nodes: base.nodes.map((n) => ({ ...n, isGround: false })) })).toEqual(['ground-count', 'ground-marker-off-ground']);
  });
  it('unconnected point', () => expect(codes({ ...base, nodes: [...base.nodes, { id: 'n9', isGround: false }] })).toEqual(['unconnected-node']));
  it('duplicate id and duplicate name', () => {
    expect(codes(withComponents((cs) => [...cs, { ...cs[1]!, name: 'R9' }]))).toEqual(['duplicate-id']);
    expect(codes(withComponents((cs) => [...cs, { ...cs[1]!, id: 'c9' }]))).toEqual(['duplicate-name']);
  });
  it('negative or non-finite frequency', () => {
    expect(codes({ ...base, omega: -1 })).toEqual(['bad-omega']);
    expect(codes({ ...base, omega: Number.NaN })).toEqual(['bad-omega']);
  });
});
