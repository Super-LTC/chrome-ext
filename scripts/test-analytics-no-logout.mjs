// Regression test: a 401 from the store-build analytics endpoint must NOT
// clear the user's auth token. Telemetry is best-effort and must never log a
// clinical user out mid-shift.
//
// Run: node scripts/test-analytics-no-logout.mjs
//
// background.js has no imports/exports and only references the bare build-time
// define __DEV_MODE__, so we load its source with new Function(), inject mocked
// globals (chrome, fetch, ...), capture the onMessage listener, then dispatch an
// analyticsBatch message while fetch returns 401 and assert the auth token survives.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../background/background.js'), 'utf8');

function makeChromeMock() {
  const store = { authToken: 'tok-abc', user: { id: 'u1', email: 'jake@example.com' } };
  const removed = [];
  let messageListener = null;

  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => { messageListener = fn; } },
      onConnect: { addListener: () => {} },
      lastError: null,
    },
    storage: {
      local: {
        get: async (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of arr) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (obj) => { Object.assign(store, obj); },
        remove: async (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          removed.push(...arr);
          for (const k of arr) delete store[k];
        },
      },
    },
    tabs: { create: () => {}, reload: () => {} },
    downloads: { download: () => {} },
  };

  return { chrome, store, removed, getListener: () => messageListener };
}

function dispatch(listener, message) {
  return new Promise((resolve) => {
    const keepOpen = listener(message, {}, (response) => resolve(response));
    if (keepOpen !== true) resolve(undefined);
  });
}

async function run() {
  const { chrome, store, removed, getListener } = makeChromeMock();

  // Analytics endpoint always 401s (simulates the backend rejecting the bearer
  // token on /api/v1/analytics/events). Every other concern is irrelevant here.
  const fetchMock = async () => ({ status: 401, ok: false, json: async () => ({}), text: async () => '' });

  // Load the service worker source with injected globals.
  const factory = new Function(
    'chrome', 'fetch', 'console', 'setTimeout', 'crypto', '__DEV_MODE__',
    source
  );
  factory(chrome, fetchMock, console, (fn, _ms) => fn(), { randomUUID: () => 'state-1' }, false);

  const listener = getListener();
  if (!listener) throw new Error('onMessage listener was never registered');

  await dispatch(listener, { type: 'analyticsBatch', batch: [{ event: 'noop' }] });

  const tokenCleared = removed.includes('authToken') || !('authToken' in store);
  if (tokenCleared) {
    console.error('\n❌ FAIL: analytics 401 cleared authToken (user got logged out).');
    console.error('   storage.local.remove called with:', removed);
    process.exit(1);
  }
  console.log('✅ analytics 401 did NOT clear authToken. Session preserved.');

  // Guard: a real (non-telemetry) API call that persistently 401s MUST still
  // clear the token — we only decoupled analytics, not auth-clearing in general.
  await dispatch(listener, {
    type: 'API_REQUEST',
    endpoint: '/api/extension/something',
    options: { method: 'GET' },
  });
  const realCallCleared = removed.includes('authToken') && !('authToken' in store);
  if (!realCallCleared) {
    console.error('\n❌ FAIL: a real API 401 did NOT clear authToken — auth-clearing is broken.');
    process.exit(1);
  }
  console.log('✅ real API 401 still clears authToken (auth-clearing intact).');

  console.log('\n✅ PASS: fix is surgical.');
  process.exit(0);
}

run().catch((e) => { console.error('Test harness error:', e); process.exit(2); });
