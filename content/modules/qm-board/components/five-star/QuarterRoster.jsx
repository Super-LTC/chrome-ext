/**
 * The roster grid behind a quarter card — every resident, every Five-Star
 * measure, for ONE quarter.
 *
 * WHY IT EXISTS HERE. The scorecard's quarter cards were selectable but led
 * nowhere: clicking one re-scoped the measure tiles and that was all. On the web
 * the same click opens this grid, so the extension was missing the one artefact
 * people actually take out of the screen — the list they export and bring to the
 * QM meeting. Same reading, same glyphs, same CSV.
 *
 * WHAT A CELL MEANS is settled in lib/quarter-roster-view.js, including the one
 * rule that keeps this grid honest: a `skipped` resident is NOT in the
 * denominator, so the columns reconcile with the rate printed on the card that
 * opened them. Read that header before changing a glyph.
 *
 * NO PRINT BUTTON, deliberately — the web has one and this does not. `window
 * .print()` from a content script prints the PointClickCare page this overlay is
 * floating on top of: the host's chrome, the host's PHI, our unstyled markup.
 * CSV is the export that works from here; print is the web's to offer.
 *
 * PHI: resident names, behind two deliberate clicks (scope into a building, then
 * a quarter). Never rendered in a hover or a badge.
 */
import { useMemo, useState } from 'preact/hooks';
import {
  ROSTER_CELL_TITLE,
  ROSTER_GLYPH,
  filterRoster,
  rosterCsv,
  rosterLabels,
  rosterMeasures,
  rowTriggersAnything,
  toRosterRows,
} from '../../lib/quarter-roster-view.js';
import { ArrowLeft, Download, Search, X } from '../icons.jsx';

/**
 * CDIF is only meaningful near the short→long cliff at day 100/101 — for an
 * established long-stayer "d402" is noise. Matches DenominatorPanel.
 */
const SHOW_DAY_THROUGH = 114;

function stayMeta(r) {
  return r.cdif <= SHOW_DAY_THROUGH ? `${r.stayType} · d${r.cdif}` : r.stayType;
}

