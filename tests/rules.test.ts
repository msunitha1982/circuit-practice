// Enforces the repo's hard rules (CLAUDE.md) by scanning source text.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const FORMATTER = 'src/core/format.ts';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = listFiles(SRC).map((full) => ({
  path: relative(ROOT, full).split(sep).join('/'),
  text: readFileSync(full, 'utf8'),
}));

function offenders(pattern: RegExp, include: (path: string) => boolean): string[] {
  return files
    .filter((f) => include(f.path))
    .flatMap((f) =>
      f.text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => pattern.test(line))
        .map(({ i }) => `${f.path}:${i + 1}`),
    );
}

describe('repo rules', () => {
  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never uses Math.random', () => {
    expect(offenders(/Math\s*\.\s*random/, () => true)).toEqual([]);
  });

  it('formats numbers only in the formatter module', () => {
    const pattern = /\.toFixed\s*\(|\.toPrecision\s*\(|Intl\s*\.\s*NumberFormat/;
    expect(offenders(pattern, (p) => p !== FORMATTER)).toEqual([]);
  });

  it('avoids engine-dependent math in the solver and formatter', () => {
    const pattern = /Math\s*\.\s*(hypot|pow|log10)\b/;
    const inScope = (p: string) => p.startsWith('src/solver/') || p === FORMATTER;
    expect(offenders(pattern, inScope)).toEqual([]);
  });
});
