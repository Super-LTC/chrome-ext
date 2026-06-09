/**
 * Demo fixtures for Care Plan Auto-Pop (Initial) + Audit (Comprehensive Review).
 *
 * Installs window globals normally provided by the real extension scripts:
 *   - window.CarePlanStampDiscover  (PCC scraping — short-circuited)
 *   - window.CarePlanAuditAPI       (backend audit — returns fixture)
 *   - window.CarePlanStampAPI       (backend proposal — returns fixture)
 *   - window.CarePlanAddInterventionAPI (intervention stamp — no-op success)
 *
 * Pure fixture; no network. Lets CarePlanStampModal render both wizard modes
 * end-to-end on the demo Clinical Care Plan Detail page.
 */

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Org dropdowns (Kardex categories, team positions, review depts) ──
const KARDEX_OPTIONS = [
  { id: 101, label: 'Safety' },
  { id: 102, label: 'Skin / Wound' },
  { id: 103, label: 'Nutrition' },
  { id: 104, label: 'Elimination' },
  { id: 105, label: 'Mood / Behavior' },
  { id: 106, label: 'Mobility' },
  { id: 107, label: 'Respiratory' },
  { id: 108, label: 'Pain' },
];
const POSITION_OPTIONS = [
  { id: 201, label: 'RN' },
  { id: 202, label: 'LPN' },
  { id: 203, label: 'CNA' },
  { id: 204, label: 'Activities' },
  { id: 205, label: 'Dietary' },
  { id: 206, label: 'Therapy' },
  { id: 207, label: 'Social Services' },
];
const REVIEW_DEPT_OPTIONS = [
  { id: 301, label: 'Nursing' },
  { id: 302, label: 'Activities' },
  { id: 303, label: 'Dietary' },
  { id: 304, label: 'Therapy' },
  { id: 305, label: 'Social Services' },
];

const toLabels = (opts) =>
  opts.reduce((acc, o) => { acc[String(o.id)] = o.label; return acc; }, {});

const DEMO_DROPDOWNS = {
  kardexLabels: toLabels(KARDEX_OPTIONS),
  positionLabels: toLabels(POSITION_OPTIONS),
  reviewDeptLabels: toLabels(REVIEW_DEPT_OPTIONS),
  kardexOptions: KARDEX_OPTIONS,
  positionOptions: POSITION_OPTIONS,
  reviewDeptOptions: REVIEW_DEPT_OPTIONS,
};

// ── Existing focuses already scraped from the "page" ──
const EXISTING_FOCUS_TEXTS = [
  'Risk for falls related to unsteady gait and history of falls.',
  'Alteration in skin integrity: Stage 2 pressure ulcer to sacrum.',
  'Self-care deficit related to weakness and decreased endurance.',
  'Risk for aspiration related to dysphagia.',
];

// ── Helper to build a proposed focus ──
function mkFocus({ description, goals, interventions, descriptionSegments }) {
  return {
    description,
    descriptionSegments: descriptionSegments || null,
    reviewDepartments: [301],
    goals: goals.map((g) => ({ description: g, targetDate: '+90d' })),
    interventions: interventions.map((iv) => ({
      description: iv.text,
      positions: iv.positions || [201, 203],
      kardexCategory: iv.kardex ?? null,
      frequency: iv.freq || 'Each Shift',
    })),
  };
}

// ── Initial Auto-Pop proposal (universals + dx/order-driven admits) ──
const INITIAL_FOCUS = (overrides) => ({
  reviewDepartments: [301],
  alreadyOnPlan: false,
  ...overrides,
});

