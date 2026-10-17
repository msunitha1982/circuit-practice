// TEST-ONLY component plugins. They exist to prove that later parts
// (capacitor, inductor, dependent sources, op amp) plug into the public
// interface with no change to any file under src/. Nothing here ships.

import { ONE, ZERO, complex, mul, neg, sub } from '../../src/core/complex';
import { TWO_TERMINALS, at, throughCurrent } from '../../src/core/components/two-terminal';
import { complexParam, realParam, refParam } from '../../src/core/params';
import type { ComponentType } from '../../src/core/registry';
import { linearExpr, scaleExpr, stampAdmittance, stampBranchCurrent, voltageTerms } from '../../src/core/stamp';

/** Capacitor: admittance jωC. At ω = 0 it is an open circuit. */
export const testCapacitor: ComponentType = {
  typeId: 'test.capacitor',
  status: 'available',
  nameKey: 'component.capacitor',
  namePrefix: 'C',
  terminals: TWO_TERMINALS,
  params: { capacitance: { kind: 'positive-real' } },
  role: 'impedance',
  label: null,
  extraUnknowns: 0,
  stamp(ctx, out) {
    stampAdmittance(out, at(ctx.terminals, 0), at(ctx.terminals, 1), complex(0, ctx.omega * realParam(ctx.params, 'capacitance')));
  },
  branchCurrent(ctx) {
    const y = complex(0, ctx.omega * realParam(ctx.params, 'capacitance'));
    return linearExpr(voltageTerms(at(ctx.terminals, 0), at(ctx.terminals, 1), y));
  },
  terminalCurrents(ctx) {
    const y = complex(0, ctx.omega * realParam(ctx.params, 'capacitance'));
    return throughCurrent(mul(y, sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1))));
  },
};

/** Inductor: V(a) − V(b) = jωL·I with I an extra unknown. At ω = 0 it is a short circuit. */
export const testInductor: ComponentType = {
  typeId: 'test.inductor',
  status: 'available',
  nameKey: 'component.inductor',
  namePrefix: 'L',
  terminals: TWO_TERMINALS,
  params: { inductance: { kind: 'positive-real' } },
  role: 'impedance',
  label: null,
  extraUnknowns: 1,
  stamp(ctx, out) {
    const a = at(ctx.terminals, 0);
    const b = at(ctx.terminals, 1);
    const k = at(ctx.extras, 0);
    stampBranchCurrent(out, a, b, linearExpr([{ index: k, coeff: ONE }]));
    for (const t of voltageTerms(a, b, ONE)) out.addA(k, t.index, t.coeff);
    out.addA(k, k, complex(0, -ctx.omega * realParam(ctx.params, 'inductance')));
  },
  branchCurrent: (ctx) => linearExpr([{ index: at(ctx.extras, 0), coeff: ONE }]),
  terminalCurrents: (ctx) => throughCurrent(at(ctx.extras, 0)),
  constraintResiduals(ctx) {
    const z = complex(0, ctx.omega * realParam(ctx.params, 'inductance'));
    const v = sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1));
    return [sub(v, mul(z, at(ctx.extras, 0)))];
  },
};

