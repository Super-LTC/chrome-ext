/**
 * Facility Five-Star screen — ported from superltc
 * `web/components/five-star/facility-five-star.tsx`, itself a faithful
 * conversion of the approved `.context/design/facility-fivestar-v3.html` mockup.
 *
 * It renders ONE payload — FiveStarFacilityResponse — and computes nothing.
 * Every judgement on screen (which star band you sit in, how far the cut is,
 * which measures sit nearest a cut) already arrived decided from
 * `RegionalFiveStarService`. A component that re-derives "is 25 points close?"
 * is how the screen and the engine start disagreeing.
 *
 * ── The grammar this screen exists to protect ───────────────────────────────
 *
 *   published — CMS has scored it, it is on Care Compare. Solid card, GOLD stars.
 *   predicted — the quarter CLOSED, our MDS is final, CMS hasn't posted. Solid
 *               card with a green border, GREEN stars. This is what lets the page
 *               say "4★ is already earned, CMS just hasn't posted it".
 *   projected — the quarter is still OPEN and can still move. DASHED border.
 *
 * The dashed border is deliberate and load-bearing: an earlier revision filled
 * the open quarter with a diagonal hatch and it read as a strikethrough — as if
 * the number had been cancelled rather than as if it were still moving.
 *
 * Two invariants the layout encodes:
 *  1. THE PROJECTION ASSUMES NOBODY ACTS. Roll-offs and day-101 crossers are
 *     already inside every projected number. Clearables are NOT — there is no
 *     line anywhere on this page that adds the two together.
 *  2. CLAIMS / QRP ROWS CARRY FORWARD at their published value. Those cells say
 *     "carries forward" and the footnote says why. That is correct behaviour,
 *     not missing data.
 *
 * PHI: the payload's `crossers` and `clearables` carry resident names and patient
 * ids. Neither is rendered here — if either is ever surfaced it must be behind a
 * deliberate click, never in a hover or a badge that could end up in a screenshot
 * with no context around it.
 *
 * EXTENSION DIVERGENCES from the web original, all mechanical:
 *   - The web's `<header>` carries a SuperLTC brand bar; we're already inside a
 *     branded overlay, so only the breadcrumb survives.
 *   - The `href` fallback on measure names is dropped — there is no router to
 *     link into. `onOpenMeasure` is the only drill path.
 */
import { useState, useMemo } from 'preact/hooks';
import {
  AsOf, CutLadder, Pill, Stars, Trend, n, pts, toneForKind, glyphForTone,
} from './primitives.jsx';

/* ── formatting helpers ───────────────────────────────────────────────────── */

/** Date-only ISO strings are calendar dates, so read them in UTC or they slip a day. */
const asDate = (iso) => new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);

const fmtDate = (iso) =>
  (!iso ? '—' : asDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));

const fmtDateShort = (iso) =>
  (!iso ? '—' : asDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }));

const dec = (v, places = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(places));

/**
 * A measure's rate is a PROPORTION (0..1) for percentage measures and a
 * per-1,000-resident-day figure for the two claims utilisation measures. The row
 * carries no unit field, so the unit is read off the bracket domain — a
 * proportion ladder tops out at 1.0, a per-1,000-days ladder runs to ~1,000.
 * Falling back to the label keeps a row with no brackets from printing "170%".
 */
const isPerThousand = (row) =>
  row.brackets.some((b) => b.max > 1.5) || /1,?000/.test(row.label);

const fmtRate = (row, rate) => {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return isPerThousand(row) ? rate.toFixed(2) : (rate * 100).toFixed(2);
};

/** Points as X/Y (never a bare number) with the denominator set back. */
function PtsSplit({ value, max, cls = 'qmax' }) {
  const [a, b] = pts(value, max).split('/');
  if (b == null) return <>{a}</>;
  return <>{a}<span className={cls}>/{b}</span></>;
}

/** ▲ 40 / ▼ 12 — arrow from the shared primitive, magnitude beside it. */
function DeltaPts({ delta }) {
  if (delta == null || delta === 0) return null;
  return (
    <span className={`qd ${delta > 0 ? 'up' : 'dn'}`}>
      <Trend delta={delta} /> {n(Math.abs(delta))}
    </span>
  );
}

/* ── cut bar ──────────────────────────────────────────────────────────────── */

/**
 * The banded cut bar under a domain card.
 *
 * Bands render in SCORE order, left to right — so for health inspection, where a
 * LOWER score is better, 5★ sits on the left and the gradient reverses
 * (`.cutbar.rev`). Every band carries its own label: an unlabelled bar was
 * explicitly rejected, because "you are here" is worthless without "here is what's
 * next to you".
 */
