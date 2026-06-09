import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useReportSchedule — fetch and update the building's automated report
 * delivery hour via /api/extension/24hr-report/schedule.
 */
export function useReportSchedule({ facilityName, orgSlug }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);

  const fetchSchedule = useCallback(async () => {
    if (!facilityName || !orgSlug) {
      setError('Missing facility or organization context');
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report/schedule?${params}`,
        options: { method: 'GET' },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to load schedule');
      const data = unwrap(res.data) || {};
      if (!data.success) throw new Error(data.error || 'Failed to load schedule');
      setSchedule(data);
      setSelectedHour(data.scheduleHour);
      setLoading(false);
      return data;
    } catch (err) {
      console.error('[24HR] schedule fetch failed', err);
      setError(err.message || 'Failed to load report schedule');
      setLoading(false);
      return null;
    }
  }, [facilityName, orgSlug]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const updateSchedule = useCallback(async (hour) => {
    if (!facilityName || !orgSlug) return null;
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report/schedule?${params}`,
        options: {
          method: 'PATCH',
          body: JSON.stringify({ scheduleHour: hour }),
        },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to update schedule');
      const data = unwrap(res.data) || {};
      if (!data.success) throw new Error(data.error || 'Failed to update schedule');
      setSchedule(data);
      setSelectedHour(data.scheduleHour);
      setError(null);
      return data;
    } catch (err) {
      console.error('[24HR] schedule update failed', err);
      const message = err.message || 'Failed to update report schedule';
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [facilityName, orgSlug]);

  const isDirty =
    schedule != null &&
    selectedHour != null &&
    selectedHour !== schedule.scheduleHour;

  return {
    schedule,
    loading,
    saving,
    error,
    selectedHour,
    setSelectedHour,
    isDirty,
    updateSchedule,
    retry: fetchSchedule,
  };
}
