/**
 * Pure view-model for the Regional Five-Star scorecard. Re-arranges the windowed
 * data we already compute (`QmRollingView` — 4 trailing quarters, discharged-
 * inclusive — plus the Five-Star prediction) into the two numbers regionals
 * actually want per measure: LAST QUARTER (final) and THIS QUARTER (projected).
 *
 * No engine work — the rolling quarters already sum the right discharge-inclusive
 * denominators per measure. This just picks last-complete vs current-in-progress
 * and computes the trend. Pure (no JSX); ported from qm-fivestar-view.ts.
 */
import { measureInLens, shortLabel } from './qm-view-model.js';
import { fiveStarMeasure, pointsForRate, nextTier } from './qm-five-star.js';
import { fullName } from './qm-tones.js';

/** Most QM measures are lower-is-better; these few are higher-is-better. */
const HIGHER_IS_BETTER = new Set(['influenza_vaccine', 'discharge_function']);

function cellFrom(rates, id, label) {
  const r = rates?.find((x) => x.measureId === id);
  if (!r) return null;
  return { label, numerator: r.numerator, denominator: r.denominator, rate: r.rate };
}

function trendOf(id, last, current) {
  if (!last || !current) return { trend: 'flat', deltaPts: null };
  const delta = current.rate - last.rate; // proportion
  const deltaPts = Math.round(delta * 1000) / 10; // pct points, 1 decimal
  if (Math.abs(delta) < 0.0005) return { trend: 'flat', deltaPts };
  const rateWentDown = delta < 0;
  const higherBetter = HIGHER_IS_BETTER.has(id);
  // improved = moved in the good direction for this measure
  const improved = higherBetter ? !rateWentDown : rateWentDown;
  return { trend: improved ? 'improved' : 'worsened', deltaPts };
}

/**
 * Build the Five-Star scorecard. `rolling.quarters` is oldest-first; the newest
 * is the current in-progress quarter (the projection), the one before it is the
 * last complete quarter (the final number regionals want).
 */
