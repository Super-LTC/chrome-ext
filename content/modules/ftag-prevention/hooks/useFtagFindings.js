import { useState, useEffect, useCallback } from 'preact/hooks';
import { apiGet } from '../utils/api.js';
import { normalizeFinding } from '../utils/derive.js';

/**
 * useFtagFindings — loads the unified F-Tag feed for the current facility.
 *
 *   GET /api/extension/ftag-prevention/findings?orgSlug&facilityName&sinceDays&status
 *
 * Returns the open findings (normalized) plus the recentlyResolved strip.
 * Refetches when a resolve/snooze mutation fires `super:ftag-changed`.
 */
export function useFtagFindings({ facilityName, orgSlug, sinceDays = 7 }) {
  const [findings, setFindings] = useState([]);
  const [recentlyResolved, setRecentlyResolved] = useState([]);
  const [snoozed, setSnoozed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug) {
      setError('Missing facility or organization context');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const base = { facilityName, orgSlug, sinceDays: String(sinceDays) };
    const openParams = new URLSearchParams({ ...base, status: 'open' });
    const snoozedParams = new URLSearchParams({ ...base, status: 'snoozed' });

    try {
      // Open feed (drives the list + recently-resolved rail) and the snoozed
      // list (its own rail) load in parallel. Snoozed is best-effort.
      const [data, snoozedData] = await Promise.all([
        apiGet(`/api/extension/ftag-prevention/findings?${openParams}`),
        apiGet(`/api/extension/ftag-prevention/findings?${snoozedParams}`).catch(() => null),
      ]);
      const feed = Array.isArray(data?.feed) ? data.feed : [];
      setFindings(feed.map(normalizeFinding));
      const resolved = Array.isArray(data?.recentlyResolved) ? data.recentlyResolved : [];
      setRecentlyResolved(resolved.map((f) => normalizeFinding({ finding: f, status: 'resolved' })));
      const snz = Array.isArray(snoozedData?.feed) ? snoozedData.feed : [];
      setSnoozed(snz.map((it) => normalizeFinding({ ...it, status: 'snoozed' })));
    } catch (err) {
      console.error('[FTagPrevention] fetch failed', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'ftag_prevention',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load F-Tag findings');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, sinceDays, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('super:ftag-changed', handler);
    return () => window.removeEventListener('super:ftag-changed', handler);
  }, [fetchData]);

  return { findings, recentlyResolved, snoozed, loading, error, retry: fetchData };
}
