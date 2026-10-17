// Circuit data model: types only. The electrical model never holds layout
// coordinates; the solver's results live in a separate Solution object.

import type { Complex } from './complex';
import type { Seed } from './rng';

export type NodeId = string; // "n0", "n1", ... in builder order
export type ComponentId = string; // "c0", "c1", ... in builder order
export type ComponentTypeId = string;

/** A connection point. Wires join points into electrical nodes (see topology.ts). Points carry no label. */
export interface CircuitNode {
  readonly id: NodeId;
  /** Exactly one point per circuit is ground (decision D8). */
  readonly isGround: boolean;
}

export type ParamValue = number | Complex | string | boolean;
export type ComponentParams = Readonly<Record<string, ParamValue>>;

export interface Component {
  readonly id: ComponentId;
  readonly type: ComponentTypeId;
  /** Display name such as "R1" or "V2". */
  readonly name: string;
  /** Index k is the point connected to the type's terminals[k]. */
  readonly terminals: readonly NodeId[];
  readonly params: ComponentParams;
}

export interface Circuit {
  /** Angular frequency in rad/s. 0 is DC. */
  readonly omega: number;
  readonly nodes: readonly CircuitNode[];
  readonly components: readonly Component[];
}

/** Solver output. Separate from the Circuit, read-only, keyed by id. */
export interface Solution {
  readonly omega: number;
  readonly nodeVoltages: ReadonlyMap<NodeId, Complex>;
  readonly components: ReadonlyMap<ComponentId, ComponentResult>;
  readonly checks: SelfCheckReport;
}

export interface ComponentResult {
  readonly terminalVoltages: readonly Complex[];
  /** Current flowing into the component at each terminal. */
  readonly terminalCurrents: readonly Complex[];
  /** V(a) − V(b). Null unless the component has exactly two terminals. */
  readonly voltage: Complex | null;
  /** Current from a to b through the component. Null unless it has exactly two terminals. */
  readonly current: Complex | null;
  /** Power absorbed, Σ V_k·conj(I_k) (decision D9). Negative real part means it supplies power. */
  readonly power: Complex;
}

export interface SelfCheckReport {
  /** Worst KCL residual, relative to the largest current magnitude. */
  readonly kclWorstResidual: number;
  /** |Σ power absorbed|, relative to the largest power magnitude. */
  readonly powerBalanceResidual: number;
  /** Worst constraint residual (e.g. a source's V(a) − V(b) against its value), relative. */
  readonly constraintWorstResidual: number;
  readonly conditionNumber: number;
}

/** The unit that is shared, saved and tested. Question and answer are built in M3. */
export interface Problem<Settings = unknown, Question = unknown, Answer = unknown> {
  readonly seed: Seed;
  readonly settings: Settings;
  readonly circuit: Circuit;
  readonly solution: Solution;
  readonly question: Question | null;
  readonly answer: Answer | null;
}
