import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Facility Medicaid case mix for the Command Center's Case Mix tab.
 *
 * Endpoint: GET /api/extension/case-mix → { enabled, meta, period, reconciliation, payable[], capture[] }
 *
 * ── `enabled` IS THE SERVER'S CALL, NOT OURS ──────────────────────────────
 *
 * The tab is Ohio-only, and the extension cannot decide that: there is no
 * client-side facility→state map anywhere. `facilityName` and `orgSlug` are
 * scraped off the PCC page and that is everything we know. The server gates on
 * whether it has actually READ that state's rate-setting rule, which today means
 * Ohio and tomorrow may mean Virginia — without an extension release either way.
 *
 * Fails CLOSED like the IPA tab: 403 / 404 / network / thrown all resolve to
 * enabled:false and the tab simply never appears. An error toast inside PCC for
 * a feature the building was never entitled to is worse than silence.
 *
 * ── TWO POPULATIONS, NEITHER DERIVABLE FROM THE OTHER ─────────────────────
 *
 * `payable` is the record in effect on the picture date — what ODM publishes and
 * what sets the rate. `capture` is only residents assessed INSIDE the quarter.
 * They run different populations, so this hook keeps both and the view picks.
 */
export function useCaseMix({ facilityName, orgSlug }) {
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug, quarters: '5' });
      const result = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/case-mix?${params}`,
        options: { method: 'GET' },
      });

      if (!result?.success) {
        setEnabled(false);
        setData(null);
        return;
      }

      const body = result.data || {};
      setEnabled(body.enabled === true);
      setData(body.enabled === true ? body : null);
    } catch (err) {
      console.warn('[CaseMix] unavailable:', err);
      setEnabled(false);
      setData(null);
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, enabled, loading, error, retry: fetchData };
}

/**
 * The residents behind one quarter. Fetched on demand — a roster is ~80 rows with
 * projections attached, and the tab renders a number long before anyone drills.
 *
 * Read only. The web surface allows an org admin to override a projected group;
 * this one does not, which is why there is no mutating counterpart here.
 */
export async function fetchCaseMixRoster({ facilityName, orgSlug, quarter }) {
  const params = new URLSearchParams({ facilityName, orgSlug, quarter });
  const result = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/case-mix/roster?${params}`,
    options: { method: 'GET' },
  });
  if (!result?.success) throw new Error(result?.error || 'Failed to load residents');
  return result.data || {};
}