const DEMO_INITIAL_PROPOSAL = {
  patientId: '2657226',
  focuses: [
    INITIAL_FOCUS({
      ruleId: 'universal.code_status',
      score: 100,
      description: 'Resident has an established advance directive: ___',
      descriptionSegments: [
        { kind: 'text', value: 'Resident has an established advance directive: ' },
        {
          kind: 'token',
          tokenKey: 'code_status',
          needsFilling: true,
          value: '___',
          options: ['Full Code', 'DNR', 'DNI', 'Comfort Care'],
        },
      ],
      rationale: {
        basis: 'standard',
        basisLabel: 'Standard admission focus',
        evidence: ['Admission assessment documents advance directive on file'],
      },
      goals: [
        { description: 'Resident\'s code status will be honored per advance directive through next review.' },
      ],
      interventions: [
        { description: 'Code status posted at bedside and communicated to all disciplines at shift change.', kardexCategory: 101, positions: [201, 202] },
        { description: 'Verify code status with resident/representative upon admission and each review.', positions: [201] },
      ],
    }),
    INITIAL_FOCUS({
      ruleId: 'universal.falls',
      score: 95,
      description: 'Risk for falls related to impaired mobility and history of falls.',
      rationale: {
        basis: 'assessment',
        basisLabel: 'Assessment finding',
        evidence: ['Morse Fall Scale 55 (2026-06-01) — high risk'],
      },
      goals: [
        { description: 'Resident will remain free from fall-related injury through next review.' },
        { description: 'Resident will use call light for assistance with mobility.' },
      ],
      interventions: [
        { description: 'Bed/chair alarm in use during sleep hours and unsupervised periods.', kardexCategory: 101, positions: [201, 203] },
        { description: 'Non-skid footwear at all times when out of bed.', kardexCategory: 101, positions: [203] },
        { description: 'Toileting schedule every 2 hours while awake.', kardexCategory: 104, positions: [203], frequency: 'Q2H' },
      ],
    }),
    INITIAL_FOCUS({
      ruleId: 'universal.skin_integrity',
      score: 90,
      description: 'Resident has potential for impairment of skin integrity r/t immobility.',
      rationale: {
        basis: 'assessment',
        basisLabel: 'Assessment finding',
        evidence: ['Braden 16 (2026-06-02) — at-risk for pressure injury'],
      },
      goals: [
        { description: 'Resident\'s skin will remain intact through next review.' },
      ],
      interventions: [
        { description: 'Turn and reposition every 2 hours; document on flow sheet.', kardexCategory: 102, positions: [203], frequency: 'Q2H' },
        { description: 'Pressure-redistributing mattress in use; verify each shift.', kardexCategory: 102, positions: [201, 203] },
      ],
    }),
    INITIAL_FOCUS({
      ruleId: 'dx.diabetes.type2',
      score: 85,
      description: 'Imbalanced nutrition and risk for unstable blood glucose related to Type 2 Diabetes Mellitus.',
      rationale: {
        basis: 'diagnosis',
        basisLabel: 'Active diagnosis',
        evidence: ['E11.9 Type 2 DM on medical diagnosis list'],
      },
      goals: [
        { description: 'Resident\'s blood glucose will remain 80–180 mg/dL ≥80% of checks through next review.' },
      ],
      interventions: [
        { description: 'Accuchecks AC and HS per MD order; document and report values outside parameters.', kardexCategory: 103, positions: [201, 202] },
        { description: 'Provide consistent carbohydrate diet as ordered.', kardexCategory: 103, positions: [205] },
      ],
    }),
    INITIAL_FOCUS({
      ruleId: 'order.medication.anticoagulant',
      score: 80,
      description: 'At risk for bleeding related to anticoagulant therapy (apixaban).',
      rationale: {
        basis: 'order',
        basisLabel: 'Active order',
        evidence: ['Eliquis 5mg BID — active pharmacy order'],
      },
      goals: [
        { description: 'Resident will remain free of significant bleeding through next review.' },
      ],
      interventions: [
        { description: 'Monitor for bruising, bleeding gums, hematuria, melena every shift.', kardexCategory: 101, positions: [201, 202] },
        { description: 'Implement bleeding precautions: soft toothbrush, electric razor.', kardexCategory: 101, positions: [203] },
      ],
    }),
    // Pre-skipped by backend — already keyword-matched on plan
    INITIAL_FOCUS({
      ruleId: 'universal.aspiration',
      alreadyOnPlan: true,
      description: 'Risk for aspiration related to dysphagia.',
      goals: [{ description: 'Resident will tolerate diet without aspiration episodes.' }],
      interventions: [
        { description: 'Supervise all meals; ensure 90° positioning during/after meals.', kardexCategory: 103, positions: [203, 205] },
      ],
    }),
  ],
  skippedFocuses: [
    INITIAL_FOCUS({
      ruleId: 'universal.pain',
      description: 'Chronic pain related to osteoarthritis.',
      goals: [{ description: 'Resident will report pain ≤4/10 at rest.' }],
      interventions: [
        { description: 'Assess pain level each shift using 0–10 scale.', kardexCategory: 108, positions: [201, 203] },
      ],
    }),
  ],
};

