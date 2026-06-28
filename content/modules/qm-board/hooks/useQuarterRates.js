import { useState, useEffect } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useQuarterRates — lazy-fetch the current quarter's WINDOWED (discharged-
 * inclusive) per-measure rates + the per-resident roster for the denominator
 * drill-in (web PR #733).
 *
 *   GET /api/extension/qm-planner/quarter-rates?facilityName&orgSlug&back=N
 *     → { success, data: QmQuarterRatesView }
 *
 * `back` selects the quarter: 0 = current in-progress (default), 1 = last
 * complete quarter (the Regional scorecard's resident-expand "Last quarter"
 * flip uses back=1; backend `back=N` support shipped in 72cffcd5b).
 *
 * Fetched SEPARATELY from the board payload so the board renders first; the
 * measure tiles + measure-detail show the active rate until this resolves, then
 * swap to the true CMS windowed rate. Resolves to null on error/until-live (the
 * tiles simply keep showing the active rate, no denominator drill-in).
 */
export function useQuarterRates({ facilityName, orgSlug, back = 0 }) {
  const [quarterRates, setQuarterRates] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    // back=0 is the backend default; only send it when non-zero so the
    // current-quarter request stays byte-identical to the pre-back=N call.
    const params = new URLSearchParams({ facilityName, orgSlug });
    if (back) params.set('back', String(back));
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/quarter-rates?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        setQuarterRates(res?.success ? unwrap(res.data) : null);
      })
      .catch(() => { if (live) setQuarterRates(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug, back]);

  return { quarterRates, loading };
}
