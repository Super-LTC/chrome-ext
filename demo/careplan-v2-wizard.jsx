/**
 * Standalone dev harness for the Care Plan V2 wizard.
 *
 * Renders the real <CarePlanStampModal> in comprehensive mode with the bundled
 * mock v2 audit fixture, so the V2 wizard can be reviewed without a live PCC
 * page or backend. Forces v2 via the dev override (localStorage 'superltc_cpv2'
 * = 'mock'), which makes the modal dynamic-import the fixture instead of calling
 * the audit API. All PCC-context + stamping globals are stubbed below.
 *
 * Run:   npx vite --config vite.demo.config.js
 * Open:  http://localhost:5173/demo/careplan-v2-wizard.html
 */
import { render, h } from 'preact';
import { CarePlanStampModal } from '../content/modules/care-plan-stamp/CarePlanStampModal.jsx';

// `?v1` exercises the V1 regression path: no dev toggle, and the audit API
// returns a v1 response (engineVersion stripped). Default = V2 via the dev
// mock-fixture path.
const V1_MODE = new URLSearchParams(location.search).has('v1');

if (V1_MODE) {
  localStorage.removeItem('superltc_cpv2');
} else {
  // Force V2 + the mock-fixture path. Read at effect-time (on mount), so setting
  // it before render() is sufficient; a single static import graph keeps one
  // shared preact/preact-hooks instance (a dynamic import splits it and breaks
  // hooks with "Cannot read properties of undefined (reading '__H')").
  localStorage.setItem('superltc_cpv2', 'mock');
}

// ---- minimal chrome stub (the modal only touches it on the Done reload) ----
if (typeof window.chrome === 'undefined') {
  window.chrome = { runtime: { sendMessage: async () => ({ success: true }) } };
}

// ---- org dropdowns (what scrapeOrgDropdowns would return on a real page) ----
const POSITION_LABELS = {
  9882: 'CNA', 9885: 'Activities', 9888: 'Dietary',
  9890: 'Therapy', 9891: 'Social Svcs', 9897: 'RN',
};
const KARDEX_LABELS = {
  activities: 'Activities', adl: 'ADL', cognition: 'Cognition',
  communication: 'Communication', discharge_planning: 'Discharge Planning',
  education: 'Education', elimination: 'Elimination', hydration: 'Hydration',
  medications: 'Medications', mobility: 'Mobility', monitors: 'Monitors',
  mood: 'Mood', nutrition: 'Nutrition', pain: 'Pain', safety: 'Safety',
};
const toOptions = (labels) => Object.entries(labels).map(([id, label]) => ({ id: isNaN(+id) ? id : +id, label }));
const DROPDOWNS = {
  positionLabels: POSITION_LABELS,
  positionOptions: toOptions(POSITION_LABELS),
  kardexLabels: KARDEX_LABELS,
  kardexOptions: toOptions(KARDEX_LABELS),
  reviewDeptLabels: {},
};

// ---- PCC context discovery (no real page in the harness) ----
window.CarePlanStampDiscover = {
  scrapeFullCarePlan: async () => ({ careplanId: 'cp-demo', focusTexts: [] }),
  scrapeOrgDropdowns: async () => DROPDOWNS,
  discoverMiniToken: async () => 'demo-token',
  validateProposalIds: () => ({ ok: true, missing: [] }),
};

// ---- audit API. Under V2 (devForceMock) the modal imports the fixture and
//      never calls this. Under ?v1 it returns the same fixture data with
//      engineVersion stripped, so isV2() is false → today's AuditRail path. ----
import mockAudit from '../content/modules/care-plan-stamp/__fixtures__/mock-audit-v2.js';
window.CarePlanAuditAPI = {
  fetchAudit: async () => {
    const { engineVersion, ...v1Audit } = mockAudit.audit;
    return { ...mockAudit, audit: v1Audit };
  },
};

// ---- stamping client (no-op success so Stamp & next / Stamp all work) ----
window.CarePlanStampClient = {
  orchestrateStamp: async ({ onProgress } = {}) => {
    onProgress?.({ phase: 'done', focusIndex: 1, focusTotal: 1 });
    return { focusesStamped: 1, goalsStamped: 1, interventionsStamped: 1, errors: [], durationMs: 10 };
  },
};

