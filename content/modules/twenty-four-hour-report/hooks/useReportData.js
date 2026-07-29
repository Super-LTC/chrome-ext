import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import {
  unwrap,
  todayInFacilityTz,
  addDays,
  facilityDateFromReport,
} from '../utils/api.js';

/**
 * useReportData — drives the 24-hour report panel.
 *
 *   GET /api/extension/24hr-report?facilityName&orgSlug
 *     → { locationId, timezone, reports: [{ id, reportDate, status, counts }] }
 *
 *   GET /api/extension/24hr-report?facilityName&orgSlug&date=YYYY-MM-DD
 *     → { report: {...} }  (or 404 → null)
 *
 * Surface:
 *   { availableDates, timezone, currentDate, currentReport,
 *     loading, listLoading, error, listError,
 *     goToDate, goPrevDay, goNextDay, goToNearestAvailable, retry }
 */
export function useReportData({ facilityName, orgSlug, initialDate = null }) {
  const [timezone, setTimezone] = useState(null);
  const [availableDates, setAvailableDates] = useState([]); // sorted desc, array of YYYY-MM-DD
  const [availableByDate, setAvailableByDate] = useState({}); // date → list item (for counts on empty filtered view)
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [currentReport, setCurrentReport] = useState(undefined); // undefined = not yet loaded; null = confirmed empty
  const [signoffEnabled, setSignoffEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // In-memory cache: date → report | null.  null means we've confirmed no
  // report exists for that day.
  const cacheRef = useRef(new Map());

  const fetchList = useCallback(async () => {
    if (!facilityName || !orgSlug) {
      setListError('Missing facility or organization context');
      setListLoading(false);
      return null;
    }
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report?${params}`,
        options: { method: 'GET' },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to load reports list');
      const data = unwrap(res.data) || {};
      const tz = data.timezone || null;
      const reports = Array.isArray(data.reports) ? data.reports : [];

      const dates = [];
      const byDate = {};
      for (const item of reports) {
        const d = facilityDateFromReport(item, tz);
        if (d) {
          dates.push(d);
          byDate[d] = item;
        }
      }
      dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // desc

      setTimezone(tz);
      setAvailableDates(dates);
      setAvailableByDate(byDate);
      setListLoading(false);
      return { timezone: tz, dates };
    } catch (err) {
      console.error('[24HR] list fetch failed', err);
      setListError(err.message || 'Failed to load 24-hour reports');
      setListLoading(false);
      return null;
    }
  }, [facilityName, orgSlug]);

  const fetchDay = useCallback(async (date) => {
    if (!date || !facilityName || !orgSlug) return;
    // Serve from cache
    const cached = cacheRef.current.get(date);
    if (cached !== undefined) {
      setCurrentReport(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ facilityName, orgSlug, date });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report?${params}`,
        options: { method: 'GET' },
      });
      // 404 on the server surfaces as success=false with a specific status.
      // Treat "not found" as null (no report that day) rather than an error.
      if (!res?.success) {
        const notFound = (res?.status === 404) || /not found/i.test(res?.error || '');
        if (notFound) {
          cacheRef.current.set(date, null);
          setCurrentReport(null);
          setLoading(false);
          return;
        }
        throw new Error(res?.error || 'Failed to load report');
      }
      const data = unwrap(res.data) || {};
      // Per-building pilot switch for sign-off / comments / follow-up. Comes
      // back with the report because it is a property of the FACILITY, not the
      // day — an older extension simply gets undefined and shows no rail.
      setSignoffEnabled(data.signoffEnabled === true);
      const report = data.report || null;
      cacheRef.current.set(date, report);
      setCurrentReport(report);
    } catch (err) {
      console.error('[24HR] day fetch failed', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'report_24hr',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load report');
      setCurrentReport(undefined);
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug]);

  // Initial load: list first, then decide on currentDate and fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchList();
      if (cancelled || !result) return;
      const { timezone: tz, dates } = result;
      const startDate =
        initialDate ||
        dates[0] ||
        todayInFacilityTz(tz);
      setCurrentDate(startDate);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchList]);

  // Fetch the current day whenever it changes.
  useEffect(() => {
    if (currentDate) fetchDay(currentDate);
  }, [currentDate, fetchDay]);

  const goToDate = useCallback((date) => {
    if (!date) return;
    setCurrentDate(date);
  }, []);

  const goPrevDay = useCallback(() => {
    setCurrentDate(d => (d ? addDays(d, -1) : d));
  }, []);

  const goNextDay = useCallback(() => {
    setCurrentDate(d => (d ? addDays(d, 1) : d));
  }, []);

  /**
   * Jump to the nearest available date in the given direction ('prev' | 'next').
   * Used by the empty-day "Jump to last available" button.
   */
  const goToNearestAvailable = useCallback((direction = 'prev') => {
    setCurrentDate(current => {
      if (!current || availableDates.length === 0) return current;
      if (direction === 'prev') {
        // Largest availableDate <= current (or strictly less if current is itself available but we still want "prev")
        const target = availableDates.find(d => d < current) || availableDates[0];
        return target || current;
      }
      // next
      // Smallest availableDate > current
      const sortedAsc = [...availableDates].sort();
      const target = sortedAsc.find(d => d > current);
      return target || current;
    });
  }, [availableDates]);

  const retry = useCallback(() => {
    if (currentDate) {
      cacheRef.current.delete(currentDate);
      fetchDay(currentDate);
    }
  }, [currentDate, fetchDay]);

  const retryList = useCallback(() => {
    fetchList();
  }, [fetchList]);

  return {
    availableDates,
    availableByDate,
    timezone,
    currentDate,
    currentReport,
    signoffEnabled,
    loading,
    listLoading,
    error,
    listError,
    goToDate,
    goPrevDay,
    goNextDay,
    goToNearestAvailable,
    retry,
    retryList,
  };
}
