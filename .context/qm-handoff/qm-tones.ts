/**
 * Shared presentation constants + tiny formatters for the QM Command Center.
 * Class-string tone maps and date/name helpers used by the overview,
 * measure-detail, and drill-in. Pure (no JSX) so it stays import-cheap.
 */
import type {
  QmClearUrgency,
  QmMeasureEntry,
  QmPatientRow,
  QmUpcomingMeasureEntry,
  QmUpcomingPatientRow,
} from '@core/types/qm-planner.types';
import { deriveClearability } from '@core/services/qm-planner/clearability';
import { entryIsActionable, statusBucketForEntry, type StatusBucket } from './qm-view-model';

// ── Urgency tone (resident-level cliff urgency) ─────────────────────────────
export interface Tone {
  dot: string;
  spine: string;
  chip: string;
  text: string;
  label: string;
  rank: number;
}

export const URGENCY: Record<QmClearUrgency, Tone> = {
  'at-risk': {
    dot: 'bg-rose-500',
    spine: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
    text: 'text-rose-600',
    label: 'At risk',
    rank: 0,
  },
  urgent: {
    dot: 'bg-amber-500',
    spine: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    text: 'text-amber-600',
    label: 'Act now',
    rank: 1,
  },
  routine: {
    dot: 'bg-sky-500',
    spine: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
    text: 'text-sky-600',
    label: 'Clearable',
    rank: 2,
  },
  'stay-locked': {
    dot: 'bg-slate-400',
    spine: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    text: 'text-slate-500',
    label: 'Stay-locked',
    rank: 3,
  },
};

/** Violet tone for the day-101 "Going to trigger soon" (crossing) population. */
export const CROSSING: Pick<Tone, 'dot' | 'spine' | 'chip' | 'text'> = {
  dot: 'bg-violet-500',
  spine: 'bg-violet-500',
  chip: 'bg-violet-50 text-violet-700 ring-violet-200',
  text: 'text-violet-600',
};

// ── Status-bucket tone (the rose/sky/slate worklist + segment groups) ───────
// Single source of truth for the three honest buckets. `at_risk` is loud
// (rose), `will_hit` is deliberately calm (slate) — it's awareness, not a
// to-do, so it should never compete for attention with the real worklist.
export interface StatusBucketTone {
  label: string;
  sub: string;
  dot: string;
  chip: string; // pill bg+text+ring
  text: string; // accent text
  seg: string; // hero-segment badge bg+text
}

export const STATUS_BUCKET: Record<StatusBucket, StatusBucketTone> = {
  at_risk: {
    label: 'At risk',
    sub: 'A lever still exists — and the cliff is near',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
    text: 'text-rose-600',
    seg: 'bg-rose-100 text-rose-600',
  },
  clearable: {
    label: 'Clearable',
    sub: 'A lever exists, with runway before the cliff',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
    text: 'text-sky-600',
    seg: 'bg-sky-100 text-sky-600',
  },
  will_hit: {
    label: 'Will hit',
    sub: 'No lever this stay — it counts no matter what',
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    text: 'text-slate-500',
    seg: 'bg-slate-100 text-slate-500',
  },
};

/** True when this entry is a synthetic day-101 crosser (built by crosserToDrill). */
export function isCrossingEntry(entry: QmMeasureEntry): boolean {
  return entry.cliffInfo?.cliffLabel?.startsWith('Crosses to long-stay') ?? false;
}

// ── Small derivations ───────────────────────────────────────────────────────
export function entryUrgency(entry: QmMeasureEntry): QmClearUrgency {
  return entry.cliffInfo?.urgency ?? 'routine';
}

/** Most-severe urgency across a resident's triggering measures. */
export function rowUrgency(row: QmPatientRow): QmClearUrgency {
  let best: QmClearUrgency = 'stay-locked';
  for (const m of row.measures) {
    if (!m.triggers) continue;
    const u = entryUrgency(m);
    if (URGENCY[u].rank < URGENCY[best].rank) best = u;
  }
  return best;
}

export function soonestCliffDays(row: QmPatientRow): number {
  let min = Infinity;
  for (const m of row.measures) {
    if (m.triggers && m.cliffInfo) min = Math.min(min, m.cliffInfo.daysUntilCliff);
  }
  return min;
}

