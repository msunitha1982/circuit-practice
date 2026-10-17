import { ZERO } from '../complex';
import type { ComponentType } from '../registry';

/** Ground marker. One terminal, stamps nothing, and must sit on the ground point (decision D8). */
export const ground: ComponentType = {
  typeId: 'ground',
  status: 'available',
  nameKey: 'component.ground',
  namePrefix: 'GND',
  terminals: [{ name: 'a' }],
  params: {},
  role: 'reference',
  label: null,
  extraUnknowns: 0,
  stamp() {},
  terminalCurrents: () => [ZERO],
};
