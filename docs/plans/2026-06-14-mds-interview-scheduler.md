# MDS Interview Auto-Scheduler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On PCC's New/Change MDS popup (`newmds.xhtml`), intercept Save, evaluate interview coverage once against the final ARD/type, and offer to auto-create the missing BIMS/PHQ/GG/Pain UDAs before letting PCC persist the MDS.

**Architecture:** A new vanilla-JS + Preact module (`content/modules/mds-interview-scheduler/`). On popup load we silently prefetch the facility's UDA library (scrape `newassess.jsp`'s `std_assessment` options) and keyword-match each interview type. We wrap the popup's global `submitSave()`; on Save we call the backend `/api/extension/mds/interview-coverage`, and if anything is needed we show a Preact confirm modal, create the chosen UDAs via background POSTs (the proven `care-plan-stamp` pattern), then call PCC's original `submitSave()`. Reusing `care-plan-stamp`'s same-origin discover/POST approach means we never touch PCC's page JS.

**Tech Stack:** Vanilla JS (DOM + `fetch` same-origin), Preact (modal), Vitest (unit tests for pure logic), `chrome.runtime.sendMessage({type:'API_REQUEST'})` relay for authed backend calls.

**Design doc:** `docs/plans/2026-06-14-mds-interview-scheduler-design.md`

---

## ⚠️ Contract risk to validate (read before Task 3)

