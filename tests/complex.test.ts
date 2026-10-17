import { describe, expect, it } from 'vitest';
import {
  J, ONE, ZERO, abs, abs2, add, approxEqual, complex, conj, div, inv, isFiniteComplex, isZero,
  mul, neg, scale, sub,
} from '../src/core/complex';

describe('complex arithmetic', () => {
  const a = complex(3, 4);
  const b = complex(1, -2);

  it('adds, subtracts, negates and scales', () => {
    expect(add(a, b)).toEqual(complex(4, 2));
    expect(sub(a, b)).toEqual(complex(2, 6));
    expect(neg(a)).toEqual(complex(-3, -4));
    expect(scale(a, 2)).toEqual(complex(6, 8));
  });

  it('multiplies: (3+4j)(1-2j) = 11-2j, and j*j = -1', () => {
    expect(mul(a, b)).toEqual(complex(11, -2));
    expect(mul(J, J)).toEqual(complex(-1, 0));
  });

  it('divides: (3+4j)/(1-2j) = -1+2j', () => {
    expect(div(a, b)).toEqual(complex(-1, 2));
    // Exercise both branches of Smith's method.
    expect(div(complex(11, -2), complex(3, 4))).toEqual(b);
    // (11-2j)/(4+3j) = (11-2j)(4-3j)/25 = (38-41j)/25
    expect(approxEqual(div(complex(11, -2), complex(4, 3)), complex(38 / 25, -41 / 25), 1e-15)).toBe(true);
  });

  it('division undoes multiplication across many values', () => {
    for (let re = -3; re <= 3; re++) {
      for (let im = -3; im <= 3; im++) {
        const z = complex(re + 0.5, im - 0.25);
        expect(approxEqual(div(mul(a, z), z), a, 1e-15)).toBe(true);
      }
    }
  });

  it('throws on division by zero', () => {
    expect(() => div(ONE, ZERO)).toThrow(RangeError);
    expect(() => inv(ZERO)).toThrow(RangeError);
  });

  it('inverts: 1/j = -j', () => {
    expect(inv(J)).toEqual(complex(0, -1));
  });

  it('conjugate, magnitude and squared magnitude', () => {
    expect(conj(a)).toEqual(complex(3, -4));
    expect(abs(a)).toBe(5);
    expect(abs2(a)).toBe(25);
    expect(abs(ZERO)).toBe(0);
    expect(abs(complex(-7, 0))).toBe(7);
  });

  it('magnitude does not overflow or underflow', () => {
    expect(abs(complex(3e200, 4e200))).toBeCloseTo(5e200, -190);
    expect(abs(complex(3e-200, 4e-200)) / 5e-200).toBeCloseTo(1, 12);
  });

  it('a DC value is a complex number with zero imaginary part', () => {
    expect(complex(12)).toEqual({ re: 12, im: 0 });
  });

  it('zero and finiteness checks', () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(complex(0, 1e-300))).toBe(false);
    expect(isFiniteComplex(a)).toBe(true);
    expect(isFiniteComplex(complex(Number.NaN, 0))).toBe(false);
    expect(isFiniteComplex(complex(0, Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('approxEqual uses relative and absolute tolerance', () => {
    expect(approxEqual(complex(1), complex(1 + 1e-12))).toBe(true);
    expect(approxEqual(complex(1), complex(1 + 1e-6))).toBe(false);
    expect(approxEqual(ZERO, complex(1e-15), 1e-9)).toBe(false);
    expect(approxEqual(ZERO, complex(1e-15), 1e-9, 1e-12)).toBe(true);
  });
});