function CutBar({ ladder, reversed = false }) {
  const ordered = useMemo(() => {
    const byStar = [...ladder.bands].sort((a, b) => a.stars - b.stars);
    return ladder.lowerIsBetter ? byStar.reverse() : byStar;
  }, [ladder]);

  if (!ordered.length) return null;
  const slot = 100 / ordered.length;
  const currentIdx = ordered.findIndex((b) => b.current);

  // Position inside the current band, interpolated between its bounds. An
  // open-ended band borrows the mean band width so the marker still lands
  // somewhere honest instead of pinning to an edge.
  let markerPct = null;
  if (currentIdx >= 0 && ladder.score != null) {
    const band = ordered[currentIdx];
    const widths = ordered
      .filter((b) => b.min != null && b.max != null)
      .map((b) => b.max - b.min);
    const meanWidth = widths.length ? widths.reduce((s, w) => s + w, 0) / widths.length : 1;
    const lo = band.min ?? (band.max != null ? band.max - meanWidth : ladder.score);
    const hi = band.max ?? (band.min != null ? band.min + meanWidth : ladder.score);
    const span = hi - lo;
    const frac = span > 0 ? Math.min(1, Math.max(0, (ladder.score - lo) / span)) : 0.5;
    markerPct = currentIdx * slot + frac * slot;
  }

  return (
    <div className={`cutbar ${reversed || ladder.lowerIsBetter ? 'rev' : ''}`}>
      <span className="track" />
      {currentIdx >= 0 ? (
        <span className="youband" style={{ left: `${currentIdx * slot}%`, width: `${slot}%` }} />
      ) : null}
      {ordered.slice(1).map((b, i) => (
        <span key={`tick-${b.stars}`} className="tick" style={{ left: `${(i + 1) * slot}%` }} />
      ))}
      {ordered.map((b, i) => (
        <span key={`band-${b.stars}`} className={`band ${b.current ? 'on' : ''}`}
          style={{ left: `${i * slot + slot / 2}%` }}>
          <span className="bs">{b.stars}★</span>
          <span className="bv">{b.label}</span>
        </span>
      ))}
      {markerPct != null ? (
        <>
          <span className="you" style={{ left: `${markerPct}%` }} />
          <span className="note" style={{ left: `${markerPct}%` }}>
            {dec(ladder.score, ladder.lowerIsBetter ? 1 : 0)}
          </span>
        </>
      ) : null}
    </div>
  );
}

/* ── quarter cards ────────────────────────────────────────────────────────── */

const QCARD_CLASS = { published: 'now', predicted: 'pred', projected: 'proj' };

function QuarterCard({ q, maxPoints, quarterEnd, selected = false, onSelect, opensRoster = false }) {
  const ours = q.state !== 'published';

  // One flag, in precedence order: a star you gained or lost outranks a cushion
  // reading, and a disagreement with CMS outranks both — it is the rarest and
  // most consequential thing a card can be saying.
  let flag = null;
  if (q.disagreesWithPublished) {
    flag = <span className="qflag warn">⚠ ours {q.computedStar}★ · CMS {q.publishedStar}★</span>;
  } else if (q.starDeltaVsPrior != null && q.starDeltaVsPrior > 0) {
    flag = <span className="qflag good">↑ gains a star</span>;
  } else if (q.starDeltaVsPrior != null && q.starDeltaVsPrior < 0) {
    flag = <span className="qflag risk">↓ loses a star</span>;
  } else if (q.open && q.pointsAboveFloor != null) {
    flag = <span className="qflag warn">⚠ {n(q.pointsAboveFloor)} above cut</span>;
  }

  const cls = `qcard ${QCARD_CLASS[q.state]}${selected ? ' qsel' : ''}${onSelect ? ' qclick' : ''}`;
  return (
    /* NO_TRACK — selecting a quarter re-scopes the grid; the drill it enables
       emits its own event. */
    <div
      className={cls}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      } : undefined}
      title={onSelect
        ? (opensRoster
          // Say the bigger of the two things the click does. A tooltip promising
          // only a re-scope, on a card that navigates, reads as a misfire.
          ? `Open the ${q.displayLabel} roster — every resident, every measure`
          : `Scope the measure grid + drill-ins to ${q.displayLabel}`)
        : undefined}
    >
      <div className="qh">
        <span className="qq">{q.displayLabel}</span>
        <span className="qlab">{q.stateLabel}</span>
        {flag}
      </div>
      <div className="qbig">
        <span className="qn">{q.computedStar ?? '—'}</span>
        {/* One placeholder, not two: with no star there is nothing to draw five
            glyphs for, and "— —" reads as a rendering fault. */}
        {q.computedStar != null ? <Stars value={q.computedStar} projected={ours} /> : null}
      </div>
      <div className="qscore">
        <PtsSplit value={q.computedPoints} max={maxPoints} />
        <DeltaPts delta={q.pointsDeltaVsPrior} />
      </div>
      <div className="qsplit">
        <span>
          Long stay <b>{n(q.longStayPoints)}</b>{' '}
          {!q.open && q.longStayStar != null ? <Stars value={q.longStayStar} size="sm" projected={ours} /> : null}
        </span>
        <span>
          Short stay <b>{n(q.shortStayPoints)}</b>{' '}
          {!q.open && q.shortStayStar != null ? <Stars value={q.shortStayStar} size="sm" projected={ours} /> : null}
        </span>
      </div>
      <div className="qnote" title={q.notes.join(' ')}>
        <QuarterNote q={q} quarterEnd={quarterEnd} />
      </div>
    </div>
  );
}

