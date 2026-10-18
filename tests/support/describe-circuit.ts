// Plain-text wiring and reference directions, generated from the circuit
// itself so the description can never disagree with what is solved.
// Node names are the electrical-node labels: ground is 0, others A, B, C, ...
// When wires join several drawn points into one node, each point is named
// separately: A.1, A.2, ... in circuit order (node A's first point is A.1).
// A node with a single point is just its label.
//
// Wiring format, one entry per part, in the order the parts were added:
//   R1 3 kΩ A→B      resistor; its reference direction is A to B
//   V1 12 V +A −0    voltage source; + terminal on A, − terminal on 0
//   I1 6 mA 0→A      current source; pushes 6 mA through itself from 0 to A
//   W1 wire A.1→A.2  wire joining drawn points A.1 and A.2 (both node A);
//                    its current is measured from A.1 to A.2
//   GND1 at 0        ground symbol

import { defaultRegistry } from '../../src/core/components';
import { formatQuantity, type UnitSymbol } from '../../src/core/format';
import type { Circuit, ComponentParams } from '../../src/core/model';
import { isComplexValue } from '../../src/core/params';
import { analyzeTopology } from '../../src/core/topology';
import type { Q } from './rational';

const fmt = (value: number, unit: UnitSymbol) =>
  formatQuantity(value, unit, { sigFigs: 6, trimZeros: true }).replace(/ /g, ' ');

function realValue(params: ComponentParams, key: string): number {
  const v = params[key];
  if (typeof v === 'number') return v;
  if (isComplexValue(v) && v.im === 0) return v.re;
  throw new Error(`Param "${key}" is not a real value`);
}

/** Name of a drawn point: its node label, plus ".k" when the node has several points. */
export function nodeLabels(circuit: Circuit): (pointId: string) => string {
  const topo = analyzeTopology(circuit, defaultRegistry);
  const names = new Map<string, string>();
  for (const n of topo.electricalNodes) {
    n.members.forEach((m, k) => names.set(m, n.members.length > 1 ? `${n.label}.${k + 1}` : n.label));
  }
  return (pointId) => names.get(pointId) ?? '?';
}

export function describeWiring(circuit: Circuit): string {
  const label = nodeLabels(circuit);
  return circuit.components
    .map((c) => {
      const [a = '', b = ''] = c.terminals.map(label);
      switch (c.type) {
        case 'resistor': return `${c.name} ${fmt(realValue(c.params, 'resistance'), 'Ω')} ${a}→${b}`;
        case 'vsource': return `${c.name} ${fmt(realValue(c.params, 'voltage'), 'V')} +${a} −${b}`;
        case 'isource': return `${c.name} ${fmt(realValue(c.params, 'current'), 'A')} ${a}→${b}`;
        case 'wire': return `${c.name} wire ${a}→${b}`;
        case 'ground': return `${c.name} at ${a}`;
        default: return `${c.name} (${c.type}) ${c.terminals.map(label).join(',')}`;
      }
    })
    .join('; ');
}

export interface ExpectationLike {
  readonly kind: 'node-voltage' | 'voltage' | 'current' | 'power';
  readonly id: string;
  readonly value: Q;
}

const UNIT: Record<ExpectationLike['kind'], UnitSymbol> = {
  'node-voltage': 'V', voltage: 'V', current: 'A', power: 'W',
};

/** e.g. "I(R1), A→B through R1 = 3 mA  [exact 3/1000]". */
export function describeExpectation(circuit: Circuit, e: ExpectationLike): string {
  const label = nodeLabels(circuit);
  const value = `${fmt(e.value.toNumber(), UNIT[e.kind])}  [exact ${e.value.toString()}]`;
  if (e.kind === 'node-voltage') return `V(${label(e.id)}), point ${label(e.id)} relative to ground 0 = ${value}`;
  const c = circuit.components.find((x) => x.id === e.id);
  if (!c) throw new Error(`No part "${e.id}"`);
  const [a = '', b = ''] = c.terminals.map(label);
  if (e.kind === 'current') return `I(${c.name}), ${a}→${b} through ${c.name} = ${value}`;
  if (e.kind === 'voltage') return `V(${c.name}) = V(${a}) − V(${b}) = ${value}`;
  return `P(${c.name}), absorbed (negative = supplies) = ${value}`;
}
