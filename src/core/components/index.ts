// The list of component plugins. Adding a part = one file plus one line here.

import { createRegistry, type ComponentRegistry, type ComponentType } from '../registry';
import { currentSource } from './current-source';
import { ground } from './ground';
import { RESERVED_COMPONENTS } from './reserved';
import { resistor } from './resistor';
import { voltageSource } from './voltage-source';
import { wire } from './wire';

export { RESERVED_COMPONENTS };

export const V1_COMPONENTS: readonly ComponentType[] = [resistor, voltageSource, currentSource, ground, wire];

export const defaultRegistry: ComponentRegistry = createRegistry([...V1_COMPONENTS, ...RESERVED_COMPONENTS]);
