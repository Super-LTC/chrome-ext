import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Payload-key contract between the extension and the backend cert routes.
 *
 * Skip was dead in production from the day it shipped: the extension posted
 * { reason } while web/app/api/extension/certifications/[id]/skip/route.ts
 * destructures { skipReason }, so every click 400'd with "skipReason is
 * required". Delay had the identical mismatch. Revoke happened to be right,
 * which is exactly why nobody spotted the pattern — 2 of 3 were broken and
 * the working one made it look intentional.
 *
 * The backend names are the shared contract, not arbitrary: the WEB app's own
 * skip dialog posts skipReason too. So this side is the one that must match,
 * and these tests pin the wire format rather than the implementation.
 *
 * Mutation-checked:
 *   - revert skipCert to { reason }  -> "skip sends skipReason" fails
 *   - revert delayCert to { reason } -> "delay sends delayReason" fails
 *   - rename revoke's key            -> "revoke sends reason" fails
 */

let sent;

beforeEach(() => {
  sent = [];
  global.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        sent.push(msg);
        return { success: true, data: {} };
      }),
    },
  };
});

const { default: _ } = { default: null };
await import('../cert-api.js');
const CertAPI = globalThis.window?.CertAPI ?? global.window?.CertAPI;

const bodyOf = (msg) => JSON.parse(msg.options.body);

describe('cert action payload keys match what the routes destructure', () => {
  it('skip sends skipReason (route 400s on anything else)', async () => {
    await CertAPI.skipCert('cert-1', 'no longer Part A');

    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe('/api/extension/certifications/cert-1/skip');
    expect(bodyOf(sent[0])).toEqual({ skipReason: 'no longer Part A' });
  });

  it('delay sends delayReason', async () => {
    await CertAPI.delayCert('cert-2', 'physician on leave');

    expect(sent[0].endpoint).toBe('/api/extension/certifications/cert-2/delay');
    expect(bodyOf(sent[0])).toEqual({ delayReason: 'physician on leave' });
  });

  it('revoke sends plain reason — the one endpoint that really does want it', async () => {
    await CertAPI.revokeCert('cert-3', 'created in error');

    expect(sent[0].endpoint).toBe('/api/extension/certifications/cert-3/revoke');
    expect(bodyOf(sent[0])).toEqual({ reason: 'created in error' });
  });

  it('surfaces the server error message rather than swallowing it', async () => {
    global.chrome.runtime.sendMessage = vi.fn(async () => ({
      success: false,
      error: 'skipReason is required',
    }));

    await expect(CertAPI.skipCert('cert-1', 'x')).rejects.toThrow('skipReason is required');
  });
});

/**
 * PUT /api/extension/certifications/[id] — clinical reason vs. checkbox form.
 *
 * Standard orgs save free-text clinicalReason. Orgs on the checkbox template
 * (champion_checkbox) save the boxes instead: reasonCodes as
 * [{code, auto, evidence}] plus an optional free-text reasonOther, and no
 * clinicalReason. The same client function serves both, so pin both shapes.
 */
describe('saving the reason for continued stay', () => {
  it('standard org: body is exactly clinicalReason + days + discharge plan', async () => {
    await CertAPI.saveClinicalReason('cert-4', {
      clinicalReason: 'IV antibiotics for pneumonia',
      estimatedDays: 14,
      planForDischarge: 'Home Health Agency',
    });

    expect(sent[0].endpoint).toBe('/api/extension/certifications/cert-4');
    expect(sent[0].options.method).toBe('PUT');
    expect(bodyOf(sent[0])).toEqual({
      clinicalReason: 'IV antibiotics for pneumonia',
      estimatedDays: 14,
      planForDischarge: 'Home Health Agency',
    });
  });

  it('checkbox org: body carries reasonCodes as [{code, auto, evidence}] and reasonOther', async () => {
    await CertAPI.updateCertification('cert-5', {
      reasonCodes: [
        { code: 'pt_ot', auto: true, evidence: 'PT 5x/week per therapy note' },
        { code: 'pneumonia', auto: false, evidence: null },
      ],
      reasonOther: 'Family teaching on new ostomy',
      estimatedDays: 20,
      planForDischarge: 'Long Term Care',
    });

    expect(sent[0].endpoint).toBe('/api/extension/certifications/cert-5');
    expect(sent[0].options.method).toBe('PUT');
    expect(bodyOf(sent[0])).toEqual({
      reasonCodes: [
        { code: 'pt_ot', auto: true, evidence: 'PT 5x/week per therapy note' },
        { code: 'pneumonia', auto: false, evidence: null },
      ],
      reasonOther: 'Family teaching on new ostomy',
      estimatedDays: 20,
      planForDischarge: 'Long Term Care',
    });
  });

  it('checkbox org: entries are normalised to exactly {code, auto, evidence}', async () => {
    await CertAPI.saveClinicalReason('cert-6', {
      reasonCodes: [{ code: 'labs', label: 'Labs', column: 2 }],
      reasonOther: null,
    });

    const body = bodyOf(sent[0]);
    expect(body.reasonCodes).toEqual([{ code: 'labs', auto: false, evidence: null }]);
    expect(body.reasonOther).toBeNull();
    expect('clinicalReason' in body).toBe(false);
  });
});

describe('generating a reason draft', () => {
  it('standard org: still resolves {clinicalReason, source}', async () => {
    global.chrome.runtime.sendMessage = vi.fn(async () => ({
      success: true,
      data: { success: true, clinicalReason: 'Draft text', source: 'ai' },
    }));

    const out = await CertAPI.generateClinicalReason('cert-7');
    expect(out.clinicalReason).toBe('Draft text');
    expect(out.source).toBe('ai');
  });

  it('checkbox org: resolves the whole body so callers can read reasonCodes', async () => {
    const reasonCodes = [{ code: 'o2_therapy', auto: true, evidence: 'O2 2L NC continuous' }];
    global.chrome.runtime.sendMessage = vi.fn(async () => ({
      success: true,
      data: { success: true, reasonCodes, source: 'rules' },
    }));

    const out = await CertAPI.generateClinicalReason('cert-8');
    expect(out.reasonCodes).toEqual(reasonCodes);
    expect(out.source).toBe('rules');
    expect(out.clinicalReason).toBe('');
  });
});
