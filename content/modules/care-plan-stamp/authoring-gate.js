// content/modules/care-plan-stamp/authoring-gate.js
//
// Gate for the care plan AUTHORING surface — the "✨ AI Care Plan" button on
// careplandetail_rev.jsp and the audit banners on that page and view_review.jsp.
//
//   GET /api/extension/care-plan/module-status?facilityName=&orgSlug=  →  { success, enabled }
//
// `enabled` is the server's AND of the org/building `carePlanAuthoring` module
// (default-ON) and the caller's per-user `carePlan` grant — the same pair that
// /audit, /auto-pop, /generate, /prewarm and /skips each enforce. So this is UX,
// not security: without it an org with authoring switched off still gets the
// button, clicks it, and lands on a modal that 403s — plus a banner that paints
// "⚠ Audit failed to load." on every care plan page.
//
// ⚠️ The READ surfaces are deliberately NOT behind this. Coverage shields on the
// Med-Diag list and the MDS overlay, and the Compliance roll-up in the MDS
// Command Center, ride `mdsSolver` / `complianceModule` and must keep working at
// an org that only reads care plan coverage.
//
// FAILURE HANDLING — the two cases are NOT the same:
//   - a definitive answer (enabled true/false, 401/403/404) is CACHED, so the
//     surface settles and the injectors' retry loops stop re-asking.
//   - a transport error is NOT cached: it hides the surface for that attempt
//     only, and the next poll / URL change re-checks. Caching it would mean one
//     network blip deletes the care plan writer for every customer until reload,
//     which for a default-ON feature is a worse failure than a late button.
// Either way the attempt itself resolves false — nothing is drawn on a maybe.

/** Promise<boolean> per facility, so the three injectors share one round-trip. */
const _cache = new Map();

function _key(orgSlug, facilityName) {
  return `${orgSlug}||${facilityName}`;
}

/** Clear cached answers (e.g. after a login change) so they re-fetch. */
export function resetCarePlanAuthoringGate() {
  _cache.clear();
}

/**
 * Whether to draw the care plan authoring surface for this facility.
 * Resolves false unless the server explicitly says enabled.
 *
 * @param {{facilityName?: string, orgSlug?: string}} ctx
 * @returns {Promise<boolean>}
 */
export function carePlanAuthoringEnabled({ facilityName, orgSlug } = {}) {
  // No facility context yet — the page is still resolving. Not an answer, so
  // don't cache one; the caller's poll will come back with the context.
  if (!facilityName || !orgSlug) return Promise.resolve(false);

  const key = _key(orgSlug, facilityName);
  const hit = _cache.get(key);
  if (hit) return hit;

  // `_ask` returns { enabled, cacheable }; the cache entry is written BEFORE the
  // request starts so the three injectors share one round-trip, and dropped
  // afterwards when the answer turned out to be retryable. Deciding cacheability
  // inside the promise instead would race: a synchronous throw from sendMessage
  // deletes an entry that has not been written yet, and the error is then cached
  // forever.
  const inflight = _ask(facilityName, orgSlug).then(({ enabled, cacheable }) => {
    if (!cacheable) _cache.delete(key);
    return enabled;
  });

  _cache.set(key, inflight);
  return inflight;
}

/** Facility + org as the page currently reports them, '' when not resolved yet. */
function _pageContext() {
  const facilityName =
    (typeof getChatFacilityInfo === 'function' ? getChatFacilityInfo() : window.getChatFacilityInfo?.()) || '';
  const orgSlug =
    (typeof getOrg === 'function' ? getOrg()?.org : window.getOrg?.()?.org) || '';
  return { facilityName, orgSlug };
}

/**
 * Same check, reading facility + org from the page's own context helpers
 * (`super-menu/context.js`, which also exposes both on `window`). All three
 * injectors want exactly this, and duplicating the two reads across them is how
 * one of them ends up asking about a different facility than it draws on.
 *
 * ⚠️ It WAITS for that context rather than answering false without it. Both
 * helpers are synchronous DOM/localStorage reads, so this normally settles on
 * the first tick — but the injectors run at DOMContentLoaded, and answering
 * "disabled" to a page that simply hadn't rendered its header yet would delete
 * the button at every org, not just the ones switched off. The injectors then
 * spend their own retry budget on PCC's DOM, which is what it is for.
 *
 * @param {{waitForContextMs?: number}} [opts]
 * @returns {Promise<boolean>}
 */
export async function carePlanAuthoringEnabledHere({ waitForContextMs = 3000 } = {}) {
  const deadline = Date.now() + waitForContextMs;
  let ctx = _pageContext();
  while ((!ctx.facilityName || !ctx.orgSlug) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    ctx = _pageContext();
  }
  return carePlanAuthoringEnabled(ctx);
}

/** One module-status round-trip. Never throws. */
async function _ask(facilityName, orgSlug) {
  const params = new URLSearchParams({ facilityName, orgSlug });
  let res;
  try {
    res = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/care-plan/module-status?${params}`,
      options: { method: 'GET' },
    });
  } catch (_) {
    return { enabled: false, cacheable: false }; // transport error — retryable
  }
  // Background relays the server's { success, enabled } as res.data.
  if (res?.success === true && typeof res?.data?.enabled === 'boolean') {
    return { enabled: res.data.enabled === true, cacheable: true };
  }
  // A 4xx is the server's answer (no access / unknown facility) — settle on it.
  // Anything else (5xx, relay failure, malformed body) is retryable.
  const status = res?.status;
  const definitive = typeof status === 'number' && status >= 400 && status < 500;
  return { enabled: false, cacheable: definitive };
}

if (typeof window !== 'undefined') {
  window.CarePlanAuthoringGate = {
    carePlanAuthoringEnabled,
    carePlanAuthoringEnabledHere,
    resetCarePlanAuthoringGate,
  };
}
