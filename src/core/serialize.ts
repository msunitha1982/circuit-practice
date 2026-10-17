// Canonical serialization: object keys in sorted order, numbers as their
// shortest round-trip text (format.ts canonicalNumber), no whitespace. The same
// value always gives byte-identical text, so serialized problems can be pinned
// in tests and compared across runs and browsers.

import type { Complex } from './complex';
import { CircuitValidationError, deepFreeze, validateCircuit } from './circuit';
import { canonicalNumber } from './format';
import type { Circuit, CircuitNode, Component, ComponentParams, ParamValue, Solution } from './model';
import { isComplexValue } from './params';
import type { ComponentRegistry } from './registry';

export type Canonical =
  | null
  | boolean
  | number
  | string
  | readonly Canonical[]
  | { readonly [key: string]: Canonical }
  | ReadonlyMap<string, Canonical>;

/** Canonical JSON text. Throws on non-finite numbers and on undefined values. */
export function canonicalize(value: Canonical): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${(value as readonly Canonical[]).map(canonicalize).join(',')}]`;
  const entries: [string, Canonical][] =
    value instanceof Map ? [...(value as ReadonlyMap<string, Canonical>)] : Object.entries(value);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => {
      if (v === undefined) throw new TypeError(`Cannot serialize undefined at key "${k}"`);
      return `${JSON.stringify(k)}:${canonicalize(v)}`;
    })
    .join(',')}}`;
}

export const CIRCUIT_FORMAT = 'circuit/1';

export function serializeCircuit(circuit: Circuit): string {
  return canonicalize({
    format: CIRCUIT_FORMAT,
    omega: circuit.omega,
    nodes: circuit.nodes.map((n) => ({ id: n.id, isGround: n.isGround })),
    components: circuit.components.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      terminals: c.terminals,
      params: c.params as { readonly [key: string]: Canonical },
    })),
  });
}

export class CircuitParseError extends Error {
  constructor(detail: string) {
    super(`Cannot read circuit: ${detail}`);
    this.name = 'CircuitParseError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readParamValue(v: unknown, where: string): ParamValue {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (isComplexValue(v)) return { re: v.re, im: v.im };
  throw new CircuitParseError(`bad param value at ${where}`);
}

/** Reads text from serializeCircuit, validates it, and returns a deep-frozen Circuit. */
export function parseCircuit(text: string, registry: ComponentRegistry): Circuit {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CircuitParseError('not valid JSON');
  }
  if (!isRecord(raw) || raw['format'] !== CIRCUIT_FORMAT) throw new CircuitParseError('unknown format');
  const { omega, nodes, components } = raw;
  if (typeof omega !== 'number' || !Array.isArray(nodes) || !Array.isArray(components)) {
    throw new CircuitParseError('missing omega, nodes or components');
  }
  const parsedNodes: CircuitNode[] = nodes.map((n, i) => {
    if (!isRecord(n) || typeof n['id'] !== 'string' || typeof n['isGround'] !== 'boolean') {
      throw new CircuitParseError(`bad node ${i}`);
    }
    return { id: n['id'], isGround: n['isGround'] };
  });
  const parsedComponents: Component[] = components.map((c, i) => {
    if (
      !isRecord(c) || typeof c['id'] !== 'string' || typeof c['type'] !== 'string' ||
      typeof c['name'] !== 'string' || !Array.isArray(c['terminals']) || !isRecord(c['params']) ||
      !c['terminals'].every((t) => typeof t === 'string')
    ) {
      throw new CircuitParseError(`bad component ${i}`);
    }
    const params: Record<string, ParamValue> = {};
    for (const [k, v] of Object.entries(c['params'])) params[k] = readParamValue(v, `component ${i} "${k}"`);
    return {
      id: c['id'], type: c['type'], name: c['name'],
      terminals: c['terminals'] as string[], params: params as ComponentParams,
    };
  });
  const circuit: Circuit = { omega, nodes: parsedNodes, components: parsedComponents };
  const issues = validateCircuit(circuit, registry);
  if (issues.length > 0) throw new CircuitValidationError(issues);
  return deepFreeze(circuit);
}

const cx = (c: Complex): Canonical => ({ re: c.re, im: c.im });
const cxOrNull = (c: Complex | null): Canonical => (c === null ? null : cx(c));

/** Canonical text of a Solution (one way; used to pin solver output in tests). */
export function serializeSolution(solution: Solution): string {
  return canonicalize({
    omega: solution.omega,
    nodeVoltages: new Map([...solution.nodeVoltages].map(([id, v]) => [id, cx(v)])),
    components: new Map(
      [...solution.components].map(([id, r]) => [
        id,
        {
          terminalVoltages: r.terminalVoltages.map(cx),
          terminalCurrents: r.terminalCurrents.map(cx),
          voltage: cxOrNull(r.voltage),
          current: cxOrNull(r.current),
          power: cx(r.power),
        },
      ]),
    ),
    checks: { ...solution.checks },
  });
}
