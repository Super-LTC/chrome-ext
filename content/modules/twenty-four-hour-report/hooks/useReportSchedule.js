import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap, intervalsEqual } from '../utils/api.js';

const DEFAULT_VALID_INTERVALS = [24, 48, 72];

/**
 * useReportSchedule — fetch and update the building's automated report
 * delivery hour AND per-weekday lookback window via
 * /api/extension/24hr-report/schedule.
 */
export function useReportSchedule({ facilityName, orgSlug }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  // Local, editable copy of the 7-day window map (keys "0"–"6" = Sun–Sat).
  const [intervalByDay, setIntervalByDay] = useState(null);

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
      if (data.reportIntervalByDay) setIntervalByDay({ ...data.reportIntervalByDay });
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

  /**
   * PATCH the schedule. Pass any combination of fields:
   *   { scheduleHour?: number, reportIntervalByDay?: { "0".."6": 24|48|72 } }
   * The two fields are independent server-side — send only what changed.
   */
  const updateSchedule = useCallback(async (patch) => {
    if (!facilityName || !orgSlug) return null;
    const body = {};
    if (patch?.scheduleHour != null) body.scheduleHour = patch.scheduleHour;
    if (patch?.reportIntervalByDay != null) body.reportIntervalByDay = patch.reportIntervalByDay;
    if (Object.keys(body).length === 0) return null;
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report/schedule?${params}`,
        options: {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to update schedule');
      const data = unwrap(res.data) || {};
      if (!data.success) throw new Error(data.error || 'Failed to update schedule');
      setSchedule(data);
      setSelectedHour(data.scheduleHour);
      if (data.reportIntervalByDay) setIntervalByDay({ ...data.reportIntervalByDay });
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

  const intervalsDirty =
    schedule != null &&
    intervalByDay != null &&
    !intervalsEqual(intervalByDay, schedule.reportIntervalByDay);

  const validIntervals = schedule?.validIntervals?.length
    ? schedule.validIntervals
    : DEFAULT_VALID_INTERVALS;

  return {
    schedule,
    loading,
    saving,
    error,
    selectedHour,
    setSelectedHour,
    isDirty,
    intervalByDay,
    setIntervalByDay,
    intervalsDirty,
    validIntervals,
    defaultIntervalByDay: schedule?.defaultReportIntervalByDay || null,
    updateSchedule,
    retry: fetchSchedule,
  };
}
