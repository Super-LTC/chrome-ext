import { describe, it, expect } from 'vitest';
import {
  groupCertsByStay,
  filterCertsBySearch,
  matchesCertSearch,
  isCertActionNeeded,
  isTerminalCertStatus,
} from '../cert-grouping.js';

/** A far-future due date keeps derived urgency out of "due soon" territory. */
const FUTURE = '2099-01-01';

const cert = (over = {}) => ({
  id: 'c1',
  patientId: 'p1',
  patientName: 'Ada Lovelace',
  patientExternalId: '40122',
  partAStayId: 's1',
  partAStartDate: '2026-03-12',
  payerType: 'medicare',
  stayStatus: 'active',
  type: 'initial',
  sequenceNumber: 1,
  status: 'pending',
  dueDate: FUTURE,
  ...over,
});

describe('isTerminalCertStatus', () => {
  it('treats signed / skipped / revoked as finished', () => {
    expect(isTerminalCertStatus('signed')).toBe(true);
    expect(isTerminalCertStatus('skipped')).toBe(true);
    expect(isTerminalCertStatus('revoked')).toBe(true);
    expect(isTerminalCertStatus('pending')).toBe(false);
    expect(isTerminalCertStatus('sent')).toBe(false);
  });
});

describe('isCertActionNeeded', () => {
  it("prefers the backend's actionNeeded over local derivation", () => {
    // Overdue by local math, but the server says no action is needed.
    expect(isCertActionNeeded(cert({ dueDate: '2020-01-01', actionNeeded: false }))).toBe(false);
    // Not urgent by local math, but the server says it is.
    expect(isCertActionNeeded(cert({ dueDate: FUTURE, actionNeeded: true }))).toBe(true);
  });

  it('derives from urgency when the field is absent (audit projection)', () => {
    expect(isCertActionNeeded(cert({ dueDate: '2020-01-01' }))).toBe(true);  // overdue
    expect(isCertActionNeeded(cert({ dueDate: FUTURE }))).toBe(false);       // far off
  });

  it('never flags a finished cert', () => {
    expect(isCertActionNeeded(cert({ dueDate: '2020-01-01', status: 'signed' }))).toBe(false);
    expect(isCertActionNeeded(cert({ dueDate: '2020-01-01', status: 'skipped' }))).toBe(false);
  });
});

describe('matchesCertSearch / filterCertsBySearch', () => {
  it('matches on name and MRN, case-insensitively', () => {
    expect(matchesCertSearch(cert(), 'ada')).toBe(true);
    expect(matchesCertSearch(cert(), 'LOVELACE')).toBe(true);
    expect(matchesCertSearch(cert(), '4012')).toBe(true);
    expect(matchesCertSearch(cert(), 'webb')).toBe(false);
  });

  it('treats an empty or whitespace query as "everything"', () => {
    const list = [cert(), cert({ id: 'c2', patientName: 'Marcus Webb' })];
    expect(filterCertsBySearch(list, '')).toBe(list);
    expect(filterCertsBySearch(list, '   ')).toBe(list);
  });

  it('filters the list down to matches', () => {
    const list = [cert(), cert({ id: 'c2', patientId: 'p2', patientName: 'Marcus Webb', patientExternalId: '39880' })];
    expect(filterCertsBySearch(list, 'marcus').map((c) => c.id)).toEqual(['c2']);
  });

  it('tolerates a non-array input', () => {
    expect(filterCertsBySearch(null, 'x')).toEqual([]);
  });
});

