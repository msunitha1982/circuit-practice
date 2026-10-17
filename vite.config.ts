import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the site works under any GitHub Pages repo name.
  base: './',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