/** Voltage-controlled voltage source: V(a) − V(b) = gain·(V(c+) − V(c−)). Four terminals. */
export const testVcvs: ComponentType = {
  typeId: 'test.vcvs',
  status: 'available',
  nameKey: 'component.vcvs',
  namePrefix: 'E',
  terminals: [{ name: 'a' }, { name: 'b' }, { name: 'c+' }, { name: 'c-' }],
  params: { gain: { kind: 'complex' } },
  role: 'voltage-defined',
  label: null,
  extraUnknowns: 1,
  stamp(ctx, out) {
    const [a = null, b = null, cp = null, cm = null] = ctx.terminals;
    const k = at(ctx.extras, 0);
    const g = complexParam(ctx.params, 'gain');
    stampBranchCurrent(out, a, b, linearExpr([{ index: k, coeff: ONE }]));
    for (const t of voltageTerms(a, b, ONE)) out.addA(k, t.index, t.coeff);
    for (const t of voltageTerms(cp, cm, neg(g))) out.addA(k, t.index, t.coeff);
  },
  branchCurrent: (ctx) => linearExpr([{ index: at(ctx.extras, 0), coeff: ONE }]),
  terminalCurrents: (ctx) => [...throughCurrent(at(ctx.extras, 0)), ZERO, ZERO],
  constraintResiduals(ctx) {
    const [va = ZERO, vb = ZERO, vcp = ZERO, vcm = ZERO] = ctx.terminalVoltages;
    const g = complexParam(ctx.params, 'gain');
    return [sub(sub(va, vb), mul(g, sub(vcp, vcm)))];
  },
};

/** Current-controlled current source: current a → b = gain × (a → b current of the `control` part). */
export const testCccs: ComponentType = {
  typeId: 'test.cccs',
  status: 'available',
  nameKey: 'component.cccs',
  namePrefix: 'F',
  terminals: TWO_TERMINALS,
  params: { gain: { kind: 'complex' }, control: { kind: 'component-ref' } },
  role: 'current-defined',
  label: null,
  extraUnknowns: 0,
  stamp(ctx, out) {
    const i = scaleExpr(ctx.currentOf(refParam(ctx.params, 'control')), complexParam(ctx.params, 'gain'));
    stampBranchCurrent(out, at(ctx.terminals, 0), at(ctx.terminals, 1), i);
  },
  terminalCurrents(ctx) {
    const i = mul(complexParam(ctx.params, 'gain'), ctx.currentOf(refParam(ctx.params, 'control')));
    return throughCurrent(i);
  },
};

/**
 * Ideal op amp: V(in+) = V(in−), no input current, output current is an extra
 * unknown (current into the op amp at "out"; its supply return is implicit ground).
 */
export const testOpAmp: ComponentType = {
  typeId: 'test.opamp',
  status: 'available',
  nameKey: 'component.opamp',
  namePrefix: 'U',
  terminals: [{ name: 'in+' }, { name: 'in-' }, { name: 'out' }],
  params: {},
  role: 'multiport',
  label: null,
  extraUnknowns: 1,
  stamp(ctx, out) {
    const [inP = null, inM = null, o = null] = ctx.terminals;
    const k = at(ctx.extras, 0);
    out.addA(o, k, ONE);
    for (const t of voltageTerms(inP, inM, ONE)) out.addA(k, t.index, t.coeff);
  },
  terminalCurrents: (ctx) => [ZERO, ZERO, at(ctx.extras, 0)],
  constraintResiduals: (ctx) => [sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1))],
};

/**
 * DELIBERATELY WRONG resistor for the self-check test (item B): its stamp
 * uses twice the correct conductance, while its own V/R relation is right.
 * The independent KCL check must catch the disagreement.
 */
export const testBrokenResistor: ComponentType = {
  typeId: 'test.broken-resistor',
  status: 'available',
  nameKey: 'component.resistor',
  namePrefix: 'RX',
  terminals: TWO_TERMINALS,
  params: { resistance: { kind: 'positive-real' } },
  role: 'impedance',
  label: null,
  extraUnknowns: 0,
  stamp(ctx, out) {
    stampAdmittance(out, at(ctx.terminals, 0), at(ctx.terminals, 1), complex(2 / realParam(ctx.params, 'resistance')));
  },
  terminalCurrents(ctx) {
    const v = sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1));
    return throughCurrent(mul(v, complex(1 / realParam(ctx.params, 'resistance'))));
  },
};

export const TEST_COMPONENTS: readonly ComponentType[] = [
  testCapacitor, testInductor, testVcvs, testCccs, testOpAmp, testBrokenResistor,
];
