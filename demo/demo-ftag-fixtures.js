/**
 * demo-ftag-fixtures.js — fabricated F-Tag Prevention (Survey Readiness) data
 * for the demo. Nothing real was captured for this module, so this is
 * clinically-plausible synthetic data shaped to match
 * content/modules/ftag-prevention (see utils/derive.js for the finding shape and
 * components/sources/* for the per-source viewers).
 *
 * Covers all 8 catalog tags, every severity tier, every source kind
 * (mar | vitals | order | notes | document | none), and a spread of dates so the
 * tag-filter cards, severity filter, and Today/Yesterday/This-week/Older
 * sections all populate. Resident names are invented.
 *
 * Endpoints served (via demo-mock-chrome.js):
 *   GET  /ftag-prevention/module-status
 *   GET  /ftag-prevention/findings?status=open|snoozed
 *   GET  /ftag-prevention/findings/[id]/mar
 *   GET  /extension/vitals?patientId&vitalType
 *   POST /ftag-prevention/findings/[id]/{resolve,snooze,reopen}  (no-op)
 */

const DAY = 86400000;
const HOUR = 3600000;
// Evaluated in the browser at load time, so date buckets land relative to "now".
const NOW = Date.now();
const iso = (ms) => new Date(NOW - ms).toISOString();
const ymd = (ms) => new Date(NOW - ms).toISOString().slice(0, 10);

/**
 * One feed item in the wire shape useFtagFindings expects:
 *   { finding: { id, tag, severity, acute, triggeredAt, pccPatientId, rationale,
 *                data: { patientName, ... } }, status, source }
 */
function f({ id, tag, severity, acute = false, agoMs, pccPatientId, patientName, data = {}, rationale, source = { kind: 'none' }, extra = {} }) {
  return {
    finding: {
      id,
      tag,
      severity,
      acute,
      triggeredAt: iso(agoMs),
      pccPatientId,
      rationale,
      data: { patientName, ...data },
      ...extra,
    },
    status: 'open',
    source,
  };
}

