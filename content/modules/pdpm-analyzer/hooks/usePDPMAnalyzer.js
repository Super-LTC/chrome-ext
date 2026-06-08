import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * usePDPMAnalyzer — two-phase fetch for PDPM data.
 *
 * Phase 1 (always):
 *   scope 'mds'     → fetch single-assessment detail via pdpm-potential
 *   scope 'patient'  → fetch assessment list for the patient
 *
 * Phase 2 (patient scope only):
 *   When selectedAssessmentId changes → fetch pdpm-potential for that assessment
 *
 * @param {object} context - { scope, assessmentId, patientId, patientName }
 * @param {string|null} selectedAssessmentId - The assessment to fetch detail for (patient scope)
 * @returns {{ assessments, detail, patientName, loading, detailLoading, error, retry }}
 */
export function usePDPMAnalyzer(context, selectedAssessmentId) {
  const [assessments, setAssessments] = useState([]);
  const [detail, setDetail] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  // Non-null when the backend 404'd because the assessment isn't synced/solved
  // yet — holds the 404 code ('ASSESSMENT_NOT_FOUND' | 'NO_RUN_YET') so the UI
  // can offer "Run it" instead of a generic error. See MdsRunNow.runnableCode.
  const [notSynced, setNotSynced] = useState(null);
  const [listFetchCount, setListFetchCount] = useState(0);
  const [detailFetchCount, setDetailFetchCount] = useState(0);

  const retry = useCallback(() => {
    setListFetchCount(n => n + 1);
  }, []);

  const retryDetail = useCallback(() => {
    setDetailFetchCount(n => n + 1);
  }, []);

  // Helper: get auth + org + facility
  async function getApiContext() {
    const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!authState.authenticated) throw new Error('Please log in to view MDS data');

    const orgResponse = getOrg();
    const orgSlug = orgResponse?.org;
    const facilityName = window.getChatFacilityInfo?.() || '';

    if (!orgSlug || !facilityName) throw new Error('Could not determine organization or facility');
    return { orgSlug, facilityName };
  }

  // ── Phase 1: Fetch assessment list (patient) or single detail (mds) ──
  useEffect(() => {
    if (!context) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      setNotSynced(null);

      try {
        const { orgSlug, facilityName } = await getApiContext();

        if (context.scope === 'mds' && context.assessmentId) {
          // Single assessment — fetch detail directly
          const params = new URLSearchParams({ externalAssessmentId: context.assessmentId, facilityName, orgSlug });
          window.appendMDSContextParams?.(params);
          const result = await chrome.runtime.sendMessage({
            type: 'API_REQUEST',
            endpoint: `/api/extension/mds/pdpm-potential?${params}`,
            options: { method: 'GET' }
          });
          if (!result.success) {
            const code = window.MdsRunNow?.runnableCode?.(result);
            if (code) { if (!cancelled) setNotSynced(code); return; }
            throw new Error(result.error || 'Failed to load MDS data');
          }
          if (!cancelled) {
            setDetail(result.data);
            setPatientName(result.data?.patientName || context.patientName || '');
            setAssessments([]);
          }

        } else if (context.scope === 'patient' && context.patientId) {
          // Patient — fetch assessment list
          const params = new URLSearchParams({ facilityName, orgSlug });
          const result = await chrome.runtime.sendMessage({
            type: 'API_REQUEST',
            endpoint: `/api/extension/patients/${context.patientId}/assessments?${params}`,
            options: { method: 'GET' }
          });
          if (!result.success) throw new Error(result.error || 'Failed to load patient data');

          const responseData = result.data?.data || result.data || result;
          if (!cancelled) {
            setAssessments(responseData.assessments || []);
            setPatientName(responseData.patientName || context.patientName || 'Patient');
            setDetail(null); // detail fetched separately in phase 2
          }
        } else {
          if (!cancelled) {
            setAssessments([]);
            setDetail(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [context?.scope, context?.assessmentId, context?.patientId, listFetchCount]);

  // ── Phase 2: Fetch PDPM detail for selected assessment (patient scope) ──
  useEffect(() => {
    if (context?.scope !== 'patient' || !selectedAssessmentId) return;
    let cancelled = false;

    async function fetchDetail() {
      setDetailLoading(true);
      setDetail(null);
      setNotSynced(null);

      try {
        const { orgSlug, facilityName } = await getApiContext();
        const params = new URLSearchParams({ externalAssessmentId: selectedAssessmentId, facilityName, orgSlug });
        window.appendMDSContextParams?.(params);
        const result = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/mds/pdpm-potential?${params}`,
          options: { method: 'GET' }
        });
        if (!result.success) {
          const code = window.MdsRunNow?.runnableCode?.(result);
          if (code) { if (!cancelled) setNotSynced(code); return; }
          throw new Error(result.error || 'Failed to load assessment data');
        }
        if (!cancelled) setDetail(result.data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load assessment detail');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    fetchDetail();
    return () => { cancelled = true; };
  }, [context?.scope, selectedAssessmentId, detailFetchCount]);

  // Re-fetch PDPM totals when a user decision is made on the MDS overlay
  useEffect(() => {
    function onItemDecision() {
      setDetailFetchCount(n => n + 1);
    }
    window.addEventListener('super:item-decision', onItemDecision);
    return () => window.removeEventListener('super:item-decision', onItemDecision);
  }, []);

  return { assessments, detail, patientName, loading, detailLoading, error, notSynced, retry, retryDetail };
}
