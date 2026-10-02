import { describe, it, expect } from 'vitest';

const { adaptDischargedPatient } = await import('../cert-grouping.js');

/**
 * The discharged endpoint names the stay review fields `reviewKind` /
 * `reviewReason`; StayGroupCard reads `stayReviewKind` / `stayReviewReason`
 * (the active-list names). Without the mapping the Manual badge and review
 * banner silently vanish on the Discharged tab.
 */
describe('adaptDischargedPatient carries stay mode + review onto each cert', () => {
  const patient = {
    stayId: 'stay_9',
    patientName: 'TEST, RESIDENT',
    patientExternalId: 'X9',
    payerType: 'managed_care',
    partAStartDate: '2026-08-01',
    endDate: '2026-09-01',
    outstandingCount: 1,
    stayMode: 'manual',
    reviewKind: 'discharged',
    reviewReason: 'Discharged on Sep 1. End the stay?',
    certs: [{ id: 'c2', type: 'day_14_recert', sequenceNumber: 2 }, { id: 'c1', type: 'initial', sequenceNumber: 1 }],
  };

  it('maps stayMode / reviewKind / reviewReason to the stay-prefixed names', () => {
    const g = adaptDischargedPatient(patient);
    for (const c of g.allCerts) {
      expect(c.partAStayId).toBe('stay_9');
      expect(c.stayMode).toBe('manual');
      expect(c.stayReviewKind).toBe('discharged');
      expect(c.stayReviewReason).toBe('Discharged on Sep 1. End the stay?');
      expect(c.stayStatus).toBe('ended');
    }
    expect(g.allCerts.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('defaults to an automatic, unflagged stay on an older backend', () => {
    const { stayMode, reviewKind, reviewReason, ...old } = patient;
    const [c] = adaptDischargedPatient(old).allCerts;
    expect(c.stayMode).toBe('auto');
    expect(c.stayReviewKind).toBeNull();
    expect(c.stayReviewReason).toBeNull();
  });
});