function QuarterNote({ q, quarterEnd }) {
  if (q.state === 'published') {
    return (
      <>
        Live on Care Compare since the {fmtDateShort(q.publishedOnProcessingDate)} refresh.
        {q.disagreesWithPublished ? (
          <> Our window scores <b>{q.computedStar}★</b> — surfaced, not hidden.</>
        ) : null}
      </>
    );
  }
  if (q.state === 'predicted') {
    // Closed with nothing computed is a data gap, not a zero — say which.
    if (q.computedPoints == null) {
      return <>Closed, but we hold no computable window for it. {q.notes.join(' ')}</>;
    }
    return (
      <>
        Closed &amp; final.{' '}
        {q.starDeltaVsPrior != null && q.starDeltaVsPrior > 0 ? (
          <><b className="ok">{q.computedStar}★ is already earned</b>, CMS just hasn&apos;t posted it.</>
        ) : (
          <>Waiting on the CMS refresh that posts it.</>
        )}
      </>
    );
  }
  return (
    <>
      Closes {fmtDateShort(quarterEnd)}
      {q.daysUntilClose != null ? <> · {q.daysUntilClose} days left</> : null}.
    </>
  );
}

/* ── domain cards ─────────────────────────────────────────────────────────── */

function InspectionCard({ d }) {
  return (
    <div className="dcard">
      <div className="head">
        <h3>Health Inspection</h3>
        <span className="alias">survey</span>
        <span className="asof">STATE CURVE {fmtDateShort(d.distributionProcessingDate).toUpperCase()}</span>
      </div>
      <div className="main">
        <span className="score">{dec(d.surveyScore, 1)}</span>
        <Stars value={d.publishedStar} />
      </div>
      <div className="facts">
        {d.percentileInState != null ? <span>Top <b>{d.percentileInState}%</b> in {d.state ?? '—'}</span> : null}
        {d.facilitiesInState != null ? <span><b>{n(d.facilitiesInState)}</b> facilities in the state curve</span> : null}
        <span>
          Prior-year cut lines{' '}
          <b>{d.priorYear.status === 'available' ? fmtDateShort(d.priorYear.processingDate) : 'collecting'}</b>
        </span>
        {d.usedNationalFallback ? <span>National distribution fallback</span> : null}
        {d.abuseIconApplied ? <span>Abuse-icon cap applied</span> : null}
      </div>
      {d.ladder ? <CutBar ladder={d.ladder} reversed /> : null}
      <div className={`cutmsg ${d.ladder?.proximity === 'at_risk' || d.ladder?.proximity === 'in_reach' ? 'warn' : ''}`}>
        <InspectionCutMsg d={d} />
      </div>
    </div>
  );
}

function InspectionCutMsg({ d }) {
  const l = d.ladder;
  const nextBand = l?.nextStar != null ? l.bands.find((b) => b.stars === l.nextStar) : null;
  return (
    <>
      {l?.pointsToNextStar != null && l.nextStar != null ? (
        <>
          <b>{dec(l.pointsToNextStar, 1)} pts from {l.nextStar}★</b>
          {nextBand?.max != null ? <> (≤{dec(nextBand.max, 1)})</> : null} — lower is better.{' '}
        </>
      ) : l?.pointsAboveFloor != null && l.currentStar != null ? (
        <>
          <b>{dec(l.pointsAboveFloor, 1)} pts of room</b> before {l.currentStar}★ slips — lower is better.{' '}
        </>
      ) : null}
      {d.carriesForward ? <>Carries forward until the next survey; nothing to action day-to-day.</> : null}
    </>
  );
}

