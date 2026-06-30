// content/modules/managed-care/components/RunList.jsx
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, groupForTray } from '../lib/recert-utils.js';
import { RunRow } from './RunRow.jsx';
import { track } from '../../../utils/analytics.js';

// Shimmer placeholder mirroring the grouped run-list layout, so the panel
// doesn't pop from a bare "Loading…" into a different shape.
const ListSkeleton = () => (
  <div className="mc-skeleton" aria-hidden="true">
    <div className="mc-skel mc-skel--label" />
    {[88, 72, 80].map((w, i) => (
      <div className="mc-run-row mc-skel-row" key={i}>
        <div className="mc-run-row__main">
          <div className="mc-skel mc-skel--name" style={{ width: `${w + 60}px` }} />
          <div className="mc-skel mc-skel--meta" style={{ width: `${w}px` }} />
        </div>
        <div className="mc-skel mc-skel--btn" />
      </div>
    ))}
  </div>
);

// Calm "nothing today" state — a clipboard with a sun peeking over it.
const EmptyToday = () => (
  <div className="mc-empty-today">
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="40" cy="14" r="7" fill="#fde68a" />
      <g stroke="#f59e0b" stroke-width="2" stroke-linecap="round">
        <line x1="40" y1="2.5" x2="40" y2="5" />
        <line x1="40" y1="23" x2="40" y2="25.5" />
        <line x1="28.5" y1="14" x2="31" y2="14" />
        <line x1="49" y1="14" x2="51.5" y2="14" />
        <line x1="32" y1="6" x2="33.8" y2="7.8" />
        <line x1="46.2" y1="20.2" x2="48" y2="22" />
        <line x1="48" y1="6" x2="46.2" y2="7.8" />
        <line x1="33.8" y1="20.2" x2="32" y2="22" />
      </g>
      <rect x="10" y="14" width="26" height="36" rx="4" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="2" />
      <rect x="17" y="10" width="12" height="8" rx="2" fill="#a7f3d0" stroke="#6ee7b7" stroke-width="2" />
      <line x1="16" y1="26" x2="30" y2="26" stroke="#6ee7b7" stroke-width="2" stroke-linecap="round" />
      <line x1="16" y1="33" x2="30" y2="33" stroke="#6ee7b7" stroke-width="2" stroke-linecap="round" />
      <line x1="16" y1="40" x2="24" y2="40" stroke="#6ee7b7" stroke-width="2" stroke-linecap="round" />
    </svg>
    <div className="mc-empty-today__title">No clinical updates today</div>
    <div className="mc-empty-today__hint">Start one with “New Clinical Update” on a resident's page.</div>
  </div>
);

const PAGE_SIZE = 50;
// Pipeline runs take minutes — 15s steady-state, 3s only in the short window
// after a Generate while the nurse is watching the new row.
const REFRESH_MS = 15000;
const FAST_REFRESH_MS = 3000;
const FAST_WINDOW_MS = 30000;
const LOCATION_MODE_KEY = 'super-mc-location-mode';