// ── OPEN feed ────────────────────────────────────────────────────────────────
const OPEN = [
  // Today
  f({
    id: 'ftg-001', tag: 'F684', severity: 'critical', acute: true, agoMs: 3 * HOUR,
    pccPatientId: '2657226', patientName: 'Hartwell, Margaret',
    data: { drug: 'Insulin Aspart', refusalCount: 33, criticalClass: 'INSULIN',
      firstRefusal: ymd(13 * DAY), lastRefusal: ymd(4 * HOUR), windowDays: 14 },
    rationale: 'Sliding-scale Insulin Aspart refused 33× in 14 days with no provider notification documented. Repeated refusals of a critical medication are a Quality of Care concern.',
    source: { kind: 'mar' },
  }),
  f({
    id: 'ftg-002', tag: 'F580', severity: 'high', acute: true, agoMs: 6 * HOUR,
    pccPatientId: '2911044', patientName: 'Pennington, Harold',
    data: { vitalType: 'pulse', value: '134', rawValue: 134, takenAt: iso(34 * HOUR), hoursWithoutNote: 28 },
    rationale: 'Heart rate 134 bpm recorded with no clinical note or provider notification within 24 hours.',
    source: { kind: 'vitals', patientId: 'pt-002', vitalType: 'pulse',
      highlightVitalIds: ['v-002-7'], around: ymd(34 * HOUR),
      dateRange: { start: ymd(10 * DAY), end: ymd(0) } },
  }),
  f({
    id: 'ftg-003', tag: 'F580', severity: 'high', acute: true, agoMs: 10 * HOUR,
    pccPatientId: '2740019', patientName: 'Nakamura, Bernice',
    data: { vitalType: 'oxygen_saturation', value: '86', rawValue: 86, takenAt: iso(11 * HOUR), hoursWithoutNote: 9 },
    rationale: 'O₂ saturation 86% with no documented assessment or notification within the window.',
    source: { kind: 'vitals', patientId: 'pt-003', vitalType: 'oxygen_saturation',
      highlightVitalIds: ['v-003-6'], around: ymd(11 * HOUR),
      dateRange: { start: ymd(7 * DAY), end: ymd(0) } },
  }),
  f({
    id: 'ftg-004', tag: 'F678', severity: 'critical', agoMs: 20 * HOUR,
    pccPatientId: '2655510', patientName: 'Castellano, Dorothy',
    data: {
      sources: [
        { source: 'pcc_record', normalized: 'full_code' },
        { source: 'order', normalized: 'dnr', rawValue: 'DNR — physician order, signed 2026-04-02 by Dr. A. Mensah' },
        { source: 'care_plan', normalized: 'full_code', rawValue: 'Code Status: Full Code',
          goals: ['Resident code-status wishes honored at all times'],
          interventions: ['Confirm code status on admission and quarterly', 'Notify on-call MD of any change'] },
      ],
      staleSources: [],
      conflictingSources: ['order', 'care_plan'],
    },
    rationale: 'Physician DNR order conflicts with a Full Code chart record and care plan. Reconcile before any event.',
  }),

  // Yesterday
  f({
    id: 'ftg-005', tag: 'F697', severity: 'high', agoMs: 1 * DAY + 4 * HOUR,
    pccPatientId: '2655510', patientName: 'Whitfield, Walter',
    data: { drug: 'Oxycodone 5 mg', criticalClass: 'OPIOID' },
    rationale: 'PRN Oxycodone given 9× in 7 days; pain-reassessment / effectiveness not charted for 6 of those administrations.',
    source: { kind: 'mar' },
  }),
  f({
    id: 'ftg-006', tag: 'F692', severity: 'high', agoMs: 1 * DAY + 8 * HOUR,
    pccPatientId: '2733301', patientName: 'Brennan, Evelyn',
    data: { weightLossPct: 7.4, w30date: ymd(30 * DAY), w180date: ymd(180 * DAY), latestdate: ymd(2 * DAY) },
    rationale: 'Significant weight loss (7.4% over 30 days) with no documented dietary intervention or MD notification.',
    source: { kind: 'vitals', patientId: 'pt-006', vitalType: 'weight',
      highlightVitalIds: ['w-006-1', 'w-006-4'], around: ymd(2 * DAY),
      dateRange: { start: ymd(190 * DAY), end: ymd(0) } },
  }),
  f({
    id: 'ftg-007', tag: 'F684', severity: 'high', agoMs: 1 * DAY + 11 * HOUR,
    pccPatientId: '2810077', patientName: 'Delacroix, Stanley',
    data: { drug: 'Warfarin 5 mg', refusalCount: 6, criticalClass: 'ANTICOAGULANT',
      firstRefusal: ymd(9 * DAY), lastRefusal: ymd(1 * DAY), windowDays: 10 },
    rationale: 'Warfarin refused 6× in 10 days. INR-critical medication; refusals not addressed in notes.',
    source: { kind: 'mar' },
  }),

  // Earlier this week
  f({
    id: 'ftg-008', tag: 'F758', severity: 'standard', agoMs: 3 * DAY,
    pccPatientId: '2655801', patientName: 'Lindqvist, Raymond',
    data: { drug: 'Quetiapine 50 mg', medClass: 'ANTIPSYCHOTIC' },
    rationale: 'Long-term antipsychotic (Quetiapine) with no gradual dose reduction (GDR) attempt or documented clinical contraindication in the last 6 months.',
    source: { kind: 'order', orderId: 'ORD-558123', patientId: 'pt-008' },
  }),
  f({
    id: 'ftg-009', tag: 'F756', severity: 'standard', agoMs: 3 * DAY + 6 * HOUR,
    pccPatientId: '2733914', patientName: 'Okonkwo, Gloria',
    data: {},
    rationale: 'Pharmacist drug-regimen review last completed 71 days ago — overdue (>60 days).',
    source: { kind: 'notes', query: 'pharmacist drug regimen review', around: ymd(71 * DAY) },
  }),
  f({
    id: 'ftg-010', tag: 'F580', severity: 'standard', agoMs: 4 * DAY,
    pccPatientId: '2811200', patientName: 'Vandermeer, Mildred',
    data: { vitalType: 'blood_sugar', value: '412', rawValue: 412, takenAt: iso(4 * DAY + 2 * HOUR), hoursWithoutNote: 14 },
    rationale: 'Blood glucose 412 mg/dL with no documented response within the window.',
    source: { kind: 'vitals', patientId: 'pt-010', vitalType: 'blood_sugar',
      highlightVitalIds: ['v-010-3'], around: ymd(4 * DAY),
      dateRange: { start: ymd(10 * DAY), end: ymd(0) } },
  }),

  // Older
  f({
    id: 'ftg-011', tag: 'F758', severity: 'high', agoMs: 9 * DAY,
    pccPatientId: '2655999', patientName: 'Ferraro, Frances',
    data: { drug: 'Lorazepam 1 mg', medClass: 'BENZODIAZEPINE' },
    rationale: 'Long-term benzodiazepine (Lorazepam) without a documented taper plan or GDR rationale.',
    source: { kind: 'order', orderId: 'ORD-547781', patientId: 'pt-011' },
  }),
  f({
    id: 'ftg-012', tag: 'F697', severity: 'standard', agoMs: 12 * DAY,
    pccPatientId: '2740550', patientName: 'Castillo, Eugene',
    data: { drug: 'Hydromorphone 2 mg', criticalClass: 'OPIOID' },
    rationale: 'PRN Hydromorphone effectiveness not charted for 4 administrations.',
    source: { kind: 'mar' },
  }),
  f({
    id: 'ftg-013', tag: 'F692', severity: 'standard', agoMs: 14 * DAY,
    pccPatientId: '2733120', patientName: 'Goldstein, Clarence',
    data: { weightLossPct: 5.1, w30date: ymd(31 * DAY), latestdate: ymd(14 * DAY) },
    rationale: 'Weight loss 5.1% over 30 days; trending down. Review intake and consider dietitian referral.',
  }),
  f({
    id: 'ftg-014', tag: 'F883', severity: 'low', agoMs: 16 * DAY,
    pccPatientId: '2811455', patientName: 'Calloway, Doris',
    data: {},
    rationale: 'Influenza vaccine not documented for the current season and pneumococcal (PPSV23) status unknown. Offer/educate and document.',
  }),
];

