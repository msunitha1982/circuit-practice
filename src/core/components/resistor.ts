import { complex, div, sub } from '../complex';
import { realParam } from '../params';
import type { ComponentType } from '../registry';
import { linearExpr, stampAdmittance, voltageTerms } from '../stamp';
import { TWO_TERMINALS, at, throughCurrent } from './two-terminal';

/** Ideal resistor. Current a → b is (V(a) − V(b)) / R. */
export const resistor: ComponentType = {
  typeId: 'resistor',
  status: 'available',
  nameKey: 'component.resistor',
  namePrefix: 'R',
  terminals: TWO_TERMINALS,
  params: { resistance: { kind: 'positive-real' } },
  role: 'impedance',
  label: { param: 'resistance', unit: 'Ω' },
  extraUnknowns: 0,
  stamp(ctx, out) {
    stampAdmittance(out, at(ctx.terminals, 0), at(ctx.terminals, 1), complex(1 / realParam(ctx.params, 'resistance')));
  },
  branchCurrent(ctx) {
    const y = complex(1 / realParam(ctx.params, 'resistance'));
    return linearExpr(voltageTerms(at(ctx.terminals, 0), at(ctx.terminals, 1), y));
  },
  terminalCurrents(ctx) {
    const v = sub(at(ctx.terminalVoltages, 0), at(ctx.terminalVoltages, 1));
    return throughCurrent(div(v, complex(realParam(ctx.params, 'resistance'))));
  },
};
