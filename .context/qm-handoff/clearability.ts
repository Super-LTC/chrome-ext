/**
 * Clearability classification — the single source of truth for "how does this
 * measure clear", derived from the evaluator's `clearGuidance.actionType`.
 *
 * Pure (no DB, no I/O) so both the backend service and the web/Chrome-ext UIs
 * import the SAME mapping. This is what stops the recurring "clinical measures
 * shown as Clear-now" bug: clearability is computed once, server-side, and
 * everyone reads it instead of re-deriving.
 */
import type { QmClearActionType, QmClearability } from '../../types/qm-planner.types';

export function deriveClearability(actionType: QmClearActionType | undefined): QmClearability {
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
 * no-path. This is the predicate a "show me all clearable" filter uses.
 */
export function clearabilityHasLever(c: QmClearability | undefined): boolean {
  return c === 'clear_now' || c === 'needs_clinical' || c === 'needs_query';
}