export const RunList = ({ orgSlug, patientId, currentFacilityName, refreshToken }) => {
  const [runs, setRuns] = useState(null);       // null = not loaded yet
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [locationMode, setLocationMode] = useState(
    () => localStorage.getItem(LOCATION_MODE_KEY) || 'this'
  );
  const [mineOnly, setMineOnly] = useState(true);
  const [olderOpen, setOlderOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');   // all | active | done | failed
  const [locationFilter, setLocationFilter] = useState('all');
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const lastCreateRef = useRef(0);

  const listParams = useCallback((offset = 0) => ({
    orgSlug,
    mine: mineOnly || undefined,
    patientId: patientId || undefined,
    facilityName: locationMode === 'this' && !patientId ? currentFacilityName : undefined,
    limit: PAGE_SIZE,
    offset: offset || undefined,
  }), [orgSlug, mineOnly, patientId, locationMode, currentFacilityName]);

  // force=true bypasses the list TTL cache — used by liveness-driven fetches
  // (polling, tab-focus catch-up, tracker transitions, manual Retry). Mount
  // and toggle fetches stay cacheable so a flurry of them collapses to one call.
  const fetchRuns = useCallback(async ({ force = false } = {}) => {
    const data = await RecertAPI.list(listParams(), { force });
    if (data === null) { setLoadError(true); return; }
    setLoadError(false);
    setRuns(data);
    setHasMore(data.length === PAGE_SIZE);
    // Viewing the list clears the badge for everything terminal we can see.
    window.McRunTracker?.markSeen(data.filter((r) => !isInProgress(r.status)).map((r) => r.id));
  }, [listParams]);

  // Initial fetch + refetch on toggle change or external refresh request.
  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshToken]);

  // refreshToken bumps when a Generate just happened — open the fast window.
  useEffect(() => {
    if (refreshToken > 0) lastCreateRef.current = Date.now();
  }, [refreshToken]);

  // Poll while anything visible is in flight; re-evaluated every tick, paused
  // in hidden tabs (catch-up fetch on return), 3s right after a Generate then
  // 15s. Also refetch on tracker transitions.
  useEffect(() => {
    let timer;
    const schedule = () => {
      const fast = Date.now() - lastCreateRef.current < FAST_WINDOW_MS;
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible'
            && runsRef.current?.some((r) => isInProgress(r.status))) {
          fetchRuns({ force: true });
        }
        schedule();
      }, fast ? FAST_REFRESH_MS : REFRESH_MS);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible'
          && runsRef.current?.some((r) => isInProgress(r.status))) {
        fetchRuns({ force: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = window.McRunTracker?.subscribe(({ transitions, discovered }) => {
      // Refetch on terminal transitions AND when the watcher spots a run the
      // nurse just created over in the dashboard.
      if (transitions.length || discovered) fetchRuns({ force: true });
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe?.();
    };
  }, [fetchRuns]);

  const loadMore = async () => {
    setLoadingMore(true);
    const data = await RecertAPI.list(listParams(runs.length));
    setLoadingMore(false);
    if (data === null) return;
    setRuns([...runs, ...data]);
    setHasMore(data.length === PAGE_SIZE);
  };

  const setMode = (mode) => {
    setLocationMode(mode);
    localStorage.setItem(LOCATION_MODE_KEY, mode);
    track('mc_location_mode_changed', { mode });
  };

  const onArchived = (id) => {
    setRuns(runs.filter((r) => r.id !== id));
    window.McRunTracker?.untrack(id);
  };

  if (loadError) {
    return (
      <div className="mc-list-error">
        Couldn't load clinical updates.
        {/* NO_TRACK — transient-error retry, not a user feature */}
        <button onClick={() => fetchRuns({ force: true })}>Retry</button>
      </div>
    );
  }
  if (runs === null) return <ListSkeleton />;

  const showFacility = !patientId && locationMode === 'all';

  // Client-side filters over the loaded page — search, status, location.
  const locationNames = showFacility
    ? [...new Set(runs.map((r) => r.locationName || r.facilityName).filter(Boolean))].sort()
    : [];
  const q = query.trim().toLowerCase();
  const filtered = runs.filter((r) => {
    if (q && !`${r.patientName || ''} ${r.payerName || ''}`.toLowerCase().includes(q)) return false;
    if (statusFilter === 'active' && !isInProgress(r.status)) return false;
    if (statusFilter === 'done' && r.status !== 'completed') return false;
    if (statusFilter === 'failed' && r.status !== 'failed') return false;
    if (locationFilter !== 'all' && (r.locationName || r.facilityName) !== locationFilter) return false;
    return true;
  });
  const isFiltering = q || statusFilter !== 'all' || locationFilter !== 'all';
  const tray = groupForTray(filtered);
  const rowFor = (run) => (
    <RunRow
      key={run.id}
      run={run}
      showFacility={showFacility}
      showCreator={!mineOnly}
      onArchived={onArchived}
    />
  );

  return (
    <div className="mc-run-list">
      {!patientId && (
        <div className="mc-toolbar">
          <div className="mc-toggle">
            <button
              className={`mc-toggle__btn ${locationMode === 'this' ? 'mc-toggle__btn--active' : ''}`}
              onClick={() => setMode('this')}
            >This location</button>
            <button
              className={`mc-toggle__btn ${locationMode === 'all' ? 'mc-toggle__btn--active' : ''}`}
              onClick={() => setMode('all')}
            >All locations</button>
          </div>
          <div className="mc-toggle">
            <button
              className={`mc-toggle__btn ${mineOnly ? 'mc-toggle__btn--active' : ''}`}
              onClick={() => setMineOnly(true)}
            >Mine</button>
            <button
              className={`mc-toggle__btn ${!mineOnly ? 'mc-toggle__btn--active' : ''}`}
              onClick={() => setMineOnly(false)}
            >Everyone</button>
          </div>
          <input
            className="mc-filter-search"
            type="search"
            placeholder="Search patient or payer…"
            value={query}
            onInput={(e) => setQuery(e.target.value)}
          />
          <select className="mc-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">In progress</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
          {showFacility && locationNames.length > 0 && (
            <select className="mc-filter-select" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="all">All locations</option>
              {locationNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="mc-run-group">
        <div className="mc-run-group__label">Today</div>
        {tray.today.length
          ? tray.today.map(rowFor)
          : isFiltering
            ? <div className="mc-list-empty">No runs today match your filters</div>
            : <EmptyToday />}
      </div>

      {tray.week.length > 0 && (
        <div className="mc-run-group">
          <div className="mc-run-group__label">Earlier this week</div>
          {tray.week.map(rowFor)}
        </div>
      )}

      {tray.older.length > 0 && (
        <div className="mc-run-group">
          {/* NO_TRACK — list disclosure, not a feature signal */}
          <button className="mc-older-toggle" onClick={() => setOlderOpen(!olderOpen)}>
            <span className={`mc-older-toggle__chevron ${olderOpen ? 'mc-older-toggle__chevron--open' : ''}`}>›</span>
            Older
            <span className="mc-older-toggle__count">{tray.older.length}</span>
          </button>
          {olderOpen && tray.older.map(rowFor)}
        </div>
      )}

      {hasMore && (
        // NO_TRACK — pagination, not a feature signal
        <button className="mc-load-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};
