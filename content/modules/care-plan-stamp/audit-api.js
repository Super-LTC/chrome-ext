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

async function fetchAudit({ patientId, facilityName, orgSlug, patientName = null, orgDropdowns = null, tokenValues = null }) {
  const body = {
    patientId: String(patientId),
    facilityName: facilityName || '',
    orgSlug: orgSlug || '',
  };
  if (patientName) body.patientName = patientName;
  if (orgDropdowns) body.orgDropdowns = orgDropdowns;
  if (tokenValues) body.tokenValues = tokenValues;

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
    throw err;
  }
  return response.data || response;
}

window.CarePlanAuditAPI = { fetchAudit };
