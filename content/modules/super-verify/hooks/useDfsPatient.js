import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../../qm-board/utils/api.js';

/**
 * useDfsPatient — one resident's Discharge Function Score standing, for Verify.
 *
 *   GET /api/extension/patients/{patientId}/dfs?facilityName&orgSlug
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
export function useDfsPatient({ patientId, facilityName, orgSlug }) {
  const [dfs, setDfs] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime
      .sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/patients/${encodeURIComponent(patientId)}/dfs?${params}`,
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
  }, [patientId, facilityName, orgSlug]);

  return { dfs, loading };
}
