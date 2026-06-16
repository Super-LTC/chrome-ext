// content/mds-beta-gate.js
// Beta gate for the new MDS features (interview auto-scheduler, create
// auto-schedule flow, and the MDS-In-Progress list coverage overlay).
//
//   GET /api/extension/mds/interview-coverage/module-status  →  { success, enabled }
//
// `enabled === true` ⟺ the signed-in user's email is on the backend beta
// allowlist. One flag gates all three UI surfaces.
//
// FAIL CLOSED: any non-true outcome (401 / 403 / 500 / network error /
// enabled:false) resolves to `false`, so non-testers see exactly the extension
// as it behaved before these features existed — no UI, no error toast. (The two
// coverage routes are ALSO hard-blocked server-side with 403, so the gate is UX,
// not security.)
//
// Cached for the session as a single in-flight promise so the three surfaces
// share one round-trip. Call resetMdsBetaGate() on a login change to re-check.

let _cache = null; // Promise<boolean> | null

/** Clear the cached gate result (e.g. after a login/logout) so it re-fetches. */
export function resetMdsBetaGate() {
  _cache = null;
}

/** Resolves true only for beta-allowlisted users; fails closed otherwise. */
export function mdsBetaEnabled() {
  if (_cache) return _cache;
  _cache = (async () => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: '/api/extension/mds/interview-coverage/module-status',
        options: { method: 'GET' },
      });
      // Background relays the server's { success, enabled } as res.data.
      return res?.success === true && res?.data?.enabled === true;
    } catch {
      return false; // network/relay error → fail closed
    }
  })();
  return _cache;
}
