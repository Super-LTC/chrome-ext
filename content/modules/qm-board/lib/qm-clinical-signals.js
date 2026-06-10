/**
 * View-model for the "Clinical Signals" surface (Mode 0) — new clinical events
 * (orders / labs / diagnoses) that will likely trip a QM at the next MDS, from
 * the preventable-alerts service. Pure (no Preact) so it stays testable.
 *
 * Ported from web/components/quality-measures/qm-clinical-signals.ts (PR #626).
 */
import { measureRate, ratePct } from './qm-view-model.js';

// AlertMeta = { short, dodgeable }
//   dodgeable: true = a lever exists to act before the MDS;
//              false = already coded ("open an MDS now").
export const ALERT_META = {
  foley_order: { short: 'New Foley', dodgeable: true },
  antipsychotic_order: { short: 'New Antipsychotic', dodgeable: true },
  ua_canary: { short: 'UA / UTI workup', dodgeable: true },
  uti_dx: { short: 'UTI diagnosis', dodgeable: false },
};

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

/**
 * Lightweight "stakes" projection per threatened QM: today's observed rate vs
 * the rate if the new signals all get coded into the numerator. Pessimistic
 * (not every UA becomes a coded UTI) — labelled as a worst-case ceiling.
 * QmStake = { qmId, added, curPct, projPct }
 */
export function qmStakes(data, summary) {
  // Count distinct residents with an actionable signal per threatened QM.
  const addedByQm = new Map();
  for (const p of data.patients) {
    for (const a of actionableAlerts(p)) {
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
