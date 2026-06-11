# Managed Care Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the Managed Care panel — recert ("clinical update") generation + central run tracking — with a gated PCC resident-header button and a permanent MC FAB action.

**Architecture:** One Preact module (`content/modules/managed-care/`) rendered by a launcher in `fab.js` (QMBoardLauncher pattern), opened from two doors: a per-patient header button and an unscoped FAB action. A vanilla API client talks to `/api/extension/recertifications/*` via the background `API_REQUEST` channel. A run-tracker singleton persists kicked-off run IDs in `chrome.storage.local`, polls the list endpoint while runs are in flight, and drives badges + completion toasts.

**Tech Stack:** Preact (dynamic import), vanilla JS API client, Vite + crxjs, vitest (new — pure-logic tests only).

**Design doc:** `docs/plans/2026-06-11-managed-care-panel-design.md`
**API contracts:** `.context/chrome-ext-recert-handoff.md` (authoritative — re-read §3 before each API task)

**Settled behaviors (do not redesign):**
- Retry = create new run from failed run's config, then archive the failed run. Retry-in-place is server-disabled.
- No server stall-sweep: any in-progress run with `updatedAt` > 30 min old gets a client-side "taking longer than expected" state.
- `errorMessage` is on list rows directly.
- Facility is always passed as PCC `facilityName` (server resolves); never resolve `locationId` client-side.
- `form-data` takes `patientId` only.
- Mint view-links on click, never pre-mint.

**Verification reality:** No UI test runner exists and we're not adding one — vitest covers pure logic in `lib/` only. UI verification = `npm run build` passes + the manual checklist in Task 12. `npm run build` also runs `check:tracking` which validates `data-track` attributes against the analytics schema, so analytics tasks fail the build if wrong.

---

### Task 1: Vitest for pure logic

**Files:**
- Modify: `package.json`

**Step 1:** `npm install -D vitest`

**Step 2:** Add script to `package.json` scripts block: `"test": "vitest run"`

**Step 3:** Run `npx vitest run` — expect "No test files found" exit (fine; tests arrive in Task 2).

**Step 4:** Commit: `chore: add vitest for pure-logic tests`

---

### Task 2: Pure logic — `recert-utils.js` (TDD)

**Files:**
- Create: `content/modules/managed-care/lib/recert-utils.js`
- Test: `content/modules/managed-care/lib/recert-utils.test.js`

**Step 1: Write the failing tests**

```javascript
// content/modules/managed-care/lib/recert-utils.test.js
import { describe, it, expect } from 'vitest';
import {
  resolveRelativeDate, isInProgress, isStuck, groupByDay, runBadgeCounts
} from './recert-utils.js';

const NOW = new Date('2026-06-11T18:00:00Z');

describe('resolveRelativeDate', () => {
  it('resolves today', () => expect(resolveRelativeDate('today', NOW)).toBe('2026-06-11'));
  it('resolves -30d', () => expect(resolveRelativeDate('-30d', NOW)).toBe('2026-05-12'));
  it('resolves -7d', () => expect(resolveRelativeDate('-7d', NOW)).toBe('2026-06-04'));
  it('passes through absolute dates', () => expect(resolveRelativeDate('2026-01-15', NOW)).toBe('2026-01-15'));
  it('returns null on garbage', () => expect(resolveRelativeDate('banana', NOW)).toBe(null));
});

describe('isInProgress', () => {
  for (const s of ['pending', 'fetching_documents', 'extracting', 'all_documents_extracted', 'generating_defense']) {
    it(`${s} is in progress`, () => expect(isInProgress(s)).toBe(true));
  }
  it('completed is not', () => expect(isInProgress('completed')).toBe(false));
  it('failed is not', () => expect(isInProgress('failed')).toBe(false));
});

describe('isStuck', () => {
  it('in-progress + updatedAt 31min ago → stuck', () => {
    expect(isStuck({ status: 'extracting', updatedAt: '2026-06-11T17:29:00Z' }, NOW)).toBe(true);
  });
  it('in-progress + updatedAt 5min ago → not stuck', () => {
    expect(isStuck({ status: 'extracting', updatedAt: '2026-06-11T17:55:00Z' }, NOW)).toBe(false);
  });
  it('completed is never stuck', () => {
    expect(isStuck({ status: 'completed', updatedAt: '2026-06-11T10:00:00Z' }, NOW)).toBe(false);
  });
});

describe('groupByDay', () => {
  it('buckets Today / Yesterday / Earlier off createdAt (local time)', () => {
    const runs = [
      { id: 'a', createdAt: '2026-06-11T14:00:00Z' },
      { id: 'b', createdAt: '2026-06-10T23:00:00Z' },
      { id: 'c', createdAt: '2026-06-01T08:00:00Z' },
    ];
    const groups = groupByDay(runs, NOW);
    expect(groups.map(g => [g.label, g.runs.map(r => r.id)])).toEqual([
      ['Today', ['a']], ['Yesterday', ['b']], ['Earlier', ['c']],
    ]);
  });
  it('omits empty groups', () => {
    expect(groupByDay([{ id: 'a', createdAt: '2026-06-11T14:00:00Z' }], NOW).map(g => g.label)).toEqual(['Today']);
  });
});

describe('runBadgeCounts', () => {
  it('counts in-flight + unseen-completed', () => {
    const runs = [
      { id: 'a', status: 'extracting' },
      { id: 'b', status: 'completed' },
      { id: 'c', status: 'completed' },
      { id: 'd', status: 'failed' },
    ];
    const unseen = new Set(['b', 'd']);
    expect(runBadgeCounts(runs, unseen)).toEqual({ inFlight: 1, unseenDone: 2 });
  });
});
```

