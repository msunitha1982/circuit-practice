// Building and validating circuits. Ids are structural: they come from the
// order points and parts are added to one builder ("n0", "c0", ...), and names
// come from per-prefix counters owned by that builder. No global counters, so
// the same build steps always give the same circuit.

import type {
  Circuit, CircuitNode, Component, ComponentId, ComponentParams, ComponentTypeId, NodeId,
} from './model';
import { matchesKind } from './params';
import type { ComponentRegistry } from './registry';

export type CircuitIssue =
  | { readonly code: 'unknown-type' | 'reserved-type'; readonly component: ComponentId }
  | { readonly code: 'terminal-count' | 'missing-node' | 'bad-param'; readonly component: ComponentId; readonly detail: string }
  | { readonly code: 'bad-control-ref'; readonly component: ComponentId; readonly target: string }
  | { readonly code: 'ground-marker-off-ground'; readonly component: ComponentId }
  | { readonly code: 'ground-count'; readonly count: number }
  | { readonly code: 'unconnected-node'; readonly node: NodeId }
  | { readonly code: 'duplicate-id' | 'duplicate-name'; readonly id: string }
  | { readonly code: 'bad-omega' };

export class CircuitValidationError extends Error {
  constructor(readonly issues: readonly CircuitIssue[]) {
    super(`Invalid circuit: ${issues.map((i) => i.code).join(', ')}`);
    this.name = 'CircuitValidationError';
  }
}

/** Structural checks only. Electrical validity (singularity, loops of sources) is the solver's and generator's job. */
export function validateCircuit(circuit: Circuit, registry: ComponentRegistry): readonly CircuitIssue[] {
  const issues: CircuitIssue[] = [];
  if (!(Number.isFinite(circuit.omega) && circuit.omega >= 0)) issues.push({ code: 'bad-omega' });

  const nodeById = new Map<NodeId, CircuitNode>();
  for (const n of circuit.nodes) {
    if (nodeById.has(n.id)) issues.push({ code: 'duplicate-id', id: n.id });
    nodeById.set(n.id, n);
  }
  const groundCount = circuit.nodes.filter((n) => n.isGround).length;
  if (groundCount !== 1) issues.push({ code: 'ground-count', count: groundCount });

  const componentById = new Map<ComponentId, Component>();
  const names = new Set<string>();
  for (const c of circuit.components) {
    if (componentById.has(c.id) || nodeById.has(c.id)) issues.push({ code: 'duplicate-id', id: c.id });
    if (names.has(c.name)) issues.push({ code: 'duplicate-name', id: c.name });
    componentById.set(c.id, c);
    names.add(c.name);
  }

  const used = new Set<NodeId>();
  for (const c of circuit.components) {
    for (const t of c.terminals) used.add(t);
    const type = registry.get(c.type);
    if (!type) {
      issues.push({ code: 'unknown-type', component: c.id });
      continue;
    }
    if (type.status === 'reserved') {
      issues.push({ code: 'reserved-type', component: c.id });
      continue;
    }
    if (c.terminals.length !== type.terminals.length) {
      issues.push({
        code: 'terminal-count', component: c.id,
        detail: `expected ${type.terminals.length}, got ${c.terminals.length}`,
      });
    }
    for (const t of c.terminals) {
      if (!nodeById.has(t)) issues.push({ code: 'missing-node', component: c.id, detail: t });
    }
    for (const [key, spec] of Object.entries(type.params)) {
      const value = c.params[key];
      if (value === undefined) {
        if (!spec.optional) issues.push({ code: 'bad-param', component: c.id, detail: `missing "${key}"` });
        continue;
      }
      if (!matchesKind(value, spec.kind)) {
        issues.push({ code: 'bad-param', component: c.id, detail: `"${key}" must be ${spec.kind}` });
        continue;
      }
      if (spec.kind === 'component-ref') {
        const target = componentById.get(value as string);
        const targetType = target ? registry.get(target.type) : undefined;
        if (!target || target.id === c.id || !targetType?.branchCurrent) {
          issues.push({ code: 'bad-control-ref', component: c.id, target: value as string });
        }
      }
    }
    for (const key of Object.keys(c.params)) {
      if (!(key in type.params)) issues.push({ code: 'bad-param', component: c.id, detail: `unexpected "${key}"` });
    }
    for (const detail of type.validate?.(c) ?? []) issues.push({ code: 'bad-param', component: c.id, detail });
    if (type.role === 'reference' && c.terminals.some((t) => nodeById.get(t)?.isGround === false)) {
      issues.push({ code: 'ground-marker-off-ground', component: c.id });
    }
  }
  for (const n of circuit.nodes) {
    if (!used.has(n.id)) issues.push({ code: 'unconnected-node', node: n.id });
  }
  return issues;
}

export interface CircuitBuilder {
  /** Adds a connection point. Points carry no label (decision D15). */
  node(options?: { readonly ground?: boolean }): NodeId;
  /** Adds a part. Its name defaults to the type's prefix and the next number for that prefix. */
  add(type: ComponentTypeId, terminals: readonly NodeId[], params?: ComponentParams,
    options?: { readonly name?: string }): ComponentId;
  /** Validates and returns a deep-frozen Circuit. Throws CircuitValidationError listing every issue. */
  build(omega?: number): Circuit;
}

export function circuitBuilder(registry: ComponentRegistry): CircuitBuilder {
  const nodes: CircuitNode[] = [];
  const components: Component[] = [];
  const prefixCount = new Map<string, number>();

  return {
    node(options = {}) {
      const id = `n${nodes.length}`;
      nodes.push({ id, isGround: options.ground ?? false });
      return id;
    },
    add(type, terminals, params = {}, options = {}) {
      const id = `c${components.length}`;
      const prefix = registry.get(type)?.namePrefix ?? '?';
      const count = (prefixCount.get(prefix) ?? 0) + 1;
      prefixCount.set(prefix, count);
      components.push({ id, type, name: options.name ?? `${prefix}${count}`, terminals: [...terminals], params: { ...params } });
      return id;
    },
    build(omega = 0) {
      const circuit: Circuit = { omega, nodes: [...nodes], components: [...components] };
      const issues = validateCircuit(circuit, registry);
      if (issues.length > 0) throw new CircuitValidationError(issues);
      return deepFreeze(structuredClone(circuit));
    },
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
