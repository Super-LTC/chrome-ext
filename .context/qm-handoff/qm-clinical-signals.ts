/**
 * View-model for the "Clinical Signals" surface (Mode 0) — new clinical events
 * (orders / labs / diagnoses) that will likely trip a QM at the next MDS, from
 * the preventable-alerts service. Pure (no React) so it stays testable.
 */
import type {
  QmAlert,
  QmAlertId,
  QmAlertSignal,
  QmAlertUrgency,
  QmPatientAlerts,
  QmPreventableAlertsResponse,
} from '@core/services/qm-planner/preventable-alerts/types';
import type { QmMeasureId, QmSummaryCounts } from '@core/types/qm-planner.types';
import { measureRate, ratePct } from './qm-view-model';

/** A documented Dx exempts this resident from the QM — render green, not as a problem. */
export function alertIsExcluded(a: QmAlert): boolean {
  return a.exclusions.length > 0;
}

/** Phrase a signal's date by source so it reads as the *added* date. */
export function signalDateVerb(source: QmAlertSignal['source']): string {
  switch (source) {
    case 'order':
      return 'started';
    case 'diagnosis':
      return 'onset';
    case 'note':
      return 'noted';
    default:
      return 'recorded';
  }
}

export interface AlertMeta {
  short: string;
  /** True = a lever exists to act before the MDS; false = already coded ("open an MDS now"). */
  dodgeable: boolean;
}

export const ALERT_META: Record<QmAlertId, AlertMeta> = {
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
export function alertName(a: QmAlert): string {
  return a.headline ?? ALERT_META[a.id].short;
}

export const ALERT_ORDER: QmAlertId[] = [
  'foley_order',
  'antipsychotic_order',
  'ua_canary',
  'uti_dx',
];

export interface UrgencyTone {
  dot: string;
  chip: string;
  text: string;
}

export const ALERT_URGENCY: Record<QmAlertUrgency, UrgencyTone> = {
  high: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200', text: 'text-rose-600' },
  medium: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200', text: 'text-amber-600' },
  low: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-200', text: 'text-slate-500' },
};

/** Actionable (not suppressed-by-coding, not snoozed) alerts for a resident. */
export function actionableAlerts(p: QmPatientAlerts): QmAlert[] {
  return [...p.events, ...p.canaries].filter((a) => !a.suppressedByExistingCoding && !a.snooze);
}

/** Residents with ≥1 actionable signal, most-signals first. */
export function signalResidents(data: QmPreventableAlertsResponse): QmPatientAlerts[] {
  return data.patients
    .filter((p) => actionableAlerts(p).length > 0)
    .sort((a, b) => actionableAlerts(b).length - actionableAlerts(a).length);
}

/**
 * Total actionable alerts across the facility (the headline count). Derived
 * from the patient alerts (not the server `signalCounts` snapshot) so it stays
 * correct as the UI dismisses signals client-side.
 */
export function totalActionable(data: QmPreventableAlertsResponse): number {
  return data.patients.reduce((n, p) => n + actionableAlerts(p).length, 0);
}

/** Per-type actionable breakdown, in display order, omitting zeros. */
export function signalBreakdown(
  data: QmPreventableAlertsResponse
): Array<{ id: QmAlertId; short: string; count: number }> {
  const counts = new Map<QmAlertId, number>();
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
 */
export interface QmStake {
  qmId: QmMeasureId;
  added: number;
  curPct: number;
  projPct: number;
}

/** Stable key for one signal (resident × alert) — used by the what-if. */
export function signalKey(patientId: string, alertId: string): string {
  return `${patientId}:${alertId}`;
}

/**
 * Stakes per threatened QM: today's rate vs the rate if signals get coded into
 * the numerator. Excluded signals never count. Pass `coded` (a set of
 * `signalKey`s) to project only the selected signals — the interactive what-if;
 * omit it for the worst-case "if all code" ceiling.
 */
export function qmStakes(
  data: QmPreventableAlertsResponse,
  summary: QmSummaryCounts,
  coded?: Set<string>
): QmStake[] {
  // Count distinct residents with a counting signal per threatened QM.
  const addedByQm = new Map<QmMeasureId, Set<string>>();
  for (const p of data.patients) {
    for (const a of actionableAlerts(p)) {
      if (alertIsExcluded(a)) continue; // an exclusion Dx means it won't count
      if (coded && !coded.has(signalKey(p.patientId, a.id))) continue;
      const set = addedByQm.get(a.qmId) ?? new Set<string>();
      set.add(p.patientId);
      addedByQm.set(a.qmId, set);
    }
  }
  const out: QmStake[] = [];
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