// ── toAdd (suggested new focuses) ──
const TO_ADD = [
  {
    ruleId: 'universal.cognition.confusion',
    score: 92,
    reason: 'BIMS score 8 indicates moderate cognitive impairment; no cognition focus on the plan.',
    coverageSignal: 'ai_says_missing',
    caaName: 'Cognitive Loss / Dementia',
    caa: 'cognition',
    sourceDxCodes: ['F03.90'],
    rationale: {
      basis: 'assessment',
      basisLabel: 'Assessment finding',
      evidence: ['BIMS 8 (2026-06-01) — moderate cognitive impairment'],
    },
    focus: mkFocus({
      description: 'Alteration in cognition related to moderate cognitive impairment as evidenced by BIMS 8.',
      goals: [
        'Resident will participate in structured cognitive activities 3× weekly through next review.',
        'Resident will be redirected without distress when confused through next review.',
      ],
      interventions: [
        { text: 'Provide simple, one-step directions and allow extra processing time.', kardex: 105, positions: [201, 203] },
        { text: 'Reorient to person, place, time during every interaction.', positions: [203] },
        { text: 'Engage in small-group cognitive stimulation activities.', positions: [204], kardex: null },
      ],
    }),
  },
  {
    ruleId: 'order.medication.anticoagulant',
    score: 88,
    reason: 'Active order for Eliquis 5mg BID — anticoagulant monitoring focus is missing.',
    coverageSignal: 'ai_says_missing',
    caaName: 'Medications',
    focus: mkFocus({
      description: 'At risk for bleeding related to anticoagulant therapy (apixaban).',
      goals: [
        'Resident will remain free of significant bleeding through next review.',
      ],
      interventions: [
        { text: 'Monitor for bruising, bleeding gums, hematuria, melena every shift.', kardex: 101, positions: [201, 202] },
        { text: 'Implement bleeding precautions: soft toothbrush, electric razor.', positions: [203], kardex: 101 },
        { text: 'Notify MD for any unusual bleeding or fall with head impact.', positions: [201] },
      ],
    }),
  },
  {
    ruleId: 'dx.diabetes.type2',
    score: 85,
    sourceDxCodes: ['E11.9'],
    reason: 'Diagnosis E11.9 (Type 2 DM) on chart; no diabetes management focus on the plan.',
    coverageSignal: 'ai_says_missing',
    caaName: 'Nutritional Status',
    focus: mkFocus({
      description: 'Imbalanced nutrition and risk for unstable blood glucose related to Type 2 Diabetes Mellitus.',
      goals: [
        'Resident\'s blood glucose will remain 80–180 mg/dL ≥80% of checks through next review.',
        'Resident will verbalize understanding of carbohydrate-controlled diet.',
      ],
      interventions: [
        { text: 'Accuchecks AC and HS per MD order; document and report values outside parameters.', kardex: 103, positions: [201, 202] },
        { text: 'Provide consistent carbohydrate diet as ordered.', positions: [205], kardex: 103 },
        { text: 'Monitor for signs of hypo-/hyperglycemia each shift.', positions: [201, 202] },
      ],
    }),
  },
  {
    ruleId: 'dx.copd',
    score: 78,
    sourceDxCodes: ['J44.9'],
    reason: 'Diagnosis J44.9 (COPD) on chart; no respiratory focus on the plan.',
    coverageSignal: 'ai_says_missing',
    caaName: 'Pulmonary Status',
    focus: mkFocus({
      description: 'Ineffective breathing pattern related to chronic obstructive pulmonary disease.',
      goals: [
        'Resident will maintain O₂ saturation ≥92% on room air through next review.',
      ],
      interventions: [
        { text: 'Monitor respiratory rate, effort, and SpO₂ each shift.', kardex: 107, positions: [201, 202] },
        { text: 'Administer scheduled and PRN nebulizers per MD order.', positions: [201, 202] },
        { text: 'Encourage pursed-lip breathing during episodes of dyspnea.', positions: [203], kardex: 107 },
      ],
    }),
  },
  {
    ruleId: 'order.dietary.thickened-liquids',
    score: 60,
    autoSelect: false,
    reason: 'Active diet order: Nectar-thick liquids — no swallowing/aspiration focus pairing.',
    coverageSignal: 'ai_says_partial',
    caaName: 'Nutritional Status',
    focus: mkFocus({
      description: 'Risk for impaired swallowing related to dysphagia; on nectar-thick liquids.',
      goals: [
        'Resident will tolerate nectar-thick liquids without choking episodes.',
      ],
      interventions: [
        { text: 'Supervise all meals; ensure proper positioning at 90° during/after meals.', positions: [203, 205], kardex: 103 },
        { text: 'Provide nectar-thick liquids only; flag tray accordingly.', positions: [205] },
      ],
    }),
  },
];

