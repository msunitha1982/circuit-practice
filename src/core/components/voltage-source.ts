import { ONE, sub } from '../complex';
import { complexParam } from '../params';
import type { ComponentType } from '../registry';
import { linearExpr, stampBranchCurrent, voltageTerms } from '../stamp';
import { TWO_TERMINALS, at, throughCurrent } from './two-terminal';

/**
 * Ideal independent voltage source: V(a) − V(b) = voltage. Terminal a is the
 * + terminal. Its a → b current is an extra unknown. Under the passive sign
 * convention a source delivering power has negative absorbed power.
 */
export const voltageSource: ComponentType = {
  typeId: 'vsource',
  status: 'available',
  nameKey: 'component.vsource',
  namePrefix: 'V',
  terminals: TWO_TERMINALS,
  params: { voltage: { kind: 'complex' } },
  role: 'voltage-defined',
  label: { param: 'voltage', unit: 'V' },
  extraUnknowns: 1,
  stamp(ctx, out) {
    const a = at(ctx.terminals, 0);
    const b = at(ctx.terminals, 1);
    const k = at(ctx.extras, 0);
    stampBranchCurrent(out, a, b, linearExpr([{ index: k, coeff: ONE }]));
    for (const t of voltageTerms(a, b, ONE)) out.addA(k, t.index, t.coeff);
    out.addZ(k, complexParam(ctx.params, 'voltage'));
  },
  branchCurrent: (ctx) => linearExpr([{ index: at(ctx.extras, 0), coeff: ONE }]),
  terminalCurrents: (ctx) => throughCurrent(at(ctx.extras, 0)),
  constraintResiduals(ctx) {
    const v = sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1));
    return [sub(v, complexParam(ctx.params, 'voltage'))];
  },
};
