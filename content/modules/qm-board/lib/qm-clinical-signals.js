/**
 * View-model for the "Clinical Signals" surface (Mode 0) — new clinical events
 * (orders / labs / diagnoses) that will likely trip a QM at the next MDS, from
 * the preventable-alerts service. Pure (no Preact) so it stays testable.
 *
 * Ported from web/components/quality-measures/qm-clinical-signals.ts
 * (Superjonathan123/qm-signals-polish, PR #645).
 */
import { measureRate, ratePct } from './qm-view-model.js';

/** A documented Dx exempts this resident from the QM — render green, not as a problem. */
export function alertIsExcluded(a) {
  return (a.exclusions?.length ?? 0) > 0;
}

/** Phrase a signal's date by source so it reads as the *added* date. */
export function signalDateVerb(source) {
  switch (source) {
    case 'order': return 'started';
    case 'diagnosis': return 'onset';
    case 'note': return 'noted';
    default: return 'recorded';
  }
}

// AlertMeta = { short, dodgeable }
//   dodgeable: true = a lever exists to act before the MDS;
//              false = already coded ("open an MDS now").
export const ALERT_META = {
  foley_order: { short: 'New Foley', dodgeable: true },
  antipsychotic_order: { short: 'New Antipsychotic', dodgeable: true },
  ua_canary: { short: 'UA / UTI workup', dodgeable: true },
  uti_dx: { short: 'UTI found', dodgeable: false },
};

/**
 * Display name for one signal — the per-instance `headline` when the backend
 * refined it ("Likely UTI" / "UA only" / "UTI found"), else the type's short
 * label. The breakdown/filter chips still group by the type's short label.
 */
export function alertName(a) {
  return a.headline ?? ALERT_META[a.id]?.short ?? a.id;
}

export const ALERT_ORDER = ['foley_order', 'antipsychotic_order', 'ua_canary', 'uti_dx'];

export const ALERT_URGENCY = {
  high: { tone: 'rose' },
  medium: { tone: 'amber' },
  low: { tone: 'slate' },
};

/** Actionable (not suppressed-by-coding, not snoozed) alerts for a resident. */
export function actionableAlerts(p) {
  return [...p.events, ...p.canaries].filter((a) => !a.suppressedByExistingCoding && !a.snooze);
}

/** Residents with ≥1 actionable signal, most-signals first. */
export function signalResidents(data) {
  return data.patients
    .filter((p) => actionableAlerts(p).length > 0)
    .sort((a, b) => actionableAlerts(b).length - actionableAlerts(a).length);
}

/**
 * Total actionable alerts across the facility (the headline count). Derived
 * from the patient alerts (not the server `signalCounts` snapshot) so it stays
 * correct as the UI dismisses signals client-side.
 */
export function totalActionable(data) {
  return data.patients.reduce((n, p) => n + actionableAlerts(p).length, 0);
}

/** Per-type actionable breakdown, in display order, omitting zeros. */
export function signalBreakdown(data) {
  const counts = new Map();
  for (const p of data.patients)
    for (const a of actionableAlerts(p)) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
  return ALERT_ORDER.map((id) => ({
    id,
    short: ALERT_META[id].short,
    count: counts.get(id) ?? 0,
  })).filter((x) => x.count > 0);
}

/** Stable key for one signal (resident × alert) — used by the what-if. */
export function signalKey(patientId, alertId) {
  return `${patientId}:${alertId}`;
}

/**
 * Stakes per threatened QM: today's rate vs the rate if signals get coded into
 * the numerator. Excluded signals never count. Pass `coded` (a set of
 * `signalKey`s) to project only the selected signals — the interactive what-if;
 * omit it for the worst-case "if all code" ceiling.
 * QmStake = { qmId, added, curPct, projPct }
 */
export function qmStakes(data, summary, coded) {
  const addedByQm = new Map();
  for (const p of data.patients) {
    for (const a of actionableAlerts(p)) {
      if (alertIsExcluded(a)) continue; // an exclusion Dx means it won't count
      if (coded && !coded.has(signalKey(p.patientId, a.id))) continue;
      const set = addedByQm.get(a.qmId) ?? new Set();
      set.add(p.patientId);
      addedByQm.set(a.qmId, set);
    }
  }
  const out = [];
  for (const [qmId, residents] of addedByQm) {
    const counts = summary.byMeasure[qmId];
    if (!counts) continue;
    const { num, den } = measureRate(counts);
    if (den <= 0) continue;
    const added = residents.size;
    out.push({
      qmId,
      added,
      curPct: ratePct(num, den),
      projPct: ratePct(Math.min(den, num + added), den),
    });
  }
  return out.sort((a, b) => b.projPct - b.curPct - (a.projPct - a.curPct));
}