// ── toCheck (verify) — partial_coverage + informational ──
const TO_CHECK = [
  {
    kind: 'partial_coverage',
    focusId: 'F-9001',
    pccFocusId: '853610',
    focusText: 'Risk for falls related to unsteady gait and history of falls.',
    detail: 'Existing falls focus is missing 3 standard interventions for high-risk residents.',
    caaName: 'Falls',
    coverageStatus: 'partial_coverage',
    suggestionSource: 'ai',
    sourceDxCodes: ['R29.6'],
    suggestedInterventions: [
      { description: 'Bed/chair alarm in use during sleep hours and unsupervised periods.', kardexCategory: 101, positions: [201, 203], frequency: 'Each Shift' },
      { description: 'Non-skid footwear at all times when out of bed.', kardexCategory: 101, positions: [203], frequency: 'Each Shift' },
      { description: 'Toileting schedule every 2 hours while awake.', kardexCategory: 104, positions: [203], frequency: 'Q2H' },
    ],
  },
  {
    kind: 'partial_coverage',
    focusId: 'F-9002',
    pccFocusId: '591311',
    focusText: 'Alteration in skin integrity: Stage 2 pressure ulcer to sacrum.',
    detail: 'Wound focus exists but offloading + nutrition interventions are absent.',
    caaName: 'Pressure Ulcer',
    coverageStatus: 'partial_coverage',
    suggestionSource: 'ai',
    suggestedInterventions: [
      { description: 'Turn and reposition every 2 hours; document on flow sheet.', kardexCategory: 102, positions: [203], frequency: 'Q2H' },
      { description: 'Pressure-redistributing mattress in use; verify each shift.', kardexCategory: 102, positions: [201, 203] },
      { description: 'Supplemental protein shake BID per Dietary recommendation.', kardexCategory: 103, positions: [205], frequency: 'BID' },
    ],
  },
  {
    kind: 'informational',
    focusId: 'F-9003',
    focusText: 'Self-care deficit related to weakness and decreased endurance.',
    detail: 'Therapy discharge note recommends transition from "max assist" to "moderate assist" wording.',
    caaName: 'ADL Functional / Rehab Potential',
  },
];

// ── toRemove (resolve in PCC) ──
const TO_REMOVE = [
  {
    focusId: 'F-9100',
    pccFocusId: '910001',
    focusText: 'Acute pain related to s/p right hip ORIF.',
    detail: 'Surgery dated 2024-09-12 — over 60 days resolved; acute phase ended per progress notes.',
    caaName: 'Pain',
  },
  {
    focusId: 'F-9101',
    pccFocusId: '910002',
    focusText: 'Risk for infection related to indwelling Foley catheter.',
    detail: 'Foley removed on 2025-03-04 per nursing note; no new urinary issues documented since.',
    caaName: 'Urinary Continence / Indwelling Catheter',
  },
];

