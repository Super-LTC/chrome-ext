/**
 * Pure view-model for the in-house MDS worklist ("Currently triggering · in
 * house"). One `QmBoardResponse` + the active lens → the pieces each view renders:
 *
 *   buildInhouseView     — the List: `clearable` rows (things you can clear soon,
 *                          with a clear-countdown for time-bucketing) + a compact
 *                          `aboutToCross` summary + `signals` for the banner.
 *   buildInhouseCalendar — the Calendar: clearable items plotted on their date.
 *
 * (The Grid view is built component-side from these same payloads — it reuses the
 * existing measure tiles, so there's no Grid builder here.)
 *
 * Pure (no JSX) so it unit-tests without a DOM. Ported from the web's
 * qm-inhouse-view.ts (types stripped). Discharge function is intentionally
 * EXCLUDED from the clearable worklist — a nurse can't clear it by coding, so
 * it's noise on a "what do I clear" list.
 */
import { clearTiming, crosserToDrill, fullName } from './qm-tones.js';
import { crosserForLens, measureInLens, rowForLens, shortLabel } from './qm-view-model.js';

/** Measures that don't belong on the nurse's CLEAR worklist (no coding lever). */
const NOT_CLEARABLE_ON_LIST = new Set(['discharge_function']);

/** Friendly singular/plural labels for the signal banner, keyed by alert id. */
const SIGNAL_LABELS = {
  uti_dx: { one: 'new UTI', many: 'new UTIs' },
  ua_canary: { one: 'UA flag', many: 'UA flags' },
  antipsychotic_order: { one: 'new antipsychotic', many: 'new antipsychotics' },
  foley_order: { one: 'new catheter', many: 'new catheters' },
};

/** True when this triggering measure belongs on the nurse's clear worklist. */
function isClearableOnList(entry) {
  if (NOT_CLEARABLE_ON_LIST.has(entry.id)) return false;
  const clr = entry.clearability;
  // stay-locked / no-path measures can't be worked — drop from the clear list.
  return clr !== 'stay_locked' && clr !== 'none';
}

function daysBetweenIso(fromIso, toIso) {
  const f = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return 0;
  return Math.round((t - f) / 86_400_000);
}

/** Days from `today` until this measure can clear; null when there's no countdown. */
function daysUntilClearOf(entry, today) {
  if (entry.clearGuidance?.daysUntilClear != null) return entry.clearGuidance.daysUntilClear;
  if (entry.clearability === 'clear_now') return 0;
  const date = entry.clearGuidance?.clearDate ?? entry.cliffInfo?.earliestClearDate;
  if (date && today) return daysBetweenIso(today, date);
  return null;
}

/** Build the List view-model from one board payload + the active lens. */
export function buildInhouseView(board, lens, facilityState) {
  const today = board.currentlyTriggering.facilityDate ?? '';

  // ── clearable rows — one per (resident × clearable triggering measure) ──
  const clearable = [];
  let triggeringResidents = 0;
  const allRows = board.currentlyTriggering.patients.map((p) => rowForLens(p, lens, facilityState));
  for (const row of allRows) {
    if (row.triggeringCount === 0) continue;
    triggeringResidents += 1;
    for (const entry of row.measures) {
      if (!entry.triggers || !isClearableOnList(entry)) continue;
      const timing = clearTiming(entry, row, today);
      clearable.push({
        key: `${row.patientId}:${entry.id}`,
        patient: row,
        entry,
        patientName: fullName(row),
        measureLabel: shortLabel(entry.id, entry.label),
        clearShort: timing.short,
        clearKind: timing.kind,
        daysUntilClear: daysUntilClearOf(entry, today),
        ardDate: row.target?.ardDate ?? null,
      });
    }
  }
  // soonest-clearing first; null countdowns (clinical / no date) sink to the end.
  clearable.sort((a, b) => {
    const da = a.daysUntilClear ?? Number.POSITIVE_INFINITY;
    const db = b.daysUntilClear ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.patientName.localeCompare(b.patientName);
  });

  // ── about to cross — compact, lens-filtered ──
  const aboutToCross = [];
  for (const raw of board.upcoming.upcomingPatients) {
    const crosser = crosserForLens(raw, lens, facilityState);
    for (const hit of crosser.projectedHits) {
      if (!measureInLens(hit.id, lens, facilityState)) continue;
      aboutToCross.push({
        key: `${crosser.patientId}:${hit.id}`,
        patient: crosser,
        hit,
        patientName: fullName(crosser),
        measureLabel: shortLabel(hit.id, hit.label),
        crossingDate: hit.crossingDate,
        daysUntilCrossing: hit.daysUntilCrossing,
        preventable: hit.bucket === 'preventable',
        preventDeadline: hit.preventDeadline,
      });
    }
  }
  aboutToCross.sort((a, b) => a.crossingDate.localeCompare(b.crossingDate) || a.patientName.localeCompare(b.patientName));

  // ── signals — grouped by type for the banner ──
  const byId = new Map();
  for (const p of board.alerts?.patients ?? []) {
    for (const a of [...p.events, ...p.canaries]) {
      if (a.suppressedByExistingCoding || a.snooze) continue;
      const slot = byId.get(a.id) ?? { count: 0, patientIds: new Set() };
      slot.count += 1;
      slot.patientIds.add(p.patientId);
      byId.set(a.id, slot);
    }
  }
  const signals = [...byId.entries()]
    .map(([id, slot]) => {
      const lbl = SIGNAL_LABELS[id];
      const label = lbl ? (slot.count === 1 ? lbl.one : lbl.many) : id;
      return { id, label, count: slot.count, patientIds: [...slot.patientIds] };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const signalTotal = signals.reduce((n, s) => n + s.count, 0);

  return {
    clearable,
    aboutToCross,
    signals,
    signalTotal,
    triggeringResidents,
    totalResidents: allRows.length,
    crossLaterCount: board.upcoming.beyondHorizon ?? 0,
  };
}

// ── Calendar view — clearable items plotted on their actionable date ─────────

export function buildInhouseCalendar(board, lens, facilityState) {
  const view = buildInhouseView(board, lens, facilityState);
  const today = (board.currentlyTriggering.facilityDate ?? '').slice(0, 10);
  const items = [];

  for (const r of view.clearable) {
    const raw =
      r.entry.clearGuidance?.clearDate ??
      r.entry.cliffInfo?.earliestClearDate ??
      (r.clearKind === 'now' ? today : r.entry.cliffInfo?.cliffDate);
    if (!raw) continue;
    items.push({
      key: `clear:${r.key}`,
      date: raw.slice(0, 10),
      kind: 'clear',
      patientName: r.patientName,
      measureLabel: r.measureLabel,
      note: r.clearShort,
      drill: { patient: r.patient, entry: r.entry },
    });
  }

  for (const r of view.aboutToCross) {
    const raw = r.preventable && r.preventDeadline ? r.preventDeadline : r.crossingDate;
    if (!raw) continue;
    items.push({
      key: `cross:${r.key}`,
      date: raw.slice(0, 10),
      kind: 'cross',
      patientName: r.patientName,
      measureLabel: r.measureLabel,
      note: r.preventable ? 'prevent by' : 'crosses',
      drill: crosserToDrill(r.patient, r.hit),
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.patientName.localeCompare(b.patientName));
  return { items };
}