The backend coverage route takes a **`description`** string (PCC's assessment description, e.g. `"Medicare - 5 Day /"`) which "drives requirements + GG window." But the `newmds.xhtml` popup exposes only the **A0310 codes** (A0310A/B/C/F/G), not a description string. Task 3 derives a description from those codes via an isolated, tested mapping, and *also* sends the raw codes as extra query params as a forward-compatible hedge.

**Before trusting this in production:** confirm with the backend (a) the exact `description` strings it matches on for 5-Day / IPA / Quarterly / Annual / Admission / SCSA / Discharge / Entry, OR (b) that it can accept the raw A0310 codes directly. If the derived description lands in the wrong category, nurses see wrong requirements — a clinical-correctness bug, so this is the one thing to verify against the live validator (the handoff says it was verified 76/76 for 5-Day/Quarterly/IPA/Discharge/Annual).

---

## Reference patterns (study these first)

- `content/modules/care-plan-stamp/pcc-discover.js` — `_fetchText`, `DOMParser` option scraping, miniToken scrape, session-expiry guard.
- `content/modules/care-plan-stamp/pcc-stamp.js` — `_postForm` (same-origin form POST + error/login guards), `orchestrateStamp` (sequential + `onProgress`).
- `content/modules/care-plan-stamp/inject-button.js` — page detection, idempotent injection, polling + URL MutationObserver, dynamic Preact `import()` + overlay mount/teardown, `_resolvePatientId`.
- `content/modules/care-plan-stamp/stamp-api.js` — `API_REQUEST` relay shape for authed backend calls.
- `content/modules/managed-care/lib/recert-utils.test.js` — Vitest colocated-test convention.
- `content/super-menu/context.js:104-118` — `getChatFacilityInfo()` (reads `#pccFacLink`), `getOrg()` (reads `localStorage['CORE.org_code']`).

## Target file layout

```
content/modules/mds-interview-scheduler/
├── lib/
│   ├── coverage-query.js        # pure: derive coverage query + date helpers
│   ├── coverage-query.test.js
│   ├── library-match.js         # pure: keyword-match std_assessment options → interview types
│   └── library-match.test.js
├── coverage-api.js              # fetchInterviewCoverage() via API_REQUEST relay (GET)
├── pcc-library.js               # prefetch + scrape newassess.jsp std_assessment options
├── pcc-schedule-uda.js          # createUda() POST replicating newassess.jsp save
├── form-read.js                 # read ARD/A0310/clientid/miniToken/facility/org/patient
├── SchedulerModal.jsx           # Preact confirm modal: checkboxes + progress
└── inject-scheduler.js          # detect popup, wrap submitSave, orchestrate, mount modal
```

Wire imports into `content/content.js` right after the `care-plan-stamp` block (after line 90).

---

## Task 1: Date + interview constants (pure)

**Files:**
- Create: `content/modules/mds-interview-scheduler/lib/coverage-query.js`
- Test: `content/modules/mds-interview-scheduler/lib/coverage-query.test.js`

**Step 1: Write failing test for date conversion**

```js
import { describe, it, expect } from 'vitest';
import { pccDateToIso } from './coverage-query.js';

describe('pccDateToIso', () => {
  it('converts M/D/YYYY to YYYY-MM-DD', () => {
    expect(pccDateToIso('6/14/2026')).toBe('2026-06-14');
  });
  it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
    expect(pccDateToIso('06/04/2026')).toBe('2026-06-04');
  });
  it('returns null for invalid input', () => {
    expect(pccDateToIso('')).toBe(null);
    expect(pccDateToIso('garbage')).toBe(null);
  });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run content/modules/mds-interview-scheduler/lib/coverage-query.test.js`
Expected: FAIL — `pccDateToIso is not a function`.

**Step 3: Implement**

```js
/**
 * MDS Interview Scheduler — pure query helpers.
 * No DOM / no network here so it stays unit-testable.
 */

/** PCC date strings are M/D/YYYY (display) or MM/DD/YYYY. → 'YYYY-MM-DD' | null */
export function pccDateToIso(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** ISO 'YYYY-MM-DD' → PCC display 'M/D/YYYY' (no leading zeros), for UDA assess_date. */
export function isoToPccDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return `${Number(mm)}/${Number(dd)}/${yyyy}`;
}
```

**Step 4: Run, verify pass.** Same command → PASS.

**Step 5: Commit**

```bash
git add content/modules/mds-interview-scheduler/lib/coverage-query.js content/modules/mds-interview-scheduler/lib/coverage-query.test.js
git commit -m "feat(mds-scheduler): pure PCC date helpers"
```

---

## Task 2: Derive assessment description + a0310g from A0310 codes (pure)

**Files:**
- Modify: `content/modules/mds-interview-scheduler/lib/coverage-query.js`
- Modify: `content/modules/mds-interview-scheduler/lib/coverage-query.test.js`

**Step 1: Write failing tests**

```js
import { deriveDescription, deriveA0310g } from './coverage-query.js';

describe('deriveDescription', () => {
  it('5-Day PPS when A0310B=01', () => {
    expect(deriveDescription({ a0310b: '01' })).toBe('Medicare - 5 Day');
  });
  it('IPA when A0310B=08', () => {
    expect(deriveDescription({ a0310b: '08' })).toBe('Medicare - IPA');
  });
  it('OBRA reason wins when no PPS (Quarterly)', () => {
    expect(deriveDescription({ a0310a: '02', a0310b: '99' })).toBe('Quarterly');
  });
  it('Annual', () => {
    expect(deriveDescription({ a0310a: '03', a0310b: '99' })).toBe('Annual');
  });
  it('Admission', () => {
    expect(deriveDescription({ a0310a: '01', a0310b: '99' })).toBe('Admission');
  });
  it('Discharge return not anticipated', () => {
    expect(deriveDescription({ a0310a: '99', a0310b: '99', a0310f: '10' })).toBe('Discharge - return not anticipated');
  });
  it('empty when nothing meaningful chosen', () => {
    expect(deriveDescription({ a0310a: '99', a0310b: '99', a0310f: '99' })).toBe('');
  });
});

describe('deriveA0310g', () => {
  it('maps planned/unplanned codes to handoff format', () => {
    expect(deriveA0310g('1')).toBe('1. Planned');
    expect(deriveA0310g('2')).toBe('2. Unplanned');
  });
  it('returns undefined when unset / placeholder', () => {
    expect(deriveA0310g('')).toBe(undefined);
    expect(deriveA0310g('-1')).toBe(undefined);
    expect(deriveA0310g('^')).toBe(undefined);
  });
});
```

**Step 2: Run, verify fail** (functions not exported).

**Step 3: Implement** (append to `coverage-query.js`)

```js
// PPS (A0310B) takes priority — it drives PDPM + GG window. Then OBRA reason
// (A0310A), then entry/discharge (A0310F). Strings are best-effort canonical
// labels; see the "Contract risk" note in the plan — validate against backend.
const OBRA_A0310A = {
  '01': 'Admission',
  '02': 'Quarterly',
  '03': 'Annual',
  '04': 'Significant Change',
  '05': 'Significant Correction to Prior Comprehensive',
  '06': 'Significant Correction to Prior Quarterly',
};
const DISCHARGE_A0310F = {
  '01': 'Entry',
  '10': 'Discharge - return not anticipated',
  '11': 'Discharge - return anticipated',
  '12': 'Death in Facility',
};

export function deriveDescription({ a0310a = '', a0310b = '', a0310f = '' } = {}) {
  if (a0310b === '01') return 'Medicare - 5 Day';
  if (a0310b === '08') return 'Medicare - IPA';
  if (OBRA_A0310A[a0310a]) return OBRA_A0310A[a0310a];
  if (DISCHARGE_A0310F[a0310f]) return DISCHARGE_A0310F[a0310f];
  return '';
}

export function deriveA0310g(code) {
  if (code === '1') return '1. Planned';
  if (code === '2') return '2. Unplanned';
  return undefined;
}
```

**Step 4: Run, verify pass.**

**Step 5: Commit**

```bash
git add content/modules/mds-interview-scheduler/lib/coverage-query.js content/modules/mds-interview-scheduler/lib/coverage-query.test.js
git commit -m "feat(mds-scheduler): derive assessment description + a0310g from A0310 codes"
```

---

## Task 3: Assemble the coverage query object (pure)

**Files:**
- Modify: `content/modules/mds-interview-scheduler/lib/coverage-query.js`
- Modify: `content/modules/mds-interview-scheduler/lib/coverage-query.test.js`

**Step 1: Write failing test**

```js
import { buildCoverageQuery } from './coverage-query.js';

describe('buildCoverageQuery', () => {
  const form = {
    patientId: '840913', facilityName: 'BURLINGTON HEALTH', orgSlug: 'champ',
    ard: '6/24/2026', a0310a: '02', a0310b: '99', a0310c: '', a0310f: '99', a0310g: '',
  };
  it('builds the documented params', () => {
    const q = buildCoverageQuery(form);
    expect(q).toMatchObject({
      patientExternalId: '840913',
      facilityName: 'BURLINGTON HEALTH',
      orgSlug: 'champ',
      ardDate: '2026-06-24',
      description: 'Quarterly',
    });
    expect(q.a0310g).toBeUndefined();
    // forward-compat raw codes
    expect(q.a0310a).toBe('02');
  });
  it('returns null when ARD is unparseable (nothing to query yet)', () => {
    expect(buildCoverageQuery({ ...form, ard: '' })).toBe(null);
  });
});
```

**Step 2: Run, verify fail.**

**Step 3: Implement** (append)

```js
/**
 * Build the query object for GET /api/extension/mds/interview-coverage.
 * Returns null when the form isn't coherent enough to evaluate (no valid ARD).
 * Raw A0310 codes are included as a forward-compatible hedge (see Contract risk).
 */
export function buildCoverageQuery(form) {
  const ardDate = pccDateToIso(form.ard);
  if (!ardDate) return null;
  const q = {
    patientExternalId: String(form.patientId || ''),
    facilityName: form.facilityName || '',
    orgSlug: form.orgSlug || '',
    ardDate,
    description: deriveDescription(form),
    // forward-compat: backend may switch to code-based requirements
    a0310a: form.a0310a || '', a0310b: form.a0310b || '',
    a0310c: form.a0310c || '', a0310f: form.a0310f || '',
  };
  const g = deriveA0310g(form.a0310g);
  if (g) q.a0310g = g;
  return q;
}
```

**Step 4: Run, verify pass.**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): assemble interview-coverage query from form state"
```

---

## Task 4: Keyword-match the facility library to interview types (pure)

**Files:**
- Create: `content/modules/mds-interview-scheduler/lib/library-match.js`
- Test: `content/modules/mds-interview-scheduler/lib/library-match.test.js`

**Step 1: Write failing test** (uses real option labels from the attachment)

```js
import { describe, it, expect } from 'vitest';
import { matchLibraryToInterviews } from './library-match.js';

