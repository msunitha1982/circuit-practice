// The M1 gate: the solver must match every textbook fixture. Expected values
// come from tests/fixtures/textbook-circuits.ts, derived exactly without MNA.

import { describe, expect, it } from 'vitest';
import { type Complex, abs, sub } from '../src/core/complex';
import type { Solution } from '../src/core/model';
import { solve } from '../src/solver/mna';
import { type Expectation, TEXTBOOK_FIXTURES } from './fixtures/textbook-circuits';

/** Relative tolerance, with a tiny absolute floor so an exactly-zero answer can pass. */
const RELATIVE = 1e-9;
const ABSOLUTE_FLOOR = 1e-12;

function actual(s: Solution, e: Expectation): Complex | null | undefined {
  if (e.kind === 'node-voltage') return s.nodeVoltages.get(e.id);
  const r = s.components.get(e.id);
  if (!r) return undefined;
  return e.kind === 'current' ? r.current : e.kind === 'voltage' ? r.voltage : r.power;
}

describe('textbook fixtures', () => {
  it('there are at least 10', () => {
    expect(TEXTBOOK_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  for (const f of TEXTBOOK_FIXTURES) {
    describe(`${f.name} [${f.method}]`, () => {
      const result = solve(f.circuit);

      it('solves and passes every self-check', () => {
        expect(result.ok ? 'ok' : result.failure).toBe('ok');
      });

      for (const e of f.expect) {
        it(`${e.what}  (exact: ${e.value.toString()})`, () => {
          if (!result.ok) throw new Error('No solution');
          const got = actual(result.solution, e);
          expect(got).toBeDefined();
          expect(got).not.toBeNull();
          const want = { re: e.value.toNumber(), im: 0 };
          const err = abs(sub(got as Complex, want));
          expect(err).toBeLessThanOrEqual(RELATIVE * abs(want) + ABSOLUTE_FLOOR);
        });
      }
    });
  }
});