export function fullName(row: { firstName: string | null; lastName: string | null }): string {
  const last = row.lastName ?? '';
  const first = row.firstName ?? '';
  if (!last && !first) return '—';
  return `${last}${last && first ? ', ' : ''}${first}`.trim();
}

/** Compact clear-path microcopy for a triggering measure row. */
export function clearMicrocopy(entry: QmMeasureEntry): string {
  const g = entry.clearGuidance;
  if (!g) return '';
  if (g.actionType === 'stay_locked') return 'locked to stay';
  if (g.clearDate && g.daysUntilClear != null) {
    if (g.daysUntilClear <= 0) return 'clears now';
    if (g.daysUntilClear <= 30) return `clears in ${g.daysUntilClear}d`;
    return `clears ${prettyDate(g.clearDate)}`;
  }
  if (g.actionType === 'dx_query') return 'Dx query';
  if (g.actionType === 'modification') return 'review coding';
  return 'action needed';
}

/** One-line "how to clear" summary for a measure-detail row. */
export function clearPathSummary(entry: QmMeasureEntry): string {
  const g = entry.clearGuidance;
  if (g?.actions && g.actions.length > 0) {
    const a = g.actions[0];
    return a.detail ? `${a.label} — ${a.detail}` : a.label;
  }
  return entry.cliffInfo?.clearPathLabel ?? '';
}

export function quarterLabel(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  return `Q${q} ${iso.slice(0, 4)}`;
}

/** Label of the quarter AFTER the one this date falls in, e.g. Jun 30 → "Q3 2026". */
export function nextQuarterLabel(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  return q === 4 ? `Q1 ${year + 1}` : `Q${q + 1} ${year}`;
}

/** One projected day-101 hit → the QmMeasureEntry shape the drill-in renders. */
function crosserEntry(h: QmUpcomingMeasureEntry): QmMeasureEntry {
  return {
    id: h.id,
    label: h.label,
    applicable: true,
    triggers: true,
    excluded: false,
    evidence: h.evidence,
    clearGuidance: h.clearGuidance,
    cliffInfo: {
      cliffDate: h.crossingDate,
      cliffLabel: `Crosses to long-stay ${prettyDate(h.crossingDate)}`,
      cliffType: 'point_in_time',
      daysUntilCliff: h.daysUntilCrossing,
      clearableBeforeCliff: h.bucket === 'preventable',
      urgency: h.urgency,
      clearPathLabel: h.clearGuidance?.actions?.[0]?.label ?? '',
    },
  };
}

/**
 * Adapt a day-101 crosser into the {patient, entry} shape the drill-in renders.
 * ALL of the resident's projected hits go on `patient.measures` so the drill-in
 * shows every crossing measure in one modal (clicking any one pill opens the
 * full set); `entry` is just the clicked one. Cliff reads "Crosses to long-stay
 * <date>".
 */
export function crosserToDrill(
  p: QmUpcomingPatientRow,
  h: QmUpcomingMeasureEntry
): { patient: QmPatientRow; entry: QmMeasureEntry } {
  const measures = p.projectedHits.map(crosserEntry);
  return {
    patient: {
      patientId: p.patientId,
      externalPatientId: p.externalPatientId,
      firstName: p.firstName,
      lastName: p.lastName,
      admissionDate: null,
      payerClassification: null,
      stayType: 'short',
      currentMedicareDay: null,
      cdif: p.cdif,
      target: p.longStayTarget
        ? {
            assessmentId: p.longStayTarget.assessmentId,
            ardDate: p.longStayTarget.ardDate,
            type: p.longStayTarget.type,
            obraType: null,
            is5Day: false,
            isPpsDischarge: false,
          }
        : null,
      measures,
      triggeringCount: measures.length,
      nextObraPreview: { wouldClear: [], wouldNotClear: [] },
    },
    entry: crosserEntry(h),
  };
}

export function prettyDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Clear timing — "can this clear, and when" — shared by the worklist row and
//    the drill-in banner so they always agree. ───────────────────────────────
export type QmClearKind = 'now' | 'date' | 'conditional' | 'wait' | 'locked';

export interface QmClearTiming {
  kind: QmClearKind;
  /** Big modal-banner headline, e.g. "Ready to clear now" / "Can clear Jun 20". */
  big: string;
  /** Compact list-row label, e.g. "Clear now" / "Clear Jun 20" / "Stay-locked". */
  short: string;
  /** Modal sub-line. */
  sub: string;
}