const OPTIONS = [
  { id: '11231', label: 'HCG- BRIEF INTERVIEW FOR MENTAL STATUS (3.0 BIMS)' },
  { id: '11259', label: 'HCG- PHQ-9 (MDS 3.0)' },
  { id: '27347', label: 'HCG Functional Abilities IDT' },
  { id: '12348', label: 'HCG-Pain Assessment (3.0)' },
  { id: '10072', label: 'HCG Nutritional Risk Assessment' },
];

describe('matchLibraryToInterviews', () => {
  it('matches each interview type to its best library option', () => {
    const m = matchLibraryToInterviews(OPTIONS);
    expect(m.bims?.id).toBe('11231');
    expect(m.phq?.id).toBe('11259');
    expect(m.gg?.id).toBe('27347');     // "Functional" → GG
    expect(m.pain?.id).toBe('12348');
  });
  it('leaves a type null when no option matches', () => {
    const m = matchLibraryToInterviews([{ id: '1', label: 'Random Note' }]);
    expect(m.bims).toBe(null);
    expect(m.gg).toBe(null);
  });
  it('prefers an explicit GG label over a generic functional one', () => {
    const m = matchLibraryToInterviews([
      { id: 'a', label: 'HCG Functional Abilities IDT' },
      { id: 'b', label: 'Nursing GG Evaluation' },
    ]);
    expect(m.gg?.id).toBe('b'); // "gg" keyword outranks "functional"
  });
});
```

**Step 2: Run, verify fail.**

**Step 3: Implement**

```js
/**
 * Keyword-match a facility's UDA library (std_assessment <option> list) to the
 * four MDS interview types. Names vary per facility, so we score by keyword and
 * pick the highest-scoring option per type. Best-effort: returns null for a type
 * with no plausible match (caller surfaces "schedule manually").
 *
 * Keyword weights are ordered: a more specific term outranks a generic one
 * (e.g. an explicit "gg" beats a generic "functional").
 */
