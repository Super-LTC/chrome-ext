// Mock v2 audit-response fixture for the Care Plan V2 wizard.
//
// This is the RAW backend response shape (the modal layers on _rowId /
// _ruleIdToCAA itself — those are intentionally NOT present here). It lets us
// render the V2 care-plan wizard end-to-end before the v2 audit endpoint is
// deployed. Transcribed from .context/careplan-v2-wizard-MOCK.html:
//   - 19 proposed focuses ("toAdd") across 13 non-covered care areas
//   - 6 gap areas (toAdd only), 7 partial areas (toAdd + an existing onPlan)
//   - 8 covered areas (onPlan only) for the wizard's "Covered" fold
//
// Role -> position-id map (stable, arbitrary integers):
//   CNA=9882, RN=9897, ACTIVITIES=9885, DIETARY=9888,
//   THERAPY_ANY=9890, SOCIAL_SERVICES=9891

const fixture = {
  patientId: 'DEMO-0001',
  internalPatientId: 'mock-internal',
  audit: {
    engineVersion: 'v2',
    hasCoverageCheckData: true,

    toAdd: [
      // ---- Cognition / Dementia (gap) -------------------------------------
      {
        ruleId: 'dx.cognition',
        score: 96,
        caa: 'cognition',
        caaName: 'Cognition / Dementia',
        reason: 'Active diagnosis: R41.82 — Altered Mental Status, Unspecified',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['R41.82 — Altered Mental Status, Unspecified'],
        },
        focus: {
          description: 'Resident has potential for impaired cognitive function',
          goals: [
            { description: 'Resident will maintain current level of cognitive function through review date.' },
            { description: 'Will be able to communicate basic needs daily through review date.' },
          ],
          interventions: [
            { description: 'Approach in calm manner; call by name.', kardexCategory: 'discharge_planning', positions: [9882] },
            { description: 'Ask yes/no questions to determine resident needs.', kardexCategory: 'communication', positions: [9882] },
            { description: 'Present one thought, idea, question, or command at a time.', kardexCategory: 'communication', positions: [9882] },
            { description: 'Reorient resident as needed.', kardexCategory: 'discharge_planning', positions: [9882] },
            { description: 'Communicate with family/caregivers regarding resident capabilities.', kardexCategory: 'communication', positions: [9897] },
            { description: 'Administer medications as ordered; monitor for side effects.', kardexCategory: 'monitors', positions: [9897] },
            // Token-bearing intervention (two same-tokenKey "inline" [select]s) — exercises
            // the segment renderer's inline dropdowns (the "Bathing" case from prod).
            {
              description: 'Bathing: Provide [select] assistance of [select] person(s) for bathing',
              kardexCategory: 'monitors',
              positions: [9882],
              descriptionSegments: [
                { kind: 'text', value: 'Bathing: Provide ' },
                { kind: 'token', tokenKey: 'inline', needsFilling: true, value: '[select]', options: ['total', 'extensive', 'limited', 'supervision', 'setup'] },
                { kind: 'text', value: ' assistance of ' },
                { kind: 'token', tokenKey: 'inline', needsFilling: true, value: '[select]', options: ['1', '2', '2+'] },
                { kind: 'text', value: ' person(s) for bathing' },
              ],
            },
          ],
        },
      },

      // ---- Psychosocial (gap) --------------------------------------------
      {
        ruleId: 'universal.adjustment_to_admission',
        score: 92,
        caa: 'psychosocial',
        caaName: 'Psychosocial',
        reason: 'Standard adjustment-to-admission focus for new admissions',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'standard',
          basisLabel: 'Standard focus',
          evidence: [],
        },
        focus: {
          description: 'Resident has adjustment issues to admission',
          goals: [
            { description: 'Resident will maintain the ability to seek social contact and stimulation through the review date.' },
            { description: 'Resident will cooperate with care through next review date.' },
          ],
          interventions: [
            { description: 'Encourage resident to participate in conversation with staff and other residents daily.', kardexCategory: 'mood', positions: [9882] },
            { description: 'Introduce resident to others with similar background and interests; encourage interaction.', kardexCategory: 'activities', positions: [9885] },
            { description: 'Encourage ongoing family involvement; invite family to special events, activities, meals.', kardexCategory: 'activities', positions: [9882] },
            { description: 'Provide opportunities for resident and family to participate in care.', kardexCategory: 'mood', positions: [9897] },
            { description: 'Provide situations that give the resident control over their environment and care delivery.', kardexCategory: 'mood', positions: [9882] },
            { description: 'Give clear explanation of all care activities prior to and as they occur during each contact.', kardexCategory: 'communication', positions: [9882] },
            { description: 'Monitor/document/report mood patterns and s/sx of depression, anxiety, or sad mood per facility policy.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Behavioral health consult as needed.', kardexCategory: 'mood', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'dx.social_isolation',
        score: 88,
        caa: 'psychosocial',
        caaName: 'Psychosocial',
        reason: 'Active diagnosis: F32.A — Depression, Unspecified (+1 more)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['F32.A — Depression, Unspecified', '+1 more'],
        },
        focus: {
          description: 'Resident is at risk for social isolation',
          goals: [
            { description: 'Resident will maintain social relationships with staff and peers as evidenced by initiating social encounters daily through next review.' },
            { description: 'Resident will engage in some form of independent activity of choice and/or socialization daily through next review.' },
          ],
          interventions: [
            { description: 'Observe for barriers to social interaction: illness, incontinence, decreased ability to form relationships.', kardexCategory: 'mood', positions: [9897] },
            { description: 'Discuss causes of perceived or actual isolation with resident.', kardexCategory: 'mood', positions: [9897] },
            { description: 'Provide monthly calendar in room; invite to structured activities; respect right to refuse.', kardexCategory: 'activities', positions: [9885] },
            { description: 'Provide encouragement; praise involvement.', kardexCategory: 'mood', positions: [9882] },
            { description: 'Provide 1:1 visits and traveling programs as needed.', kardexCategory: 'activities', positions: [9885] },
            { description: 'Encourage peer, staff, and family socialization.', kardexCategory: 'activities', positions: [9882] },
            { description: 'Monitor for changes in mood/behavior r/t isolation; document any noted in clinical record.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Allow resident to express feelings and desires; ask opinions and offer choices.', kardexCategory: 'mood', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'dx.health_literacy_risk',
        score: 84,
        caa: 'psychosocial',
        caaName: 'Psychosocial',
        reason: 'Active diagnosis: R41.82 — Altered Mental Status, Unspecified',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['R41.82 — Altered Mental Status, Unspecified'],
        },
        focus: {
          description: 'Resident is at risk of not understanding health information',
          goals: [
            { description: 'Resident will demonstrate understanding of health information by being able to explain current health status and active plan of care by next review date.' },
          ],
          interventions: [
            { description: 'Encourage questions to reduce uncertainty and give resident confidence in managing conditions.', kardexCategory: 'education', positions: [9897] },
            { description: 'Facilitate resident education during group and 1:1 visits.', kardexCategory: 'education', positions: [9897] },
            { description: 'Anticipate and meet resident needs. Ensure call light is within reach.', kardexCategory: 'communication', positions: [9882] },
            { description: 'Develop personal action plans to break down health goals into realistic steps.', kardexCategory: 'education', positions: [9897] },
            { description: 'Educate resident/family/caregivers using teach-back method to confirm comprehension.', kardexCategory: 'education', positions: [9897] },
            { description: 'Provide written materials at an appropriate reading level.', kardexCategory: 'education', positions: [9897] },
            { description: 'Coordinate with social services for additional support as needed.', kardexCategory: 'discharge_planning', positions: [9891] },
          ],
        },
      },

      // ---- Neuro (Stroke / Seizure / Other) (gap) ------------------------
      {
        ruleId: 'order.antiepileptic_therapy',
        score: 86,
        caa: 'neuro',
        caaName: 'Neuro (Stroke / Seizure / Other)',
        reason: 'Active order: Gabapentin Capsule 100 MG',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'order',
          basisLabel: 'Active order',
          evidence: ['Gabapentin Capsule 100 MG'],
        },
        focus: {
          description: 'Resident is on antiepileptic/anticonvulsant medication therapy',
          goals: [
            { description: 'Resident will be free of seizure activity through review date.' },
            { description: 'Resident will be free from adverse effects of antiepileptic medication through review date.' },
          ],
          interventions: [
            { description: 'Administer antiepileptic medications as ordered. Monitor for effectiveness and side effects.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for adverse effects: drowsiness, dizziness, ataxia, rash, mood changes, GI upset.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Obtain and monitor drug levels and labs as ordered (CBC, LFTs, electrolytes).', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for seizure activity; document onset, duration, postictal state, and report to MD.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Implement seizure precautions per facility protocol: side rails padded, suction available.', kardexCategory: 'safety', positions: [9897] },
            { description: 'Educate resident/family on importance of consistent dosing; avoid sudden discontinuation.', kardexCategory: 'education', positions: [9897] },
            { description: 'Pharmacy review for drug interactions and dose adjustments as appropriate.', kardexCategory: 'medications', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'dx.neuro_status',
        score: 82,
        caa: 'neuro',
        caaName: 'Neuro (Stroke / Seizure / Other)',
        reason: 'Active diagnosis: G93.41 — Metabolic Encephalopathy',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['G93.41 — Metabolic Encephalopathy'],
        },
        focus: {
          description: 'Resident has alteration in neurological status r/t Metabolic Encephalopathy',
          goals: [
            { description: 'Resident will function at the fullest potential possible as outlined by the interdisciplinary team through review date.' },
            { description: 'Resident will maintain optimal status and quality of life within limitations imposed by neurological deficits through review date.' },
          ],
          interventions: [
            { description: 'Administer medications as ordered. Monitor for side effects and effectiveness.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor/document/report PRN s/sx of tremors, rigidity, dizziness, changes in level of consciousness.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Obtain and monitor lab/diagnostic work as ordered. Report results to MD and follow up as indicated.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'PT, OT, ST evaluate and treat as ordered.', kardexCategory: 'mobility', positions: [9890] },
            { description: 'Cueing, reorientation as needed.', kardexCategory: 'cognition', positions: [9882] },
            { description: 'Monitor ability to chew and swallow; obtain Speech therapy evaluation if pocketing or choking.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Activity as tolerated; out of bed in chair when possible.', kardexCategory: 'mobility', positions: [9882] },
            { description: 'Monitor lab values for therapeutic levels of neurological medications; report sub-therapeutic results.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },

      // ---- Musculoskeletal (gap) -----------------------------------------
      {
        ruleId: 'dx.musculoskeletal',
        score: 80,
        caa: 'musculoskeletal',
        caaName: 'Musculoskeletal',
        reason: 'Active diagnosis: M79.661 — Pain In Right Lower Leg (+3 more)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['M79.661 — Pain In Right Lower Leg', '+3 more'],
        },
        focus: {
          description: 'Resident has alteration in musculoskeletal status r/t Pain In Right Lower Leg, Muscle Spasm Of Back, Muscle Wasting And Atrophy, Not Elsewhere Classified, Multiple Sites, and 1 more',
          goals: [
            { description: 'Resident will remain free of injuries or complications related to musculoskeletal status through review date.' },
            { description: 'Resident will remain free from pain or at a level of discomfort acceptable to the resident through the review date.' },
          ],
          interventions: [
            { description: 'Monitor for fatigue. Plan activities during optimal times when pain and stiffness are abated.', kardexCategory: 'activities', positions: [9882] },
            { description: 'Monitor/document for risk of falls. Educate resident/family on safety measures.', kardexCategory: 'safety', positions: [9897] },
            { description: 'Give analgesics as ordered. Monitor for side effects and effectiveness.', kardexCategory: 'pain', positions: [9897] },
            { description: 'Follow MD orders for weight-bearing status; refer to PT treatment plan.', kardexCategory: 'mobility', positions: [9897] },
            { description: 'Monitor/document/report PRN s/sx of complications: joint pain, stiffness, swelling, decline in function.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Heat/cold applications as ordered and as tolerated.', kardexCategory: 'pain', positions: [9882] },
            { description: 'Encourage resident to change position every 2 hours to prevent contractures, edema, and skin breakdown.', kardexCategory: 'mobility', positions: [9882] },
            { description: 'Obtain/monitor lab/diagnostic work as ordered; report abnormalities to medical provider.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },

      // ---- Urinary Incontinence (gap) ------------------------------------
      {
        ruleId: 'dx.bowel_bladder',
        score: 78,
        caa: 'urinary_incontinence',
        caaName: 'Urinary Incontinence',
        reason: 'Active diagnosis: K59.00 — Constipation, Unspecified',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['K59.00 — Constipation, Unspecified'],
        },
        focus: {
          description: 'Resident has potential for complications with bowel/bladder elimination',
          goals: [
            { description: 'Resident will be free from complications related to bowel or bladder elimination through review date.' },
            { description: 'Resident will be kept clean, dry, and comfortable daily through review date.' },
          ],
          interventions: [
            { description: 'Monitor for s/sx of UTI: pain, burning, blood-tinged urine, cloudiness, no output, fever.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Follow facility bowel protocol; record bowel movement pattern each day.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Monitor medications for side effects affecting elimination; notify MD of changes.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Encourage adequate fluid intake to support elimination.', kardexCategory: 'nutrition', positions: [9882] },
            { description: 'Provide peri-care after each incontinent episode; clean peri-area with each episode.', kardexCategory: 'education', positions: [9882] },
          ],
        },
      },

      // ---- Psychotropic Medications (gap) --------------------------------
      {
        ruleId: 'order.anti_anxiety_therapy',
        score: 76,
        caa: 'psychotropic_medications',
        caaName: 'Psychotropic Medications',
        reason: 'Active order: hydrOXYzine HCl Oral Tablet 10 MG (Hydroxyzine HCl)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'order',
          basisLabel: 'Active order',
          evidence: ['hydrOXYzine HCl Oral Tablet 10 MG (Hydroxyzine HCl)'],
        },
        focus: {
          description: 'Resident is on anti-anxiety or sedative/hypnotic medication therapy.',
          goals: [
            { description: 'Resident will be free from adverse effects of anti-anxiety or sedative medications through review date.' },
            { description: 'Resident will have improved sleep pattern and reduced anxiety through review date.' },
          ],
          interventions: [
            { description: 'Administer medications as ordered. Monitor for effectiveness and side effects.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for adverse effects: drowsiness, dizziness, ataxia, falls, confusion, paradoxical agitation.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor sleep patterns and anxiety symptoms; document response to therapy.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Implement non-pharmacological interventions: bedtime routine, low stimulation, relaxation.', kardexCategory: 'discharge_planning', positions: [9882] },
            { description: 'Pharmacy review for dose reduction or discontinuation as appropriate; document rationale.', kardexCategory: 'discharge_planning', positions: [9897] },
            { description: 'Educate resident/family on risks of falls and confusion; encourage call light use.', kardexCategory: 'discharge_planning', positions: [9897] },
          ],
        },
      },

      // ---- Cardiac (partial) ---------------------------------------------
      {
        ruleId: 'dx.cardiac_chf',
        score: 74,
        caa: 'cardiac',
        caaName: 'Cardiac',
        reason: 'Active diagnosis: I50.9 — Heart Failure, Unspecified',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['I50.9 — Heart Failure, Unspecified'],
        },
        focus: {
          description: 'Resident has altered cardiovascular status r/t CHF',
          goals: [
            { description: 'Resident will be free from complications of cardiac problems through review date.' },
            { description: 'Resident will be free of peripheral edema through review date.' },
          ],
          interventions: [
            { description: 'Administer cardiac medications as ordered. Monitor for side effects and effectiveness.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for s/sx of CHF: dependent edema, periorbital edema, SOB on exertion, weight gain.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor lung sounds, edema, and weight changes; notify MD of significant changes.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Diet consult as needed; follow recommended cardiac diet.', kardexCategory: 'nutrition', positions: [9888] },
            { description: 'Obtain and monitor lab/diagnostic work as ordered. Report results to MD.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'dx.cardiac_afib',
        score: 72,
        caa: 'cardiac',
        caaName: 'Cardiac',
        reason: 'Active diagnosis: I48.91 — Unspecified Atrial Fibrillation',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['I48.91 — Unspecified Atrial Fibrillation'],
        },
        focus: {
          description: 'Resident has altered cardiovascular status r/t atrial fibrillation',
          goals: [
            { description: 'Resident will be free from complications of cardiac problems through review date.' },
            { description: 'Resident will maintain current cardiac output through review date.' },
          ],
          interventions: [
            { description: 'Administer cardiac medications as ordered. Monitor for side effects and effectiveness.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor heart rate and rhythm; notify MD of significant changes.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for s/sx of CAD: chest pain, heartburn, nausea, shortness of breath.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for s/sx of stroke: facial droop, slurred speech, sudden weakness or numbness, vision changes.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Obtain and monitor lab/diagnostic work as ordered. Report results to MD.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'dx.cardiac_arrhythmia',
        score: 70,
        caa: 'cardiac',
        caaName: 'Cardiac',
        reason: 'Active diagnosis: I49.9 — Cardiac Arrhythmia, Unspecified (+1 more)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['I49.9 — Cardiac Arrhythmia, Unspecified', '+1 more'],
        },
        focus: {
          description: 'Resident has altered cardiovascular status r/t Cardiac Arrhythmia, Unspecified, Acute Myocardial Infarction, Unspecified',
          goals: [
            { description: 'Resident will be free from complications of cardiac problems through the review date.' },
            { description: 'Resident will be free of complications related to altered cardiac status through next review.' },
          ],
          interventions: [
            { description: 'Monitor/document/report PRN s/sx of cardiac problems: chest pain or pressure, heartburn, nausea.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor/document/report changes in lung sounds, edema, and weight.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Vital signs as ordered and PRN. Notify MD of significant abnormalities.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Weight monitoring as ordered and PRN.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Give cardiac medications as ordered. Monitor for side effects and effectiveness.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Follow recommended diet related to cardiac status; encourage low fat, low salt intake.', kardexCategory: 'nutrition', positions: [9888] },
            { description: 'Obtain/monitor lab/diagnostic work as ordered; report abnormalities to medical provider.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Educate resident/family on risk factors: cholesterol, hypertension, smoking, sedentary lifestyle.', kardexCategory: 'education', positions: [9897] },
          ],
        },
      },

      // ---- Respiratory (partial) -----------------------------------------
      {
        ruleId: 'dx.respiratory_rhinitis',
        score: 68,
        caa: 'respiratory',
        caaName: 'Respiratory',
        reason: 'Active diagnosis: J30.89 — Other Allergic Rhinitis',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['J30.89 — Other Allergic Rhinitis'],
        },
        focus: {
          description: 'Resident has allergic rhinitis and is at risk for upper respiratory discomfort',
          goals: [
            { description: 'Resident will report reduced rhinitis symptoms through review date.' },
            { description: 'Resident will remain free from sinus or ear complications through review date.' },
          ],
          interventions: [
            { description: 'Administer medication/puffers (antihistamines, nasal sprays) as ordered.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Identify and limit exposure to known allergens (dust, pollen, fragrances) per resident history.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Encourage HOB elevation to prevent shortness of breath; position resident for optimal breathing.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Monitor for s/sx of allergic rhinitis or respiratory distress: increased respirations, decreased O2.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Encourage fluid intake to help liquefy secretions; avoid iced and carbonated fluids.', kardexCategory: 'nutrition', positions: [9882] },
            { description: 'Educate resident/family/caregivers on environmental controls and medication adherence.', kardexCategory: 'discharge_planning', positions: [9897] },
          ],
        },
      },

      // ---- Infection Control (partial) -----------------------------------
      {
        ruleId: 'dx.infection_sepsis',
        score: 66,
        caa: 'infection_control',
        caaName: 'Infection Control',
        reason: 'Active diagnosis: A41.9 — Sepsis, Unspecified Organism',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['A41.9 — Sepsis, Unspecified Organism'],
        },
        focus: {
          description: 'Resident has infection r/t Sepsis, Unspecified Organism',
          goals: [
            { description: 'Resident will be free from complications related to infection through the review date.' },
            { description: 'Infection will resolve without complications by review date.' },
          ],
          interventions: [
            { description: 'Administer antibiotic as per MD orders. Monitor for effectiveness and side effects.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Follow facility policy and procedures for line listing, summarizing, and reporting infections.', kardexCategory: 'safety', positions: [9897] },
            { description: 'Maintain universal precautions when providing care.', kardexCategory: 'safety', positions: [9882] },
            { description: 'Monitor vital signs per shift/prn; report abnormal readings to MD.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Monitor/document/report s/sx of infection: fever, chills, redness, swelling, drainage, change in status.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Obtain and monitor lab/diagnostic work as ordered; report results to MD.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Encourage adequate fluid intake unless restricted.', kardexCategory: 'hydration', positions: [9882] },
            { description: 'Educate resident and family on infection control and follow-up care.', kardexCategory: 'education', positions: [9897] },
          ],
        },
      },

      // ---- Pain (partial) ------------------------------------------------
      {
        ruleId: 'order.opioid_therapy',
        score: 64,
        caa: 'pain',
        caaName: 'Pain',
        reason: 'Active order: HYDROcodone-Acetaminophen Oral Tablet 10-325 MG (Hydrocodone-Acetaminophen) (+1 more)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'order',
          basisLabel: 'Active order',
          evidence: ['HYDROcodone-Acetaminophen Oral Tablet 10-325 MG (Hydrocodone-Acetaminophen)', '+1 more'],
        },
        focus: {
          description: 'Resident is on opioid pain medication therapy.',
          goals: [
            { description: 'Resident will report acceptable pain control with minimal side effects through review date.' },
            { description: 'Resident will be free from adverse effects of opioid therapy through review date.' },
          ],
          interventions: [
            { description: 'Administer pain medications as ordered. Monitor for effectiveness using pain scale; document response.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for adverse effects: sedation, respiratory depression, constipation, nausea, confusion.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Maintain bowel regimen per facility protocol to prevent opioid-induced constipation.', kardexCategory: 'communication', positions: [9897] },
            { description: 'Implement non-pharmacological pain interventions: positioning, heat/cold, distraction.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Monitor for signs of misuse or diversion per facility controlled-substance protocol.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Educate resident/family on safe use, risks, and importance of reporting unrelieved pain.', kardexCategory: 'discharge_planning', positions: [9897] },
          ],
        },
      },

      // ---- ADL / Self-Care (partial) -------------------------------------
      {
        ruleId: 'dx.adl_mobility',
        score: 62,
        caa: 'adl_self_care',
        caaName: 'ADL / Self-Care',
        reason: 'Active diagnosis: M62.59 — Muscle Wasting And Atrophy, Not Elsewhere Classified, Multiple Sites',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['M62.59 — Muscle Wasting And Atrophy, Not Elsewhere Classified, Multiple Sites'],
        },
        focus: {
          description: 'Resident has limited physical mobility r/t weakness',
          goals: [
            { description: 'Resident will maintain current level of mobility through the review date.' },
            { description: 'Resident will remain free of complications related to immobility, including contractures, thrombus, skin breakdown, and fall-related injury, through the review date.' },
          ],
          interventions: [
            { description: 'PT/OT evaluation and treatment as per MD orders.', kardexCategory: 'mobility', positions: [9890] },
            { description: 'Encourage resident to participate in activities of daily living to the fullest extent possible.', kardexCategory: 'adl', positions: [9882] },
            { description: 'Monitor/document/report PRN s/sx of immobility: contractures, thrombus formation, skin breakdown.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Provide supportive care and assistance with mobility as needed. Document assistance provided.', kardexCategory: 'mobility', positions: [9882] },
            { description: 'Reposition resident every 2 hours to prevent complications.', kardexCategory: 'mobility', positions: [9882] },
            { description: 'Encourage good nutrition and hydration to promote healing and tissue integrity.', kardexCategory: 'nutrition', positions: [9882] },
            { description: 'Monitor for changes and report decline in function to medical provider.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },

      // ---- Nutrition (partial) -------------------------------------------
      {
        ruleId: 'dx.nutrition_obesity',
        score: 60,
        caa: 'nutrition',
        caaName: 'Nutrition',
        reason: 'Active diagnosis: E66.9 — Obesity, Unspecified',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'diagnosis',
          basisLabel: 'Active diagnosis',
          evidence: ['E66.9 — Obesity, Unspecified'],
        },
        focus: {
          description: 'Resident has nutritional problem or potential nutritional problem r/t obesity',
          goals: [
            { description: 'Resident will not develop complications related to obesity (skin breakdown, ineffective breathing pattern, altered cardiovascular status) through review date.' },
            { description: 'Resident will comply with recommended diet for weight management through review date.' },
          ],
          interventions: [
            { description: 'RD to evaluate and make diet change recommendations as needed.', kardexCategory: 'nutrition', positions: [9888] },
            { description: 'Provide and serve diet as ordered. Monitor intake and record q meal.', kardexCategory: 'nutrition', positions: [9882] },
            { description: 'Monitor for s/sx of dysphagia: pocketing, choking, coughing, drooling.', kardexCategory: 'monitors', positions: [9882] },
            { description: 'Encourage physical activity as tolerated and consistent with mobility status.', kardexCategory: 'mobility', positions: [9882] },
            { description: 'Monitor weight per facility policy; report significant changes to MD.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },

      // ---- Elimination / GI (partial) ------------------------------------
      {
        ruleId: 'order.bowel_regimen',
        score: 58,
        caa: 'elimination_gi',
        caaName: 'Elimination / GI',
        reason: 'Active order: Bisacodyl EC Tablet Delayed Release 5 MG (Bisacodyl) (+4 more)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'order',
          basisLabel: 'Active order',
          evidence: ['Bisacodyl EC Tablet Delayed Release 5 MG (Bisacodyl)', '+4 more'],
        },
        focus: {
          description: 'Resident is on a bowel regimen',
          goals: [
            { description: 'Resident will have a soft, formed bowel movement at the preferred frequency through review date.' },
            { description: 'Resident will be free of complications related to constipation or impaction through review date.' },
          ],
          interventions: [
            { description: 'Administer bowel medications as ordered. Monitor for effectiveness and side effects.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Record bowel movement pattern each day. Describe amount, color, and consistency.', kardexCategory: 'elimination', positions: [9882] },
            { description: 'Monitor for s/sx of impaction or obstruction: distention, abdominal pain, decreased bowel sounds.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Encourage fluid and fiber intake to support natural elimination.', kardexCategory: 'nutrition', positions: [9882] },
            { description: 'Encourage resident to sit on toilet to evacuate bowels if possible.', kardexCategory: 'elimination', positions: [9882] },
            { description: 'Follow facility bowel protocol; notify MD if no BM x3 days or if diarrhea develops.', kardexCategory: 'elimination', positions: [9897] },
            { description: 'Educate resident/family on signs of complications and importance of regular elimination.', kardexCategory: 'education', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'order.acid_suppression',
        score: 56,
        caa: 'elimination_gi',
        caaName: 'Elimination / GI',
        reason: 'Active order: Pantoprazole Sodium Oral Tablet Delayed Release 40 MG (Pantoprazole Sodium)',
        coverageSignal: 'ai_says_missing',
        autoSelect: true,
        rationale: {
          basis: 'order',
          basisLabel: 'Active order',
          evidence: ['Pantoprazole Sodium Oral Tablet Delayed Release 40 MG (Pantoprazole Sodium)'],
        },
        focus: {
          description: 'Resident is on long-term acid-suppression therapy',
          goals: [
            { description: 'Resident will be free of adverse effects related to long-term acid suppression through review date.' },
            { description: 'Resident will receive ongoing review of acid-suppression therapy for appropriateness through review date.' },
          ],
          interventions: [
            { description: 'Administer acid-suppression medications as ordered. Monitor for effectiveness and side effects.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for adverse effects of long-term therapy: bone density loss, increased fracture risk, C. diff.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Pharmacy review for gradual dose reduction (GDR) or discontinuation as appropriate.', kardexCategory: 'medications', positions: [9897] },
            { description: 'Obtain and monitor labs as ordered (magnesium, B12, CBC). Report abnormal results to MD.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Monitor for resolution of acid-related symptoms; document ongoing indication for therapy.', kardexCategory: 'monitors', positions: [9897] },
            { description: 'Educate resident on long-term risks and importance of using only as prescribed.', kardexCategory: 'education', positions: [9897] },
          ],
        },
      },
    ],

    // onPlan: existing focuses already on the care plan. One per partial area
    // (so those shields render partial) + one per covered area (Covered fold).
    onPlan: [
      // ---- partial areas (have toAdd above) ------------------------------
      {
        ruleId: 'order.cardiac_existing',
        focusId: 'pcc-2001',
        focusText: 'Resident has altered cardiovascular status r/t hypertension',
        caa: 'cardiac',
        caaName: 'Cardiac',
        rationale: { basis: 'order', basisLabel: 'Active order', evidence: ['Lisinopril Oral Tablet 10 MG'] },
      },
      {
        ruleId: 'dx.respiratory_existing',
        focusId: 'pcc-2002',
        focusText: 'Resident has altered respiratory status r/t COPD',
        caa: 'respiratory',
        caaName: 'Respiratory',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['J44.9 — COPD, Unspecified'] },
      },
      {
        ruleId: 'universal.infection_existing',
        focusId: 'pcc-2003',
        focusText: 'Resident is at risk for infection r/t indwelling devices',
        caa: 'infection_control',
        caaName: 'Infection Control',
        rationale: { basis: 'standard', basisLabel: 'Standard focus', evidence: [] },
      },
      {
        ruleId: 'dx.pain_existing',
        focusId: 'pcc-2004',
        focusText: 'Resident has chronic pain r/t osteoarthritis',
        caa: 'pain',
        caaName: 'Pain',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['M19.90 — Osteoarthritis, Unspecified'] },
      },
      {
        ruleId: 'dx.adl_existing',
        focusId: 'pcc-2005',
        focusText: 'Resident requires assistance with activities of daily living',
        caa: 'adl_self_care',
        caaName: 'ADL / Self-Care',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['R53.1 — Weakness'] },
      },
      {
        ruleId: 'order.nutrition_existing',
        focusId: 'pcc-2006',
        focusText: 'Resident is on a therapeutic diet',
        caa: 'nutrition',
        caaName: 'Nutrition',
        rationale: { basis: 'order', basisLabel: 'Active order', evidence: ['Diet order: 2 gm sodium, regular texture'] },
      },
      {
        ruleId: 'dx.elimination_existing',
        focusId: 'pcc-2007',
        focusText: 'Resident has potential for altered GI status r/t GERD',
        caa: 'elimination_gi',
        caaName: 'Elimination / GI',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['K21.9 — GERD without esophagitis'] },
      },

      // ---- covered areas (onPlan only, Covered fold) ---------------------
      {
        ruleId: 'universal.falls_safety',
        focusId: 'pcc-3001',
        focusText: 'Resident is at risk for falls',
        caa: 'falls_safety',
        caaName: 'Falls / Safety',
        rationale: { basis: 'assessment', basisLabel: 'Assessment', evidence: ['Morse Fall Scale: high risk'] },
      },
      {
        ruleId: 'universal.activities',
        focusId: 'pcc-3002',
        focusText: 'Resident will participate in activities of choice',
        caa: 'activities',
        caaName: 'Activities',
        rationale: { basis: 'standard', basisLabel: 'Standard focus', evidence: [] },
      },
      {
        ruleId: 'dx.renal',
        focusId: 'pcc-3003',
        focusText: 'Resident has altered renal status r/t chronic kidney disease',
        caa: 'renal',
        caaName: 'Renal',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['N18.3 — CKD, Stage 3'] },
      },
      {
        ruleId: 'universal.hydration',
        focusId: 'pcc-3004',
        focusText: 'Resident is at risk for dehydration',
        caa: 'hydration',
        caaName: 'Hydration',
        rationale: { basis: 'standard', basisLabel: 'Standard focus', evidence: [] },
      },
      {
        ruleId: 'assessment.pressure_ulcer',
        focusId: 'pcc-3005',
        focusText: 'Resident is at risk for skin breakdown',
        caa: 'pressure_ulcer',
        caaName: 'Skin / Pressure Ulcer',
        rationale: { basis: 'assessment', basisLabel: 'Assessment', evidence: ['Braden score: 16 (at risk)'] },
      },
      {
        ruleId: 'dx.visual_function',
        focusId: 'pcc-3006',
        focusText: 'Resident has impaired visual function r/t cataracts',
        caa: 'visual_function',
        caaName: 'Visual Function',
        rationale: { basis: 'diagnosis', basisLabel: 'Active diagnosis', evidence: ['H25.9 — Age-related cataract, unspecified'] },
      },
      {
        ruleId: 'order.bleeding_risk',
        focusId: 'pcc-3007',
        focusText: 'Resident is at risk for bleeding r/t anticoagulant therapy',
        caa: 'bleeding_risk',
        caaName: 'Bleeding Risk',
        rationale: { basis: 'order', basisLabel: 'Active order', evidence: ['Apixaban Oral Tablet 5 MG'] },
      },
      {
        ruleId: 'universal.discharge_planning',
        focusId: 'pcc-3008',
        focusText: 'Resident has discharge planning needs / potential to return to community',
        caa: 'discharge_return',
        caaName: 'Discharge / Return to Community',
        rationale: { basis: 'standard', basisLabel: 'Standard focus', evidence: [] },
      },
    ],

    // Set-aside proposals (opt-in universals). Same shape as a toAdd item.
    skipped: [
      {
        ruleId: 'universal.health_literacy',
        score: 40,
        caa: 'psychosocial',
        caaName: 'Psychosocial',
        reason: 'Standard health-literacy focus (opt-in)',
        coverageSignal: null,
        autoSelect: false,
        rationale: {
          basis: 'standard',
          basisLabel: 'Standard focus',
          evidence: [],
        },
        focus: {
          description: 'Resident may benefit from health-literacy support',
          goals: [
            { description: 'Resident will demonstrate understanding of self-care instructions through review date.' },
          ],
          interventions: [
            { description: 'Assess preferred learning style and reading level.', kardexCategory: 'education', positions: [9897] },
            { description: 'Provide plain-language education materials and confirm comprehension via teach-back.', kardexCategory: 'education', positions: [9897] },
          ],
        },
      },
      {
        ruleId: 'universal.oral_dental_care',
        score: 38,
        caa: 'nutrition',
        caaName: 'Nutrition',
        reason: 'Standard oral / dental care focus (opt-in)',
        coverageSignal: null,
        autoSelect: false,
        rationale: {
          basis: 'standard',
          basisLabel: 'Standard focus',
          evidence: [],
        },
        focus: {
          description: 'Resident has potential for impaired oral/dental health',
          goals: [
            { description: 'Resident will maintain clean, intact oral mucosa through review date.' },
          ],
          interventions: [
            { description: 'Provide or assist with oral care twice daily and as needed.', kardexCategory: 'adl', positions: [9882] },
            { description: 'Monitor for s/sx of oral problems: lesions, bleeding gums, ill-fitting dentures; report to MD/dentist.', kardexCategory: 'monitors', positions: [9897] },
          ],
        },
      },
    ],

    // toRemove: existing focuses whose driving condition resolved / was
    // discontinued. Each carries pccFocusId + pccFocusStdItemId (to resolve in
    // PCC) plus a plain-language `reason`. Drug names are allowed inside the
    // reason (it cites the discontinued order); never inside a stamped
    // intervention. Transcribed from careplan-v8-sidebar-MOCK.html (F[3], F[4]).
    toRemove: [
      {
        focusId: 'pcc-focus-infection',
        pccFocusId: 'pcc-focus-infection',
        pccFocusStdItemId: 'std-infection',
        caa: 'infection_control',
        caaName: 'Infection Control',
        focusText: 'The resident is at risk for infection related to sepsis.',
        reason: 'Resolved. A41.9 sepsis marked resolved 6/25 · Levofloxacin discontinued 6/28. No active infection diagnosis or antibiotic remains — nothing to keep this focus on the plan.',
      },
      {
        focusId: 'pcc-focus-anticoag',
        pccFocusId: 'pcc-focus-anticoag',
        pccFocusStdItemId: 'std-anticoag',
        caa: 'anticoagulation',
        caaName: 'Anticoagulation',
        focusText: 'The resident is on anticoagulant therapy related to atrial fibrillation.',
        reason: 'Discontinued. Apixaban (Eliquis) 5 mg order discontinued 6/29; no active anticoagulant remains.',
      },
    ],

    // toCheck: ambiguous focuses the engine won't auto-remove — nurse's call.
    // Same read-only shape as toRemove plus a `kind` (history_focus) so the UI
    // can label it "your judgment".
    toCheck: [
      {
        focusId: 'pcc-focus-cdiff',
        pccFocusId: 'pcc-focus-cdiff',
        pccFocusStdItemId: 'std-cdiff',
        caa: 'elimination_gi',
        caaName: 'Elimination / GI',
        kind: 'history_focus',
        focusText: 'History of Clostridium difficile colitis.',
        detail: 'Ambiguous — your call. A04.7 resolved 5/30, but the focus is written “history of.” We won’t auto-remove a historical focus; keep it if your policy tracks C. diff history.',
      },
    ],

    // dropped: focuses the AI review+fill pass REMOVED as over-fires before
    // returning the proposal. Today's payload is {ruleId, description, reason}
    // only (no stampable focus) → the ext renders an acknowledge-first "we
    // removed N, tap to confirm" list (never silent). When the backend later
    // ships a full `focus` here, the ext's Re-add path lights up automatically.
    dropped: [
      {
        ruleId: 'dx.multiple_sclerosis',
        description: 'Resident has impaired mobility related to multiple sclerosis',
        reason: 'Over-fired: gabapentin here treats diabetic neuropathy, not MS. No multiple-sclerosis diagnosis on the chart — the pain focus already covers the neuropathy.',
      },
      {
        ruleId: 'universal.activities',
        description: 'Standard activities / recreation focus',
        reason: 'Removed as a blind universal — no dx, order, MDS, or UDA signal indicates an activities need for this resident.',
      },
    ],

    // One entry per care area present in toAdd/onPlan.
    byCAA: [
      // gap (toAdd only)
      { displayName: 'Cognition / Dementia', status: 'gap', toAdd: ['dx.cognition'], toCheck: [], toRemove: [] },
      { displayName: 'Psychosocial', status: 'gap', toAdd: ['universal.adjustment_to_admission', 'dx.social_isolation', 'dx.health_literacy_risk'], toCheck: [], toRemove: [] },
      { displayName: 'Neuro (Stroke / Seizure / Other)', status: 'gap', toAdd: ['order.antiepileptic_therapy', 'dx.neuro_status'], toCheck: [], toRemove: [] },
      { displayName: 'Musculoskeletal', status: 'gap', toAdd: ['dx.musculoskeletal'], toCheck: [], toRemove: [] },
      { displayName: 'Urinary Incontinence', status: 'gap', toAdd: ['dx.bowel_bladder'], toCheck: [], toRemove: [] },
      { displayName: 'Psychotropic Medications', status: 'gap', toAdd: ['order.anti_anxiety_therapy'], toCheck: [], toRemove: [] },

      // partial (toAdd + onPlan)
      { displayName: 'Cardiac', status: 'partial', toAdd: ['dx.cardiac_chf', 'dx.cardiac_afib', 'dx.cardiac_arrhythmia'], toCheck: [], toRemove: [] },
      { displayName: 'Respiratory', status: 'partial', toAdd: ['dx.respiratory_rhinitis'], toCheck: [], toRemove: [] },
      { displayName: 'Infection Control', status: 'partial', toAdd: ['dx.infection_sepsis'], toCheck: [], toRemove: [] },
      { displayName: 'Pain', status: 'partial', toAdd: ['order.opioid_therapy'], toCheck: [], toRemove: [] },
      { displayName: 'ADL / Self-Care', status: 'partial', toAdd: ['dx.adl_mobility'], toCheck: [], toRemove: [] },
      { displayName: 'Nutrition', status: 'partial', toAdd: ['dx.nutrition_obesity'], toCheck: [], toRemove: [] },
      { displayName: 'Elimination / GI', status: 'partial', toAdd: ['order.bowel_regimen', 'order.acid_suppression'], toCheck: [], toRemove: [] },

      // covered (onPlan only)
      { displayName: 'Falls / Safety', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Activities', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Renal', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Hydration', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Skin / Pressure Ulcer', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Visual Function', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Bleeding Risk', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
      { displayName: 'Discharge / Return to Community', status: 'covered', toAdd: [], toCheck: [], toRemove: [] },
    ],

    assessmentLinkages: [
      { concept: 'braden', label: 'Skin integrity / pressure-injury risk', source: 'uda', sourceLabel: 'Braden 16', fired: true, status: 'covered', matchedFocus: 'Resident is at risk for skin breakdown', caa: 'pressure_ulcer' },
      { concept: 'morse', label: 'Fall risk', source: 'uda', sourceLabel: 'Morse Fall Scale: high', fired: true, status: 'covered', matchedFocus: 'Resident is at risk for falls', caa: 'falls_safety' },
      { concept: 'phq9', label: 'Mood / depression risk', source: 'mds', sourceLabel: 'PHQ-9: 12 (moderate)', fired: true, status: 'gap', matchedFocus: null, caa: 'psychosocial' },
      { concept: 'bims', label: 'Cognitive status', source: 'mds', sourceLabel: 'BIMS: 9 (moderate impairment)', fired: true, status: 'gap', matchedFocus: null, caa: 'cognition' },
    ],
  },
};

export default fixture;

if (typeof window !== 'undefined') {
  window.CarePlanV2MockAudit = fixture;
}
