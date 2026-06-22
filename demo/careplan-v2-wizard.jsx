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

// Force V2 + the mock-fixture path. Read at effect-time (on mount), so setting
// it before render() is sufficient; a single static import graph keeps one
// shared preact/preact-hooks instance (a dynamic import splits it and breaks
// hooks with "Cannot read properties of undefined (reading '__H')").
localStorage.setItem('superltc_cpv2', 'mock');

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

// ---- audit API (unused under devForceMock, but defensive) ----
window.CarePlanAuditAPI = { fetchAudit: async () => ({ audit: { engineVersion: 'v2' } }) };

// ---- stamping client (no-op success so Stamp & next / Stamp all work) ----
window.CarePlanStampClient = {
  orchestrateStamp: async ({ onProgress } = {}) => {
    onProgress?.({ phase: 'done', focusIndex: 1, focusTotal: 1 });
    return { focusesStamped: 1, goalsStamped: 1, interventionsStamped: 1, errors: [], durationMs: 10 };
  },
};

// ---- skip persistence + toasts + analytics (no-ops) ----
window.CarePlanStampAPI = { ...(window.CarePlanStampAPI || {}), persistSkip: async () => ({ success: true }) };
window.CarePlanResolveAPI = { resolveFocus: async () => ({ success: true }) };
window.CarePlanAddInterventionAPI = { addInterventions: async () => ({ success: true }) };
window.SuperAnalytics = { track: () => {} };
window.SuperToast = { success: () => {}, error: () => {} };

render(
  h(CarePlanStampModal, {
    patientId: '178090',
    patientName: 'Johnson, Thenesia',
    facilityName: 'Eastbrook',
    orgSlug: 'eac',
    defaultMode: 'comprehensive',
    onClose: () => {},
  }),
  document.getElementById('root'),
);
