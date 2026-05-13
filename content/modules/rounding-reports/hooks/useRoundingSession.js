import { useCallback, useEffect, useState } from 'preact/hooks';
import { RoundingAPI } from '../api/rounding-api.js';

/** Loads session detail. Returns { detail, loading, error, refresh, mintQr }. */
export function useRoundingSession({ sessionId, facilityName, orgSlug }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!sessionId || !facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await RoundingAPI.detail({ sessionId, facilityName, orgSlug });
      setDetail(data?.detail || null);
    } catch (err) {
      console.error('[RoundingSession] detail failed:', err);
      setError(err.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId, facilityName, orgSlug]);

  useEffect(() => { refresh(); }, [refresh]);

  const mintQr = useCallback(async () => {
    if (!sessionId || !facilityName || !orgSlug) throw new Error('Missing facility or session');
    return RoundingAPI.qrLink({ sessionId, facilityName, orgSlug });
  }, [sessionId, facilityName, orgSlug]);

  return { detail, loading, error, refresh, mintQr };
}
