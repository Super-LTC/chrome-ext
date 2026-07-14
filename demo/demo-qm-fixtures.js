/**
 * Demo fixtures for QM Board + 24-Hour Report endpoints.
 *
 * Keeps the large fixture shapes out of demo-mock-chrome.js and makes them
 * easy to read/edit in isolation. Loaded via `import` into demo-mock-chrome.js.
 */

const FACILITY_DATE = '2026-04-24';
const FACILITY_TZ = 'America/Chicago';

// ── currently-triggering response ───────────────────────────────────────────
// Shape: see content/modules/qm-board/utils/derive.js.
//   { facilityDate, measuresEvaluated[], summary.byMeasure{}, patients[] }

const MEASURES_EVALUATED = [
  { id: 'uti',                 label: 'UTI' },
  { id: 'catheter',            label: 'Indwelling Catheter' },
  { id: 'falls_major_injury',  label: 'Falls with Major Injury' },
  { id: 'antipsychotic_long',  label: 'Antipsychotic (long-stay)' },
  { id: 'weight_loss',         label: 'Weight Loss' },
  { id: 'pressure_ulcer_long', label: 'Pressure Ulcer (long-stay)' },
  { id: 'phq9_depression',     label: 'Depression (PHQ-9)' },
  { id: 'adl_decline',         label: 'ADL Decline (GG)' },
  { id: 'physical_restraints', label: 'Physical Restraints' },
  { id: 'low_risk_incontinence', label: 'Low-Risk Incontinence' },
];

// Triggering counts per measure (rough aggregates)
const BY_MEASURE = {
  uti:                 { triggering: 3, excluded: 1, applicable: 82 },
  catheter:            { triggering: 2, excluded: 0, applicable: 82 },
  falls_major_injury:  { triggering: 1, excluded: 0, applicable: 82 },
  antipsychotic_long:  { triggering: 4, excluded: 2, applicable: 61 },
  weight_loss:         { triggering: 2, excluded: 0, applicable: 82 },
  pressure_ulcer_long: { triggering: 1, excluded: 0, applicable: 61 },
  phq9_depression:     { triggering: 3, excluded: 0, applicable: 58 },
  adl_decline:         { triggering: 5, excluded: 1, applicable: 74 },
  physical_restraints: { triggering: 0, excluded: 0, applicable: 82 },
  low_risk_incontinence: { triggering: 1, excluded: 0, applicable: 44 },
};

// Helper: build ADL-decline GG evidence pairs (prior + target for each item).
function ggEvidence(pairs, priorArd, targetArd, priorType = 'OBRA_QUARTERLY', targetType = 'OBRA_ANNUAL') {
  const rows = [];
  for (const [key, [prior, target]] of Object.entries(pairs)) {
    rows.push({
      mdsItem: `${key}5`,
      value: String(prior).padStart(2, '0'),
      note: `Prior ${priorType.replace(/_/g, ' ').toLowerCase()}`,
      assessmentArdDate: priorArd,
      assessmentType: priorType,
    });
    rows.push({
      mdsItem: `${key}1`,
      value: String(target).padStart(2, '0'),
      note: `Target ${targetType.replace(/_/g, ' ').toLowerCase()}`,
      assessmentArdDate: targetArd,
      assessmentType: targetType,
    });
  }
  return rows;
}