// ── onPlan (already covered, shown in dashboard count) ──
const ON_PLAN = [
  {
    ruleId: 'order.diet.standard',
    focusId: 'F-9200',
    focusText: 'Risk for aspiration related to dysphagia.',
    caaName: 'Nutritional Status',
    caa: 'nutrition',
    rationale: { basis: 'order', basisLabel: 'Active order', evidence: ['Diet order: Nectar-thick liquids (started 2026-05-20)'] },
  },
  {
    ruleId: 'universal.adl',
    focusId: 'F-9201',
    focusText: 'Self-care deficit related to weakness and decreased endurance.',
    caaName: 'ADL Functional / Rehab Potential',
    caa: 'adl',
    rationale: { basis: 'standard', basisLabel: 'Standard admission focus', evidence: [] },
  },
  {
    ruleId: 'universal.skin_integrity',
    focusId: 'F-9202',
    focusText: 'Resident has potential for impairment of skin integrity r/t immobility.',
    caaName: 'Pressure Ulcer',
    caa: 'pressure_ulcer',
    rationale: { basis: 'standard', basisLabel: 'Standard admission focus', evidence: ['Braden 16 (2026-06-02) — at-risk for pressure injury'] },
  },
];

// ── assessmentLinkages — per-assessment (UDA + MDS) cross-check ──
const ASSESSMENT_LINKAGES = [
  { concept: 'braden', label: 'Skin integrity / pressure-injury risk', source: 'uda',
    sourceLabel: 'Braden 16', fired: true, status: 'covered',
    matchedFocus: 'Resident has potential for impairment of skin integrity r/t immobility.', caa: 'pressure_ulcer' },
  { concept: 'bims', label: 'Cognition', source: 'uda',
    sourceLabel: 'BIMS 8', fired: true, status: 'gap', matchedFocus: null, caa: 'cognition' },
  { concept: 'phq', label: 'Mood / depression', source: 'uda',
    sourceLabel: 'PHQ-9 14', fired: true, status: 'gap', matchedFocus: null, caa: 'mood' },
  { concept: 'restraints', label: 'Physical restraint use / reduction', source: 'mds',
    sourceLabel: 'P0100C: 2. Used daily', fired: true, status: 'gap', matchedFocus: null, caa: 'restraints' },
  { concept: 'pain', label: 'Pain', source: 'uda',
    sourceLabel: 'Pain 2/10', fired: false, status: 'not_indicated', matchedFocus: null, caa: 'pain' },
];

// ── byCAA bucket aggregation for rail subtitles ──
const BY_CAA = (() => {
  const m = new Map();
  const push = (caaName, bucket, item) => {
    if (!m.has(caaName)) m.set(caaName, { displayName: caaName, toAdd: [], toCheck: [], toRemove: [] });
    m.get(caaName)[bucket].push(item);
  };
  TO_ADD.forEach((it) => push(it.caaName, 'toAdd', it));
  TO_CHECK.forEach((it) => push(it.caaName, 'toCheck', it));
  TO_REMOVE.forEach((it) => push(it.caaName, 'toRemove', it));
  return Array.from(m.values());
})();

const DEMO_AUDIT_RESPONSE = {
  audit: {
    toAdd: TO_ADD,
    toCheck: TO_CHECK,
    toRemove: TO_REMOVE,
    onPlan: ON_PLAN,
    byCAA: BY_CAA,
    assessmentLinkages: ASSESSMENT_LINKAGES,
    hasCoverageCheckData: true,
  },
};

