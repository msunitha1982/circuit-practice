// Complex numbers. Every circuit value is complex; DC is frequency 0.
// Uses only + - * / and Math.sqrt so results are identical in every JS engine.

export interface Complex {
  readonly re: number;
  readonly im: number;
}

export function complex(re: number, im = 0): Complex {
  return { re, im };
}

export const ZERO: Complex = complex(0, 0);
export const ONE: Complex = complex(1, 0);
export const J: Complex = complex(0, 1);

export function add(a: Complex, b: Complex): Complex {
  return complex(a.re + b.re, a.im + b.im);
}

export function sub(a: Complex, b: Complex): Complex {
  return complex(a.re - b.re, a.im - b.im);
}

export function mul(a: Complex, b: Complex): Complex {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function scale(a: Complex, k: number): Complex {
  return complex(a.re * k, a.im * k);
}

export function neg(a: Complex): Complex {
  return complex(-a.re, -a.im);
}

export function conj(a: Complex): Complex {
  return complex(a.re, -a.im);
}

/** a / b using Smith's method, which avoids overflow and keeps precision. Throws on b = 0. */
export function div(a: Complex, b: Complex): Complex {
  if (b.re === 0 && b.im === 0) throw new RangeError('Complex division by zero');
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re;
    const d = b.re + b.im * r;
    return complex((a.re + a.im * r) / d, (a.im - a.re * r) / d);
  }
  const r = b.re / b.im;
  const d = b.re * r + b.im;
  return complex((a.re * r + a.im) / d, (a.im * r - a.re) / d);
}

export function inv(a: Complex): Complex {
  return div(ONE, a);
}

/** Squared magnitude |a|^2. */
export function abs2(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

/** Magnitude |a|, scaled to avoid overflow and underflow. */
export function abs(a: Complex): number {
  const x = Math.abs(a.re);
  const y = Math.abs(a.im);
  const m = x > y ? x : y;
  if (m === 0) return 0;
  const p = x / m;
  const q = y / m;
  return m * Math.sqrt(p * p + q * q);
}

export function isZero(a: Complex): boolean {
  return a.re === 0 && a.im === 0;
}

export function isFiniteComplex(a: Complex): boolean {
  return Number.isFinite(a.re) && Number.isFinite(a.im);
}

/** True when |a - b| <= abs + rel * max(|a|, |b|). Never compare complex values exactly. */
export function approxEqual(a: Complex, b: Complex, rel = 1e-9, absTol = 0): boolean {
  const diff = abs(sub(a, b));
  const size = Math.max(abs(a), abs(b));
  return diff <= absTol + rel * size;
}
