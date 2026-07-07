// content/modules/care-plan-stamp/worklistModel.js
//
// Pure (no Preact, no DOM) model for the V8 sidebar-worklist. Flattens a v2
// `audit` into ordered rows grouped by kind (add -> remove -> check), plus the
// covered list, the dropped list, and the "Add all" gate math. Mirrors the role
// of wizardModel.js but flat (no care-area grouping) — the worklist shows every
// focus as its own row, with remaining amber "touches" per add row.

import { areaLabel } from './careArea.js';

function _score(i) { return typeof i?.score === 'number' ? i.score : 0; }

const KIND_ORDER = ['add', 'remove', 'check'];
const KIND_LABEL = {
  add: 'Add',
  remove: 'Remove · resolved / discontinued',
  check: 'Check · your judgment',
};

/**
 * Build the worklist model from a raw v2 audit.
 *
 * Returns:
 *   {
 *     groups: [ { kind: 'add'|'remove'|'check', label, items: [...] } ],  // empty kinds omitted
 *     covered: [ onPlanItem, ... ],   // dimmed, clickable read-only rows
 *     dropped: [ { ruleId, description, reason, focus? }, ... ],
 *     totalAdds: number,
 *     orderedAdds: [ toAddItem, ... ],// score-desc, used for gate math
 *     areaOf: (item) => string,       // care-area label helper (falls back to 'Other')
 *   }
 */
export function buildWorklistModel(audit) {
  const empty = { groups: [], covered: [], dropped: [], totalAdds: 0, orderedAdds: [], areaOf: () => 'Other' };
  if (!audit || typeof audit !== 'object') return empty;

  // Stable sort by DESCENDING score (missing score = 0). Array.prototype.sort is
  // stable in modern engines, so equal scores keep insertion order.
  const adds = (Array.isArray(audit.toAdd) ? audit.toAdd : [])
    .slice().sort((a, b) => _score(b) - _score(a));
  const removes = Array.isArray(audit.toRemove) ? audit.toRemove : [];
  const checks = Array.isArray(audit.toCheck) ? audit.toCheck : [];

  const byKind = { add: adds, remove: removes, check: checks };
  const groups = [];
  for (const kind of KIND_ORDER) {
    const items = byKind[kind];
    if (items && items.length) groups.push({ kind, label: KIND_LABEL[kind], items });
  }

  const covered = Array.isArray(audit.onPlan) ? audit.onPlan : [];
  const dropped = Array.isArray(audit.dropped) ? audit.dropped : [];

  return {
    groups,
    covered,
    dropped,
    totalAdds: adds.length,
    orderedAdds: adds,
    areaOf: (item) => areaLabel(audit, item) || 'Other',
  };
}

/**
 * Amber "touches" left for one add row. `unfilledTokenKeys` and `flatNeedsInput`
 * are injected from the parent (they close over the modal's private helpers
 * `_focusUnfilledTokenKeys` / `_descNeedsInput`), keeping this file DOM/Preact-free
 * and independently testable.
 *   touches = # unfilled token keys, OR 1 if a flat `___` blank remains with no tokens.
 */
export function touchesForItem(item, tokenValues, unfilledTokenKeys, flatNeedsInput) {
  const focus = item?.focus;
  if (!focus) return 0;
  const keys = unfilledTokenKeys(focus, tokenValues || {});
  if (keys.length > 0) return keys.length;
  return flatNeedsInput(focus) ? 1 : 0;
}

// Open add rows = not stamped, not skipped. Shared by the gate + total helpers.
function _openAdds(model, stampedIds, skippedIds) {
  const stamped = stampedIds || new Set();
  const skipped = skippedIds || new Set();
  return (model.orderedAdds || []).filter(
    (it) => !stamped.has(it.ruleId) && !skipped.has(it.ruleId)
  );
}

/**
 * "Add all" is enabled ONLY when every OPEN add row (not stamped, not skipped)
 * has 0 touches — AND there is at least one open add row. Remove/Check never
 * gate this (they resolve independently).
 */
export function addAllReady(model, touchesByRowId, stampedIds, skippedIds) {
  const open = _openAdds(model, stampedIds, skippedIds);
  if (open.length === 0) return false;
  return open.every((it) => (touchesByRowId.get(it._rowId) || 0) === 0);
}

/** Sum of touches across all OPEN add rows — the "fill N amber slots first" number. */
export function totalTouches(model, touchesByRowId, stampedIds, skippedIds) {
  return _openAdds(model, stampedIds, skippedIds)
    .reduce((n, it) => n + (touchesByRowId.get(it._rowId) || 0), 0);
}
