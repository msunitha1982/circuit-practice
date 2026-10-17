import { ONE, sub } from '../complex';
import type { ComponentType } from '../registry';
import { linearExpr, stampBranchCurrent, voltageTerms } from '../stamp';
import { TWO_TERMINALS, at, throughCurrent } from './two-terminal';

/**
 * Ideal wire, solved as a 0 V source so its current is known (decision D7).
 * For equation counting and node labels, wires are merged away (topology.ts).
 */
export const wire: ComponentType = {
  typeId: 'wire',
  status: 'available',
  nameKey: 'component.wire',
  namePrefix: 'W',
  terminals: TWO_TERMINALS,
  params: {},
  role: 'connector',
  label: null,
  extraUnknowns: 1,
  stamp(ctx, out) {
    const a = at(ctx.terminals, 0);
    const b = at(ctx.terminals, 1);
    const k = at(ctx.extras, 0);
    stampBranchCurrent(out, a, b, linearExpr([{ index: k, coeff: ONE }]));
    for (const t of voltageTerms(a, b, ONE)) out.addA(k, t.index, t.coeff);
  },
  branchCurrent: (ctx) => linearExpr([{ index: at(ctx.extras, 0), coeff: ONE }]),
  terminalCurrents: (ctx) => throughCurrent(at(ctx.extras, 0)),
  constraintResiduals: (ctx) => [sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1))],
};
