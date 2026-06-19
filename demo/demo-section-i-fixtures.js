/**
 * demo-section-i-fixtures.js — canonical MDS Section I demo data.
 *
 * SINGLE source of truth for the captured mds-section-i.html demo. It drives
 * BOTH the injected Super badges (demo/components/PCCDemoApp.jsx) AND the
 * popover that opens on click (ItemPopover → useItemDetail). Because one object
 * feeds both, the badge ("code it" / "don't code") can never disagree with the
 * evidence panel.
 *
 * Keys are the REAL MDS 3.0 Section I item codes as they appear on the captured
 * page (verified against demo/mds-section-i.html). itemName, status, and
 * evidence are aligned to each real code — unlike the legacy demo, where the
 * numbering had drifted (I4200 labelled "MDRO" was really Alzheimer's, etc.).
 *
 * Shape matches the real /api/extension/mds/items/{code} response that
 * ItemDetail consumes: { item: { mdsItem, itemName, status, evidence,
 * keyFindings, recommendedIcd10 }, diagnosisSummary, treatmentSummary, carePlan }.
 *
 * status is limited to the three real Section I values:
 *   'code'                  → AI recommends coding Yes  (badge derives Yes)
 *   'dont_code'             → AI agrees No              (badge derives No)
 *   'needs_physician_query' → send a physician query    (badge stays yellow)
 *
 * Against the page's coded answers (all No except I0700/I2900/I6200 = Yes) this
 * produces: 4 red coding wins, 3 green confirmations, 4 yellow queries, 1 green
 * validated-negative.
 *
 * To extend to another section: add a sibling fixtures file and merge it in
 * demo-mock-chrome's item lookup + the PCCDemoApp injector's source map.
 */