export const CLEAR_TONE: Record<QmClearKind, { box: string; chip: string; text: string; badge: string }> = {
  now: { box: 'border-emerald-200 bg-emerald-50', chip: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  date: { box: 'border-sky-200 bg-sky-50', chip: 'bg-sky-500', text: 'text-sky-700', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  // Amber = a lever exists, but it's gated on clinical work / a Dx query that
  // hasn't happened yet. Deliberately NOT green — it isn't clearable today.
  conditional: { box: 'border-amber-200 bg-amber-50', chip: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  wait: { box: 'border-slate-200 bg-slate-50', chip: 'bg-slate-400', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
  locked: { box: 'border-slate-200 bg-slate-50', chip: 'bg-slate-400', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
};

/** When/whether one measure clears, relative to facility-local today. */
export function clearTiming(
  entry: QmMeasureEntry,
  patient: QmPatientRow,
  facilityDate?: string | null
): QmClearTiming {
  const g = entry.clearGuidance;
  const cliff = entry.cliffInfo;
  const crossing = isCrossingEntry(entry);
  const bucket = statusBucketForEntry(entry);
  const hasClearPath = !crossing && bucket !== 'will_hit' && entryIsActionable(entry);

  if (crossing) {
    const preventable = !!cliff?.clearableBeforeCliff;
    return preventable
      ? { kind: 'date', big: 'Preventable before day-101', short: 'Preventable', sub: g?.actions?.[0]?.label ?? 'clear the coding before they cross' }
      : { kind: 'wait', big: 'Carries over at day-101', short: 'Carries over', sub: 'already coded — appears when CDIF reaches 101' };
  }
  if (hasClearPath) {
    const action = g?.actions?.[0]?.label;
    // Read the backend's clearability classification; fall back to deriving it
    // locally for older responses that don't carry the field (backwards compat).
    const clr = entry.clearability ?? deriveClearability(g?.actionType);
    // The ONLY clear that needs no clinical change is a coding fix (Modification):
    // re-code the MDS and it drops today. That's the one true "Clear now".
    if (clr === 'clear_now') {
      return { kind: 'now', big: 'Ready to clear now', short: 'Clear now', sub: action ?? 're-code the MDS, then re-ARD' };
    }
    // A physician Dx query can be started today, but only clears once it's
    // signed back — not instant.
    if (clr === 'needs_query') {
      return { kind: 'conditional', big: 'Clears on a Dx query', short: 'Needs Dx query', sub: action ?? 'physician query + signed Dx, then re-ARD' };
    }
    // Clinical: gated on a clinical change (heal the wound, restore ambulation,
    // stabilize the weight, d/c the drug, re-screen after improvement) that, by
    // definition, hasn't happened yet — the measure is still triggering. A bare
    // re-ARD today re-codes the same value and still triggers. So it is NOT
    // "clear now"; lead with the clinical action.
    return { kind: 'conditional', big: 'Clears once resolved', short: 'Needs clinical fix', sub: action ?? 'resolve the condition, then re-ARD' };
  }
  if (g?.actionType === 'stay_locked' || cliff?.urgency === 'stay-locked') {
    return { kind: 'locked', big: 'Locked to this stay', short: 'Stay-locked', sub: 'clears at discharge or a new stay' };
  }
  // Change measures (Walk-Indep, ADL Decline, Bowel/Bladder) don't "age out" of
  // a lookback window — each new target is judged against its own prior, so the
  // decline drops at the next assessment if the resident holds or improves.
  if (cliff?.cliffType === 'comparison') {
    return {
      kind: 'wait',
      big: 'Clears at the next assessment',
      short: 'Next assessment',
      sub: 'drops if the next target holds or improves vs its own prior',
    };
  }
  // Lookback-scan (Falls) / time-window (UTI): a coded event ages out by date.
  return {
    kind: 'wait',
    big: g?.clearDate ? `Counts until ${prettyDate(g.clearDate)}` : 'Ages out of the window',
    short: g?.clearDate ? `Until ${prettyDate(g.clearDate)}` : 'Time-based',
    sub: 'time-based — no action speeds it up',
  };
}