function downloadCsv(filename, csv) {
  // Prepend a UTF-8 BOM so Excel reads accented names correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s) {
  return (s || 'quarter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'quarter';
}

/**
 * @param {object} props
 * @param {object|null} props.quarterRates  QmQuarterRatesView for the quarter.
 * @param {string} props.quarterLabel       Display label ("Q2 2026").
 * @param {string} [props.facilityName]     For the CSV filename only.
 * @param {() => void} props.onBack
 * @param {(measureId: string) => void} [props.onOpenMeasure]  Column header →
 *   that measure's drill-in, already scoped to this quarter.
 */
export function QuarterRoster({
  quarterRates,
  quarterLabel,
  facilityName,
  onBack,
  onOpenMeasure,
}) {
  const [query, setQuery] = useState('');
  const [triggeringOnly, setTriggeringOnly] = useState(false);

  const measures = useMemo(() => rosterMeasures(quarterRates), [quarterRates]);
  const labels = useMemo(() => rosterLabels(quarterRates), [quarterRates]);
  const rows = useMemo(() => toRosterRows(quarterRates), [quarterRates]);

  const visible = useMemo(
    () => filterRoster(rows, { query, triggeringOnly }),
    [rows, query, triggeringOnly],
  );
  const triggeringCount = useMemo(() => rows.filter(rowTriggersAnything).length, [rows]);

  const backBar = (
    /* NO_TRACK — a back button is navigation, not an action worth an event. */
    <button type="button" className="qmc-bc__back" onClick={onBack}>
      <ArrowLeft className="fsr-backicon" /> Scorecard
    </button>
  );

  // Not an error and not a spinner: the payload simply has no cohort for this
  // quarter (a building we started scoring mid-quarter, most often). Say so.
  if (!quarterRates || rows.length === 0) {
    return (
      <div className="fivestar">
        <div className="fs-frame fsr">
          {backBar}
          <div className="fsr-empty">
            No resident-level roster for {quarterLabel}
            {quarterRates ? ' — CMS scored no residents in this window.' : ' yet.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fivestar">
      <div className="fs-frame fsr">
        <div className="fsr-bar">
          {backBar}
          <div className="fsr-title">
            <div className="fsr-title__main">
              {quarterLabel} roster
              <span className="fsr-title__count">
                {rows.length} residents · {triggeringCount} triggering something
              </span>
            </div>
            <div className="fsr-title__sub">
              The quarter&apos;s CMS cohort — discharged and deceased residents included,
              because CMS counts them.
            </div>
          </div>

          <div className="fsr-search">
            <Search className="fsr-search__icon" />
            <input
              value={query}
              onInput={(e) => setQuery(e.target.value)}
              placeholder="Search resident"
            />
            {query && (
              /* NO_TRACK */
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="fsr-search__clear">
                <X />
              </button>
            )}
          </div>

          <button
            type="button"
            data-track="qm_roster_triggering_filter"
            className={`fsr-btn${triggeringOnly ? ' fsr-btn--on' : ''}`}
            onClick={() => setTriggeringOnly((v) => !v)}
            aria-pressed={triggeringOnly}
          >
            Triggering only
          </button>

          <button
            type="button"
            data-track="qm_roster_export_csv"
            className="fsr-btn"
            onClick={() => downloadCsv(
              `qm-roster-${slugify(facilityName)}-${slugify(quarterLabel)}.csv`,
              rosterCsv({ rows: visible, measures, labels }),
            )}
          >
            <Download className="fsr-btn__icon" /> CSV
          </button>
        </div>

        <div className="fsr-tablewrap">
          <table className="fsr-table">
            <thead>
              <tr>
                <th className="fsr-th fsr-th--name">Resident</th>
                <th className="fsr-th fsr-th--meta">Stay</th>
                <th className="fsr-th fsr-th--meta">Status</th>
                {measures.map((m) => (
                  <th key={m} className="fsr-th fsr-th--measure">
                    {/* Vertical labels: 10 measure columns will not fit across. */}
                    {onOpenMeasure ? (
                      <button
                        type="button"
                        data-track="qm_roster_open_measure"
                        className="fsr-colhead fsr-colhead--link"
                        title={`Open ${labels.get(m) ?? m} for ${quarterLabel}`}
                        onClick={() => onOpenMeasure(m)}
                      >
                        {labels.get(m) ?? m}
                      </button>
                    ) : (
                      <span className="fsr-colhead">{labels.get(m) ?? m}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.patientId}>
                  <td className="fsr-td fsr-td--name">
                    {r.name}
                    {!r.targetAccepted && (
                      <span
                        className="fsr-unsub"
                        title="Scored off an MDS not yet accepted by CMS — we lead the published number here"
                      >
                        unsubmitted
                      </span>
                    )}
                  </td>
                  <td className="fsr-td fsr-td--meta">{stayMeta(r)}</td>
                  <td className={`fsr-td fsr-td--meta${r.discharged ? '' : ' fsr-td--active'}`}
                    title={r.discharged
                      ? 'Discharged or deceased in this quarter — CMS still counts them'
                      : 'In house at the end of this quarter'}
                  >
                    {r.discharged ? 'discharged' : 'active'}
                  </td>
                  {measures.map((m) => {
                    const c = r.cells[m] ?? { kind: 'uncounted', reason: null };
                    return (
                      <td
                        key={m}
                        className={`fsr-cell fsr-cell--${c.kind}`}
                        title={c.reason ? `${ROSTER_CELL_TITLE[c.kind]} — ${c.reason}` : ROSTER_CELL_TITLE[c.kind]}
                      >
                        {ROSTER_GLYPH[c.kind]}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td className="fsr-nomatch" colSpan={measures.length + 3}>
                    No residents match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="fsr-legend">
          <span><b className="fsr-key fsr-key--numerator">✕</b> triggering</span>
          <span><b className="fsr-key fsr-key--denominator">·</b> in denominator</span>
          <span><b className="fsr-key fsr-key--excluded">e</b> excluded (hover for the reason)</span>
          {/* "not counted", not "not applicable": this glyph also covers residents
              CMS skipped for a non-exclusion reason. See quarter-roster-view.js. */}
          <span><b className="fsr-key fsr-key--uncounted">–</b> not counted (hover for why)</span>
        </div>
      </div>
    </div>
  );
}
