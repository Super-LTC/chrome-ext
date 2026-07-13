// Pure helpers for the diagnosis-query ICD-10 code picker.
//
// Since the backend stopped emitting AI-guessed codes on physician queries,
// `recommendedIcd10` on the create payload now means ONLY "the code the nurse
// deliberately attached." These helpers keep that contract in one place so
// every send surface (QuerySendModal, legacy MDS overlay, batch review) agrees:
//   - nothing attached  -> []                        (codeless query; doctor picks)
//   - a code attached    -> [{ code, description, reason? }]

/**
 * Build the create-payload `recommendedIcd10` array from the nurse's selection.
 * @param {{code: string, description?: string, reason?: string}|null|undefined} selected
 * @returns {Array<{code: string, description: string, reason?: string}>}
 */
export function toRecommendedIcd10(selected) {
  if (!selected || !selected.code) return [];
  const entry = {
    code: selected.code,
    description: selected.description || ''
  };
  if (selected.reason) entry.reason = selected.reason;
  return [entry];
}

/**
 * Normalize the icd10-search endpoint response into a clean list. Tolerates
 * either the documented `{ results: [...] }` envelope or a bare array, and
 * drops entries without a code. Descriptions are coerced to strings.
 * @param {any} data
 * @returns {Array<{code: string, description: string}>}
 */
export function normalizeSearchResults(data) {
  const raw = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r) continue;
    const code = typeof r === 'string' ? r : r.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const description = typeof r === 'object' ? (r.description || '') : '';
    out.push({ code, description });
  }
  return out;
}

/**
 * Build the ordered, deduped suggestion list for the picker's curated mode.
 * Preferred goes first (recommended: true); remaining options follow in order.
 * Dedupes by code, drops entries without a code, coerces descriptions.
 * @param {{preferred?: {code, description}|null, options?: Array<{code, description}>}} input
 * @returns {Array<{code: string, description: string, recommended: boolean}>}
 */
export function buildSuggestedList({ preferred, options } = {}) {
  const seen = new Set();
  const out = [];
  const push = (entry, recommended) => {
    if (!entry) return;
    const code = entry.code;
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, description: entry.description || '', recommended });
  };
  push(preferred, true);
  for (const o of Array.isArray(options) ? options : []) push(o, false);
  return out;
}
