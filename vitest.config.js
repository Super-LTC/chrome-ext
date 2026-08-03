import { defineConfig } from 'vitest/config';

// Standalone vitest config (kept separate from vite.config.js so the unit-test
// run doesn't pull in the extension build plugins / manifest generation).
// Unit tests live next to the code they cover, in `__tests__/*.test.js`.
export default defineConfig({
  // Transform JSX to Preact's runtime so component tests can render .jsx directly
  // (the build uses @preact/preset-vite; tests only need the JSX transform).
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    environment: 'jsdom', // DOMParser + Document for the MDS section parser
    include: ['content/**/__tests__/**/*.test.js'],
    globals: false,
    // Pinned to a NEGATIVE-offset zone on purpose. Several screens render
    // date-only ISO strings (`2026-06-25`), which parse as UTC midnight — format
    // those without `timeZone: 'UTC'` and they render as the day BEFORE, but
    // only west of Greenwich. On a UTC runner those tests pass whether or not the
    // guard is there, so the bug ships green. Verified: the whole suite passes
    // under UTC and under this zone, so pinning costs nothing and makes the
    // day-slip assertions real everywhere.
    env: { TZ: 'America/Los_Angeles' },
  },
});
