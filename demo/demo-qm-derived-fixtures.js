/**
 * Derived QM fixtures — the endpoints the real QM Board calls that were never
 * captured in the HAR, reconstructed FROM the captured payloads so the demo
 * stays internally consistent.
 *
 * The rule here: never invent a number that the captured data already implies.
 *   • per-patient GG detail  → rebuilt from DEMO_QM_GG_DASHBOARD (real items,
 *     real baselines, real ARD, real `recentScores` as the chart's spine)
 *   • quarter-rates / rolling → rebuilt from DEMO_QM_BOARD, and reconciled so a
 *     drill-in roster sums back to the exact headline numerator/denominator
 *   • dfs/stay/{id}          → rebuilt from the DEMO_QM_DFS completed row
 *   • aide detail            → rebuilt from that aide's own roster row
 *
 * Everything is deterministic (seeded PRNG keyed on ids, fixed facility date —
 * no Math.random, no Date.now), so the same resident/aide renders identically on
 * every page load. That matters for a demo: a screenshot stays true.
 *
 * NOT covered: /qm-planner/fl-qip-official + /fl-qip-coding-dismissal. Those are
 * gated on `hasQipScorer(facilityState)`, which is FL-only, and this facility is
 * OH — the hook never fires. Adding them would be dead fixture code.
 */

import {
  DEMO_QM_BOARD,
  DEMO_QM_DFS,
  DEMO_QM_GG_DASHBOARD,
  DEMO_QM_GG_AIDE_LIST,
} from './demo-qm-real-fixtures.js';

// ── Deterministic primitives ────────────────────────────────────────────────

