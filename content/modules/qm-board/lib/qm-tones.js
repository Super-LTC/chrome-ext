/**
 * Shared presentation constants + tiny formatters for the QM Command Center.
 * Tone-token maps and date/name helpers used by the overview, measure-detail,
 * and drill-in. Pure (no JSX) so it stays import-cheap.
 *
 * Ported from web/components/quality-measures/qm-tones.ts (PR #626). The web
 * source used Tailwind class strings; here the maps carry semantic tone *keys*
 * (rose/sky/slate/violet/amber/emerald) that the extension CSS maps to colors
 * via `qm-tone-<key>` classes. Logic (ranks, derivations) is verbatim.
 */
import { statusBucketForEntry, entryIsActionable } from './qm-view-model.js';

// ── Urgency tone (resident-level cliff urgency) ─────────────────────────────
// Tone = { tone, label, rank }  — `tone` is the semantic key for CSS.
export const URGENCY = {
  'at-risk': { tone: 'rose', label: 'At risk', rank: 0 },
  urgent: { tone: 'amber', label: 'Act now', rank: 1 },
  routine: { tone: 'sky', label: 'Clearable', rank: 2 },
  'stay-locked': { tone: 'slate', label: 'Stay-locked', rank: 3 },
};

/** Violet tone for the day-101 "Going to trigger soon" (crossing) population. */
export const CROSSING = { tone: 'violet' };

// ── Status-bucket tone (the rose/sky/slate worklist + segment groups) ───────
// Single source of truth for the three honest buckets. `at_risk` is loud
// (rose), `will_hit` is deliberately calm (slate) — it's awareness, not a
// to-do, so it should never compete for attention with the real worklist.
export const STATUS_BUCKET = {
  at_risk: {
    label: 'At risk',
    sub: 'A lever still exists — and the cliff is near',
    tone: 'rose',
  },
  clearable: {
    label: 'Clearable',
    sub: 'A lever exists, with runway before the cliff',
    tone: 'sky',
  },
  will_hit: {
    label: 'Will hit',
    sub: 'No lever this stay — it counts no matter what',
    tone: 'slate',
  },
};

/** True when this entry is a synthetic day-101 crosser (built by crosserToDrill). */
export function isCrossingEntry(entry) {
  return entry.cliffInfo?.cliffLabel?.startsWith('Crosses to long-stay') ?? false;
}

// ── Clear timing (single source of truth — superapp PR #652) ────────────────
// ONE decision used by BOTH the worklist row chip and the drill-in banner, so
// they can never disagree. Returns a `kind` (+ a date for the dated kinds);
// CLEAR_TONE[kind] gives the chip color (`badge`) + terse label (`short`), and
// the drill-in maps the same kind to its louder banner title/sub.
//   ready       — a clean ARD today drops it (green "Clear now")
//   future      — clears on a future clean OBRA ARD (blue "Clear {date}")
//   locked      — stay-locked, no lever (slate "Stay-locked")
//   time        — time-based, ages out (slate "Time-based")
//   preventable — day-101 crosser, still preventable (green)
//   carries     — day-101 crosser, already coded (slate)
export const CLEAR_TONE = {
  ready:       { badge: 'emerald', short: 'Clear now' },
  future:      { badge: 'sky',     short: 'Clear' },        // consumer appends the date
  locked:      { badge: 'slate',   short: 'Stay-locked' },
  time:        { badge: 'slate',   short: 'Time-based' },
  preventable: { badge: 'emerald', short: 'Preventable' },
  carries:     { badge: 'slate',   short: 'Carries over' },
};

export function clearTiming(entry, patient, facilityDate) {
  const g = entry.clearGuidance;
  const cliff = entry.cliffInfo;
  if (isCrossingEntry(entry)) {
    return { kind: cliff?.clearableBeforeCliff ? 'preventable' : 'carries', date: null };
  }
  const hasClearPath = statusBucketForEntry(entry) !== 'will_hit' && entryIsActionable(entry);
  if (hasClearPath) {
    const date = cliff?.earliestClearDate ?? cliff?.actionDeadline ?? g?.clearDate ?? null;
    const readyNow = !date || (facilityDate && date <= facilityDate);
    return readyNow ? { kind: 'ready', date: null } : { kind: 'future', date };
  }
  if (g?.actionType === 'stay_locked' || cliff?.urgency === 'stay-locked') {
    return { kind: 'locked', date: null };
  }
  return { kind: 'time', date: g?.clearDate ?? null };
}

/** Row-chip label for a clear-timing result (`Clear {date}` for the dated kind). */
export function clearChipLabel(t) {
  return t.kind === 'future' && t.date ? `Clear ${prettyDate(t.date)}` : CLEAR_TONE[t.kind].short;
}

// ── Small derivations ───────────────────────────────────────────────────────
export function entryUrgency(entry) {
  return entry.cliffInfo?.urgency ?? 'routine';
}

/** Most-severe urgency across a resident's triggering measures. */
export function rowUrgency(row) {
  let best = 'stay-locked';
  for (const m of row.measures) {
    if (!m.triggers) continue;
    const u = entryUrgency(m);
    if (URGENCY[u].rank < URGENCY[best].rank) best = u;
  }
  return best;
}

export function soonestCliffDays(row) {
  let min = Infinity;
  for (const m of row.measures) {
    if (m.triggers && m.cliffInfo) min = Math.min(min, m.cliffInfo.daysUntilCliff);
  }
  return min;
}

/**
 * Stay label for a resident meta line. The day-in-facility count only matters
 * for short-stay residents (they're counting up toward day-101 / long-stay);
 * for long-stay it's meaningless clutter, so show just "Long". Short reads
 * "Short · Day {cdif}" so it's clear what day they're on.
 */
export function stayDayLabel(p) {
  const stay = p.stayType === 'short' ? 'Short' : p.stayType === 'long' ? 'Long' : (p.stayType ?? '');
  if (p.stayType === 'short' && p.cdif != null) return `${stay} · Day ${p.cdif}`;
  return stay;
}

export function fullName(row) {
  const last = row.lastName ?? '';
  const first = row.firstName ?? '';
  if (!last && !first) return '—';
  return `${last}${last && first ? ', ' : ''}${first}`.trim();
}

/** Compact clear-path microcopy for a triggering measure row. */
export function clearMicrocopy(entry) {
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
export function clearPathSummary(entry) {
  const g = entry.clearGuidance;
  if (g?.actions && g.actions.length > 0) {
    const a = g.actions[0];
    return a.detail ? `${a.label} — ${a.detail}` : a.label;
  }
  return entry.cliffInfo?.clearPathLabel ?? '';
}

export function quarterLabel(iso) {
  const m = Number(iso.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  return `Q${q} ${iso.slice(0, 4)}`;
}

/** Label of the quarter AFTER the one this date falls in, e.g. Jun 30 → "Q3 2026". */
export function nextQuarterLabel(iso) {
  const year = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  return q === 4 ? `Q1 ${year + 1}` : `Q${q + 1} ${year}`;
}

/** One projected day-101 hit → the QmMeasureEntry shape the drill-in renders. */
function crosserEntry(h) {
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
export function crosserToDrill(p, h) {
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

export function prettyDate(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
