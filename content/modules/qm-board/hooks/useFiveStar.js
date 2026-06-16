import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useFiveStar — lazy-fetch the predicted CMS Five-Star QM rating (web PR2).
 *
 *   GET /api/extension/qm-planner/five-star?facilityName&orgSlug
 *     → { success, data: QmFiveStarResponse }
 *
 * Fetched SEPARATELY from the board payload so the board renders first and the
 * predictor card fills in — the predictor does a double facility-rate pass (now
 * + replayed at the CMS window) so it's the slow one. `prediction` is the raw
 * QmFiveStarResponse (`{available:true,…}` or `{available:false,reason}`); the
 * card renders the "match this facility" nudge for the unavailable cases and
 * never fabricates a star. Returns null until it resolves (card renders nothing).
 *
 * Endpoint goes live with web PR #673; until then this resolves to null/error
 * and the board simply shows no predictor card.
 */
export function useFiveStar({ facilityName, orgSlug }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/five-star?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        setPrediction(res?.success ? unwrap(res.data) : null);
      })
      .catch(() => { if (live) setPrediction(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug]);

  return { prediction, loading };
}
