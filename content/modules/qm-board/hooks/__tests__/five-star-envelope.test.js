/**
 * The envelope chain for the Five-Star routes.
 *
 * WHY THIS EXISTS. These routes nest THREE layers deep, and every layer is added
 * by a different piece of code:
 *
 *   1. background/background.js  →  { success, data: <server response> }
 *   2. the route handler         →  { success, data: <cache read>, locationId? }
 *   3. FiveStarPrecomputeService →  { status, payload, provenance, reason }
 *
 * so the actual board data lives at `res.data.data.payload`. Getting this wrong
 * does not throw — it silently yields `undefined`, and the screen renders its
 * empty state as if the org had no buildings. That failure looks exactly like a
 * legitimate "not computed yet", which is why it needs pinning rather than
 * eyeballing.
 *
 * Layer 3 is unusual and worth restating: the region payload is PRECOMPUTED on a
 * ~6h sweep (a live build is ~70s, past any request timeout), so the route only
 * ever READS a cache. `not_yet_computed` is a normal answer, not an error.
 *
 * These assertions were derived by reading all three layers, and the error
 * envelope was confirmed against the running dev server (401 →
 * `{success:false, error}`). The SUCCESS payload has not been exercised over
 * HTTP with a real token — see scripts/probe-five-star.mjs.
 */
import { describe, it, expect } from 'vitest';
import { unwrap } from '../../utils/api.js';

/** Layer 3 — what the precompute service returns. */
const cacheHit = (payload, status = 'fresh') => ({
  status,
  scope: 'region',
  scopeId: 'org1',
  payload,
  provenance: { computedAt: '2026-08-02T10:40:00Z', asOfLabel: '6:40a', ageMs: 1000 },
});

const cacheMiss = (reason) => ({
  status: 'not_yet_computed',
  scope: 'region',
  scopeId: 'org1',
  payload: null,
  provenance: null,
  reason,
});

/** Layers 2 + 1 — the route's envelope, then the background worker's. */
const fromRoute = (cacheRead, extra = {}) => ({ success: true, data: cacheRead, ...extra });
const fromWorker = (routeBody) => ({ success: true, data: routeBody });

/** Exactly what the hooks do with a worker response. */
const readOf = (workerRes) => (workerRes?.success ? unwrap(workerRes.data) : null);

describe('five-star envelope chain', () => {
  it('reaches the payload through all three layers', () => {
    const board = { organizationId: 'org1', facilities: [{ locationId: 'loc1' }] };
    const read = readOf(fromWorker(fromRoute(cacheHit(board))));

    expect(read.status).toBe('fresh');
    expect(read.payload).toBe(board);
    // The bug this guards: stopping one layer short yields the cache read, whose
    // `.facilities` is undefined — an empty board that looks like a real one.
    expect(read.facilities).toBeUndefined();
  });

  it('keeps serving a stale payload rather than blanking the screen', () => {
    const read = readOf(fromWorker(fromRoute(cacheHit({ facilities: [] }, 'stale'))));
    expect(read.status).toBe('stale');
    expect(read.payload).not.toBeNull();
  });

  it('distinguishes "not computed yet" from an error', () => {
    // Null payload with a server-authored reason. The UI must render the reason
    // and NOT offer Retry — retrying cannot make a 6h sweep run sooner.
    const read = readOf(fromWorker(fromRoute(cacheMiss('First refresh is still building.'))));
    expect(read.payload).toBeNull();
    expect(read.status).toBe('not_yet_computed');
    expect(read.reason).toBe('First refresh is still building.');
  });

  it('finds locationId on the ROUTE envelope, not the cache read', () => {
    // The facility route adds `locationId` as a sibling of `data`, so it is one
    // layer shallower than the payload. Reading it off the cache read gets null.
    const workerRes = fromWorker(fromRoute(cacheHit({ name: 'A' }), { locationId: 'loc9' }));
    expect(workerRes.data.locationId).toBe('loc9');
    expect(readOf(workerRes).locationId).toBeUndefined();
  });

  it('surfaces the server error message on a failed request', () => {
    // Confirmed live against the dev server: an unauthenticated call returns
    // 401 `{success:false, error:"Missing or invalid Authorization header"}`,
    // which apiRequest turns into a throw and the worker into this shape.
    const workerRes = { success: false, error: 'Missing or invalid Authorization header', status: 401 };
    expect(readOf(workerRes)).toBeNull();
    expect(workerRes.error).toContain('Authorization');
  });

  it('leaves a flat (un-enveloped) body alone', () => {
    // unwrap() is shared with older endpoints that return their payload flat.
    expect(unwrap({ facilities: [] })).toEqual({ facilities: [] });
  });
});
