/**
 * Mock chrome.runtime.sendMessage for demo environment.
 *
 * Supports both Promise and callback patterns:
 *   - await chrome.runtime.sendMessage(msg)        → returns Promise
 *   - chrome.runtime.sendMessage(msg, callback)    → calls callback(response)
 *
 * Routes API_REQUEST messages to demo mock data.
 */
import { DEMO_API_RESPONSES } from './demo-mock-data.js';
import { SECTION_I_DETAIL } from './demo-section-i-fixtures.js';
import { buildPlannerWeekEvents, buildPlannerSummary } from './demo-planner-fixtures.js';
import {
  DEMO_GG_DETAIL_BY_PATIENT,
  buildReportList,
  buildReportForDate,
} from './demo-qm-fixtures.js';
import {
  DEMO_QM_BOARD,
  DEMO_QM_FIVE_STAR,
  DEMO_QM_DFS,
  DEMO_QM_GG_DASHBOARD,
  DEMO_QM_GG_AIDE_LIST,
  DEMO_QM_GG_AIDE_DETAIL,
} from './demo-qm-real-fixtures.js';
import {
  FTAG_MODULE_STATUS,
  buildFtagFindings,
  buildFtagMar,
  buildFtagVitals,
} from './demo-ftag-fixtures.js';

/** In-memory schedule hour for the 24hr report settings demo. */
let demo24hrScheduleHour = 3;

/**
 * Demo UDA fixture — mirrors the structure the extension UDA viewer expects
 * (see handoff: chrome-ext-uda-viewer-handoff.md). The Nutrition Assessment
 * example matches the web popover screenshot so the highlight + scroll UX
 * can be reviewed end-to-end without a live backend.
 */