export function buildFiveStarScorecard(rolling, prediction, lens, facilityState, board) {
  // Actionable counts per measure: who can be cleared now (a fresh OBRA clears
  // it) vs who's about to cross day-101 into the long-stay denominator.
  const clearNowBy = new Map();
  const crossingBy = new Map();
  for (const p of board?.currentlyTriggering.patients ?? []) {
    for (const e of p.measures) {
      if (e.triggers && e.clearGuidance?.clearsOnNextObra) clearNowBy.set(e.id, (clearNowBy.get(e.id) ?? 0) + 1);
    }
  }
  for (const up of board?.upcoming.upcomingPatients ?? []) {
    for (const hit of up.projectedHits) crossingBy.set(hit.id, (crossingBy.get(hit.id) ?? 0) + 1);
  }

  const quarters = rolling?.quarters ?? [];
  const current = quarters.length > 0 ? quarters[quarters.length - 1] : undefined;
  const last = quarters.length > 1 ? quarters[quarters.length - 2] : undefined;

  // Union of measure ids seen across the two quarters, filtered to CMS + lens.
  const ids = new Set();
  for (const q of [last, current]) for (const r of q?.rates ?? []) if (!r.nonCms) ids.add(r.measureId);
  // DFS is pulled OUT of the temporal table into its own strip (buildDfsStrip):
  // it's a 12-month stay-based measure, not a quarter-over-quarter rate, so the
  // Last/This-quarter columns would misrepresent it. Its star points still flow
  // through the predictor independently.
  ids.delete('discharge_function');

  // 4-quarter weighted rate per measure — the rate CMS scores points on.
  const rolling4q = new Map();
  for (const r of rolling?.rolling ?? []) rolling4q.set(r.measureId, r.weightedRate);

  const measures = [];
  for (const id of ids) {
    if (!measureInLens(id, lens, facilityState)) continue;
    const label = shortLabel(id, last?.rates.find((r) => r.measureId === id)?.label ?? current?.rates.find((r) => r.measureId === id)?.label ?? id);
    const lastCell = cellFrom(last?.rates, id, last?.label ?? '');
    const currentCell = cellFrom(current?.rates, id, current?.label ?? '');
    const { trend, deltaPts } = trendOf(id, lastCell, currentCell);
    const spec = fiveStarMeasure(id);
    const rate4q = rolling4q.get(id) ?? currentCell?.rate ?? lastCell?.rate ?? null;
    const points = spec && rate4q != null ? pointsForRate(spec, rate4q) : null;
    const nt = spec && rate4q != null ? nextTier(spec, rate4q) : null;
    const clearNow = clearNowBy.get(id) ?? 0;
    const crossingSoon = crossingBy.get(id) ?? 0;
    const nextGainPts = nt ? nt.points - (points ?? 0) : null;
    const nextDeltaPts = nt ? Math.round(Math.abs(nt.delta) * 1000) / 10 : null;
    // Leverage = upside × ease + free wins + crossing urgency. Ease falls off
    // with the rate distance to the next tier, so "0.2% from +20" beats
    // "1.3% from +15"; clear-now residents are concrete levers, crossers urgent.
    const ease = nextDeltaPts != null ? 1 / (1 + nextDeltaPts) : 0;
    const leverage = (nextGainPts ?? 0) * ease + clearNow * 5 + crossingSoon * 3;
    measures.push({
      id,
      label,
      last: lastCell,
      current: currentCell,
      trend,
      deltaPts,
      points,
      maxPoints: spec?.maxPoints ?? null,
      maxed: spec != null && nt == null,
      nextGainPts,
      nextDeltaPts,
      clearNow,
      crossingSoon,
      leverage,
    });
  }
  // Highest-leverage first ("fix this first"); tie-break worst current rate, then label.
  measures.sort((a, b) => b.leverage - a.leverage || (b.current?.rate ?? 0) - (a.current?.rate ?? 0) || a.label.localeCompare(b.label));

  // Headline diagnosis: totals, headroom, the bubble, and the biggest drags.
  let totalPoints = 0;
  let maxTotal = 0;
  let headroomPts = 0;
  let bubbleCount = 0;
  for (const m of measures) {
    if (m.points == null || m.maxPoints == null) continue;
    totalPoints += m.points;
    maxTotal += m.maxPoints;
    if (m.nextGainPts != null) headroomPts += m.nextGainPts;
    if (!m.maxed && m.nextDeltaPts != null && m.nextDeltaPts <= 1.0) bubbleCount += 1; // within ~1 pt of the next tier
  }
  const drags = measures
    .filter((m) => m.points != null && m.maxPoints != null && m.maxPoints - m.points > 0)
    .map((m) => ({ label: m.label, lostPts: (m.maxPoints ?? 0) - (m.points ?? 0) }))
    .sort((a, b) => b.lostPts - a.lostPts)
    .slice(0, 3);
  // The single best move = the top of the leverage sort, if it has any lever.
  const top = measures[0];
  const topFix =
    top && top.leverage > 0
      ? { id: top.id, label: top.label, gainPts: top.nextGainPts, nextDeltaPts: top.nextDeltaPts, clearNow: top.clearNow, crossingSoon: top.crossingSoon }
      : null;
  const headline = { totalPoints, maxTotal, pointsBasis: 'current-rate', headroomPts, bubbleCount, drags, topFix };

  const anchorStar = prediction?.available ? (prediction.anchor.qm ?? null) : null;
  const projectedStar = prediction?.available ? (prediction.predicted.overall.predictedStar ?? null) : null;
  const rawTrend = prediction?.available ? prediction.predicted.overall.trend : null;
  const starTrend = rawTrend === 'up' || rawTrend === 'down' || rawTrend === 'flat' ? rawTrend : null;

  return {
    anchorStar,
    projectedStar,
    starTrend,
    lastLabel: last?.label ?? null,
    currentLabel: current?.label ?? null,
    headline,
    measures,
  };
}

// ── Per-measure resident list — the inline "spreadsheet" for an expanded row ──

/**
 * The residents in ONE measure's numerator for a given quarter, built from the
 * windowed ROSTER — so it includes discharged-but-still-counting residents and
 * reconciles exactly with that quarter's num/den (validated against prod). For
 * the CURRENT quarter we layer the board on for actionability (active residents
 * get clear-now + ARD; short-stay day-101 crossers are appended). For a PAST
 * quarter there's no action — just who counted (active vs discharged).
 */
