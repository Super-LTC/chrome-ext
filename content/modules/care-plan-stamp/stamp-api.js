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

/**
 * Persist (or un-persist) a focus skip decision.
 *
 * Fire-and-forget — caller should NOT block UI on this. Errors are logged
 * and swallowed: local React state already reflects the nurse's intent;
 * this call just makes the decision survive a wizard close + re-open.
 *
 * Idempotent server-side (ON CONFLICT DO NOTHING on POST; DELETE on missing
 * row is a 404 we ignore). Skipped focuses get filtered out of the next
 * auto-pop's `focuses` and surface in `skippedFocuses` instead.
 *
 * Wizard-cosmetic only: coverage / dashboards do NOT read this table.
 */
async function persistSkip({ patientId, orgSlug, facilityName, ruleId, isSkipping, reason }) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: '/api/extension/care-plan/skips',
      options: {
        method: isSkipping ? 'POST' : 'DELETE',
        body: JSON.stringify({
          patientId: String(patientId),
          orgSlug: orgSlug || '',
          facilityName: facilityName || '',
          ruleId,
          ...(isSkipping && reason ? { reason } : {}),
        }),
      },
    });
    if (!response?.success) {
      console.error('[care-plan-pop] failed to persist skip', response?.error, { ruleId, isSkipping });
    }
  } catch (err) {
    console.error('[care-plan-pop] failed to persist skip', err, { ruleId, isSkipping });
  }
}

window.CarePlanStampAPI = { fetchProposal, persistSkip };