function StaffingCard({ s }) {
  const lever = s.cheapestLever;
  const nextBand = s.nextStar != null ? s.ladder.bands.find((b) => b.stars === s.nextStar) : null;
  return (
    <div className="dcard">
      <div className="head">
        <h3>Staffing</h3>
        {s.edition ? <span className="alias">{s.edition}</span> : null}
        <span className="asof">
          {s.ratingSource === 'not_rated' ? 'NOT RATED'
            : s.ratingSource === 'forced_one_star' ? 'SCORING EXCEPTION'
              : 'AS PUBLISHED'}
        </span>
      </div>
      <div className="main">
        <span className="score"><PtsSplit value={s.points} max={s.maxPoints} cls="smax" /></span>
        <Stars value={s.publishedStar} />
      </div>
      <div className="facts">
        <span>Total <b>{dec(s.reported.totalNurseHprd, 2)}</b> HPRD</span>
        <span>RN <b>{dec(s.reported.rnHprd, 2)}</b></span>
        <span>Weekend <b>{dec(s.reported.weekendTotalNurseHprd, 2)}</b></span>
        <span>RN turnover <b>{dec(s.reported.rnTurnoverPct, 1)}%</b></span>
        {s.reported.totalNurseTurnoverPct != null ? (
          <span>Staff turnover <b>{dec(s.reported.totalNurseTurnoverPct, 1)}%</b></span>
        ) : null}
      </div>
      <CutBar ladder={s.ladder} />
      <div className={`cutmsg ${s.ladder.proximity === 'in_reach' || s.ladder.proximity === 'at_risk' ? 'warn' : ''}`}>
        {s.pointsForNextStar != null && s.nextStar != null ? (
          <>
            <b>{n(s.pointsForNextStar)} pts to {s.nextStar}★</b>
            {nextBand?.min != null ? <> ({n(nextBand.min)})</> : null}.{' '}
          </>
        ) : null}
        {lever?.deltaLabel ? (
          <>
            <b>{lever.deltaLabel}</b> is the cheapest route
            {/* CMS scores case-mix ADJUSTED hours; a scheduler can only add REPORTED
                ones. The reported delta is the ask — the adjusted one is fine print. */}
            {lever.basis === 'reported' ? <> (reported hours — what a scheduler can add)</> : null}
            {lever.sufficientAlone ? <> and gets there on its own</> : <>, alongside the others</>}.
          </>
        ) : (
          <>No single staffing lever reaches the next star.</>
        )}
        {s.precisionUnstable ? (
          <> A published input sits inside its own rounding interval of a cut point — our star may
            legitimately differ from CMS&apos;s.</>
        ) : null}
      </div>
    </div>
  );
}

/* ── QM grid ──────────────────────────────────────────────────────────────── */

/**
 * Distance from a measure's CURRENT rate to the nearest bracket edge, in the
 * measure's own rate units — "how close am I to gaining/losing points on this
 * one". This is the question the screen exists to answer per row: a facility
 * 0.1pp from a 20-point cliff is a different situation from one sitting mid-band,
 * and points alone never show that.
 *
 * `at_risk` = the edge you would FALL off is nearer than the one you could gain.
 * Ties go to at_risk: a point you can lose outranks a point you might gain.
 */
function measureProximity(row, cell) {
  const rate = cell?.adjustedRate ?? cell?.rate;
  if (rate == null || !Number.isFinite(rate) || !row.brackets.length) return null;
  const cur = row.brackets.find((b) => b.current);
  if (!cur) return null;

  const scale = isPerThousand(row) ? 1 : 100;
  const better = row.brackets.filter((b) => b.points > cur.points);
  const worse = row.brackets.filter((b) => b.points < cur.points);

  // For a lower-is-better measure the gain edge is the current band's LOWER
  // bound and the loss edge is its UPPER bound; higher-is-better inverts both.
  const gainEdge = row.higherIsBetter ? cur.max : cur.min;
  const lossEdge = row.higherIsBetter ? cur.min : cur.max;

  const gainPts = better.length ? Math.min(...better.map((b) => b.points)) : null;
  const lossPts = worse.length ? Math.max(...worse.map((b) => b.points)) : null;

  const toGain = gainPts != null ? Math.abs(rate - gainEdge) * scale : Infinity;
  const toLose = lossPts != null ? Math.abs(lossEdge - rate) * scale : Infinity;

  if (!Number.isFinite(toGain) && !Number.isFinite(toLose)) return null;
  if (!Number.isFinite(toGain)) return { kind: 'top', gap: toLose, points: lossPts };
  if (!Number.isFinite(toLose)) return { kind: 'floor', gap: toGain, points: gainPts };
  return toLose <= toGain
    ? { kind: 'at_risk', gap: toLose, points: lossPts }
    : { kind: 'in_reach', gap: toGain, points: gainPts };
}