// Patients triggering at least one measure
const PATIENTS = [
  // ── ADL Decline (GG) — primary demo story ────────────────────────
  {
    patientId: 'demo-p-1001',
    externalPatientId: '2657226',
    firstName: 'Jane',
    lastName: 'Doe',
    target: { type: 'OBRA_ANNUAL', ardDate: '2026-04-29' },
    measures: [
      {
        id: 'adl_decline',
        label: 'ADL Decline (GG)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Re-assess GG items with nursing + therapy', detail: 'Any shift average improvement of ≥1 point clears the trigger on next OBRA.' },
            { label: 'Review PT/OT decline notes', detail: 'Confirm whether the drop is temporary (infection, missed shift) or a new functional baseline.' },
            { label: 'Re-score on target ARD', effectiveDate: '2026-04-29' },
          ],
        },
        evidence: ggEvidence({
          GG0170D: [4, 2],   // Sit to Stand
          GG0170F: [4, 2],   // Toilet Transfer
          GG0170I: [3, 2],   // Walk 10 Feet
          GG0130A: [5, 4],   // Eating
        }, '2026-01-22', '2026-04-22'),
      },
      {
        id: 'phq9_depression',
        label: 'Depression (PHQ-9)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Rescreen D0200 with resident', detail: 'Trigger clears when total PHQ-9 score < 10 on next qualifying assessment.' },
          ],
        },
        evidence: [
          { mdsItem: 'D0200A1', value: '2', note: 'Target PHQ-9 item A — little interest' },
          { mdsItem: 'D0200B1', value: '3', note: 'Target PHQ-9 item B — feeling down' },
          { mdsItem: 'D0300',   value: '14', note: 'Target PHQ-9 total (triggers at ≥10)' },
        ],
      },
    ],
  },
  {
    patientId: 'demo-p-1002',
    externalPatientId: '2657227',
    firstName: 'Marcus',
    lastName: 'Reyes',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-02' },
    measures: [
      {
        id: 'adl_decline',
        label: 'ADL Decline (GG)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Confirm GG accuracy with therapy', detail: 'PT last noted "ambulation with min assist x 50 ft" — verify against MDS coding.' },
          ],
        },
        evidence: ggEvidence({
          GG0170J: [4, 2],   // Walk 50 Feet
          GG0170K: [4, 2],   // Walk 150 Feet
        }, '2026-02-01', '2026-04-30'),
      },
    ],
  },
  {
    patientId: 'demo-p-1003',
    externalPatientId: '2657228',
    firstName: 'Eleanor',
    lastName: 'Novak',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-04-21' },
    measures: [
      {
        id: 'adl_decline',
        label: 'ADL Decline (GG)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Schedule new ARD — target has passed', detail: 'ARD was 4/21; a new qualifying assessment is required to clear.' },
          ],
        },
        evidence: ggEvidence({
          GG0170D: [3, 1],
          GG0170B: [3, 1],
        }, '2026-01-18', '2026-04-18'),
      },
      {
        id: 'weight_loss',
        label: 'Weight Loss',
        triggers: true,
        clearGuidance: {
          actionType: 'time',
          clearDate: '2026-07-18',
          actions: [
            { label: 'Fortified diet + weekly weights', detail: 'Trigger rolls off the 180-day scan window on 7/18.' },
          ],
        },
        evidence: [
          { mdsItem: 'K0300', value: '2', note: 'Target weight-loss flag (>10% in 180d)' },
        ],
      },
    ],
  },
  {
    patientId: 'demo-p-1004',
    externalPatientId: '2657229',
    firstName: 'Harold',
    lastName: 'Park',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-05' },
    measures: [
      {
        id: 'adl_decline',
        label: 'ADL Decline (GG)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Review GG documentation for Toilet Transfer', detail: 'Nursing notes reference setup-only — verify shift-by-shift coding.' },
          ],
        },
        evidence: ggEvidence({
          GG0170F: [5, 3],
        }, '2026-02-05', '2026-05-03'),
      },
    ],
  },
  {
    patientId: 'demo-p-1005',
    externalPatientId: '2657230',
    firstName: 'Priya',
    lastName: 'Shankar',
    target: { type: 'OBRA_ANNUAL', ardDate: '2026-05-10' },
    measures: [
      {
        id: 'adl_decline',
        label: 'ADL Decline (GG)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'Code clean on target ARD', detail: 'All current shift averages back at baseline — likely clears without further action.' },
          ],
        },
        evidence: ggEvidence({
          GG0170D: [4, 3],
        }, '2026-01-28', '2026-04-23'),
      },
    ],
  },

  // ── UTI ─────────────────────────────────────────────────────────
  {
    patientId: 'demo-p-2001',
    externalPatientId: '2657231',
    firstName: 'Lillian',
    lastName: 'Cho',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-03' },
    measures: [
      {
        id: 'uti',
        label: 'UTI',
        triggers: true,
        clearGuidance: {
          actionType: 'time',
          clearDate: '2026-05-15',
          actions: [
            { label: 'Rolls off on 5/15', detail: 'UTI I2300 coded 2/5; rolls off the 90-day scan window automatically.' },
          ],
        },
        evidence: [
          { mdsItem: 'I2300', value: '1', note: 'Target UTI coded on 2/5' },
        ],
      },
    ],
  },
  {
    patientId: 'demo-p-2002',
    externalPatientId: '2657232',
    firstName: 'Robert',
    lastName: 'Aldridge',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-12' },
    measures: [
      {
        id: 'uti',
        label: 'UTI',
        triggers: true,
        clearGuidance: {
          actionType: 'time',
          clearDate: '2026-06-02',
          actions: [{ label: 'Rolls off on 6/2', detail: 'Active UTI — 28 days to scan-window exit.' }],
        },
        evidence: [
          { mdsItem: 'I2300', value: '1', note: 'Target UTI coded on 3/4' },
        ],
      },
    ],
  },
  {
    patientId: 'demo-p-2003',
    externalPatientId: '2657233',
    firstName: 'Diane',
    lastName: 'Forester',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-04-30' },
    measures: [
      {
        id: 'uti',
        label: 'UTI',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Code clean on target ARD', detail: 'UTI resolved — code I2300 = 0 on next qualifying assessment.' }],
        },
        evidence: [
          { mdsItem: 'I2300', value: '1', note: 'Target UTI coded (still lookback)' },
        ],
      },
    ],
  },

  // ── Catheter ─────────────────────────────────────────────────────
  {
    patientId: 'demo-p-3001',
    externalPatientId: '2657234',
    firstName: 'Samuel',
    lastName: 'Okafor',
    target: { type: 'OBRA_ANNUAL', ardDate: '2026-05-01' },
    measures: [
      {
        id: 'catheter',
        label: 'Indwelling Catheter',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Confirm medical necessity', detail: 'Attach urologist order documenting continued indication.' }],
        },
        evidence: [
          { mdsItem: 'H0100A', value: '1', note: 'Target indwelling catheter present' },
        ],
      },
    ],
  },

  // ── Falls w/ Major Injury ───────────────────────────────────────
  {
    patientId: 'demo-p-4001',
    externalPatientId: '2657235',
    firstName: 'Martha',
    lastName: 'Blanchard',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-08' },
    measures: [
      {
        id: 'falls_major_injury',
        label: 'Falls with Major Injury',
        triggers: true,
        clearGuidance: {
          actionType: 'time',
          clearDate: '2026-08-20',
          actions: [{ label: 'Roll-off only', detail: 'Falls scan window is 180d; no coding action clears it sooner.' }],
        },
        evidence: [
          { mdsItem: 'J1900C', value: '1', note: 'Target major-injury fall coded 2/20' },
        ],
      },
    ],
  },

  // ── Antipsychotic (long) ────────────────────────────────────────
  ...['5001', '5002', '5003', '5004'].map((suffix, i) => ({
    patientId: `demo-p-${suffix}`,
    externalPatientId: `26572${40 + i}`,
    firstName: ['Gerald', 'Alma', 'Vance', 'Ruth'][i],
    lastName: ['Simmons', 'Vega', 'Pritchard', 'McCarthy'][i],
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-04' },
    measures: [
      {
        id: 'antipsychotic_long',
        label: 'Antipsychotic (long-stay)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [
            { label: 'GDR attempt + review exclusion codes', detail: 'Document GDR outcome; confirm I5950 / I5400 diagnoses.' },
          ],
        },
        evidence: [
          { mdsItem: 'N0415A1', value: '1', note: 'Target antipsychotic in last 7 days' },
        ],
      },
    ],
  })),

  // ── Weight Loss second patient ──────────────────────────────────
  {
    patientId: 'demo-p-6001',
    externalPatientId: '2657250',
    firstName: 'Henry',
    lastName: 'Grisham',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-10' },
    measures: [
      {
        id: 'weight_loss',
        label: 'Weight Loss',
        triggers: true,
        clearGuidance: {
          actionType: 'time',
          clearDate: '2026-06-22',
          actions: [{ label: 'Dietitian reassessment', detail: 'Current weight trend flat — rolls off in 59d.' }],
        },
        evidence: [
          { mdsItem: 'K0300', value: '2', note: 'Target weight-loss flag' },
        ],
      },
    ],
  },

  // ── PHQ-9 (two additional beyond Doe) ───────────────────────────
  {
    patientId: 'demo-p-7001',
    externalPatientId: '2657251',
    firstName: 'Isobel',
    lastName: 'Crane',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-07' },
    measures: [
      {
        id: 'phq9_depression',
        label: 'Depression (PHQ-9)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Rescreen D0200 + review med regimen' }],
        },
        evidence: [
          { mdsItem: 'D0300', value: '12', note: 'Target PHQ-9 total (triggers at ≥10)' },
        ],
      },
    ],
  },
  {
    patientId: 'demo-p-7002',
    externalPatientId: '2657252',
    firstName: 'Clifford',
    lastName: 'Bateson',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-13' },
    measures: [
      {
        id: 'phq9_depression',
        label: 'Depression (PHQ-9)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Document therapy referral' }],
        },
        evidence: [
          { mdsItem: 'D0300', value: '11', note: 'Target PHQ-9 total' },
        ],
      },
    ],
  },

  // ── Pressure Ulcer (long) ───────────────────────────────────────
  {
    patientId: 'demo-p-8001',
    externalPatientId: '2657253',
    firstName: 'Margaret',
    lastName: 'Hollis',
    target: { type: 'OBRA_ANNUAL', ardDate: '2026-05-06' },
    measures: [
      {
        id: 'pressure_ulcer_long',
        label: 'Pressure Ulcer (long-stay)',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Heal to stage 0 or document POA', detail: 'Confirm present-on-admission status in nursing admission note.' }],
        },
        evidence: [
          { mdsItem: 'M0300B1', value: '2', note: 'Target Stage 2 pressure ulcer' },
        ],
      },
    ],
  },

  // ── Low-risk incontinence ────────────────────────────────────────
  {
    patientId: 'demo-p-9001',
    externalPatientId: '2657254',
    firstName: 'Benjamin',
    lastName: 'Carver',
    target: { type: 'OBRA_QUARTERLY', ardDate: '2026-05-11' },
    measures: [
      {
        id: 'low_risk_incontinence',
        label: 'Low-Risk Incontinence',
        triggers: true,
        clearGuidance: {
          clearsOnNextObra: true,
          actionType: 'next_obra',
          actions: [{ label: 'Toileting program — review H0200A status' }],
        },
        evidence: [
          { mdsItem: 'H0300', value: '2', note: 'Target bladder continence — always incontinent' },
        ],
      },
    ],
  },
];

