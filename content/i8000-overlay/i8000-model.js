/**
 * i8000-model.js — pure transform from the I8000 overlay endpoint envelope
 * (GET /api/extension/mds/sections/I/i8000) into a render-ready view model.
 *
 * No DOM, no fetch, no globals — so it's unit-testable and the render layer
 * (i8000-overlay.js) stays a thin DOM adapter. Mirrors the shapes documented in
 * docs/plans/2026-06-28-section-i-i8000-overlay-contract.md (backend handoff).
 */

import { sectionIBadgeLabel } from '../super-menu/mds-badge.js';

/**
 * Map an audit verdict to the inline badge shown on an entered I8000{A–J} row.
 * Returns null for unknown verdicts (caller renders nothing).
 *
 * @param {'agree'|'disagree'|'outside_scope'} verdict
 * @returns {{kind: string, label: string}|null}
 */
export function auditBadge(verdict) {
  switch (verdict) {
    case 'agree':
      return { kind: 'agree', label: 'Supported' };
    case 'disagree':
      return { kind: 'disagree', label: 'Weak evidence' };
    case 'outside_scope':
      // The common case (nurses dump every dx in here) — de-emphasized in the UI.
      return { kind: 'outside', label: 'Not a PDPM category' };
    default:
      return null;
  }
}

/**
 * Build the view model the overlay renders from.
 *
 * @param {Object|null} response - the raw endpoint envelope
 *   { success, state: 'ok'|'no_run'|'skipped', i8000: I8000OverlayContract, ... }
 * @returns {{
 *   state: string|null,
 *   stale: boolean,
 *   audits: Array,
 *   banner: { suggestionCount, potentialNtaPoints, slotsAvailable, slotsFull, suggestions },
 *   hasAudits: boolean,
 *   hasSuggestions: boolean,
 * }}
 */
export function buildI8000ViewModel(response) {
  const state = response?.state ?? null;
  const contract = response?.i8000 || null;

  const empty = {
    state,
    stale: false,
    audits: [],
    banner: {
      suggestionCount: 0,
      potentialNtaPoints: 0,
      slotsAvailable: null,
      slotsFull: false,
      suggestions: [],
    },
    hasAudits: false,
    hasSuggestions: false,
  };

  // Only the "ok" state carries a contract to render. no_run / skipped / null
  // pass their state through with nothing to draw.
  if (state !== 'ok' || !contract) {
    return empty;
  }

  const summary = contract.summary || {};

  const audits = (contract.auditedExisting || []).map((row) => ({
    field: row.field,
    enteredCode: row.enteredCode,
    enteredDisplay: row.enteredDisplay,
    verdict: row.verdict,
    badge: auditBadge(row.verdict),
    categoryKey: row.categoryKey ?? null,
    reason: row.reason || '',
    // Dx/Tx one-liners + pass flags — same fields the checkbox Section I items
    // carry, so the modal renders the "✓ Dx: … / ✗ Tx: …" lines identically.
    // Backend puts these at the row level; fall back to result-nested defensively.
    diagnosisSummary: row.diagnosisSummary ?? row.result?.diagnosisSummary ?? null,
    diagnosisPassed: row.diagnosisPassed ?? row.result?.diagnosisPassed ?? null,
    treatmentSummary: row.treatmentSummary ?? row.result?.treatmentSummary ?? null,
    activeStatusPassed: row.activeStatusPassed ?? row.result?.activeStatusPassed ?? null,
    result: row.result ?? null,
  }));

  const suggestions = (contract.suggestedMissing || [])
    .map((row) => ({
      categoryKey: row.categoryKey,
      categoryName: row.categoryName,
      component: row.component,
      ntaPoints: row.ntaPoints ?? 0,
      status: row.result?.status ?? null,
      statusLabel: sectionIBadgeLabel(row.result || {}),
      diagnosisSummary: row.diagnosisSummary ?? row.result?.diagnosisSummary ?? null,
      diagnosisPassed: row.diagnosisPassed ?? row.result?.diagnosisPassed ?? null,
      treatmentSummary: row.treatmentSummary ?? row.result?.treatmentSummary ?? null,
      activeStatusPassed: row.activeStatusPassed ?? row.result?.activeStatusPassed ?? null,
      result: row.result ?? null,
    }))
    // Backend already sorts by ntaPoints desc; sort defensively so the "money"
    // suggestions always lead regardless of upstream ordering.
    .sort((a, b) => b.ntaPoints - a.ntaPoints);

  const slotsAvailable = summary.slotsAvailable ?? null;

  return {
    state,
    stale: !!contract.stale,
    audits,
    banner: {
      suggestionCount: summary.suggestedCount ?? suggestions.length,
      potentialNtaPoints: summary.potentialNtaPoints ?? 0,
      slotsAvailable,
      slotsFull: slotsAvailable === 0,
      suggestions,
    },
    hasAudits: audits.length > 0,
    hasSuggestions: suggestions.length > 0,
  };
}
