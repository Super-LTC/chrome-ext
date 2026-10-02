import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Wire contract for the manual cert-stay endpoints (needs-stay, residents,
 * start / mode / end / review / add cert). Pins endpoint + method + body so a
 * renamed key fails here instead of 400ing in front of a nurse — the skip/delay
 * key mismatch (see cert-api.payload-contract.test.js) is the precedent.
 */

let sent;
let reply;

beforeEach(() => {
  sent = [];
  reply = { success: true, data: {} };
  global.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        sent.push(msg);
        return reply;
      }),
    },
  };
});

await import('../cert-api.js');
const CertAPI = globalThis.window?.CertAPI ?? global.window?.CertAPI;

const bodyOf = (msg) => JSON.parse(msg.options.body);
const BASE = '/api/extension/certifications';

describe('needs-stay', () => {
  it('GET /needs-stay with facilityName + orgSlug, returns list + managedCareEnabled', async () => {
    reply = {
      success: true,
      data: { success: true, needsStay: [{ patientId: 'p1' }], managedCareEnabled: true },
    };
    const out = await CertAPI.fetchNeedsStay('Test Facility', 'test-org');

    expect(sent[0].endpoint).toBe(`${BASE}/needs-stay?facilityName=Test+Facility&orgSlug=test-org`);
    expect(sent[0].options.method).toBe('GET');
    expect(out).toEqual({ needsStay: [{ patientId: 'p1' }], managedCareEnabled: true });
  });

  it('a failed request resolves to an empty list (the section just hides)', async () => {
    reply = { success: false, error: 'Not found' };
    const out = await CertAPI.fetchNeedsStay('Test Facility', 'test-org');
    expect(out).toEqual({ needsStay: [], managedCareEnabled: null });
  });

  it('POST /needs-stay/dismiss with exactly the contract body', async () => {
    await CertAPI.dismissNeedsStay('Test Facility', 'test-org', {
      patientId: 'p1',
      payerType: 'managed_care',
      startDate: '2026-09-01',
      reason: 'Private pay',
    });

    expect(sent[0].endpoint).toBe(`${BASE}/needs-stay/dismiss`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({
      facilityName: 'Test Facility',
      orgSlug: 'test-org',
      patientId: 'p1',
      payerType: 'managed_care',
      startDate: '2026-09-01',
      reason: 'Private pay',
    });
  });
});

describe('residents', () => {
  it('GET /residents with facilityName + orgSlug, returns the array', async () => {
    reply = { success: true, data: { success: true, residents: [{ patientId: 'p2' }] } };
    const out = await CertAPI.fetchCertResidents('Test Facility', 'test-org');

    expect(sent[0].endpoint).toBe(`${BASE}/residents?facilityName=Test+Facility&orgSlug=test-org`);
    expect(sent[0].options.method).toBe('GET');
    expect(out).toEqual([{ patientId: 'p2' }]);
  });
});

describe('stays', () => {
  it('POST /stays — start a manual stay, endDate omitted when not given', async () => {
    reply = { success: true, data: { success: true, stayId: 's1', initialCertId: 'c1' } };
    const out = await CertAPI.startManualStay('Test Facility', 'test-org', {
      patientId: 'p1',
      payerType: 'medicare_a',
      startDate: '2026-09-01',
      endDate: null,
      reason: 'Census entered late',
    });

    expect(sent[0].endpoint).toBe(`${BASE}/stays`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({
      facilityName: 'Test Facility',
      orgSlug: 'test-org',
      patientId: 'p1',
      payerType: 'medicare_a',
      startDate: '2026-09-01',
      reason: 'Census entered late',
    });
    expect(out.stayId).toBe('s1');
  });

  it('POST /stays — endDate sent when the resident has left', async () => {
    await CertAPI.startManualStay('Test Facility', 'test-org', {
      patientId: 'p1',
      payerType: 'managed_care',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      reason: 'r',
    });
    expect(bodyOf(sent[0]).endDate).toBe('2026-09-10');
  });

  it('POST /stays/:id/mode with {mode, reason}', async () => {
    await CertAPI.setStayMode('s1', 'manual', 'Payer mismatch');
    expect(sent[0].endpoint).toBe(`${BASE}/stays/s1/mode`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({ mode: 'manual', reason: 'Payer mismatch' });
  });

  it('POST /stays/:id/end with {endDate, reason}', async () => {
    await CertAPI.endStay('s1', { endDate: '2026-09-20', reason: 'Payer changed' });
    expect(sent[0].endpoint).toBe(`${BASE}/stays/s1/end`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({ endDate: '2026-09-20', reason: 'Payer changed' });
  });

  it('POST /stays/:id/review confirm sends only the action', async () => {
    await CertAPI.resolveStayReview('s1', { action: 'confirm' });
    expect(sent[0].endpoint).toBe(`${BASE}/stays/s1/review`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({ action: 'confirm' });
  });

  it('POST /stays/:id/review end carries endDate when given, omits it otherwise', async () => {
    await CertAPI.resolveStayReview('s1', { action: 'end', endDate: '2026-09-21' });
    expect(bodyOf(sent[0])).toEqual({ action: 'end', endDate: '2026-09-21' });

    await CertAPI.resolveStayReview('s1', { action: 'end' });
    expect(bodyOf(sent[1])).toEqual({ action: 'end' });
  });

  it('POST /stays/:id/certs with {type, dueDate}', async () => {
    reply = { success: true, data: { success: true, certId: 'c9' } };
    const out = await CertAPI.addStayCertification('s1', { type: 'day_14_recert', dueDate: '2026-09-15' });
    expect(sent[0].endpoint).toBe(`${BASE}/stays/s1/certs`);
    expect(sent[0].options.method).toBe('POST');
    expect(bodyOf(sent[0])).toEqual({ type: 'day_14_recert', dueDate: '2026-09-15' });
    expect(out.certId).toBe('c9');
  });
});

describe('errors reach the nurse verbatim', () => {
  const cases = [
    ['dismissNeedsStay', () => CertAPI.dismissNeedsStay('F', 'o', { patientId: 'p', payerType: 'medicare_a', startDate: '2026-09-01', reason: 'r' })],
    ['fetchCertResidents', () => CertAPI.fetchCertResidents('F', 'o')],
    ['startManualStay', () => CertAPI.startManualStay('F', 'o', { patientId: 'p', payerType: 'medicare_a', startDate: '2026-09-01', reason: 'r' })],
    ['setStayMode', () => CertAPI.setStayMode('s1', 'auto', 'r')],
    ['endStay', () => CertAPI.endStay('s1', { endDate: '2026-09-01', reason: 'r' })],
    ['resolveStayReview', () => CertAPI.resolveStayReview('s1', { action: 'confirm' })],
    ['addStayCertification', () => CertAPI.addStayCertification('s1', { type: 'initial', dueDate: '2026-09-01' })],
  ];

  for (const [name, call] of cases) {
    it(`${name} rejects with the server's error text`, async () => {
      reply = { success: false, error: 'This resident already has an open stay.' };
      await expect(call()).rejects.toThrow('This resident already has an open stay.');
    });
  }
});
