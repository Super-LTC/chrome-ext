import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Fetches certifications list with optional filters.
 * Re-fetches when filters change.
 *
 * Also returns the org's `certForm` (top-level on the response): the checkbox
 * cert form catalog, or null for orgs on the standard form.
 *
 * Endpoint: GET /api/extension/certifications
 */
export function useCertifications({ facilityName, orgSlug, status, patientId }) {
  const [certs, setCerts] = useState([]);
  const [certForm, setCertForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      if (status) params.set('status', status);
      if (patientId) params.set('patientId', patientId);

      const result = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/certifications?${params}`,
        options: { method: 'GET' }
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to load certifications');
      }

      setCerts(result.data?.certifications || []);
      setCertForm(result.data?.certForm ?? null);
    } catch (err) {
      console.error('[Certifications] Failed to fetch certifications:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'cert_view',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load certifications');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, status, patientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { certs, certForm, loading, error, refetch: fetchData };
}