const KEYWORDS = {
  bims: [['brief interview for mental status', 3], ['bims', 3]],
  phq: [['phq-9', 3], ['phq', 3], ['phq-2 to 9', 3], ['mood', 1]],
  gg: [['section gg', 3], ['gg', 3], ['functional', 1]],
  pain: [['pain', 3], ['section j', 2]],
};

function _score(label, kws) {
  const l = label.toLowerCase();
  let best = 0;
  for (const [term, weight] of kws) {
    if (l.includes(term)) best = Math.max(best, weight);
  }
  return best;
}

export function matchLibraryToInterviews(options) {
  const out = { bims: null, phq: null, gg: null, pain: null };
  for (const type of Object.keys(KEYWORDS)) {
    let bestOpt = null;
    let bestScore = 0;
    for (const opt of options || []) {
      const s = _score(opt.label || '', KEYWORDS[type]);
      if (s > bestScore) { bestScore = s; bestOpt = opt; }
    }
    out[type] = bestOpt;
  }
  return out;
}
```

**Step 4: Run, verify pass.**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): keyword-match facility library to interview types"
```

---

## Task 5: Backend coverage API client

**Files:**
- Create: `content/modules/mds-interview-scheduler/coverage-api.js`

No unit test (thin relay wrapper; covered by manual verification). Mirror `stamp-api.js`.

**Step 1: Implement**

```js
/**
 * Backend client for the interview-coverage engine.
 * Auth handled by background.js via the API_REQUEST relay (bearer token).
 * GET /api/extension/mds/interview-coverage with query params.
 *
 * Exports on window.MdsSchedulerAPI:
 *   fetchInterviewCoverage(query) → coverage response | throws
 */
async function fetchInterviewCoverage(query) {
  // Strip undefined; encode as query string.
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const endpoint = `/api/extension/mds/interview-coverage?${params.toString()}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: { method: 'GET' },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch interview coverage');
    err.endpoint = endpoint;
    err.code = response?.code || response?.data?.code;
    throw err;
  }
  return response.data || response;
}

window.MdsSchedulerAPI = { fetchInterviewCoverage };
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): interview-coverage backend client"
```

---

## Task 6: Prefetch + scrape the facility UDA library

**Files:**
- Create: `content/modules/mds-interview-scheduler/pcc-library.js`

Reuse `pcc-discover.js`'s `_fetchText` + `DOMParser` pattern. The `std_assessment` dropdown lives on `newassess.jsp` (GET, same patient). We fetch it once and parse `<option>`s.

**Step 1: Implement**

```js
/**
 * Fetch + parse the facility's UDA assessment library from PCC's newassess.jsp.
 * Same-origin GET using session cookies (mirrors care-plan-stamp/pcc-discover).
 *
 * Exports on window.MdsSchedulerLibrary:
 *   fetchAssessmentLibrary(patientId) → [{ id, label }]   (std_assessment options)
 */
async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

async function fetchAssessmentLibrary(patientId) {
  // newassess.jsp renders the std_assessment <select> for this client.
  const url = `/care/chart/assess/newassess.jsp?ESOLsave=N&ESOLtabType=C&ESOLclientid=${encodeURIComponent(patientId)}`;
  const html = await _fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sel = doc.querySelector('select[name="std_assessment"]');
  if (!sel) return [];
  return Array.from(sel.options)
    .filter((o) => o.value && o.value !== '' && o.value !== '-1')
    .map((o) => ({ id: o.value, label: (o.textContent || '').trim() }));
}

window.MdsSchedulerLibrary = { fetchAssessmentLibrary };
```

**Step 2: Manual verification note** (do during Task 9 build/load): on a `newmds.xhtml` popup, run in DevTools console:
`await window.MdsSchedulerLibrary.fetchAssessmentLibrary('<clientid>')` → expect an array of `{id,label}` matching the dropdown in the attachment.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): fetch + scrape facility UDA library"
```

---

## Task 7: Create a UDA via background POST

