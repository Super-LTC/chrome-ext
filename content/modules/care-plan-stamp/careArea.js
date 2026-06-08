/**
 * Resolve a nurse-friendly care-area label for an audit item, used to group and
 * filter toAdd / onPlan / toRemove identically across the dashboard grid, the
 * modal's care-area filter, and the rail. Order of preference:
 *   1. backend caaName (display string)
 *   2. byCAA lookup maps (_ruleIdToCAA / _focusIdToCAA)
 *   3. prettified snake-case caa key
 */
export function areaLabel(audit, item) {
  if (!item) return '';
  if (item.caaName) return item.caaName;
  const byRule = audit?._ruleIdToCAA?.get?.(item.ruleId);
  if (byRule) return byRule;
  const byFocus = audit?._focusIdToCAA?.get?.(item.focusId);
  if (byFocus) return byFocus;
  if (item.caa) return String(item.caa).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return '';
}
