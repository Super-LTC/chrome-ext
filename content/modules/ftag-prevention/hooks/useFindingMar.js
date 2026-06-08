import { useState, useEffect, useCallback } from 'preact/hooks';
import { apiGet } from '../utils/api.js';

/**
 * useFindingMar — MAR/TAR source view for F684 / F697, finding-anchored.
 *
 *   GET /api/extension/ftag-prevention/findings/[id]/mar?facilityName&orgSlug
 *
 * This is the fix for the dead MAR viewer: the backend derives patient, order
 * filter, and date window FROM THE FINDING, so we don't need an MDS
 * externalAssessmentId (the old /orders/[orderId]/administrations coupling that
 * broke it). The response carries its own `source` with the highlight fields.
 */
export function useFindingMar({ facilityName, orgSlug, findingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!findingId || !facilityName || !orgSlug) {
      setError('Missing finding or facility context');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ facilityName, orgSlug });
    try {
      const res = await apiGet(`/api/extension/ftag-prevention/findings/${findingId}/mar?${params}`);
      setData(res);
    } catch (err) {
      console.error('[FTagPrevention] MAR fetch failed', err);
      setError(err.message || 'Failed to load MAR/TAR');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, findingId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, retry: fetchData };
}
