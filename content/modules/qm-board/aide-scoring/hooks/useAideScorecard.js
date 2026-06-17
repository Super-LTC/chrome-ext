import { useState, useCallback } from 'preact/hooks';
import { unwrap } from '../../utils/api.js';

/**
 * Fetch one aide's scorecard (drill-in detail / PDF source).
 *
 *   GET /api/extension/qm-planner/gg-aide-deviation?facilityName&orgSlug&days&aideId
 *   -> AideDeviationDetailResponse { aideId, aideName, summary, scores,
 *        categoryDeviations, shiftDeviations, trend }
 *
 * Plain async helper so it can also be called imperatively for the print loop.
 */
export async function fetchAideDetail({ facilityName, orgSlug, days = 30, aideId }) {
  const params = new URLSearchParams({
    facilityName,
    orgSlug,
    days: String(days),
    aideId,
  }).toString();
  const res = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/qm-planner/gg-aide-deviation?${params}`,
    options: { method: 'GET' },
  });
  if (!res?.success) throw new Error(res?.error || 'Request failed');
  return unwrap(res.data);
}

/**
 * Lazy per-aide scorecard for the expandable roster row. Holds the detail for
 * the currently-open aide; `load(aideId)` swaps it.
 */
export function useAideScorecard({ facilityName, orgSlug, days = 30 }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (aideId) => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const d = await fetchAideDetail({ facilityName, orgSlug, days, aideId });
      setDetail(d);
      return d;
    } catch (err) {
      console.error('[AideScoring] detail fetch failed', err);
      setError(err.message || 'Failed to load');
      return null;
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, days]);

  const clear = useCallback(() => { setDetail(null); setError(null); }, []);

  return { detail, loading, error, load, clear };
}
