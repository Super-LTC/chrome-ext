/**
 * Clearability classification — the single source of truth for "how does this
 * measure clear", derived from the evaluator's `clearGuidance.actionType`.
 *
 * Ported from the web app / backend (services/qm-planner/clearability.ts,
 * superapp #656/#657). Pure (no DB, no I/O) so the backend service and the
 * web/Chrome-ext UIs share the SAME mapping. This is what stops the recurring
 * "clinical measures shown as Clear-now" bug: clearability is computed once,
 * server-side (the `clearability` field on every triggering measure), and
 * everyone reads it instead of re-deriving. This file is only the local
 * FALLBACK for older responses that don't carry the field. TS types stripped
 * for the JS bundle.
 *
 * QmClearActionType = 'time'|'clinical'|'modification'|'dx_query'|'stay_locked'|'none'
 * QmClearability    = 'clear_now'|'needs_clinical'|'needs_query'|'time_based'|'stay_locked'|'none'
 */

export function deriveClearability(actionType) {
  switch (actionType) {
    case 'modification':
      return 'clear_now';
    case 'clinical':
      return 'needs_clinical';
    case 'dx_query':
      return 'needs_query';
    case 'time':
      return 'time_based';
    case 'stay_locked':
      return 'stay_locked';
    default:
      return 'none';
  }
}

/**
 * Whether a lever exists at all — i.e. the team can still act to clear it this
 * stay (re-code, clinical change, or Dx query), vs purely time-based / locked /
 * no-path. This is the predicate a "show me all clearable" filter uses, so it
 * matches the backend exactly.
 */
export function clearabilityHasLever(c) {
  return c === 'clear_now' || c === 'needs_clinical' || c === 'needs_query';
}
