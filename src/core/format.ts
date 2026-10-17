// The ONE module for number formatting, engineering prefixes, significant
// figures and unit parsing. Nothing else in src/ may call toFixed,
// toPrecision or Intl.NumberFormat (enforced by tests/rules.test.ts).
//
// Determinism: digits come from Number.prototype.toExponential and parsing from
// Number(), both exactly specified by ECMAScript, so output is identical in
// every engine. Powers of ten are applied by editing the exponent text, never
// with engine-dependent power or logarithm functions.

// ---------------------------------------------------------------------------
// Units and prefixes (data tables)

export type UnitSymbol = 'V' | 'A' | 'W' | 'Ω';

interface UnitDef {
  readonly symbol: UnitSymbol;
  /** Spellings matched exactly. */
  readonly exact: readonly string[];
  /** Spellings matched ignoring case. */
  readonly anyCase: readonly string[];
}

// Ω is GREEK CAPITAL LETTER OMEGA (U+03A9); Ω is OHM SIGN (U+2126).
// Single-letter unit symbols are also accepted in lower case ("5v", "2ma"),
// since no supported prefix uses those letters.
const UNITS: readonly UnitDef[] = [
  { symbol: 'V', exact: ['V', 'v'], anyCase: ['volt', 'volts'] },
  { symbol: 'A', exact: ['A', 'a'], anyCase: ['amp', 'amps', 'ampere', 'amperes'] },
  { symbol: 'W', exact: ['W', 'w'], anyCase: ['watt', 'watts'] },
  { symbol: 'Ω', exact: ['Ω', 'Ω'], anyCase: ['ohm', 'ohms'] },
];

interface PrefixDef {
  readonly exponent: number;
  /** Symbol used when formatting. */
  readonly symbol: string;
  /** Symbols accepted when parsing (case-sensitive, strict SI except k/K). */
  readonly accepts: readonly string[];
}

const PREFIXES: readonly PrefixDef[] = [
  { exponent: -15, symbol: 'f', accepts: ['f'] },
  { exponent: -12, symbol: 'p', accepts: ['p'] },
  { exponent: -9, symbol: 'n', accepts: ['n'] },
  // μ is GREEK SMALL LETTER MU (U+03BC); µ is MICRO SIGN (U+00B5).
  { exponent: -6, symbol: 'μ', accepts: ['μ', 'µ', 'u'] },
  { exponent: -3, symbol: 'm', accepts: ['m'] },
  { exponent: 0, symbol: '', accepts: [] },
  { exponent: 3, symbol: 'k', accepts: ['k', 'K'] },
  { exponent: 6, symbol: 'M', accepts: ['M'] },
  { exponent: 9, symbol: 'G', accepts: ['G'] },
  { exponent: 12, symbol: 'T', accepts: ['T'] },
];

const MINUS_SIGN = '−';
/** No-break space between number and unit, so "4.7 kΩ" never wraps. */
const NBSP = ' ';

// ---------------------------------------------------------------------------
// Formatting

export type NumberStyle = 'engineering' | 'plain';

export interface FormatOptions {
  /** Significant figures, 1 to 15. Default 3. */
  readonly sigFigs?: number;
  /** Engineering prefixes ("2.50 mA") or plain decimal ("0.00250 A"). Default engineering. */
  readonly style?: NumberStyle;
  /** Drop trailing zeros after the decimal point ("4.7 kΩ" rather than "4.70 kΩ"). Default false. */
  readonly trimZeros?: boolean;
  /** Minus sign character. Default 'unicode' (U+2212). */
  readonly minus?: 'unicode' | 'ascii';
}

interface Digits {
  readonly negative: boolean;
  /** Exactly sigFigs decimal digits, first digit nonzero unless the value is 0. */
  readonly digits: string;
  /** Decimal exponent of the first digit: value = d.ddd × 10^exponent. */
  readonly exponent: number;
}

function toDigits(value: number, sigFigs: number): Digits {
  if (!Number.isFinite(value)) throw new RangeError('Cannot format a non-finite number');
  if (!Number.isInteger(sigFigs) || sigFigs < 1 || sigFigs > 15) {
    throw new RangeError('sigFigs must be an integer from 1 to 15');
  }
  const negative = value < 0;
  const text = Math.abs(value).toExponential(sigFigs - 1); // e.g. "1.00e+3"
  const [mantissa = '', exp = '0'] = text.split('e');
  const digits = mantissa.replace('.', '');
  const isZero = /^0+$/.test(digits);
  return { negative: negative && !isZero, digits, exponent: isZero ? 0 : Number(exp) };
}

