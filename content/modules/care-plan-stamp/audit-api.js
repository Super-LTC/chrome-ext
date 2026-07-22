/**
 * Backend API client for Care Plan Audit (Comprehensive Review mode).
 *
 * Fetches the audit result from our backend. Auth is handled by background.js
 * via the API_REQUEST relay (bearer token from chrome.storage.local).
 *
 * Exports on `window.CarePlanAuditAPI`:
 *   - fetchAudit({ patientId, facilityName, orgSlug, patientName?, orgDropdowns?, tokenValues? }) → AuditResponse
 *
 * `patientId` is the PCC clientid (e.g. "923145") — same number used elsewhere
 * in care-plan-stamp.
 */

async function fetchAudit({ patientId, facilityName, orgSlug, patientName = null, orgDropdowns = null, tokenValues = null, existingFocusTexts = null }) {
  const body = {
    patientId: String(patientId),
    facilityName: facilityName || '',
    orgSlug: orgSlug || '',
  };
  if (patientName) body.patientName = patientName;
  if (orgDropdowns) body.orgDropdowns = orgDropdowns;
  if (tokenValues) body.tokenValues = tokenValues;
  if (Array.isArray(existingFocusTexts)) body.existingFocusTexts = existingFocusTexts;

  const endpoint = '/api/extension/care-plan/audit';

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: {
      method: 'POST',
      body: JSON.stringify(body),
    },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch care plan audit');
    err.endpoint = endpoint;
    err.status = response?.status;
    throw err;
  }
  return response.data || response;
}

/**
 * CloudFront drops origin responses at ~20s (the V2 504 lesson), but the
 * Lambda KEEPS RUNNING and finishes writing the concept caches. So a gateway
 * timeout on a cold first audit isn't a failure — it's "the warm-up is still
 * going": wait, retry, and the retry rides the now-warm cache (~2s). Real
 * errors (4xx, auth) surface immediately.
 */
const RETRYABLE = (err) =>
  [502, 503, 504].includes(err?.status) || /\b(?:502|503|504|gateway|timeout|timed out)\b/i.test(err?.message || '');

async function fetchAuditWithRetry(params, { retries = 2, delayMs = 5000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchAudit(params);
    } catch (err) {
      if (attempt >= retries || !RETRYABLE(err)) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

window.CarePlanAuditAPI = { fetchAudit, fetchAuditWithRetry };