// ── SNOOZED ──────────────────────────────────────────────────────────────────
const SNOOZED = [
  {
    finding: {
      id: 'ftg-101', tag: 'F758', severity: 'standard',
      triggeredAt: iso(8 * DAY), pccPatientId: '2655801', rationale: 'GDR review scheduled at next care conference.',
      data: { patientName: 'Rosenthal, Howard', drug: 'Risperidone 0.5 mg', medClass: 'ANTIPSYCHOTIC' },
      snoozedAt: iso(2 * DAY), snoozedBy: 'j.alvarez, RN', snoozedUntil: ymd(-5 * DAY),
    },
    status: 'snoozed',
    source: { kind: 'order', orderId: 'ORD-551020', patientId: 'pt-101' },
  },
  {
    finding: {
      id: 'ftg-102', tag: 'F684', severity: 'high',
      triggeredAt: iso(6 * DAY), pccPatientId: '2740019', rationale: 'Provider aware; awaiting endocrine consult.',
      data: { patientName: 'Petrov, Irene', drug: 'Metformin 500 mg', refusalCount: 5, criticalClass: 'ANTIDIABETIC', windowDays: 7 },
      snoozedAt: iso(1 * DAY), snoozedBy: 'm.chen, RN', snoozedUntil: ymd(-2 * DAY),
    },
    status: 'snoozed',
    source: { kind: 'mar' },
  },
];

