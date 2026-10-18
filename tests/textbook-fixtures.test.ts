// The M1 gate: the solver must match every textbook fixture. Expected values
// come from tests/fixtures/textbook-circuits.ts, derived exactly without MNA.
// Comparison rule: tests/support/compare.ts (relative, with a floor scaled to
// the largest quantity of the same kind in the circuit).

import { describe, expect, it } from 'vitest';
import { type Complex, abs, sub } from '../src/core/complex';
import type { Solution } from '../src/core/model';
import { solve } from '../src/solver/mna';
import { allowedError, scaleFor } from './support/compare';
import { describeExpectation, describeWiring } from './support/describe-circuit';
import { type Expectation, type Fixture, TEXTBOOK_FIXTURES } from './fixtures/textbook-circuits';

function actual(s: Solution, e: Expectation): Complex | null | undefined {
  if (e.kind === 'node-voltage') return s.nodeVoltages.get(e.id);
  const r = s.components.get(e.id);
  if (!r) return undefined;
  return e.kind === 'current' ? r.current : e.kind === 'voltage' ? r.voltage : r.power;
}

const byName = (name: string): Fixture => {
  const f = TEXTBOOK_FIXTURES.find((x) => x.name === name);
  if (!f) throw new Error(`No fixture "${name}"`);
  return f;
};

describe('textbook fixtures', () => {
  it(`there are at least 10 (now ${TEXTBOOK_FIXTURES.length})`, () => {
    expect(TEXTBOOK_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  for (const f of TEXTBOOK_FIXTURES) {
    describe(`[${f.category}] ${f.name} — ${f.method}`, () => {
      const result = solve(f.circuit);

      it(`wiring: ${describeWiring(f.circuit)}`, () => {
        // The hand-written wiring (used by the derivation comments) must match the solved circuit.
        expect(describeWiring(f.circuit)).toBe(f.wiring);
      });

      it(`solves and passes every self-check${result.ok ? ` (condition number ${result.solution.checks.conditionNumber.toPrecision(3)})` : ''}`, () => {
        expect(result.ok ? 'ok' : result.failure).toBe('ok');
      });

      for (const e of f.expect) {
        it(describeExpectation(f.circuit, e), () => {
          if (!result.ok) throw new Error('No solution');
          const got = actual(result.solution, e);
          expect(got).toBeDefined();
          expect(got).not.toBeNull();
          const want = { re: e.value.toNumber(), im: 0 };
          const err = abs(sub(got as Complex, want));
          expect(err).toBeLessThanOrEqual(allowedError(want, scaleFor(result.solution, e.kind)));
        });
      }
    });
  }
});

describe('fixture pairs change the way the math says they should (item A6)', () => {
  it('reversing V3 (3 V) in the single loop changes the loop current by 2·3 V / 10 Ω = 3/5 A', () => {
    const before = solve(byName('Single-loop KVL with two opposing sources').circuit);
    const after = solve(byName('Single-loop KVL, V3 reversed (now aiding)').circuit);
    if (!before.ok || !after.ok) throw new Error('No solution');
    // R1 is c1 in both circuits.
    const delta = sub(after.solution.components.get('c1')!.current!, before.solution.components.get('c1')!.current!);
    expect(Math.abs(delta.re - 0.6)).toBeLessThanOrEqual(1e-12);
    expect(delta.im).toBe(0);
  });

  it('moving ground leaves every current unchanged and shifts every node voltage by the same amount', () => {
    const before = solve(byName('Two-loop circuit with two voltage sources').circuit);
    const after = solve(byName('Two-loop circuit with ground moved to the middle node').circuit);
    if (!before.ok || !after.ok) throw new Error('No solution');
    // Same parts (c0..c4) and the same drawn points (n0..n3) in both circuits.
    for (const [id, r] of before.solution.components) {
      const moved = after.solution.components.get(id)!;
      expect(abs(sub(moved.current!, r.current!))).toBeLessThanOrEqual(1e-12);
    }
    const shift = before.solution.nodeVoltages.get('n2')!; // the point that became ground
    for (const [point, v] of before.solution.nodeVoltages) {
      const expected = sub(v, shift);
      expect(abs(sub(after.solution.nodeVoltages.get(point)!, expected))).toBeLessThanOrEqual(1e-12);
    }
  });
});
