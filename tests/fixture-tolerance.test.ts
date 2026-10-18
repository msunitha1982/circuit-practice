// Item D: the fixture comparison must be relative, with a floor scaled to the
// largest quantity in the circuit, so it cannot pass a wrong microamp answer.

import { describe, expect, it } from 'vitest';
import { abs, complex, sub } from '../src/core/complex';
import { solve } from '../src/solver/mna';
import { FLOOR, RELATIVE, allowedError, scaleFor, withinTolerance } from './support/compare';
import { TEXTBOOK_FIXTURES } from './fixtures/textbook-circuits';

describe('fixture comparison rule', () => {
  it(`is |got − want| ≤ ${RELATIVE}·|want| + ${FLOOR}·(largest same-kind quantity in the circuit)`, () => {
    expect(allowedError(complex(2), 10)).toBe(RELATIVE * 2 + FLOOR * 10);
  });

  it('accepts an exactly-zero expected value only within the scaled floor', () => {
    expect(withinTolerance(complex(1e-19), complex(0), 1)).toBe(true);
    expect(withinTolerance(complex(1e-9), complex(0), 1)).toBe(false);
  });

  const fixture = TEXTBOOK_FIXTURES.find((f) => f.name.startsWith('Mixed magnitudes'))!;
  const result = solve(fixture.circuit);
  if (!result.ok) throw new Error('Mixed-magnitudes fixture did not solve');
  const solution = result.solution;
  const iR3 = fixture.expect.find((e) => e.kind === 'current' && e.id === 'c3')!; // I(R3), about 4.9 µA
  const exact = complex(iR3.value.toNumber());
  const got = solution.components.get('c3')!.current!;
  const scale = scaleFor(solution, 'current');

  it(`the microamp answer I(R3) ≈ ${(exact.re * 1e6).toPrecision(5)} µA matches its exact value`, () => {
    expect(withinTolerance(got, exact, scale)).toBe(true);
  });

  it('an expected value wrong by 1e-6 relative is caught (microamp scale)', () => {
    const wrong = complex(exact.re * (1 + 1e-6));
    expect(withinTolerance(got, wrong, scale)).toBe(false);
    // A bare absolute 1e-9 tolerance would have passed it: the error is only about 5e-12 A.
    expect(abs(sub(got, wrong))).toBeLessThan(1e-9);
  });

  it('an expected value wrong by 1e-6 relative is caught in an all-microamp circuit too', () => {
    const tiny = TEXTBOOK_FIXTURES.find((f) => f.name.startsWith('Wide value ratio'))!;
    const r = solve(tiny.circuit);
    if (!r.ok) throw new Error('Wide-ratio fixture did not solve');
    const e = tiny.expect.find((x) => x.kind === 'current' && x.id === 'c2')!; // I(R2), about 2 µA
    const g = r.solution.components.get('c2')!.current!;
    const s = scaleFor(r.solution, 'current');
    expect(withinTolerance(g, complex(e.value.toNumber()), s)).toBe(true);
    expect(withinTolerance(g, complex(e.value.toNumber() * (1 + 1e-6)), s)).toBe(false);
  });
});
