// content/mds-list-coverage/filter-model.js
// Pure, DOM-free logic for the MDS-list filter bar. Unit-tested in node.
//
// The filter is entirely client-side: every dimension comes from data already on
// the page (native Name / Type / Unsigned-Sections columns) or already fetched
// (our interview-coverage + Complete-By results). This file only decides matching.

// Discipline → the MDS sections that discipline owns. Defaults — tweak here if a
// facility splits ownership differently. A row matches a discipline if ANY of these
// sections is still unsigned. Overlap is intentional (GG/O count for both Nursing
// and Therapy).
export const DISCIPLINE_SECTIONS = {
  ssd: ['B', 'C', 'D', 'E', 'Q'], // Social Services (user's definition)
  nursing: ['GG', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P'],
  dietary: ['K'],
  therapy: ['GG', 'O'],
  admin: ['A', 'V', 'X', 'Z'], // MDS Coordinator / admin (+ anything unmapped)
};

// Display order + labels for the discipline chips.
export const DISCIPLINES = [
  { key: 'ssd', label: 'SSD' },
  { key: 'nursing', label: 'Nursing' },
  { key: 'dietary', label: 'Dietary' },
  { key: 'therapy', label: 'Therapy' },
  { key: 'admin', label: 'MDS/Admin' },
];

// Canonical MDS 3.0 section tokens, in order, for the individual-section picker.
export const ALL_SECTIONS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'GG', 'H', 'I', 'J', 'K', 'L',
  'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'V', 'X', 'Z',
];

export function sectionsForDiscipline(key) {
  return DISCIPLINE_SECTIONS[key] ? [...DISCIPLINE_SECTIONS[key]] : [];
}

// If the selected-sections set is exactly one discipline's set, return that key —
// used to light up the matching discipline chip and to label analytics. Order-
// insensitive. Returns 'custom' for a non-empty non-matching set, '' for empty.
export function disciplineForSections(sections) {
  const sel = [...new Set(sections || [])].sort();
  if (!sel.length) return '';
  for (const key of Object.keys(DISCIPLINE_SECTIONS)) {
    const set = [...DISCIPLINE_SECTIONS[key]].sort();
    if (set.length === sel.length && set.every((s, i) => s === sel[i])) return key;
  }
  return 'custom';
}

// The empty (no-op) filter state.
export function emptyFilters() {
  return { search: '', sections: [], due: 'all', type: 'all', missingOnly: false };
}

export function isEmptyFilters(f) {
  const e = emptyFilters();
  return !f ||
    ((f.search || '') === e.search &&
     (f.sections || []).length === 0 &&
     (f.due || 'all') === e.due &&
     (f.type || 'all') === e.type &&
     !f.missingOnly);
}

// Does one row pass ALL active filters (AND)? rowData:
//   { name, mrn, unsignedSections[], type, tone, hasNeededInterview }
export function rowMatchesFilters(rowData, filters) {
  const f = filters || {};
  const row = rowData || {};

  // Search: substring over name + MRN.
  const q = (f.search || '').trim().toLowerCase();
  if (q) {
    const hay = `${row.name || ''} ${row.mrn || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  // Sections / discipline: row's unsigned sections must intersect the selection.
  const sel = f.sections || [];
  if (sel.length) {
    const unsigned = new Set(row.unsignedSections || []);
    if (!sel.some((s) => unsigned.has(s))) return false;
  }

  // Type (exact match against the native Type cell).
  if (f.type && f.type !== 'all') {
    if ((row.type || '').trim() !== f.type) return false;
  }

  // Due bucket, keyed off the Complete-By tone we already compute.
  if (f.due && f.due !== 'all') {
    if (f.due === 'overdue' && row.tone !== 'overdue') return false; // days < 0
    if (f.due === 'soon' && row.tone !== 'urgent') return false;     // 0–3 days
  }

  // Missing interview UDA (any interview with status 'needed').
  if (f.missingOnly && !row.hasNeededInterview) return false;

  return true;
}

// Which of a row's unsigned sections are matched by the current selection — used by
// the DOM layer to bold those letters. Empty selection → nothing highlighted.
export function matchedSections(rowData, filters) {
  const sel = new Set((filters && filters.sections) || []);
  if (!sel.size) return new Set();
  return new Set(((rowData && rowData.unsignedSections) || []).filter((s) => sel.has(s)));
}