export const DEMO_QM_CURRENTLY_TRIGGERING = {
  facilityDate: FACILITY_DATE,
  timezone: FACILITY_TZ,
  measuresEvaluated: MEASURES_EVALUATED,
  summary: {
    byMeasure: BY_MEASURE,
    totalTriggering: Object.values(BY_MEASURE).reduce((s, v) => s + v.triggering, 0),
  },
  patients: PATIENTS,
};

// ── preventable-alerts response ─────────────────────────────────────────────
// Shape: { facilityDate, signalCounts, patients[] } where each patient has
// events + canaries arrays. Canaries drive the heads-up surface.

function ggCanary(patientId, label, detail) {
  return {
    id: 'gg_decline_canary',
    category: 'gg',
    label,
    qmId: 'adl_decline',
    urgency: detail.severity === 'severe' ? 'high' : detail.severity === 'moderate' ? 'medium' : 'low',
    latestSignalDate: detail.date,
    suggestedAction: 'Review GG decline and consider re-education / therapy referral before next ARD.',
    signals: detail.items.map((it, i) => ({
      source: 'gg_decline_service',
      refId: `${patientId}-gg-${i}`,
      date: detail.date,
      text: `${it.name}: baseline ${it.baseline} → worst ${it.worstShiftAverage.toFixed(1)} (${it.severity})`,
      detail: it,
    })),
  };
}

