// content/modules/care-plan-stamp/generateModel.js
//
// Pure (no Preact, no DOM, no chrome.*) model for the V3 cached-generate
// integration (SUP-116). The audit stays the MEMBERSHIP source; the cached
// generate payload supplies AI-polished content, live authoring progress, and
// chart-quality flags. These helpers marry the two — matched by catalog
// conceptId (the audit and the V3 engine can select DIFFERENT library rows for
// the same clinical concept, so libraryStdId alone never intersects), with a
// libraryStdId fallback for rows without a concept. Never touches a row the
// nurse has edited.

/** Poll cadence + hard cap (polish p50 ~13s, max ~23s; 90s covers retries). */
export const POLL_INTERVAL_MS = 4000;
export const POLL_CAP_MS = 90_000;

/** Real authoring percent from the payload's {done,total}, or null (no signal → indeterminate UI). */
export function authoringPct(progress) {
  if (!progress || typeof progress.done !== 'number' || !progress.total) return null;
  return Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)));
}

/**
 * Keep polling? Only while the generate call succeeded, the polish hasn't
 * landed, and we're inside the cap. `stopped` is the caller's kill switch
 * (fingerprint changed mid-session → keep the deterministic view, stop asking).
 */
export function shouldPoll({ payload, error, startedAt, now, stopped }) {
  if (!payload || error || stopped) return false;
  if (payload.authored) return false;
  return (now - startedAt) < POLL_CAP_MS;
}

/**
 * Index the generate payload's focuses by join key — `concept:<id>` when the
 * focus is concept-mapped, plus `std:<id>` as fallback. First focus wins per
 * key (payload order is the engine's ranked order).
 */
export function polishByStdId(genPayload) {
  const map = new Map();
  for (const f of genPayload?.focuses || []) {
    if (f?.conceptId && !map.has(`concept:${f.conceptId}`)) map.set(`concept:${f.conceptId}`, f);
    if (f?.libraryStdId != null && f.libraryStdId !== '' && !map.has(`std:${f.libraryStdId}`)) {
      map.set(`std:${f.libraryStdId}`, f);
    }
  }
  return map;
}

/**
 * Swap AI-polished content into the audit's toAdd rows.
 *
 * A row is eligible when its focus carries a conceptId (preferred) or
 * libraryStdId with a polished counterpart AND the nurse hasn't touched it
 * (touchedIds — edits, stamps,
 * skips; keyed by the same _rowId the modal uses). The polished focus replaces
 * goals/interventions/description wholesale — but the KARDEX opt-in convention
 * is preserved by the caller (it re-applies the _recKardex blanking after the
 * swap, same as on initial load).
 *
 * Non-mutating: returns fresh items; untouched inputs are shared by reference.
 */
export function applyPolish(toAddItems, polishMap, touchedIds) {
  let swappedCount = 0;
  const items = (toAddItems || []).map((item) => {
    // Built-in fallback rows (no facility library match server-side) ship
    // without focus.conceptId — but the catalog's concept ids ARE the built-in
    // rule ids, so ruleId is the same join key. Lets the polish swap replace
    // built-in template content with the facility's authored library row
    // (std ids → library add, auto positions/kardex) when one exists.
    const conceptId = item?.focus?.conceptId ?? item?.ruleId;
    const stdId = item?.focus?.libraryStdId;
    if (!conceptId && (stdId == null || stdId === '')) return item;
    if (touchedIds?.has?.(item._rowId) || touchedIds?.has?.(item.ruleId)) return item;
    const polished =
      (conceptId ? polishMap.get(`concept:${conceptId}`) : null) ||
      (stdId != null && stdId !== '' ? polishMap.get(`std:${stdId}`) : null);
    if (!polished) return item;
    swappedCount++;
    return { ...item, focus: { ...polished }, _polished: true };
  });
  return { items, swappedCount };
}

/** One human sentence per chart-quality flag — a raw flag name never reaches the nurse. */
const CHART_QUALITY_MESSAGES = {
  no_active_dx: 'No active diagnoses are synced for this resident — diagnosis-driven focuses may be missing.',
  placeholder_dx_codes: "This resident's diagnosis codes look like sync placeholders — diagnosis-driven focuses may be missing.",
  no_orders_synced: 'No active orders are synced for this resident — order-driven focuses may be missing.',
  no_coded_mds: 'No coded MDS assessment was found — MDS-driven focuses may be missing.',
};

export function chartQualityMessage(flags) {
  const msgs = (flags || []).map((f) => CHART_QUALITY_MESSAGES[f]).filter(Boolean);
  if (!msgs.length) return '';
  return msgs.join(' ') + ' The plan below is still safe to use — it may just be missing items.';
}
