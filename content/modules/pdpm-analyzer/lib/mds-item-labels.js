/**
 * Human-readable labels for MDS item codes. Some detections/queries come back
 * from the API with `itemName === mdsItem` (just the code); this map + the
 * resolver provide a friendly fallback name.
 *
 * Shared by PDPMAnalyzer.jsx and the Super Verify panel.
 */
export const MDS_ITEM_LABELS = {
  'K0100': 'Swallowing Disorder',
  'K0200': 'Height & Weight',
  'K0520A': 'Nutritional Approach — Parenteral/IV',
  'K0520B': 'Nutritional Approach — Feeding Tube',
  'K0520C': 'Nutritional Approach — Mechanically Altered Diet',
  'K0710': 'Percent Intake by Artificial Route',
  'B0100': 'Comatose',
  'B0700': 'Makes Self Understood',
  'B0800': 'Ability to Understand Others',
  'C0100': 'Should Brief Interview for Mental Status Be Conducted',
  'C0200': 'Repetition of Three Words',
  'C0300': 'Temporal Orientation',
  'C0400': 'Recall',
  'C0500': 'BIMS Summary Score',
  'C0700': 'Short-term Memory OK',
  'C0800': 'Long-term Memory OK',
  'C0900': 'Memory/Recall Ability',
  'C1000': 'Cognitive Skills for Daily Decision Making',
  'D0100': 'Should Resident Mood Interview Be Conducted',
  'D0200': 'Resident Mood Interview (PHQ-2)',
  'D0300': 'PHQ-9 Total Severity Score',
  'D0350': 'Safety Notification — PHQ',
  'D0600': 'Staff Assessment of Resident Mood (PHQ-9-OV)',
  'E0100': 'Psychosis',
  'E0200': 'Behavioral Symptoms — Presence & Frequency',
  'E0800': 'Rejection of Care',
  'E0900': 'Wandering',
  'G0110': 'ADL Self-Performance',
  'G0120': 'ADL Support Provided — Bathing',
  'G0300': 'Balance During Transitions and Walking',
  'G0400': 'Functional Limitation in Range of Motion',
  'GG0130': 'Self-Care — Admission Performance',
  'GG0170': 'Mobility — Admission Performance',
  'H0100': 'Appliances — Indwelling Catheter',
  'H0200': 'Urinary Toileting Program',
  'H0300': 'Urinary Continence',
  'H0400': 'Bowel Continence',
  'H0500': 'Bowel Toileting Program',
  'H0600': 'Appliances — Ostomy',
  'I0020': 'Indicate Conditions or Diseases — Cancer',
  'I0100': 'Active Diagnoses — Cancer',
  'I0200': 'Active Diagnoses — Anemia',
  'I0300': 'Active Diagnoses — Atrial Fibrillation',
  'I0400': 'Active Diagnoses — Coronary Artery Disease',
  'I0500': 'Active Diagnoses — Deep Venous Thrombosis',
  'I0600': 'Active Diagnoses — Heart Failure',
  'I0700': 'Active Diagnoses — Hypertension',
  'I0900': 'Active Diagnoses — Peripheral Vascular Disease',
  'I2000': 'Active Diagnoses — Pneumonia',
  'I2100': 'Active Diagnoses — Septicemia',
  'I2300': 'Active Diagnoses — Urinary Tract Infection',
  'I2500': 'Active Diagnoses — Cerebrovascular Accident (CVA)',
  'I2900': 'Active Diagnoses — Hemiplegia/Hemiparesis',
  'I3700': 'Active Diagnoses — Anxiety Disorder',
  'I3800': 'Active Diagnoses — Depression',
  'I3900': 'Active Diagnoses — Schizophrenia',
  'I4000': 'Active Diagnoses — Psychotic Disorder',
  'I4200': 'Active Diagnoses — PTSD',
  'I4300': 'Active Diagnoses — Tourette Syndrome',
  'I4400': 'Active Diagnoses — Aphasia',
  'I4500': 'Active Diagnoses — Cerebral Palsy',
  'I4900': 'Active Diagnoses — Multi-Drug Resistant Organism',
  'I5100': 'Active Diagnoses — Quadriplegia',
  'I5200': 'Active Diagnoses — Additional Diagnosis',
  'I5250': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5300': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5350': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5400': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5500': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5550': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5600': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5700': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I8000': 'Active Diagnoses — Additional Active Diagnosis',
  'J0100': 'Pain Management — Pain Screening',
  'J0200': 'Pain — Should Pain Assessment Be Conducted',
  'J0300': 'Pain Presence',
  'J0400': 'Pain Frequency',
  'J0500': 'Pain Effect on Function',
  'J0600': 'Pain Intensity — Numeric Rating Scale',
  'J0850': 'Pain Intensity — Verbal Descriptor Scale',
  'M0100': 'Determination of Skin Treatments',
  'M0150': 'Risk of Developing Pressure Ulcers',
  'M0210': 'Unhealed Pressure Ulcer(s)',
  'M0300': 'Current Number of Unhealed Pressure Ulcers',
  'M0610': 'Dimensions of Unhealed Stage 3 or 4 Pressure Ulcers',
  'M0700': 'Most Severe Tissue Type for Any Pressure Ulcer',
  'M0800': 'Worsening in Pressure Ulcer Status Since Prior Assessment',
  'M0900': 'Healed Pressure Ulcers',
  'M1030': 'Number of Venous and Arterial Ulcers',
  'M1040': 'Other Skin Ulcer or Open Lesion',
  'M1200': 'Skin & Ulcer Treatments',
  'N0415': 'High-Risk Drug Classes — Use & Indication',
  'O0100': 'Special Treatments, Procedures, and Programs',
  'O0250': 'Influenza Vaccine',
  'O0300': 'Pneumococcal Vaccine',
  'O0400': 'Therapies',
  'O0500': 'Restorative Nursing Programs',
  'O0600': 'Physician Examinations',
  'O0700': 'Physician Orders',
};

/**
 * Resolve a human label for an MDS item, given the API's (possibly code-shaped)
 * name and the item code. Strips bracket suffixes (K0520B[3] → K0520B).
 */
export function resolveItemName(name, code) {
  const baseCode = code?.replace(/\[.*\]$/, '') || '';
  const baseName = name?.replace(/\[.*\]$/, '') || '';
  // If name looks like a code pattern (e.g. K0520B, K0520B[3]), prefer label lookup
  if (name && /^[A-Z]{1,2}\d+[A-Z]?(\[.*\])?$/.test(name)) {
    return MDS_ITEM_LABELS[baseName] || MDS_ITEM_LABELS[baseCode] || name;
  }
  // If name is genuinely different from the code, use it
  if (name && baseName !== baseCode) return name;
  return MDS_ITEM_LABELS[baseCode] || MDS_ITEM_LABELS[baseName] || name || code;
}