const DEMO_UDA_FIXTURES = {
  'demo-nutrition-v3': {
    id: 'demo-nutrition-v3',
    description: 'Nutrition Assessment - V 3',
    date: '2026-02-27',
    type: 'Admission',
    category: 'Nutrition',
    createdBy: 'skim.rd',
    lockedDate: '2026-02-27',
    answers: {
      assessmentId: 'demo-nutrition-v3',
      title: 'Nutrition Assessment - V 3',
      metadata: {
        resident: 'Doe, Jane',
        description: 'Nutrition Assessment - V 3',
        date: '2026-02-27',
      },
      sections: [
        {
          sectionCode: 'NUTR',
          description: 'Nutrition Assessment - V 3',
          signedBy: 'Sarah Kim, RD, LD',
          signedDate: '2026-02-27',
          content: [
            {
              sectionNumber: '1',
              sectionTitle: 'Relevant Medications & Diagnoses',
              questions: [
                {
                  questionId: 'q1',
                  questionText: 'Existing diagnosis of Protein/Calorie Malnutrition? (NTA point)',
                  answerType: 'radio',
                  options: [
                    { value: 'yes', text: 'Yes', selected: true },
                    { value: 'no', text: 'No', selected: false },
                  ],
                },
              ],
            },
            {
              sectionNumber: '2',
              sectionTitle: 'Identification of Risk Indicators',
              questions: [
                {
                  questionId: 'q2',
                  questionText: 'Are there current lab values (<60 days)?',
                  answerType: 'radio',
                  options: [
                    { value: 'yes', text: 'Yes', selected: true },
                    { value: 'no', text: 'No', selected: false },
                  ],
                },
                {
                  questionId: 'q2b',
                  questionText: 'Albumin (most recent)',
                  answerType: 'text',
                  value: '2.9 g/dL (Low)',
                },
                {
                  questionId: 'q2c',
                  questionText: 'Prealbumin (most recent)',
                  answerType: 'text',
                  value: '12 mg/dL (Low)',
                },
              ],
            },
            {
              sectionNumber: '3',
              sectionTitle: 'Enteral Feeding/IV Fluids',
              questions: [
                {
                  questionId: 'q3',
                  questionText: 'Did the resident have IV Hydration in Lookback period? (MDS Section K)',
                  answerType: 'radio',
                  options: [
                    { value: 'yes', text: 'Yes', selected: true },
                    { value: 'no', text: 'No', selected: false },
                  ],
                },
              ],
            },
            {
              sectionNumber: '4',
              sectionTitle: 'Nutrient Needs',
              questions: [
                {
                  questionId: 'q4',
                  questionText: 'Nutrition Needs Computed?',
                  answerType: 'radio',
                  options: [
                    { value: 'yes', text: 'Yes', selected: true },
                    { value: 'no', text: 'No', selected: false },
                  ],
                },
                {
                  questionId: 'q4b',
                  questionText: 'Estimated caloric needs',
                  answerType: 'text',
                  value: '1600–1800 kcal/day',
                },
                {
                  questionId: 'q4c',
                  questionText: 'Estimated protein needs',
                  answerType: 'text',
                  value: '65–80 g/day',
                },
              ],
            },
            {
              sectionNumber: '5',
              sectionTitle: 'Dietitian Recommendations',
              questions: [
                {
                  questionId: 'q5',
                  questionText: 'Recommended interventions',
                  answerType: 'textarea',
                  value: 'Fortified foods, Ensure Plus BID with meals, weekly weights, re-evaluate in 1 week.',
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

/**
 * Simple match-keys builder — if the quote appears in an option text or value,
 * return the index-path keys so the viewer can highlight the row.
 */
function buildDemoMatchKeys(uda, quote) {
  if (!quote || !uda?.answers) return [];
  const keys = [];
  const needle = quote.toLowerCase();
  uda.answers.sections.forEach((section, s) => {
    section.content.forEach((content, c) => {
      content.questions.forEach((question, q) => {
        const qKey = `${s}:${c}:${q}`;
        const label = question.questionText?.toLowerCase() || '';
        if (question.value && needle.includes(question.value.toLowerCase())) {
          keys.push(qKey);
          return;
        }
        if (label && needle.includes(label)) {
          // Whole-question label match — highlight via value key
          keys.push(qKey);
          return;
        }
        question.options?.forEach((option, o) => {
          if (option.selected && needle.includes(option.text.toLowerCase())) {
            keys.push(`${qKey}:${o}`);
          }
        });
      });
    });
  });
  return keys;
}

function buildUdaResponse(udaId, quote) {
  const uda = DEMO_UDA_FIXTURES[udaId];
  if (!uda) {
    return { success: false, error: `Demo: no UDA fixture for ${udaId}` };
  }
  // For the canned nutrition demo, hard-code the 4 matching rows the screenshot
  // shows so the highlight + scroll UX lands cleanly.
  const hardcodedMatchKeys =
    udaId === 'demo-nutrition-v3' ? ['0:0:0:0', '0:1:0:0', '0:2:0:0', '0:3:0:0'] : [];
  const matchKeys = quote ? (hardcodedMatchKeys.length ? hardcodedMatchKeys : buildDemoMatchKeys(uda, quote)) : [];
  return {
    success: true,
    data: {
      uda,
      matchKeys,
    },
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return delay(50 + Math.random() * 150);
}

/**
 * Route an API_REQUEST to the appropriate mock data
 */
function routeApiRequest(endpoint, options = {}) {
  // Strip query string for pattern matching, keep params for keyed lookups
  const [path, queryString] = endpoint.split('?');
  const params = new URLSearchParams(queryString || '');

  // /api/extension/mds/dashboard
  if (path === '/api/extension/mds/dashboard') {
    return { success: true, data: DEMO_API_RESPONSES.dashboard };
  }

  // /api/extension/mds/doc-risks
  if (path === '/api/extension/mds/doc-risks') {
    return { success: true, data: DEMO_API_RESPONSES.docRisks };
  }

  // /api/extension/mds/ard-recommendation
  if (path === '/api/extension/mds/ard-recommendation') {
    return { success: true, data: DEMO_API_RESPONSES.ardRecommendation };
  }

  // /api/extension/mds/pdpm-potential
  if (path === '/api/extension/mds/pdpm-potential') {
    const assessmentId = params.get('externalAssessmentId');
    const data = DEMO_API_RESPONSES.pdpmPotential[assessmentId];
    if (data) return { success: true, data };
    return { success: false, error: `No PDPM data for assessment ${assessmentId}` };
  }

  // /api/extension/patients/{patientId}/assessments
  const patientAssessmentsMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/assessments/);
  if (patientAssessmentsMatch) {
    const patientId = patientAssessmentsMatch[1];
    const data = DEMO_API_RESPONSES.patientAssessments[patientId];
    if (data) return { success: true, data };
    return { success: false, error: `No assessments for patient ${patientId}` };
  }

  // /api/extension/patients/{patientId}/diagnoses/status-overview
  // Powers the medical-diagnosis page augment (shield + query chips).
  const statusOverviewMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/diagnoses\/status-overview/);
  if (statusOverviewMatch) {
    const daysAgo = (n) => new Date(Date.now() - n * 86400 * 1000).toISOString();
    return {
      success: true,
      data: {
        diagnoses: [
          { code: 'J44.9', description: 'Chronic obstructive pulmonary disease, unspecified',
            queryable: true,
            carePlanStatus: {
              status: 'covered',
              matchedFocus: { focusText: 'DX: Respiratory status r/t COPD AEB use of bronchodilators',
                              focusId: 'f-001', isResolved: false },
              matchedInterventionId: 'i-001',
              reason: 'Fully covered — Respiratory Status focus with tiotropium daily + albuterol q4h PRN and SpO2 monitoring interventions linked.',
            },
            queryHistory: { hasOutstanding: false, lastSignedAt: daysAgo(45),
                            daysSinceLastSigned: 45, totalCount: 1, recentQueries: [] },
          },
          { code: 'J43.1', description: 'Panlobular emphysema',
            queryable: true,
            carePlanStatus: {
              status: 'covered',
              matchedFocus: { focusText: 'DX: Respiratory status r/t COPD AEB use of bronchodilators',
                              focusId: 'f-001', isResolved: false },
              matchedInterventionId: 'i-101',
              reason: 'Covered under the same Respiratory Status focus as J44.9. Bronchodilator and SpO2 monitoring interventions apply.',
            },
            queryHistory: { hasOutstanding: false, lastSignedAt: daysAgo(45),
                            daysSinceLastSigned: 45, totalCount: 1, recentQueries: [] },
          },
          { code: 'E66.01', description: 'Morbid (severe) obesity due to excess calories',
            queryable: true,
            carePlanStatus: {
              status: 'missing',
              matchedFocus: null, matchedInterventionId: null,
              reason: 'No care-plan focus addresses morbid obesity. Add a nutrition / weight-management focus to close the gap.',
            },
            queryHistory: { hasOutstanding: true, pendingCount: 1, sentCount: 0, totalCount: 1,
                            recentQueries: [{ id: 'q-100', mdsItem: 'I8000:NTA:E66', status: 'sent',
                                              sentAt: daysAgo(2), subject: 'Confirm morbid obesity active' }] },
          },
          { code: 'F10.239', description: 'Alcohol dependence with withdrawal, unspecified',
            queryable: false,
            carePlanStatus: {
              status: 'covered',
              matchedFocus: { focusText: 'DX: Substance use r/t alcohol dependence AEB CIWA monitoring',
                              focusId: 'f-002', isResolved: false },
              matchedInterventionId: 'i-201',
              reason: 'Active care plan with CIWA-Ar protocol q4h × 72hr.',
            },
            queryHistory: null,
          },
          { code: 'I10', description: 'Essential (primary) hypertension',
            queryable: false,
            carePlanStatus: {
              status: 'covered',
              matchedFocus: { focusText: 'DX: Cardiovascular status r/t HTN AEB lisinopril',
                              focusId: 'f-003', isResolved: false },
              matchedInterventionId: 'i-301',
              reason: 'BP q-shift + lisinopril 10 mg daily intervention linked.',
            },
            queryHistory: null,
          },
          { code: 'G47.33', description: 'Obstructive sleep apnea (adult) (pediatric)',
            queryable: true,
            carePlanStatus: {
              status: 'partial',
              matchedFocus: { focusText: 'DX: Sleep r/t OSA AEB CPAP use', focusId: 'f-004', isResolved: false },
              matchedInterventionId: null,
              reason: 'Focus exists but no CPAP-tolerance assessment intervention.',
            },
            queryHistory: { hasOutstanding: false, lastSignedAt: daysAgo(85),
                            daysSinceLastSigned: 85, totalCount: 1, recentQueries: [] },
          },
          { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications',
            queryable: true,
            carePlanStatus: {
              status: 'covered',
              matchedFocus: { focusText: 'DX: Endocrine r/t Type 2 DM AEB metformin & A1c monitoring',
                              focusId: 'f-005', isResolved: false },
              matchedInterventionId: 'i-501',
              reason: 'Comprehensive DM care plan: BG checks AC/HS, metformin 500 mg BID, dietary consult.',
            },
            queryHistory: { hasOutstanding: true, pendingCount: 0, sentCount: 1, totalCount: 1,
                            recentQueries: [{ id: 'q-101', mdsItem: 'I8000:NTA:E11', status: 'sent',
                                              sentAt: daysAgo(1), subject: 'Specify DM complications (PVD, retinopathy?)' }] },
          },
          { code: 'I82.513', description: 'Chronic embolism and thrombosis of femoral vein, bilateral',
            queryable: false,
            carePlanStatus: {
              status: 'missing',
              matchedFocus: null, matchedInterventionId: null,
              reason: 'No focus addresses VTE. Consider adding anticoagulation monitoring focus.',
            },
            queryHistory: null,
          },
          { code: 'G47.00', description: 'Insomnia, unspecified',
            queryable: false,
            carePlanStatus: {
              status: 'missing',
              matchedFocus: null, matchedInterventionId: null,
              reason: 'No focus for insomnia. Consider non-pharm sleep hygiene interventions before adding hypnotic.',
            },
            queryHistory: null,
          },
        ],
      },
    };
  }

  // /api/extension/patients/{patientId}/coverage/summary
  const coverageSummaryMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/coverage\/summary/);
  if (coverageSummaryMatch) {
    return {
      success: true,
      data: {
        score: 78,
        diagnosisCovered: 9,
        diagnosisTotal: 12,
        orderCovered: 18,
        orderTotal: 22,
        hasResults: true,
        checkedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        pendingChanges: { newDiagnoses: 2, newOrders: 1 },
        gaps: [
          { type: 'diagnosis', status: 'missing', code: 'I50.9', description: 'Heart failure, unspecified',
            reason: 'New diagnosis added 2026-01-12 — no matching focus/intervention in care plan.' },
          { type: 'diagnosis', status: 'missing', code: 'E11.51', description: 'Type 2 diabetes mellitus with diabetic peripheral angiopathy',
            reason: 'Endocrinology consult note 2026-01-13 documents PVD with DM; care plan only addresses uncomplicated DM.' },
          { type: 'diagnosis', status: 'partial', code: 'J44.9', description: 'COPD, unspecified',
            matchedFocus: 'Respiratory status', matchedIntervention: 'Monitor SpO2 q-shift',
            reason: 'Focus exists but missing bronchodilator administration intervention.' },
          { type: 'order', status: 'missing', code: 'RX', description: 'Vancomycin 1g IV q12h',
            reason: 'New IV antibiotic ordered 2026-01-12 — no infection-control or IV-site monitoring intervention.' },
          { type: 'order', status: 'missing', code: 'DIET', description: 'Mechanically altered diet — puree',
            reason: 'Diet order updated 2026-01-11; nutrition focus not updated for aspiration risk.' },
          { type: 'order', status: 'partial', code: 'PT/OT', description: 'Therapy 5×/week',
            matchedFocus: 'Functional mobility', matchedIntervention: 'Bed mobility assist',
            reason: 'PT plan covers mobility but no transfer training documented in care plan.' },
        ],
        covered: [
          { type: 'diagnosis', status: 'covered', code: 'I10', description: 'Essential hypertension',
            matchedFocus: 'Cardiovascular status', matchedIntervention: 'BP q-shift, Lisinopril 10 mg daily' },
          { type: 'diagnosis', status: 'covered', code: 'I25.10', description: 'Atherosclerotic heart disease without angina pectoris',
            matchedFocus: 'Cardiovascular status', matchedIntervention: 'Aspirin 81 mg, Atorvastatin 40 mg HS' },
          { type: 'diagnosis', status: 'covered', code: 'F32.9', description: 'Major depressive disorder, unspecified',
            matchedFocus: 'Mood', matchedIntervention: 'Sertraline 50 mg daily; PHQ-9 weekly' },
          { type: 'order', status: 'covered', code: 'FALL', description: 'Fall precautions',
            matchedFocus: 'Fall risk', matchedIntervention: 'Bed alarm; non-skid socks; Q2h rounding' },
          { type: 'order', status: 'covered', code: 'SKIN', description: 'Skin assessment q-shift',
            matchedFocus: 'Skin integrity', matchedIntervention: 'Braden q-shift; turn q2h' },
        ],
      },
    };
  }

  const coverageChangesMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/coverage\/changes/);
  if (coverageChangesMatch) {
    return {
      success: true,
      data: {
        changes: [
          { date: '2026-01-13', type: 'diagnosis_added', code: 'E11.51',
            description: 'Type 2 diabetes mellitus with diabetic peripheral angiopathy', source: 'MD Progress Note' },
          { date: '2026-01-12', type: 'diagnosis_added', code: 'I50.9',
            description: 'Heart failure, unspecified', source: 'Cardiology Consult' },
          { date: '2026-01-12', type: 'order_added', code: 'RX',
            description: 'Vancomycin 1g IV q12h × 7 days', source: 'Hospitalist Order' },
        ],
      },
    };
  }

  // /api/patients/{patientId}/care-plans/check (POST trigger)
  if (path.match(/\/api\/patients\/[^/]+\/care-plans\/check/)) {
    return { success: true, data: { triggered: true } };
  }

  // /api/extension/compliance/dashboard family (used by Coverage tabs).
  // Trending endpoint returns sparkline series; main dashboard returns the
  // facility-wide patient list with score buckets so ComplianceView can
  // render attention groups + drill-in.
  if (path.startsWith('/api/extension/compliance/dashboard/trending')) {
    return {
      success: true,
      data: {
        sparklines: {
          // 7-day score history per patient (most recent last)
          '2657226': [62, 65, 68, 70, 73, 76, 78],
          'p-aldridge':  [88, 88, 89, 89, 88, 87, 87],
          'p-cho':       [55, 60, 62, 64, 66, 68, 70],
          'p-grisham':   [82, 80, 78, 75, 72, 70, 68],  // declining
          'p-novak':     [90, 88, 85, 82, 78, 74, 70],  // declining sharply
          'p-reyes':     [94, 94, 95, 95, 95, 95, 95],
        },
      },
    };
  }
  if (path.startsWith('/api/extension/compliance/dashboard/history')) {
    return { success: true, data: { history: [] } };
  }
  if (path.startsWith('/api/extension/compliance/dashboard')) {
    return {
      success: true,
      data: {
        summary: {
          patientsChecked: 24,
          totalPatients: 28,
          patientsStale: 3,
          avgScore: 81,
        },
        patients: [
          { patientId: '2657226', patientName: 'Doe, Jane', levelOfCare: 'Skilled',
            overallScore: 78, hasResults: true, stale: false,
            diagnosisCovered: 9, diagnosisTotal: 12, diagnosisMissing: 2, diagnosisPartial: 1,
            orderCovered: 18, orderTotal: 22, orderMissing: 2, orderPartial: 2,
            lastCheckedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
          { patientId: 'p-aldridge', patientName: 'Aldridge, Robert', levelOfCare: 'LTC',
            overallScore: 87, hasResults: true, stale: false,
            diagnosisCovered: 13, diagnosisTotal: 15, diagnosisMissing: 1, diagnosisPartial: 1,
            orderCovered: 20, orderTotal: 22, orderMissing: 1, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString() },
          { patientId: 'p-cho', patientName: 'Cho, Lillian', levelOfCare: 'Skilled',
            overallScore: 70, hasResults: true, stale: false,
            diagnosisCovered: 7, diagnosisTotal: 10, diagnosisMissing: 2, diagnosisPartial: 1,
            orderCovered: 14, orderTotal: 18, orderMissing: 3, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 22 * 3600 * 1000).toISOString() },
          { patientId: 'p-grisham', patientName: 'Grisham, Henry', levelOfCare: 'LTC',
            overallScore: 68, hasResults: true, stale: false,
            diagnosisCovered: 8, diagnosisTotal: 14, diagnosisMissing: 4, diagnosisPartial: 2,
            orderCovered: 12, orderTotal: 16, orderMissing: 3, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString() },
          { patientId: 'p-novak', patientName: 'Novak, Eleanor', levelOfCare: 'Skilled',
            overallScore: 70, hasResults: true, stale: false,
            diagnosisCovered: 9, diagnosisTotal: 13, diagnosisMissing: 3, diagnosisPartial: 1,
            orderCovered: 13, orderTotal: 18, orderMissing: 4, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString() },
          { patientId: 'p-reyes', patientName: 'Reyes, Marcus', levelOfCare: 'LTC',
            overallScore: 95, hasResults: true, stale: false,
            diagnosisCovered: 14, diagnosisTotal: 14, diagnosisMissing: 0, diagnosisPartial: 1,
            orderCovered: 19, orderTotal: 20, orderMissing: 0, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() },
          { patientId: 'p-okafor', patientName: 'Okafor, Adaeze', levelOfCare: 'Skilled',
            overallScore: 92, hasResults: true, stale: false,
            diagnosisCovered: 11, diagnosisTotal: 12, diagnosisMissing: 1, diagnosisPartial: 0,
            orderCovered: 17, orderTotal: 18, orderMissing: 0, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 11 * 3600 * 1000).toISOString() },
          { patientId: 'p-singh', patientName: 'Singh, Pari', levelOfCare: 'LTC',
            overallScore: 84, hasResults: true, stale: false,
            diagnosisCovered: 11, diagnosisTotal: 13, diagnosisMissing: 1, diagnosisPartial: 1,
            orderCovered: 17, orderTotal: 20, orderMissing: 2, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 19 * 3600 * 1000).toISOString() },
          // Stale (haven't been checked in > 5 days)
          { patientId: 'p-mendez', patientName: 'Mendez, Carlos', levelOfCare: 'LTC',
            overallScore: 71, hasResults: true, stale: true,
            diagnosisCovered: 8, diagnosisTotal: 12, diagnosisMissing: 3, diagnosisPartial: 1,
            orderCovered: 13, orderTotal: 17, orderMissing: 3, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString() },
          { patientId: 'p-byrd',   patientName: 'Byrd, Eunice',  levelOfCare: 'LTC',
            overallScore: 79, hasResults: true, stale: true,
            diagnosisCovered: 10, diagnosisTotal: 13, diagnosisMissing: 2, diagnosisPartial: 1,
            orderCovered: 16, orderTotal: 19, orderMissing: 2, orderPartial: 1,
            lastCheckedAt: new Date(Date.now() - 9 * 86400 * 1000).toISOString() },
          // Unchecked (new admits, no results yet)
          { patientId: 'p-park',   patientName: 'Park, Hyun',     levelOfCare: 'Skilled',
            overallScore: 0, hasResults: false, stale: false,
            diagnosisCovered: 0, diagnosisTotal: 0, diagnosisMissing: 0, diagnosisPartial: 0,
            orderCovered: 0, orderTotal: 0, orderMissing: 0, orderPartial: 0,
            lastCheckedAt: null },
          { patientId: 'p-hassan', patientName: 'Hassan, Layla',  levelOfCare: 'Skilled',
            overallScore: 0, hasResults: false, stale: false,
            diagnosisCovered: 0, diagnosisTotal: 0, diagnosisMissing: 0, diagnosisPartial: 0,
            orderCovered: 0, orderTotal: 0, orderMissing: 0, orderPartial: 0,
            lastCheckedAt: null },
        ],
      },
    };
  }

  // /api/extension/mds/items/{code}
  const itemDetailMatch = path.match(/\/api\/extension\/mds\/items\/([^/]+)/);
  if (itemDetailMatch) {
    const code = decodeURIComponent(itemDetailMatch[1]);
    // Canonical Section I fixtures win (correct codes/names/evidence); fall back
    // to the legacy itemDetail map for other surfaces (e.g. Command Center).
    const data = SECTION_I_DETAIL[code] || DEMO_API_RESPONSES.itemDetail[code];
    if (data) return { success: true, data };
    // Return a generic response for unknown items
    return {
      success: true,
      data: {
        item: { mdsItem: code, itemName: code, description: `MDS Item ${code}`, status: 'dont_code', evidence: [] },
        diagnosisSummary: null,
        treatmentSummary: null
      }
    };
  }

  // /api/extension/mds/queryable-items
  if (path === '/api/extension/mds/queryable-items') {
    return { success: true, data: DEMO_API_RESPONSES.queryableItems };
  }

  // /api/extension/mds/queryable-items/batch-generate (POST)
  if (path === '/api/extension/mds/queryable-items/batch-generate') {
    return { success: true, data: { generated: true } };
  }

  // /api/extension/practitioners
  if (path === '/api/extension/practitioners') {
    return { success: true, data: DEMO_API_RESPONSES.practitioners };
  }

  // ── Certification routes ──

  // /api/extension/certifications/dashboard
  if (path === '/api/extension/certifications/dashboard') {
    return { success: true, data: DEMO_API_RESPONSES.certDashboard };
  }

  // /api/extension/certifications/practitioners
  if (path === '/api/extension/certifications/practitioners') {
    return { success: true, data: DEMO_API_RESPONSES.practitioners };
  }

  // /api/extension/certifications/by-patient
  if (path === '/api/extension/certifications/by-patient') {
    const patientId = params.get('patientId');
    const all = DEMO_API_RESPONSES.certifications || [];
    const filtered = patientId ? all.filter(c => c.patientId === patientId) : all;
    return { success: true, data: { certifications: filtered } };
  }

  // /api/extension/certifications/:id/sends
  const certSendsMatch = path.match(/\/api\/extension\/certifications\/([^/]+)\/sends/);
  if (certSendsMatch) {
    return {
      success: true,
      data: [{
        id: 'send-1',
        certId: certSendsMatch[1],
        sentAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        practitioner: { name: 'Dr. Demo Provider' },
        method: 'fax'
      }]
    };
  }

  // /api/extension/certifications/:id/(send|skip|delay|edit-reason|unskip)
  const certActionMatch = path.match(/\/api\/extension\/certifications\/([^/]+)\/(send|skip|delay|edit-reason|unskip)/);
  if (certActionMatch) {
    return { success: true, data: { certId: certActionMatch[1], action: certActionMatch[2] } };
  }

  // /api/extension/certifications (list)
  if (path === '/api/extension/certifications') {
    const status = params.get('status');
    const all = DEMO_API_RESPONSES.certifications || [];
    const filtered = status ? all.filter(c => c.status === status) : all;
    return { success: true, data: { certifications: filtered } };
  }

  // ── Planner routes ──

  if (path === '/api/extension/planner/week-events') {
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    if (!startDate || !endDate) {
      return { success: false, error: 'Missing required param: startDate or endDate' };
    }
    return {
      success: true,
      data: {
        events: buildPlannerWeekEvents(startDate),
        meta: {
          facilityName: params.get('facilityName') || 'Demo Facility',
          startDate,
          endDate,
          generatedAt: new Date().toISOString(),
        },
      },
    };
  }

  if (path === '/api/extension/planner/summary') {
    return {
      success: true,
      data: {
        summary: buildPlannerSummary(),
        meta: { generatedAt: new Date().toISOString() },
      },
    };
  }

  // /api/extension/documents/:id (PDF prefetch for ItemPopover)
  const docMatch = path.match(/\/api\/extension\/documents\/([^/]+)/);
  if (docMatch) {
    return {
      success: true,
      data: {
        document: {
          id: docMatch[1],
          title: 'Clinical Document',
          documentType: 'Progress Note',
          effectiveDate: '2026-01-22',
          fileSize: 245760,
          signedUrl: null // No real PDF in demo — viewer will show empty state
        }
      }
    };
  }

  // /api/extension/patients/:patientId/uda/:udaId
  const udaMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/uda\/([^/]+)/);
  if (udaMatch) {
    const udaId = udaMatch[2];
    const quote = params.get('quote') || null;
    return buildUdaResponse(udaId, quote);
  }

  // ── QM Board routes ─────────────────────────────────────────────
  // Real captured payloads (anonymized) — see demo-qm-real-fixtures.js. The hooks
  // call unwrap(res.data); each fixture is the inner payload object (no envelope),
  // so unwrap returns it verbatim.

  // One round-trip for the whole board (currently-triggering + upcoming + alerts).
  if (path === '/api/extension/qm-planner/board') {
    return { success: true, data: DEMO_QM_BOARD };
  }

  // Five-Star predictor card.
  if (path === '/api/extension/qm-planner/five-star') {
    return { success: true, data: DEMO_QM_FIVE_STAR };
  }

  // Discharge Function Score page.
  if (path === '/api/extension/qm-planner/dfs') {
    return { success: true, data: DEMO_QM_DFS };
  }

  // GG functional-decline dashboard (Residents view).
  if (path === '/api/extension/qm-planner/gg-decline-dashboard') {
    return { success: true, data: DEMO_QM_GG_DASHBOARD };
  }

  // Aide scoring (CNA scorecards). With ?aideId= → single-aide detail; otherwise
  // the facility-wide list.
  if (path === '/api/extension/qm-planner/gg-aide-deviation') {
    const aideId = params.get('aideId');
    if (aideId) {
      const detail = DEMO_QM_GG_AIDE_DETAIL[aideId];
      if (detail) return { success: true, data: detail };
      // Fall back to the one captured aide so any card opens to a real scorecard.
      const sample = Object.values(DEMO_QM_GG_AIDE_DETAIL)[0];
      return { success: true, data: sample || null };
    }
    return { success: true, data: DEMO_QM_GG_AIDE_LIST };
  }

  // ── F-Tag Prevention (Survey Readiness) routes ──────────────────
  // Fabricated fixtures — see demo-ftag-fixtures.js. Specific /findings/[id]/...
  // routes must be checked before the bare /findings feed.

  if (path === '/api/extension/ftag-prevention/module-status') {
    return { success: true, data: FTAG_MODULE_STATUS };
  }

  // Finding-anchored MAR/TAR (F684 / F697 source view).
  const ftagMarMatch = path.match(/\/api\/extension\/ftag-prevention\/findings\/([^/]+)\/mar$/);
  if (ftagMarMatch) {
    const data = buildFtagMar(ftagMarMatch[1]);
    return { success: true, data: data || { order: null, adminRecords: [], dateRange: null } };
  }

  // resolve / snooze / unsnooze (DELETE snooze) / reopen — acknowledge only;
  // the views are optimistic and refetch on super:ftag-changed.
  const ftagActionMatch = path.match(/\/api\/extension\/ftag-prevention\/findings\/([^/]+)\/(resolve|snooze|reopen)$/);
  if (ftagActionMatch) {
    return { success: true, data: { ok: true, id: ftagActionMatch[1], action: ftagActionMatch[2] } };
  }

  // Unified findings feed (status = open | snoozed | resolved).
  if (path === '/api/extension/ftag-prevention/findings') {
    return { success: true, data: buildFtagFindings(params.get('status') || 'open') };
  }

  // Vitals source view (F580 / F692).
  if (path === '/api/extension/vitals') {
    return { success: true, data: buildFtagVitals(params.get('patientId')) };
  }

  // /api/extension/patients/:id/gg-decline — rich detail for the GG modal
  const ggMatch = path.match(/\/api\/extension\/patients\/([^/]+)\/gg-decline$/);
  if (ggMatch) {
    const patientId = ggMatch[1];
    const data = DEMO_GG_DETAIL_BY_PATIENT[patientId];
    if (data) return { success: true, data };
    return { success: false, error: `Demo: no GG detail for ${patientId}` };
  }

  // Snooze mutations — just acknowledge; no state persistence in the demo.
  if (/\/api\/extension\/patients\/[^/]+\/(gg-decline\/snooze|preventable-alert-snooze)(\/[^/]+)?$/.test(path)) {
    return { success: true, data: { ok: true } };
  }

  // /api/patients/:id/evidence — Generic evidence lookup for non-GG alert
  // SignalRow expansions. Demo returns an empty list so the UI shows
  // "no details" rather than spinning forever.
  const evidenceMatch = path.match(/\/api\/patients\/([^/]+)\/evidence$/);
  if (evidenceMatch) {
    return { success: true, data: { evidence: [] } };
  }

  // ── 24-Hour Report routes ──────────────────────────────────────

  if (path === '/api/extension/24hr-report/schedule') {
    const method = (options?.method || 'GET').toUpperCase();
    if (method === 'PATCH') {
      let body = {};
      try {
        body = options?.body ? JSON.parse(options.body) : {};
      } catch {
        return { success: false, error: 'Invalid request body' };
      }
      const hour = body.scheduleHour;
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return {
          success: false,
          status: 400,
          error: 'scheduleHour must be an integer between 0 and 23',
        };
      }
      demo24hrScheduleHour = hour;
    }
    const hour = demo24hrScheduleHour;
    return {
      success: true,
      data: {
        success: true,
        locationId: 'demo-loc-1',
        scheduleHour: hour,
        defaultScheduleHour: 3,
        timezone: 'America/Chicago',
        scheduleTimeLocal: `${String(hour).padStart(2, '0')}:00`,
      },
    };
  }

  if (path === '/api/extension/24hr-report') {
    const date = params.get('date');
    if (date) {
      const report = buildReportForDate(date);
      if (!report) return { success: false, status: 404, error: 'Report not found' };
      return { success: true, data: { report } };
    }
    return { success: true, data: buildReportList() };
  }

  console.warn('[DemoMock] Unhandled API endpoint:', path);
  return { success: false, error: `Demo: unhandled endpoint ${path}` };
}

/**
 * Handle a message from chrome.runtime.sendMessage
 */
async function handleMessage(msg) {
  await randomDelay();

  switch (msg.type) {
    case 'GET_ORG':
      return { org: 'demo-org' };

    case 'GET_AUTH_STATE':
      return { authenticated: true };

    case 'API_REQUEST':
      return routeApiRequest(msg.endpoint, msg.options);

    case 'CAPTURE_VIEWPORT':
      // 1×1 transparent PNG so the FeedbackModal preview/region selector has something to render.
      return {
        ok: true,
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      };

    case 'SUBMIT_FEEDBACK':
      console.log('[DemoMock] SUBMIT_FEEDBACK (no-op in demo):', msg.payload);
      return { ok: true, id: `demo-feedback-${Date.now()}` };

    default:
      console.log('[DemoMock] Unhandled message type:', msg.type);
      return {};
  }
}

/**
 * Install the mock chrome API
 */
export function createMockChrome() {
  if (typeof window.chrome === 'undefined') {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {};
  }

  // Mock sendMessage — supports both Promise and callback patterns
  window.chrome.runtime.sendMessage = function (msg, callback) {
    const promise = handleMessage(msg);

    if (typeof callback === 'function') {
      // Callback pattern (used by useItemDetail)
      promise.then(callback).catch(err => {
        console.error('[DemoMock] Error in callback handler:', err);
        callback({ success: false, error: err.message });
      });
      return undefined;
    }

    // Promise pattern (used by most hooks)
    return promise;
  };

  // Mock getURL — return relative paths for lib files
  window.chrome.runtime.getURL = function (path) {
    // Map extension paths to demo-relative paths
    if (path.startsWith('lib/')) return `./${path}`;
    return path;
  };

  // Mock getManifest — used by FeedbackModal to attach version to payload.
  window.chrome.runtime.getManifest = function () {
    return { name: 'Super LTC Demo', version: '0.0.0-demo' };
  };

  // Mock chrome.runtime.id (some code checks for extension context)
  window.chrome.runtime.id = 'demo-mock-extension-id';

  console.log('[DemoMock] Chrome API mocks installed');
}
