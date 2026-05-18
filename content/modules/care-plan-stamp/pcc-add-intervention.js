/**
 * Add one or more interventions to an EXISTING PCC focus.
 *
 * Reuses `window.CarePlanStamp.createCustomIntervention` (pcc-stamp.js) — the
 * same call Initial Admit uses for new-focus interventions. The only difference
 * is `focusId` is an EXISTING `pccFocusId` rather than one freshly created.
 *
 * Sequential PCC POSTs — PCC doesn't bulk-accept. On any single failure,
 * record it and continue with the remaining interventions; successes are
 * preserved.
 */

// Synonym map: canonical → array of label tokens (lowercased) we'll try to
// match against the facility's PCC dropdown labels. Mirrors backend's
// `CarePlanCanonicalResolverService` synonyms — duplicated here only because
// the audit endpoint may ship canonical strings without backend pre-resolution.
// Keep this list narrow; expand only when a real facility's labels don't match.
const KARDEX_SYNONYMS = {
  monitors: ['monitor', 'monitors', 'monitoring'],
  medications: ['medication', 'medications', 'meds'],
  nutrition: ['nutrition', 'dietary', 'diet'],
  elimination: ['elimination', 'urinary', 'bowel'],
  safety: ['safety'],
  skin: ['skin', 'skin integrity', 'skin care'],
  pain: ['pain'],
  adl: ['adl', 'self-care', 'self care', 'activities of daily living'],
  mobility: ['mobility'],
  transferring: ['transfer', 'transferring', 'transfers'],
  respiratory: ['respiratory', 'respirations'],
  cardiovascular: ['cardiovascular', 'cardiac'],
  endocrine: ['endocrine'],
  mood: ['mood', 'behavioral'],
  cognition: ['cognition', 'cognitive'],
  communication: ['communication'],
  activities: ['activities', 'activity'],
  discharge_planning: ['discharge', 'discharge planning'],
  hydration: ['hydration', 'fluid'],
  education: ['education', 'teaching'],
};
const POSITION_SYNONYMS = {
  rn: ['rn', 'registered nurse'],
  lpn: ['lpn', 'licensed practical nurse', 'licensed nurse'],
  cna: ['cna', 'nurse aide', 'nursing assistant', 'aide'],
  nurse_any: ['nurse', 'nursing'],
  pt: ['pt', 'physical therapy', 'physical therapist'],
  ot: ['ot', 'occupational therapy', 'occupational therapist'],
  st: ['st', 'slp', 'speech therapy', 'speech therapist', 'speech-language'],
  therapy_any: ['therapy'],
  activities: ['activities', 'activity'],
  social_services: ['social services', 'social worker', 'ssd'],
  dietary: ['dietary', 'dietitian', 'rd'],
  pharmacy: ['pharmacy', 'pharmacist'],
  physician: ['physician', 'md', 'provider', 'np'],
  resident_family: ['resident', 'family'],
};

function _resolveCanonical(canonical, synonymTable, labelsById) {
  if (canonical == null) return null;
  const s = String(canonical).trim();
  // Already-numeric — backend already resolved.
  if (/^\d+$/.test(s)) return s;

  const synonyms = synonymTable[s.toLowerCase()];
  if (!synonyms) return null;

  // Lowercased label → first matching PCC ID. Prefer exact match, fall back to includes.
  const entries = Object.entries(labelsById || {}).map(([id, label]) => [id, String(label).toLowerCase()]);
  for (const syn of synonyms) {
    const exact = entries.find(([, label]) => label === syn);
    if (exact) return exact[0];
  }
  for (const syn of synonyms) {
    const partial = entries.find(([, label]) => label.includes(syn));
    if (partial) return partial[0];
  }
  return null;
}

async function addInterventions({
  patientId,
  miniToken,
  pccFocusId,
  pccFocusStdItemId,
  interventions = [],
  orgDropdowns = null,
} = {}) {
  if (!patientId || !pccFocusId || !miniToken) {
    throw new Error('addInterventions: missing required patientId/pccFocusId/miniToken');
  }
  const stampClient = window.CarePlanStampClient;
  if (!stampClient?.createCustomIntervention) {
    throw new Error('createCustomIntervention helper not available — check pcc-stamp.js export');
  }

  const kardexLabels = orgDropdowns?.kardex || {};
  const positionLabels = orgDropdowns?.positions || {};

  const errors = [];
  let addedCount = 0;

  for (let i = 0; i < interventions.length; i++) {
    const iv = interventions[i];
    const kardexId = _resolveCanonical(iv.kardexCategory, KARDEX_SYNONYMS, kardexLabels);
    const positionId = _resolveCanonical(iv.positionOne, POSITION_SYNONYMS, positionLabels);

    if (!kardexId) {
      console.warn('[care-plan-add-intervention] unresolved kardex canonical', iv.kardexCategory, 'against facility labels', kardexLabels);
    }
    if (!positionId) {
      console.warn('[care-plan-add-intervention] unresolved position canonical', iv.positionOne, 'against facility labels', positionLabels);
    }

    try {
      await stampClient.createCustomIntervention({
        patientId: String(patientId),
        focusId: String(pccFocusId),
        miniToken,
        description: iv.description,
        instruction: iv.instruction || '',
        kardexCategory: kardexId || '-1',
        positionOne: positionId || '-1',
      });
      addedCount += 1;
    } catch (e) {
      errors.push({ idx: i, message: e?.message || String(e) });
    }
  }

  if (errors.length > 0 && addedCount === 0) {
    throw new Error(errors[0].message);
  }
  return { ok: true, addedCount, errors };
}

window.CarePlanAddInterventionAPI = { addInterventions };
