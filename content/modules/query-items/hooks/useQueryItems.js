import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Hook to fetch and merge queryable-items + pdpm-potential data
 * @param {Object} params
 * @param {string} params.patientId
 * @param {string} params.facilityName
 * @param {string} params.orgSlug
 * @param {string} params.assessmentId - External assessment ID for pdpm-potential
 */
export function useQueryItems({ patientId, facilityName, orgSlug, assessmentId }) {
  const [items, setItems] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pdpmData, setPdpmData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build params for queryable-items
      const qiParams = new URLSearchParams({
        patientId,
        facilityName,
        orgSlug
      });
      if (assessmentId) qiParams.set('externalAssessmentId', assessmentId);
      window.appendMDSContextParams?.(qiParams);

      // Fetch queryable-items first
      const qiResponse = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/mds/queryable-items?${qiParams}`
      });

      if (!qiResponse.success) {
        throw new Error(qiResponse.error || 'Failed to fetch queryable items');
      }

      const qiData = qiResponse.data || {};

      // Resolve the assessment ID — prefer prop, fall back to API response
      const resolvedAssessmentId = assessmentId
        || qiData.assessment?.externalAssessmentId
        || null;

      // Fetch PDPM potential (needs externalAssessmentId)
      let pdpm = {};
      if (resolvedAssessmentId) {
        const pdpmParams = new URLSearchParams({
          facilityName,
          orgSlug,
          externalAssessmentId: resolvedAssessmentId
        });
        window.appendMDSContextParams?.(pdpmParams);

        const pdpmResponse = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/mds/pdpm-potential?${pdpmParams}`
        });

        pdpm = pdpmResponse.success ? (pdpmResponse.data || {}) : {};
      }

      // Build lookup of PDPM impact by mdsItem from enhancedDetections + outstandingQueries
      const pdpmImpactMap = {};

      if (pdpm.enhancedDetections) {
        for (const det of pdpm.enhancedDetections) {
          pdpmImpactMap[det.mdsItem] = {
            wouldChangeHipps: det.wouldChangeHipps,
            impact: det.impact
          };
        }
      }

      if (pdpm.outstandingQueries) {
        for (const q of pdpm.outstandingQueries) {
          if (q.pdpmImpact) {
            pdpmImpactMap[q.mdsItem] = {
              wouldChangeHipps: q.pdpmImpact.wouldChangeHipps,
              impact: q.pdpmImpact.componentImpacts || q.pdpmImpact
            };
          }
        }
      }

      // Merge: annotate each item with pdpmImpact
      const rawItems = qiData.items || [];
      const mergedItems = rawItems.map(item => ({
        ...item,
        pdpmImpact: pdpmImpactMap[item.mdsItem] || null
      }));

      setItems(mergedItems);
      setAssessment(qiData.assessment || pdpm.assessment || null);
      setSummary(qiData.summary || null);
      setPdpmData({
        currentHipps: pdpm.summary?.currentHipps || pdpm.calculation?.hippsCode || null,
        potentialHipps: pdpm.summary?.potentialHippsIfCoded || null,
        hasImprovements: pdpm.summary?.hasImprovements || false,
        calculation: pdpm.calculation || null,
        enhancedDetections: pdpm.enhancedDetections || []
      });
    } catch (err) {
      console.error('[QueryItems] Failed to fetch data:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'query_items',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, facilityName, orgSlug, assessmentId]);

  useEffect(() => {
    if (patientId && facilityName && orgSlug) {
      fetchData();
    } else {
      // Don't leave loading=true forever if params are missing
      setLoading(false);
      setError('Missing required context (patient, facility, or organization).');
    }
  }, [fetchData]);

  return {
    items,
    setItems,
    assessment,
    summary,
    pdpmData,
    loading,
    error,
    retry: fetchData
  };
}
