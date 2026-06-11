// content/modules/managed-care/lib/run-tracker.js
// Tracks recert runs the nurse kicked off from this browser. Persisted in
// chrome.storage.local so a batch started on patient 1 is still tracked while
// she's on patient 5. Polls the list endpoint (one call covers the batch)
// only while something is in flight.
import { RecertAPI } from '../recert-api.js';
import { isInProgress } from './recert-utils.js';

const STORAGE_KEY = 'superMcRunTracker'; // { statuses: {id: status}, unseen: [id] }
const POLL_MS = 10000;

export function diffTransitions(prevStatuses, runs) {
  const out = [];
  for (const run of runs) {
    const prev = prevStatuses[run.id];
    const wasTerminal = prev === 'completed' || prev === 'failed';
    const isTerminal = run.status === 'completed' || run.status === 'failed';
    // Unknown prev (reload after completion) is NOT a transition — no stale toasts.
    if (prev !== undefined && !wasTerminal && isTerminal) {
      out.push({ id: run.id, status: run.status });
    }
  }
  return out;
}

export const RunTracker = {
  _statuses: {},        // id → last seen status (only runs we started/track)
  _unseen: new Set(),   // completed/failed ids not yet viewed in a panel
  _timer: null,
  _listeners: new Set(),
  _orgSlug: null,
  _loaded: false,

  async init(orgSlug) {
    this._orgSlug = orgSlug;
    if (!this._loaded) {
      const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
      this._statuses = stored.statuses || {};
      this._unseen = new Set(stored.unseen || []);
      this._loaded = true;
    }
    this._notify();
    if (Object.values(this._statuses).some(isInProgress)) this._startPolling();
  },

  // Call right after create+generate succeeds.
  track(run) {
    this._statuses[run.id] = run.status;
    this._persist();
    this._notify();
    this._startPolling();
  },

  // Panel viewed runs → clear unseen for those ids.
  markSeen(ids) {
    let changed = false;
    for (const id of ids) changed = this._unseen.delete(id) || changed;
    if (changed) { this._persist(); this._notify(); }
  },

  untrack(id) {
    delete this._statuses[id];
    this._unseen.delete(id);
    this._persist();
    this._notify();
  },

  // subscriber: ({ inFlight, unseenDone, transitions }) => void
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  counts() {
    const inFlight = Object.values(this._statuses).filter(isInProgress).length;
    return { inFlight, unseenDone: this._unseen.size };
  },

  _startPolling() {
    if (this._timer) return;
    this._timer = setInterval(() => this._poll(), POLL_MS);
    this._poll();
  },

  async _poll() {
    const trackedIds = Object.keys(this._statuses);
    if (!trackedIds.some((id) => isInProgress(this._statuses[id]))) {
      clearInterval(this._timer);
      this._timer = null;
      return;
    }
    const runs = await RecertAPI.list({ orgSlug: this._orgSlug, mine: true, limit: 50 });
    if (!runs) return; // transient failure — keep polling
    const tracked = runs.filter((r) => r.id in this._statuses);
    const transitions = diffTransitions(this._statuses, tracked);
    for (const r of tracked) this._statuses[r.id] = r.status;
    for (const t of transitions) this._unseen.add(t.id);
    if (transitions.length) this._persist();
    this._notify(transitions, runs);
  },

  _persist() {
    chrome.storage.local.set({
      [STORAGE_KEY]: { statuses: this._statuses, unseen: [...this._unseen] },
    });
  },

  _notify(transitions = [], runs = null) {
    const payload = { ...this.counts(), transitions, runs };
    for (const fn of this._listeners) {
      try { fn(payload); } catch (e) { console.error('[RunTracker] listener error', e); }
    }
  },
};

// Guarded: vitest imports this module under node where window doesn't exist.
if (typeof window !== 'undefined') window.McRunTracker = RunTracker;
