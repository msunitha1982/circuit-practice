// Shared pieces for two-terminal parts (reference direction a → b).

import { type Complex, neg } from '../complex';
import type { TerminalDef } from '../registry';

export const TWO_TERMINALS: readonly TerminalDef[] = [{ name: 'a' }, { name: 'b' }];

/** Terminal currents for a current I flowing a → b through the part: I enters at a, leaves at b. */
export function throughCurrent(i: Complex): readonly Complex[] {
  return [i, neg(i)];
}

export function at<T>(items: readonly T[], k: number): T {
  const v = items[k];
  if (v === undefined) throw new RangeError(`Missing item ${k}`);
  return v;
}
