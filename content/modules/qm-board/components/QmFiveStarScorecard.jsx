/**
 * Regional Five-Star scorecard. A diagnosis HEADLINE (where do I stand, what's
 * the drag, what's the move) over a dense per-measure table (Last Q · This Q ·
 * Star points · Trend). Rows expand to the measure's numerator residents with a
 * This ⇄ Last quarter flip, plus a standalone DFS strip and a Coming-up crossers
 * list. Replaces the old QmOverview as the "QM Board / Regional" mode.
 *
 * Ported from qm-fivestar-scorecard.reference.tsx → Preact + the qms- tone system.
 * Fetches the back=1 (last-quarter) roster itself so that extra call is scoped to
 * Regional; the back=0 roster is passed in (already fetched for the board).
 */
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  buildFiveStarScorecard, buildMeasureResidents, buildUpcomingCrossers, buildDfsStrip, summarizeMeasureResidents,
} from '../lib/qm-fivestar-view.js';
import { useQuarterRates } from '../hooks/useQuarterRates.js';
import { QmDfsStrip } from './QmDfsStrip.jsx';
import {
  Star, ArrowUp, ArrowDown, ArrowRight, ChevronRight, TrendingDown, TrendingUp,
  Target, ListChecks, CalendarClock, Lock,
} from './icons.jsx';

const pct = (r) => (r == null ? '—' : `${(r * 100).toFixed(1)}%`);

/** ISO 'YYYY-MM-DD' → 'M/D' (no leading zeros). */
function mdShort(iso) {
  if (!iso) return '';
  const [, mm, dd] = iso.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : '';
}

/** Whole days from the facility's today to the end of its calendar quarter. */
function daysToQuarterEnd(todayIso) {
  if (!todayIso) return null;
  const [y, m, d] = todayIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const qEndMonth = m <= 3 ? 3 : m <= 6 ? 6 : m <= 9 ? 9 : 12;
  const qEnd = Date.UTC(y, qEndMonth, 0);
  const today = Date.UTC(y, m - 1, d);
  return Math.max(0, Math.round((qEnd - today) / 86400000));
}

/**
 * A rate cell. With `onClick` the NUMBER is the button — click it to drill that
 * quarter's residents (no row-expand, no This/Last toggle). `active` = open.
 */
