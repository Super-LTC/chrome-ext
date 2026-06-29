import { describe, it, expect } from 'vitest';
import { buildInhouseView, buildInhouseCalendar, bucketClearable, clearBucketOf } from '../qm-inhouse-view.js';

const TODAY = '2026-06-25';

function measure(id, over = {}) {
  return {
    id,
    label: id,
    applicable: true,
    triggers: true,
    excluded: false,
    evidence: [],
    ...over,
  };
}

function row(patientId, lastName, measures) {
  return {
    patientId,
    externalPatientId: null,
    firstName: 'F',
    lastName,
    admissionDate: null,
    payerClassification: null,
    stayType: 'long',
    currentMedicareDay: null,
    cdif: 150,
    target: { assessmentId: 't', ardDate: '2026-06-20', type: 'Quarterly', obraType: null, is5Day: false, isPpsDischarge: false },
    measures,
    triggeringCount: measures.filter((m) => m.triggers).length,
    nextObraPreview: { wouldClear: [], wouldNotClear: [] },
  };
}

function hit(id, over = {}) {
  return {
    id,
    label: id,
    nonCms: false,
    bucket: 'preventable',
    crossingDate: '2026-07-15',
    daysUntilCrossing: 20,
    urgency: 'routine',
    evidence: [],
    ...over,
  };
}

function crosser(patientId, lastName, hits) {
  return {
    patientId,
    externalPatientId: null,
    firstName: 'F',
    lastName,
    cdif: 80,
    crossingDate: hits[0]?.crossingDate ?? '2026-07-15',
    daysUntilCrossing: hits[0]?.daysUntilCrossing ?? 20,
    longStayTarget: null,
    projectedHits: hits,
    projectedDeltas: [],
  };
}

function alert(id, over = {}) {
  return {
    id,
    category: 'event',
    label: id,
    latestSignalDate: '2026-06-24',
    suppressedByExistingCoding: false,
    suggestedAction: 'do x',
    ...over,
  };
}

function board(p) {
  return {
    currentlyTriggering: {
      patients: p.patients ?? [],
      summary: {},
      measuresEvaluated: (p.measuresEvaluated ?? []).map((id) => ({ id, label: id, appliesTo: [], clearProfile: {}, nonCms: false })),
      generatedAt: '',
      facilityDate: TODAY,
      facilityState: null,
    },
    upcoming: {
      upcomingPatients: p.upcoming ?? [],
      beyondHorizon: p.beyondHorizon ?? 0,
      facilityRates: [],
      generatedAt: '',
      facilityDate: TODAY,
    },
    alerts: { patients: p.alertPatients ?? [] },
  };
}

describe('buildInhouseView — clearable worklist', () => {
  it('emits clearable rows with a countdown, sorts soonest-clearing first, and excludes discharge function', () => {
    const b = board({
      patients: [
        row('p1', 'Aaa', [
          measure('uti', {
            clearability: 'time_based',
            clearGuidance: { actionType: 'time', clearsOnNextObra: true, actions: [] },
            cliffInfo: {
              cliffDate: '2026-07-05',
              cliffLabel: 'UTI ages out',
              cliffType: 'point_in_time',
              earliestClearDate: '2026-07-05',
              daysUntilCliff: 10,
              clearableBeforeCliff: false,
              urgency: 'routine',
              clearPathLabel: '',
            },
          }),
          measure('catheter', {
            clearability: 'clear_now',
            clearGuidance: { actionType: 'modification', clearsOnNextObra: true, actions: [{ label: 're-code' }] },
          }),
          // discharge function triggers but is NOT clearable by a nurse → must be dropped
          measure('discharge_function', { clearability: 'stay_locked' }),
        ]),
      ],
    });
    const v = buildInhouseView(b, 'five_star', null);
    expect(v.clearable.map((r) => r.entry.id)).toEqual(['catheter', 'uti']); // DFS excluded; clear-now first
    expect(v.triggeringResidents).toBe(1);
    expect(v.clearable[0].daysUntilClear).toBe(0); // clear_now → today
    expect(v.clearable[1].daysUntilClear).toBe(10); // derived from earliestClearDate vs today
    expect(v.clearable[1].clearShort).toBe('Clears in 10d');
  });

  it('drops measures outside the lens (state-survey noise) and the resident if nothing remains', () => {
    const b = board({ patients: [row('p1', 'Bbb', [measure('behavior_symptoms', { clearability: 'clear_now' })])] });
    const v = buildInhouseView(b, 'five_star', null);
    expect(v.clearable).toHaveLength(0);
    expect(v.triggeringResidents).toBe(0);
    expect(v.totalResidents).toBe(1);
  });
});

describe('buildInhouseView — about to cross', () => {
  it('sorts by crossing date, marks preventable, carries the prevent deadline, and lens-filters', () => {
    const b = board({
      upcoming: [
        crosser('c1', 'Zzz', [hit('antipsychotic_long', { bucket: 'preventable', crossingDate: '2026-07-19', daysUntilCrossing: 24, preventDeadline: '2026-07-12' })]),
        crosser('c2', 'Yyy', [hit('falls_major_injury', { bucket: 'unavoidable', crossingDate: '2026-07-12', daysUntilCrossing: 17 })]),
      ],
      beyondHorizon: 16,
    });
    const v = buildInhouseView(b, 'five_star', null);
    expect(v.aboutToCross).toHaveLength(2);
    // soonest crossing first
    expect(v.aboutToCross[0].hit.id).toBe('falls_major_injury');
    expect(v.aboutToCross[0].preventable).toBe(false);
    expect(v.aboutToCross[1].hit.id).toBe('antipsychotic_long');
    expect(v.aboutToCross[1].preventable).toBe(true);
    expect(v.aboutToCross[1].preventDeadline).toBe('2026-07-12');
    expect(v.crossLaterCount).toBe(16);
  });
});