export const DEMO_QM_PREVENTABLE_ALERTS = {
  facilityDate: FACILITY_DATE,
  signalCounts: {
    gg_decline_canary:      { actionable: 4, suppressed: 1 },
    weight_decline_canary:  { actionable: 2, suppressed: 0 },
    ua_canary:              { actionable: 2, suppressed: 1 },
    foley_order:            { actionable: 1, suppressed: 0 },
    antipsychotic_order:    { actionable: 3, suppressed: 0 },
  },
  patients: [
    // ── Jane Doe: GG decline canary (primary clickthrough) ─────────
    {
      patientId: 'demo-p-1001',
      externalPatientId: '2657226',
      firstName: 'Jane',
      lastName: 'Doe',
      events: [],
      canaries: [
        ggCanary('demo-p-1001', 'GG decline (pre-ARD)', {
          date: '2026-04-23',
          severity: 'moderate',
          items: [
            { name: 'Sit to Stand',     mdsKey: 'GG0170D', baseline: 4, worstShiftAverage: 2.3, severity: 'moderate' },
            { name: 'Toilet Transfer',  mdsKey: 'GG0170F', baseline: 4, worstShiftAverage: 2.0, severity: 'moderate' },
            { name: 'Walk 10 Feet',     mdsKey: 'GG0170I', baseline: 3, worstShiftAverage: 2.0, severity: 'mild' },
            { name: 'Eating',           mdsKey: 'GG0130A', baseline: 5, worstShiftAverage: 4.0, severity: 'mild' },
          ],
        }),
      ],
    },
    // ── Marcus Reyes: severe GG decline on walk items ──────────────
    {
      patientId: 'demo-p-1002',
      externalPatientId: '2657227',
      firstName: 'Marcus',
      lastName: 'Reyes',
      events: [],
      canaries: [
        ggCanary('demo-p-1002', 'GG decline — ambulation', {
          date: '2026-04-22',
          severity: 'severe',
          items: [
            { name: 'Walk 50 Feet',  mdsKey: 'GG0170J', baseline: 4, worstShiftAverage: 1.7, severity: 'severe' },
            { name: 'Walk 150 Feet', mdsKey: 'GG0170K', baseline: 4, worstShiftAverage: 1.7, severity: 'severe' },
          ],
        }),
      ],
    },
    // ── Eleanor Novak: mild GG + weight decline ────────────────────
    {
      patientId: 'demo-p-1003',
      externalPatientId: '2657228',
      firstName: 'Eleanor',
      lastName: 'Novak',
      events: [
        {
          id: 'weight_decline_canary',
          category: 'vitals',
          label: 'Weight decline',
          qmId: 'weight_loss',
          urgency: 'medium',
          latestSignalDate: '2026-04-22',
          suggestedAction: 'Fortified diet + weekly weights',
          signals: [
            { source: 'vitals', date: '2026-04-22', text: 'Weight 112.4 lb today vs 119.0 lb on 2026-03-11', detail: { observedPct: 5.5 } },
          ],
        },
      ],
      canaries: [
        ggCanary('demo-p-1003', 'GG decline — transfers', {
          date: '2026-04-21',
          severity: 'severe',
          items: [
            { name: 'Sit to Stand', mdsKey: 'GG0170D', baseline: 3, worstShiftAverage: 1.3, severity: 'severe' },
            { name: 'Sit to Lying', mdsKey: 'GG0170B', baseline: 3, worstShiftAverage: 1.0, severity: 'severe' },
          ],
        }),
      ],
    },
    // ── Priya Shankar: GG with only one item ───────────────────────
    {
      patientId: 'demo-p-1005',
      externalPatientId: '2657230',
      firstName: 'Priya',
      lastName: 'Shankar',
      events: [],
      canaries: [
        ggCanary('demo-p-1005', 'GG decline — single item', {
          date: '2026-04-20',
          severity: 'mild',
          items: [
            { name: 'Sit to Stand', mdsKey: 'GG0170D', baseline: 4, worstShiftAverage: 3.3, severity: 'mild' },
          ],
        }),
      ],
    },
    // ── Non-GG alerts to round out the dashboard ───────────────────
    {
      patientId: 'demo-p-2002',
      externalPatientId: '2657232',
      firstName: 'Robert',
      lastName: 'Aldridge',
      events: [
        {
          id: 'ua_canary',
          category: 'uti',
          label: 'UA ordered — verify result',
          qmId: 'uti',
          urgency: 'medium',
          latestSignalDate: '2026-04-23',
          suggestedAction: 'Confirm UA result before coding I2300.',
          signals: [
            { source: 'order', refId: 'ord-ua-1', date: '2026-04-23', text: 'Order: UA with C&S — pending' },
          ],
        },
      ],
      canaries: [],
    },
    {
      patientId: 'demo-p-5001',
      externalPatientId: '2657240',
      firstName: 'Gerald',
      lastName: 'Simmons',
      events: [
        {
          id: 'antipsychotic_order',
          category: 'antipsychotic',
          label: 'Antipsychotic started',
          qmId: 'antipsychotic_long',
          urgency: 'low',
          latestSignalDate: '2026-04-20',
          suggestedAction: 'Confirm GDR + exclusion diagnosis',
          signals: [
            { source: 'order', refId: 'ord-ap-1', date: '2026-04-20', text: 'Order: Quetiapine 25mg PO QHS — initiated' },
          ],
        },
      ],
      canaries: [],
    },
    {
      patientId: 'demo-p-3001',
      externalPatientId: '2657234',
      firstName: 'Samuel',
      lastName: 'Okafor',
      events: [
        {
          id: 'foley_order',
          category: 'catheter',
          label: 'Foley placement order',
          qmId: 'catheter',
          urgency: 'low',
          latestSignalDate: '2026-04-22',
          suggestedAction: 'Ensure urologist indication is documented',
          signals: [
            { source: 'order', refId: 'ord-foley-1', date: '2026-04-22', text: 'Order: 16Fr Foley for urinary retention — continue until urology appt' },
          ],
        },
      ],
      canaries: [],
    },
  ],
};

