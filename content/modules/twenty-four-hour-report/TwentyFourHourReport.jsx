/**
 * TwentyFourHourReport — root of the 24-hour clinical report panel.
 *
 * Launched from FAB via TwentyFourHourReportLauncher. Right-side panel
 * (~680px) with day-to-day navigation and auto-restore on open-in-PCC.
 *
 * See docs/plans/2026-04-23-24hr-report-extension-design.md.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useReportData } from './hooks/useReportData.js';
import { useRestoreFromPCC } from './hooks/useRestoreFromPCC.js';
import { formatFacilityDate, todayInFacilityTz } from './utils/api.js';
import { SeverityCards } from './components/SeverityCards.jsx';
import { FiltersBar } from './components/FiltersBar.jsx';
import { FindingRow } from './components/FindingRow.jsx';
import { LoadingState } from './components/LoadingState.jsx';
import { EmptyDay } from './components/EmptyDay.jsx';
import { writeRestorePayload } from './utils/restore.js';
import { track } from '../../utils/analytics.js';

/**
 * Bucket free-text search input length so we can track filter usage without
 * leaking the actual search text (which can include patient names).
 */
function searchLengthBucket(s) {
  const len = (s || '').trim().length;
  if (len === 0) return 'empty';
  if (len <= 3) return 'short';
  if (len <= 10) return 'medium';
  return 'long';
}

const ALL_SEVERITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Extract the list of findings from the report, regardless of shape variance.
 */
function getFindings(report) {
  if (!report) return [];
  if (Array.isArray(report.findings)) return report.findings;
  if (Array.isArray(report.items)) return report.items;
  return [];
}

/**
 * Get severity counts: prefer the server-provided `counts`, fall back to
 * deriving from findings so we still render a strip on older payloads.
 */
function getSeverityCounts(report) {
  const base = { critical: 0, high: 0, medium: 0, low: 0 };
  if (!report) return base;
  if (report.counts && typeof report.counts === 'object') {
    return { ...base, ...report.counts };
  }
  for (const f of getFindings(report)) {
    const sev = (f.severity || '').toLowerCase();
    if (sev in base) base[sev] += 1;
  }
  return base;
}

