// content/modules/care-plan-stamp/wizardModel.js
//
// Pure (no Preact, no DOM) model that turns a care-plan `audit` object into the
// data the V2 wizard sidebar needs: care-area groups with status "shields", a
// covered-areas list, a flat ordered item list, and the skipped bucket.
//
// The care-area label for an item is resolved by the shared areaLabel() helper
// (prefers item.caaName). Status derivation (areaStatus) is shared with the
// dashboard so the two views never drift.

import { areaLabel } from './careArea.js';

// Order in which statuses appear in the sidebar (gaps first, then partials).
const STATUS_ORDER = { gap: 0, partial: 1, covered: 2, resolved: 3 };

/**
 * Derive a care-area status "shield" from its toAdd / onPlan COUNTS.
 *   toAdd + onPlan → 'partial'
 *   toAdd only     → 'gap'
 *   onPlan only    → 'covered'
 *   neither        → 'resolved'
 */
export function areaStatus({ toAdd = 0, onPlan = 0 } = {}) {
  if (toAdd > 0 && onPlan > 0) return 'partial';
  if (toAdd > 0) return 'gap';
  if (onPlan > 0) return 'covered';
  return 'resolved';
}

/** Set-aside proposals (opt-in universals). [] when missing. */
export function skippedItems(audit) {
  return Array.isArray(audit?.skipped) ? audit.skipped : [];
}

/**
 * Progress numerator: how many toAdd items the nurse has *handled* — either
 * stamped OR skipped. A skip is a review decision, so it counts toward
 * "reviewed" exactly like a stamp (otherwise the bar never reaches 100% for a
 * nurse who dismisses rather than stamps, and the count contradicts what she
 * just did). An item in both sets is counted once (OR, not sum), so the result
 * can never exceed `items.length`.
 */
export function reviewedCount(items, stampedIds, skippedIds) {
  if (!Array.isArray(items)) return 0;
  const stamped = stampedIds || new Set();
  const skipped = skippedIds || new Set();
  return items.filter((it) => stamped.has(it.ruleId) || skipped.has(it.ruleId)).length;
}

function _score(item) {
  return typeof item?.score === 'number' ? item.score : 0;
}

/**
 * Build the wizard sidebar model from a raw v2 audit.
 *
 * Returns:
 *   {
 *     groups: [ { area, status: 'gap'|'partial', items: [toAddItem,...] } ],
 *     coveredAreas: [ string, ... ],   // onPlan-only areas, sorted
 *     total: number,                   // total toAdd items across groups
 *     orderedItems: [ toAddItem, ... ] // flat, top-to-bottom sidebar order
 *   }
 */
export function buildWizardModel(audit) {
  const empty = { groups: [], coveredAreas: [], total: 0, orderedItems: [] };
  if (!audit || typeof audit !== 'object') return empty;

  const toAdd = Array.isArray(audit.toAdd) ? audit.toAdd : [];
  const onPlan = Array.isArray(audit.onPlan) ? audit.onPlan : [];

  // Resolve a care-area label, falling back to 'Other' for unlabeled items —
  // mirrors AuditDashboard's grouping so the wizard and dashboard never drift
  // (a dashboard "Other" chip's caaFilter must match a wizard group of the
  // same name).
  const label = (item) => areaLabel(audit, item) || 'Other';

  // onPlan counts per area, used for partial vs gap status.
  const onPlanByArea = new Map();
  for (const item of onPlan) {
    const area = label(item);
    onPlanByArea.set(area, (onPlanByArea.get(area) || 0) + 1);
  }

  // Group toAdd items by area, preserving insertion order of areas.
  const itemsByArea = new Map();
  for (const item of toAdd) {
    const area = label(item);
    if (!itemsByArea.has(area)) itemsByArea.set(area, []);
    itemsByArea.get(area).push(item);
  }

  const groups = [];
  for (const [area, items] of itemsByArea) {
    // Stable sort by DESCENDING score (missing score = 0). Array.prototype.sort
    // is stable in modern engines, so equal scores keep original order.
    const sorted = items.slice().sort((a, b) => _score(b) - _score(a));
    const status = areaStatus({ toAdd: sorted.length, onPlan: onPlanByArea.get(area) || 0 });
    groups.push({ area, status, items: sorted });
  }

  // Sort groups by status (gap before partial), then by area name.
  groups.sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (s !== 0) return s;
    return a.area.localeCompare(b.area);
  });

  const orderedItems = groups.flatMap((g) => g.items);

  // Covered areas = onPlan-only areas (not any group's area), de-duped + sorted.
  const groupAreas = new Set(groups.map((g) => g.area));
  const coveredAreas = [...new Set([...onPlanByArea.keys()])]
    .filter((area) => !groupAreas.has(area))
    .sort((a, b) => a.localeCompare(b));

  return { groups, coveredAreas, total: orderedItems.length, orderedItems };
}
