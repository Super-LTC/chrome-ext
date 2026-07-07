// content/modules/care-plan-stamp/v2-flag.js
//
// Care Plan V2 is server-driven: the backend echoes `engineVersion: 'v1' | 'v2'`
// on the top level of the `/care-plan/audit` response's `audit` object. Production
// reads ONLY that field. This helper centralizes the read and adds a DEV-ONLY local
// override (`?cpv2=1` / `?cpv2=mock` query param, or `superltc_cpv2` in localStorage)
// so we can exercise v2 before the backend deploys.

/**
 * Read the dev override value, preferring the `cpv2` query param and falling back
 * to `localStorage['superltc_cpv2']`. Wrapped so it NEVER throws — location and
 * localStorage can be absent or blocked depending on the runtime/page.
 * @returns {string|null}
 */
function _override() {
  try {
    const qs = new URLSearchParams(globalThis.location?.search || '');
    return qs.get('cpv2') || globalThis.localStorage?.getItem('superltc_cpv2') || null;
  } catch {
    return null;
  }
}

/** Dev override requesting the fully-mocked v2 experience. */
export function devForceMock() {
  return _override() === 'mock';
}

/** Dev override forcing v2 on (real or mocked). */
export function devForceV2() {
  const v = _override();
  return v === '1' || v === 'mock';
}

/** Server-driven engine version for a given audit payload. */
export function engineVersionOf(audit) {
  return audit?.engineVersion === 'v2' ? 'v2' : 'v1';
}

/** Whether the V2 experience should be shown for a given audit payload. */
export function isV2(audit) {
  return devForceV2() || engineVersionOf(audit) === 'v2';
}

if (typeof window !== 'undefined') {
  window.CarePlanV2 = { isV2, engineVersionOf, devForceV2, devForceMock };
}
