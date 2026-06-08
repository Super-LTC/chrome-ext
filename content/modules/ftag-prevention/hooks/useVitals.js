import { useState, useEffect, useCallback } from 'preact/hooks';
import { apiGet } from '../utils/api.js';

/**
 * useVitals — the source view for F580 / F692.
 *
 *   GET /api/extension/vitals?orgSlug&facilityName&patientId
 *       [&vitalType][&startDate&endDate]
 *
 * Per backend PR #593 the finding's `source` descriptor tells us the vital type
 * AND the clinically-correct date window, so we push both into the query and
 * fetch ~60 rows instead of the resident's entire history (~6.4k). `vitalType`
 * is raw snake_case and passed verbatim; `dateRange` is { start, end } as
 * inclusive YYYY-MM-DD. Both are optional — omit for the full-history fallback.
 */
export function useVitals({ facilityName, orgSlug, patientId, vitalType, dateRange }) {
  const [vitals, setVitals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const start = dateRange?.start || null;
  const end = dateRange?.end || null;

  const fetchData = useCallback(async () => {
    if (!patientId || !facilityName || !orgSlug) {
      setError('Missing patient or facility context');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ facilityName, orgSlug, patientId });
    if (vitalType) params.set('vitalType', vitalType); // pass snake_case verbatim
    if (start && end) { // only a full, parseable window — else fall back to full history
      params.set('startDate', start);
      params.set('endDate', end);
    }

    try {
      const data = await apiGet(`/api/extension/vitals?${params}`);
      setVitals(Array.isArray(data?.vitals) ? data.vitals : (Array.isArray(data) ? data : []));
    } catch (err) {
      console.error('[FTagPrevention] vitals fetch failed', err);
      setError(err.message || 'Failed to load vitals');
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, patientId, vitalType, start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { vitals, loading, error, retry: fetchData };
}
