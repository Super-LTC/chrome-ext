import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../../qm-board/utils/api.js';

/**
 * Build the per-resident DFS endpoint.
 *
 * `ardDate` is the ARD of the assessment Verify is open on, and it is what lets
 * the backend answer "does THIS assessment determine a Discharge Function
 * Score?" instead of "has this resident been discharged from Part A at any point
 * in the last year?". Omitting it is not a no-op — the route falls back to the
 * older, unscoped behaviour, which is what put "Met · +7" on a Quarterly.
 *
 * Sent only when truthy: `getPCCAssessmentMetaFromDOM` returns a validated
 * `YYYY-MM-DD` or null, and the backend matches the ARD exactly, so a malformed
 * value would match nothing and blank the callout on the one assessment that
 * SHOULD show it.
 */
export function buildDfsEndpoint({ patientId, facilityName, orgSlug, ardDate }) {
  const params = new URLSearchParams({ facilityName, orgSlug });
  if (ardDate) params.set('ardDate', ardDate);
  return `/api/extension/patients/${encodeURIComponent(patientId)}/dfs?${params}`;
}

/**
 * useDfsPatient — one resident's Discharge Function Score standing, for Verify.
 *
 *   GET /api/extension/patients/{patientId}/dfs?facilityName&orgSlug&ardDate
 *     → { success, data: QmDfsPatientResponse }
 *         { available, projection | null, completed | null }
 *
 * Fetched SEPARATELY from the verify payload (like useDfs on the board) so the
 * panel renders immediately and the DFS callout fills in — Verify is opened on
 * every MDS and must not wait on this.
 *
 * `patientId` here is the PCC client id, matching what SuperVerifyModal is
 * handed; the route resolves it. Resolves to null on any failure, and the
 * callout then renders nothing: a missing DFS standing is a normal state for
 * most residents (long-stay, non-Part-A), not an error worth a message.
 */
export function useDfsPatient({ patientId, facilityName, orgSlug, ardDate }) {
  const [dfs, setDfs] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    chrome.runtime
      .sendMessage({
        type: 'API_REQUEST',
        endpoint: buildDfsEndpoint({ patientId, facilityName, orgSlug, ardDate }),
        options: { method: 'GET' },
      })
      .then((res) => {
        if (!live) return;
        setDfs(res?.success ? unwrap(res.data) : null);
      })
      .catch(() => {
        if (live) setDfs(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [patientId, facilityName, orgSlug, ardDate]);

  return { dfs, loading };
}
