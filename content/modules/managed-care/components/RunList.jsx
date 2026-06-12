// content/modules/managed-care/components/RunList.jsx
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, groupByDay } from '../lib/recert-utils.js';
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

const PAGE_SIZE = 50;
const REFRESH_MS = 10000;
const LOCATION_MODE_KEY = 'super-mc-location-mode';

export const RunList = ({ orgSlug, patientId, currentFacilityName, onRetry, refreshToken }) => {
  const [runs, setRuns] = useState(null);       // null = not loaded yet
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [locationMode, setLocationMode] = useState(
    () => localStorage.getItem(LOCATION_MODE_KEY) || 'this'
  );
  const [mineOnly, setMineOnly] = useState(true);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const listParams = useCallback((offset = 0) => ({
    orgSlug,
    mine: mineOnly || undefined,
    patientId: patientId || undefined,
    facilityName: locationMode === 'this' && !patientId ? currentFacilityName : undefined,
    limit: PAGE_SIZE,
    offset: offset || undefined,
  }), [orgSlug, mineOnly, patientId, locationMode, currentFacilityName]);

  const fetchRuns = useCallback(async () => {
    const data = await RecertAPI.list(listParams());
    if (data === null) { setLoadError(true); return; }
    setLoadError(false);
    setRuns(data);
    setHasMore(data.length === PAGE_SIZE);
    // Viewing the list clears the badge for everything terminal we can see.
    window.McRunTracker?.markSeen(data.filter((r) => !isInProgress(r.status)).map((r) => r.id));
  }, [listParams]);

  // Initial fetch + refetch on toggle change or external refresh request.
  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshToken]);

  // Poll while anything visible is in flight; also refetch on tracker transitions.
  useEffect(() => {
    const interval = setInterval(() => {
      if (runsRef.current?.some((r) => isInProgress(r.status))) fetchRuns();
    }, REFRESH_MS);
    const unsubscribe = window.McRunTracker?.subscribe(({ transitions }) => {
      if (transitions.length) fetchRuns();
    });
    return () => { clearInterval(interval); unsubscribe?.(); };
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
        <button onClick={fetchRuns}>Retry</button>
      </div>
    );
  }
  if (runs === null) return <ListSkeleton />;

  const showFacility = !patientId && locationMode === 'all';
  const groups = groupByDay(runs);

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
        </div>
      )}

      {groups.length === 0 && <div className="mc-list-empty">No clinical updates yet</div>}

      {groups.map((group) => (
        <div className="mc-run-group" key={group.label}>
          <div className="mc-run-group__label">{group.label}</div>
          {group.runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              showFacility={showFacility}
              showCreator={!mineOnly}
              onArchived={onArchived}
              onRetry={onRetry}
            />
          ))}
        </div>
      ))}

      {hasMore && (
        // NO_TRACK — pagination, not a feature signal
        <button className="mc-load-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};
