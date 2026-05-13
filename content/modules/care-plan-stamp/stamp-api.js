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

async function fetchProposal({ patientId, facilityName, orgSlug, scope = 'initial', existingFocusTexts = [] }) {
  const params = new URLSearchParams({
    patientId: String(patientId),
    facilityName: facilityName || '',
    orgSlug: orgSlug || '',
    scope,
  });
  // Idempotency hint: server matches by keyword and sets alreadyOnPlan on each focus.
  // Backend silently ignores until the patch ships — safe to send now.
  for (const t of existingFocusTexts || []) {
    if (t) params.append('existingFocusTexts[]', t);
  }
  const endpoint = `/api/extension/care-plan/auto-pop?${params}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
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
