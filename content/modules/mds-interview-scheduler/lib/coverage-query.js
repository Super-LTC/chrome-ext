/**
 * MDS Interview Scheduler — pure query helpers.
 * No DOM / no network here so it stays unit-testable.
 */

/** PCC date strings are M/D/YYYY (display) or MM/DD/YYYY. → 'YYYY-MM-DD' | null */
export function pccDateToIso(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** ISO 'YYYY-MM-DD' → PCC display 'M/D/YYYY' (no leading zeros), for UDA assess_date. */
export function isoToPccDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return `${Number(mm)}/${Number(dd)}/${yyyy}`;
}

// PPS (A0310B) takes priority — it drives PDPM + GG window. Then OBRA reason
// (A0310A), then entry/discharge (A0310F). Strings are best-effort canonical
// labels; see the "Contract risk" note in the plan — validate against backend.
const OBRA_A0310A = {
  '01': 'Admission',
  '02': 'Quarterly',
  '03': 'Annual',
  '04': 'Significant Change',
  '05': 'Significant Correction to Prior Comprehensive',
  '06': 'Significant Correction to Prior Quarterly',
};
const DISCHARGE_A0310F = {
  '01': 'Entry',
  '10': 'Discharge - return not anticipated',
  '11': 'Discharge - return anticipated',
  '12': 'Death in Facility',
};

export function deriveDescription({ a0310a = '', a0310b = '', a0310f = '' } = {}) {
  if (a0310b === '01') return 'Medicare - 5 Day';
  if (a0310b === '08') return 'Medicare - IPA';
  if (OBRA_A0310A[a0310a]) return OBRA_A0310A[a0310a];
  if (DISCHARGE_A0310F[a0310f]) return DISCHARGE_A0310F[a0310f];
  return '';
}

export function deriveA0310g(code) {
  if (code === '1') return '1. Planned';
  if (code === '2') return '2. Unplanned';
  return undefined;
}

/**
 * Build the query object for GET /api/extension/mds/interview-coverage.
 * Returns null when the form isn't coherent enough to evaluate (no valid ARD).
 * Raw A0310 codes are included as a forward-compatible hedge (see Contract risk).
 */
export function buildCoverageQuery(form) {
  const ardDate = pccDateToIso(form.ard);
  if (!ardDate) return null;
  const q = {
    patientExternalId: String(form.patientId || ''),
    facilityName: form.facilityName || '',
    orgSlug: form.orgSlug || '',
    ardDate,
    description: deriveDescription(form),
    // forward-compat: backend may switch to code-based requirements
    a0310a: form.a0310a || '', a0310b: form.a0310b || '',
    a0310c: form.a0310c || '', a0310f: form.a0310f || '',
  };
  const g = deriveA0310g(form.a0310g);
  if (g) q.a0310g = g;
  return q;
}
