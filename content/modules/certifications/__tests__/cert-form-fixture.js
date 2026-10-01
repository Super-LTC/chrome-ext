/**
 * Test fixture: the champion_checkbox certForm payload as the backend sends it.
 * Production code never hardcodes this catalog — it always arrives as
 * `certForm` on the certifications responses. Paper order, column-major.
 */
const COLUMNS = [
  [
    ['observation_assessment', 'Observation/Assessment'],
    ['management_evaluation', 'Management/Evaluation'],
    ['teaching_training', 'Teaching/Training'],
    ['medication_adjustment', 'Medication Adjustment'],
    ['pain_management', 'Pain Management'],
    ['wounds_ulcers_care', 'Wounds/Ulcers Care'],
    ['special_catheter_care', 'Special Catheter Care'],
    ['septicemia', 'Septicemia'],
    ['pneumonia', 'Pneumonia'],
  ],
  [
    ['pt_ot', 'PT/OT'],
    ['st', 'ST'],
    ['labs', 'Labs'],
    ['g_tube', 'G-Tube'],
    ['tpn', 'TPN'],
    ['cancer', 'Cancer'],
    ['cardiac', 'Cardiac'],
    ['gi', 'GI'],
    ['gu', 'GU'],
  ],
  [
    ['iv_medications_fluids', 'IV Medications/Fluids'],
    ['medication_injection', 'Medication Injection'],
    ['isolation_infection', 'Isolation/Infection'],
    ['antibiotic_therapy', 'Antibiotic Therapy'],
    ['weight_loss', 'Weight Loss'],
    ['diabetes_mellitus', 'Diabetes Mellitus'],
    ['depression_psychiatric', 'Depression/Psychiatric'],
    ['neurological', 'Neurological'],
    ['fractures', 'Fractures'],
  ],
  [
    ['o2_therapy', 'O2 Therapy'],
    ['respiratory_therapy', 'Respiratory Therapy'],
    ['chemotherapy', 'Chemotherapy'],
    ['radiation_therapy', 'Radiation Therapy'],
    ['dialysis', 'Dialysis'],
    ['transfusion', 'Transfusion'],
    ['copd_sob', 'COPD w/SOB'],
    ['parkinsons_disease', "Parkinson's Disease"],
    ['cva_hemiplegia', 'CVA/Hemiplegia'],
  ],
];

export const CERT_FORM = {
  template: 'champion_checkbox',
  reasons: COLUMNS.flatMap((col, i) =>
    col.map(([code, label]) => ({ code, label, column: i + 1 }))
  ),
  dischargeOptions: ['Home Health Agency', 'Office Care', 'Long Term Care'],
};

export const REASON_CODES = CERT_FORM.reasons.map((r) => r.code);
export const REASON_LABELS = CERT_FORM.reasons.map((r) => r.label);
