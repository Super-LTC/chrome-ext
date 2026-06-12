import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  postVerify,
  postDetectionDecision,
  PatientNotSyncedError,
  BadScrapeError,
  AccessError,
  VerifyError,
} from '../verify-api.js';

// Captures the last API_REQUEST message and returns a canned relay response.
function stubRelay(response) {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        calls.push(msg);
        return response;
      }),
    },
  };
  return calls;
}

beforeEach(() => {
  window.getCurrentParams = () => ({ facilityName: 'Burlington', orgSlug: 'acme-snf' });
  window.getPCCAssessmentMetaFromDOM = () => ({ ardDate: '2026-06-01', assessmentType: 'Quarterly' });
  window.getMDSContextBodyFields = () => ({ externalPatientId: '12345', ardDate: '2026-06-01' });
});

afterEach(() => {
  delete globalThis.chrome;
});

const BLOB = {
  sectionStatuses: { A: 'Signed' },
  answers: { A0500A: { value: 'Smith', isLocked: true } },
};

describe('postVerify', () => {
  it('builds the verify body from the page globals and returns data on success', async () => {
    const data = { success: true, calculation: {}, qm: null };
    const calls = stubRelay({ success: true, data });

    const result = await postVerify({ assessId: '6189558', patientId: '12345', answersBlob: BLOB });

    expect(result).toBe(data);
    expect(calls).toHaveLength(1);
    const msg = calls[0];
    expect(msg.type).toBe('API_REQUEST');
    expect(msg.endpoint).toBe('/api/extension/mds/verify');
    expect(msg.options.method).toBe('POST');
    expect(JSON.parse(msg.options.body)).toEqual({
      orgSlug: 'acme-snf',
      facilityName: 'Burlington',
      externalPatientId: '12345',
      externalAssessmentId: '6189558',
      ardDate: '2026-06-01',
      assessmentType: 'Quarterly',
      answers: BLOB,
    });
  });

  it('omits ardDate/assessmentType when the page does not expose them', async () => {
    window.getPCCAssessmentMetaFromDOM = () => ({ ardDate: null, assessmentType: null });
    const calls = stubRelay({ success: true, data: {} });

    await postVerify({ assessId: '6189558', patientId: '12345', answersBlob: BLOB });

    const body = JSON.parse(calls[0].options.body);
    expect(body).not.toHaveProperty('ardDate');
    expect(body).not.toHaveProperty('assessmentType');
  });

  it('maps 404 PATIENT_NOT_FOUND to PatientNotSyncedError', async () => {
    stubRelay({ success: false, status: 404, error: 'not found', body: { code: 'PATIENT_NOT_FOUND' } });
    await expect(
      postVerify({ assessId: '1', patientId: '2', answersBlob: BLOB }),
    ).rejects.toBeInstanceOf(PatientNotSyncedError);
  });

  it('maps 400 to BadScrapeError', async () => {
    stubRelay({ success: false, status: 400, error: 'Invalid MDS item key: foo', body: {} });
    await expect(
      postVerify({ assessId: '1', patientId: '2', answersBlob: BLOB }),
    ).rejects.toBeInstanceOf(BadScrapeError);
  });

  it('maps 403 to AccessError', async () => {
    stubRelay({ success: false, status: 403, error: 'Access denied to this location', body: {} });
    await expect(
      postVerify({ assessId: '1', patientId: '2', answersBlob: BLOB }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it('maps other failures to a generic VerifyError carrying the server message + status', async () => {
    stubRelay({ success: false, status: 500, error: 'PDPM build failed', body: { error: 'PDPM build failed' } });
    const err = await postVerify({ assessId: '1', patientId: '2', answersBlob: BLOB }).catch((e) => e);
    expect(err).toBeInstanceOf(VerifyError);
    expect(err.status).toBe(500);
    expect(err.message).toContain('PDPM build failed');
  });
});

describe('postDetectionDecision', () => {
  it('posts the decision body and dispatches super:item-decision on success', async () => {
    const calls = stubRelay({ success: true, data: { ok: true } });
    const fired = vi.fn();
    window.addEventListener('super:item-decision', fired);

    const data = await postDetectionDecision({
      mdsItem: 'GG0130B1',
      mdsColumn: '',
      decision: 'agree',
      note: '',
      assessId: '6189558',
    });

    expect(data).toEqual({ ok: true });
    expect(calls[0].endpoint).toBe('/api/extension/mds/items/GG0130B1/decision');
    expect(JSON.parse(calls[0].options.body)).toEqual({
      externalAssessmentId: '6189558',
      facilityName: 'Burlington',
      orgSlug: 'acme-snf',
      decision: 'agree',
      note: '',
      mdsColumn: '',
      externalPatientId: '12345',
      ardDate: '2026-06-01',
    });
    expect(fired).toHaveBeenCalledTimes(1);
    window.removeEventListener('super:item-decision', fired);
  });

  it('sends the dismiss reason as note', async () => {
    const calls = stubRelay({ success: true, data: {} });
    await postDetectionDecision({
      mdsItem: 'J1800',
      mdsColumn: 'A',
      decision: 'disagree',
      note: 'clinically not supported',
      assessId: '1',
    });
    const body = JSON.parse(calls[0].options.body);
    expect(body.decision).toBe('disagree');
    expect(body.note).toBe('clinically not supported');
    expect(body.mdsColumn).toBe('A');
  });

  it('throws and does not dispatch the event on failure', async () => {
    stubRelay({ success: false, status: 500, error: 'boom', body: {} });
    const fired = vi.fn();
    window.addEventListener('super:item-decision', fired);
    await expect(
      postDetectionDecision({ mdsItem: 'J1800', decision: 'agree', assessId: '1' }),
    ).rejects.toThrow('boom');
    expect(fired).not.toHaveBeenCalled();
    window.removeEventListener('super:item-decision', fired);
  });
});
