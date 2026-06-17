import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../../utils/api.js';

/**
 * Facility-wide aide-scoring roster for the Aide Scoring screen.
 *
 *   GET /api/extension/qm-planner/gg-aide-deviation
 *       ?facilityName&orgSlug&days=30
 *
 * Returns AideDeviationResponse:
 *   { aides[], dateRange{fromDate,toDate}, patientsAnalyzed, minimumAssessments }
 *
 * Auth / facility resolution + the grade math are all server-side; the client
 * just renders. Mirrors useGgDashboard.js.
 */
export function useAideScoring({ facilityName, orgSlug, days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug, days: String(days) }).toString();
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/qm-planner/gg-aide-deviation?${params}`,
        options: { method: 'GET' },
      });
      if (!res?.success) throw new Error(res?.error || 'Request failed');
      setData(unwrap(res.data));
    } catch (err) {
      console.error('[AideScoring] roster fetch failed', err);
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, retry: fetchData };
}
