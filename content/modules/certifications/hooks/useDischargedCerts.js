import { useState, useCallback, useEffect, useRef } from 'preact/hooks';

const PAGE_SIZE = 10;
const MAX_PAGE = 50; // server cap

/**
 * Fetches discharged patients (ended Part A stays), newest-discharge-first.
 * Patient-grouped + paginated, distinct from useCertifications.
 *
 * Lazy: nothing is fetched until `enabled` first becomes true (tab opened),
 * so users who never open the Discharged tab pay no request.
 *
 * Endpoint: GET /api/extension/certifications/discharged
 */
export function useDischargedCerts({ facilityName, orgSlug, enabled }) {
  const [patients, setPatients] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);      // first page
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const loadedRef = useRef(false);

  const reportError = useCallback((err) => {
    console.error('[Certifications] Failed to fetch discharged:', err);
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'cert_view',
      error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
      error_type: 'api_error',
    });
    setError(err.message || 'Failed to load discharged certifications');
  }, []);

  const loadFirst = useCallback(async () => {
    if (!facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.CertAPI.fetchDischarged(facilityName, orgSlug, { limit: PAGE_SIZE, offset: 0 });
      setPatients(data.discharged);
      setHasMore(data.hasMore);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, reportError]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !facilityName || !orgSlug) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await window.CertAPI.fetchDischarged(facilityName, orgSlug, { limit: PAGE_SIZE, offset: patients.length });
      // Append; keep already-loaded pages visible on success.
      setPatients(prev => [...prev, ...data.discharged]);
      setHasMore(data.hasMore);
    } catch (err) {
      reportError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, facilityName, orgSlug, patients.length, reportError]);

  // Re-pull the pages currently shown so an action (send/sign/skip/revoke) is
  // reflected. The patient set doesn't grow on an action — only cert statuses
  // change — so refetching the loaded span is sufficient.
  const refetch = useCallback(async () => {
    if (!loadedRef.current || !facilityName || !orgSlug) return;
    const target = patients.length || PAGE_SIZE;
    setError(null);
    try {
      const acc = [];
      let offset = 0;
      let more = false;
      do {
        const data = await window.CertAPI.fetchDischarged(facilityName, orgSlug, { limit: MAX_PAGE, offset });
        acc.push(...data.discharged);
        more = data.hasMore;
        offset += MAX_PAGE;
      } while (acc.length < target && more);
      setPatients(acc);
      setHasMore(more);
    } catch (err) {
      reportError(err);
    }
  }, [facilityName, orgSlug, patients.length, reportError]);

  // Lazy first load, once, when the tab is first opened.
  useEffect(() => {
    if (enabled && !loadedRef.current && facilityName && orgSlug) {
      loadedRef.current = true;
      loadFirst();
    }
  }, [enabled, facilityName, orgSlug, loadFirst]);

  return { patients, hasMore, loading, loadingMore, error, loadMore, refetch };
}