// ── PCC library browser fixtures (Initial → Add from PCC Library) ──
const DEMO_LIBRARIES = [{ id: 1, label: 'PointClickCare Standard Library' }];
const DEMO_LIBRARY_CATEGORIES = [
  { id: 10, label: 'Safety & Falls' },
  { id: 11, label: 'Skin Integrity' },
  { id: 12, label: 'Nutrition & Hydration' },
];
const DEMO_LIBRARY_FOCUSES = {
  10: [
    { stdNeedId: 1001, text: 'Risk for falls related to impaired mobility and unsteady gait.' },
    { stdNeedId: 1002, text: 'Risk for injury related to confusion and disorientation.' },
  ],
  11: [
    { stdNeedId: 1101, text: 'Impaired skin integrity related to immobility and pressure.' },
  ],
};
const DEMO_LIBRARY_CONTENTS = {
  1001: {
    goals: [
      { stdId: 2001, text: 'Resident will remain free from fall-related injury.' },
      { stdId: 2002, text: 'Resident will use call light for assistance.' },
    ],
    interventions: [
      { stdId: 3001, text: 'Bed/chair alarm in use during sleep hours.' },
      { stdId: 3002, text: 'Non-skid footwear when out of bed.' },
      { stdId: 3003, text: 'Assist with ambulation using gait belt.' },
    ],
  },
};

export function installCarePlanAuditMocks() {
  // ── PCC discovery short-circuits ──
  window.CarePlanStampDiscover = {
    async discoverCarePlanId() { await SLEEP(40); return '28429'; },
    async discoverMiniToken() { await SLEEP(40); return 'demo-mini-token'; },
    async scrapeOrgDropdowns() {
      await SLEEP(60);
      return DEMO_DROPDOWNS;
    },
    validateProposalIds() { return { ok: true, missing: [] }; },
    async discoverLibraries() { await SLEEP(40); return DEMO_LIBRARIES; },
    async discoverCategoriesForLibrary(_libraryId) {
      await SLEEP(40);
      return DEMO_LIBRARY_CATEGORIES;
    },
    async discoverFocusesForCategory(_libraryId, diagcatId) {
      await SLEEP(40);
      return DEMO_LIBRARY_FOCUSES[diagcatId] || [];
    },
    async discoverFocusContents(stdNeedId) {
      await SLEEP(60);
      return DEMO_LIBRARY_CONTENTS[stdNeedId] || { goals: [], interventions: [] };
    },
    async scrapeFullCarePlan() {
      await SLEEP(80);
      return { careplanId: '28429', focusTexts: EXISTING_FOCUS_TEXTS };
    },
  };

  // ── Audit endpoint (Comprehensive Review) ──
  window.CarePlanAuditAPI = {
    async fetchAudit(_args) {
      await SLEEP(180);
      return DEMO_AUDIT_RESPONSE;
    },
  };

  // ── Proposal endpoint (Initial Auto-Pop) ──
  window.CarePlanStampAPI = {
    async fetchProposal() {
      await SLEEP(150);
      return DEMO_INITIAL_PROPOSAL;
    },
    async persistSkip() { return { ok: true }; },
  };

  // ── Stamping a single focus / intervention always succeeds in demo. ──
  window.CarePlanAddInterventionAPI = {
    async addInterventions() { await SLEEP(180); return { ok: true }; },
  };

  // ── Bulk stamp orchestration (Add all / Stamp focus) ──
  window.CarePlanStampClient = {
    async orchestrateStamp({ proposal, onProgress }) {
      const total = proposal?.focuses?.length || 1;
      for (let i = 0; i < total; i++) {
        onProgress?.({ phase: 'stamping_focus', focusIndex: i, focusTotal: total });
        await SLEEP(220);
      }
      onProgress?.({ phase: 'done', focusIndex: total, focusTotal: total });
      return {
        focusesStamped: total,
        goalsStamped: total * 2,
        interventionsStamped: total * 3,
        errors: [],
        durationMs: total * 220,
      };
    },
  };

  // ── Resolve a focus (toRemove path) ──
  window.CarePlanResolveAPI = {
    async resolveFocus() { await SLEEP(180); return { ok: true }; },
  };

  // ── Analytics stub: silent no-op so audit modal can fire its track() calls. ──
  if (!window.SuperAnalytics) {
    window.SuperAnalytics = { track: () => {} };
  }
}

export const DEMO_CARE_PLAN_AUDIT = DEMO_AUDIT_RESPONSE;
export const DEMO_CARE_PLAN_INITIAL = DEMO_INITIAL_PROPOSAL;