// ── gg-decline per-patient response ─────────────────────────────────────────
// Shape: { decline: { baselines, declines, overallSeverity, locationName, mdsArdDate },
//          scores: [{ id, patientId, mdsQuestionKey, interventionName, shiftIndex,
//                     recordedDate, observationDate, value, aideName, ... }],
//          snooze: null | { ... } }

function buildScores(patientId, items, { startDate = '2026-03-25', endDate = '2026-04-23' } = {}) {
  const scores = [];
  let id = 1;
  const start = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));

  for (const item of items) {
    for (let d = 0; d <= days; d += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + d);
      const iso = date.toISOString().slice(0, 10);

      // Interpolate: starts at baseline, linearly approaches worst by end.
      const t = d / Math.max(1, days);
      const worst = item.worstShiftAverage;

      for (const shiftIndex of [0, 1, 2]) {
        // Day shift tracks the bulk of the decline; night/evening follow with lag.
        const shiftBias = shiftIndex === 0 ? 0 : shiftIndex === 1 ? 0.4 : 0.8;
        const ramp = Math.max(0, t - 0.1 * shiftBias);
        const value = Math.round(item.baseline + (worst - item.baseline) * ramp);

        const clamped = Math.max(1, Math.min(6, value));
        const padded = String(clamped).padStart(2, '0');
        scores.push({
          id: `${patientId}-${item.mdsKey}-${iso}-${shiftIndex}-${id++}`,
          patientId,
          mdsQuestionKey: item.mdsKey,
          interventionName: item.name,
          shiftIndex,
          recordedDate: iso,
          observationDate: iso,
          value: padded,
          loggedValue: padded,
          aideName: ['J. Alvarez, CNA', 'K. Dumont, CNA', 'M. Okafor, CNA'][shiftIndex],
        });
      }
    }
  }
  return scores;
}

export const DEMO_GG_DETAIL_BY_PATIENT = {
  'demo-p-1001': {
    decline: {
      locationName: 'Unit 3 — 308-B',
      mdsArdDate: '2026-01-22',
      overallSeverity: 'moderate',
      baselines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand',    value: 4, rawValue: '04' },
        { mdsKey: 'GG0170F', name: 'Toilet Transfer', value: 4, rawValue: '04' },
        { mdsKey: 'GG0170I', name: 'Walk 10 Feet',    value: 3, rawValue: '03' },
        { mdsKey: 'GG0130A', name: 'Eating',          value: 5, rawValue: '05' },
        { mdsKey: 'GG0170B', name: 'Sit to Lying',    value: 4, rawValue: '04' },
      ],
      declines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand',    baseline: 4, worstShiftAverage: 2.3, declineMagnitude: 1.7, severity: 'moderate' },
        { mdsKey: 'GG0170F', name: 'Toilet Transfer', baseline: 4, worstShiftAverage: 2.0, declineMagnitude: 2.0, severity: 'moderate' },
        { mdsKey: 'GG0170I', name: 'Walk 10 Feet',    baseline: 3, worstShiftAverage: 2.0, declineMagnitude: 1.0, severity: 'mild' },
        { mdsKey: 'GG0130A', name: 'Eating',          baseline: 5, worstShiftAverage: 4.0, declineMagnitude: 1.0, severity: 'mild' },
      ],
    },
    scores: buildScores('demo-p-1001', [
      { mdsKey: 'GG0170D', name: 'Sit to Stand',    baseline: 4, worstShiftAverage: 2.3 },
      { mdsKey: 'GG0170F', name: 'Toilet Transfer', baseline: 4, worstShiftAverage: 2.0 },
      { mdsKey: 'GG0170I', name: 'Walk 10 Feet',    baseline: 3, worstShiftAverage: 2.0 },
      { mdsKey: 'GG0130A', name: 'Eating',          baseline: 5, worstShiftAverage: 4.0 },
      { mdsKey: 'GG0170B', name: 'Sit to Lying',    baseline: 4, worstShiftAverage: 3.7 },
    ]),
    snooze: null,
  },
  'demo-p-1002': {
    decline: {
      locationName: 'Unit 2 — 214-A',
      mdsArdDate: '2026-02-01',
      overallSeverity: 'severe',
      baselines: [
        { mdsKey: 'GG0170J', name: 'Walk 50 Feet',  value: 4, rawValue: '04' },
        { mdsKey: 'GG0170K', name: 'Walk 150 Feet', value: 4, rawValue: '04' },
      ],
      declines: [
        { mdsKey: 'GG0170J', name: 'Walk 50 Feet',  baseline: 4, worstShiftAverage: 1.7, declineMagnitude: 2.3, severity: 'severe' },
        { mdsKey: 'GG0170K', name: 'Walk 150 Feet', baseline: 4, worstShiftAverage: 1.7, declineMagnitude: 2.3, severity: 'severe' },
      ],
    },
    scores: buildScores('demo-p-1002', [
      { mdsKey: 'GG0170J', name: 'Walk 50 Feet',  baseline: 4, worstShiftAverage: 1.7 },
      { mdsKey: 'GG0170K', name: 'Walk 150 Feet', baseline: 4, worstShiftAverage: 1.7 },
    ]),
    snooze: null,
  },
  'demo-p-1003': {
    decline: {
      locationName: 'Unit 3 — 312-A',
      mdsArdDate: '2026-01-18',
      overallSeverity: 'severe',
      baselines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand', value: 3, rawValue: '03' },
        { mdsKey: 'GG0170B', name: 'Sit to Lying', value: 3, rawValue: '03' },
      ],
      declines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand', baseline: 3, worstShiftAverage: 1.3, declineMagnitude: 1.7, severity: 'severe' },
        { mdsKey: 'GG0170B', name: 'Sit to Lying', baseline: 3, worstShiftAverage: 1.0, declineMagnitude: 2.0, severity: 'severe' },
      ],
    },
    scores: buildScores('demo-p-1003', [
      { mdsKey: 'GG0170D', name: 'Sit to Stand', baseline: 3, worstShiftAverage: 1.3 },
      { mdsKey: 'GG0170B', name: 'Sit to Lying', baseline: 3, worstShiftAverage: 1.0 },
    ]),
    snooze: null,
  },
  'demo-p-1005': {
    decline: {
      locationName: 'Unit 1 — 104',
      mdsArdDate: '2026-01-28',
      overallSeverity: 'mild',
      baselines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand', value: 4, rawValue: '04' },
      ],
      declines: [
        { mdsKey: 'GG0170D', name: 'Sit to Stand', baseline: 4, worstShiftAverage: 3.3, declineMagnitude: 0.7, severity: 'mild' },
      ],
    },
    scores: buildScores('demo-p-1005', [
      { mdsKey: 'GG0170D', name: 'Sit to Stand', baseline: 4, worstShiftAverage: 3.3 },
    ]),
    snooze: null,
  },
};