export function TwentyFourHourReport({ facilityName, orgSlug, restore, onClose }) {
  const {
    availableDates,
    timezone,
    currentDate,
    currentReport,
    loading,
    listLoading,
    error,
    listError,
    goToDate,
    goPrevDay,
    goNextDay,
    retry,
    retryList,
  } = useReportData({
    facilityName,
    orgSlug,
    initialDate: restore?.date || null,
  });

  const today = useMemo(() => todayInFacilityTz(timezone), [timezone]);
  const latestAvailable = availableDates[0] || null;
  const oldestAvailable = availableDates[availableDates.length - 1] || null;

  const canGoPrev = !!currentDate && (!oldestAvailable || currentDate > oldestAvailable);
  const canGoNext = !!currentDate && currentDate < today;
  const showJumpToToday = !!currentDate && !!latestAvailable && currentDate !== latestAvailable;

  // Fire panel-open event once on mount.
  useEffect(() => {
    track('report_24hr_opened', { source: 'fab' });
  }, []);

  // Mark today's report seen the moment the nurse views it (FYI notification).
  // Keyed on reportDateLocal (facility-local date), NOT the UTC reportDate.
  // Best-effort; clears the report's contribution from the FAB "S" badge.
  const seenReportDateRef = useRef(null);
  useEffect(() => {
    const dateLocal = currentReport?.reportDateLocal;
    if (!dateLocal || currentReport?.seenByMe !== false) return;
    if (seenReportDateRef.current === dateLocal) return;
    seenReportDateRef.current = dateLocal;
    window.NotificationsAPI?.markSeen([window.NOTIFICATION_KEYS.report24h(dateLocal)])
      .then(() => window.updateMDSBadge?.());
  }, [currentReport]);

  // Filter state — lives at the panel root so filters + cards + list share it.
  const [activeSeverities, setActiveSeverities] = useState(new Set(ALL_SEVERITIES));

  const toggleSeverity = (sev) => {
    track('report_24hr_filter_changed', { filter: 'severity', value: sev });
    setActiveSeverities(prev => {
      const next = new Set(prev);
      // If everything is active, clicking a card isolates that severity
      // (matches the web UX: "show me just the critical ones").
      if (next.size === ALL_SEVERITIES.length) {
        return new Set([sev]);
      }
      if (next.has(sev)) {
        next.delete(sev);
        // Empty set = re-enable everything (prevents "no cards selected" dead state).
        if (next.size === 0) return new Set(ALL_SEVERITIES);
      } else {
        next.add(sev);
      }
      return next;
    });
  };

  const severityCounts = useMemo(
    () => getSeverityCounts(currentReport),
    [currentReport]
  );

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);

  // Track search input as a length bucket — never the raw text (PHI risk).
  const lastSearchBucketRef = useRef('empty');
  const handleSearchChange = (next) => {
    setSearch(next);
    const bucket = searchLengthBucket(next);
    if (bucket !== lastSearchBucketRef.current) {
      lastSearchBucketRef.current = bucket;
      track('report_24hr_filter_changed', { filter: 'search', value: bucket });
    }
  };

  const handleCategoryChange = (next) => {
    setCategory(next);
    track('report_24hr_filter_changed', {
      filter: 'category',
      value: next || 'all',
    });
  };

  const allFindings = useMemo(() => getFindings(currentReport), [currentReport]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const f of allFindings) {
      if (f?.category) set.add(f.category);
    }
    return [...set].sort();
  }, [allFindings]);

  const filteredFindings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = allFindings.filter(f => {
      const sev = (f.severity || '').toLowerCase();
      if (!activeSeverities.has(sev)) return false;
      if (category && f.category !== category) return false;
      if (needle) {
        const haystack = [
          f.patientName,
          f.patientFirstName,
          f.patientLastName,
          f.room,
          f.patientRoom,
          f.category,
          f.subcategory,
          f.type,
          f.findingType,
          f.finding,
          f.findingText,
          f.narrative,
          f.description,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    // Sort by severity: critical → high → medium → low.
    const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
    return filtered.sort((a, b) => {
      const ra = sevRank[(a.severity || '').toLowerCase()] ?? 9;
      const rb = sevRank[(b.severity || '').toLowerCase()] ?? 9;
      if (ra !== rb) return ra - rb;
      // tie-break: keep original backend order by patient name
      return (a.patientName || '').localeCompare(b.patientName || '');
    });
  }, [allFindings, activeSeverities, category, search]);

  const hasActiveFilters =
    !!search.trim() ||
    !!category ||
    activeSeverities.size !== ALL_SEVERITIES.length;

  const clearFilters = () => {
    track('report_24hr_filter_changed', { filter: 'clear', value: 'all' });
    setSearch('');
    lastSearchBucketRef.current = 'empty';
    setCategory(null);
    setActiveSeverities(new Set(ALL_SEVERITIES));
  };

  const listRef = useRef(null);
  const bodyRef = useRef(null);

  useRestoreFromPCC({
    payload: restore,
    currentReport,
    currentDate,
    bodyRef,
  });

  const handleOpenInPCC = (finding, { href }) => {
    if (!href) return;
    const scrollTop = bodyRef.current?.scrollTop ?? 0;
    writeRestorePayload({
      facilityName,
      orgSlug,
      date: currentDate,
      findingId: finding.id || finding.findingId || null,
      scrollTop,
    });
    window.location.href = href;
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div class="thr__overlay" onClick={handleBackdropClick}>
      <aside
        class="thr__panel"
        role="dialog"
        aria-modal="true"
        aria-label="24-Hour Report"
      >
        <header class="thr__header">
          <div class="thr__header-top">
            <div class="thr__titles">
              <span class="thr__title">24-Hour Report</span>
              {facilityName && (
                <span class="thr__facility">{facilityName}</span>
              )}
            </div>
            {/* NO_TRACK */}
            <button
              class="thr__close"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              &times;
            </button>
          </div>
          <div class="thr__header-date">
            {/* NO_TRACK */}
            <button
              class="thr__nav-btn"
              onClick={goPrevDay}
              disabled={!canGoPrev}
              aria-label="Previous day"
            >‹</button>
            <span class="thr__date">
              {currentDate
                ? formatFacilityDate(currentDate, timezone, { weekday: 'short' })
                : '—'}
            </span>
            {/* NO_TRACK */}
            <button
              class="thr__nav-btn"
              onClick={goNextDay}
              disabled={!canGoNext}
              aria-label="Next day"
            >›</button>
            {showJumpToToday && (
              // NO_TRACK
              <button
                class="thr__jump-today"
                onClick={() => goToDate(latestAvailable)}
              >
                Jump to today
              </button>
            )}
          </div>
        </header>

        {currentReport && (
          <>
            <SeverityCards
              counts={severityCounts}
              activeSeverities={activeSeverities}
              onToggle={toggleSeverity}
            />
            <FiltersBar
              search={search}
              onSearchChange={handleSearchChange}
              category={category}
              onCategoryChange={handleCategoryChange}
              categories={categories}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              visibleCount={filteredFindings.length}
              totalCount={allFindings.length}
            />
          </>
        )}

        <div class="thr__body" ref={bodyRef}>
          {listError && (
            <div class="thr__error">
              <p>Couldn't load 24-hour reports.</p>
              {/* NO_TRACK */}
              <button onClick={retryList}>Retry</button>
            </div>
          )}

          {!listError && error && (
            <div class="thr__error">
              <p>Couldn't load this report.</p>
              {/* NO_TRACK */}
              <button onClick={retry}>Retry</button>
            </div>
          )}

          {!listError && !error && (loading || (listLoading && !currentDate)) && <LoadingState />}

          {!listError && !error && !loading && currentReport === null && (
            <EmptyDay
              variant={availableDates.length === 0 ? 'ever' : 'day'}
              date={currentDate}
              timezone={timezone}
              onJumpToLastAvailable={
                availableDates.length > 0
                  ? () => goToDate(latestAvailable)
                  : undefined
              }
            />
          )}

          {!listError && !error && !loading && currentReport && filteredFindings.length === 0 && allFindings.length > 0 && (
            <div class="thr__placeholder">
              No findings match these filters.{' '}
              {/* NO_TRACK — clearFilters() emits the filter-cleared event */}
              <button class="thr__inline-link" onClick={clearFilters}>Clear</button>
            </div>
          )}

          {!listError && !error && !loading && currentReport && allFindings.length === 0 && (
            <div class="thr__placeholder">This report has no findings.</div>
          )}

          {!listError && !error && !loading && currentReport && filteredFindings.length > 0 && (
            <ul class="thr__row-list" ref={listRef}>
              {filteredFindings.map((f, i) => (
                <FindingRow key={f.id || i} finding={f} onOpenInPCC={handleOpenInPCC} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
