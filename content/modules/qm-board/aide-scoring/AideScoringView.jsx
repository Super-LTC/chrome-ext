/**
 * Aide Scoring Quality — roster of CNAs graded A–F on how closely their daily GG
 * scores match each resident's MDS baseline. Click a row → inline scorecard;
 * "Print scorecards" → select mode → one-aide-per-page PDF.
 *
 * Rendered as the "Aides" tab of the Functional Decline screen. Self-contained
 * (own data hooks) so it can be lifted to its own view later.
 *
 *   GET /api/extension/qm-planner/gg-aide-deviation?facilityName&orgSlug&days[&aideId]
 */
import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { track } from '../../../utils/analytics.js';
import { useAideScoring } from './hooks/useAideScoring.js';
import { useAideScorecard, fetchAideDetail } from './hooks/useAideScorecard.js';
import { AideScorecard } from './components/AideScorecard.jsx';
import { generateAideScorecardsPdf } from './lib/aide-scorecard-pdf.js';
import {
  SORT_OPTIONS, sortAides, flaggedCount, gradeTone, directionTone, directionLabel, topOffIn,
} from './lib/aide-scoring.js';
import { QmLoading } from '../components/QmLoading.jsx';
import { ChevronDown, ChevronRight, Search, X } from '../components/icons.jsx';

const DAYS = 30;