export function buildMeasureResidents(roster, measureId, opts) {
  const out = [];

  // Board lookup (current quarter only) for active-triggering clear-now + ARD.
  const boardByPatient = new Map();
  if (opts.isCurrent) {
    for (const p of opts.board?.currentlyTriggering.patients ?? []) boardByPatient.set(p.patientId, p);
  }

  for (const row of roster ?? []) {
    const m = row.measures.find((x) => x.measureId === measureId);
    if (!m?.triggers) continue;
    const pendingSubmission = row.targetAccepted === false;
    if (row.dischargeStatus === 'discharged') {
      out.push({
        patientId: row.patientId,
        name: row.name,
        stayType: row.stayType,
        status: 'discharged',
        clearableNow: false,
        date: row.targetArd,
        note: 'discharged · still counts this quarter',
        pendingSubmission,
      });
      continue;
    }
    // Active resident in the numerator — pull clear-now + ARD from the board.
    const p = boardByPatient.get(row.patientId);
    const e = p?.measures.find((x) => x.id === measureId);
    const clearableNow = !!e?.clearGuidance?.clearsOnNextObra;
    out.push({
      patientId: row.patientId,
      name: row.name,
      stayType: row.stayType,
      status: 'triggering',
      clearableNow,
      date: row.targetArd,
      note:
        e?.clearGuidance?.actions?.[0]?.label ??
        (clearableNow ? 'open a fresh MDS' : opts.isCurrent ? 'no current lever' : 'counted this quarter'),
      pendingSubmission,
    });
  }

  // Day-101 crossers — current quarter only (not yet in the numerator).
  if (opts.isCurrent) {
    for (const up of opts.board?.upcoming.upcomingPatients ?? []) {
      const hit = up.projectedHits.find((h) => h.id === measureId);
      if (!hit) continue;
      out.push({
        patientId: up.patientId,
        name: fullName(up),
        stayType: 'short',
        status: 'crossing',
        clearableNow: false,
        date: hit.crossingDate,
        note: hit.bucket === 'preventable' ? `prevent by ${hit.preventDeadline ?? hit.crossingDate}` : 'carries over at day-101',
        pendingSubmission: false,
      });
    }
  }

  // Order: active-triggering (clearable first) → crossing → discharged (locked, last).
  const rank = (s) => (s === 'triggering' ? 0 : s === 'crossing' ? 1 : 2);
  return out.sort((a, b) => {
    if (a.status !== b.status) return rank(a.status) - rank(b.status);
    if (a.status === 'triggering' && a.clearableNow !== b.clearableNow) return a.clearableNow ? -1 : 1;
    return (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.name.localeCompare(b.name);
  });
}

// ── Upcoming day-101 crossers — the forward-looking, cross-measure section ──

function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The residents about to cross day-101 into the long-stay denominator, ONE row
 * per resident (a crosser can bring several measures at once — the per-measure
 * table can't show that), date-ordered, filtered to the active lens. This is the
 * forward-looking "what's coming" the backward/present table doesn't cover.
 */
export function buildUpcomingCrossers(board, lens, facilityState) {
  const today = board?.currentlyTriggering.facilityDate ?? null;
  const out = [];
  for (const up of board?.upcoming.upcomingPatients ?? []) {
    const hits = up.projectedHits.filter((h) => measureInLens(h.id, lens, facilityState));
    if (hits.length === 0) continue;
    const crossingDate = hits.map((h) => h.crossingDate).filter(Boolean).sort()[0] ?? null;
    out.push({
      patientId: up.patientId,
      name: fullName(up),
      crossingDate,
      daysUntil: crossingDate && today ? daysBetween(today, crossingDate) : null,
      measures: hits.map((h) => ({ id: h.id, label: shortLabel(h.id, h.id), preventable: h.bucket === 'preventable' })),
      anyPreventable: hits.some((h) => h.bucket === 'preventable'),
    });
  }
  return out.sort((a, b) => (a.crossingDate ?? '9999').localeCompare(b.crossingDate ?? '9999') || a.name.localeCompare(b.name));
}

/**
 * Roll a measure's resident list into counts. `numerator` (active + discharged)
 * is exactly the rate's numerator, so the panel's headline reconciles with the
 * num/den shown on the row — validated against prod (e.g. UTI 1/92 where the 1
 * is discharged).
 */
export function summarizeMeasureResidents(residents) {
  const activeCount = residents.filter((r) => r.status === 'triggering').length;
  const dischargedCount = residents.filter((r) => r.status === 'discharged').length;
  const crossing = residents.filter((r) => r.status === 'crossing').length;
  const clearableNow = residents.filter((r) => r.status === 'triggering' && r.clearableNow).length;
  return { numerator: activeCount + dischargedCount, activeCount, dischargedCount, clearableNow, crossing, total: residents.length };
}

// ── Discharge Function Score strip — DFS is its own thing, not a table row ──

/**
 * Build the DFS strip from the DfsService payload. Returns null when DFS isn't
 * available (no CCN match) so the caller can omit the strip entirely. We show
 * CURRENT (live) vs OFFICIAL (CMS published) plus the count of in-house residents
 * who'll join the rate when they discharge — but NOT a projected rate, since the
 * in-stay outcome can't be predicted reliably yet.
 */
export function buildDfsStrip(dfs) {
  if (!dfs || !dfs.available) return null;
  const live = dfs.live;
  const residents = dfs.inProgress?.residents ?? [];

  // DFS's Five-Star point contribution, scored on the current (live) rate — this
  // is what already flows into the projected ★ via the predictor.
  const spec = fiveStarMeasure('discharge_function');
  const points = spec && live.rate != null ? pointsForRate(spec, live.rate) : null;

  const cms = dfs.cms;
  return {
    current: {
      rate: live.rate,
      numerator: live.numerator,
      denominator: live.denominator,
      windowStart: live.windowStart,
      windowEnd: live.windowEnd,
      coveragePct: live.coveragePct,
    },
    official:
      cms && cms.rateShown != null
        ? { rate: cms.rateShown, numerator: cms.numerator, denominator: cms.denominator, windowStart: cms.windowStart, windowEnd: cms.windowEnd }
        : null,
    nationalRate: dfs.nationalRate,
    inHouseCount: residents.length,
    points,
    maxPoints: spec?.maxPoints ?? null,
  };
}
