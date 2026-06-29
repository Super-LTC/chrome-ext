/**
 * i8000-mock.js — a realistic GET /api/extension/mds/sections/I/i8000 envelope
 * (with ?include=evidence) for previewing the overlay on a live PCC Section I
 * page BEFORE the backend endpoint deploys.
 *
 * Activated by appending ?i8000=mock to the MDS page URL. Shapes follow
 * docs/plans/2026-06-28-section-i-i8000-overlay-contract.md. Evidence objects
 * use the field names renderEvidenceCard() understands (sourceType, displayName,
 * quoteText, rationale, effectiveDate).
 *
 * Fields A–D get audit verdicts so badges land on the first four #I8000{A–D}
 * wrappers; the rest of a real page's entered codes simply go un-audited.
 */

const ev = (sourceType, displayName, effectiveDate, quoteText, rationale) => ({
  sourceType,
  displayName,
  effectiveDate,
  quoteText,
  rationale,
});

export const I8000_MOCK_ENVELOPE = {
  success: true,
  state: 'ok',
  assessment: {
    id: 'mock-assess',
    patientId: 'mock-patient',
    ardDate: '2026-05-15',
    externalAssessmentId: 'mock-ext',
  },
  i8000: {
    runId: 'mock-run',
    solvedAt: '2026-06-28T12:00:00.000Z',
    stale: false,
    summary: {
      enteredCount: 4,
      agreeCount: 1,
      disagreeCount: 1,
      outsideScopeCount: 2,
      suggestedCount: 2,
      potentialNtaPoints: 4,
      slotsAvailable: 6,
    },

    auditedExisting: [
      {
        field: 'I8000A',
        enteredCode: 'J432',
        enteredDisplay: 'J43.2 Centrilobular emphysema',
        verdict: 'agree',
        categoryKey: 'NTA:50',
        reason: 'Maps to PDPM category Pulmonary Fibrosis & Other Chronic Lung Disorders; pulmonology note + home-O2 order substantiate an active diagnosis.',
        result: {
          status: 'code',
          confidence: 'high',
          kbCategory: { categoryName: 'Pulmonary Fibrosis and Other Chronic Lung Disorders' },
          primaryIcd10: 'J43.2',
          recommendedIcd10: [{ code: 'J43.2', description: 'Centrilobular emphysema' }],
          pdpmImpact: { ntaPoints: 1 },
          diagnosisPassed: true,
          activeStatusPassed: true,
          diagnosisSummary: 'Pulmonology note (5/02) documents centrilobular emphysema.',
          treatmentSummary: 'Home oxygen 2L via nasal cannula; tiotropium daily.',
          rationale: 'Active, physician-documented chronic lung disease with ongoing oxygen + bronchodilator therapy in the look-back window.',
          evidence: [
            ev('progress-note', 'Pulmonology Note', '2026-05-02', 'Centrilobular emphysema, stable on home O2 and tiotropium.', 'Physician documents the diagnosis.'),
            ev('order', 'O2 Order', '2026-05-03', 'Oxygen 2L/min via NC, continuous.', 'Active treatment in look-back.'),
          ],
        },
      },
      {
        field: 'I8000B',
        enteredCode: 'J84112',
        enteredDisplay: 'J84.112 Idiopathic pulmonary fibrosis',
        verdict: 'disagree',
        categoryKey: 'NTA:50',
        reason: 'Same PDPM category already credited by J43.2 (A); no independent treatment found for IPF specifically — duplicate, no added points.',
        result: {
          status: 'needs_review',
          confidence: 'low',
          kbCategory: { categoryName: 'Pulmonary Fibrosis and Other Chronic Lung Disorders' },
          recommendedIcd10: [{ code: 'J84.112', description: 'Idiopathic pulmonary fibrosis' }],
          pdpmImpact: { ntaPoints: 0 },
          reviewReason: 'duplicate_category',
          diagnosisPassed: true,
          activeStatusPassed: false,
          treatmentEvidence: [],
          rationale: 'Category already satisfied by another entered code; thin independent treatment evidence.',
          evidence: [],
        },
      },
      {
        field: 'I8000C',
        enteredCode: 'R627',
        enteredDisplay: 'R62.7 Adult failure to thrive',
        verdict: 'outside_scope',
        categoryKey: null,
        reason: 'Valid ICD-10 but not one of the 30 PDPM I8000 categories.',
        result: null,
      },
      {
        field: 'I8000D',
        enteredCode: 'Z77090',
        enteredDisplay: 'Z77.090 Contact with / exposure to asbestos',
        verdict: 'outside_scope',
        categoryKey: null,
        reason: 'Exposure/status Z-code; not a PDPM I8000 paying category.',
        result: null,
      },
    ],

    suggestedMissing: [
      {
        categoryKey: 'NTA:36',
        categoryName: 'Aseptic Necrosis of Bone',
        component: 'NTA',
        ntaPoints: 3,
        result: {
          status: 'needs_physician_query',
          confidence: 'medium',
          kbCategory: { categoryName: 'Aseptic Necrosis of Bone' },
          recommendedIcd10: [{ code: 'M87.059', description: 'Idiopathic aseptic necrosis of unspecified femur' }],
          pdpmImpact: { ntaPoints: 3 },
          diagnosisPassed: false,
          activeStatusPassed: true,
          queryReason: 'Imaging suggests AVN of the femoral head, but no physician diagnosis is on the chart. A query would let you code it.',
          keyFindings: ['MRI 5/10: subchondral collapse, left femoral head', 'Ortho consult ordered'],
          diagnosisSummary: 'No physician-documented diagnosis yet.',
          treatmentSummary: 'Protected weight-bearing; PT consult; scheduled ortho follow-up.',
          rationale: 'Active treatment present; diagnosis undocumented → physician query, not direct coding.',
          evidence: [
            ev('document', 'MRI Left Hip', '2026-05-10', 'Findings compatible with avascular necrosis, femoral head, with early subchondral collapse.', 'Imaging supports AVN.'),
            ev('order', 'PT Consult', '2026-05-11', 'Protected weight-bearing, gait training.', 'Active management.'),
          ],
        },
      },
      {
        categoryKey: 'NTA:41',
        categoryName: 'Diabetic Retinopathy',
        component: 'NTA',
        ntaPoints: 1,
        result: {
          status: 'code',
          confidence: 'high',
          kbCategory: { categoryName: 'Diabetic Retinopathy' },
          primaryIcd10: 'E11.319',
          recommendedIcd10: [{ code: 'E11.319', description: 'Type 2 DM w/ unspecified diabetic retinopathy w/o macular edema' }],
          pdpmImpact: { ntaPoints: 1 },
          diagnosisPassed: true,
          activeStatusPassed: true,
          diagnosisSummary: 'Ophthalmology note (6/14) documents NPDR, both eyes.',
          treatmentSummary: 'Type 2 DM on insulin; ophthalmology monitoring.',
          rationale: 'Physician-documented diabetic retinopathy with active diabetes management — codeable into an open I8000 slot.',
          evidence: [
            ev('progress-note', 'Ophthalmology Note', '2026-06-14', 'Mild non-proliferative diabetic retinopathy noted OU on dilated exam.', 'Physician documents the diagnosis.'),
            ev('lab_result', 'Lab — HbA1c', '2026-06-01', 'HbA1c 8.2% (H)', 'Supports active diabetes.'),
          ],
        },
      },
    ],
  },
};
