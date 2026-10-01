import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * True when the server says this building has care plans switched off: a 403
 * carrying `code: 'CARE_PLAN_DISABLED'` (backend LocationService.isCarePlanEnabled).
 * Any other failure — a per-user grant, a 5xx, a network blip — is NOT this: it
 * keeps the tab and shows its error box, as before.
 */
export function isCarePlanDisabledResponse(result) {
  return result?.success === false && result?.status === 403 && result?.body?.code === 'CARE_PLAN_DISABLED';
}

/**
 * Data fetching hook for facility-wide compliance dashboard.
 *
 * `disabled` is the server's call that care plans are off at this building; the
 * Command Center hides the Care Plan and Rounding tabs on it.
 */
export function useComplianceDashboard({ facilityName, orgSlug, enabled }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [disabled, setDisabled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!enabled || !facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        facilityName: facilityName || '',
        orgSlug: orgSlug || ''
      });

      const result = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/compliance/dashboard?${params}`
      });

      if (isCarePlanDisabledResponse(result)) {
        setDisabled(true);
        setData(null);
        return;
      }
      setDisabled(false);

      if (!result.success) {
        throw new Error(result.error || 'Failed to load compliance dashboard');
      }

      setData(result.data);
    } catch (err) {
      console.error('[ComplianceDashboard] Failed to fetch:', err);
      setError(err.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, enabled]);

  useEffect(() => {
    if (enabled) fetchData();
  }, [fetchData, enabled]);

  return { data, loading, error, disabled, retry: fetchData };
}
