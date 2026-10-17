import { complexParam } from '../params';
import type { ComponentType } from '../registry';
import { linearExpr, stampBranchCurrent } from '../stamp';
import { TWO_TERMINALS, at, throughCurrent } from './two-terminal';

/** Ideal independent current source: the current a → b through the source equals `current`. */
export const currentSource: ComponentType = {
  typeId: 'isource',
  status: 'available',
  nameKey: 'component.isource',
  namePrefix: 'I',
  terminals: TWO_TERMINALS,
  params: { current: { kind: 'complex' } },
  role: 'current-defined',
  label: { param: 'current', unit: 'A' },
  extraUnknowns: 0,
  stamp(ctx, out) {
    const i = linearExpr([], complexParam(ctx.params, 'current'));
    stampBranchCurrent(out, at(ctx.terminals, 0), at(ctx.terminals, 1), i);
  },
  branchCurrent: (ctx) => linearExpr([], complexParam(ctx.params, 'current')),
  terminalCurrents: (ctx) => throughCurrent(complexParam(ctx.params, 'current')),
};
