/**
 * Backend API client for Care Plan Auto-Pop.
 *
 * Fetches the proposal from our backend. Auth is handled by background.js via
 * the API_REQUEST relay (bearer token from chrome.storage.local).
 *
 * Exports on `window.CarePlanStampAPI`:
 *   - fetchProposal({ patientId, facilityName, orgSlug, scope }) → CarePlanProposal
 *
 * `patientId` here is the PCC clientid (e.g. "923145") — same number PCC's own
 * Printable View URL uses as ESOLclientid. It's the stable patient link.
 */

async function fetchProposal({ patientId, facilityName, orgSlug, scope = 'initial', existingFocusTexts = [], orgDropdowns = null, tokenValues = null, patientName = null }) {
  // POST body, not query string. Large facilities push the GET URL past the
  // 8 KB nginx limit (existingFocusTexts grows linearly with plan size, plus
  // orgDropdowns label maps). POST has no size limit. Backend accepts the
  // same params either way (see PR #448).
  const body = {
    patientId: String(patientId),
    facilityName: facilityName || '',
    orgSlug: orgSlug || '',
    scope,
    existingFocusTexts: existingFocusTexts || [],
  };
  if (orgDropdowns) body.orgDropdowns = orgDropdowns;
  if (tokenValues) body.tokenValues = tokenValues;
  if (patientName) body.patientName = patientName;

  const endpoint = '/api/extension/care-plan/auto-pop';

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: {
      method: 'POST',
      body: JSON.stringify(body),
    },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch care plan proposal');
    err.endpoint = endpoint;
    throw err;
  }

  const data = response.data || response;

  // Defensive: backend should always return `focuses`. If it sent a different
  // shape (e.g. { proposal: {...} }), unwrap one level.
  if (data?.proposal?.focuses && !data.focuses) return data.proposal;
  return data;
}

window.CarePlanStampAPI = { fetchProposal };
