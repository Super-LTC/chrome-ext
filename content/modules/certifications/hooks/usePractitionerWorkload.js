import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * usePractitionerWorkload — fetches a single practitioner's queue and recent activity.
 *
 * Only fetches when practitionerId is truthy (enabled pattern).
 *
 * @param {string|null} practitionerId
 * @returns {{ data: {practitioner, queue, recentlySigned}|null, loading: boolean, error: string|null, retry: Function }}
 */
export function usePractitionerWorkload(practitionerId, facilityName, orgSlug) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchCount, setFetchCount] = useState(0);

  const retry = useCallback(() => {
    setFetchCount(n => n + 1);
  }, []);

  useEffect(() => {
    if (!practitionerId || !window.CertAPI) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.CertAPI.fetchPractitionerWorkload(practitionerId, facilityName, orgSlug)
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load practitioner data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [practitionerId, facilityName, orgSlug, fetchCount]);

  return { data, loading, error, retry };
}