// ── Synthetic GG detail for any patient not in the hand-authored map above ───
// The QM Board is driven by real anonymized HAR data (patient IDs like
// "txves9mhdu48"), so its residents never match the four demo-p-100X fixtures.
// Rather than error, deterministically fabricate a plausible decline story from
// the patientId so every board resident opens to a populated chart. Same
// patientId always yields the same charts (seeded PRNG — no Math.random).

const GG_ITEM_CATALOG = [
  { mdsKey: 'GG0170D', name: 'Sit to Stand' },
  { mdsKey: 'GG0170F', name: 'Toilet Transfer' },
  { mdsKey: 'GG0170I', name: 'Walk 10 Feet' },
  { mdsKey: 'GG0170J', name: 'Walk 50 Feet' },
  { mdsKey: 'GG0170K', name: 'Walk 150 Feet' },
  { mdsKey: 'GG0130A', name: 'Eating' },
  { mdsKey: 'GG0130B', name: 'Oral Hygiene' },
  { mdsKey: 'GG0170B', name: 'Sit to Lying' },
  { mdsKey: 'GG0170C', name: 'Lying to Sitting' },
  { mdsKey: 'GG0170E', name: 'Chair/Bed Transfer' },
];

const GG_LOCATIONS = [
  'Unit 1 — 104', 'Unit 1 — 118-A', 'Unit 2 — 214-A', 'Unit 2 — 221',
  'Unit 3 — 308-B', 'Unit 3 — 312-A', 'Unit 4 — 410-B', 'Unit 4 — 402',
];

const GG_ARD_DATES = [
  '2026-01-18', '2026-01-22', '2026-01-28', '2026-02-01',
  '2026-02-11', '2026-02-20', '2026-03-03', '2026-03-14',
];

function ggSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — small deterministic PRNG so the same patient renders the same
// charts across page loads (Math.random would reshuffle on every open).
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ggSeverity(mag) {
  if (mag >= 2) return 'severe';
  if (mag >= 1.3) return 'moderate';
  return 'mild';
}

export function buildGgDetailFor(patientId) {
  const rng = mulberry32(ggSeed(patientId));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const pool = [...GG_ITEM_CATALOG];
  const count = 2 + Math.floor(rng() * 3); // 2..4 items
  const chosen = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }

  const baselines = [];
  const declines = [];
  const scoreItems = [];
  let maxMag = 0;

  chosen.forEach((it, idx) => {
    const baseline = 3 + Math.floor(rng() * 3); // 3..5
    // First item always tells a real decline story; others vary.
    const mag = idx === 0
      ? +(1.3 + rng() * 1.0).toFixed(1)  // 1.3..2.3
      : +(0.7 + rng() * 1.6).toFixed(1); // 0.7..2.3
    const worst = Math.max(1, +(baseline - mag).toFixed(1));
    const declineMagnitude = +(baseline - worst).toFixed(1);
    if (declineMagnitude > maxMag) maxMag = declineMagnitude;

    baselines.push({
      mdsKey: it.mdsKey, name: it.name,
      value: baseline, rawValue: String(baseline).padStart(2, '0'),
    });
    if (declineMagnitude >= 1) {
      declines.push({
        mdsKey: it.mdsKey, name: it.name,
        baseline, worstShiftAverage: worst,
        declineMagnitude, severity: ggSeverity(declineMagnitude),
      });
    }
    scoreItems.push({ mdsKey: it.mdsKey, name: it.name, baseline, worstShiftAverage: worst });
  });

  return {
    decline: {
      locationName: pick(GG_LOCATIONS),
      mdsArdDate: pick(GG_ARD_DATES),
      overallSeverity: ggSeverity(maxMag),
      baselines,
      declines,
    },
    scores: buildScores(patientId, scoreItems),
    snooze: null,
  };
}

// ── 24-Hour Report fixtures ─────────────────────────────────────────────────
// List shape: { timezone, locationId, reports: [{ id, reportDate, status, counts }] }
// Day shape:  { report: { id, reportDate, status, counts, findings: [...] } }

const DAYS = ['2026-04-24', '2026-04-23', '2026-04-22', '2026-04-21', '2026-04-20', '2026-04-19', '2026-04-18'];

