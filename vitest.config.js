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
  },
});