**Step 2:** Run `npx vitest run` — expect FAIL (module not found).

**Step 3: Implement**

```javascript
// content/modules/managed-care/lib/recert-utils.js
// Pure helpers — no DOM, no chrome.*, so they stay unit-testable.

export const IN_PROGRESS_STATUSES = [
  'pending', 'fetching_documents', 'extracting', 'all_documents_extracted', 'generating_defense',
];

export const STATUS_LABELS = {
  pending: 'Queued',
  fetching_documents: 'Fetching documents',
  extracting: 'Extracting',
  all_documents_extracted: 'Documents ready',
  generating_defense: 'Writing clinical update',
  completed: 'Done',
  failed: 'Failed',
};

const STUCK_AFTER_MS = 30 * 60 * 1000;

export function isInProgress(status) {
  return IN_PROGRESS_STATUSES.includes(status);
}

// "No server stall-sweep exists" — a crashed pipeline Lambda leaves the run
// in-progress forever, so staleness off updatedAt is the only signal we get.
export function isStuck(run, now = new Date()) {
  if (!isInProgress(run.status)) return false;
  const updated = new Date(run.updatedAt).getTime();
  return Number.isFinite(updated) && now.getTime() - updated > STUCK_AFTER_MS;
}

// Preset relativeDateWindow tokens: '-Nd', 'today', or an absolute YYYY-MM-DD.
export function resolveRelativeDate(token, now = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  let days = null;
  if (token === 'today') days = 0;
  else {
    const m = /^-(\d+)d$/.exec(token);
    if (m) days = Number(m[1]);
  }
  if (days === null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function groupByDay(runs, now = new Date()) {
  const today = localDayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = localDayKey(y);

  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  for (const run of runs) {
    const key = localDayKey(new Date(run.createdAt));
    if (key === today) buckets.Today.push(run);
    else if (key === yesterday) buckets.Yesterday.push(run);
    else buckets.Earlier.push(run);
  }
  return ['Today', 'Yesterday', 'Earlier']
    .filter((label) => buckets[label].length)
    .map((label) => ({ label, runs: buckets[label] }));
}

export function runBadgeCounts(runs, unseenIds) {
  let inFlight = 0, unseenDone = 0;
  for (const run of runs) {
    if (isInProgress(run.status)) inFlight += 1;
    else if (run.status === 'completed' && unseenIds.has(run.id)) unseenDone += 1;
  }
  return { inFlight, unseenDone };
}
```

**Step 4:** Run `npx vitest run` — expect all PASS.

**Step 5:** Commit: `feat(mc): recert pure helpers (status, stuck, grouping, preset dates)`

---

### Task 3: API client — `recert-api.js`

**Files:**
- Create: `content/modules/managed-care/recert-api.js`
- Modify: `content/content.js` (import next to the CertAPI import, ~line 25)

No unit test (thin transport, mirrors `content/modules/certifications/cert-api.js`). Verified by build + Task 12.

**Step 1: Implement**

