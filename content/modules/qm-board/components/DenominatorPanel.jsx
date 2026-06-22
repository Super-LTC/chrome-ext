/**
 * QM Denominator drill-in — the "view the denominator" modal.
 *
 * Ported from qm-denominator-panel.reference.tsx, adapted to Preact + `qmden-`
 * CSS. Answers the regional consultant's explicit ask: for one quality measure,
 * WHO is in the denominator, WHO triggers it (counts against you), WHO is
 * discharged/deceased ("locked — you're stuck with them"), and WHO is excluded
 * (and why). Rosters can be 50+ residents, so the body scrolls and a name search
 * filters the list.
 *
 * Consumes the already-built `MeasureDenominator` view-model
 * (qm-denominator-view.js). No fetch, no business logic.
 */
import { useState } from 'preact/hooks';
import { shortLabel, measureCode, isFiveStarMds, ratePct } from '../lib/qm-view-model.js';
import { X, Lock, AlertTriangle, Search } from './icons.jsx';

/**
 * CDIF is only meaningful near the short→long cliff at day 100/101 — for an
 * established long-stayer "d402" is noise. Show the day count only at/before this
 * mark (100-day cliff + ~2-week grace); past it, just the stay type.
 */
const SHOW_DAY_THROUGH = 114;

function stayMeta(r) {
  return r.cdif <= SHOW_DAY_THROUGH ? `${r.stayType} · d${r.cdif}` : r.stayType;
}

/**
 * Denominator residents, numerator-first, discharged sinking to the bottom of
 * each group — the "still counting / can't be cleared" residents read last.
 */
function orderDenominator(rows) {
  const rank = (r) => (r.isNumerator ? 0 : 2) + (r.discharged ? 1 : 0);
  return rows.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function DischargedBadge() {
  return (
    <span className="qmden-badge qmden-badge--disch"><Lock className="qmden-badge__icon" /> Discharged · locked</span>
  );
}

function TriggeringBadge() {
  return (
    <span className="qmden-badge qmden-badge--trig"><AlertTriangle className="qmden-badge__icon" /> Triggering</span>
  );
}

function DenominatorRow({ r }) {
  // Worst case — triggering AND discharged — gets a faint rose accent so it reads
  // as the "stuck with it, still counting" resident at a glance.
  const accent = r.isNumerator && r.discharged ? 'qmden-row--stuck' : r.isNumerator ? 'qmden-row--trig' : '';
  return (
    <div className={`qmden-row ${accent}`}>
      <span className={`qmden-row__dot ${r.isNumerator ? 'qmden-row__dot--trig' : ''}`} />
      <div className="qmden-row__body">
        <div className="qmden-row__name">{r.name}</div>
        <div className="qmden-row__meta">{stayMeta(r)}</div>
      </div>
      <div className="qmden-row__badges">
        {r.isNumerator && <TriggeringBadge />}
        {r.discharged && <DischargedBadge />}
      </div>
    </div>
  );
}

function ExcludedRow({ r }) {
  return (
    <div className="qmden-exrow">
      <span className="qmden-row__dot" />
      <div className="qmden-exrow__body">
        <div className="qmden-exrow__top">
          <span className="qmden-exrow__name">{r.name}</span>
          <span className="qmden-exrow__meta">{stayMeta(r)}</span>
          {r.discharged && <DischargedBadge />}
        </div>
        {r.reason && <div className="qmden-exrow__reason">{r.reason}</div>}
      </div>
    </div>
  );
}

export function DenominatorPanel({ open, meta, denom, onClose }) {
  const [query, setQuery] = useState('');
  if (!open || !denom || !meta) return null;

  const code = measureCode(meta.id);
  const fiveStar = isFiveStarMds(meta.id);

  // Header counts reflect the FULL roster (true totals), not the filtered view.
  const excludedCount = denom.roster.excluded.length;
  const dischargedCount =
    denom.roster.inDenominator.filter((r) => r.discharged).length +
    denom.roster.excluded.filter((r) => r.discharged).length;

  const q = query.trim().toLowerCase();
  const matches = (r) => !q || r.name.toLowerCase().includes(q);
  const inDen = orderDenominator(denom.roster.inDenominator).filter(matches);
  const excluded = denom.roster.excluded.filter(matches);
  const noMatches = !!q && inDen.length === 0 && excluded.length === 0;

  return (
    <div className="qmden__overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="qmden__modal" onClick={(e) => e.stopPropagation()}>
        {/* Header (fixed) */}
        <div className="qmden__header">
          <div className="qmden__header-row">
            <div className="qmden__header-main">
              <div className="qmden__title-line">
                <span className="qmden__title">{shortLabel(meta.id, meta.label)}</span>
                {code && <span className="qmden__code">{code}</span>}
                {fiveStar
                  ? <span className="qmc-tag qmc-tag--star">5★</span>
                  : <span className="qmc-tag qmc-tag--state">state</span>}
              </div>
              <div className="qmden__rate-line">
                <span className="qmden__rate">{ratePct(denom.numerator, denom.denominator).toFixed(1)}%</span>
                <span className="qmden__rate-sub">{denom.numerator}/{denom.denominator} residents</span>
              </div>
              <div className="qmden__summary">
                {denom.denominator} in denominator
                <span className="qmden__sep"> · </span>
                <span className="qmc-text--rose" style={{ fontWeight: 600 }}>{denom.numerator} triggering</span>
                <span className="qmden__sep"> · </span>
                {excludedCount} excluded
                <span className="qmden__sep"> · </span>
                <span className="qmden__disch-count"><Lock className="qmden__disch-icon" />{dischargedCount} discharged</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close denominator panel" className="qmden__close"> {/* NO_TRACK */}
              <X className="qmden__close-icon" />
            </button>
          </div>

          {/* Name search */}
          <div className="qmden__search">
            <Search className="qmden__search-icon" />
            <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Search resident name" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="qmden__search-clear"> {/* NO_TRACK */}
                <X />
              </button>
            )}
          </div>
        </div>

        {/* Body (scrolls) */}
        <div className="qmden__body">
          {noMatches ? (
            <div className="qmden__empty">No residents match “{query.trim()}”.</div>
          ) : (
            <>
              <div className="qmden__seclabel">In denominator <span className="qmden__seccount">{inDen.length}</span></div>
              {inDen.length === 0 ? (
                <div className="qmden__empty qmden__empty--sm">
                  {q ? 'No matching residents in the denominator.' : 'No residents in this measure’s denominator this quarter.'}
                </div>
              ) : (
                <div className="qmden__list">
                  {inDen.map((r) => <DenominatorRow key={r.patientId} r={r} />)}
                </div>
              )}

              {excluded.length > 0 && (
                <div className="qmden__excluded">
                  <div className="qmden__seclabel qmden__seclabel--excl">
                    Excluded <span className="qmden__seccount">{excludedCount}</span>
                    <span className="qmden__excl-note">· not counted — reason shown</span>
                  </div>
                  <div className="qmden__exlist">
                    {excluded.map((r) => <ExcludedRow key={r.patientId} r={r} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