// ---- Initial-scope V2 proposal (auto-pop). Mirrors the enriched shape:
//      every focus carries rationale + autoSelect + score + caa + a pre-filled
//      kardexCategory. autoSelect:false focuses are opt-in (start skipped). ----
const INITIAL_V2_PROPOSAL = {
  engineVersion: 'v2',
  focuses: [
    {
      ruleId: 'universal.skin_integrity', score: 92, caa: 'pressure_ulcer', caaName: 'Skin / Pressure Ulcer',
      autoSelect: true, description: 'Resident has potential for impairment of skin integrity',
      rationale: { basis: 'assessment', basisLabel: 'Standard admission focus', evidence: ['Braden 15 — pressure-injury risk'] },
      reviewDepartments: [9897],
      goals: [{ description: 'Resident will maintain intact skin through review date.' }],
      interventions: [
        { description: 'Reposition every 2 hours; document.', kardexCategory: 'mobility', positions: [9882] },
        { description: 'Monitor skin condition each shift; report changes.', kardexCategory: 'monitors', positions: [9897] },
      ],
    },
    {
      ruleId: 'universal.nutrition', score: 80, caa: 'nutrition', caaName: 'Nutrition',
      autoSelect: true, description: 'Resident has potential nutritional problem',
      rationale: { basis: 'standard', basisLabel: 'Standard admission focus', evidence: [] },
      reviewDepartments: [9888],
      goals: [{ description: 'Resident will maintain adequate nutritional intake through review date.' }],
      interventions: [{ description: 'Monitor intake and record per meal.', kardexCategory: 'nutrition', positions: [9882] }],
    },
    {
      ruleId: 'universal.health_literacy', score: 30, caa: 'psychosocial', caaName: 'Psychosocial',
      autoSelect: false, description: 'Resident is at risk of not understanding health information',
      rationale: { basis: 'standard', basisLabel: 'Standard admission focus', evidence: [] },
      reviewDepartments: [9897],
      goals: [{ description: 'Resident will demonstrate understanding of health information by next review.' }],
      interventions: [{ description: 'Educate using teach-back; confirm comprehension.', kardexCategory: 'education', positions: [9897] }],
    },
    {
      ruleId: 'universal.oral_dental_care', score: 20, caa: 'oral_dental', caaName: 'Oral / Dental',
      autoSelect: false, description: 'Resident requires assistance with oral/dental care',
      rationale: { basis: 'standard', basisLabel: 'Standard admission focus', evidence: [] },
      reviewDepartments: [9882],
      goals: [{ description: 'Resident will maintain oral hygiene through review date.' }],
      interventions: [{ description: 'Provide oral care assistance each shift.', kardexCategory: 'adl', positions: [9882] }],
    },
  ],
  skippedFocuses: [],
};

// ---- skip persistence + toasts + analytics (no-ops). fetchProposal serves the
//      V2 initial proposal so the "Initial Admit" toggle renders under mock. ----
window.CarePlanStampAPI = {
  ...(window.CarePlanStampAPI || {}),
  persistSkip: async () => ({ success: true }),
  fetchProposal: async () => {
    if (V1_MODE) {
      const { engineVersion, ...v1Prop } = INITIAL_V2_PROPOSAL;
      return v1Prop;
    }
    return INITIAL_V2_PROPOSAL;
  },
};
window.CarePlanResolveAPI = { resolveFocus: async () => ({ success: true }) };
window.CarePlanAddInterventionAPI = { addInterventions: async () => ({ success: true }) };
window.SuperAnalytics = { track: () => {} };
window.SuperToast = { success: () => {}, error: () => {} };

render(
  h(CarePlanStampModal, {
    patientId: 'DEMO-0001',
    patientName: 'Demo Resident',
    facilityName: 'Demo Facility',
    orgSlug: 'demo-org',
    defaultMode: 'comprehensive',
    onClose: () => {},
  }),
  document.getElementById('root'),
);