export const SECTION_I_DETAIL = {
  // ── Coding wins: page says No, chart evidence says Yes (red mismatch) ──

  I0200: {
    item: {
      mdsItem: 'I0200', itemName: 'Anemia', section: 'I',
      description: 'I0200 — Does the resident have a current diagnosis of anemia (e.g., iron deficiency, B12, folate)?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'lab_result', sourceId: 'doc-041', documentName: 'Lab Results', displayName: 'Lab Results — 01/15/2026', effectiveDate: '2026-01-15',
          quote: 'Hemoglobin: 9.8 g/dL (L), Hematocrit: 29.4% (L), MCV: 76 fL (L), Ferritin: 12 ng/mL (L). Iron deficiency anemia.',
          rationale: 'Lab values consistent with iron deficiency anemia.' },
        { sourceType: 'order', sourceId: 'mar-041', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Ferrous sulfate 325mg PO TID — administered 0800, 1200, 1800.',
          rationale: 'Active iron supplementation for anemia treatment.' }
      ],
      keyFindings: ['Hgb 9.8, Hct 29.4%, Ferritin 12 — iron deficiency anemia', 'Ferrous sulfate 325mg TID active on MAR', 'No anemia ICD-10 on active problem list'],
      recommendedIcd10: [
        { code: 'D50.9', description: 'Iron deficiency anemia, unspecified' },
        { code: 'D64.9', description: 'Anemia, unspecified' }
      ]
    },
    diagnosisSummary: 'Iron deficiency anemia documented. Lab values confirm: Hgb 9.8, Ferritin 12. No anemia ICD-10 on active problem list.',
    treatmentSummary: 'Ferrous sulfate 325mg TID. Follow-up labs ordered in 4 weeks.',
    carePlan: {
      onCarePlan: true,
      items: ['Iron supplementation with meals', 'CBC and iron panel recheck in 4 weeks', 'Monitor for signs of GI bleeding']
    }
  },

  I5600: {
    item: {
      mdsItem: 'I5600', itemName: 'Malnutrition (protein/calorie)', section: 'I',
      description: 'I5600 — Malnutrition (protein or calorie) or at risk for malnutrition.',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-nutr-001', documentName: 'Nutrition Progress Note', displayName: 'Nutrition Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'Weight Loss: 17 lbs (12.6%) in past 3 months. PO Intake: < 50% meals/est. needs. Moderate protein-calorie malnutrition diagnosed.',
          rationale: 'Dietitian assessment documenting malnutrition with objective weight loss and intake data.', pageNumber: 2 },
        { sourceType: 'lab_result', sourceId: 'doc-nutr-002', documentName: 'Nutrition Lab Panel', displayName: 'Nutrition Lab Panel — 01/20/2026', effectiveDate: '2026-01-20',
          quote: 'Albumin: 2.9 g/dL (Low), Prealbumin: 12 mg/dL (Low). Low values suggest malnutrition and/or inflammatory state.',
          rationale: 'Lab values confirming malnutrition with low albumin and prealbumin.' },
        { sourceType: 'order', sourceId: 'doc-nutr-004', documentName: 'MAR — Ensure Plus', displayName: 'MAR — Ensure Plus 8oz BID — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'Ensure Plus 8oz BID with meals for nutritional supplementation.',
          rationale: 'Oral nutrition supplement order supports malnutrition diagnosis and active treatment.' }
      ],
      keyFindings: [
        'Weight loss 12.6% (17 lbs) in 3 months — meets severe weight loss criteria',
        'Albumin 2.9 g/dL and Prealbumin 12 mg/dL — both below normal',
        'PO intake <50% of estimated needs documented by dietitian',
        'No malnutrition ICD-10 code on active problem list'
      ],
      recommendedIcd10: [
        { code: 'E44.0', description: 'Moderate protein-calorie malnutrition' },
        { code: 'E46', description: 'Unspecified protein-calorie malnutrition' }
      ]
    },
    diagnosisSummary: 'Nutrition assessment from 1/22 documents moderate protein-calorie malnutrition: 12.6% weight loss in 3 months, PO intake <50%, albumin 2.9, prealbumin 12. No malnutrition ICD-10 code on active problem list.',
    treatmentSummary: 'Ensure Plus 8oz BID, fortified cereal 6oz QD, weekly weights, dietitian follow-up.',
    carePlan: {
      onCarePlan: true,
      items: ['Ensure Plus 8oz BID between meals', 'Weekly weights every Monday AM', 'Dietitian follow-up monthly']
    }
  },

  I1700: {
    item: {
      mdsItem: 'I1700', itemName: 'Multidrug-Resistant Organism (MDRO)', section: 'I',
      description: 'I1700 — Does the resident have an infection with a multidrug-resistant organism (MDRO)?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'lab_result', sourceId: 'doc-051', documentName: 'Microbiology Report', displayName: 'Microbiology Report — 01/10/2026', effectiveDate: '2026-01-10',
          quote: 'Urine culture: E. coli >100,000 CFU/mL. ESBL-producing. Resistant to ampicillin, ciprofloxacin, TMP-SMX. Sensitive to meropenem, nitrofurantoin.',
          rationale: 'Culture confirming ESBL-producing E. coli — qualifies as MDRO.' },
        { sourceType: 'order', sourceId: 'mar-051', documentName: 'MAR', displayName: 'MAR — 01/12/2026', effectiveDate: '2026-01-12',
          quote: 'Nitrofurantoin 100mg PO BID x 7 days — started 01/12. Contact precautions initiated per infection control protocol.',
          rationale: 'Active antibiotic treatment for MDRO infection.' }
      ],
      keyFindings: ['ESBL-producing E. coli in urine culture', 'Contact precautions initiated', 'Treated with nitrofurantoin 100mg BID'],
      recommendedIcd10: [
        { code: 'Z16.12', description: 'Extended spectrum beta lactamase (ESBL) resistance' },
        { code: 'B96.20', description: 'Unspecified E. coli as the cause of diseases classified elsewhere' }
      ]
    },
    diagnosisSummary: 'MDRO infection documented: ESBL-producing E. coli UTI confirmed by culture 01/10/2026. No MDRO indicator coded on this assessment.',
    treatmentSummary: 'Nitrofurantoin 100mg BID x 7 days. Contact precautions per infection control protocol.',
    carePlan: {
      onCarePlan: true,
      items: ['Contact precautions per infection control', 'Repeat urine culture after antibiotics complete', 'Monitor for C. diff symptoms']
    }
  },

  I5700: {
    item: {
      mdsItem: 'I5700', itemName: 'Anxiety Disorder', section: 'I',
      description: 'I5700 — Has the resident been diagnosed with an anxiety disorder?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-071', documentName: 'Psychiatric Note', displayName: 'Psychiatric Note — 01/14/2026', effectiveDate: '2026-01-14',
          quote: 'Generalized anxiety disorder. GAD-7 score 14 (moderate-severe). Reports persistent worry, restlessness, and difficulty sleeping. Continue sertraline; add PRN for breakthrough anxiety.',
          rationale: 'Psychiatric evaluation documenting an active anxiety disorder diagnosis with validated screening.', pageNumber: 1 },
        { sourceType: 'order', sourceId: 'mar-071', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Sertraline 50mg PO daily — administered 0800. Lorazepam 0.5mg PO Q8H PRN anxiety — given 01/24, 01/26.',
          rationale: 'Active anxiolytic therapy supporting anxiety disorder diagnosis.' }
      ],
      keyFindings: ['Psychiatry documents generalized anxiety disorder', 'GAD-7 score 14 — moderate-to-severe anxiety', 'Sertraline 50mg daily + lorazepam PRN active on MAR', 'No anxiety ICD-10 on active problem list'],
      recommendedIcd10: [
        { code: 'F41.1', description: 'Generalized anxiety disorder' },
        { code: 'F41.9', description: 'Anxiety disorder, unspecified' }
      ]
    },
    diagnosisSummary: 'Generalized anxiety disorder documented by psychiatry 01/14 with GAD-7 of 14. No anxiety ICD-10 on active problem list despite active treatment.',
    treatmentSummary: 'Sertraline 50mg daily, lorazepam 0.5mg PRN, supportive counseling per behavioral health.',
    carePlan: {
      onCarePlan: false
    }
  },

  // ── Confirmations: page says Yes, AI agrees Yes (green match) ──

  I0700: {
    item: {
      mdsItem: 'I0700', itemName: 'Hypertension', section: 'I',
      description: 'I0700 — Has the resident been diagnosed with hypertension?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-025', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'HTN stable on current regimen. BP today 138/82. Continue lisinopril and amlodipine. Recheck BP in 2 weeks.',
          rationale: 'Physician documentation confirming active hypertension management.', pageNumber: 1 },
        { sourceType: 'order', sourceId: 'mar-012', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Lisinopril 20mg PO daily — administered 0800. Amlodipine 5mg PO daily — administered 0800.',
          rationale: 'Active antihypertensive medications on MAR.' }
      ],
      keyFindings: ['Active ICD-10 code I10 on problem list', 'BP 138/82 on latest vitals — within target range', 'Lisinopril 20mg + amlodipine 5mg daily regimen'],
      recommendedIcd10: [{ code: 'I10', description: 'Essential (primary) hypertension' }]
    },
    diagnosisSummary: 'Hypertension well documented with active ICD-10 code I10 on problem list. Coded answer (Yes) is supported — vitals and medication regimen confirm active management.',
    treatmentSummary: 'Lisinopril 20mg daily, amlodipine 5mg daily. BP monitoring per protocol.',
    carePlan: { onCarePlan: true, items: ['BP monitoring per protocol', 'Antihypertensives as ordered', 'Low-sodium diet'] }
  },

  I2900: {
    item: {
      mdsItem: 'I2900', itemName: 'Diabetes Mellitus (DM)', section: 'I',
      description: 'I2900 — Has the resident been diagnosed with diabetes mellitus (DM)?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'lab_result', sourceId: 'doc-006', documentName: 'Lab Results', displayName: 'Lab Results — 01/18/2026', effectiveDate: '2026-01-18',
          quote: 'HbA1c: 8.2%, Fasting glucose: 186 mg/dL. Diabetes management suboptimal — consider medication adjustment.',
          rationale: 'Lab values confirming active diabetes with suboptimal control.' },
        { sourceType: 'order', sourceId: 'mar-001', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Metformin 500mg PO BID — administered 0800, 1800. Blood glucose AC: 0730=168, 1130=142, 1730=195. HS: 2100=156.',
          rationale: 'Active diabetic medication and glucose monitoring.' },
        { sourceType: 'progress-note', sourceId: 'doc-026', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'DM type 2 — HbA1c elevated at 8.2%. Will increase metformin and add sliding scale insulin for glucose >200.',
          rationale: 'Physician management of diabetes with medication adjustment.', pageNumber: 1 }
      ],
      keyFindings: ['ICD-10 E11.9 on active problem list', 'HbA1c 8.2% — suboptimal glycemic control', 'Metformin 500mg BID + glucose monitoring AC & HS', 'Physician adjusting regimen — adding sliding scale insulin'],
      recommendedIcd10: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' }]
    },
    diagnosisSummary: 'Type 2 diabetes well documented. ICD-10 E11.9 on active problem list. Coded answer (Yes) is supported — lab monitoring and diabetic medications confirm active diagnosis.',
    treatmentSummary: 'Metformin 500mg BID, blood glucose monitoring AC & HS, diabetic diet, podiatry consult Q3 months.',
    carePlan: { onCarePlan: true, items: ['Blood glucose monitoring AC & HS', 'Diabetic diet', 'Foot checks each shift'] }
  },

  I6200: {
    item: {
      mdsItem: 'I6200', itemName: 'Asthma (COPD) or Chronic Lung Disease', section: 'I',
      description: 'I6200 — Does the resident have asthma, COPD, or chronic lung disease?',
      status: 'code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-067', documentName: 'Pulmonary Consult', displayName: 'Pulmonary Consult — 12/28/2025', effectiveDate: '2025-12-28',
          quote: 'COPD, GOLD stage 2. Chronic productive cough with intermittent wheezing. PFTs: FEV1/FVC 0.62, FEV1 64% predicted. Continue tiotropium and albuterol PRN.',
          rationale: 'Pulmonary specialist documenting established COPD with confirmatory spirometry.', pageNumber: 1 },
        { sourceType: 'order', sourceId: 'mar-067', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Tiotropium (Spiriva) 18mcg INH daily — administered 0900. Albuterol HFA 2 puffs INH Q6H PRN wheezing — given 01/25, 01/26.',
          rationale: 'Active bronchodilator therapy consistent with chronic lung disease.' }
      ],
      keyFindings: ['Pulmonary consult documents COPD GOLD stage 2', 'PFTs: FEV1/FVC 0.62, FEV1 64% predicted', 'Tiotropium daily + albuterol PRN active on MAR'],
      recommendedIcd10: [{ code: 'J44.9', description: 'Chronic obstructive pulmonary disease, unspecified' }]
    },
    diagnosisSummary: 'COPD (GOLD stage 2) documented by pulmonary with confirmatory spirometry. Coded answer (Yes) is supported by active bronchodilator therapy.',
    treatmentSummary: 'Tiotropium 18mcg INH daily, albuterol HFA PRN, SpO2 monitoring per protocol.',
    carePlan: { onCarePlan: true, items: ['Bronchodilators as ordered', 'SpO2 monitoring', 'Encourage pursed-lip breathing'] }
  },

  // ── Physician queries: evidence is suggestive but not definitive (yellow) ──

  I0400: {
    item: {
      mdsItem: 'I0400', itemName: 'Coronary Artery Disease (CAD)', section: 'I',
      description: 'I0400 — Has the resident been diagnosed with coronary artery disease (CAD)?',
      status: 'needs_physician_query',
      validation: { diagnosisCheck: { passed: false }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-020', documentName: 'Cardiology Consult', displayName: 'Cardiology Consult — 12/18/2025', effectiveDate: '2025-12-18',
          quote: 'History of coronary artery disease s/p PCI with drug-eluting stent to LAD in 2022. Chronic stable angina well controlled on current regimen.',
          rationale: 'Specialist documentation of established CAD diagnosis with interventional history.', pageNumber: 1 },
        { sourceType: 'order', sourceId: 'mar-010', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Aspirin 81mg PO daily — administered 0800. Atorvastatin 40mg PO QHS — administered 2100. Metoprolol succinate 25mg PO BID — administered 0800, 2000.',
          rationale: 'Active medications consistent with CAD treatment regimen.' }
      ],
      keyFindings: ['Cardiology consult documents CAD s/p PCI with DES to LAD (2022)', 'No ICD-10 code for CAD on current problem list', 'Active CAD medications: aspirin, atorvastatin, metoprolol'],
      recommendedIcd10: [{ code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery without angina pectoris' }]
    },
    diagnosisSummary: 'Coded answer is "No" but a 12/2025 cardiology consult references chronic stable angina and prior coronary stenting. No CAD ICD-10 on the current problem list — recommend confirming with the physician before coding.',
    treatmentSummary: 'Aspirin 81mg daily, atorvastatin 40mg daily, metoprolol 25mg BID — consistent with CAD management.',
    carePlan: { onCarePlan: false }
  },

  I0900: {
    item: {
      mdsItem: 'I0900', itemName: 'Peripheral Vascular Disease (PVD) or PAD', section: 'I',
      description: 'I0900 — Has the resident been diagnosed with peripheral vascular disease (PVD) or peripheral arterial disease (PAD)?',
      status: 'needs_physician_query',
      validation: { diagnosisCheck: { passed: false }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-003', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'Bilateral lower extremity edema with diminished pedal pulses noted. Continue compression stockings. Monitor for skin breakdown.',
          rationale: 'Physical findings consistent with PVD but not definitively diagnosed.', pageNumber: 1 },
        { sourceType: 'progress-note', sourceId: 'doc-030', documentName: 'Nursing Assessment', displayName: 'Nursing Assessment — 01/24/2026', effectiveDate: '2026-01-24',
          quote: 'Lower extremities cool to touch bilaterally. Pedal pulses 1+ and diminished. Capillary refill >3 seconds. Compression stockings in place.',
          rationale: 'Vascular findings suggestive of peripheral arterial insufficiency.' }
      ],
      keyFindings: ['Diminished pedal pulses (1+) bilaterally', 'Lower extremities cool with delayed capillary refill', 'No formal PVD/PAD diagnosis or ABI study on record'],
      recommendedIcd10: [{ code: 'I73.9', description: 'Peripheral vascular disease, unspecified' }]
    },
    diagnosisSummary: 'Coded answer is "No". Exam shows diminished pedal pulses, cool extremities, and delayed capillary refill — suggestive of PVD/PAD, but no formal diagnosis or ABI is documented. Recommend a physician query before coding.',
    treatmentSummary: 'Compression stockings, skin monitoring. No vascular-specific pharmacotherapy documented.',
    carePlan: { onCarePlan: false }
  },

  I2300: {
    item: {
      mdsItem: 'I2300', itemName: 'Urinary Tract Infection (UTI)', section: 'I',
      description: 'I2300 — Urinary tract infection (UTI) with a diagnosis in the last 30 days.',
      status: 'needs_physician_query',
      validation: { diagnosisCheck: { passed: false }, treatmentCheck: { passed: false } },
      evidence: [
        { sourceType: 'lab_result', sourceId: 'doc-080', documentName: 'Urinalysis', displayName: 'Urinalysis — 01/25/2026', effectiveDate: '2026-01-25',
          quote: 'Urinalysis: leukocyte esterase positive, nitrites positive, WBC 50-100/hpf, bacteria moderate. Culture pending.',
          rationale: 'Urinalysis suggestive of UTI; culture not yet resulted.', pageNumber: 1 },
        { sourceType: 'progress-note', sourceId: 'doc-081', documentName: 'Nursing Note', displayName: 'Nursing Note — 01/25/2026', effectiveDate: '2026-01-25',
          quote: 'New onset urinary frequency and dysuria. Mild suprapubic tenderness. Afebrile. UA collected and sent. MD notified.',
          rationale: 'Symptoms consistent with UTI but no physician diagnosis or antibiotic order yet.' }
      ],
      keyFindings: ['UA positive for leukocyte esterase and nitrites', 'New urinary frequency and dysuria documented', 'Culture pending; no physician UTI diagnosis or antibiotic yet'],
      recommendedIcd10: [{ code: 'N39.0', description: 'Urinary tract infection, site not specified' }]
    },
    diagnosisSummary: 'Coded answer is "No". UA from 1/25 is positive for leukocyte esterase and nitrites with new urinary symptoms, but culture is pending and no physician UTI diagnosis is on record. Recommend a physician query to confirm before coding.',
    treatmentSummary: 'No antibiotic ordered yet — awaiting culture results and physician determination.',
    carePlan: { onCarePlan: false }
  },

  I5800: {
    item: {
      mdsItem: 'I5800', itemName: 'Depression (other than bipolar)', section: 'I',
      description: 'I5800 — Has the resident been diagnosed with depression (other than bipolar disorder)?',
      status: 'needs_physician_query',
      validation: { diagnosisCheck: { passed: false }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-090', documentName: 'Social Services Note', displayName: 'Social Services Note — 01/16/2026', effectiveDate: '2026-01-16',
          quote: 'PHQ-9 score 11 (moderate depressive symptoms). Reports low mood, anhedonia, and poor sleep since admission. No active SI. Recommend MD evaluation for possible depression.',
          rationale: 'Validated screening positive for moderate depressive symptoms; no formal diagnosis yet.', pageNumber: 1 },
        { sourceType: 'order', sourceId: 'mar-090', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
          quote: 'Mirtazapine 15mg PO QHS — administered 2100 (started 01/18 for mood and appetite).',
          rationale: 'Antidepressant started after screening, but no documented depression diagnosis.' }
      ],
      keyFindings: ['PHQ-9 score 11 — moderate depressive symptoms', 'Mirtazapine started 01/18 for mood/appetite', 'No depression ICD-10 or physician diagnosis on record'],
      recommendedIcd10: [{ code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' }]
    },
    diagnosisSummary: 'Coded answer is "No". PHQ-9 of 11 and a newly started antidepressant suggest depression, but there is no physician diagnosis on record. Recommend a physician query before coding.',
    treatmentSummary: 'Mirtazapine 15mg QHS, social services follow-up. Awaiting physician evaluation.',
    carePlan: { onCarePlan: false }
  },

  // ── Validated negative: page says No, AI agrees No (green match) ──

  I0600: {
    item: {
      mdsItem: 'I0600', itemName: 'Heart Failure', section: 'I',
      description: 'I0600 — Does the resident have heart failure (e.g., CHF, pulmonary edema)?',
      status: 'dont_code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [
        { sourceType: 'progress-note', sourceId: 'doc-044', documentName: 'Cardiology Consult', displayName: 'Cardiology Consult — 12/18/2025', effectiveDate: '2025-12-18',
          quote: 'Echocardiogram 12/2025: LVEF 58%, no wall motion abnormalities, no valvular disease. No clinical evidence of heart failure.',
          rationale: 'Cardiology evaluation ruling out heart failure.', pageNumber: 2 },
        { sourceType: 'progress-note', sourceId: 'doc-045', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
          quote: 'No signs of fluid overload. Lungs clear bilaterally. No peripheral edema concerning for CHF. BNP 45 pg/mL (normal).',
          rationale: 'Physical exam and labs ruling out heart failure.', pageNumber: 1 }
      ],
      keyFindings: ['Echo LVEF 58% — normal', 'BNP 45 pg/mL — normal', 'No signs of fluid overload']
    },
    diagnosisSummary: 'No heart failure documented. Echo shows preserved EF at 58%, BNP within normal limits. Coded answer (No) is correct.',
    treatmentSummary: 'No heart failure therapy. Current cardiac medications for HTN/CAD only.',
    carePlan: { onCarePlan: false }
  },
};

