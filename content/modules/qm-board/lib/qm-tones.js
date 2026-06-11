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
import { statusBucketForEntry } from './qm-view-model.js';
import { deriveClearability, clearabilityHasLever } from './clearability.js';

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

// ── Clear timing (single source of truth — superapp #652 → corrected #656/#657)
// ONE decision used by BOTH the worklist row chip and the drill-in banner, so
// they can never disagree. Driven off the backend `clearability` field (NOT off
// dates) — a clinical measure's `earliestClearDate` is often "today" just
// because there's no MDS *coding* wait, but the wound still has to heal / the
// drug still has to be d/c'd, so date-keying falsely showed it green. Each
// result carries its own `big` (banner headline), `short` (row-chip label), and
// `sub` (banner sub-line); CLEAR_TONE[kind].badge gives the semantic color key.
//   now         — pure coding fix (Modification) — the ONLY green "Clear now"
//   date        — day-101 crosser still preventable before crossing (sky)
//   conditional — a lever exists but it's gated on clinical work / a Dx query
//                 that hasn't happened yet (amber — deliberately NOT green)
//   wait        — time-based / day-101 carries-over, ages out (slate)
//   locked      — stay-locked, no lever (slate)
export const CLEAR_TONE = {
  now:         { badge: 'emerald' },
  date:        { badge: 'sky' },
  conditional: { badge: 'amber' },
  wait:        { badge: 'slate' },
  locked:      { badge: 'slate' },
};

/**
 * When/whether one measure clears, relative to facility-local today. Labels are
 * keyed off the backend's `clearability` classification — fall back to deriving
 * it locally for older responses that don't carry the field (backwards compat).
 * Never key "now" off `earliestClearDate <= today`: only `clear_now`
 * (Modification — a pure coding fix) is green; everything else with a lever is
 * amber `conditional` because the clinical change / Dx query hasn't happened yet.
 */
export function clearTiming(entry, patient, facilityDate) {
  const g = entry.clearGuidance;
  const cliff = entry.cliffInfo;
  const crossing = isCrossingEntry(entry);
  const bucket = statusBucketForEntry(entry);
  const clr = entry.clearability ?? deriveClearability(g?.actionType);
  const hasClearPath = !crossing && bucket !== 'will_hit' && clearabilityHasLever(clr);

  if (crossing) {
    return cliff?.clearableBeforeCliff
      ? { kind: 'date', big: 'Preventable before day-101', short: 'Preventable', sub: g?.actions?.[0]?.label ?? 'clear the coding before they cross' }
      : { kind: 'wait', big: 'Carries over at day-101', short: 'Carries over', sub: 'already coded — appears when CDIF reaches 101' };
  }
  if (hasClearPath) {
    const action = g?.actions?.[0]?.label;
    // The ONLY clear that needs no clinical change is a coding fix (Modification):
    // re-code the MDS and it drops. That's the one true "Clear now".
    if (clr === 'clear_now') {
      return { kind: 'now', big: 'Ready to clear now', short: 'Clear now', sub: action ?? 're-code the MDS, then re-ARD' };
    }
    // A physician Dx query can be started today, but only clears once it's signed
    // back — not instant.
    if (clr === 'needs_query') {
      return { kind: 'conditional', big: 'Clears on a Dx query', short: 'Needs Dx query', sub: action ?? 'physician query + signed Dx, then re-ARD' };
    }
    // Clinical: gated on a clinical change (heal the wound, restore ambulation,
    // d/c the drug) that, by definition, hasn't happened yet — the measure is
    // still triggering. A bare re-ARD re-codes the same value and still triggers.
    // So it is NOT "clear now"; lead with the clinical action.
    return { kind: 'conditional', big: 'Clears once resolved', short: 'Needs clinical fix', sub: action ?? 'resolve the condition, then re-ARD' };
  }
  if (clr === 'stay_locked' || g?.actionType === 'stay_locked' || cliff?.urgency === 'stay-locked') {
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
