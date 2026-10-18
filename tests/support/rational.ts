// Exact rational numbers (BigInt numerator / denominator), for deriving
// fixture answers with no rounding at all. Test-only.

export class Q {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint = 1n) {
    if (den === 0n) throw new RangeError('Zero denominator');
    const sign = den < 0n ? -1n : 1n;
    const g = gcd(num < 0n ? -num : num, den < 0n ? -den : den);
    this.num = (sign * num) / g;
    this.den = (sign * den) / g;
  }

  add(o: Q): Q { return new Q(this.num * o.den + o.num * this.den, this.den * o.den); }
  sub(o: Q): Q { return new Q(this.num * o.den - o.num * this.den, this.den * o.den); }
  mul(o: Q): Q { return new Q(this.num * o.num, this.den * o.den); }
  div(o: Q): Q {
    if (o.num === 0n) throw new RangeError('Division by zero');
    return new Q(this.num * o.den, this.den * o.num);
  }
  neg(): Q { return new Q(-this.num, this.den); }
  inv(): Q { return new Q(1n, 1n).div(this); }
  isZero(): boolean { return this.num === 0n; }
  equals(o: Q): boolean { return this.num === o.num && this.den === o.den; }
  toNumber(): number { return Number(this.num) / Number(this.den); }
  toString(): string { return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`; }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

/** q(3) = 3, q(1, 3) = 1/3. Integers only, so no binary rounding sneaks in. */
export function q(num: number | bigint, den: number | bigint = 1): Q {
  if (typeof num === 'number' && !Number.isInteger(num)) throw new RangeError('q() takes integers');
  if (typeof den === 'number' && !Number.isInteger(den)) throw new RangeError('q() takes integers');
  return new Q(BigInt(num), BigInt(den));
}

export const sum = (...xs: Q[]): Q => xs.reduce((a, b) => a.add(b), q(0));

/** Series resistance. */
export const series = sum;

/** Parallel resistance: 1 / Σ(1/R). */
export const parallel = (...rs: Q[]): Q => sum(...rs.map((r) => r.inv())).inv();

/** Solves A·x = b exactly by Gaussian elimination (any nonzero pivot is exact). */
export function solveExact(A: readonly (readonly Q[])[], b: readonly Q[]): Q[] {
  const n = A.length;
  const m = A.map((row, i) => [...row, b[i] as Q]);
  for (let k = 0; k < n; k++) {
    const p = m.findIndex((row, i) => i >= k && !(row[k] as Q).isZero());
    if (p < 0) throw new Error('Singular system');
    [m[k], m[p]] = [m[p]!, m[k]!];
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = m[i]![k]!.div(m[k]![k]!);
      if (f.isZero()) continue;
      m[i] = m[i]!.map((v, j) => v.sub(f.mul(m[k]![j]!)));
    }
  }
  return m.map((row, i) => row[n]!.div(row[i]!));
}
