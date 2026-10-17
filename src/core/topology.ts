// Electrical nodes: connection points joined by wires are one electrical node
// (decision D7). Nodal and mesh methods, equation counts and node labels use
// electrical nodes only; wires never count as equations.
//
// Labels (decision D15): the ground node is "0"; the others are A, B, C, ...
// in order of their first point in circuit order (then Z, AA, AB, ...).

import type { Circuit, ComponentId, NodeId } from './model';
import type { ComponentRegistry } from './registry';

export type ElectricalNodeId = string; // "e:" + id of its first point

export interface ElectricalNode {
  readonly id: ElectricalNodeId;
  readonly label: string;
  /** Member points, in circuit order. */
  readonly members: readonly NodeId[];
  readonly isGround: boolean;
}

export interface Topology {
  /** In order of each node's first point in the circuit. */
  readonly electricalNodes: readonly ElectricalNode[];
  readonly nodeOf: ReadonlyMap<NodeId, ElectricalNodeId>;
  /** All parts with the 'connector' role. Excluded from equation counts. */
  readonly wires: readonly ComponentId[];
  /** Wires that close a loop made only of wires (each such loop is singular in the solver). */
  readonly redundantWires: readonly ComponentId[];
  /** Non-wire parts whose terminals all sit on one electrical node (shorted out). */
  readonly shortedComponents: readonly ComponentId[];
}

/** Spreadsheet-style letters: 0 → A, 25 → Z, 26 → AA. */
export function letterLabel(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function analyzeTopology(circuit: Circuit, registry: ComponentRegistry): Topology {
  const index = new Map<NodeId, number>();
  circuit.nodes.forEach((n, i) => index.set(n.id, i));
  const parent = circuit.nodes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    // Path compression.
    let k = i;
    while (parent[k] !== r) {
      const next = parent[k] as number;
      parent[k] = r;
      k = next;
    }
    return r;
  };
  const indexOf = (id: NodeId): number => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`Unknown point "${id}"`);
    return i;
  };

  const wires: ComponentId[] = [];
  const redundantWires: ComponentId[] = [];
  for (const c of circuit.components) {
    if (registry.get(c.type)?.role !== 'connector') continue;
    wires.push(c.id);
    const roots = c.terminals.map((t) => find(indexOf(t)));
    const first = roots[0];
    if (first === undefined) continue;
    if (roots.every((r) => r === first)) {
      redundantWires.push(c.id);
      continue;
    }
    // Union, keeping the lowest index as the root so ids are order-independent.
    for (const r of roots) {
      const a = find(r);
      const b = find(first);
      if (a !== b) {
        const lo = a < b ? a : b;
        parent[a === lo ? b : a] = lo;
      }
    }
  }

  const groups = new Map<number, NodeId[]>();
  circuit.nodes.forEach((n, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(n.id);
    else groups.set(r, [n.id]);
  });

  const isGroundPoint = new Map(circuit.nodes.map((n) => [n.id, n.isGround]));
  const electricalNodes: ElectricalNode[] = [];
  const nodeOf = new Map<NodeId, ElectricalNodeId>();
  let letter = 0;
  // Map iteration follows insertion order, which is circuit order of first members.
  for (const members of groups.values()) {
    const isGround = members.some((m) => isGroundPoint.get(m) === true);
    const id = `e:${members[0] as NodeId}`;
    electricalNodes.push({ id, label: isGround ? '0' : letterLabel(letter++), members, isGround });
    for (const m of members) nodeOf.set(m, id);
  }

  const shortedComponents: ComponentId[] = [];
  for (const c of circuit.components) {
    const role = registry.get(c.type)?.role;
    if (role === 'connector' || role === 'reference' || c.terminals.length < 2) continue;
    const first = nodeOf.get(c.terminals[0] as NodeId);
    if (c.terminals.every((t) => nodeOf.get(t) === first)) shortedComponents.push(c.id);
  }

  return { electricalNodes, nodeOf, wires, redundantWires, shortedComponents };
}