**Files:**
- Create: `content/modules/mds-interview-scheduler/pcc-schedule-uda.js`

Replicate the `newassess.jsp` save POST (from the captured curl). Reuse `_postForm` style from `pcc-stamp.js`. We re-scrape a fresh `ESOLminiToken` from the GET to avoid staleness, then POST.

**Step 1: Implement**

```js
/**
 * Create a single UDA (interview assessment) for a resident by replaying PCC's
 * newassess.jsp save as a same-origin POST. No PCC page JS touched.
 *
 * Mirrors the captured curl:
 *   POST /care/chart/assess/newassess.jsp?ESOLtabType=C&ESOLsave=S
 *   body: ESOLminiToken, ESOLclientid, std_assessment, assess_date, hour, minute,
 *         assessment_type=O, + the form's hidden defaults.
 *
 * Exports on window.MdsSchedulerCreate:
 *   createUda({ patientId, stdAssessmentId, assessDatePcc }) → true | throws
 *   scheduleInterviews({ patientId, picks, onProgress }) → { ok, created, errors }
 */
const NEWASSESS = '/care/chart/assess/newassess.jsp';

async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

/** Re-scrape a fresh miniToken from a newassess.jsp GET for this client. */
async function _freshMiniToken(patientId) {
  const html = await _fetchText(`${NEWASSESS}?ESOLsave=N&ESOLtabType=C&ESOLclientid=${encodeURIComponent(patientId)}`);
  const m = html.match(/name="ESOLminiToken"\s+value="([^"]+)"/);
  if (!m) throw new Error('Could not find ESOLminiToken on newassess form');
  return m[1];
}

async function createUda({ patientId, stdAssessmentId, assessDatePcc, miniToken }) {
  const token = miniToken || (await _freshMiniToken(patientId));
  const body = new URLSearchParams({
    ESOLminiToken: token,
    fromUDAPortal: 'N',
    ESOLclientid: String(patientId),
    ESOLsave: 'N',
    ESOLassessid: 'null',
    ESOLviewTransferInfo: 'N',
    retURL: '/admin/client/cp_assessment.jsp',
    fromMDSRaps: 'N',
    ESOLinquiryid: '-1',
    ESOLcrmentityid: '-1',
    ESOLrefreshautofill: 'N',
    fromMDS3SectionV: 'null',
    ESOLmdsAssessId: 'null',
    earliest: '',
    fromeInteractTransferForm: 'null',
    assess_date: assessDatePcc,            // M/D/YYYY
    assess_date_dummy: assessDatePcc,
    hour: '9',
    minute: '0',
    std_assessment: String(stdAssessmentId),
    assessment_type: 'O',                  // UDA → "Other"
  });
  const res = await fetch(`${NEWASSESS}?ESOLtabType=C&ESOLsave=S`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC newassess POST → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }
  return true;
}

/**
 * picks: [{ type, stdAssessmentId, assessDatePcc, label }]
 * Sequential to keep PCC happy + progress simple. One fresh token reused.
 */
async function scheduleInterviews({ patientId, picks, onProgress }) {
  const result = { ok: true, created: [], errors: [] };
  let token;
  try { token = await _freshMiniToken(patientId); } catch (e) { token = null; }
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'creating' });
    try {
      await createUda({ patientId, stdAssessmentId: p.stdAssessmentId, assessDatePcc: p.assessDatePcc, miniToken: token });
      result.created.push(p.type);
      onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'done' });
    } catch (e) {
      result.ok = false;
      result.errors.push({ type: p.type, error: e.message });
      onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'error', error: e.message });
    }
  }
  return result;
}

window.MdsSchedulerCreate = { createUda, scheduleInterviews };
```

**Step 2: Manual verification note** (Task 9): create one UDA from console on a test resident, confirm it appears in the resident's assessment list dated correctly. **Do this on a test patient first — it writes real data.**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): create UDA via newassess.jsp background POST"
```

---

## Task 8: Read form/context off the popup

**Files:**
- Create: `content/modules/mds-interview-scheduler/form-read.js`

Reads the live `frmData` values, plus patient/facility/org. Facility comes from `window.opener` (the popup has no `#pccFacLink`).

**Step 1: Implement**

