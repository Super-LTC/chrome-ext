/**
 * Quarterly CMI → bar-chart view model.
 *
 * ── WHY THIS DOES NOT SCALE FROM ZERO ─────────────────────────────────────
 *
 * The QM trend chart normalizes rates against the tallest bar, which works
 * because a quality-measure rate genuinely spans 0–1. A nursing CMI does not: a
 * real building runs 1.35 → 1.48 across five quarters. Scaled from zero those
 * bars are 91%, 96%, 94%, 93%, 100% of the track — visually identical, and the
 * chart says nothing at all.
 *
 * So the bars are scaled to the VISIBLE RANGE, padded slightly. That makes the
 * movement legible, and it makes bar height a comparison between quarters rather
 * than a magnitude. Those are different claims, and the second one would be a
 * lie: a bar twice as tall is not twice the case mix.
 *
 * `baseline` and `top` are returned SO THE COMPONENT CAN LABEL THEM. A truncated
 * axis that does not say it is truncated is the oldest chart lie there is; the
 * caller is expected to print the floor. There is a test pinning that the
 * builder always hands back a usable pair.
 *
 * Pure — no Preact, no fetch, no DOM. Unit-tested in ./__tests__.
 */

/** "2026Q3" → "Q3 '26". Falls back to the raw label if it does not parse. */
export function shortQuarter(label) {
  const m = /^(\d{4})Q([1-4])$/.exec(String(label ?? ''));
  return m ? `Q${m[2]} '${m[1].slice(2)}` : String(label ?? '');
}

/** Pad a [min,max] range so the smallest bar is still visibly a bar. */
function padRange(min, max) {
  if (min == null || max == null) return { baseline: 0, top: 1 };
  if (max === min) {
    // One distinct value across every quarter. Any range works; pick one that
    // puts the flat line mid-track rather than at 0 or 100%.
    const pad = Math.max(0.05, Math.abs(max) * 0.05);
    return { baseline: +(min - pad).toFixed(4), top: +(max + pad).toFixed(4) };
  }
  const pad = (max - min) * 0.25;
  return { baseline: +(min - pad).toFixed(4), top: +(max + pad).toFixed(4) };
}

/** The three measures, mirroring the web surface. Anything else falls back to
 *  the payable one rather than rendering an undefined series. */
const METRICS = new Set(['medicaidCmi', 'allCmi', 'medicaidWithPendingCmi']);

/**
 * @param {Array<{quarter:string,medicaidCmi:number|null,allCmi:number|null,medicaidWithPendingCmi:number|null,inProgress:boolean,scored:number,medicaidScored:number,carryForward:number}>} quarters
 *        Oldest first, as the API returns them.
 * @param {{metric?: 'medicaidCmi'|'allCmi'|'medicaidWithPendingCmi'}} [opts]
 */
export function buildCaseMixTrend(quarters, opts = {}) {
  const metric = METRICS.has(opts.metric) ? opts.metric : 'medicaidCmi';
  const rows = Array.isArray(quarters) ? quarters : [];

  const points = rows.map((q) => {
    const value = typeof q?.[metric] === 'number' ? q[metric] : null;
    return {
      quarter: String(q?.quarter ?? ''),
      label: shortQuarter(q?.quarter),
      value,
      /** A quarter with no scoreable residents is a GAP, not a zero. */
      present: value != null,
      inProgress: q?.inProgress === true,
      // All-payer counts everyone scoreable; the two Medicaid measures count
      // only the payable set, and quoting the wrong denominator under a number
      // is how a building 'loses' twenty residents on a toggle.
      scored: metric === 'allCmi' ? (q?.scored ?? 0) : (q?.medicaidScored ?? 0),
      residents: q?.residents ?? 0,
      carryForward: q?.carryForward ?? 0,
      needsReview: q?.needsReview ?? 0,
      /**
       * How far this number is expected to RISE before the quarter settles, or
       * null. Server-supplied and server-scoped: non-null ONLY on an open quarter
       * in the payable population, because that is the only place it was
       * measured. Never synthesise one here.
       */
      drift: q?.drift ?? null,
      /** The clinical-category fold BELONGING TO THIS METRIC. See below. */
      composition: q?.composition?.[metric] ?? null,
    };
  });

  const values = points.filter((p) => p.present).map((p) => p.value);
  // The drift cap is drawn ABOVE the bar, so the axis has to contain it too —
  // otherwise the one quarter the band exists for is the one where it is clipped
  // flat against the top of the track and reads as no band at all.
  const capped = points
    .filter((p) => p.present && p.drift)
    .map((p) => p.value + p.drift.high);
  const spread = [...values, ...capped];

  const { baseline, top } = spread.length
    ? padRange(Math.min(...spread), Math.max(...spread))
    : { baseline: 0, top: 1 };

  const span = top - baseline;
  const frac = (v) => (span > 0 ? Math.min(1, Math.max(0, (v - baseline) / span)) : 0);
  for (const p of points) {
    // Clamped to [0,1] rather than trusted: a value outside the padded range can
    // only come from a bug, and a negative height silently inverts the bar.
    p.heightFrac = p.present ? frac(p.value) : 0;
    /** Top of the drift band, as a track fraction. Null when there is no band. */
    p.driftFrac = p.present && p.drift ? frac(p.value + p.drift.high) : null;
    /** Bottom of the band — the low end of the measured rise, not the bar itself. */
    p.driftFloorFrac = p.present && p.drift ? frac(p.value + p.drift.low) : null;
  }

  const present = points.filter((p) => p.present);
  const first = present[0]?.value ?? null;
  const last = present[present.length - 1]?.value ?? null;
  const delta = first != null && last != null ? +(last - first).toFixed(4) : null;

  return {
    metric,
    points,
    /** Bars are drawn against this floor, NOT zero. Print it. */
    baseline,
    top,
    first,
    last,
    delta,
    direction: delta == null || Math.abs(delta) < 0.0005 ? 'flat' : delta > 0 ? 'up' : 'down',
    /** The open quarter, if one is in the window — the only one a projection suits. */
    openQuarter: points.find((p) => p.inProgress) ?? null,
    /** Newest first, for the table view. See `buildCaseMixTableRows`. */
    rows: buildCaseMixTableRows(points),
  };
}

/**
 * The same quarters as a table, newest first, each with its move against the
 * quarter BEFORE it.
 *
 * A table is not a lesser chart here. Five bars can show shape but cannot show
 * the four numbers behind each one, and the bars were the only way to reach a
 * quarter's residents — which nobody discovered, because a bar does not look
 * like a button. Rows do.
 *
 * `change` is measured against the previous PRESENT quarter, skipping gaps. A
 * quarter with nothing scoreable is not a zero to fall from.
 */
export function buildCaseMixTableRows(points) {
  const list = Array.isArray(points) ? points : [];
  const out = [];
  let prev = null;

  for (const p of list) {
    out.push({
      ...p,
      /** Move from the previous scoreable quarter, or null for the first one. */
      change: p.present && prev != null ? +(p.value - prev).toFixed(4) : null,
    });
    if (p.present) prev = p.value;
  }

  return out.reverse();
}
