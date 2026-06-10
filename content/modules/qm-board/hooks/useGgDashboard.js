import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * Facility-wide GG-decline roster for the Functional Decline screen.
 *
 *   GET /api/extension/qm-planner/gg-decline-dashboard
 *       ?facilityName&orgSlug&mode=qm|therapy   (mode default 'therapy')
 *
 * Returns GgDeclineDashboardResponse:
 *   { mode, patients[], snoozedPatients[], summary{total,withDecline,severe,moderate,mild,snoozed} }
 *
 * Refetches on `mode` change and on the shared `super:qm-snooze-changed` event
 * (GG snoozes fire it via useSnooze).
 */
export function useGgDashboard({ facilityName, orgSlug, mode = 'therapy' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug, mode }).toString();
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/qm-planner/gg-decline-dashboard?${params}`,
        options: { method: 'GET' },
      });
      if (!res?.success) throw new Error(res?.error || 'Request failed');
      setData(unwrap(res.data));
    } catch (err) {
      console.error('[FunctionalDecline] fetch failed', err);
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, mode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('super:qm-snooze-changed', handler);
    return () => window.removeEventListener('super:qm-snooze-changed', handler);
  }, [fetchData]);

  return { data, loading, error, retry: fetchData };
}