function RateCell({ cell, onClick, active }) {
  if (!cell) return <span className="qms-rate--empty">—</span>;
  const inner = (
    <>
      <span className="qms-rate__pct">{pct(cell.rate)}</span>
      <span className="qms-rate__frac">{cell.numerator}/{cell.denominator}</span>
    </>
  );
  if (!onClick) return <span className="qms-rate">{inner}</span>;
  return (
    <button
      type="button"
      className={`qms-ratebtn ${active ? 'qms-ratebtn--active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {inner}
      <span className="qms-ratebtn__peek">{active ? 'open' : 'view'}</span>
    </button>
  );
}

function Trend({ m }) {
  if (m.trend === 'flat' || m.deltaPts == null) return <span className="qms-trend--flat">flat</span>;
  const good = m.trend === 'improved';
  const Icon = good ? TrendingDown : TrendingUp;
  return (
    <span className={`qms-trend ${good ? 'qmc-text--emerald' : 'qmc-text--rose'}`}>
      <Icon className="qms-trend__icon" />
      {m.deltaPts > 0 ? '+' : ''}{m.deltaPts}
    </span>
  );
}

/** A 5-star cluster. `big` bumps emphasis (projected bigger than last qtr). */
function Stars({ n, big }) {
  return (
    <span className="qms-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`qms-star ${big ? 'qms-star--big' : ''} ${n != null && i <= n ? 'qms-star--on' : ''}`}
          fill={n != null && i <= n ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

function StarBlock({ label, n, big, labelClass }) {
  return (
    <div className="qms-starblock">
      <span className={`qms-starblock__label ${labelClass}`}>{label}</span>
      <span className="qms-starblock__row">
        <Stars n={n} big={big} />
        {n != null && <span className="qms-starblock__num">{n}</span>}
      </span>
    </div>
  );
}

const GROUP_CAP = 8;

/** A capped list of residents under a section header (badge + name + date + note). */
function ResidentGroup({ residents, badge, tone, onOpenMeasure, measureId }) {
  if (residents.length === 0) return null;
  const shown = residents.slice(0, GROUP_CAP);
  const hidden = residents.length - shown.length;
  // Label the date (so it isn't a cryptic "04-04"); drop the verbose clear note
  // (it's a scan view — the full action lives in the worklist).
  const dateLabel = tone === 'crossing' ? 'crosses' : tone === 'discharged' ? "DC'd" : 'MDS';
  return (
    <div className="qms-rgroup">
      {shown.map((r) => (
        <div key={`${r.status}:${r.patientId}`} className={`qms-rrow ${tone === 'discharged' ? 'qms-rrow--discharged' : ''}`}>
          <span className={`qms-rbadge qms-rbadge--${tone}`}>
            {tone === 'discharged' && <Lock className="qms-rbadge__lock" />}
            {tone === 'active' && r.clearableNow ? 'Clear now' : badge}
          </span>
          <span className={`qms-rname ${tone === 'discharged' ? 'qmc-text--slate' : ''}`}>{r.name}</span>
          {r.pendingSubmission ? (
            <span className="qms-pending" title="Counted on an MDS that isn't submitted to CMS yet — we lead iQIES until it's accepted.">
              {mdShort(r.date)} MDS In Progress
            </span>
          ) : (
            <span className="qms-rdate">{dateLabel} {mdShort(r.date) || '—'}</span>
          )}
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className="qms-rmore" onClick={() => onOpenMeasure(measureId)}> {/* NO_TRACK */}
          + {hidden} more {badge.toLowerCase()} → worklist
        </button>
      )}
    </div>
  );
}

/**
 * The inline drill for a measure × ONE quarter (the cell you clicked). Roster-
 * driven, includes discharged-but-still-counting residents, reconciles with that
 * cell's num/den. No quarter toggle — the clicked number is the selection; the
 * header names the quarter and a prominent button opens the full worklist.
 */
function ResidentPanel({ board, roster, measureLabel, quarterLabel, isCurrent, measureId, onOpenMeasure, onClose }) {
  const residents = buildMeasureResidents(roster?.rows, measureId, { board: isCurrent ? board : null, isCurrent });
  const s = summarizeMeasureResidents(residents);
  const rateRow = roster?.rates.find((r) => r.measureId === measureId);

  const active = residents.filter((r) => r.status === 'triggering');
  const crossing = residents.filter((r) => r.status === 'crossing');
  const discharged = residents.filter((r) => r.status === 'discharged');

  const openWorklist = (e) => { e.stopPropagation(); onOpenMeasure(measureId); };

  return (
    <div className="qms-panel">
      {/* scope header (measure · which quarter) + prominent worklist */}
      <div className="qms-panel__bar">
        <div className="qms-panel__scope">
          <b className="qms-panel__measure">{measureLabel}</b>
          <span className={`qms-panel__qtr ${isCurrent ? '' : 'qms-panel__qtr--last'}`}>
            {isCurrent ? 'This quarter' : 'Last quarter'}{quarterLabel ? ` · ${quarterLabel}` : ''}
          </span>
        </div>
        <div className="qms-panel__actions">
          <button type="button" className="qms-panel__worklist" onClick={openWorklist}> {/* NO_TRACK */}
            <ListChecks className="qms-panel__wicon" /> Open full worklist
          </button>
          <button type="button" className="qms-panel__close" onClick={onClose} aria-label="Close">✕</button> {/* NO_TRACK */}
        </div>
      </div>

      {/* summary that reconciles with the clicked cell's num/den */}
      <div className="qms-panel__summary">
        <span className="qms-panel__num">
          <b>{s.numerator}</b> in the numerator
          {rateRow && <span className="qmc-text--slate"> = {rateRow.numerator}/{rateRow.denominator}</span>}
        </span>
        {s.dischargedCount > 0 && <span className="qmc-text--slate"><b>{s.dischargedCount}</b> discharged · locked</span>}
        {isCurrent && s.clearableNow > 0 && <span className="qmc-text--emerald"><b>{s.clearableNow}</b> can clear now</span>}
        {isCurrent && s.crossing > 0 && <span className="qmc-text--violet"><b>{s.crossing}</b> crossing soon</span>}
        {s.total === 0 && <span className="qmc-text--slate">Nobody in the numerator this quarter.</span>}
      </div>

      <ResidentGroup residents={active} badge="Triggering" tone="active" onOpenMeasure={onOpenMeasure} measureId={measureId} />
      <ResidentGroup residents={crossing} badge="Crossing" tone="crossing" onOpenMeasure={onOpenMeasure} measureId={measureId} />
      {discharged.length > 0 && (
        <div className="qms-discharged">
          <div className="qms-discharged__head">Discharged · still counting this quarter</div>
          <ResidentGroup residents={discharged} badge="Discharged" tone="discharged" onOpenMeasure={onOpenMeasure} measureId={measureId} />
        </div>
      )}

      {s.total > 0 && (
        <button type="button" className="qms-panel__all" onClick={openWorklist}> {/* NO_TRACK */}
          View all {s.total} in the worklist <ArrowRight />
        </button>
      )}
    </div>
  );
}

export function QmFiveStarScorecard({ rolling, prediction, board, dfs, quarterRates, lens, facilityState, facilityName, orgSlug, onOpenMeasure, onOpenDfs, onOpenSimulator }) {
  // Last-quarter roster (back=1) for the expand's quarter flip — fetched here so
  // the extra call only happens when Regional is open.
  const { quarterRates: lastQuarterRates } = useQuarterRates({ facilityName, orgSlug, back: 1 });

  const sc = buildFiveStarScorecard(rolling, prediction, lens, facilityState, board);
  const h = sc.headline;
  const fix = h.topFix;
  const starDelta = sc.anchorStar != null && sc.projectedStar != null ? sc.projectedStar - sc.anchorStar : null;
  const crossers = buildUpcomingCrossers(board, lens, facilityState);
  const dfsStrip = buildDfsStrip(dfs);
  // Open drill = {id, q}. Driven by clicking a rate NUMBER, not the row; clicking
  // the same number closes it. No This/Last toggle — the cell you click IS the quarter.
  const [open, setOpen] = useState(null);
  const toggleDrill = (id, q) => setOpen((o) => (o && o.id === id && o.q === q ? null : { id, q }));

  const fixHow = fix
    ? fix.clearNow > 0
      ? `${fix.clearNow} ${fix.clearNow === 1 ? 'resident' : 'residents'} from clearing`
      : fix.crossingSoon > 0
        ? `${fix.crossingSoon} crossing soon`
        : fix.nextDeltaPts != null
          ? `${fix.nextDeltaPts}% to the next level`
          : null
    : null;

  return (
    // `qmc` brings the tone-token scope (--emerald-600 etc. are defined on .qmc);
    // without it the whole Regional scorecard renders greyscale.
    <div className="qmc qms">
      {/* ── HEADLINE: the diagnosis + the lever ── */}
      <div className="qms-headline qmc-rise">
        <div className="qms-headline__top">
          <div>
            <div className="qms-headline__eyebrow">
              <div className="qmc-eyebrow qmc-text--amber">Five-Star QM</div>
              {(() => {
                const daysLeft = daysToQuarterEnd(board?.currentlyTriggering?.facilityDate);
                return daysLeft != null ? (
                  <span className="qms-qtrcount" title="Days left in the current quarter — the window to move these numbers">
                    {sc.currentLabel ?? 'This quarter'} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                  </span>
                ) : null;
              })()}
            </div>
            <div className="qms-headline__stars">
              <StarBlock label="Last quarter" n={sc.anchorStar} big={false} labelClass="qmc-text--slate" />
              <ArrowRight className="qms-headline__arrow" />
              <StarBlock label="Projected" n={sc.projectedStar} big labelClass="qms-headline__projlabel" />
              {starDelta != null && starDelta !== 0 && (
                <span className={`qms-headline__delta ${starDelta > 0 ? 'qmc-text--emerald' : 'qmc-text--rose'}`}>
                  {starDelta > 0 ? <ArrowUp /> : <ArrowDown />}
                  {starDelta > 0 ? '+' : ''}{starDelta}★
                </span>
              )}
            </div>
            <div className="qms-headline__pts">
              <b>{h.totalPoints}</b><span className="qmc-text--slate">/{h.maxTotal} pts at your current rate</span>
              {h.headroomPts > 0 && <span className="qmc-text--slate"> · <b className="qmc-text--emerald">+{h.headroomPts} reachable</b></span>}
              {h.bubbleCount > 0 && <span className="qmc-text--slate"> · <b className="qmc-text--amber">{h.bubbleCount} almost at next level</b></span>}
            </div>
            {sc.projectedStar != null && (
              <div className="qms-headline__note">Projected star reflects your CMS rating shifted by your rate change — not a sum of these points.</div>
            )}
          </div>
          {onOpenSimulator && (
            <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code="open_simulator" data-track-prop-view="regional"
              className="qms-whatif" onClick={onOpenSimulator}>
              <Target className="qms-whatif__icon" /> 5-Star Calculator
            </button>
          )}
        </div>

        {/* biggest single move — the leverage-ranked "do this first" */}
        {fix && (
          <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code={fix.id} data-track-prop-view="regional_bigwin"
            className="qms-bigwin" onClick={() => onOpenMeasure(fix.id)}>
            <Target className="qms-bigwin__icon" />
            <span className="qms-bigwin__text">
              <span className="qmc-text--slate">Biggest win:</span>{' '}
              <b>{fix.label}</b>
              {fixHow && <span className="qmc-text--slate"> · {fixHow}</span>}
              {fix.gainPts ? <b className="qmc-text--emerald"> · +{fix.gainPts} pts</b> : null}
            </span>
            <ChevronRight className="qms-bigwin__chev" />
          </button>
        )}
      </div>

      {/* ── per-measure table ── */}
      {sc.measures.length === 0 ? (
        <div className="qmc-empty">No Five-Star measures with data yet.</div>
      ) : (
        <div className="qms-tablewrap">
          <table className="qms-table">
            <thead>
              <tr>
                <th className="qms-th qms-th--left">Measure<span className="qms-th__sub">biggest opportunity first</span></th>
                <th className="qms-th qms-th--right">Last quarter<span className="qms-th__sub">{sc.lastLabel ?? ''} · click to drill</span></th>
                <th className="qms-th qms-th--right qms-th--cur">This quarter<span className="qms-th__sub">{sc.currentLabel ?? ''} · click to drill</span></th>
                <th className="qms-th qms-th--right">Star points<span className="qms-th__sub">toward your rating</span></th>
                <th className="qms-th qms-th--right">Trend<span className="qms-th__sub">vs last qtr</span></th>
              </tr>
            </thead>
            <tbody>
              {sc.measures.map((m) => (
                <Fragment key={m.id}>
                  <tr className="qms-tr">
                    <td className="qms-td qms-td--measure">
                      <div className="qms-td__name">{m.label}</div>
                      {(m.clearNow > 0 || m.crossingSoon > 0) && (
                        <div className="qms-td__cues">
                          {m.clearNow > 0 && <span className="qmc-text--emerald">{m.clearNow} can clear now</span>}
                          {m.crossingSoon > 0 && <span className="qmc-text--violet">{m.crossingSoon} crossing soon</span>}
                        </div>
                      )}
                    </td>
                    <td className="qms-td qms-td--right"><RateCell cell={m.last} onClick={() => toggleDrill(m.id, 'last')} active={open?.id === m.id && open.q === 'last'} /></td>
                    <td className="qms-td qms-td--right qms-td--cur"><RateCell cell={m.current} onClick={() => toggleDrill(m.id, 'this')} active={open?.id === m.id && open.q === 'this'} /></td>
                    <td className="qms-td qms-td--right">
                      {m.points != null && m.maxPoints != null ? (
                        <div className="qms-pts">
                          <span className="qms-pts__row">
                            <span className={`qms-pts__n ${m.maxed ? 'qmc-text--emerald' : m.points <= m.maxPoints * 0.4 ? 'qmc-text--rose' : ''}`}>{m.points}</span>
                            <span className="qms-pts__max">/{m.maxPoints}</span>
                          </span>
                          {m.maxed ? (
                            <span className="qms-pts__hint qmc-text--emerald">full points ✓</span>
                          ) : m.nextGainPts ? (
                            <span className={`qms-pts__hint ${m.nextDeltaPts != null && m.nextDeltaPts <= 1 ? 'qmc-text--amber' : 'qmc-text--slate'}`}>
                              {m.nextDeltaPts}% from +{m.nextGainPts} pts
                            </span>
                          ) : null}
                        </div>
                      ) : <span className="qms-rate--empty">—</span>}
                    </td>
                    <td className="qms-td qms-td--right"><Trend m={m} /></td>
                  </tr>
                  {open?.id === m.id && (
                    <tr>
                      <td colSpan={5} className="qms-expand">
                        <ResidentPanel
                          board={board}
                          roster={open.q === 'this' ? quarterRates : lastQuarterRates}
                          measureLabel={m.label}
                          quarterLabel={open.q === 'this' ? sc.currentLabel : sc.lastLabel}
                          isCurrent={open.q === 'this'}
                          measureId={m.id}
                          onOpenMeasure={onOpenMeasure}
                          onClose={() => setOpen(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── DISCHARGE FUNCTION: own strip ── */}
      {dfsStrip && <QmDfsStrip strip={dfsStrip} onOpenDfs={onOpenDfs} />}

      {/* ── COMING UP: day-101 crossers ── */}
      {crossers.length > 0 && (
        <div className="qms-coming">
          <div className="qms-coming__head">
            <CalendarClock className="qms-coming__icon" />
            <span className="qms-coming__title">Coming up</span>
            <span className="qmc-text--slate qms-coming__sub">
              {crossers.length} {crossers.length === 1 ? 'resident crosses' : 'residents cross'} day-101 into the long-stay denominator — get ahead of them
            </span>
          </div>
          <div className="qms-coming__list">
            {crossers.map((c) => (
              <div key={c.patientId} className="qms-crossrow">
                <div className="qms-crossrow__when">
                  <div className="qms-crossrow__date">{c.crossingDate ? c.crossingDate.slice(5) : '—'}</div>
                  {c.daysUntil != null && (
                    <div className={`qms-crossrow__days ${c.daysUntil < 0 ? 'qmc-text--rose' : 'qmc-text--slate'}`}>
                      {c.daysUntil < 0 ? `${-c.daysUntil}d overdue` : `in ${c.daysUntil}d`}
                    </div>
                  )}
                </div>
                <span className="qms-crossrow__name">{c.name}</span>
                <div className="qms-crossrow__measures">
                  {c.measures.map((mm) => (
                    <button key={mm.id} type="button" data-track="qm_drill_in" data-track-prop-measure-code={mm.id} data-track-prop-view="regional_crosser"
                      className="qms-crossrow__chip" onClick={() => onOpenMeasure(mm.id)}>
                      {mm.label}
                    </button>
                  ))}
                </div>
                {c.anyPreventable && <span className="qms-crossrow__prevent qmc-text--amber">preventable</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