describe('groupCertsByStay', () => {
  it('groups a patient\'s certs under one stay', () => {
    const groups = groupCertsByStay([
      cert({ id: 'a', sequenceNumber: 1 }),
      cert({ id: 'b', sequenceNumber: 2, type: 'day_14_recert' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].patientName).toBe('Ada Lovelace');
    expect(groups[0].stays).toHaveLength(1);
    expect(groups[0].stays[0].certs.map((c) => c.id)).toEqual(['a', 'b']);
    expect(groups[0].certCount).toBe(2);
  });

  it('separates two stays for the same patient', () => {
    const groups = groupCertsByStay([
      cert({ id: 'a', partAStayId: 's1', partAStartDate: '2026-01-05' }),
      cert({ id: 'b', partAStayId: 's2', partAStartDate: '2026-06-20' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stays).toHaveLength(2);
    // Newest stay first.
    expect(groups[0].stays.map((s) => s.partAStartDate)).toEqual(['2026-06-20', '2026-01-05']);
  });

  it('falls back to partAStartDate as the stay key when partAStayId is absent', () => {
    // The audit projection may not carry partAStayId at all.
    const groups = groupCertsByStay([
      cert({ id: 'a', partAStayId: undefined, partAStartDate: '2026-01-05' }),
      cert({ id: 'b', partAStayId: undefined, partAStartDate: '2026-06-20' }),
      cert({ id: 'c', partAStayId: undefined, partAStartDate: '2026-06-20' }),
    ]);
    expect(groups[0].stays).toHaveLength(2);
    expect(groups[0].stays[0].certs.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('keys patients by MRN when the internal id is missing', () => {
    const groups = groupCertsByStay([
      cert({ id: 'a', patientId: undefined }),
      cert({ id: 'b', patientId: undefined }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('orders certs in a stay by chain sequence, not input order', () => {
    const groups = groupCertsByStay([
      cert({ id: 'c30', sequenceNumber: 3 }),
      cert({ id: 'c14', sequenceNumber: 2 }),
      cert({ id: 'init', sequenceNumber: 1 }),
    ]);
    expect(groups[0].stays[0].certs.map((c) => c.id)).toEqual(['init', 'c14', 'c30']);
  });

  it('falls back to due date when sequence numbers are absent', () => {
    const groups = groupCertsByStay([
      cert({ id: 'later', sequenceNumber: undefined, dueDate: '2026-05-01' }),
      cert({ id: 'earlier', sequenceNumber: undefined, dueDate: '2026-04-01' }),
    ]);
    expect(groups[0].stays[0].certs.map((c) => c.id)).toEqual(['earlier', 'later']);
  });

  it('sorts patients alphabetically for lookup', () => {
    const groups = groupCertsByStay([
      cert({ id: 'z', patientId: 'p9', patientName: 'Zoe Adams' }),
      cert({ id: 'm', patientId: 'p5', patientName: 'Marcus Webb' }),
      cert({ id: 'a', patientId: 'p1', patientName: 'Ada Lovelace' }),
    ]);
    expect(groups.map((g) => g.patientName)).toEqual(['Ada Lovelace', 'Marcus Webb', 'Zoe Adams']);
  });

  it('rolls up action-needed counts and the next open due date', () => {
    const groups = groupCertsByStay([
      cert({ id: 'signed', status: 'signed', dueDate: '2026-03-17', actionNeeded: false }),
      cert({ id: 'open1', status: 'pending', dueDate: '2026-03-26', actionNeeded: true, sequenceNumber: 2 }),
      cert({ id: 'open2', status: 'sent', dueDate: '2026-04-11', actionNeeded: true, sequenceNumber: 3 }),
    ]);
    const stay = groups[0].stays[0];
    expect(stay.actionNeededCount).toBe(2);
    expect(groups[0].actionNeededCount).toBe(2);
    // Signed certs are excluded from "next due" even though they're earliest.
    expect(stay.nextDue).toBe('2026-03-26');
  });

  it('reports no next due when every cert is finished', () => {
    const groups = groupCertsByStay([cert({ status: 'signed' }), cert({ id: 'b', status: 'skipped' })]);
    expect(groups[0].stays[0].nextDue).toBeNull();
    expect(groups[0].actionNeededCount).toBe(0);
  });

  it('reads the medicare day from either route\'s field name', () => {
    const live = groupCertsByStay([cert({ currentMedicareDay: 17 })]);
    expect(live[0].stays[0].medicareDay).toBe(17);
    const audit = groupCertsByStay([cert({ currentMedicareDay: undefined, medicareDayAtDue: 14 })]);
    expect(audit[0].stays[0].medicareDay).toBe(14);
  });

  it('backfills stay facts from whichever row carries them', () => {
    const groups = groupCertsByStay([
      cert({ id: 'a', payerType: null, stayStatus: null }),
      cert({ id: 'b', payerType: 'managed_care', stayStatus: 'ended', stayEndDate: '2026-05-01' }),
    ]);
    const stay = groups[0].stays[0];
    expect(stay.payerType).toBe('managed_care');
    expect(stay.stayStatus).toBe('ended');
    expect(stay.stayEndDate).toBe('2026-05-01');
  });

  it('tolerates empty, null, and malformed input', () => {
    expect(groupCertsByStay([])).toEqual([]);
    expect(groupCertsByStay(null)).toEqual([]);
    expect(groupCertsByStay([null, undefined])).toEqual([]);
  });
});
