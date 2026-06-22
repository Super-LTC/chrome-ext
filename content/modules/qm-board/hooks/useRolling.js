import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useRolling — lazy-fetch the trailing-4-quarter windowed rates + projection
 * (web PR #733). Drives the 4-quarter trend mini-chart on measure detail.
 *
 *   GET /api/extension/qm-planner/rolling?facilityName&orgSlug
 *     → { success, data: QmRollingView }
 *
 * Fetched separately so the board renders first. Resolves to null on
 * error/until-live (measure detail simply hides the trend chart).
 */
export function useRolling({ facilityName, orgSlug }) {
  const [rolling, setRolling] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/rolling?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        setRolling(res?.success ? unwrap(res.data) : null);
      })
      .catch(() => { if (live) setRolling(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug]);

  return { rolling, loading };
}