```js
/**
 * Read the New/Change MDS popup's form + page context.
 * Facility lives in the OPENER window (the popup is a bare form), org is in
 * same-origin localStorage, patient id is in the form/URL.
 *
 * Exports on window.MdsSchedulerForm:
 *   readFormState() → { patientId, ard, a0310a, a0310b, a0310c, a0310f, a0310g,
 *                       miniToken, operation, facilityName, orgSlug }
 */
function _val(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? (el.value || '') : '';
}

function _resolvePatientId() {
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (fromUrl) return fromUrl;
  return _val('ESOLclientid') || null;
}

function _facilityFromOpener() {
  // getChatFacilityInfo() reads #pccFacLink, which is in the MAIN window, not
  // this popup. Reach into the opener (same origin). Fall back to local helper.
  try {
    const link = window.opener?.document?.getElementById('pccFacLink');
    if (link) return link.title || link.textContent?.trim() || '';
  } catch (_) { /* cross-window access can throw if opener navigated */ }
  if (typeof getChatFacilityInfo === 'function') return getChatFacilityInfo() || '';
  return '';
}

function readFormState() {
  return {
    patientId: _resolvePatientId(),
    ard: _val('ard'),
    a0310a: _val('a0310a'),
    a0310b: _val('a0310b'),
    a0310c: _val('a0310c'),
    a0310f: _val('a0310f'),
    a0310g: _val('a0310g'),
    miniToken: _val('ESOLminiToken'),
    operation: _val('operation'),         // 'N' new, 'X' change
    facilityName: _facilityFromOpener(),
    orgSlug: (typeof getOrg === 'function' ? (getOrg()?.org || '') : ''),
  };
}

window.MdsSchedulerForm = { readFormState };
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): read MDS popup form + opener/org/patient context"
```

---

## Task 9: Confirm modal (Preact)

**Files:**
- Create: `content/modules/mds-interview-scheduler/SchedulerModal.jsx`

A focused modal sized for the 700×650 popup. Props: the coverage result, the library matches, and `onConfirm(selectedTypes)` / `onSkip()`. Internal state: per-needed-item checkbox (default on) + a `phase` for progress. Reuse the existing `Modal.jsx` if it fits the cramped popup; otherwise a self-contained overlay. Keep copy concrete ("schedule by 6/15").

**Step 1: Implement** (sketch — adapt styling to match care-plan-stamp modal)

```jsx
import { useState } from 'preact/hooks';

/**
 * Confirm-create modal shown at Save when interviews need scheduling.
 *
 * Props:
 *   coverage: { summary, interviews: [{type, status, window, recommendedScheduleDate, outOfWindowUda }] }
 *   matches:  { bims, phq, gg, pain }  (each { id, label } | null)
 *   onConfirm(picks)  picks: [{ type, stdAssessmentId, assessDatePcc, label }]
 *   onSkip()
 */
const TYPE_LABEL = { bims: 'BIMS', phq: 'PHQ-9', gg: 'Section GG', pain: 'Pain (Section J)' };

export function SchedulerModal({ coverage, matches, isoToPccDate, onConfirm, onSkip }) {
  const needed = (coverage?.interviews || []).filter((i) => i.status === 'needed');
  const covered = (coverage?.interviews || []).filter((i) => i.status === 'covered');

  // default: every needed item with a library match is checked
  const [checked, setChecked] = useState(
    Object.fromEntries(needed.map((i) => [i.type, !!matches[i.type]]))
  );
  const [progress, setProgress] = useState(null); // {index,total,label,phase}

  const toggle = (t) => setChecked((c) => ({ ...c, [t]: !c[t] }));

  const confirm = () => {
    const picks = needed
      .filter((i) => checked[i.type] && matches[i.type])
      .map((i) => ({
        type: i.type,
        stdAssessmentId: matches[i.type].id,
        assessDatePcc: isoToPccDate(i.recommendedScheduleDate) || isoToPccDate(i.window?.end),
        label: TYPE_LABEL[i.type],
      }));
    onConfirm(picks, setProgress);
  };

  return (
    <div className="super-mds-sched__backdrop">
      <div className="super-mds-sched__card">
        <h2>Schedule MDS interviews</h2>
        <p className="super-mds-sched__sub">
          This {coverage?.description || 'assessment'} needs {needed.length} interview{needed.length === 1 ? '' : 's'}.
          {covered.length > 0 && ` ${covered.length} already covered ✓.`}
        </p>

        <ul className="super-mds-sched__list">
          {needed.map((i) => (
            <li key={i.type}>
              <label>
                <input type="checkbox" checked={!!checked[i.type]} disabled={!matches[i.type] || !!progress}
                       onChange={() => toggle(i.type)} />
                <strong>{TYPE_LABEL[i.type]}</strong>
                {matches[i.type]
                  ? <span> — schedule by {isoToPccDate(i.recommendedScheduleDate)} <em>({matches[i.type].label})</em></span>
                  : <span className="super-mds-sched__warn"> — no matching assessment in your library; schedule manually</span>}
                {i.outOfWindowUda &&
                  <div className="super-mds-sched__note">You have one from {isoToPccDate(i.outOfWindowUda.date)}, but this ARD's window pushed it out of range.</div>}
              </label>
            </li>
          ))}
          {covered.map((i) => (
            <li key={i.type} className="super-mds-sched__covered">✓ {TYPE_LABEL[i.type]} already covered</li>
          ))}
        </ul>

        {progress && (
          <div className="super-mds-sched__progress">
            {progress.phase === 'creating' && `Scheduling ${progress.label}… (${progress.index + 1}/${progress.total})`}
            {progress.phase === 'error' && `⚠ ${progress.label}: ${progress.error}`}
          </div>
        )}

        <div className="super-mds-sched__actions">
          <button className="pccButton" disabled={!!progress} onClick={onSkip}>Skip &amp; Save</button>
          <button className="pccButton super-mds-sched__primary" disabled={!!progress} onClick={confirm}>Create &amp; Save</button>
        </div>
      </div>
    </div>
  );
}
```

