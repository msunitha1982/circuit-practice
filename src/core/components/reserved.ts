// Component types reserved for later milestones. They are listed so their
// ids are taken, but using one is refused ("reserved-type"), and their stamp
// throws if ever reached.

import type { ComponentType, ElectricalRole } from '../registry';

function reserved(typeId: string, namePrefix: string, terminalNames: readonly string[], role: ElectricalRole): ComponentType {
  const notYet = (): never => {
    throw new Error(`Component type "${typeId}" is reserved and not available yet`);
  };
  return {
    typeId,
    status: 'reserved',
    nameKey: `component.${typeId}`,
    namePrefix,
    terminals: terminalNames.map((name) => ({ name })),
    params: {},
    role,
    label: null,
    extraUnknowns: 0,
    stamp: notYet,
    terminalCurrents: notYet,
  };
}

export const RESERVED_COMPONENTS: readonly ComponentType[] = [
  reserved('capacitor', 'C', ['a', 'b'], 'impedance'),
  reserved('inductor', 'L', ['a', 'b'], 'impedance'),
  reserved('vcvs', 'E', ['a', 'b', 'c+', 'c-'], 'voltage-defined'),
  reserved('vccs', 'G', ['a', 'b', 'c+', 'c-'], 'current-defined'),
  reserved('ccvs', 'H', ['a', 'b'], 'voltage-defined'),
  reserved('cccs', 'F', ['a', 'b'], 'current-defined'),
  reserved('opamp', 'U', ['in+', 'in-', 'out'], 'multiport'),
  reserved('diode', 'D', ['a', 'b'], 'impedance'),
  reserved('switch', 'S', ['a', 'b'], 'impedance'),
  reserved('transformer', 'T', ['p+', 'p-', 's+', 's-'], 'multiport'),
];