/**
 * Rate gaps are small — 2 decimals unless that rounds an informative gap to 0.00.
 *
 * Below 0.005 even three decimals reads as a defect rather than a measurement:
 * "0.000pp to 80 pts" looks like something failed to compute, when it actually
 * means the rate is sitting exactly ON a band edge and ANY worsening drops it.
 * That is the most urgent state a measure can be in, so it must not be the one
 * that looks broken.
 */
const fmtGap = (g) => (g < 0.005 ? '<0.01' : g >= 0.1 ? g.toFixed(2) : g.toFixed(3));

/**
 * How close to a band edge counts as "act on this". Rates are percentage points;
 * per-1,000-day measures move on a different scale, hence the two numbers.
 */
const NEAR_PP = 0.5;
const NEAR_PER_1K = 0.25;

/**
 * A cutpoint flag — shown ONLY when the measure is genuinely near a band edge.
 *
 * This used to render on EVERY row with brackets, and six of nine read "top band
 * · 3.59pp of room". A measure sitting 3.59pp inside its band needs no decision,
 * so the chips that meant something were buried in chips that didn't. A flag on
 * every row is not a flag.
 *
 * The four `kind`s collapse to two DIRECTIONS:
 *   lose — the nearer edge costs points (`at_risk`, and `top`, which can only lose)
 *   gain — the nearer edge earns points (`in_reach`, and `floor`, which can only gain)
 * Direction, not band position, is what the colour encodes.
 */
function ProximityChip({ row, cell }) {
  const p = measureProximity(row, cell);
  if (!p) return null;

  const perThousand = isPerThousand(row);
  const unit = perThousand ? '' : 'pp';
  if (p.gap > (perThousand ? NEAR_PER_1K : NEAR_PP)) return null;

  const losing = p.kind === 'at_risk' || p.kind === 'top';
  const title = losing
    ? `${fmtGap(p.gap)}${unit} of worsening drops this measure to ${p.points} pts.`
    : `${fmtGap(p.gap)}${unit} of improvement earns ${p.points} pts.`;

  return (
    <span className={`prox ${losing ? 'lose' : 'gain'}`} title={title}>
      <span className="prox__dir" aria-hidden>{losing ? '▼' : '▲'}</span>
      <span className="prox__gap">{fmtGap(p.gap)}{unit}</span>
      <span className="prox__stake">to {p.points} pts</span>
    </span>
  );
}

