import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useDfs — lazy-fetch the facility Discharge Function Score card (web round 2).
 *
 *   GET /api/extension/qm-planner/dfs?facilityName&orgSlug
 *     → { success, data: QmFacilityDfsResponse }
 *
 * Fetched SEPARATELY from the board payload (like useFiveStar) so the board
 * renders first and the DFS card fills in. DFS is a rolling-12-month short-stay
 * measure; the response carries the forward-looking live rate, the CMS context
 * anchor, in-house residents (entry→target, with per-item admission GG for the
 * explorer) and recent completed stays. `dfs` is the raw QmFacilityDfsResponse
 * (`{available:true,…}` or `{available:false}`); the card renders the "match this
 * facility" nudge when unavailable and never fabricates a number. Returns null
 * until it resolves (card renders nothing).
 *
 * Endpoint goes live with web PR #680 (round-2 DFS follow-ups); until then this
 * resolves to null/error and the board simply shows no DFS card.
 */
export function useDfs({ facilityName, orgSlug }) {
  const [dfs, setDfs] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/dfs?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        setDfs(res?.success ? unwrap(res.data) : null);
      })
      .catch(() => { if (live) setDfs(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug]);

  return { dfs, loading };
}
