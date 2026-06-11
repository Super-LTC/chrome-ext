import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useQmBoard — parallel fetch of Currently Triggering + Preventable Alerts
 * (+ best-effort Upcoming day-101 crossers) from the extension QM endpoints.
 *
 *   GET /api/extension/qm-planner/currently-triggering?facilityName&orgSlug
 *   GET /api/extension/qm-planner/preventable-alerts?facilityName&orgSlug
 *   GET /api/extension/qm-planner/upcoming?facilityName&orgSlug   (best-effort)
 *
 * `upcoming` powers the "+N soon" tile pills, the "Coming soon" worklist group,
 * and the crosser-prevent what-if. It is fetched best-effort: if the endpoint
 * isn't deployed (or errors), the board still loads and crosser features stay
 * gracefully empty.
 */
export function useQmBoard({ facilityName, orgSlug }) {
  const [currentlyTriggering, setCurrentlyTriggering] = useState(null);
  const [preventableAlerts, setPreventableAlerts] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // `silent` = refresh in the background without flipping the full-screen loader
  // or clobbering the board with an error screen. Used for post-mutation refetches
  // (snooze/dismiss) which are already optimistic in the views — the user should
  // never see "Building your QM board" again just for dismissing one signal.
  const fetchData = useCallback(async ({ silent = false } = {}) => {
    if (!facilityName || !orgSlug) {
      setError('Missing facility or organization context');
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    const params = new URLSearchParams({ facilityName, orgSlug });

    try {
      const [ctRes, paRes] = await Promise.all([
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/qm-planner/currently-triggering?${params}`,
          options: { method: 'GET' },
        }),
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/qm-planner/preventable-alerts?${params}`,
          options: { method: 'GET' },
        }),
      ]);

      if (!ctRes?.success) throw new Error(ctRes?.error || 'Failed to load currently-triggering');
      if (!paRes?.success) throw new Error(paRes?.error || 'Failed to load preventable alerts');

      setCurrentlyTriggering(unwrap(ctRes.data));
      setPreventableAlerts(unwrap(paRes.data));

      // Best-effort: day-101 crossers. Never blocks the board.
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/qm-planner/upcoming?${params}`,
        options: { method: 'GET' },
      }).then((upRes) => {
        setUpcoming(upRes?.success ? unwrap(upRes.data) : null);
      }).catch(() => setUpcoming(null));
    } catch (err) {
      console.error('[QMBoard] fetch failed', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'qm_board',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      // On a silent refresh keep the current board rather than swapping in an
      // error screen — the optimistic view already reflects the user's action.
      if (!silent) setError(err.message || 'Failed to load QM board');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [facilityName, orgSlug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refetch after snooze/unsnooze mutations anywhere in the app — silently, so a
  // dismiss never re-triggers the full-screen loader (the views are optimistic).
  useEffect(() => {
    const handler = () => fetchData({ silent: true });
    window.addEventListener('super:qm-snooze-changed', handler);
    return () => window.removeEventListener('super:qm-snooze-changed', handler);
  }, [fetchData]);

  return { currentlyTriggering, preventableAlerts, upcoming, loading, error, retry: fetchData };
}
