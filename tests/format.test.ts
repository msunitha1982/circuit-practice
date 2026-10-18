import { describe, expect, it } from 'vitest';
import {
  type FormatOptions, type UnitSymbol, canonicalNumber, formatNumber, formatQuantity, parseQuantity,
} from '../src/core/format';
import { createRng } from '../src/core/rng';

const NBSP = ' ';
const MINUS = '−';
// Write expected strings with ordinary spaces and hyphen-minus for readability.
const show = (s: string) => s.replace(/ /g, NBSP).replace(/^-/, MINUS);

describe('formatQuantity, engineering style (default 3 significant figures)', () => {
  const cases: [number, UnitSymbol, string][] = [
    [0.0025, 'A', '2.50 mA'],
    [2.5, 'V', '2.50 V'],
    [12, 'V', '12.0 V'],
    [100, 'Ω', '100 Ω'],
    [4700, 'Ω', '4.70 kΩ'],
    [47000, 'Ω', '47.0 kΩ'],
    [470000, 'Ω', '470 kΩ'],
    [1e6, 'Ω', '1.00 MΩ'],
    [2.2e-6, 'A', '2.20 μA'],
    [3.3e-9, 'A', '3.30 nA'],
    [1e-12, 'A', '1.00 pA'],
    [1e-15, 'A', '1.00 fA'],
    [5e12, 'W', '5.00 TW'],
    [0.5, 'W', '500 mW'],
    [0.999, 'A', '999 mA'],
    [-0.0025, 'A', '-2.50 mA'],
    [0, 'V', '0.00 V'],
    [-0, 'V', '0.00 V'],
    // Rounding that crosses a prefix boundary.
    [999.96, 'V', '1.00 kV'],
    [999.4, 'V', '999 V'],
    [0.00099996, 'A', '1.00 mA'],
    [123456, 'Ω', '123 kΩ'],
    // Outside the prefix table: exponent stays a multiple of 3.
    [1e-16, 'A', '100e-18 A'],
    [1e15, 'W', '1.00e15 W'],
  ];
  for (const [value, unit, expected] of cases) {
    // Object.is distinguishes −0, which String() would print as "0" and duplicate the title.
    it(`${Object.is(value, -0) ? '-0' : value} ${unit} -> "${expected}"`, () => {
      expect(formatQuantity(value, unit)).toBe(show(expected));
    });
  }
});

describe('formatQuantity options', () => {
  const cases: [number, UnitSymbol, FormatOptions, string][] = [
    [4700, 'Ω', { trimZeros: true }, '4.7 kΩ'],
    [1000, 'Ω', { trimZeros: true }, '1 kΩ'],
    [100, 'Ω', { trimZeros: true }, '100 Ω'],
    [0.0025, 'A', { sigFigs: 2 }, '2.5 mA'],
    [0.0025, 'A', { sigFigs: 4 }, '2.500 mA'],
    [1e5, 'Ω', { sigFigs: 1 }, '100 kΩ'],
    [0.0025, 'A', { style: 'plain' }, '0.00250 A'],
    [1234567, 'Ω', { style: 'plain' }, '1230000 Ω'],
    [12.345, 'V', { style: 'plain' }, '12.3 V'],
    [0, 'V', { style: 'plain' }, '0.00 V'],
    [0.0025, 'A', { style: 'plain', trimZeros: true }, '0.0025 A'],
  ];
  for (const [value, unit, options, expected] of cases) {
    it(`${value} ${unit} ${JSON.stringify(options)} -> "${expected}"`, () => {
      expect(formatQuantity(value, unit, options)).toBe(show(expected));
    });
  }

  it('can use an ASCII minus sign', () => {
    expect(formatQuantity(-2, 'V', { minus: 'ascii' })).toBe(`-2.00${NBSP}V`);
  });

  it('formatNumber has no unit or space', () => {
    expect(formatNumber(0.0025)).toBe('2.50m');
    expect(formatNumber(12)).toBe('12.0');
  });

  it('refuses non-finite values and bad significant figures', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatNumber(1, { sigFigs: 0 })).toThrow(RangeError);
    expect(() => formatNumber(1, { sigFigs: 16 })).toThrow(RangeError);
  });
});

describe('canonicalNumber', () => {
  it('gives the shortest round-trip text', () => {
    expect(canonicalNumber(0.1)).toBe('0.1');
    expect(canonicalNumber(1 / 3)).toBe('0.3333333333333333');
    expect(canonicalNumber(4700)).toBe('4700');
    expect(canonicalNumber(1e-7)).toBe('1e-7');
    expect(canonicalNumber(-0)).toBe('0');
    expect(() => canonicalNumber(Number.NaN)).toThrow(RangeError);
  });
});