Add minimal CSS to a new `content/css/mds-scheduler.css` (backdrop, card max-width ~640px, list spacing, primary button tint). Load it the way other module CSS is loaded (check how `pdpm-analyzer.css` is injected/imported and follow suit).

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): confirm/create modal (Preact)"
```

---

## Task 10: Orchestrator — detect popup, wrap submitSave, mount modal

**Files:**
- Create: `content/modules/mds-interview-scheduler/inject-scheduler.js`
- Modify: `content/content.js` (add imports after line 90)

This is the integration glue. Behavior:

1. **Detect** `newmds.xhtml` in the URL. Bail otherwise.
2. **On load (silent):** read `patientId`; kick off `fetchAssessmentLibrary(patientId)` → `matchLibraryToInterviews(...)`; cache the matches. Swallow errors (log only).
3. **Wrap `submitSave`:** capture `window.submitSave`; replace with an async guard:
   - If a one-shot `_handled` flag is set → call original immediately (re-entrancy / our own resume).
   - Read form state; `buildCoverageQuery`; if null → original.
   - `await fetchInterviewCoverage`. On error → log + original (never block save).
   - Needed-count 0 → original (silent passthrough).
   - Else → mount modal. **Do not call original yet.**
     - `onSkip` → teardown, set `_handled`, call original `submitSave()`.
     - `onConfirm(picks, setProgress)` → `await scheduleInterviews({ patientId, picks, onProgress: setProgress })`; teardown; set `_handled`; call original `submitSave()`. (Created UDAs make the confirm-roundtrip resubmit read as covered → silent passthrough next time, per design.)
4. **Idempotent install:** guard against double-wrapping (`window.submitSave.__superWrapped`). Re-run install after the confirm-roundtrip reload via the same load entrypoint.

**Step 1: Implement**

```js
import { render, h } from 'preact';
import { SchedulerModal } from './SchedulerModal.jsx';
import { buildCoverageQuery, isoToPccDate } from './lib/coverage-query.js';
import { matchLibraryToInterviews } from './lib/library-match.js';

const OVERLAY_ID = 'super-mds-sched-overlay';

function _isNewMdsPopup() {
  return window.location.href.includes('/clinical/mds3_popup/newmds.xhtml');
}

let _matchesPromise = null;     // started on load, awaited at Save
function _prefetchLibrary() {
  const { patientId } = window.MdsSchedulerForm.readFormState();
  if (!patientId) return;
  _matchesPromise = window.MdsSchedulerLibrary
    .fetchAssessmentLibrary(patientId)
    .then((opts) => matchLibraryToInterviews(opts))
    .catch((e) => { console.warn('[mds-sched] library prefetch failed', e); return null; });
}

function _teardown(overlay, restore) {
  render(null, overlay);
  overlay.remove();
  restore?.();
}

async function _onSave(originalSubmitSave) {
  const form = window.MdsSchedulerForm.readFormState();
  const query = buildCoverageQuery(form);
  if (!query) return originalSubmitSave();

  let coverage;
  try {
    coverage = await window.MdsSchedulerAPI.fetchInterviewCoverage(query);
  } catch (e) {
    console.warn('[mds-sched] coverage fetch failed; saving without scheduling', e);
    return originalSubmitSave();
  }

  const needed = (coverage?.interviews || []).filter((i) => i.status === 'needed');
  if (needed.length === 0) return originalSubmitSave();   // silent passthrough

  const matches = (await _matchesPromise) || { bims: null, phq: null, gg: null, pain: null };

  // Mount modal
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);

  const proceed = () => { _markHandled(); originalSubmitSave(); };

  const onSkip = () => { _teardown(overlay); proceed(); };

  const onConfirm = async (picks, setProgress) => {
    if (picks.length === 0) { _teardown(overlay); proceed(); return; }
    const res = await window.MdsSchedulerCreate.scheduleInterviews({
      patientId: form.patientId, picks, onProgress: setProgress,
    });
    // Even on partial error, proceed to save the MDS (UDAs are independent).
    if (!res.ok) console.warn('[mds-sched] some UDAs failed', res.errors);
    _teardown(overlay);
    proceed();
  };

  render(h(SchedulerModal, { coverage, matches, isoToPccDate, onConfirm, onSkip }), overlay);
}