/** Point brackets for one measure. Same visual as the cut ladder, different data. */
function BracketPop({ row }) {
  if (!row.brackets.length) return null;
  const unit = isPerThousand(row) ? '' : '%';
  const bound = (v) => `${fmtRate(row, v)}${unit}`;
  return (
    <span className="cutpop" role="tooltip">
      <h4>{row.label} — point brackets</h4>
      {row.riskAdjusted ? (
        <span className="box">
          <b>Risk adjusted.</b> Our observed rate approximates the adjusted rate CMS publishes, so
          the bracket is close but not exact.
        </span>
      ) : null}
      {row.higherIsBetter ? <span className="box good">Higher is better on this measure.</span> : null}
      <span className="ladder">
        {row.brackets.map((b) => {
          const openLow = b.min <= 0;
          const openHigh = isPerThousand(row) ? b.max >= 999 : b.max >= 1;
          const range = openLow && openHigh ? 'any'
            : openLow ? `≤ ${bound(b.max)}`
              : openHigh ? `≥ ${bound(b.min)}`
                : `${bound(b.min)} – ${bound(b.max)}`;
          return (
            <span key={b.points} className={`r ${b.current ? 'you' : ''}`}>
              <span>{b.points} pts</span>
              <span>{range}{b.current ? ' ←' : ''}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

function MeasureCells({ row, cell, group, delta, onDrill, drillTitle }) {
  if (!cell) {
    return <td className={`${group} na`} colSpan={4}>not computed</td>;
  }
  const zoom = onDrill ? (
    <>
      <td className={`${group} num`}>
        {/* NO_TRACK — the measure view this opens emits its own event. */}
        <button type="button" className="cellbtn num" onClick={onDrill} title={drillTitle}>
          {n(cell.numerator)}
        </button>
      </td>
      <td>
        <button type="button" className="cellbtn" onClick={onDrill} title={drillTitle}> {/* NO_TRACK */}
          {n(cell.denominator)}
        </button>
      </td>
    </>
  ) : (
    <>
      <td className={`${group} num`}>{n(cell.numerator)}</td>
      <td>{n(cell.denominator)}</td>
    </>
  );
  return (
    <>
      {zoom}
      <td>{fmtRate(row, cell.adjustedRate ?? cell.rate)}</td>
      <td>
        <span className="ptwrap hasPop" tabIndex={0}>
          {pts(cell.points, row.maxPoints)} <DeltaPts delta={delta} />
          <BracketPop row={row} />
        </span>
      </td>
    </>
  );
}

function MeasureRow({ row, onOpenMeasure, quarterLabel }) {
  // `max N` used to sit here too, but every points cell on the row already reads
  // "120/150" — the ceiling was printed twice on one line. Risk-adjustment stays
  // because it changes how the rate itself should be read.
  const code = [row.cmsMeasureCode, row.riskAdjusted ? 'risk adj' : null].filter(Boolean).join(' · ');
  // MDS measures we compute drill into the measure view (the quarter's residents
  // and their evidence). Claims rows have nothing behind them to open.
  const drill = onOpenMeasure && row.measureId ? () => onOpenMeasure(row.measureId) : undefined;
  const drillTitle = `Zoom ${row.label} — residents in the numerator & denominator${quarterLabel ? ` for ${quarterLabel}` : ''}`;

  return (
    <tr>
      <td className="l">
        {drill ? (
          <button type="button" className="mname mlink mbtn" onClick={drill} /* NO_TRACK */
            title="Open this measure — residents, evidence & the quarter's denominator">
            {row.label}
          </button>
        ) : (
          <span className="mname">{row.label}</span>
        )}
        <span className="mcode">{code}</span>
        {/* ONE secondary signal per row. This cell used to stack the name, a
            "risk adj · max 150" sub-line, a proximity chip AND a "+N pts clearable"
            chip — four things competing before the reader reached a single number.
            "Clearable" is also the wrong promise: an antipsychotic reduction is a
            gradual dose reduction over months with physician sign-off, not a click. */}
        <ProximityChip row={row} cell={row.live ?? row.projected} />
      </td>
      <td className="gpub">{fmtRate(row, row.published?.adjustedRate ?? row.published?.rate)}</td>
      <td>{row.published ? pts(row.published.points, row.maxPoints) : '—'}</td>
      {row.computation === 'claims' ? (
        <>
          <td className="glive na" colSpan={4}>
            carries forward · {fmtRate(row, row.live?.rate ?? row.published?.rate)} ·{' '}
            {pts(row.live?.points ?? row.published?.points ?? null, row.maxPoints)} pts
          </td>
          <td className="gproj na" colSpan={4}>carries forward</td>
        </>
      ) : (
        <>
          <MeasureCells row={row} cell={row.live} group="glive"
            delta={row.liveVsPublishedPoints} onDrill={drill} drillTitle={drillTitle} />
          <MeasureCells row={row} cell={row.projected} group="gproj"
            delta={row.projectedVsPublishedPoints} onDrill={drill} drillTitle={drillTitle} />
        </>
      )}
    </tr>
  );
}

/**
 * A total's star. Five literal glyphs, not a digit chip — the digit-chip revision
 * made colour load-bearing and every cell had to be decoded. The projected chip
 * is dashed for the same reason the open quarter card is: it can still move.
 */
function StarChip({ cell, projected, dashed }) {
  if (!cell) return <span className="gridstar empty">—</span>;
  return (
    <span className={`gridstar hasPop ${dashed ? 'dashed' : ''}`} tabIndex={0}>
      <Stars value={cell.star} size="sm" projected={projected} />
      <CutLadder ladder={cell.ladder} />
    </span>
  );
}

const pointsDelta = (a, b) => (a == null || b == null ? null : a - b);

function TotalsRows({ row }) {
  return (
    <>
      <tr className="total">
        <td className="l">{row.label}</td>
        <td className="gpub" colSpan={2}>
          {/* CMS publishes a STAR, not the points behind it — so there is no
              published points figure to print here, and we do not invent one. */}
          {row.published?.points != null ? pts(row.published.points, row.maxPoints) : 'star only'}
        </td>
        <td className="glive" colSpan={4}>
          {pts(row.live.points, row.maxPoints)}{' '}
          <Trend delta={pointsDelta(row.live.points, row.published?.points ?? null)} />
        </td>
        <td className="gproj" colSpan={4}>
          {pts(row.projected.points, row.maxPoints)}{' '}
          <Trend delta={pointsDelta(row.projected.points, row.live.points)} />
        </td>
      </tr>
      <tr className="starrow">
        <td className="l" />
        <td className="gpub" colSpan={2}><StarChip cell={row.published} projected={false} /></td>
        <td className="glive" colSpan={4}><StarChip cell={row.live} projected /></td>
        <td className="gproj" colSpan={4}><StarChip cell={row.projected} projected dashed /></td>
      </tr>
    </>
  );
}

function SectionRow({ rows, label }) {
  const kinds = new Set(rows.map((r) => r.computation));
  const suffix = kinds.has('mds') && kinds.has('claims') ? 'MDS + claims'
    : kinds.has('claims') ? 'claims' : 'MDS';
  return (
    <tr className="sectionrow">
      <td className="l" colSpan={11}>{label} — {suffix}</td>
    </tr>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

const DATA_STATUS_COPY = {
  no_ccn: 'No CCN on this facility — nothing CMS publishes can be attached to it.',
  ccn_excluded: 'This CCN is deliberately excluded from CMS matching.',
  no_published_snapshot: 'Matched to a CCN, but we hold no published CMS snapshot yet.',
  no_computed_window: 'We hold published CMS data but no computable MDS window.',
};

/**
 * @param {object} props
 * @param {object} props.data  FiveStarFacilityResponse
 * @param {(measureId: string, quarterBack: number) => void} [props.onOpenMeasure]
 *   In-flow drill-in. `quarterBack` is the quarter being read (0 = open quarter
 *   … 3 = oldest in CMS's 4Q window) so the measure detail opens on THAT
 *   quarter's cohort rather than silently on the current one.
 * @param {() => void} [props.onScopeOut]  Back to the all-buildings board.
 * @param {string} [props.scopeOutLabel]
 * @param {number} [props.quarterBack]  Selected quarter, controlled when supplied.
 * @param {(back: number) => void} [props.onQuarterBackChange]
 * @param {(quarterBack: number) => void} [props.onOpenQuarterRoster]
 *   Quarter card → that quarter's full resident × measure grid. Fired ALONGSIDE
 *   the selection, not instead of it (the web does the same): the card both
 *   re-scopes the measure grid below and opens the roster, so coming back from
 *   the roster leaves the page on the quarter you were reading.
 */
export function FacilityFiveStar({
  data,
  onOpenMeasure,
  onOpenQuarterRoster,
  onScopeOut,
  scopeOutLabel = 'All buildings',
  quarterBack: quarterBackProp,
  onQuarterBackChange,
}) {
  // Which quarter the page is "in". Cards are oldest-first, so the last one is
  // the open quarter — that is the default reading and back=0. Controlled when
  // the host supplies it (it unmounts on drill-in, and internal state meant the
  // reader's chosen quarter silently reset on the way back).
  const [ownQuarterBack, setOwnQuarterBack] = useState(0);
  const quarterBack = quarterBackProp ?? ownQuarterBack;
  const setQuarterBack = (b) => {
    setOwnQuarterBack(b);
    onQuarterBackChange?.(b);
  };

  const selectedQuarter = data.quarters[data.quarters.length - 1 - quarterBack] ?? null;
  const overallTotal = data.totals.find((t) => t.axis === 'overall') ?? null;
  const qmMax = overallTotal?.maxPoints ?? 2300;
  const longRows = data.measures.filter((m) => m.stay === 'long');
  const shortRows = data.measures.filter((m) => m.stay === 'short');

  return (
    <div className="fivestar">
      <header className="fs-header">
        <div className="fs-frame topbar">
          <div className="crumb">
            {onScopeOut ? (
              <button type="button" className="crumblink" onClick={onScopeOut}>← {scopeOutLabel}</button> /* NO_TRACK */
            ) : (
              <span>Five-Star</span>
            )}{' '}
            / <b>{data.name}</b>
          </div>
          <div className="right">
            <AsOf asOfLabel={fmtDate(data.generatedAt)} />
            <span>CMS as of <b>{fmtDate(data.cmsAsOf)}</b></span>
          </div>
        </div>
      </header>

      <div className="fs-frame">
        {/* ── hero ── */}
        <div className="fac-hero">
          <div>
            <h1>{data.name}</h1>
            <div className="fac-sub">
              {[
                [data.city, data.state].filter(Boolean).join(', ') || null,
                data.ccn ? `CCN ${data.ccn}` : null,
                data.certifiedBeds != null ? `${data.certifiedBeds} beds` : null,
                `${data.census.longStay} long-stay / ${data.census.shortStay} short-stay today`,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="overall">
            <div className="lbl">Overall Rating</div>
            <Stars value={data.overall.published ?? data.published.overall} size="lg" />
            <div className="tag-line" title={data.overall.explanation}>
              PUBLISHED {fmtDateShort(data.published.processingDate ?? data.cmsAsOf).toUpperCase()}
              {data.overall.projected != null ? (
                <>{' · '}PROJECTED <Trend delta={data.overall.delta} /> {data.overall.projected}★</>
              ) : data.overall.unavailableReason ? (
                <> · NO OVERALL ({data.overall.unavailableReason.replace(/_/g, ' ')})</>
              ) : null}
            </div>
          </div>
        </div>

        {data.dataStatus !== 'ok' ? (
          <div className="fs-banner">
            <b>Limited data.</b> {DATA_STATUS_COPY[data.dataStatus] ?? data.dataStatus}
          </div>
        ) : null}

        {data.attention.length ? (
          <div className="attn">
            <span className="k">Needs a look</span>
            {data.attention.map((a, i) => {
              const tone = toneForKind(a.kind);
              return (
                <Pill key={`${a.code}-${i}`} tone={tone}>
                  {glyphForTone(tone)} {a.reason}
                </Pill>
              );
            })}
          </div>
        ) : null}

        {/* ── quarter timeline ── */}
        <div className="qcap">
          <b>Quality Measure score by quarter.</b> A quarter is <span className="ky proj">projected</span>{' '}
          while it&apos;s open, <span className="ky pred">predicted</span> once it closes and our data is
          final, then <span className="ky pub">published</span> when CMS catches up.
        </div>
        <div className="qtrack">
          {data.quarters.map((q, i) => {
            const back = data.quarters.length - 1 - i;
            return (
              <QuarterCard
                key={q.label}
                q={q}
                maxPoints={qmMax}
                quarterEnd={data.action.quarterEnd}
                selected={onOpenMeasure ? back === quarterBack : false}
                onSelect={onOpenMeasure ? () => {
                  setQuarterBack(back);
                  onOpenQuarterRoster?.(back);
                } : undefined}
                opensRoster={!!onOpenQuarterRoster}
              />
            );
          })}
        </div>

        {/* ── domain cards ── */}
        <div className="domains">
          <InspectionCard d={data.domains.healthInspection} />
          <StaffingCard s={data.domains.staffing} />
        </div>

        {/* ── QM grid ── */}
        <div className="panel pop">
          <div className="fs-panelhead">
            <h2>Quality Measure Detail</h2>
            <span className="sub">
              CMS scores a rolling 4-quarter window — <b>Live</b> is that window today,{' '}
              <b>Projected</b> is the same window after this quarter closes. Click any{' '}
              <b>num/den</b> for the residents behind it.
              {onOpenMeasure ? (
                <>
                  {' · '}
                  <b className="qscope">drill-ins open {selectedQuarter?.displayLabel ?? 'this quarter'}</b>{' '}
                  (click a quarter card above to change)
                </>
              ) : null}
            </span>
          </div>
          <table className="fqm">
            <thead>
              <tr className="grouprow">
                <th className="l" />
                <th className="gpub" colSpan={2}>Published — CMS {fmtDateShort(data.cmsAsOf)}</th>
                <th className="glive" colSpan={4}>
                  ● Live — 4-quarter window{' '}
                  {data.quarters.length
                    ? `${data.quarters[0].displayLabel}–${data.quarters[data.quarters.length - 1].displayLabel}`
                    : ''}
                </th>
                <th className="gproj" colSpan={4}>
                  ◌ Projected — same window after {fmtDateShort(data.action.quarterEnd)} close
                </th>
              </tr>
              <tr>
                <th className="l">Measure</th>
                <th className="gpub">Rate</th>
                <th>Points</th>
                <th className="glive">Num</th>
                <th>Den</th>
                <th>Rate</th>
                <th>Points</th>
                <th className="gproj">Num</th>
                <th>Den</th>
                <th>Rate</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <SectionRow rows={longRows} label="Long Stay" />
              {longRows.map((m) => (
                <MeasureRow key={m.key} row={m} quarterLabel={selectedQuarter?.displayLabel ?? null}
                  onOpenMeasure={onOpenMeasure ? (id) => onOpenMeasure(id, quarterBack) : undefined} />
              ))}
              {data.totals.filter((t) => t.axis === 'long').map((t) => <TotalsRows key={t.axis} row={t} />)}

              <SectionRow rows={shortRows} label="Short Stay" />
              {shortRows.map((m) => (
                <MeasureRow key={m.key} row={m} quarterLabel={selectedQuarter?.displayLabel ?? null}
                  onOpenMeasure={onOpenMeasure ? (id) => onOpenMeasure(id, quarterBack) : undefined} />
              ))}
              {data.totals.filter((t) => t.axis === 'short').map((t) => <TotalsRows key={t.axis} row={t} />)}

              {data.totals.filter((t) => t.axis === 'overall').map((t) => <TotalsRows key={t.axis} row={t} />)}
            </tbody>
          </table>
          <div className="footnote">
            <b>Claims &amp; QRP rows</b> are CMS-computed and carry forward at their published value
            until the next refresh — that is correct, not missing data. MDS rows are computed live
            in-house and update daily.
          </div>
        </div>

        {data.notes.length ? (
          <div className="foot"><b>Notes.</b> {data.notes.join(' · ')}</div>
        ) : null}
      </div>
    </div>
  );
}

export default FacilityFiveStar;
