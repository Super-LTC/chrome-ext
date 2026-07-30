import { useState, useEffect } from 'preact/hooks';

/**
 * Who can be @-mentioned on this report — people with access to the facility.
 *
 * Cached per report id for the life of the panel: the roster does not change
 * mid-session, and every expanded finding would otherwise refetch it.
 */
const cache = new Map();

export function useTeammates(reportId) {
  const [teammates, setTeammates] = useState(() => cache.get(reportId) || []);

  useEffect(() => {
    if (!reportId || cache.has(reportId)) {
      setTeammates(cache.get(reportId) || []);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/24hr-report/teammates?reportId=${encodeURIComponent(reportId)}`,
          options: { method: 'GET' },
        });
        if (cancelled) return;
        const list = res?.success ? res.data?.teammates || [] : [];
        cache.set(reportId, list);
        setTeammates(list);
      } catch {
        // Tagging is an enhancement — a failed roster fetch must not stop
        // somebody leaving a plain comment.
        if (!cancelled) setTeammates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return teammates;
}
