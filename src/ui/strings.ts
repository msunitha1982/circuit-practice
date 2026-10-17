// Every user-facing string lives here so the site can be translated later.
// English only for now (see docs/decisions.md).

export const strings = {
  siteTitle: 'Circuit Practice',
  placeholderHeading: 'Circuit Practice Generator',
  placeholderBody:
    'This site is under construction. Practice problems will appear here in a later milestone.',
  /** Component display names, keyed by each component type's nameKey. */
  components: {
    'component.resistor': 'Resistor',
    'component.vsource': 'Voltage source',
    'component.isource': 'Current source',
    'component.ground': 'Ground',
    'component.wire': 'Wire',
    'component.capacitor': 'Capacitor',
    'component.inductor': 'Inductor',
    'component.vcvs': 'Voltage-controlled voltage source',
    'component.vccs': 'Voltage-controlled current source',
    'component.ccvs': 'Current-controlled voltage source',
    'component.cccs': 'Current-controlled current source',
    'component.opamp': 'Op amp',
    'component.diode': 'Diode',
    'component.switch': 'Switch',
    'component.transformer': 'Transformer',
  } as Readonly<Record<string, string>>,
} as const;
