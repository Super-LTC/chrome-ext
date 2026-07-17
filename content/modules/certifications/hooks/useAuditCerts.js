import { useState, useCallback, useEffect } from 'preact/hooks';

const PAGE_SIZE = 100;   // on-screen page
const EXPORT_PAGE = 500; // server cap — used when pulling every row for CSV

/**
 * Fetches the facility-wide certification AUDIT list (every cert for a facility,
 * un-capped by status or recency), flat + paginated with a total.
 *
 * Lazy: nothing is fetched until `enabled` first becomes true (tab opened).
 * Re-pulls from offset 0 whenever a filter (status / date range) changes.
 *
 * `fetchAll` pulls EVERY matching row across all pages — independent of the
 * on-screen pagination — for CSV export of the complete list.
 *
 * Endpoint: GET /api/extension/certifications/audit
 */
export function useAuditCerts({ facilityName, orgSlug, enabled, status, signedAfter, signedBefore }) {
  const [certs, setCerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);      // first page / filter change
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const reportError = useCallback((err) => {
    console.error('[Certifications] Failed to fetch audit list:', err);
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'cert_view',
      error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
      error_type: 'api_error',
    });
    setError(err.message || 'Failed to load certification audit list');
  }, []);

  const load = useCallback(async () => {
    if (!facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.CertAPI.fetchAuditCerts(facilityName, orgSlug, {
        status, signedAfter, signedBefore, limit: PAGE_SIZE, offset: 0,
      });
      setCerts(data.certs);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, status, signedAfter, signedBefore, reportError]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !facilityName || !orgSlug) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await window.CertAPI.fetchAuditCerts(facilityName, orgSlug, {
        status, signedAfter, signedBefore, limit: PAGE_SIZE, offset: certs.length,
      });
      setCerts(prev => [...prev, ...data.certs]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      reportError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, facilityName, orgSlug, status, signedAfter, signedBefore, certs.length, reportError]);

  // Pull EVERY matching row (all pages) for CSV export — independent of the
  // on-screen list, so an export always reflects the full filtered set even
  // if the user hasn't clicked "Load more". Throws on failure (caller handles).
  const fetchAll = useCallback(async () => {
    if (!facilityName || !orgSlug) return [];
    const acc = [];
    let offset = 0;
    let more = true;
    while (more) {
      const data = await window.CertAPI.fetchAuditCerts(facilityName, orgSlug, {
        status, signedAfter, signedBefore, limit: EXPORT_PAGE, offset,
      });
      acc.push(...data.certs);
      more = data.hasMore && data.certs.length > 0;
      offset += EXPORT_PAGE;
    }
    return acc;
  }, [facilityName, orgSlug, status, signedAfter, signedBefore]);

  // (Re)load on first enable and whenever a filter changes.
  useEffect(() => {
    if (enabled && facilityName && orgSlug) load();
  }, [enabled, facilityName, orgSlug, status, signedAfter, signedBefore, load]);

  return { certs, total, hasMore, loading, loadingMore, error, loadMore, fetchAll, refetch: load };
}
