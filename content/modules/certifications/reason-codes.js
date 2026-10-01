// Pure helpers for the checkbox cert form (certForm.template === 'champion_checkbox').
//
// A selection list is CertReasonSelection[] — [{ code, auto, evidence }] — where
// auto=true means the AI checked the box and `evidence` is its one-line why.
// The catalog (`form.reasons`) always comes from the API; nothing here knows the
// codes. Every list these return is in the paper form's order, and entries whose
// code the form doesn't list are dropped.

/** Return `byCode`'s entries in form order. */
function inFormOrder(byCode, form) {
  return (form?.reasons || [])
    .filter((r) => byCode.has(r.code))
    .map((r) => byCode.get(r.code));
}

function toMap(list) {
  return new Map((list || []).map((s) => [s.code, s]));
}

/**
 * Check or uncheck one box. Checking adds a manual entry (auto:false); unchecking
 * removes the entry whether the nurse or the AI checked it.
 * @param {Array<{code, auto, evidence}>|null} list
 * @param {string} code
 * @param {{reasons: Array<{code: string}>}} form
 */
export function toggleReason(list, code, form) {
  const byCode = toMap(list);
  if (byCode.has(code)) byCode.delete(code);
  else byCode.set(code, { code, auto: false, evidence: null });
  return inFormOrder(byCode, form);
}

/**
 * Fold a fresh AI suggestion into the current selection. The nurse's own boxes
 * (auto:false) stay; the previous AI boxes are replaced by the new suggestions;
 * where a suggestion and a kept box share a code, the suggestion wins (it brings
 * the evidence).
 * @param {Array<{code, auto, evidence}>|null} current
 * @param {Array<{code, auto, evidence}>|null} suggested
 * @param {{reasons: Array<{code: string}>}} form
 */
export function mergeRegenerated(current, suggested, form) {
  const byCode = toMap((current || []).filter((s) => !s.auto));
  for (const s of suggested || []) byCode.set(s.code, s);
  return inFormOrder(byCode, form);
}

/** Shown (and toasted) when a checkbox-form recert would go out with no reason. */
export const NO_REASON_MESSAGE = 'Check at least one reason or fill in Other';

/** True when at least one box is checked or the Other line has text. */
export function hasAnyReason(list, other) {
  return (list?.length ?? 0) > 0 || !!(other && other.trim());
}

/**
 * Starting text for the Other line. A recert typed before the org switched to the
 * checkbox form has no reasonCodes yet, only its free-text clinicalReason — carry
 * that into Other so the nurse's words aren't dropped (the PDF does the same).
 * @param {{reasonCodes?: Array|null, reasonOther?: string|null, clinicalReason?: string|null}} cert
 */
export function seedReasonOther(cert) {
  if (cert?.reasonOther) return cert.reasonOther;
  if (cert?.reasonCodes == null && cert?.clinicalReason) return cert.clinicalReason;
  return '';
}
