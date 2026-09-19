// content/modules/care-plan-stamp/__tests__/authoring-gate.test.js
//
// The gate decides whether the care plan WRITER is drawn at all. Two properties
// carry the whole feature and neither is obvious from reading the call sites:
//
//   1. Nothing is drawn on a maybe. Any answer that isn't an explicit
//      `enabled: true` resolves false, so an org with authoring switched off
//      never sees the button even if the response is malformed.
//   2. A transport error must NOT stick. It hides the surface for that attempt
//      and is then forgotten, because the flag is DEFAULT-ON: caching a blip
//      would delete the care plan writer for every paying org until reload.
//
// Those pull in opposite directions, which is exactly why they're pinned here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  carePlanAuthoringEnabled,
  carePlanAuthoringEnabledHere,
  resetCarePlanAuthoringGate,
} from '../authoring-gate.js';

const CTX = { facilityName: 'Avir at Mineola', orgSlug: 'aviana' };

let sendMessage;

beforeEach(() => {
  resetCarePlanAuthoringGate();
  sendMessage = vi.fn();
  globalThis.chrome = { runtime: { sendMessage } };
});

afterEach(() => {
  delete globalThis.chrome;
  delete window.getChatFacilityInfo;
  delete window.getOrg;
});

describe('carePlanAuthoringEnabled', () => {
  it('is true only when the server says enabled', async () => {
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(true);
  });

  it('is false when the server says disabled', async () => {
    sendMessage.mockResolvedValue({ success: true, data: { enabled: false } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(false);
  });

  it('sends the facility and org the caller is about to draw on', async () => {
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    await carePlanAuthoringEnabled(CTX);
    const { endpoint } = sendMessage.mock.calls[0][0];
    expect(endpoint).toContain('/api/extension/care-plan/module-status?');
    const qs = new URLSearchParams(endpoint.split('?')[1]);
    expect(qs.get('facilityName')).toBe('Avir at Mineola');
    expect(qs.get('orgSlug')).toBe('aviana');
  });

  it('asks once per facility and shares the answer across callers', async () => {
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    // Three injectors racing on one page load must not be three round-trips.
    const [a, b, c] = await Promise.all([
      carePlanAuthoringEnabled(CTX),
      carePlanAuthoringEnabled(CTX),
      carePlanAuthoringEnabled(CTX),
    ]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by facility, so a second building is asked about separately', async () => {
    sendMessage
      .mockResolvedValueOnce({ success: true, data: { enabled: true } })
      .mockResolvedValueOnce({ success: true, data: { enabled: false } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(true);
    expect(await carePlanAuthoringEnabled({ ...CTX, facilityName: 'Avir at Patriot' })).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('never asks without facility context, and does not cache the non-answer', async () => {
    // The injectors poll before the page header has resolved. That is "ask me
    // later", not "disabled" — caching it would strand the button for the load.
    expect(await carePlanAuthoringEnabled({ facilityName: '', orgSlug: 'aviana' })).toBe(false);
    expect(await carePlanAuthoringEnabled({ facilityName: 'Avir at Mineola', orgSlug: '' })).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();

    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(true);
  });

  it.each([
    ['a rejected relay', () => sendMessage.mockRejectedValue(new Error('no receiver'))],
    ['a 500', () => sendMessage.mockResolvedValue({ success: false, status: 500 })],
    ['a malformed body', () => sendMessage.mockResolvedValue({ success: true, data: {} })],
  ])('hides the surface on %s but retries next time', async (_label, arrange) => {
    arrange();
    expect(await carePlanAuthoringEnabled(CTX)).toBe(false);

    // DEFAULT-ON: the blip must not become a permanent answer.
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(true);
  });

  it('settles on a 4xx instead of re-asking forever', async () => {
    // "You have no access to this building" is the server's answer, not a blip;
    // re-asking it on every 250ms poll would be a request storm.
    sendMessage.mockResolvedValue({ success: false, status: 403 });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(false);
    expect(await carePlanAuthoringEnabled(CTX)).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('forgets everything on reset, so a new login re-checks', async () => {
    sendMessage.mockResolvedValue({ success: true, data: { enabled: false } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(false);

    resetCarePlanAuthoringGate();
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    expect(await carePlanAuthoringEnabled(CTX)).toBe(true);
  });
});

describe('carePlanAuthoringEnabledHere', () => {
  it('reads facility + org from the page context helpers', async () => {
    window.getChatFacilityInfo = () => 'Avir at Mineola';
    window.getOrg = () => ({ org: 'aviana' });
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });

    expect(await carePlanAuthoringEnabledHere()).toBe(true);
    const qs = new URLSearchParams(sendMessage.mock.calls[0][0].endpoint.split('?')[1]);
    expect(qs.get('facilityName')).toBe('Avir at Mineola');
    expect(qs.get('orgSlug')).toBe('aviana');
  });

  it('waits for a header that renders late instead of answering disabled', async () => {
    // The injectors run at DOMContentLoaded. Answering "disabled" to a page that
    // simply had not painted its header yet would delete the button at EVERY
    // org, which is the failure this whole gate exists to avoid inverting.
    window.getOrg = () => ({ org: 'aviana' });
    sendMessage.mockResolvedValue({ success: true, data: { enabled: true } });
    setTimeout(() => { window.getChatFacilityInfo = () => 'Avir at Mineola'; }, 150);

    expect(await carePlanAuthoringEnabledHere({ waitForContextMs: 2000 })).toBe(true);
    const qs = new URLSearchParams(sendMessage.mock.calls[0][0].endpoint.split('?')[1]);
    expect(qs.get('facilityName')).toBe('Avir at Mineola');
  });

  it('gives up asking when the context never arrives', async () => {
    expect(await carePlanAuthoringEnabledHere({ waitForContextMs: 0 })).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
