/**
 * Namespaced `kind` values the FL QIP coding-accuracy feature owns in the shared
 * `resident_dismissals` table.
 *
 * Ported verbatim from superltc `core/services/qm-planner/qip/fl-qip-coding-kinds.ts`,
 * which is a ZERO-IMPORT module for the same reason this one is: the dismissal
 * panel is a client component, and pulling the harvester/DB stack in behind these
 * two strings is the #1070 trap.
 *
 * THE STRINGS ARE THE WIRE FORMAT. `POST /fl-qip-coding-dismissal` validates
 * `kind` against this exact set and 400s on anything else — including a
 * plausible-looking `fl_qip_prognosis` or `flQip:prognosis`. They are shared with
 * a table other features also write to, so the `fl_qip:` namespace is what keeps
 * one feature's dismissals from being read as another's.
 */

export const FL_QIP_PROGNOSIS_KIND = 'fl_qip:prognosis';
export const FL_QIP_FLU_KIND = 'fl_qip:flu';
export const FL_QIP_DISMISSAL_KINDS = new Set([FL_QIP_PROGNOSIS_KIND, FL_QIP_FLU_KIND]);
