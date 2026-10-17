// Typed access to component params. The schema check in circuit.ts has
// already verified kinds, so these throw only on programming errors.

import type { Complex } from './complex';
import type { ComponentParams, ParamValue } from './model';
import type { ParamKind } from './registry';

export function isComplexValue(v: unknown): v is Complex {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as { re?: unknown }).re === 'number' &&
    typeof (v as { im?: unknown }).im === 'number' &&
    Object.keys(v).length === 2
  );
}

/** True if the value has the given kind. */
export function matchesKind(v: ParamValue, kind: ParamKind): boolean {
  switch (kind) {
    case 'positive-real':
      return typeof v === 'number' && Number.isFinite(v) && v > 0;
    case 'real':
      return typeof v === 'number' && Number.isFinite(v);
    case 'complex':
      return isComplexValue(v) && Number.isFinite(v.re) && Number.isFinite(v.im);
    case 'component-ref':
      return typeof v === 'string' && v !== '';
    case 'boolean':
      return typeof v === 'boolean';
  }
}

export function realParam(params: ComponentParams, key: string): number {
  const v = params[key];
  if (typeof v !== 'number') throw new TypeError(`Param "${key}" is not a number`);
  return v;
}

export function complexParam(params: ComponentParams, key: string): Complex {
  const v = params[key];
  if (!isComplexValue(v)) throw new TypeError(`Param "${key}" is not a complex number`);
  return v;
}

export function refParam(params: ComponentParams, key: string): string {
  const v = params[key];
  if (typeof v !== 'string') throw new TypeError(`Param "${key}" is not a component reference`);
  return v;
}