describe('buildInhouseCalendar', () => {
  it('plots clears on clearDate (clear-now → today) and crossers on prevent-by / crossing date, sorted', () => {
    const b = board({
      patients: [
        row('p1', 'Aaa', [
          measure('catheter', {
            clearability: 'clear_now',
            clearGuidance: { actionType: 'modification', clearsOnNextObra: true, actions: [{ label: 're-code' }] },
          }),
          measure('uti', {
            clearability: 'time_based',
            clearGuidance: { actionType: 'time', clearDate: '2026-07-10', daysUntilClear: 15, clearsOnNextObra: true, actions: [] },
            cliffInfo: { cliffDate: '2026-07-10', cliffLabel: '', cliffType: 'point_in_time', earliestClearDate: '2026-07-10', daysUntilCliff: 15, clearableBeforeCliff: false, urgency: 'routine', clearPathLabel: '' },
          }),
        ]),
      ],
      upcoming: [
        crosser('c1', 'Zzz', [hit('antipsychotic_long', { bucket: 'preventable', crossingDate: '2026-07-19', daysUntilCrossing: 24, preventDeadline: '2026-07-12' })]),
        crosser('c2', 'Yyy', [hit('falls_major_injury', { bucket: 'unavoidable', crossingDate: '2026-07-05', daysUntilCrossing: 10 })]),
      ],
    });
    const cal = buildInhouseCalendar(b, 'five_star', null);
    const byKey = Object.fromEntries(cal.items.map((i) => [i.key, i]));
    expect(byKey['clear:p1:catheter'].date).toBe(TODAY); // clear-now → today
    expect(byKey['clear:p1:uti'].date).toBe('2026-07-10');
    expect(byKey['cross:c1:antipsychotic_long'].date).toBe('2026-07-12'); // prevent-by, not crossing
    expect(byKey['cross:c1:antipsychotic_long'].note).toBe('prevent by');
    expect(byKey['cross:c2:falls_major_injury'].date).toBe('2026-07-05'); // unavoidable → crossing date
    // sorted ascending by date
    const dates = cal.items.map((i) => i.date);
    expect([...dates]).toEqual([...dates].sort());
  });
});

describe('buildInhouseView — signal banner', () => {
  it('groups by type, pluralizes, and excludes suppressed + snoozed', () => {
    const b = board({
      alertPatients: [
        { patientId: 'p1', events: [alert('uti_dx'), alert('antipsychotic_order')], canaries: [alert('ua_canary')] },
        {
          patientId: 'p2',
          events: [alert('uti_dx')],
          canaries: [alert('uti_dx', { snooze: { id: 's', snoozedUntil: '2026-12-01', reason: null, createdAt: '2026-06-01' } })],
        },
        { patientId: 'p3', events: [alert('antipsychotic_order', { suppressedByExistingCoding: true })], canaries: [] },
      ],
    });
    const v = buildInhouseView(b, 'five_star', null);
    // uti_dx: p1 + p2 = 2 (p2's snoozed one excluded); antipsychotic_order: p1 = 1 (p3 suppressed); ua_canary: 1
    expect(v.signalTotal).toBe(4);
    const uti = v.signals.find((s) => s.id === 'uti_dx');
    expect(uti.count).toBe(2);
    expect(uti.label).toBe('new UTIs');
    expect(uti.patientIds.sort()).toEqual(['p1', 'p2']);
    const anti = v.signals.find((s) => s.id === 'antipsychotic_order');
    expect(anti.count).toBe(1);
    expect(anti.label).toBe('new antipsychotic');
    // biggest bucket first
    expect(v.signals[0].id).toBe('uti_dx');
  });
});

describe('bucketClearable — clinical never pollutes Today', () => {
  const clearRow = (over) => ({
    key: 'k', patient: {}, entry: {}, patientName: 'X', measureLabel: 'M',
    clearShort: '', clearKind: 'now', daysUntilClear: 0, ardDate: null, ...over,
  });

  it('routes conditional (clinical/Dx-query) rows to the clinical group, not Today — even at d=0', () => {
    expect(clearBucketOf(clearRow({ clearKind: 'conditional', daysUntilClear: 0 }))).toBe('clinical');
    expect(clearBucketOf(clearRow({ clearKind: 'now', daysUntilClear: 0 }))).toBe('today');
    expect(clearBucketOf(clearRow({ clearKind: 'date', daysUntilClear: 0 }))).toBe('today');
    expect(clearBucketOf(clearRow({ clearKind: 'date', daysUntilClear: 3 }))).toBe('week');
    expect(clearBucketOf(clearRow({ clearKind: 'date', daysUntilClear: 20 }))).toBe('month');
    expect(clearBucketOf(clearRow({ clearKind: 'wait', daysUntilClear: null }))).toBe('later');
  });

  it('groups into ordered, non-empty buckets with clinical separated from Today', () => {
    const buckets = bucketClearable([
      clearRow({ clearKind: 'conditional', daysUntilClear: 0 }),
      clearRow({ clearKind: 'now', daysUntilClear: 0 }),
      clearRow({ clearKind: 'date', daysUntilClear: 5 }),
      clearRow({ clearKind: 'wait', daysUntilClear: null }),
    ]);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.rows.length]));
    expect(byKey).toEqual({ today: 1, week: 1, clinical: 1, later: 1 });
    expect(buckets.map((b) => b.key)).toEqual(['today', 'week', 'clinical', 'later']);
  });
});
