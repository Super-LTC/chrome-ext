import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useQmBoard — ONE round-trip for the whole QM board (web PR #672).
 *
 *   GET /api/extension/qm-planner/board?facilityName&orgSlug
 *     → { success, data: { currentlyTriggering, upcoming, alerts } }
 *
 * Both modes (Focus + full board) + inline dismiss read from this single cached
 * object — no waterfall, Focus renders instantly. `alerts` is the preventable-
 * alerts payload (signals already pruned to the last 7 days + sorted newest-first
 * server-side); we expose it as `preventableAlerts` so the existing views are
 * untouched.
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
      // One call returns the whole board (currently-triggering + upcoming + alerts).
      const boardRes = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/qm-planner/board?${params}`,
        options: { method: 'GET' },
      });
      if (!boardRes?.success) throw new Error(boardRes?.error || 'Failed to load QM board');

      const board = unwrap(boardRes.data) ?? {};
      setCurrentlyTriggering(board.currentlyTriggering ?? null);
      setUpcoming(board.upcoming ?? null);
      setPreventableAlerts(board.alerts ?? null);
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