// ── Validated negatives: every other Section I Yes/No item ──
// The chart has no supporting evidence, so Super agrees with the page's "No".
// These render as green "✓ Super: No" badges — conveying that Super reviewed
// the whole section, not just the items it wants to change. [code, name, dx, tx, keyFinding]
const NO_EVIDENCE = [
  ['I0100', 'Cancer', 'No active or historical malignancy documented. No oncology consult, chemotherapy, radiation, or abnormal tumor markers in the chart.', 'No cancer-directed therapy on the MAR.', 'No oncology diagnosis or treatment on record'],
  ['I0800', 'Orthostatic Hypotension', 'No orthostatic vitals drop documented. Lying/standing blood pressures within normal limits on nursing flow sheets.', 'No midodrine or fludrocortisone; no orthostatic precautions ordered.', 'Orthostatic vitals stable on the flow sheet'],
  ['I1300', "Ulcerative Colitis, Crohn's, or IBD", 'No inflammatory bowel disease diagnosis. No GI specialist notes or related imaging in the chart.', 'No mesalamine, biologics, or IBD-directed therapy on the MAR.', 'No IBD diagnosis or treatment documented'],
  ['I1500', 'Renal Insufficiency, Renal Failure, or ESRD', 'No renal insufficiency documented. Most recent eGFR within normal limits; no nephrology involvement.', 'No dialysis, phosphate binders, or renal-dosing adjustments.', 'eGFR within normal limits; no dialysis'],
  ['I1550', 'Neurogenic Bladder', 'No neurogenic bladder diagnosis. Continent with routine toileting per nursing; no urology workup.', 'No intermittent catheterization or bladder-specific medications.', 'No urologic diagnosis documented'],
  ['I1650', 'Obstructive Uropathy', 'No obstructive uropathy documented. No hydronephrosis on imaging and no urologic obstruction noted.', 'No stenting, nephrostomy, or obstruction management.', 'No obstructive findings on record'],
  ['I2000', 'Pneumonia', 'No pneumonia documented. Chest x-ray clear with no infiltrate; afebrile with no respiratory antibiotics.', 'No antibiotics directed at pneumonia on the MAR.', 'CXR clear; afebrile; no respiratory antibiotics'],
  ['I2100', 'Septicemia', 'No septicemia documented. Blood cultures negative; hemodynamically stable with no sepsis criteria met.', 'No IV antibiotics or sepsis protocol on record.', 'Blood cultures negative; hemodynamically stable'],
  ['I2200', 'Tuberculosis', 'No tuberculosis documented. TB screening negative on admission; no respiratory isolation.', 'No anti-tubercular therapy on the MAR.', 'Negative TB screening on admission'],
  ['I2400', 'Viral Hepatitis', 'No viral hepatitis documented. Hepatitis panel negative; liver function tests within normal limits.', 'No antiviral hepatitis therapy on record.', 'Hepatitis panel negative; LFTs normal'],
  ['I2500', 'Wound Infection (other than foot)', 'No wound infection documented. Skin assessment intact; no wound cultures or purulent drainage noted.', 'No wound-directed antibiotics or specialized dressings.', 'Skin intact; no wound infection on record'],
  ['I3100', 'Hyponatremia', 'No hyponatremia documented. Most recent serum sodium within normal limits.', 'No fluid restriction or sodium correction ordered.', 'Serum sodium within normal limits'],
  ['I3200', 'Hyperkalemia', 'No hyperkalemia documented. Most recent serum potassium within normal limits.', 'No potassium binders or restriction ordered.', 'Serum potassium within normal limits'],
  ['I3300', 'Hyperlipidemia', 'No active hyperlipidemia diagnosis. Lipid panel at goal on current therapy; statin documented for cardiac secondary prevention rather than a standalone lipid diagnosis.', 'Statin per cardiology; no separate hyperlipidemia management.', 'Lipid panel at goal; no standalone hyperlipidemia diagnosis'],
  ['I3900', 'Hip Fracture', 'No hip fracture documented. No fracture history or recent hip imaging in the chart.', 'No post-fracture orthopedic management.', 'No hip fracture history or imaging'],
  ['I4000', 'Other Fracture', 'No recent fracture documented. No acute fracture on imaging or in the problem list.', 'No fracture-related immobilization or orthopedic follow-up.', 'No acute fracture documented'],
  ['I4200', "Alzheimer's Disease", "No Alzheimer's diagnosis. Cognition intact on the most recent BIMS; no dementia-specific medications.", 'No cholinesterase inhibitor or memantine on the MAR.', 'BIMS intact; no dementia diagnosis'],
  ['I4300', 'Aphasia', 'No aphasia documented. Speech clear and functional per nursing and SLP screening.', 'No aphasia-directed speech therapy on record.', 'Speech intact per nursing/SLP'],
  ['I4400', 'Cerebral Palsy', 'No cerebral palsy documented. No history of cerebral palsy in the chart.', 'No cerebral palsy management.', 'No cerebral palsy history'],
  ['I4500', 'Cerebrovascular Accident (CVA), TIA, or Stroke', 'No stroke or TIA documented. Neurologic exam non-focal; no stroke history in the problem list.', 'No post-stroke rehabilitation or secondary-prevention regimen specific to stroke.', 'Non-focal neuro exam; no stroke history'],
  ['I4800', "Non-Alzheimer's Dementia", 'No non-Alzheimer dementia documented. Cognition intact on the most recent BIMS.', 'No dementia-specific medications on the MAR.', 'BIMS intact; no dementia diagnosis'],
  ['I4900', 'Hemiplegia or Hemiparesis', 'No hemiplegia or hemiparesis documented. Strength symmetric on nursing and therapy assessments.', 'No hemiparesis-directed therapy on record.', 'Symmetric strength; no focal motor deficit'],
  ['I5000', 'Paraplegia', 'No paraplegia documented. No spinal cord injury in the chart; lower-extremity function intact.', 'No paraplegia management.', 'No spinal cord injury documented'],
  ['I5100', 'Quadriplegia', 'No quadriplegia documented. No spinal cord injury in the chart; all extremities functional.', 'No quadriplegia management.', 'No spinal cord injury documented'],
  ['I5200', 'Multiple Sclerosis', 'No multiple sclerosis documented. No MS history or disease-modifying therapy in the chart.', 'No MS-directed therapy on the MAR.', 'No MS history or therapy'],
  ['I5250', "Huntington's Disease", "No Huntington's disease documented. No movement disorder history in the chart.", 'No Huntington-directed therapy.', "No Huntington's history"],
  ['I5300', "Parkinson's Disease", "No Parkinson's disease documented. No resting tremor or bradykinesia noted; no dopaminergic therapy.", 'No carbidopa/levodopa on the MAR.', 'No parkinsonian features; no dopaminergic therapy'],
  ['I5350', "Tourette's Syndrome", "No Tourette's syndrome documented. No tic disorder history in the chart.", 'No tic-directed therapy.', 'No tic disorder history'],
  ['I5400', 'Seizure Disorder or Epilepsy', 'No seizure disorder documented. No seizure history; no antiepileptic drugs on the MAR.', 'No antiepileptic therapy on record.', 'No seizure history; no AEDs'],
  ['I5500', 'Traumatic Brain Injury (TBI)', 'No traumatic brain injury documented. No head-injury history in the chart.', 'No TBI-related management.', 'No head-injury history'],
  ['I5900', 'Bipolar Disorder', 'No bipolar disorder documented. No mood-disorder history of mania; no mood stabilizers.', 'No lithium or mood stabilizer on the MAR.', 'No bipolar history; no mood stabilizers'],
  ['I5950', 'Psychotic Disorder (other than schizophrenia)', 'No psychotic disorder documented. No hallucinations or delusions noted; no antipsychotics.', 'No antipsychotic therapy on the MAR.', 'No psychosis documented; no antipsychotics'],
  ['I6000', 'Schizophrenia', 'No schizophrenia documented. No psychotic-disorder history in the chart.', 'No schizophrenia-directed therapy.', 'No schizophrenia diagnosis'],
  ['I6100', 'Post-Traumatic Stress Disorder (PTSD)', 'No PTSD documented. No trauma-disorder diagnosis in the chart.', 'No PTSD-directed therapy on record.', 'No PTSD diagnosis'],
  ['I6300', 'Respiratory Failure', 'No respiratory failure documented. No ventilator or BiPAP support; oxygenation adequate on room air or baseline O2.', 'No mechanical ventilation or non-invasive support.', 'No ventilatory support; oxygenation adequate'],
  ['I7900', 'None of the Above', 'Super identified active diagnoses in this section, so "none of the above" is correctly coded No.', 'Not applicable — active diagnoses are present.', 'Active diagnoses present; "none of the above" is No'],
];

for (const [code, itemName, diagnosisSummary, treatmentSummary, keyFinding] of NO_EVIDENCE) {
  SECTION_I_DETAIL[code] = {
    item: {
      mdsItem: code, itemName, section: 'I',
      description: `${code} — ${itemName}.`,
      status: 'dont_code',
      validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
      evidence: [],
      keyFindings: [keyFinding],
    },
    diagnosisSummary,
    treatmentSummary,
    carePlan: { onCarePlan: false },
  };
}

/**
 * Page coded-answer derivation helper: Section I encodes the AI's verdict as a
 * status. The badge needs an aiAnswer.answer too — derive it here so callers
 * don't reinvent it. dont_code → No; everything else → Yes.
 */
export function sectionIAiAnswer(code) {
  const detail = SECTION_I_DETAIL[code];
  if (!detail) return null;
  const status = detail.item.status;
  return {
    mdsItem: code,
    column: '',
    status,
    answer: status === 'dont_code' ? '0' : '1',
    itemName: detail.item.itemName,
  };
}
