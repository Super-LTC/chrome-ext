// QueryAPI.createQuery() must carry the MDS context anchors.
//
// The backend can now resolve the resident from the assessment (or the MRN) when
// the page exposes no client id — but only if we actually send those anchors.
// They are the same fields every /mds/* call already rides along with
// (getMDSContextBodyFields): externalPatientId, pccPublicId, ardDate,
// assessmentType.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const sent = [];

beforeAll(async () => {
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: vi.fn(async (msg) => {
        sent.push(msg);
        return { success: true, data: { query: { id: 'q1' } } };
      }),
    },
  };
  await import('../query-api.js'); // side effect: window.QueryAPI
});

beforeEach(() => {
  sent.length = 0;
  delete window.getMDSContextBodyFields;
});

const lastBody = () => JSON.parse(sent.at(-1).options.body);

describe('QueryAPI.createQuery()', () => {
  it('rides along with the MDS context anchors', async () => {
    window.getMDSContextBodyFields = () => ({
      externalPatientId: '7009142',
      pccPublicId: 'AC4829-137',
      ardDate: '2026-09-11',
      assessmentType: 'Significant change in status',
    });

    await window.QueryAPI.createQuery({ mdsItem: 'I5600', mdsItemName: 'Malnutrition' });

    expect(lastBody()).toMatchObject({
      mdsItem: 'I5600',
      externalPatientId: '7009142',
      pccPublicId: 'AC4829-137',
      ardDate: '2026-09-11',
      assessmentType: 'Significant change in status',
    });
  });

  it('never lets the ride-along overwrite a field the caller set', async () => {
    window.getMDSContextBodyFields = () => ({ externalPatientId: 'stale-cached-id' });

    await window.QueryAPI.createQuery({ mdsItem: 'I5600', externalPatientId: '7009142' });

    expect(lastBody().externalPatientId).toBe('7009142');
  });

  it('sends the payload unchanged when no MDS context is available', async () => {
    await window.QueryAPI.createQuery({ patientId: 'p1', mdsItem: 'I5600' });

    expect(lastBody()).toEqual({ patientId: 'p1', mdsItem: 'I5600' });
  });
});