// ── RECENTLY RESOLVED ────────────────────────────────────────────────────────
const RESOLVED = [
  {
    id: 'ftg-201', tag: 'F580', severity: 'high', triggeredAt: iso(2 * DAY),
    pccPatientId: '2911044', resolutionType: 'progress_note',
    resolvedAt: iso(20 * HOUR), resolvedBy: 's.kim, RN',
    data: { patientName: 'Sandoval, Vivian', vitalType: 'temperature', value: '101.8' },
    source: { kind: 'vitals', patientId: 'pt-201', vitalType: 'temperature',
      dateRange: { start: ymd(7 * DAY), end: ymd(0) } },
  },
  {
    id: 'ftg-202', tag: 'F697', severity: 'standard', triggeredAt: iso(3 * DAY),
    pccPatientId: '2740550', resolutionType: 'resolved',
    resolvedAt: iso(1 * DAY), resolvedBy: 'd.okafor, RN',
    data: { patientName: 'Buchholz, Arthur', drug: 'Acetaminophen 650 mg', criticalClass: 'ANALGESIC' },
    source: { kind: 'mar' },
  },
  {
    id: 'ftg-203', tag: 'F883', severity: 'low', triggeredAt: iso(5 * DAY),
    pccPatientId: '2811455', resolutionType: 'no_action',
    resolvedAt: iso(2 * DAY), resolvedBy: 'l.barnes, LPN',
    data: { patientName: 'Larkin, Beatrice' },
  },
];

// ── MAR/TAR source data, keyed by finding id ─────────────────────────────────
// Shape consumed by MarViewer's FallbackTable (the demo doesn't load the vanilla
// admin-grid builders): { order, adminRecords:[{ id, name, instructions, events }], dateRange }.
function marEvents({ days, startMs, drug, refusePattern }) {
  const events = [];
  for (let i = 0; i < days; i++) {
    const dateMs = startMs - i * DAY;
    // two scheduled times per day
    for (const time of ['08:00', '20:00']) {
      const refused = refusePattern(i, time);
      events.push({
        id: `${drug}-${i}-${time}`,
        date: ymd(dateMs),
        time,
        status: refused ? 'refused' : 'given',
        value: refused ? 'Resident refused' : 'Administered',
        chartCode: refused ? '2' : null,
        staffInitials: refused ? 'JA' : ['MC', 'SK', 'DO'][i % 3],
      });
    }
  }
  return events;
}

const MAR_BY_FINDING = {
  'ftg-001': {
    order: { name: 'Insulin Aspart (NovoLog) — sliding scale', category: 'Medication', status: 'Active',
      directions: 'Per sliding scale before meals and at bedtime. Hold if resident refuses; notify provider for repeated refusals.' },
    dateRange: { startDate: ymd(13 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-001', name: 'Insulin Aspart (NovoLog)',
      instructions: 'Sliding scale AC + HS',
      events: marEvents({ days: 14, startMs: 0, drug: 'insulin', refusePattern: (i) => i % 2 === 0 || i % 3 === 0 }),
    }],
  },
  'ftg-005': {
    order: { name: 'Oxycodone 5 mg', category: 'Medication', status: 'Active',
      directions: 'PRN q6h for moderate–severe pain. Reassess and chart effectiveness within 60 min.' },
    dateRange: { startDate: ymd(7 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-005', name: 'Oxycodone 5 mg (PRN)',
      instructions: 'PRN q6h — chart pain reassessment',
      events: marEvents({ days: 7, startMs: 0, drug: 'oxy', refusePattern: () => false }),
    }],
  },
  'ftg-007': {
    order: { name: 'Warfarin 5 mg', category: 'Medication', status: 'Active',
      directions: 'Daily at 17:00. INR-dependent. Notify provider for any refusal.' },
    dateRange: { startDate: ymd(9 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-007', name: 'Warfarin 5 mg',
      instructions: 'Daily 17:00',
      events: marEvents({ days: 10, startMs: 0, drug: 'warf', refusePattern: (i, t) => t === '20:00' && i % 2 === 0 }),
    }],
  },
  'ftg-012': {
    order: { name: 'Hydromorphone 2 mg', category: 'Medication', status: 'Active',
      directions: 'PRN q4h for breakthrough pain. Chart effectiveness.' },
    dateRange: { startDate: ymd(14 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-012', name: 'Hydromorphone 2 mg (PRN)',
      instructions: 'PRN q4h',
      events: marEvents({ days: 6, startMs: 12 * DAY, drug: 'hydro', refusePattern: () => false }),
    }],
  },
  // snoozed F684 (MAR shown if the nurse opens source from the snoozed tab)
  'ftg-102': {
    order: { name: 'Metformin 500 mg', category: 'Medication', status: 'Active',
      directions: 'BID with meals.' },
    dateRange: { startDate: ymd(7 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-102', name: 'Metformin 500 mg',
      instructions: 'BID',
      events: marEvents({ days: 7, startMs: 0, drug: 'metf', refusePattern: (i) => i % 3 === 0 }),
    }],
  },
  'ftg-202': {
    order: { name: 'Acetaminophen 650 mg', category: 'Medication', status: 'Active',
      directions: 'PRN q6h for mild pain.' },
    dateRange: { startDate: ymd(5 * DAY), endDate: ymd(0) },
    adminRecords: [{
      id: 'rec-ftg-202', name: 'Acetaminophen 650 mg (PRN)',
      instructions: 'PRN q6h',
      events: marEvents({ days: 5, startMs: 0, drug: 'apap', refusePattern: () => false }),
    }],
  },
};