function trimFraction(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** Places the decimal point so the integer part has intDigits digits (padding with zeros). */
function placePoint(digits: string, intDigits: number): string {
  if (intDigits <= 0) return `0.${'0'.repeat(-intDigits)}${digits}`;
  if (digits.length <= intDigits) return digits + '0'.repeat(intDigits - digits.length);
  return `${digits.slice(0, intDigits)}.${digits.slice(intDigits)}`;
}

function floorDiv3(n: number): number {
  return Math.floor(n / 3) * 3;
}

/** Formats a number without a unit, e.g. formatNumber(0.0025) === "2.50 m". */
export function formatNumber(value: number, options: FormatOptions = {}): string {
  return formatParts(value, options).join('');
}

/** Formats a quantity with its unit, e.g. formatQuantity(4700, 'Ω', { trimZeros: true }) === "4.7 kΩ". */
export function formatQuantity(value: number, unit: UnitSymbol, options: FormatOptions = {}): string {
  const [sign, number, prefix] = formatParts(value, options);
  return `${sign}${number}${NBSP}${prefix}${unit}`;
}

/** [sign, number, prefix] for one value. */
function formatParts(value: number, options: FormatOptions): [string, string, string] {
  const sigFigs = options.sigFigs ?? 3;
  const { negative, digits, exponent } = toDigits(value, sigFigs);
  const sign = negative ? (options.minus === 'ascii' ? '-' : MINUS_SIGN) : '';
  const tidy = (s: string) => (options.trimZeros ? trimFraction(s) : s);

  if (options.style === 'plain') {
    return [sign, tidy(placePoint(digits, exponent + 1)), ''];
  }
  const engExponent = floorDiv3(exponent);
  const number = tidy(placePoint(digits, exponent - engExponent + 1));
  const prefix = PREFIXES.find((p) => p.exponent === engExponent);
  if (prefix) return [sign, number, prefix.symbol];
  // Outside the prefix table: engineering exponent notation, still a multiple of 3.
  return [sign, `${number}e${engExponent}`, ''];
}

/**
 * Canonical text for a number in serialized data: the shortest string that
 * round-trips (ECMAScript Number::toString). Negative zero becomes "0".
 * Non-finite values are refused.
 */
export function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Cannot serialize a non-finite number');
  return Object.is(value, -0) ? '0' : String(value);
}

// ---------------------------------------------------------------------------
// Parsing

export type ParseError = 'empty' | 'invalid-number' | 'unknown-unit' | 'wrong-unit';

export type ParseResult =
  | { readonly ok: true; readonly value: number; readonly unit: UnitSymbol | null }
  | { readonly ok: false; readonly error: ParseError };

// sign, integer/fraction, optional exponent, then the rest (prefix and unit).
const NUMBER_RE = /^([+\-−]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+\-−]?\d+))?\s*(.*)$/s;

function matchUnit(text: string): UnitSymbol | null {
  for (const u of UNITS) {
    if (u.exact.includes(text)) return u.symbol;
    if (u.anyCase.includes(text.toLowerCase())) return u.symbol;
  }
  return null;
}

function splitSuffix(suffix: string): { exponent: number; unit: UnitSymbol | null } | null {
  if (suffix === '') return { exponent: 0, unit: null };
  const unitOnly = matchUnit(suffix);
  if (unitOnly) return { exponent: 0, unit: unitOnly };
  // Prefix characters are one code point long.
  const first = String.fromCodePoint(suffix.codePointAt(0) ?? 0);
  const prefix = PREFIXES.find((p) => p.accepts.includes(first));
  if (!prefix) return null;
  const rest = suffix.slice(first.length);
  if (rest === '') return { exponent: prefix.exponent, unit: null };
  const unit = matchUnit(rest);
  return unit ? { exponent: prefix.exponent, unit } : null;
}

const toAsciiMinus = (s: string) => s.replace('−', '-');

/**
 * Parses a quantity typed by a student: "2.5 mA", "0.0025 A", "2.5e-3",
 * "2.5mA", "4.7 kohm", "−3 V". If expectedUnit is given, a different unit is
 * rejected; a missing unit is allowed (the caller decides whether to require it).
 */
export function parseQuantity(text: string, expectedUnit?: UnitSymbol): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  const m = NUMBER_RE.exec(trimmed);
  if (!m) return { ok: false, error: 'invalid-number' };
  const [, sign = '', mantissa = '', exp = '0', suffix = ''] = m;
  const parts = splitSuffix(suffix.trim());
  if (!parts) return { ok: false, error: /^[\d.,\s]/.test(suffix) ? 'invalid-number' : 'unknown-unit' };
  // Apply the prefix by adding to the exponent text, so "2.5 mA" and "0.0025"
  // give the identical double.
  const exponent = Number(toAsciiMinus(exp)) + parts.exponent;
  const value = Number(`${toAsciiMinus(sign)}${mantissa}e${exponent}`);
  if (!Number.isFinite(value)) return { ok: false, error: 'invalid-number' };
  if (expectedUnit && parts.unit && parts.unit !== expectedUnit) return { ok: false, error: 'wrong-unit' };
  return { ok: true, value: Object.is(value, -0) ? 0 : value, unit: parts.unit };
}
