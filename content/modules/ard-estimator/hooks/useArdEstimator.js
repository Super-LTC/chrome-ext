import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Hook to fetch ARD recommendation data and manage day selection state.
 *
 * @param {Object} params
 * @param {string} params.patientId - PCC external patient ID
 * @param {string} params.facilityName - PCC facility name
 * @param {string} params.orgSlug - Organization slug
 * @param {string} [params.assessmentId] - PCC external assessment ID (optional)
 */
export function useArdEstimator({ patientId, facilityName, orgSlug, assessmentId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      if (assessmentId) params.set('externalAssessmentId', assessmentId);
      if (patientId) params.set('patientExternalId', patientId);
      window.appendMDSContextParams?.(params);

      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/mds/ard-recommendation?${params}`
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch ARD recommendation');
      }

      // Unwrap: chrome.runtime.sendMessage wraps in { success, data }
      // The actual ARD result is in response.data
      const data = response.data || response;

      if (data.success === false) {
        throw new Error(data.error || 'Failed to fetch ARD recommendation');
      }

      setResult(data);

      // Set selected day to recommended on first load
      if (data.recommendedDayNumber) {
        setSelectedDay(prev => prev ?? data.recommendedDayNumber);
      }
    } catch (err) {
      console.error('[ArdEstimator] Fetch error:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'ard_estimator',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load ARD recommendation');
    } finally {
      setLoading(false);
    }
  }, [patientId, facilityName, orgSlug, assessmentId]);

  // Initial fetch
  useEffect(() => {
    if (patientId || assessmentId) fetchData();
  }, [fetchData]);

  // Listen for query-sent and item-decision events to refetch
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('super:query-sent', handler);
    window.addEventListener('super:item-decision', handler);
    return () => {
      window.removeEventListener('super:query-sent', handler);
      window.removeEventListener('super:item-decision', handler);
    };
  }, [fetchData]);

  // Derived state
  const selectedScore = result?.scores?.find(s => s.dayNumber === selectedDay) || null;

  // Categorize items
  const classifiedItems = result?.classifiedItems || [];

  const timeSensitiveItems = classifiedItems.filter(i =>
    i.classification === 'time_sensitive_captured' ||
    i.classification === 'time_sensitive_at_risk' ||
    i.classification === 'time_sensitive_missed'
  );

  const needsReviewItems = classifiedItems.filter(i =>
    i.classification === 'needs_review'
  );

  const queryItems = classifiedItems.filter(i =>
    i.classification === 'item_to_query'
  );

  const alwaysCapturedItems = classifiedItems.filter(i =>
    i.classification === 'always_captured' && hasPdpmImpact(i)
  );

  return {
    result,
    loading,
    error,
    selectedDay,
    setSelectedDay,
    selectedScore,
    timeSensitiveItems,
    needsReviewItems,
    queryItems,
    alwaysCapturedItems,
    refetch: fetchData
  };
}

function hasPdpmImpact(item) {
  return (
    (item.ntaPoints !== null && item.ntaPoints > 0) ||
    !!item.nursingInfo ||
    item.pdpmComponents.length > 0
  );
}