// ── Vitals source data, keyed by patientId ───────────────────────────────────
// Shape: { vitals: [{ id, vitalType, value, numericValue, effectiveDate }] }
function vseries({ patientId, vitalType, unit, base, spike, spikeIdx, count = 8, stepDays = 1 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = i === spikeIdx ? spike : Math.round((base + (Math.sin(i) * base * 0.06)) * 10) / 10;
    out.push({
      id: `v-${patientId.replace('pt-', '')}-${count - i}`,
      vitalType,
      value: `${n}${unit}`,
      numericValue: n,
      effectiveDate: iso(((count - 1 - i) * stepDays) * DAY + 6 * HOUR),
    });
  }
  return out;
}

const VITALS_BY_PATIENT = {
  'pt-002': { vitals: vseries({ patientId: 'pt-002', vitalType: 'pulse', unit: ' bpm', base: 78, spike: 134, spikeIdx: 7 }) },
  'pt-003': { vitals: vseries({ patientId: 'pt-003', vitalType: 'oxygen_saturation', unit: '%', base: 95, spike: 86, spikeIdx: 6, count: 7 }) },
  'pt-006': { vitals: [
    { id: 'w-006-7', vitalType: 'weight', value: '171 lb', numericValue: 171, effectiveDate: iso(180 * DAY) },
    { id: 'w-006-6', vitalType: 'weight', value: '169 lb', numericValue: 169, effectiveDate: iso(120 * DAY) },
    { id: 'w-006-5', vitalType: 'weight', value: '168 lb', numericValue: 168, effectiveDate: iso(60 * DAY) },
    { id: 'w-006-4', vitalType: 'weight', value: '165 lb', numericValue: 165, effectiveDate: iso(30 * DAY) },
    { id: 'w-006-3', vitalType: 'weight', value: '161 lb', numericValue: 161, effectiveDate: iso(16 * DAY) },
    { id: 'w-006-2', vitalType: 'weight', value: '158 lb', numericValue: 158, effectiveDate: iso(8 * DAY) },
    { id: 'w-006-1', vitalType: 'weight', value: '153 lb', numericValue: 153, effectiveDate: iso(2 * DAY) },
  ] },
  'pt-010': { vitals: vseries({ patientId: 'pt-010', vitalType: 'blood_sugar', unit: ' mg/dL', base: 142, spike: 412, spikeIdx: 5, count: 8 }) },
  'pt-201': { vitals: vseries({ patientId: 'pt-201', vitalType: 'temperature', unit: '°F', base: 98.4, spike: 101.8, spikeIdx: 6, count: 7 }) },
};

// ── Public builders (consumed by demo-mock-chrome.js) ────────────────────────

export const FTAG_MODULE_STATUS = { enabled: true, facilityName: 'Sunny Meadows Demo Facility' };

export function buildFtagFindings(status) {
  if (status === 'snoozed') return { feed: SNOOZED };
  if (status === 'resolved') return { feed: [], recentlyResolved: RESOLVED };
  return { feed: OPEN, recentlyResolved: RESOLVED };
}

export function buildFtagMar(findingId) {
  return MAR_BY_FINDING[findingId] || null;
}

export function buildFtagVitals(patientId) {
  return VITALS_BY_PATIENT[patientId] || { vitals: [] };
}
