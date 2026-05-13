import { useCallback, useEffect, useState } from 'preact/hooks';
import { ModuleDisabledError, RoundingAPI } from '../api/rounding-api.js';

/** Lists sessions for the facility. Returns { sessions, loading, error, moduleDisabled, refresh, start }. */
export function useRoundingReports({ facilityName, orgSlug, enabled = true }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !facilityName || !orgSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await RoundingAPI.list({ facilityName, orgSlug });
      setSessions(data?.sessions || []);
      setModuleDisabled(false);
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        setModuleDisabled(true);
        setSessions([]);
      } else {
        console.error('[RoundingReports] list failed:', err);
        setError(err.message || 'Failed to load rounding reports');
      }
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const start = useCallback(async () => {
    if (!facilityName || !orgSlug) throw new Error('Missing facility');
    const data = await RoundingAPI.start({ facilityName, orgSlug });
    return data?.sessionId;
  }, [facilityName, orgSlug]);

  /** Optimistically remove a session from the list, then call DELETE.
   *  On failure, restore the original list and rethrow. */
  const remove = useCallback(async (sessionId) => {
    if (!facilityName || !orgSlug) throw new Error('Missing facility');
    let prev;
    setSessions((current) => {
      prev = current;
      return current.filter((s) => s.id !== sessionId);
    });
    try {
      await RoundingAPI.del({ sessionId, facilityName, orgSlug });
    } catch (err) {
      if (prev) setSessions(prev);
      throw err;
    }
  }, [facilityName, orgSlug]);

  return { sessions, loading, error, moduleDisabled, refresh, start, remove };
}
