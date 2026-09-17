import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Every certification send queued at this facility, soonest first.
 *
 * Endpoint: GET /api/extension/certifications/schedules
 *
 * Lazy by design (`enabled`): the facility-wide list only matters once the nurse
 * opens the Scheduled Sends modal, and the cert rows get their own schedule
 * state inline from the certifications payload.
 */
export function useScheduledSends({ facilityName, orgSlug, enabled = true }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const rows = await window.CertAPI.fetchScheduledSends(facilityName, orgSlug);
      setSchedules(rows);
    } catch (err) {
      console.error('[Certifications] Failed to fetch scheduled sends:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'cert_scheduled_sends',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load scheduled sends');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { schedules, loading, error, refetch: fetchData };
}
