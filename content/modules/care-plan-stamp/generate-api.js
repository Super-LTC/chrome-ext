/**
 * Backend API client for the V3 CACHED generate flow (SUP-116; backend SUP-66).
 *
 * GET /api/extension/care-plan/generate?cache=1&mode=comprehensive
 *   miss → full deterministic plan instantly (authored:false) + ONE authoring
 *          job queued server-side; hit → cached payload (<1s).
 *   Poll the SAME url while authored=false — each poll is a cheap cache read;
 *   the authored payload swaps in when the background AI pass lands.
 *
 * Response fields the ext reads (on top of the plan payload):
 *   - authored: boolean
 *   - authoringProgress: { done, total } | null   (real % while authoring)
 *   - fingerprint: string                          (chart-state hash)
 *   - chartQuality?: { ok:false, flags:[...] }     (junk/under-synced chart)
 *
 * Auth via the background API_REQUEST relay, same as audit-api.js.
 * A 409 means the org's library isn't concept-mapped yet — callers treat that
 * as "feature off", never as a modal error.
 */

async function fetchGenerate({ patientId, orgSlug, facilityName, orgDropdowns }) {
  const qs = new URLSearchParams({
    patientId: String(patientId),
    orgSlug: orgSlug || '',
    facilityName: facilityName || '',
    mode: 'comprehensive',
    cache: '1',
  });
  // Facility dropdown labels — backend resolves the payload's CANONICAL
  // kardex/position/reviewDept names to this facility's numeric IDs (without
  // this, swapped rows render raw '(rn)'/'(nurse_any)' chips and can't stamp).
  if (orgDropdowns) qs.set('orgDropdowns', JSON.stringify(orgDropdowns));
  const endpoint = `/api/extension/care-plan/generate?${qs.toString()}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: { method: 'GET' },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch generated care plan');
    err.endpoint = endpoint;
    err.status = response?.status;
    throw err;
  }
  return response.data || response;
}

/**
 * Fire-and-forget cold-cost prewarm (SUP-116): the backend runs the audit
 * (warming the existing-plan concept cache — the one-time ~15s AI pass) and
 * queues generate authoring on a fingerprint miss, all while the nurse is
 * still reading the PCC page. Callers must never await or surface errors —
 * the modal works identically without it, just slower on a cold first open.
 */
function prewarm({ patientId, orgSlug, facilityName }) {
  const qs = new URLSearchParams({
    patientId: String(patientId),
    orgSlug: orgSlug || '',
    facilityName: facilityName || '',
  });
  try {
    chrome.runtime
      .sendMessage({ type: 'API_REQUEST', endpoint: `/api/extension/care-plan/prewarm?${qs.toString()}`, options: { method: 'GET' } })
      .catch(() => {}); // silent by design
  } catch (_) { /* extension context gone — never matters */ }
}

window.CarePlanGenerateAPI = { fetchGenerate, prewarm };