```javascript
// content/modules/managed-care/recert-api.js
// Recertification ("clinical update") API client. All calls ride the background
// API_REQUEST channel — bearer token + base URL live in background.js.
// Contracts: .context/chrome-ext-recert-handoff.md

async function apiRequest(endpoint, options = {}) {
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options,
  });
  return response;
}

function qs(params) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  return new URLSearchParams(clean).toString();
}

const RecertAPI = {
  // { orgSlug, mine, facilityName, patientId, status, limit, offset }
  // facilityName omitted → all locations the user can access ("All locations" mode).
  async list(params) {
    const res = await apiRequest(`/api/extension/recertifications?${qs(params)}`, { method: 'GET' });
    if (!res?.success) return null;
    return res.data?.recertifications || [];
  },

  // Full record — also used to read a failed run's stored config for retry.
  async get(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}`, { method: 'GET' });
    if (!res?.success) return null;
    return res.data?.recertification || null;
  },

  // patientId = PCC external client id; drives managedCareStay prefill.
  async formData({ orgSlug, patientId }) {
    const res = await apiRequest(`/api/extension/recertifications/form-data?${qs({ orgSlug, patientId })}`, { method: 'GET' });
    if (!res?.success) throw new Error(res?.error || 'Failed to load form data');
    return res.data?.formData;
  },

  async create(body) {
    const res = await apiRequest('/api/extension/recertifications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to create clinical update');
    return res.data?.recertification;
  },

  async generate(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/generate`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to start generation');
    return true;
  },

  // Only valid on completed runs. Mint on click — never pre-mint (30-min single-user token).
  async mintViewLink(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/view-link`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to create view link');
    return res.data?.url;
  },

  async archive(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/archive`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to archive');
    return true;
  },

  // Per-facility gate, same model as ftag-prevention/module-status.
  async moduleStatus({ facilityName, orgSlug }) {
    const res = await apiRequest(`/api/extension/recertifications/module-status?${qs({ facilityName, orgSlug })}`, { method: 'GET' });
    return res?.success === true && res?.data?.enabled === true;
  },

  async savePreset({ orgSlug, name, ...config }) {
    const res = await apiRequest('/api/extension/recertifications/presets', {
      method: 'POST',
      body: JSON.stringify({ orgSlug, name, ...config }),
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to save preset');
    return res.data?.preset;
  },

  async deletePreset(presetId) {
    const res = await apiRequest(`/api/extension/recertifications/presets/${presetId}`, { method: 'DELETE' });
    if (!res?.success) throw new Error(res?.error || 'Failed to delete preset');
    return true;
  },
};

window.RecertAPI = RecertAPI;
export { RecertAPI };
```

**Step 2:** In `content/content.js`, after the CertAPI import add:
```javascript
// 3.6. Recertification API (window.RecertAPI for fab.js + managed-care module)
import './modules/managed-care/recert-api.js';
```

**Step 3:** `npm run build` — expect success.

**Step 4:** Commit: `feat(mc): recertifications API client`

---

### Task 4: Run tracker (poll + badge + toast source of truth)

**Files:**
- Create: `content/modules/managed-care/lib/run-tracker.js`
- Test: `content/modules/managed-care/lib/run-tracker.test.js` (the pure diff only)
- Modify: `content/content.js` (init after RecertAPI import)

The tracker: persists tracked run IDs + unseen-completed IDs in `chrome.storage.local` (survives PCC navigation), polls `RecertAPI.list({ mine: true })` every 10s while anything is in flight, detects terminal transitions, and notifies subscribers (badge, toast, open panel).

**Step 1: Write failing test for the pure transition diff**

```javascript
// content/modules/managed-care/lib/run-tracker.test.js
import { describe, it, expect } from 'vitest';
import { diffTransitions } from './run-tracker.js';

describe('diffTransitions', () => {
  it('reports runs that newly reached a terminal status', () => {
    const prev = { a: 'extracting', b: 'generating_defense', c: 'completed' };
    const next = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'failed' },
      { id: 'c', status: 'completed' },   // already terminal — not a transition
      { id: 'd', status: 'extracting' },  // still running
    ];
    expect(diffTransitions(prev, next)).toEqual([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'failed' },
    ]);
  });
  it('first sighting already-terminal is not a transition (page reload case)', () => {
    expect(diffTransitions({}, [{ id: 'x', status: 'completed' }])).toEqual([]);
  });
});
```

**Step 2:** `npx vitest run` — expect FAIL.

**Step 3: Implement**

```javascript
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

window.McRunTracker = RunTracker;
```

**Step 4:** `npx vitest run` — expect PASS. `npm run build` — expect success.

**Step 5:** Commit: `feat(mc): run tracker with storage-backed polling and transition diff`

---

### Task 5: CSS + analytics schema entries

**Files:**
- Create: `content/css/managed-care.css`
- Modify: `content/css-bootstrap.js` (add `?inline` import + bundle entry, next to `qmBoard`)
- Modify: `content/utils/analytics-schema.js` (EVENT_SCHEMA additions)

**Step 1:** Create `content/css/managed-care.css`. Reuse `--super-*` variables from `variables.css`; follow `qm-board.css` conventions. Required class groups (style to match QM board's panel look):
- `.mc-panel-overlay` (fixed, full-viewport, z-index above PCC like `#qm-board-overlay`)
- `.mc-panel`, `.mc-panel__header`, `.mc-panel__close`
- `.mc-toolbar` — location toggle (`.mc-toggle`, `.mc-toggle__btn`, `.mc-toggle__btn--active`), mine/everyone toggle
- `.mc-run-group`, `.mc-run-group__label` (Today/Yesterday/Earlier)
- `.mc-run-row` + status variants: `--running` (spinner via CSS animation), `--done`, `--failed`, `--stuck`; `.mc-run-row__facility-chip` (All-locations mode only); `.mc-run-row__error`
- `.mc-wizard`, `.mc-wizard__step`, `.mc-wizard__nav`
- `.mc-header-btn` (resident-header button — match PCC's `.rh-icon-btn` sizing: 22px icon, same hover) + `.mc-header-btn__badge`
- `.super-dial__action--mc` (FAB action color — pick an unused hue; QM is orange) + reuse `.super-dial__action-badge`

**Step 2:** Wire into `css-bootstrap.js`: `import managedCare from './css/managed-care.css?inline';` + append to `CSS_BUNDLE`.

**Step 3:** Add to `EVENT_SCHEMA` in `content/utils/analytics-schema.js` (per project rule: every `track()`/`data-track` needs an allowlist entry or it silently drops; ship all instrumentation in this one PR):

```javascript
// Managed Care (recert generation + tracking)
mc_panel_opened: ['source', 'scope'],        // source: 'fab'|'header'; scope: 'patient'|'all'
mc_wizard_opened: ['prefilled'],             // prefilled: managedCareStay found?
mc_run_created: ['payer_type', 'doc_type_count', 'used_preset'],
mc_run_retried: [],
mc_run_archived: ['from_status'],
mc_view_link_opened: [],
mc_location_mode_changed: ['mode'],          // 'this'|'all'
mc_preset_saved: [],
mc_run_completed_toast: ['status'],          // 'completed'|'failed'
```
No patient names/ids in any prop (PHI guardrail).

**Step 4:** `npm run build` — expect success (this also runs `check:tracking`).

**Step 5:** Commit: `feat(mc): styles + analytics schema for managed care panel`

---

### Task 6: Panel — run list (`ManagedCarePanel.jsx`, `RunList.jsx`, `RunRow.jsx`)

**Files:**
- Create: `content/modules/managed-care/ManagedCarePanel.jsx`
- Create: `content/modules/managed-care/components/RunList.jsx`
- Create: `content/modules/managed-care/components/RunRow.jsx`

Build the list first, wizard in Task 7 — the list is testable against existing stage data immediately.

**Step 1: `RunRow.jsx`** — one run, behavior by status:

```jsx
// content/modules/managed-care/components/RunRow.jsx
import { useState } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, isStuck, STATUS_LABELS } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

export const RunRow = ({ run, showFacility, onArchived, onRetry }) => {
  const [busy, setBusy] = useState(false);
  const stuck = isStuck(run);

  const openOnDashboard = async () => {
    setBusy(true);
    try {
      const url = await RecertAPI.mintViewLink(run.id); // mint on click, never cached
      track('mc_view_link_opened');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      window.SuperToast?.error(e.message || 'Could not open — try again');
    } finally { setBusy(false); }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await RecertAPI.archive(run.id);
      track('mc_run_archived', { from_status: run.status });
      onArchived(run.id);
    } catch (e) {
      window.SuperToast?.error(e.message || 'Archive failed');
    } finally { setBusy(false); }
  };

  const mod = run.status === 'failed' ? '--failed'
    : stuck ? '--stuck'
    : isInProgress(run.status) ? '--running' : '--done';

  return (
    <div className={`mc-run-row mc-run-row${mod}`}>
      <div className="mc-run-row__main">
        <span className="mc-run-row__patient">{run.patientName}</span>
        {run.payerName && <span className="mc-run-row__payer">{run.payerName}</span>}
        {showFacility && <span className="mc-run-row__facility-chip">{run.facilityName || run.locationId}</span>}
        <span className="mc-run-row__status">
          {stuck ? `Taking longer than expected (started ${minutesAgo(run.createdAt)}m ago)` : STATUS_LABELS[run.status] || run.status}
        </span>
        {run.status === 'failed' && run.errorMessage && (
          <div className="mc-run-row__error">{run.errorMessage}</div>
        )}
      </div>
      <div className="mc-run-row__actions">
        {run.status === 'completed' && (
          <button disabled={busy} onClick={openOnDashboard}>Open on dashboard →</button>
        )}
        {run.status === 'failed' && (
          <button disabled={busy} onClick={() => onRetry(run)}>Retry</button>
        )}
        {(run.status === 'failed' || stuck) && (
          <button disabled={busy} onClick={archive}>Archive</button>
        )}
      </div>
    </div>
  );
};

const minutesAgo = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
```

Note: list rows may not include `facilityName` — if absent at integration time, show the chip only when present and ask backend to add it to list rows (small, additive).

**Step 2: `RunList.jsx`** — fetch + grouping + toggles:

- Props: `{ orgSlug, patientId (optional), currentFacilityName, onRetry }`.
- State: `runs`, `loading`, `locationMode` (`'this'|'all'`, persisted in `localStorage` key `super-mc-location-mode`), `mineOnly` (default `true`).
- Fetch: `RecertAPI.list({ orgSlug, mine: mineOnly || undefined, patientId, facilityName: locationMode === 'this' && !patientId ? currentFacilityName : undefined, limit: 50 })`. Patient-scoped view passes `patientId` and hides both toggles.
- Render: `groupByDay(runs)` → `.mc-run-group` sections of `RunRow`s; facility chips only when `locationMode === 'all'`; `mineOnly` off → show `createdByName` on rows; empty state ("No clinical updates yet"); "Load more" via `offset` when a full page came back.
- Refresh: re-fetch every 10s while any visible run `isInProgress` (panel-local interval, cleared on unmount); also subscribe to `RunTracker` and re-fetch on transitions.
- On mount and on data: `RunTracker.markSeen(runs.filter(r => !isInProgress(r.status)).map(r => r.id))` — viewing the list clears the badge.
- Toggle handlers fire `track('mc_location_mode_changed', { mode })`.

**Step 3: `ManagedCarePanel.jsx`** — the shell:

- Props: `{ orgSlug, facilityName, patientId, patientName, source, onClose }`.
- `useEffect` on mount: `track('mc_panel_opened', { source, scope: patientId ? 'patient' : 'all' })`.
- Layout: header ("Managed Care" + patient name when scoped + close ×), then when `patientId`: a "New Clinical Update" button opening the wizard (Task 7 — placeholder `<button disabled>` for now), then `RunList`.
- `onRetry(run)` handler: placeholder for now (wired in Task 8).

**Step 4:** `npm run build` — expect success.

**Step 5:** Commit: `feat(mc): managed care panel with grouped run list`

---

### Task 7: Wizard (`Wizard.jsx`)

**Files:**
- Create: `content/modules/managed-care/components/Wizard.jsx`
- Modify: `content/modules/managed-care/ManagedCarePanel.jsx` (replace placeholder)

3 steps, driven entirely by `RecertAPI.formData({ orgSlug, patientId })`. Re-read handoff §3.2/§3.3 for field shapes before building.

**Step 1: Build `Wizard.jsx`.** Props: `{ orgSlug, patientId, facilityName, prefillConfig (optional, for retry), onCreated, onCancel }`. One component, internal `step` state (1–3), one `config` state object mirroring the create body.

- On mount: load form-data; `track('mc_wizard_opened', { prefilled: !!fd.managedCareStay })`. If `prefillConfig` (retry path) → apply it wholesale and skip prefill.
- **Step 1 — Payer & auth:** `payerName` (text, prefilled `managedCareStay.payerName`), `payerType` select from `payerTypeOptions`, `authorizationType` select from `authorizationTypeOptions`, `daysRequested` (prefilled `requestedDays`), `documentStartDate`/`documentEndDate` date inputs (prefilled from `authStartDate`/`authEndDate`). Preset dropdown at top: org presets then personal (group by `scope`); picking one fills the whole config — resolve `relativeDateWindow` via `resolveRelativeDate` for the date fields, then apply `payerType`, `daysRequested`, `authorizationType`, `documentTypes`, `documentTypeRangeOverrides`, `mdsSections`.
- **Step 2 — Documents:** checkbox tree from `documentTypeGroups` + `documentTypeDisplayNames` (group header toggles members) → `requestedDocumentTypes`. Per-type "custom range" expander → `documentTypeRangeOverrides[type] = {start, end}`. MDS sections multi-select from `mdsSectionOptions` → `mdsSections`.
- **Step 3 — Review & generate:** summary of config; "Save as preset" (name prompt → `RecertAPI.savePreset({ orgSlug, name, ...config })`, personal scope is implicit; `track('mc_preset_saved')`); **Generate** button:

```jsx
const generate = async () => {
  setSubmitting(true);
  try {
    const rec = await RecertAPI.create({
      orgSlug,
      externalPatientId: patientId,   // PCC client id
      facilityName,                   // server resolves to locationId
      ...config,
    });
    await RecertAPI.generate(rec.id);
    window.McRunTracker?.track({ id: rec.id, status: 'fetching_documents' });
    track('mc_run_created', {
      payer_type: config.payerType || 'unspecified',
      doc_type_count: (config.requestedDocumentTypes || []).length,
      used_preset: usedPreset,
    });
    onCreated(rec);
  } catch (e) {
    setError(e.message); // surface backend 'required' messages inline
  } finally { setSubmitting(false); }
};
```

- Validation before step transitions: payerName + both dates required (mirror backend's 400 `required` list).

**Step 2:** Wire into `ManagedCarePanel.jsx`: "New Clinical Update" toggles list ⇄ wizard; `onCreated` returns to list + triggers RunList refresh.

**Step 3:** `npm run build` — expect success.

**Step 4:** Commit: `feat(mc): clinical update wizard with presets and managed-care prefill`

---

### Task 8: Retry flow (re-create + archive)

**Files:**
- Modify: `content/modules/managed-care/ManagedCarePanel.jsx`

Settled semantics: retry-in-place is server-disabled. Retry = read the failed run's stored config → reopen the wizard prefilled → on successful create+generate, archive the failed run.

**Step 1:** Implement `onRetry(run)` in the panel:

```javascript
const onRetry = async (failedRun) => {
  const full = await RecertAPI.get(failedRun.id); // full record carries the original config
  if (!full) { window.SuperToast?.error('Could not load the failed run'); return; }
  setRetrySource(failedRun.id);
  setWizardPrefill({
    payerName: full.payerName,
    payerType: full.payerType,
    daysRequested: full.daysRequested,
    authorizationType: full.authorizationType,
    documentStartDate: full.documentStartDate,
    documentEndDate: full.documentEndDate,
    requestedDocumentTypes: full.requestedDocumentTypes,
    documentTypeRangeOverrides: full.documentTypeRangeOverrides,
    mdsSections: full.mdsSections,
    includeAdmissionDocs: full.includeAdmissionDocs,
  });
  setShowWizard(true);
};
```

In `onCreated`, when `retrySource` is set: `await RecertAPI.archive(retrySource)` (best-effort — toast on failure but don't block), `track('mc_run_retried')`, clear `retrySource`.

⚠️ Integration check: confirm on stage that `GET /recertifications/{id}` returns these config fields (handoff §3.5 shows a subset; Jonathan said "the config is stored on the failed recert, so the extension can read it back"). If the status endpoint turns out to be slim, ask backend to widen it — do not scrape config from anywhere else.

Note: retry from a patient-scoped panel reuses that patient's id; retry from the central (unscoped) panel must use the failed run's patient — pass `externalPatientId` from `full.externalPatientId ?? full.patientId` and `facilityName: undefined, locationId: full.locationId` in that case (the failed run's location is authoritative, not the facility PCC is parked on).

**Step 2:** `npm run build` — expect success.

**Step 3:** Commit: `feat(mc): retry failed runs via re-create + archive`

---

### Task 9: Launcher + MC FAB action + badge + toasts

**Files:**
- Modify: `content/super-menu/fab.js`

**Step 1: Launcher** — clone the `QMBoardLauncher` pattern exactly (same lifecycle: idempotent `open()`, Escape handler, dynamic `import('preact')` + module, `render(null)` unmount). Name it `ManagedCareLauncher`; `open({ patientId, patientName, source } = {})` passes scope through to the panel:

```javascript
render(h(ManagedCarePanel, {
  orgSlug: orgSlug || '',
  facilityName: facilityName || '',
  patientId: opts.patientId || null,
  patientName: opts.patientName || null,
  source: opts.source || 'fab',
  onClose: () => this.close(),
}), overlayEl);
```
Export `window.ManagedCareLauncher = ManagedCareLauncher;`

**Step 2: FAB button.** Add to the `createBubbles()` template (place between the F-Tag and QM buttons), gated like F-Tag (hidden until module-status confirms):

```html
<button id="super-mc-action" class="super-dial__action super-dial__action--mc" aria-label="Managed Care" style="display:none;" data-track="fab_clicked" data-track-prop-fab="managed_care">
  MC
  <span class="super-dial__action-badge" id="super-mc-badge" style="display:none;"></span>
</button>
```

Click handler (same shape as `qmAction`): close dial, toggle `ManagedCareLauncher` with `{ source: 'fab' }`.

**Step 3: Gating.** Copy the F-Tag gating trio (`_ftagModuleStatusCache` / `updateFtagModuleStatus` / `retryFtagModuleStatus`, fab.js:203–264) into `updateMcModuleStatus` / `retryMcModuleStatus` using `RecertAPI.moduleStatus(...)` and `#super-mc-action`; call `retryMcModuleStatus()` next to the existing `retryFtagModuleStatus()` call (~line 147). Share the facility-name-not-ready retry timing as-is.

**Step 4: Badge + toast wiring.** After the FAB mounts:

```javascript
// Badge counts across ALL the user's locations regardless of any panel toggle —
// a run finishing at her other building still ticks the badge.
const { getOrg } = /* context.js import already in fab.js scope */;
const orgSlug = getOrg()?.org;
if (orgSlug && window.McRunTracker) {
  window.McRunTracker.init(orgSlug);
  window.McRunTracker.subscribe(({ inFlight, unseenDone, transitions }) => {
    const badge = document.getElementById('super-mc-badge');
    if (badge) {
      const n = inFlight + unseenDone;
      badge.style.display = n ? '' : 'none';
      badge.textContent = String(n);
      badge.classList.toggle('super-dial__action-badge--running', inFlight > 0);
    }
    for (const t of transitions) {
      // Tray is the durable answer; the toast is a bonus.
      if (t.status === 'completed') {
        window.SuperToast?.success('A clinical update is ready — open Managed Care to view it');
      } else {
        window.SuperToast?.error('A clinical update failed — open Managed Care to retry');
      }
      track('mc_run_completed_toast', { status: t.status });
    }
  });
}
```
(No patient name in the toast: the list row carries it; keeping the toast PHI-free avoids name-on-screen complaints and analytics guardrails.)

⚠️ Before touching `#super-bubble-badge` (the S button): `grep -n "super-bubble-badge" content/ -r` — it has an existing setter. v1 badges only the MC action; bubbling to S is a polish follow-up if the existing usage allows.

**Step 5:** `npm run build`; load `dist/` in Chrome; on a module-enabled facility confirm the MC action appears in the dial and opens the panel.

**Step 6:** Commit: `feat(mc): MC FAB action, launcher, badge + completion toasts`

---

### Task 10: Resident-header button injection

**Files:**
- Create: `content/super-menu/managed-care-header.js`
- Modify: `content/content.js` (import after fab.js import, ~line 60)

Injects an always-on (when module-enabled) "Managed Care" button into PCC's resident header `.rh-icon-buttons` group, opening the panel scoped to that patient.

**Step 1: Implement.** Pattern: meddiag-augment's poll-for-DOM + idempotency, fab.js's module-status gate.

```javascript
// content/super-menu/managed-care-header.js
// Injects the per-patient "Managed Care" button into PCC's resident header
// (the .rh-icon-buttons group next to Print/Options). Tolerant by design:
// the header has compact/standard/expanded variants and older facilities may
// not render .rh-icon-buttons at all — in that case we simply don't inject
// (the MC FAB still gives access).
import { RecertAPI } from '../modules/managed-care/recert-api.js';
import { track } from '../utils/analytics.js';

const BTN_ID = 'super-mc-header-btn';
const POLL_MS = 1000;
const MAX_POLLS = 15;

function getPatientFromHeader() {
  // Prefer the URL param (matches getMDSContext); fall back to the header's
  // "Client ID: NNN" title span.
  const url = new URL(window.location.href);
  let patientId = url.searchParams.get('ESOLclientid');
  const nameEl = document.querySelector('.residentName#name, .residentName');
  if (!patientId) {
    const idSpan = nameEl?.querySelector('span[title^="Client ID:"]');
    const m = idSpan?.title?.match(/Client ID:\s*(\d+)/);
    patientId = m?.[1] || null;
  }
  const patientName = nameEl ? nameEl.childNodes[0]?.textContent?.trim() || null : null;
  return { patientId, patientName };
}

async function tryInject() {
  if (document.getElementById(BTN_ID)) return true;        // idempotent
  const iconGroup = document.querySelector('.residentHeaderDetails .rh-icon-buttons');
  if (!iconGroup) return false;
  const { patientId, patientName } = getPatientFromHeader();
  if (!patientId) return false;

  const orgSlug = localStorage.getItem('CORE.org_code');
  const facLink = document.getElementById('pccFacLink');
  const facilityName = facLink?.title || facLink?.textContent?.trim();
  if (!orgSlug || !facilityName) return false;

  const enabled = await RecertAPI.moduleStatus({ facilityName, orgSlug });
  if (!enabled) return true; // resolved: gated off, stop polling

  const wrapper = document.createElement('div');
  wrapper.className = 'rh-icon-menu-wrapper';
  wrapper.innerHTML = `
    <button type="button" id="${BTN_ID}" class="rh-icon-btn mc-header-btn" aria-label="Managed Care">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M12 12v6"/>
      </svg>
      <span class="mc-header-btn__badge" id="super-mc-header-badge" style="display:none;"></span>
      <div class="rh-hover-details">Managed Care</div>
    </button>`;
  // Before PCC's print button so ours reads as part of the group.
  iconGroup.prepend(wrapper);

  document.getElementById(BTN_ID).addEventListener('click', (e) => {
    e.stopPropagation();
    track('mc_panel_opened', { source: 'header', scope: 'patient' }); // panel also tracks; keep one — see step 2
    window.ManagedCareLauncher?.open({ patientId, patientName, source: 'header' });
  });

  // Per-patient badge: any tracked in-flight/unseen run. Counts are global on
  // the tracker; per-patient precision comes from the panel itself — the header
  // badge is a glance signal, v1 shows the tracker's counts.
  window.McRunTracker?.subscribe(({ inFlight, unseenDone }) => {
    const b = document.getElementById('super-mc-header-badge');
    if (!b) return;
    const n = inFlight + unseenDone;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  });
  return true;
}

function start(attempt = 0) {
  tryInject().then((settled) => {
    if (!settled && attempt < MAX_POLLS) setTimeout(() => start(attempt + 1), POLL_MS);
  });
}

start();
// PCC's clinical chart is full-page-load navigation, but re-arm on pageshow
// (bfcache restores) so the button survives back/forward.
window.addEventListener('pageshow', () => start());
```

**Step 2:** De-dupe the `mc_panel_opened` event: the panel's mount effect already tracks it — remove the `track()` call from the click handler (keep `source` flowing through props instead). One emit per open.

**Step 3:** `npm run build`; reload extension; open a resident's Clinical chart on the enabled facility → button appears next to Print; click → panel opens scoped to that patient (name in header, no location toggles).

**Step 4:** Commit: `feat(mc): managed care button in PCC resident header`

---

### Task 11: Polish pass

**Files:** touched modules from Tasks 6–10.

**Step 1:** Patient-scoped panel: confirm `markSeen` fires for that patient's terminal runs when viewed, header badge drops accordingly.

**Step 2:** Wizard error surfaces: backend `400` with `required` array renders as field-level hints; `403` module-disabled renders a clear "not enabled for this facility" state (possible if gate flipped between page load and submit).

**Step 3:** Empty/edge states: no runs, list API `null` (auth/transient → "Couldn't load — retry" button), unresolvable facility (empty list is correct, not an error).

**Step 4:** `npx vitest run` + `npm run build` — both green.

**Step 5:** Commit: `polish(mc): edge states and error surfaces`

---

### Task 12: Manual end-to-end verification (stage jonathan)

No automated UI harness — this checklist is the acceptance gate. Backend must be deployed on stage `jonathan` with the `recertifications` module enabled for the test facility (org `enabledModules` or per-location override) **or create/generate will 403**.

**Happy path:**
1. `npm run build`, load `dist/`, log in, open the enabled facility.
2. Resident header shows "Managed Care" next to Print on a synced patient. FAB dial shows MC.
3. Header button → panel scoped to patient → New Clinical Update → wizard prefilled from managed-care stay (payer, auth window, days).
4. Pick an org preset → entire wizard fills, relative dates resolve correctly.
5. Generate → run appears as in-progress; **navigate to a different patient** → MC FAB badge shows 1.
6. Kick off a second patient's run (the batch flow). Badge shows 2.
7. From the second patient's page, open the MC FAB → central tray shows both runs under Today, with patient names and statuses, mine-only default.
8. On completion: toast fires; badge flips to unseen-done count; opening the tray clears it.
9. Completed row → "Open on dashboard →" → new tab, sealed viewer renders that one recert.

**Negative checks:**
10. View-link on an in-progress run is not offered (and a hand-fired mint returns 400).
11. Failed run shows `errorMessage` inline; Retry opens prefilled wizard; on generate, old run is archived and drops from the list.
12. Archive on a failed run removes it without retry.
13. Location toggle (central, unscoped): "This location" vs "All locations"; facility chips only in All mode; runs from a second facility appear in All mode (needs a multi-location test user).
14. Stuck simulation: hand-create a run and don't generate, or wait out a dead run >30 min → "taking longer than expected" row state with Archive.
15. Disabled facility: no header button, no MC FAB action; existing runs still listable if any (list is ungated).
16. PostHog live events: `mc_panel_opened`, `mc_run_created`, `mc_view_link_opened` arrive with props; no PHI in any prop.

**Step: final commit + version bump** per repo convention (`chore(release): bump to v1.0.x`) once the checklist passes.

---

## Out of scope (do not build)

ADR flows; patient picker in the central view; "open patient in PCC" cross-facility flip; upload-to-PCC; S-bubble badge integration (check `#super-bubble-badge` setter first, separate change); preset management UI beyond save (delete exists in the API client for later).
