// content/modules/managed-care/__tests__/recert-api.test.js
// Covers the list() request-coalescing + micro-cache that kills the documented
// /api/extension/recertifications pile-up (same URL fired N× while pending).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecertAPI, clearRecertListCache } from '../recert-api.js';

// Synchronous relay for the non-coalesced endpoints (udaPreview): captures the
// outgoing API_REQUEST and returns a canned envelope.
function stubRelay(response) {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => { calls.push(msg); return response; }),
    },
  };
  return calls;
}

// A controllable relay: each call returns a fresh deferred so tests can hold
// requests "in flight". Tracks every endpoint the module asked for.
function makeRelay() {
  const calls = [];
  const pending = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn((msg) => {
        calls.push(msg);
        let resolve;
        const p = new Promise((r) => { resolve = r; });
        pending.push({ msg, resolve });
        return p;
      }),
    },
  };
  return {
    calls,
    // Resolve the Nth (default: oldest unresolved) in-flight request.
    resolve(recertifications, idx = 0) {
      pending[idx].resolve({ success: true, data: { recertifications } });
    },
    resolveAll(recertifications) {
      for (const p of pending) p.resolve({ success: true, data: { recertifications } });
    },
    fail(idx = 0) {
      pending[idx].resolve({ success: false, status: 500, error: 'boom' });
    },
    listCallCount() {
      return calls.filter((c) => c.endpoint.startsWith('/api/extension/recertifications?')).length;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearRecertListCache();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe('RecertAPI.list — in-flight coalescing', () => {
  it('collapses concurrent identical queries into ONE round-trip', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    // Five callers fire the same query while the first is still pending —
    // exactly the HAR pathology.
    const all = Promise.all([
      RecertAPI.list(params),
      RecertAPI.list(params),
      RecertAPI.list(params),
      RecertAPI.list(params, { force: true }), // even a forced twin coalesces
      RecertAPI.list(params),
    ]);

    expect(relay.listCallCount()).toBe(1);
    relay.resolveAll([{ id: 'a' }]);
    const results = await all;
    expect(relay.listCallCount()).toBe(1);
    for (const r of results) expect(r).toEqual([{ id: 'a' }]);
  });

  it('distinct queries each get their own round-trip', async () => {
    const relay = makeRelay();
    const a = RecertAPI.list({ orgSlug: 'eac', mine: true, limit: 50 });
    const b = RecertAPI.list({ orgSlug: 'eac', limit: 50 }); // all-locations
    const c = RecertAPI.list({ orgSlug: 'eac', facilityName: 'Eastbrook', limit: 50 });
    expect(relay.listCallCount()).toBe(3);
    relay.resolveAll([]);
    await Promise.all([a, b, c]);
  });

  it('is order-insensitive — same logical query collapses regardless of key order', async () => {
    const relay = makeRelay();
    const a = RecertAPI.list({ orgSlug: 'eac', mine: true, limit: 50 });
    const b = RecertAPI.list({ limit: 50, mine: true, orgSlug: 'eac' });
    expect(relay.listCallCount()).toBe(1);
    relay.resolveAll([{ id: 'x' }]);
    expect(await a).toEqual([{ id: 'x' }]);
    expect(await b).toEqual([{ id: 'x' }]);
  });
});

describe('RecertAPI.list — micro-cache', () => {
  it('serves a repeat query from cache within the TTL (no new round-trip)', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    const first = RecertAPI.list(params);
    relay.resolve([{ id: 'a' }]);
    expect(await first).toEqual([{ id: 'a' }]);
    expect(relay.listCallCount()).toBe(1);

    // A second read 2s later (mount/toggle/focus storm) reuses the cache.
    vi.advanceTimersByTime(2000);
    const second = await RecertAPI.list(params);
    expect(second).toEqual([{ id: 'a' }]);
    expect(relay.listCallCount()).toBe(1);
  });

  it('refetches once the TTL has elapsed', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    const first = RecertAPI.list(params);
    relay.resolve([{ id: 'a' }]);
    await first;

    vi.advanceTimersByTime(6000); // past the 5s TTL
    const second = RecertAPI.list(params);
    expect(relay.listCallCount()).toBe(2);
    relay.resolve([{ id: 'b' }], 1);
    expect(await second).toEqual([{ id: 'b' }]);
  });

  it('force:true bypasses a still-fresh cache', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    const first = RecertAPI.list(params);
    relay.resolve([{ id: 'a' }]);
    await first;

    vi.advanceTimersByTime(1000); // still inside TTL
    const forced = RecertAPI.list(params, { force: true });
    expect(relay.listCallCount()).toBe(2);
    relay.resolve([{ id: 'a' }, { id: 'b' }], 1);
    expect(await forced).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('does not cache failures — the next read retries', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    const first = RecertAPI.list(params);
    relay.fail();
    expect(await first).toBeNull();

    const second = RecertAPI.list(params); // no force — but failure wasn't cached
    expect(relay.listCallCount()).toBe(2);
    relay.resolve([{ id: 'a' }], 1);
    expect(await second).toEqual([{ id: 'a' }]);
  });

  it('clearRecertListCache forces the next read to hit the network', async () => {
    const relay = makeRelay();
    const params = { orgSlug: 'eac', mine: true, limit: 50 };

    const first = RecertAPI.list(params);
    relay.resolve([{ id: 'a' }]);
    await first;

    clearRecertListCache(); // e.g. after a create/generate/archive mutation
    const second = RecertAPI.list(params);
    expect(relay.listCallCount()).toBe(2);
    relay.resolve([{ id: 'a' }, { id: 'b' }], 1);
    expect(await second).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

describe('RecertAPI.udaPreview', () => {
  it('GETs uda-preview with the facility params and returns res.data', async () => {
    const data = { total: 113, orgDefaultKeywords: ['skilled'], forms: [{ description: 'Daily Skilled', count: 1216 }] };
    const calls = stubRelay({ success: true, data });

    const result = await RecertAPI.udaPreview({ orgSlug: 'eac', facilityName: 'Eastbrook Healthcare Center' });

    expect(result).toBe(data);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('API_REQUEST');
    expect(calls[0].options.method).toBe('GET');
    const url = calls[0].endpoint;
    expect(url.startsWith('/api/extension/recertifications/uda-preview?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('orgSlug')).toBe('eac');
    expect(params.get('facilityName')).toBe('Eastbrook Healthcare Center');
    // locationId omitted → not in the query string
    expect(params.has('locationId')).toBe(false);
  });

  it('prefers locationId when supplied', async () => {
    const calls = stubRelay({ success: true, data: { total: 0, orgDefaultKeywords: [], forms: [] } });
    await RecertAPI.udaPreview({ orgSlug: 'eac', locationId: 'loc_42' });
    const params = new URLSearchParams(calls[0].endpoint.split('?')[1]);
    expect(params.get('locationId')).toBe('loc_42');
  });

  it('throws on a failure envelope', async () => {
    stubRelay({ success: false, status: 500, error: 'boom' });
    await expect(
      RecertAPI.udaPreview({ orgSlug: 'eac', facilityName: 'X' }),
    ).rejects.toThrow('boom');
  });
});