export function AideScoringView({ facilityName, orgSlug }) {
  const [sortKey, setSortKey] = useState('grade-worst');
  const [query, setQuery] = useState('');
  const [expandedAideId, setExpandedAideId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);

  useEffect(() => { track('aide_scoring_opened', { source: 'functional_decline' }); }, []);

  const { data, loading, error, retry } = useAideScoring({ facilityName, orgSlug, days: DAYS });
  const scorecard = useAideScorecard({ facilityName, orgSlug, days: DAYS });

  const aides = data?.aides ?? [];
  const rangeLabel = `last ${DAYS} days`;
  const flagged = flaggedCount(aides);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const sorted = sortAides(aides, sortKey);
    return q ? sorted.filter((a) => a.aideName.toLowerCase().includes(q)) : sorted;
  }, [aides, sortKey, q]);

  const allSelected = aides.length > 0 && selected.size === aides.length;

  const toggleSelect = useCallback((aideId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(aideId)) next.delete(aideId); else next.add(aideId);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((aide) => {
    if (selectMode) { toggleSelect(aide.aideId); return; }
    if (expandedAideId === aide.aideId) {
      setExpandedAideId(null);
      scorecard.clear();
    } else {
      setExpandedAideId(aide.aideId);
      scorecard.load(aide.aideId);
      track('aide_scorecard_expanded', { grade: aide.grade });
    }
  }, [selectMode, expandedAideId, toggleSelect, scorecard]);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
    setExpandedAideId(null);
    scorecard.clear();
  }, [scorecard]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const printSelected = useCallback(async () => {
    // Print every selected aide (in sort order), regardless of the search filter.
    const ids = sortAides(aides, sortKey).filter((a) => selected.has(a.aideId)).map((a) => a.aideId);
    if (ids.length === 0) return;
    setPrinting(true);
    try {
      const details = [];
      for (const id of ids) {
        try { details.push(await fetchAideDetail({ facilityName, orgSlug, days: DAYS, aideId: id })); }
        catch (e) { console.error('[AideScoring] print detail failed', id, e); }
      }
      await generateAideScorecardsPdf({ details, facilityName, dateRangeLabel: rangeLabel });
      track('aide_scorecard_printed', { count: details.filter(Boolean).length });
      exitSelectMode();
    } catch (e) {
      console.error('[AideScoring] print failed', e);
    } finally {
      setPrinting(false);
    }
  }, [aides, sortKey, selected, facilityName, orgSlug, rangeLabel, exitSelectMode]);

  if (loading) return <QmLoading title="Loading aide scoring" />;
  if (error) {
    return (
      <div className="qmc-error">
        <div>Failed to load aide scoring</div>
        <div className="qmc-error__detail">{error}</div>
        <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }
  if (aides.length === 0) {
    return (
      <div className="qmc-allclear">
        No scoring data available. Requires synced GG scores and MDS baselines.
      </div>
    );
  }

  return (
    <div className="qmc-aide">
      {/* Counts */}
      <div className="qmc-aide-head">
        <div className="qmc-aide-head__badges">
          {flagged > 0 && <span className="qmc-pill qmc-pill--rose">{flagged} flagged</span>}
          <span className="qmc-aide-head__count">{aides.length} aides</span>
        </div>
      </div>

      {/* Explainer + A–F legend */}
      <div className="qmc-aide-explain">
        <p className="qmc-aide-explain__text">
          How closely each aide's daily GG scores match the resident's MDS-assessed baseline ({rangeLabel}).{' '}
          <b>A</b> = spot-on · <b>F</b> = far off or inconsistent. Click an aide to see where they're off;
          use <b>Print scorecards</b> to print a coaching sheet.
        </p>
        <div className="qmc-aide-legend">
          {['A', 'B', 'C', 'D', 'F'].map((g) => (
            <span key={g} className={`qmc-aide-legend__g qmc-grade--${gradeTone(g)}`}>{g}</span>
          ))}
          <span className="qmc-aide-legend__cap">accurate → off</span>
        </div>
      </div>

      {/* Search + sort + print */}
      <div className="qmc-toolbar">
        <div className="qmc-search">
          <Search />
          <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Search aides" />
          {query && <button type="button" className="qmc-search__clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button> /* NO_TRACK */}
        </div>
        <div className="qmc-aide-tools">
          <label className="qmc-aide-tools__lbl">Sort</label>
          <select className="qmc-aide-sel" value={sortKey} onChange={(e) => setSortKey(e.target.value)}> {/* NO_TRACK */}
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!selectMode ? (
            <button type="button" className="qmc-aide-btn" onClick={enterSelectMode}>Print scorecards</button> /* NO_TRACK */
          ) : (
            <>
              <button type="button" className="qmc-aide-btn qmc-aide-btn--ghost" onClick={exitSelectMode} disabled={printing}>Cancel</button> {/* NO_TRACK */}
              <button type="button" className="qmc-aide-btn qmc-aide-btn--primary" onClick={printSelected} disabled={selected.size === 0 || printing}> {/* NO_TRACK */}
                {printing ? 'Preparing…' : `Print${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Print instruction banner */}
      {selectMode && (
        <div className="qmc-aide-banner">
          Select the aides you want, then click <b>Print</b> — you'll get a one-page scorecard for each.
        </div>
      )}

      {/* Column header */}
      <div className="qmc-aide-colhead">
        {selectMode ? (
          <input type="checkbox" className="qmc-aide-cb" checked={allSelected} aria-label="Select all"
            onChange={() => setSelected(allSelected ? new Set() : new Set(aides.map((a) => a.aideId)))} />
        ) : <span className="qmc-aide-cb-sp" />}
        <span className="qmc-aide-colhead__chev" />
        <span className="qmc-aide-colhead__name">Aide</span>
        <span className="qmc-aide-colhead__off">Most off in</span>
        <span className="qmc-aide-colhead__dir">Scoring</span>
        <span className="qmc-aide-colhead__grade">Grade</span>
      </div>

      {/* Rows */}
      <div className="qmc-aide-list">
        {visible.map((aide) => (
          <AideRow
            key={aide.aideId}
            aide={aide}
            selectMode={selectMode}
            selected={selected.has(aide.aideId)}
            isExpanded={!selectMode && expandedAideId === aide.aideId}
            detail={expandedAideId === aide.aideId ? scorecard.detail : null}
            detailLoading={expandedAideId === aide.aideId && scorecard.loading}
            rangeLabel={rangeLabel}
            onClick={() => handleRowClick(aide)}
          />
        ))}
        {visible.length === 0 && (
          <div className="qmc-allclear">No aides match your search.</div>
        )}
      </div>
    </div>
  );
}

function AideRow({ aide, selectMode, selected, isExpanded, detail, detailLoading, rangeLabel, onClick }) {
  const rowClass = `qmc-aide-row${selected ? ' qmc-aide-row--sel' : ''}${isExpanded ? ' qmc-aide-row--open' : ''}`;
  return (
    <div className={rowClass}>
      <button type="button" className="qmc-aide-row__btn" onClick={onClick}> {/* NO_TRACK */}
        {selectMode ? (
          <input type="checkbox" className="qmc-aide-cb" checked={selected} readOnly tabIndex={-1} aria-label={`Select ${aide.aideName}`} />
        ) : <span className="qmc-aide-cb-sp" />}
        <span className="qmc-aide-row__chev">{!selectMode && (isExpanded ? <ChevronDown /> : <ChevronRight />)}</span>
        <span className="qmc-aide-row__id">
          <span className="qmc-aide-row__name">
            {aide.aideName}
            {aide.isHighVariance && <span className="qmc-aide-warn" title="Inconsistent scoring">⚠</span>}
          </span>
          <span className="qmc-aide-row__sub">{aide.assessmentCount} scores · {aide.uniquePatients} patients</span>
        </span>
        <span className="qmc-aide-row__off">
          {topOffIn(aide) ?? <span className="qmc-text--emerald">on track</span>}
        </span>
        <span className={`qmc-aide-row__dir qmc-text--${directionTone(aide)}`}>{directionLabel(aide)}</span>
        <span className={`qmc-grade qmc-grade--${gradeTone(aide.grade)}`} title={`Accuracy ${aide.gradeScore}/100`}>{aide.grade}</span>
      </button>

      {isExpanded && (
        <div className="qmc-aide-row__card">
          {detailLoading ? (
            <QmLoading title="Loading scorecard" />
          ) : detail ? (
            <AideScorecard detail={detail} dateRangeLabel={rangeLabel} />
          ) : (
            <div className="qmc-sc__empty" style={{ padding: '12px 0' }}>No scored assessments with valid baselines.</div>
          )}
        </div>
      )}
    </div>
  );
}