describe('parseQuantity accepts equivalent forms', () => {
  const cases: [string, number, UnitSymbol | null][] = [
    // The spec's three examples are the identical number.
    ['2.5 mA', 0.0025, 'A'],
    ['0.0025 A', 0.0025, 'A'],
    ['2.5e-3', 0.0025, null],
    // No space, and other spacing.
    ['2.5mA', 0.0025, 'A'],
    ['  2.5   mA  ', 0.0025, 'A'],
    [`2.5${NBSP}mA`, 0.0025, 'A'],
    // Strict SI case for m and M; k and K both kilo.
    ['5 mV', 0.005, 'V'],
    ['5 MV', 5e6, 'V'],
    ['4.7k', 4700, null],
    ['4.7K', 4700, null],
    ['4.7 kΩ', 4700, 'Ω'],
    ['4.7 KΩ', 4700, 'Ω'],
    ['1 MΩ', 1e6, 'Ω'],
    ['1 mΩ', 0.001, 'Ω'],
    // Both omega code points, and spelled-out ohms.
    ['10 Ω', 10, 'Ω'],
    ['10 Ω', 10, 'Ω'],
    ['10 ohm', 10, 'Ω'],
    ['10 ohms', 10, 'Ω'],
    ['10 Ohms', 10, 'Ω'],
    ['2.2kohm', 2200, 'Ω'],
    ['2.2 Mohms', 2.2e6, 'Ω'],
    // Micro: u, micro sign, Greek mu.
    ['3 uA', 3e-6, 'A'],
    ['3 µA', 3e-6, 'A'],
    ['3 μA', 3e-6, 'A'],
    // Minus signs: hyphen-minus and Unicode minus, also in the exponent.
    ['-3 V', -3, 'V'],
    ['−3 V', -3, 'V'],
    ['2.5e−3', 0.0025, null],
    ['+3 V', 3, 'V'],
    // Number shapes.
    ['.5', 0.5, null],
    ['5.', 5, null],
    ['1E3', 1000, null],
    ['1e3 m', 1, null],
    ['0', 0, null],
    ['-0', 0, null],
    // Lower-case unit letters.
    ['5v', 5, 'V'],
    ['2.5ma', 0.0025, 'A'],
    ['3 w', 3, 'W'],
    ['3 volts', 3, 'V'],
    ['3 amps', 3, 'A'],
  ];
  for (const [text, value, unit] of cases) {
    it(`"${text}" -> ${value} ${unit ?? '(no unit)'}`, () => {
      expect(parseQuantity(text)).toEqual({ ok: true, value, unit });
    });
  }

  it('applies prefixes exactly: "2.5 mA" and "0.0025" are the same double', () => {
    const a = parseQuantity('2.5 mA');
    const b = parseQuantity('0.0025');
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
  });
});

describe('parseQuantity rejects bad input', () => {
  const cases: [string, string][] = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid-number'],
    ['mA', 'invalid-number'],
    ['1,000', 'invalid-number'],
    ['1 000', 'invalid-number'],
    ['1.2.3', 'invalid-number'],
    ['--3', 'invalid-number'],
    ['1e999', 'invalid-number'],
    ['5 X', 'unknown-unit'],
    ['5 m A', 'unknown-unit'],
    ['5 kk', 'unknown-unit'],
    ['5 Hz', 'unknown-unit'],
    ['5 mohmz', 'unknown-unit'],
  ];
  for (const [text, error] of cases) {
    it(`"${text}" -> ${error}`, () => {
      expect(parseQuantity(text)).toEqual({ ok: false, error });
    });
  }

  it('rejects a different unit than expected, but allows a missing unit', () => {
    expect(parseQuantity('2.5 mV', 'A')).toEqual({ ok: false, error: 'wrong-unit' });
    expect(parseQuantity('2.5 mA', 'A')).toEqual({ ok: true, value: 0.0025, unit: 'A' });
    expect(parseQuantity('2.5m', 'A')).toEqual({ ok: true, value: 0.0025, unit: null });
  });
});

describe('format then parse round trip', () => {
  it('recovers each value to within its significant-figure rounding', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 2000; i++) {
      const exponent = rng.int(-14, 13);
      const value = (rng.next() * 9 + 1) * Number(`1e${exponent}`) * (rng.chance(0.5) ? -1 : 1);
      for (const style of ['engineering', 'plain'] as const) {
        const text = formatQuantity(value, 'V', { sigFigs: 6, style });
        const parsed = parseQuantity(text, 'V');
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(Math.abs(value) * 5e-6);
      }
    }
  });
});