let _handled = false;
function _markHandled() { _handled = true; }

function _installSaveHook() {
  if (typeof window.submitSave !== 'function') return false;
  if (window.submitSave.__superWrapped) return true;
  const original = window.submitSave;
  const wrapped = function () {
    if (_handled) return original.apply(this, arguments);   // our resume / re-entrancy
    // Intercept: run our async flow, suppress the native save until we decide.
    _onSave(() => original.apply(this, arguments));
    return undefined;
  };
  wrapped.__superWrapped = true;
  window.submitSave = wrapped;
  return true;
}

function _init() {
  if (!_isNewMdsPopup()) return;
  _prefetchLibrary();
  // submitSave is defined in the popup's own script; poll briefly until present.
  if (_installSaveHook()) return;
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (_installSaveHook() || tries >= 20) clearInterval(id);
  }, 150);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
```

> **Note on wrapping `window.submitSave`:** the popup's inline scripts call the bare identifier `submitSave()` and the button's `onclick` calls `submitSave()`. Inside the popup document these resolve to `window.submitSave`, so reassigning `window.submitSave` intercepts both the button path and the auto-confirm-resubmit path. Verify this during Task 11 — if the popup declared `function submitSave(){}` in a way that shadows the global in those call sites, fall back to capturing the `#idSaveBtn` click in the capture phase plus a separate hook for the auto-resubmit inline script.

**Step 2: Wire into content.js** — after line 90 add:

```js
import './modules/mds-interview-scheduler/coverage-api.js';
import './modules/mds-interview-scheduler/pcc-library.js';
import './modules/mds-interview-scheduler/pcc-schedule-uda.js';
import './modules/mds-interview-scheduler/form-read.js';
import './modules/mds-interview-scheduler/inject-scheduler.js';
```

(`coverage-query.js`, `library-match.js`, `SchedulerModal.jsx` are imported by their consumers, not directly by content.js.)

**Step 3: Build**

Run: `npm run build`
Expected: build succeeds, no errors.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(mds-scheduler): orchestrator — wrap submitSave + mount confirm modal"
```

---

## Task 11: Manual end-to-end verification

> REQUIRED SUB-SKILL: superpowers:verification-before-completion — do not claim done until these pass.

Load the worktree build (`super-ext kathmandu-v2` → reload extension → open a resident).

1. **Library prefetch:** open a New MDS popup; in its DevTools console run
   `await window.MdsSchedulerLibrary.fetchAssessmentLibrary('<clientid>')` → array of options.
   `window.MdsSchedulerForm.readFormState()` → correct patientId/facility/org/ARD/codes.
2. **submitSave interception:** confirm `window.submitSave.__superWrapped === true`.
3. **Needed flow:** pick an ARD/type with known-missing interviews → click Save → modal appears listing needed items with "schedule by" dates + library names; covered items show ✓.
4. **Create & Save (test resident):** confirm → progress shows → UDAs appear in the resident's assessment list at the recommended dates → the MDS saves normally.
5. **Skip & Save:** modal → Skip → no UDAs created, MDS saves.
6. **Silent passthrough:** an ARD/type where everything's already covered → Save proceeds with no modal.
7. **No-match facility:** an interview type with no library keyword match → row shows "schedule manually," checkbox disabled, others still work.
8. **Coverage failure is non-blocking:** temporarily break the endpoint (bad token) → Save still completes (MDS persists), only a console warning.
9. **Change-MDS (`operation=X`):** repeat on the change-ARD popup; the `outOfWindowUda` note renders when an existing UDA falls out of the new window.
10. `npm test` → all unit tests pass. `npm run build` → clean.

Record results (pass/fail + notes) before declaring complete.

---

## Out of scope (future)
- Batch/list view over the MDS In-Progress screen (icons per row). Same engine fanned out — separate route + frontend.
- Tuning facility-specific library aliases beyond the initial keyword set.
