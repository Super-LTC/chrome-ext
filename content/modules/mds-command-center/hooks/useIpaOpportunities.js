import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Fetches IPA / new-quarterly payment opportunities for a facility.
 *
 * Endpoint: GET /api/extension/ipa  → { enabled, candidates, counts }
 * `enabled` gates the whole tab (per-org pilot toggle). When the module is off the
 * endpoint still returns 200 with { enabled: false, candidates: [] }, so the tab
 * simply never appears. Network/auth failures also resolve to enabled:false (safe).
 */
export function useIpaOpportunities({ facilityName, orgSlug }) {
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({ recommended: 0, notRecommended: 0, noChange: 0 });
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const result = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/ipa?${params}`,
        options: { method: 'GET' },
      });

      if (!result?.success) {
        // 403/404/network — treat as disabled, hide the tab
        setEnabled(false);
        setCandidates([]);
        return;
      }

      const body = result.data || {};
      setEnabled(body.enabled === true);
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
      setCounts(body.counts || { recommended: 0, notRecommended: 0, noChange: 0 });
    } catch (err) {
      console.warn('[IPA] opportunities unavailable:', err);
      setEnabled(false);
      setCandidates([]);
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { candidates, counts, enabled, loading, error, retry: fetchData };
}

/**
 * POST an action on a candidate: 'accept' | 'snooze' | 'dismiss' (+ optional reason).
 * Returns true on success.
 */
export async function postIpaAction(id, action, reason) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/ipa/${id}/action`,
      options: { method: 'POST', body: JSON.stringify({ action, reason }) },
    });
    return result?.success === true && result?.data?.success === true;
  } catch (err) {
    console.warn('[IPA] action failed:', err);
    return false;
  }
}
