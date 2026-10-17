// Component plugin interface and registry. Adding a component type means
// writing one ComponentType entry and listing it; no core logic changes.

import type { Complex } from './complex';
import type { UnitSymbol } from './format';
import type { Component, ComponentId, ComponentParams, ComponentTypeId } from './model';
import type { LinearExpr, Stamper } from './stamp';

export interface TerminalDef {
  /** "a", "b", "in+", "out", ... Two-terminal parts use "a" and "b" (reference direction a → b). */
  readonly name: string;
}

export type ParamKind = 'positive-real' | 'real' | 'complex' | 'component-ref' | 'boolean';
export type ParamSchema = Readonly<Record<string, { readonly kind: ParamKind; readonly optional?: boolean }>>;

/** How the part behaves topologically. The generator (M2) derives validity rules from this. */
export type ElectricalRole =
  | 'impedance' // R, C, L
  | 'voltage-defined' // V source, VCVS, CCVS: no loop made only of these (wires included)
  | 'current-defined' // I source, VCCS, CCCS: no cut set made only of these
  | 'connector' // wire: joins two points into one electrical node
  | 'reference' // ground marker: stamps nothing
  | 'multiport'; // op amp, transformer: rules supplied by the part itself

/** What a part knows about itself when writing equations. */
export interface BranchContext {
  readonly omega: number;
  readonly params: ComponentParams;
  /** Unknown index of each terminal's node voltage; null if that terminal is on ground. */
  readonly terminals: readonly (number | null)[];
  /** Unknown indices of this part's own extra unknowns, in declared order. */
  readonly extras: readonly number[];
}

export interface StampContext extends BranchContext {
  /**
   * The a → b current through another part, written in terms of the solver
   * unknowns (from that part's branchCurrent). Used by current-controlled
   * sources. Throws if that part has no single branch current.
   */
  currentOf(id: ComponentId): LinearExpr;
  /** The previous iterate for nonlinear solves (later). Null for linear solves. */
  readonly previous: readonly Complex[] | null;
}

/** What a part sees after the solve, for its own V, I, P and the independent self-checks. */
export interface ResultContext {
  readonly omega: number;
  readonly params: ComponentParams;
  readonly terminalVoltages: readonly Complex[];
  /** Solved values of this part's own extra unknowns. */
  readonly extras: readonly Complex[];
  /** The a → b current of another part, from that part's own relation (not the matrix). */
  currentOf(id: ComponentId): Complex;
}

/** Drawing as data only (decision D6). Empty in M1, filled in M2. */
export interface SymbolPoint {
  readonly x: number;
  readonly y: number;
}
export type SymbolPrimitive =
  | { readonly kind: 'line'; readonly points: readonly SymbolPoint[] }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: 'text'; readonly x: number; readonly y: number; readonly text: string };
export interface SymbolData {
  /** Terminal anchor points on the unit grid, one per terminal. */
  readonly anchors: readonly SymbolPoint[];
  readonly primitives: readonly SymbolPrimitive[];
}

export interface ComponentType {
  readonly typeId: ComponentTypeId;
  readonly status: 'available' | 'reserved';
  /** Key into the strings table, e.g. "component.resistor". No English in core. */
  readonly nameKey: string;
  /** "R" gives R1, R2, ... */
  readonly namePrefix: string;
  /** Any count: ground 1, resistor 2, op amp 3, VCVS 4, ... */
  readonly terminals: readonly TerminalDef[];
  readonly params: ParamSchema;
  readonly role: ElectricalRole;
  /** Which param is shown on the label, and its unit. Formatting itself is done by format.ts. */
  readonly label: { readonly param: string; readonly unit: UnitSymbol } | null;
  /** Number of extra MNA unknowns (for example a branch current). */
  readonly extraUnknowns: number;
  /** Adds this part's contribution to A·x = z. */
  stamp(ctx: StampContext, out: Stamper): void;
  /**
   * The a → b current through this part as a linear combination of solver
   * unknowns (resistor: (Va − Vb)/R; voltage source: its extra unknown).
   * Absent for parts with no single branch current (ground, op amp).
   */
  branchCurrent?(ctx: BranchContext): LinearExpr;
  /** Current into the part at each terminal, from the part's OWN relation (V/R, source value, or its solved extra unknown). */
  terminalCurrents(ctx: ResultContext): readonly Complex[];
  /** Residuals of constraints the part imposes (voltage source: V(a) − V(b) − value). */
  constraintResiduals?(ctx: ResultContext): readonly Complex[];
  /** Type-specific checks beyond the param schema. Returns problem descriptions (developer-facing). */
  validate?(component: Component): readonly string[];
  /** Nonlinear hook (later): stamps the linearized model around ctx.previous. The M1 solver refuses parts that have it. */
  readonly linearize?: (ctx: StampContext, out: Stamper) => void;
  readonly symbol?: SymbolData;
}

export interface ComponentRegistry {
  get(typeId: ComponentTypeId): ComponentType | undefined;
  /** Throws if the type is not registered. */
  require(typeId: ComponentTypeId): ComponentType;
  list(): readonly ComponentType[];
}

/** Throws on a duplicate typeId or a terminal-count/anchor mismatch. */
export function createRegistry(types: readonly ComponentType[]): ComponentRegistry {
  const byId = new Map<ComponentTypeId, ComponentType>();
  for (const t of types) {
    if (byId.has(t.typeId)) throw new Error(`Duplicate component type "${t.typeId}"`);
    if (t.terminals.length < 1) throw new Error(`Component type "${t.typeId}" has no terminals`);
    if (t.symbol && t.symbol.anchors.length !== t.terminals.length) {
      throw new Error(`Component type "${t.typeId}" symbol anchors do not match its terminals`);
    }
    byId.set(t.typeId, t);
  }
  const list = Object.freeze([...byId.values()]);
  return {
    get: (id) => byId.get(id),
    require(id) {
      const t = byId.get(id);
      if (!t) throw new Error(`Unknown component type "${id}"`);
      return t;
    },
    list: () => list,
  };
}