/** FNV-1a → 32-bit seed. Same string always yields the same stream. */
function seedFrom(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG (Math.random would reshuffle on reload). */
function rngFor(key) {
  let a = seedFrom(key);
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** ISO 'YYYY-MM-DD' + n days → ISO. UTC-only so there's no TZ drift. */
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** The facility "today" the whole capture was taken against. */
export const DEMO_FACILITY_DATE = DEMO_QM_BOARD.currentlyTriggering.facilityDate; // 2026-06-18

// ── Locations ───────────────────────────────────────────────────────────────
// The HAR anonymizer collapsed every `locationName` to the facility name, so all
// 99 residents render the same useless string where the real app shows a unit +
// room. Re-derive a stable unit/room per resident instead.

const UNITS = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4'];

/** Stable "Unit 3 — 312-B" for a patient id. */
export function unitRoomFor(patientId) {
  const rng = rngFor(`loc:${patientId}`);
  const unit = UNITS[Math.floor(rng() * UNITS.length)];
  const floor = Number(unit.slice(-1));
  const room = floor * 100 + 1 + Math.floor(rng() * 30);
  const bed = ['', '', '-A', '-B'][Math.floor(rng() * 4)];
  return `${unit} — ${room}${bed}`;
}

/** True when the capture's locationName is the clobbered facility-name placeholder. */
function isClobberedLocation(name) {
  return !name || /demo facility/i.test(name);
}

/** Patch a GG dashboard payload so residents show a unit/room, not the facility. */
export function withRealLocations(dashboard) {
  return {
    ...dashboard,
    patients: (dashboard.patients ?? []).map((p) => ({
      ...p,
      locationName: isClobberedLocation(p.locationName) ? unitRoomFor(p.patientId) : p.locationName,
    })),
  };
}

// ── 1. Per-patient GG decline detail ────────────────────────────────────────
// GET /api/extension/patients/:id/gg-decline
//
// The dashboard row already carries everything the detail screen needs — items,
// baselines, severity, ARD, and up to ~12 real `recentScores` per declining item.
// The old demo synthesizer ignored all of it and fabricated unrelated GG items,
// so the roster said "Sit to Stand / Toilet Transfer" and the drill-in charted
// "Lying to Sitting / Walk 150 Feet". This rebuilds from the row.

const GG_WINDOW_DAYS = 30;

/** Zero-padded GG code the chart parses back out via parseInt(loggedValue, 10). */
const logged = (v) => pad2(clamp(Math.round(v), 1, 6));

const AIDE_NAMES = (DEMO_QM_GG_AIDE_LIST.aides ?? []).map((a) => a.aideName).filter(Boolean);

/** Same CNA tends to work the same shift for the same resident — keep it stable. */
function aideFor(patientId, shiftIndex) {
  if (AIDE_NAMES.length === 0) return null;
  const rng = rngFor(`aide:${patientId}:${shiftIndex}`);
  return `${AIDE_NAMES[Math.floor(rng() * AIDE_NAMES.length)]}, CNA`;
}

/**
 * Daily GG scores for one item across the 30-day window.
 *
 * Real `recentScores` are pinned as-is (so the chart's worst point is the true
 * worst); the rest of the window is filled in trending from the MDS baseline
 * down to `worstShiftAverage`. The curve holds flat for the first third then
 * falls — the "was stable, then dropped" story a decline actually tells, rather
 * than 12 flat points sitting at the bottom with no visible decline.
 */
function scoresForItem({ patientId, item, endIso }) {
  const { mdsKey, name, baseline, worstShiftAverage, recentScores, decliningShifts } = item;
  const startIso = addDays(endIso, -(GG_WINDOW_DAYS - 1));
  const declined = worstShiftAverage != null && baseline != null && baseline - worstShiftAverage >= 1;

  // All three shifts chart GG, so all three get a series — otherwise the Night
  // tab is dead on every resident. (Night really is charted in the capture, just
  // less: ~9% of scores vs ~46/45% for day/evening — DAY_SKIP/NIGHT_SKIP below
  // reproduce roughly that ratio.)
  const shifts = [0, 1, 2];

  // Only the shifts the engine actually flagged carry the decline. A shift that
  // isn't in `decliningShifts` tracks the baseline — which is the point of the
  // shift selector: it shows the decline is shift-specific, not global.
  const declining = new Set((decliningShifts ?? []).map((s) => s.shiftIndex));

  // Pin the real captured scores.
  const pinned = new Map();
  for (const rs of recentScores ?? []) {
    if (rs?.date == null || rs?.value == null) continue;
    if (rs.date < startIso || rs.date > endIso) continue;
    pinned.set(`${rs.date}|${rs.shiftIndex ?? 0}`, rs.value);
    declining.add(rs.shiftIndex ?? 0);
  }
  // No shift-level detail at all → treat day+evening as the declining ones.
  if (declining.size === 0) { declining.add(0); declining.add(1); }

  const DAY_SKIP = 0.18;
  const NIGHT_SKIP = 0.55; // night charts less often, so the line is sparser

  const out = [];
  const rng = rngFor(`scores:${patientId}:${mdsKey}`);
  for (let d = 0; d < GG_WINDOW_DAYS; d += 1) {
    const date = addDays(startIso, d);
    const t = d / (GG_WINDOW_DAYS - 1);
    for (const shiftIndex of shifts) {
      const key = `${date}|${shiftIndex}`;
      const pin = pinned.get(key);

      let value;
      if (pin != null) {
        value = pin;
      } else {
        // Not every shift charts every day.
        if (rng() < (shiftIndex === 2 ? NIGHT_SKIP : DAY_SKIP)) continue;
        if (declined && declining.has(shiftIndex)) {
          // Flat for the first ~35% of the window, then ease down to the worst.
          const ease = t < 0.35 ? 0 : (t - 0.35) / 0.65;
          const target = baseline - (baseline - worstShiftAverage) * ease;
          const jitter = rng() < 0.25 ? (rng() < 0.5 ? -1 : 1) * 0.5 : 0;
          // Cap fill-in at the baseline: a fabricated point should never claim
          // the resident scored BETTER than their MDS baseline during a decline.
          // (Real pinned scores above baseline are left alone — that's charted
          // fact, and the badge reads off worstShiftAverage, not the endpoint.)
          value = clamp(Math.round(target + jitter), 1, Math.min(6, Math.round(baseline)));
        } else {
          const jitter = rng() < 0.15 ? (rng() < 0.5 ? -1 : 1) : 0;
          value = clamp(Math.round((baseline ?? 4) + jitter), 1, 6);
        }
      }

      out.push({
        id: `demo-gg-${patientId}-${mdsKey}-${date}-${shiftIndex}`,
        patientId,
        mdsQuestionKey: mdsKey,
        interventionName: name,
        shiftIndex,
        recordedDate: date,
        observationDate: date,
        value: logged(value),
        loggedValue: logged(value),
        aideName: aideFor(patientId, shiftIndex),
      });
    }
  }
  return out;
}

/**
 * Build the per-patient GG detail straight off the dashboard row, so the
 * drill-in always agrees with the roster row that opened it.
 * Returns null when the resident isn't in the GG dashboard at all.
 */
export function buildGgDetailFromDashboard(patientId) {
  const p = (DEMO_QM_GG_DASHBOARD.patients ?? []).find((x) => x.patientId === patientId)
    || (DEMO_QM_GG_DASHBOARD.snoozedPatients ?? []).find((x) => x.patientId === patientId);
  if (!p) return null;

  const endIso = DEMO_FACILITY_DATE;
  const declineByKey = new Map((p.declines ?? []).map((d) => [d.mdsKey, d]));

  // Union of baseline items + declining items — the detail charts all of them.
  const items = [];
  for (const b of p.baselines ?? []) {
    const d = declineByKey.get(b.mdsKey);
    items.push({
      mdsKey: b.mdsKey,
      name: b.name,
      baseline: b.value,
      worstShiftAverage: d?.worstShiftAverage,
      recentScores: d?.recentScores,
      decliningShifts: d?.decliningShifts,
    });
  }
  for (const d of p.declines ?? []) {
    if (items.some((i) => i.mdsKey === d.mdsKey)) continue;
    items.push({
      mdsKey: d.mdsKey,
      name: d.name,
      baseline: d.baseline,
      worstShiftAverage: d.worstShiftAverage,
      recentScores: d.recentScores,
      decliningShifts: d.decliningShifts,
    });
  }

  const scores = items.flatMap((item) => scoresForItem({ patientId, item, endIso }));

  return {
    decline: {
      locationName: isClobberedLocation(p.locationName) ? unitRoomFor(patientId) : p.locationName,
      mdsArdDate: p.mdsArdDate,
      overallSeverity: p.overallSeverity,
      // The detail screen reads baselines[].value/.rawValue and declines[].baseline.
      baselines: (p.baselines ?? []).map((b) => ({
        mdsKey: b.mdsKey, name: b.name, value: b.value, rawValue: b.rawValue,
      })),
      declines: (p.declines ?? []).map((d) => ({
        mdsKey: d.mdsKey,
        name: d.name,
        baseline: d.baseline,
        worstShiftAverage: d.worstShiftAverage,
        declineMagnitude: d.declineMagnitude,
        severity: d.severity,
      })),
    },
    scores,
    snooze: p.snooze ?? null,
  };
}

// ── 2. Windowed quarter rates + rolling 4-quarter trend ─────────────────────
// GET /api/extension/qm-planner/quarter-rates?back=N
// GET /api/extension/qm-planner/rolling
//
// The engine denominator is `applicable && !excluded && !skipped`. Summing the
// board's per-patient measures reproduces 15 of the 20 captured facility rates
// exactly; the other 5 differ by the residents the engine SKIPPED (short-stay
// measures with no 5-day PPS baseline, adl_decline with no qualifying prior).
// We mark exactly those as `skipped` so the drill-in roster reconciles to the
// headline rate instead of quietly disagreeing with it.

const QUARTERS = [
  { label: '2025Q3', start: '2025-07-01', end: '2025-09-30' },
  { label: '2025Q4', start: '2025-10-01', end: '2025-12-31' },
  { label: '2026Q1', start: '2026-01-01', end: '2026-03-31' },
  { label: '2026Q2', start: '2026-04-01', end: '2026-06-30' }, // in progress
];

const SKIP_REASONS = {
  adl_decline: 'No qualifying prior assessment',
  discharge_function: 'No 5-day PPS baseline',
  antipsychotic_new: 'No qualifying prior assessment',
  pressure_ulcer_short: 'No 5-day PPS baseline',
  influenza_vaccine: 'Outside flu-season window',
};

const FACILITY_RATES = DEMO_QM_BOARD.upcoming.facilityRates ?? [];
const RATE_BY_ID = new Map(FACILITY_RATES.map((r) => [r.measureId, r]));

/** Rate row from a numerator/denominator, preserving the captured label/nonCms. */
function rateCell(measureId, numerator, denominator) {
  const src = RATE_BY_ID.get(measureId);
  return {
    measureId,
    label: src?.label ?? measureId,
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : 0,
    nonCms: src?.nonCms ?? false,
  };
}

/**
 * Current-quarter resident rows, with `skipped` set so each measure's derived
 * denominator lands exactly on the captured facility rate.
 */
function buildCurrentRows() {
  const patients = DEMO_QM_BOARD.currentlyTriggering.patients ?? [];

  // Which (measure, patient) pairs must be skipped to hit the captured denominator.
  const skipSet = new Set();
  for (const fr of FACILITY_RATES) {
    const candidates = patients
      .filter((p) => p.measures.some((m) => m.id === fr.measureId && m.applicable && !m.excluded))
      // Never skip a triggering resident — that would move the numerator too.
      .sort((a, b) => {
        const at = a.measures.find((m) => m.id === fr.measureId)?.triggers ? 1 : 0;
        const bt = b.measures.find((m) => m.id === fr.measureId)?.triggers ? 1 : 0;
        return at - bt || a.patientId.localeCompare(b.patientId);
      });
    const excess = candidates.length - fr.denominator;
    for (let i = 0; i < excess && i < candidates.length; i += 1) {
      skipSet.add(`${fr.measureId}|${candidates[i].patientId}`);
    }
  }

  return patients.map((p) => ({
    patientId: p.patientId,
    name: `${p.lastName}, ${p.firstName}`,
    dischargeStatus: 'active',
    stayType: p.stayType ?? 'unknown',
    cdif: p.cdif ?? 0,
    // A handful are still counted on a not-yet-CMS-Accepted MDS ("MDS In Progress").
    targetAccepted: rngFor(`accepted:${p.patientId}`)() > 0.12,
    targetArd: p.target?.ardDate ?? null,
    measures: (p.measures ?? []).map((m) => {
      const skipped = skipSet.has(`${m.id}|${p.patientId}`);
      return {
        measureId: m.id,
        applicable: m.applicable,
        excluded: m.excluded,
        skipped,
        triggers: m.triggers,
        reason: m.excluded
          ? 'Excluded by measure specification'
          : skipped
            ? (SKIP_REASONS[m.id] ?? 'Not in the denominator this quarter')
            : null,
      };
    }),
  }));
}

/** Roll rows up into per-measure rates using the engine's denominator rule. */
function ratesFromRows(rows) {
  const agg = new Map();
  for (const r of rows) {
    for (const m of r.measures) {
      if (!agg.has(m.measureId)) agg.set(m.measureId, { num: 0, den: 0 });
      const a = agg.get(m.measureId);
      if (m.applicable && !m.excluded && !m.skipped) {
        a.den += 1;
        if (m.triggers) a.num += 1;
      }
    }
  }
  // Keep the captured measure order so the scorecard table doesn't reshuffle.
  return FACILITY_RATES.map((fr) => {
    const a = agg.get(fr.measureId) ?? { num: 0, den: 0 };
    return rateCell(fr.measureId, a.num, a.den);
  });
}

/**
 * Prior-quarter rows: same cohort, a slice discharged, and slightly MORE
 * triggering than today (so the facility reads as improving quarter over
 * quarter — a true story for this data, since the board shows active cleanup).
 */
function buildPastRows(quarterIndex) {
  const current = buildCurrentRows();
  const age = QUARTERS.length - 1 - quarterIndex; // 1 = last quarter, 3 = oldest
  return current.map((row) => {
    const rng = rngFor(`past:${quarterIndex}:${row.patientId}`);
    const discharged = rng() < 0.06 * age;
    return {
      ...row,
      dischargeStatus: discharged ? 'discharged' : 'active',
      cdif: Math.max(1, row.cdif - age * 91),
      targetAccepted: true, // older quarters are fully CMS-accepted
      targetArd: row.targetArd ? addDays(row.targetArd, -age * 91) : null,
      measures: row.measures.map((m) => {
        if (!m.applicable || m.excluded || m.skipped) return m;
        // Older quarters trigger a bit more often; never invent a trigger on a
        // measure that has no numerator at all in the captured data.
        const captured = RATE_BY_ID.get(m.measureId);
        if (!captured || captured.numerator === 0) return m;
        if (m.triggers) return m;
        // Drift PROPORTIONALLY to the measure's own rate (~30% worse per quarter
        // back). A flat probability made a 1.1% measure read 10% four quarters
        // ago, which is nonsense for a SNF — this keeps every series in a
        // believable band while still showing real movement on the big ones.
        const rate = captured.denominator > 0 ? captured.numerator / captured.denominator : 0;
        return { ...m, triggers: rng() < rate * 0.30 * age };
      }),
    };
  });
}

/** `back` = 0 current in-progress quarter, 1 = last complete quarter, … */
export function buildQuarterRates(back = 0) {
  const idx = QUARTERS.length - 1 - back;
  if (idx < 0) return null;
  const quarter = QUARTERS[idx];
  const rows = back === 0 ? buildCurrentRows() : buildPastRows(idx);
  // back=0 uses the captured rates verbatim; buildCurrentRows() is reconciled to
  // them, so the roster drill-in sums back to exactly these numbers.
  const rates = back === 0 ? FACILITY_RATES.map((r) => ({ ...r })) : ratesFromRows(rows);
  return { quarter, rates, rows };
}

/** Trailing 4 quarters, oldest-first, + the weighted rolling rate CMS scores on. */
export function buildRolling() {
  const quarters = QUARTERS.map((q, i) => ({
    ...q,
    rates: i === QUARTERS.length - 1
      ? FACILITY_RATES.map((r) => ({ ...r }))
      : ratesFromRows(buildPastRows(i)),
  }));

  const rolling = FACILITY_RATES.map((fr) => {
    const per = quarters.map((q) => {
      const c = q.rates.find((r) => r.measureId === fr.measureId);
      return { num: c?.numerator ?? 0, den: c?.denominator ?? 0 };
    });
    const totalNum = per.reduce((s, x) => s + x.num, 0);
    const totalDen = per.reduce((s, x) => s + x.den, 0);
    return {
      measureId: fr.measureId,
      totalNum,
      totalDen,
      weightedRate: totalDen > 0 ? totalNum / totalDen : 0,
      quarters: per,
    };
  });

  return {
    quarters,
    rolling,
    projection: {
      asOf: DEMO_FACILITY_DATE,
      currentQuarter: QUARTERS[QUARTERS.length - 1].label,
      daysRemaining: 12,
    },
  };
}

// ── 3. Discharge Function Score — per-stay outcome ──────────────────────────
// GET /api/extension/qm-planner/dfs/stay/{stayId}
//
// The completed row already has observed / expected / delta / met; only the
// per-item admission→discharge breakdown was never captured. Distribute the
// captured `observed` across the 10 GG items so the table footings match the
// summary the same modal prints above it.

const DFS_ITEMS = [
  { code: 'GG0130A', label: 'Eating' },
  { code: 'GG0130B', label: 'Oral Hygiene' },
  { code: 'GG0130C', label: 'Toileting Hygiene' },
  { code: 'GG0170A', label: 'Roll Left/Right' },
  { code: 'GG0170C', label: 'Lying to Sitting' },
  { code: 'GG0170D', label: 'Sit to Stand' },
  { code: 'GG0170E', label: 'Chair/Bed Transfer' },
  { code: 'GG0170F', label: 'Toilet Transfer' },
  { code: 'GG0170I', label: 'Walk 10 Feet' },
  { code: 'GG0170J', label: 'Walk 50 Feet' },
];

/** Split `total` into n values in [1,6] that sum exactly to it. */
function distribute(total, n, rng) {
  const out = new Array(n).fill(1);
  let left = clamp(total, n, n * 6) - n;
  // Spread the remainder in deterministic random order, capping each at 6.
  // Fisher-Yates, not sort() with a random comparator — a comparator that isn't
  // consistent is undefined behaviour and skews the distribution.
  const order = [...out.keys()];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  while (left > 0) {
    let moved = false;
    for (const i of order) {
      if (left <= 0) break;
      if (out[i] < 6) { out[i] += 1; left -= 1; moved = true; }
    }
    if (!moved) break;
  }
  return out;
}

export function buildDfsStay(stayId) {
  const stay = (DEMO_QM_DFS.completed ?? []).find((c) => c.stayId === stayId);
  if (!stay) return null;

  if (stay.excluded) {
    return { ...stay, rows: [] };
  }

  const rng = rngFor(`dfs:${stayId}`);
  const discharge = distribute(Math.round(stay.observed ?? 0), DFS_ITEMS.length, rng);

  const rows = DFS_ITEMS.map((it, i) => {
    // Most items gain a little over a stay; some stall, a few slip.
    const roll = rng();
    const gain = roll < 0.15 ? -1 : roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2;
    const admission = clamp(discharge[i] - gain, 1, 6);
    return {
      code: it.code,
      label: it.label,
      admission,
      discharge: discharge[i],
      // Walking items are the ones most often not charted at admission.
      admissionImputed: rng() < 0.12,
      dischargeImputed: rng() < 0.08,
    };
  });

  return {
    stayId: stay.stayId,
    patientId: stay.patientId,
    name: stay.name,
    dischargeDate: stay.dischargeDate,
    observed: stay.observed,
    expected: stay.expected,
    delta: stay.delta,
    met: stay.met,
    excluded: false,
    exclusionReason: null,
    primaryCondition: stay.primaryCondition,
    rows,
  };
}

// ── 4. Per-aide scorecard ───────────────────────────────────────────────────
// GET /api/extension/qm-planner/gg-aide-deviation?aideId=…
//
// Only ONE aide detail was captured but the roster has 56, so every card used to
// open the same person's scorecard (clicking "Khaliah Udeh" showed "Anesthasia
// Abercrombie"). Each roster row already carries the grade, counts, and the
// per-category / per-shift deviations — enough to rebuild that aide's own card.

const GG_PATIENT_NAMES = (DEMO_QM_GG_DASHBOARD.patients ?? [])
  .map((p) => ({ patientId: p.patientId, patientName: p.patientName }))
  .filter((p) => p.patientName);

const TREND_WEEK_STARTS = [-28, -21, -14, -7, 0].map((d) => {
  // Snap to the Monday-ish week starts the captured payload used.
  const base = addDays(DEMO_FACILITY_DATE, -3); // 2026-06-15
  return addDays(base, d);
});

export function buildAideDetail(aideId) {
  const aide = (DEMO_QM_GG_AIDE_LIST.aides ?? []).find((a) => a.aideId === aideId);
  if (!aide) return null;

  const rng = rngFor(`aidedetail:${aideId}`);
  const cats = aide.categoryDeviations ?? [];
  const shifts = aide.shiftDeviations ?? [];
  const overall = aide.overallAverageDeviation ?? 0;

  // Weekly trend converging toward this aide's overall deviation.
  const total = aide.assessmentCount ?? 0;
  const trend = TREND_WEEK_STARTS.map((weekStart, i) => {
    const t = i / (TREND_WEEK_STARTS.length - 1);
    const swing = (aide.variance ?? 1) * (1 - t) * (rng() - 0.5) * 2;
    return {
      weekStart,
      averageDeviation: Math.round((overall + swing) * 100) / 100,
      assessmentCount: Math.max(1, Math.round((total / TREND_WEEK_STARTS.length) * (0.5 + rng()))),
    };
  });

  // Recent scores to review — real residents, this aide's real categories, and a
  // deviation drawn around that category's captured average.
  const sampleCount = Math.min(24, Math.max(6, Math.round((aide.assessmentCount ?? 12) / 6)));
  const scores = [];
  for (let i = 0; i < sampleCount && cats.length > 0; i += 1) {
    const cat = cats[Math.floor(rng() * cats.length)];
    const pat = GG_PATIENT_NAMES[Math.floor(rng() * GG_PATIENT_NAMES.length)] ?? {
      patientId: 'demo-unknown', patientName: 'Resident',
    };
    const shift = shifts.length > 0
      ? shifts[Math.floor(rng() * shifts.length)].shiftIndex
      : Math.floor(rng() * 3);

    // deviation = peerAverage − aideScore (positive ⇒ scored BELOW peers).
    const dev = Math.round(((cat.averageDeviation ?? 0) + (rng() - 0.5) * 1.6) * 10) / 10;
    const aideScore = clamp(Math.round(3.5 - dev / 2), 1, 6);
    const peerAverage = Math.round(clamp(aideScore + dev, 1, 6) * 10) / 10;

    scores.push({
      patientId: pat.patientId,
      patientName: pat.patientName,
      mdsKey: cat.mdsKey,
      categoryName: cat.name,
      aideScore,
      peerAverage,
      deviation: Math.round((peerAverage - aideScore) * 10) / 10,
      recordedDate: addDays(DEMO_FACILITY_DATE, -Math.floor(rng() * 30)),
      shiftIndex: shift,
    });
  }
  scores.sort((a, b) => b.recordedDate.localeCompare(a.recordedDate));

  return {
    aideId: aide.aideId,
    aideName: aide.aideName,
    // The scorecard reads grade/counts/direction off `summary` — the roster row
    // already IS that summary.
    summary: { ...aide },
    scores,
    categoryDeviations: cats,
    shiftDeviations: shifts,
    trend,
  };
}