function finding(o) {
  return {
    id: o.id,
    patientId: o.patientId,
    patientName: o.patientName,
    room: o.room,
    severity: o.severity,
    category: o.category,
    subcategory: o.subcategory,
    finding: o.finding,
    narrative: o.narrative,
    timestamp: o.timestamp,
  };
}

const FINDINGS_BY_DAY = {
  '2026-04-24': [
    finding({ id: 'f-24-1',  patientId: 'demo-p-1003', patientName: 'Novak, Eleanor',  room: '312-A', severity: 'critical', category: 'Fall',         subcategory: 'Unwitnessed fall', finding: 'Unwitnessed floor-find at 0412', narrative: 'Resident found on floor beside bed; no LOC reported. Head-to-toe negative for major injury. Vitals stable. Neuro checks ×24h ordered.', timestamp: '2026-04-24T04:12:00Z' }),
    finding({ id: 'f-24-2',  patientId: 'demo-p-1001', patientName: 'Doe, Jane',       room: '308-B', severity: 'high',     category: 'GG decline',   subcategory: 'Transfers',        finding: 'Toilet Transfer: 4 → 2 avg on day shift', narrative: 'Three consecutive shifts charting max-assist for toileting; PT to reassess.', timestamp: '2026-04-24T07:45:00Z' }),
    finding({ id: 'f-24-3',  patientId: 'demo-p-2001', patientName: 'Cho, Lillian',    room: '205',   severity: 'high',     category: 'Infection',    subcategory: 'UTI — new',         finding: 'Positive UA; culture pending',                   narrative: 'Cloudy, foul-smelling urine. Leuk est large, nitrite positive. C&S sent. MD notified — awaiting order.', timestamp: '2026-04-24T02:30:00Z' }),
    finding({ id: 'f-24-4',  patientId: 'demo-p-5001', patientName: 'Simmons, Gerald', room: '216',   severity: 'medium',   category: 'Behavior',     subcategory: 'Verbal agitation', finding: 'Two episodes of loud verbal agitation overnight', narrative: 'Redirected with 1:1 reassurance. No physical aggression. Care plan updated.', timestamp: '2026-04-24T01:15:00Z' }),
    finding({ id: 'f-24-5',  patientId: 'demo-p-1002', patientName: 'Reyes, Marcus',   room: '214-A', severity: 'medium',   category: 'Pain',         subcategory: 'New onset',        finding: 'Reports 6/10 hip pain with ambulation', narrative: 'No acute signs on exam. PRN acetaminophen given with effect. PT informed.', timestamp: '2026-04-24T06:50:00Z' }),
    finding({ id: 'f-24-6',  patientId: 'demo-p-8001', patientName: 'Hollis, Margaret', room: '119',  severity: 'medium',   category: 'Skin',         subcategory: 'Pressure ulcer',   finding: 'Stage 2 sacral PU — unchanged', narrative: 'Wound re-measured; base clean, edges defined, no tunneling. Continue current orders.', timestamp: '2026-04-24T05:20:00Z' }),
    finding({ id: 'f-24-7',  patientId: 'demo-p-7001', patientName: 'Crane, Isobel',   room: '222',   severity: 'low',      category: 'Mood',         subcategory: 'Tearful episode',  finding: 'Tearful during AM care',                          narrative: 'Verbalized grief around recent family news. Social services notified.', timestamp: '2026-04-24T08:10:00Z' }),
    finding({ id: 'f-24-8',  patientId: 'demo-p-9001', patientName: 'Carver, Benjamin', room: '110',  severity: 'low',      category: 'Continence',   subcategory: 'New incontinence', finding: 'Two incontinence episodes on night shift',        narrative: 'Toileting schedule adjusted to Q2h. No s/s UTI at present.', timestamp: '2026-04-24T03:40:00Z' }),
  ],
  '2026-04-23': [
    finding({ id: 'f-23-1',  patientId: 'demo-p-4001', patientName: 'Blanchard, Martha', room: '228', severity: 'critical', category: 'Fall',         subcategory: 'Witnessed fall',  finding: 'Witnessed fall — no injury',                    narrative: 'Resident slid off chair while transferring; caught by CNA, no impact. Reinforced call-light use.', timestamp: '2026-04-23T14:22:00Z' }),
    finding({ id: 'f-23-2',  patientId: 'demo-p-2002', patientName: 'Aldridge, Robert',  room: '207', severity: 'high',     category: 'Infection',    subcategory: 'UTI — worsening',   finding: 'Increasing confusion + flank pain',             narrative: 'MD notified; UA ordered. ABX to start pending culture.', timestamp: '2026-04-23T09:05:00Z' }),
    finding({ id: 'f-23-3',  patientId: 'demo-p-6001', patientName: 'Grisham, Henry',    room: '121', severity: 'high',     category: 'Nutrition',    subcategory: 'Weight decline',    finding: '5.5% weight loss over 42d',                     narrative: 'Dietitian consulted; fortified meals + ensure BID started.', timestamp: '2026-04-23T12:00:00Z' }),
    finding({ id: 'f-23-4',  patientId: 'demo-p-1002', patientName: 'Reyes, Marcus',     room: '214-A', severity: 'medium', category: 'GG decline',   subcategory: 'Ambulation',       finding: 'Walk 50 Feet: 4 → 2 on day shift',              narrative: 'PT reports steady decline over 10 days; equipment reassessment scheduled.', timestamp: '2026-04-23T15:30:00Z' }),
    finding({ id: 'f-23-5',  patientId: 'demo-p-1005', patientName: 'Shankar, Priya',    room: '104', severity: 'low',      category: 'Behavior',     subcategory: 'Restlessness',     finding: 'Restlessness after supper',                     narrative: 'Redirected with music therapy; settled within 15 min.', timestamp: '2026-04-23T19:10:00Z' }),
    finding({ id: 'f-23-6',  patientId: 'demo-p-7002', patientName: 'Bateson, Clifford', room: '223', severity: 'low',      category: 'Mood',         subcategory: 'Withdrawn',        finding: 'Declined group activity',                       narrative: 'Verbalized fatigue. No new mood complaints elicited.', timestamp: '2026-04-23T16:40:00Z' }),
  ],
  '2026-04-22': [
    finding({ id: 'f-22-1',  patientId: 'demo-p-1001', patientName: 'Doe, Jane',         room: '308-B', severity: 'high',   category: 'GG decline',   subcategory: 'Ambulation',       finding: 'Walk 10 Feet: 3 → 2',                           narrative: 'Required contact guard assist for short distance. Had independently ambulated 2 weeks prior.', timestamp: '2026-04-22T11:00:00Z' }),
    finding({ id: 'f-22-2',  patientId: 'demo-p-3001', patientName: 'Okafor, Samuel',    room: '302',   severity: 'medium', category: 'Urinary',      subcategory: 'Foley flow',       finding: 'Decreased Foley output × 4h',                   narrative: 'Bladder scan 120mL. Flushed per protocol with good return.', timestamp: '2026-04-22T22:05:00Z' }),
    finding({ id: 'f-22-3',  patientId: 'demo-p-5002', patientName: 'Vega, Alma',        room: '218',   severity: 'medium', category: 'Behavior',     subcategory: 'Refused meds',      finding: 'Refused evening meds',                          narrative: 'Offered with snack; accepted 2nd attempt.', timestamp: '2026-04-22T20:45:00Z' }),
    finding({ id: 'f-22-4',  patientId: 'demo-p-8001', patientName: 'Hollis, Margaret',  room: '119',   severity: 'low',    category: 'Skin',         subcategory: 'Routine',           finding: 'Skin check documented',                         narrative: 'No new findings. Continue pressure-relief schedule.', timestamp: '2026-04-22T09:15:00Z' }),
  ],
  '2026-04-21': [
    finding({ id: 'f-21-1',  patientId: 'demo-p-1003', patientName: 'Novak, Eleanor',    room: '312-A', severity: 'high',   category: 'GG decline',   subcategory: 'Transfers',        finding: 'Sit to Stand: 3 → 1',                            narrative: 'Required max assist for sit-to-stand after period of independence.', timestamp: '2026-04-21T08:30:00Z' }),
    finding({ id: 'f-21-2',  patientId: 'demo-p-5003', patientName: 'Pritchard, Vance',  room: '225',   severity: 'medium', category: 'Medication',   subcategory: 'Antipsychotic',     finding: 'New Quetiapine order',                           narrative: 'Started 25mg PO QHS for sleep disturbance — GDR attempt planned in 2 weeks.', timestamp: '2026-04-21T13:10:00Z' }),
  ],
  '2026-04-20': [
    finding({ id: 'f-20-1', patientId: 'demo-p-6001', patientName: 'Grisham, Henry',    room: '121',   severity: 'medium', category: 'Nutrition',    subcategory: 'Poor intake',       finding: 'Ate <25% of last 3 meals',                        narrative: 'Dietitian to follow-up in AM. Preferences review scheduled.', timestamp: '2026-04-20T18:00:00Z' }),
    finding({ id: 'f-20-2', patientId: 'demo-p-9001', patientName: 'Carver, Benjamin',  room: '110',   severity: 'low',    category: 'Fall',         subcategory: 'Near-miss',         finding: 'Near-miss on transfer',                            narrative: 'Slipped during wheelchair transfer; steadied by CNA. No injury. Re-education provided.', timestamp: '2026-04-20T11:20:00Z' }),
  ],
  '2026-04-19': [
    finding({ id: 'f-19-1', patientId: 'demo-p-1004', patientName: 'Park, Harold',     room: '309',    severity: 'medium', category: 'GG decline',   subcategory: 'Transfers',        finding: 'Toilet Transfer: 5 → 3',                          narrative: 'New decline over weekend — therapy to evaluate.', timestamp: '2026-04-19T10:05:00Z' }),
  ],
  '2026-04-18': [
    finding({ id: 'f-18-1', patientId: 'demo-p-7002', patientName: 'Bateson, Clifford', room: '223',   severity: 'low',    category: 'Mood',         subcategory: 'Withdrawn',         finding: 'Declined therapy session',                         narrative: 'Verbalized fatigue; will reoffer tomorrow.', timestamp: '2026-04-18T15:40:00Z' }),
  ],
};

function countsFor(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    const sev = (f.severity || '').toLowerCase();
    if (sev in c) c[sev] += 1;
  }
  return c;
}

export function buildReportList() {
  return {
    timezone: FACILITY_TZ,
    locationId: 'demo-loc-1',
    reports: DAYS.map(date => ({
      id: `demo-report-${date}`,
      reportDate: date,
      facilityDate: date,
      status: 'final',
      counts: countsFor(FINDINGS_BY_DAY[date] || []),
    })),
  };
}

export function buildReportForDate(date) {
  const findings = FINDINGS_BY_DAY[date];
  if (!findings) return null;
  return {
    id: `demo-report-${date}`,
    reportDate: date,
    facilityDate: date,
    status: 'final',
    counts: countsFor(findings),
    findings,
  };
}
