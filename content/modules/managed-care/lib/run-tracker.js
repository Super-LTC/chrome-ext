// content/modules/managed-care/lib/run-tracker.js
// Tracks recert runs the nurse kicked off from this browser. Persisted in
// chrome.storage.local so a batch started on patient 1 is still tracked while
// she's on patient 5. Polls the list endpoint (one call covers the batch)
// only while something is in flight.
import { RecertAPI } from '../recert-api.js';
import { isInProgress } from './recert-utils.js';

const STORAGE_KEY = 'superMcRunTracker'; // { statuses: {id: status}, unseen: [id] }
// The pipeline takes minutes — slow base cadence, with a short fast window
// right after a Generate when the nurse is actually watching.
const POLL_MS = 15000;
const FAST_POLL_MS = 3000;
const FAST_WINDOW_MS = 30000;
// After launching the dashboard create wizard we don't know if/when the nurse
// hits Generate over there — watch the mine=true list for new runs this long.
const WATCH_NEW_MS = 10 * 60 * 1000;

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
  _lastGenerateAt: 0,
  _watchUntil: 0,
  _visWired: false,

  async init(orgSlug) {
    this._orgSlug = orgSlug;
    if (!this._loaded) {
      const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
      this._statuses = stored.statuses || {};
      this._unseen = new Set(stored.unseen || []);
      this._loaded = true;
    }
    // Pause polling in hidden tabs; resume (and catch up immediately) when
    // the nurse comes back and something is still in flight.
    if (!this._visWired && typeof document !== 'undefined') {
      this._visWired = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible'
            && Object.values(this._statuses).some(isInProgress)) {
          this._startPolling();
        }
      });
    }
    this._notify();
    if (Object.values(this._statuses).some(isInProgress)) this._startPolling();
  },

  // Call right after create+generate succeeds.
  track(run) {
    this._statuses[run.id] = run.status;
    this._lastGenerateAt = Date.now();
    this._persist();
    this._notify();
    this._startPolling();
  },

  // Runs are created in the REAL dashboard wizard now — after launching it,
  // watch the mine=true list and auto-track any new in-progress run that
  // appears, so badges/toasts work without the extension seeing the create.
  watchForNew(durationMs = WATCH_NEW_MS) {
    this._watchUntil = Date.now() + durationMs;
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
    this._loop(0); // immediate first poll, then adaptive cadence
  },

  // setTimeout chain (not setInterval) so each round can pick its own delay:
  // 3s while the nurse just hit Generate, 15s steady-state. Re-evaluates
  // "anything still active?" after every response and stops when all
  // tracked runs are terminal. Hidden tab → park; visibilitychange resumes.
  _loop(delay) {
    this._timer = setTimeout(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this._timer = null;
        return;
      }
      const stillActive = await this._poll();
      this._timer = null;
      if (!stillActive) return;
      this._loop(Date.now() - this._lastGenerateAt < FAST_WINDOW_MS ? FAST_POLL_MS : POLL_MS);
    }, delay);
  },

  // Returns whether to keep polling: any tracked run in progress, or we're
  // inside the watch-for-new window after a dashboard wizard launch.
  async _poll() {
    const watching = Date.now() < this._watchUntil;
    if (!watching && !Object.values(this._statuses).some(isInProgress)) return false;
    // force: a poll exists to detect status changes, so bypass the TTL cache.
    // The in-flight dedup still collapses this with a concurrent RunList poll
    // of the same mine=true query into one round-trip.
    const runs = await RecertAPI.list({ orgSlug: this._orgSlug, mine: true, limit: 50 }, { force: true });
    if (!runs) return true; // transient failure — keep polling
    let discovered = 0;
    if (watching) {
      for (const r of runs) {
        if (!(r.id in this._statuses) && isInProgress(r.status)) {
          this._statuses[r.id] = r.status;
          discovered += 1;
        }
      }
      // Found what we were watching for — stop the open-ended watch; normal
      // in-flight polling carries it the rest of the way.
      if (discovered) this._watchUntil = 0;
    }
    const tracked = runs.filter((r) => r.id in this._statuses);
    const transitions = diffTransitions(this._statuses, tracked);
    for (const r of tracked) this._statuses[r.id] = r.status;
    for (const t of transitions) this._unseen.add(t.id);
    if (transitions.length || discovered) this._persist();
    this._notify(transitions, runs, discovered);
    return Date.now() < this._watchUntil || Object.values(this._statuses).some(isInProgress);
  },

  _persist() {
    chrome.storage.local.set({
      [STORAGE_KEY]: { statuses: this._statuses, unseen: [...this._unseen] },
    });
  },

  _notify(transitions = [], runs = null, discovered = 0) {
    const payload = { ...this.counts(), transitions, runs, discovered };
    for (const fn of this._listeners) {
      try { fn(payload); } catch (e) { console.error('[RunTracker] listener error', e); }
    }
  },
};

// Guarded: vitest imports this module under node where window doesn't exist.
if (typeof window !== 'undefined') window.McRunTracker = RunTracker;
