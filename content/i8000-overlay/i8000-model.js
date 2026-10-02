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
 * Key a suggested category's nurse decision the way the backend does.
 *
 * Decisions are stored per (assessment, mdsItem, mdsColumn). An I8000 category
 * is mdsItem 'I8000' + mdsColumn = its category key ('NTA:25') — the same pair
 * the solver writes onto the mds_item_detections row — and GET /mds/decisions
 * returns them keyed `${mdsItem}${mdsColumn}`, i.e. 'I8000NTA:25'.
 *
 * @param {string} categoryKey - e.g. 'NTA:25'
 * @returns {string}
 */
export function i8000DecisionKey(categoryKey) {
  return `I8000${categoryKey || ''}`;
}

/**
 * Build the view model the overlay renders from.
 *
 * @param {Object|null} response - the raw endpoint envelope
 *   { success, state: 'ok'|'no_run'|'skipped', i8000: I8000OverlayContract, ... }
 * @param {Object} [decisions] - GET /mds/decisions map, keyed `${mdsItem}${mdsColumn}`
 *   → { decision: 'agree'|'disagree', note }. A suggestion the nurse already
 *   agreed or disagreed with is resolved: it stays listed, but drops out of the
 *   "could add N points" headline.
 * @returns {{
 *   state: string|null,
 *   stale: boolean,
 *   audits: Array,
 *   banner: { suggestionCount, potentialNtaPoints, slotsAvailable, slotsFull, suggestions },
 *   hasAudits: boolean,
 *   hasSuggestions: boolean,
 * }}
 */
export function buildI8000ViewModel(response, decisions = {}) {
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
      openCount: 0,
      openNtaPoints: 0,
      resolvedCount: 0,
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
      decision: decisionFor(decisions, row.categoryKey),
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
    // suggestions always lead regardless of upstream ordering. Ones the nurse
    // has already decided sink below the open ones.
    .sort((a, b) => (!!a.decision - !!b.decision) || (b.ntaPoints - a.ntaPoints));

  const slotsAvailable = summary.slotsAvailable ?? null;
  const suggestionCount = summary.suggestedCount ?? suggestions.length;
  const potentialNtaPoints = summary.potentialNtaPoints ?? 0;
  const resolved = suggestions.filter((s) => s.decision);
  const resolvedPoints = resolved.reduce((sum, s) => sum + s.ntaPoints, 0);

  return {
    state,
    stale: !!contract.stale,
    audits,
    banner: {
      suggestionCount,
      potentialNtaPoints,
      slotsAvailable,
      slotsFull: slotsAvailable === 0,
      suggestions,
      // What's still waiting on the nurse — the headline counts these.
      openCount: Math.max(0, suggestionCount - resolved.length),
      openNtaPoints: Math.max(0, potentialNtaPoints - resolvedPoints),
      resolvedCount: resolved.length,
    },
    hasAudits: audits.length > 0,
    hasSuggestions: suggestions.length > 0,
  };
}

/**
 * The nurse's recorded decision on one suggested category, or null.
 * @returns {{decision: 'agree'|'disagree', note: string}|null}
 */
function decisionFor(decisions, categoryKey) {
  if (!categoryKey || !decisions) return null;
  const d = decisions[i8000DecisionKey(categoryKey)];
  if (!d || (d.decision !== 'agree' && d.decision !== 'disagree')) return null;
  return { decision: d.decision, note: String(d.note || '').trim() };
}
