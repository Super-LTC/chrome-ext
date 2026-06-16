# MDS In-Progress List — Interview-Coverage Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On PCC's **Clinical → MDS List → In Progress** screen, overlay a per-row indicator showing which interview UDAs (BIMS / PHQ-9 / GG / Pain) are ✓ done-in-window or ⚠ needs-scheduling, with per-interview detail on click.

**Architecture:** A new **vanilla** content-script module (`content/mds-list-coverage.js`) that (1) detects the In-Progress list, (2) scrapes the `externalAssessmentId` (`ESOLassessid`) from each visible row's action links, (3) POSTs them in one batch to `POST /api/extension/mds/interview-coverage/batch` (backend PR #679, contract final), (4) injects a chip cell per row keyed back by `results[].key`, and (5) re-runs when PCC re-renders the table (unit/floor/status filters, screen change). Pure logic (row scraping + coverage→chip mapping) is extracted into small modules with vitest tests; DOM injection mirrors the existing `content/mds-overlay.js` badge pattern. This is vanilla because the render target is PCC's own server-rendered `<table>` rows — the same idiom `mds-overlay.js` already uses — and a Preact island per `<tr>` would be awkward.

**Tech Stack:** Vanilla JS content script, Vite bundle (`content/content.js` entry), `chrome.runtime.sendMessage({type:'API_REQUEST'})` → background worker for the authed POST, CSS via `content/css-bootstrap.js` inline bundle, vitest for pure-logic tests.

---

## Backend contract (final — PR #679, Option 1 confirmed, tuple dropped)

`POST /api/extension/mds/interview-coverage/batch` — Bearer auth, module `mdsSolver`.

```jsonc
// REQUEST
{ "orgSlug": "champ", "facilityName": "BURLINGTON ...",
  "assessments": [ { "externalAssessmentId": "1560725" }, ... ] }

// RESPONSE
{ "success": true, "results": [
  { "key": "1560725", "status": "ok",          // 'ok' | 'not_synced' | 'error'
    "coverage": {
      "ardDate": "2026-06-15", "description": "Quarterly - None PPS /",
      "summary": { "required": 4, "covered": 2, "needed": 2 },
      "interviews": [
        { "type": "bims", "status": "covered",
          "window": { "start": "2026-06-08", "end": "2026-06-15" },
          "coveringUda": { "id": "...", "description": "GSHC BIMS Eval - V1", "date": "2026-06-10", "lockedDate": "2026-06-10" } },
        { "type": "gg", "status": "needed",
          "window": { "start": "2026-06-13", "end": "2026-06-15" },
          "recommendedScheduleDate": "2026-06-15",
          "outOfWindowUda": { "id": "...", "description": "Nursing GG Eval", "date": "2026-03-12", "lockedDate": "2026-03-14" } }
      ] } },
  { "key": "def456", "status": "not_synced" }   // neutral dash, never red ✗
] }
```

Rendering rules (from handoff): only interviews present in the array get a slot; `covered`→✓, `needed`→⚠ "by {recommendedScheduleDate}"; `outOfWindowUda`→tooltip "you have one from {date}, but this ARD's window pushed it out of range"; `not_synced`→neutral dash; Pain is shown here intentionally.

---

## Design decisions (resolved — defaults chosen so we can build)

- **Placement (Q2):** Append a **new trailing column** (`<th>Interviews Due</th>` + a `<td>` per row). Non-destructive to PCC's existing columns.
- **Trigger (Q3):** **Auto-run on detect.** ~24–50 rows is one round trip. Guard with an id-set cache so filter re-renders don't refetch identical sets.
- **Detail (Q4):** **Lightweight vanilla popover** anchored to the row's chip cell (mirrors `mds-overlay.js` `showPopover`), not the heavy Preact modal, for v1.

---

## ⚠️ Pre-flight Task 0: Confirm frame injection (do this FIRST — it can change the approach)

The manifest injects content scripts **top-frame only** (no `all_frames`; `manifest.json` `content_scripts[0].matches: ["*://*.pointclickcare.com/*"]`). `content/content.js` notes scripts "re-inject on every PCC top-frame navigation," and the MDS section overlay works — strong signal the clinical area is top-frame. But `mdslist.jsp` must be confirmed.

**Step 1:** Log into PCC, open **Clinical → MDS List → In Progress**. In DevTools console run:
```js
// In the page (NOT an iframe context): is our root present at top level?
document.getElementById('super-ltc-root') ? 'TOP-FRAME ✓' : 'check frames';
// Is the In-Progress table in this document?
!!document.querySelector('form[name="client"] table');
```
Also check the **Sources/Frames** panel for whether `mdslist.jsp` is a nested frame.

**Step 2 — branch on result:**
- **Top-frame (expected):** proceed with the plan as written. `getFacilityInfo()` (`#pccFacLink`) and `getOrg()` are available in the same document.
- **Iframed:** add `"all_frames": true` to `manifest.json` `content_scripts[0]` AND verify `#pccFacLink` / org cookie are reachable from the frame; if facility lives in the parent frame, read it from the message-based `GET_FACILITY` path or `window.top` fallback. **Stop and flag to the team before continuing** — this widens injection to every PCC iframe and needs a deliberate review.

**Step 3:** Record the result at the top of the module file as a comment. Do not start Task 1 until this is settled.

---

## Task 1: Row-scraping module (pure string parsers + thin DOM adapter)

**Files:**
- Create: `content/mds-list-coverage/scrape.js`
- Test: `content/mds-list-coverage/scrape.test.js`

> **No DOM test env here.** vitest runs in the default **node** environment — jsdom/happy-dom are NOT installed and there are no DOM-based tests in the repo. Do **not** add a DOM test environment. Instead, put the real logic in **pure string parsers** (regex over the row's HTML) that are unit-tested in node, and keep a thin, untested DOM adapter (`scrapeRows`) that reads `rowEl.outerHTML` and hands it to the pure parsers while returning the live `rowEl` for injection.

Per-row, `ESOLassessid` appears in the **edit** link querystring, the **strike-out** JS args, and the **copy** JS args — NOT the **print** link (it ships empty: `?ESOLassessid=`). Parse from the edit link first, fall back to strike-out/copy args.

**Step 1: Write the failing test** (pure, string-based — fixture is a real row from the In-Progress HTML):

```js
import { describe, it, expect } from 'vitest';
import { assessmentIdFromHtml, mrnFromHtml, patientNameFromHtml } from './scrape.js';

const ROW_HTML = `<tr bgcolor="#efefef"><td valign="top">&nbsp;
  <a class="listbutton" href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=1560725&retURL=/care/chart/mds/mdslist.jsp">edit</a>&nbsp;&nbsp;
  <a class="listbutton" href="javascript:launchStrikeOut('?ESOLassessid=1560725','1560725','841062');">strike-out</a>&nbsp;&nbsp;
  <a class="listbutton" href="javascript:launchPrintOp('?ESOLassessid=','');">print</a>&nbsp;&nbsp;
  <a href="javascript:launchCopyMDSAssessment(1560725, 841062, 'Y')">copy</a></td>
  <td valign="top" align="left">7/4/2026</td>
  <td valign="top"><a href="/admin/client/cp_mds.jsp?ESOLclientid=841062&ESOLtabtype=C">Sanders, Gordon (000953026)</a></td>
  <td valign="top">NQ</td><td valign="top"><span>A, B, C</span></td></tr>`;

describe('assessmentIdFromHtml', () => {
  it('reads ESOLassessid from the edit link', () => {
    expect(assessmentIdFromHtml(ROW_HTML)).toBe('1560725');
  });
  it('falls back to strike-out/copy args, never the empty print id', () => {
    const noEdit = ROW_HTML.replace(/<a class="listbutton" href="\/clinical[^>]*>edit<\/a>/, '');
    expect(assessmentIdFromHtml(noEdit)).toBe('1560725');
  });
  it('returns null when no assessment id is present', () => {
    expect(assessmentIdFromHtml('<tr><td>header</td></tr>')).toBeNull();
  });
});

describe('mrnFromHtml / patientNameFromHtml', () => {
  it('extracts the parenthetical MRN', () => {
    expect(mrnFromHtml(ROW_HTML)).toBe('000953026');
  });
  it('extracts the patient name without the MRN', () => {
    expect(patientNameFromHtml(ROW_HTML)).toBe('Sanders, Gordon');
  });
});
```

**Step 2: Run test to verify it fails** — `npx vitest run content/mds-list-coverage/scrape.test.js` → FAIL (module not found).

**Step 3: Write minimal implementation:**

```js
// content/mds-list-coverage/scrape.js
// Pure string parsers (unit-tested in node) + a thin DOM adapter.

/** ESOLassessid from a row's HTML: edit link → strike-out args → copy args.
 *  Never the print link — PCC renders it as `?ESOLassessid=` (empty). */
export function assessmentIdFromHtml(html) {
  if (!html) return null;
  // 1. edit link querystring (only the populated one — print's is empty)
  const edit = html.match(/sectionlisting\.xhtml\?ESOLassessid=(\d+)/);
  if (edit) return edit[1];
  // 2. strike-out: launchStrikeOut('?ESOLassessid=ID','ID','CLIENT')
  const strike = html.match(/launchStrikeOut\('[^']*',\s*'?(\d+)'?/);
  if (strike) return strike[1];
  // 3. copy: launchCopyMDSAssessment(ID, CLIENT, 'Y')
  const copy = html.match(/launchCopyMDSAssessment\(\s*(\d+)/);
  if (copy) return copy[1];
  return null;
}

/** MRN is the parenthetical in the Name cell, e.g. "Sanders, Gordon (000953026)". */
export function mrnFromHtml(html) {
  const name = nameAnchorText(html);
  const m = name?.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

/** Patient name without the trailing "(MRN)". */
export function patientNameFromHtml(html) {
  const name = nameAnchorText(html);
  return name ? name.replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
}

/** Text of the cp_mds.jsp name link, tags stripped. */
function nameAnchorText(html) {
  if (!html) return null;
  const m = html.match(/<a[^>]*cp_mds\.jsp[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** DOM adapter (not unit-tested — pure logic above is). Returns one entry per
 *  data row, carrying the live rowEl for chip injection. */
export function scrapeRows(container) {
  if (!container) return [];
  return [...container.querySelectorAll('tr')]
    .map((rowEl) => {
      const html = rowEl.outerHTML;
      const externalAssessmentId = assessmentIdFromHtml(html);
      if (!externalAssessmentId) return null;
      return { externalAssessmentId, rowEl, mrn: mrnFromHtml(html), patientName: patientNameFromHtml(html) };
    })
    .filter(Boolean);
}
```

**Step 4: Run test to verify it passes** — `npx vitest run content/mds-list-coverage/scrape.test.js` → PASS.

**Step 5: Commit** — `git add content/mds-list-coverage/scrape.js content/mds-list-coverage/scrape.test.js && git commit -m "feat(mds-list): pure row scraper for In-Progress interview coverage"`

---

## Task 2: Pure coverage→chip render-model

**Files:**
- Create: `content/mds-list-coverage/render-model.js`
- Test: `content/mds-list-coverage/render-model.test.js`

Maps one `result` (`ok` / `not_synced` / `error`) into an array of chip view-models the renderer can dumbly draw. Defensive against unknown interview `type` strings.

**Step 1: Write the failing test:**

```js
import { describe, it, expect } from 'vitest';
import { toChips, INTERVIEW_LABELS } from './render-model.js';

describe('toChips', () => {
  it('not_synced → single neutral chip, never an x', () => {
    const chips = toChips({ key: 'a', status: 'not_synced' });
    expect(chips).toEqual([{ kind: 'neutral', label: '–', title: expect.any(String) }]);
  });

  it('error → single error chip', () => {
    expect(toChips({ key: 'a', status: 'error' })[0].kind).toBe('error');
  });

  it('ok → one chip per required interview, in array order', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'bims', status: 'covered' },
      { type: 'gg', status: 'needed', recommendedScheduleDate: '2026-06-15' },
    ] } });
    expect(chips.map(c => c.label)).toEqual(['BIMS', 'GG']);
    expect(chips[0].kind).toBe('covered');     // ✓
    expect(chips[1].kind).toBe('needed');      // ⚠
    expect(chips[1].sub).toBe('by 6/15');
  });

  it('needed with outOfWindowUda adds the out-of-window tooltip', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'pain', status: 'needed', recommendedScheduleDate: '2026-06-15',
        outOfWindowUda: { date: '2026-03-12' } },
    ] } });
    expect(chips[0].title).toMatch(/2026-03-12|3\/12/);
    expect(chips[0].title).toMatch(/out of range/i);
  });

  it('unknown interview type falls back to upper-cased label', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'mood', status: 'covered' },
    ] } });
    expect(chips[0].label).toBe('MOOD');
  });

  it('labels cover the four known interviews', () => {
    expect(INTERVIEW_LABELS).toMatchObject({ bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' });
  });
});
```

**Step 2: Run to verify it fails** — `npx vitest run content/mds-list-coverage/render-model.test.js` → FAIL.

**Step 3: Write minimal implementation:**

```js
// content/mds-list-coverage/render-model.js
// Pure mapping: one batch `result` → chip view-models. No DOM, no network.

export const INTERVIEW_LABELS = { bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' };

// MM/D format to match the PCC list date style; tolerant of YYYY-MM-DD input.
function shortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[2])}/${Number(m[3])}`;
  return String(iso);
}

function labelFor(type) {
  return INTERVIEW_LABELS[type] || String(type || '').toUpperCase();
}

export function toChips(result) {
  if (!result || result.status === 'error') {
    return [{ kind: 'error', label: '!', title: 'Coverage check failed for this row.' }];
  }
  if (result.status === 'not_synced') {
    return [{ kind: 'neutral', label: '–', title: 'Not synced to Super yet — no coverage data.' }];
  }
  const interviews = result.coverage?.interviews || [];
  return interviews.map((iv) => {
    const label = labelFor(iv.type);
    if (iv.status === 'covered') {
      const u = iv.coveringUda;
      return { kind: 'covered', label,
        title: u ? `${label}: done — ${u.description} (${shortDate(u.date)})` : `${label}: done in window` };
    }
    // needed
    const by = iv.recommendedScheduleDate ? `by ${shortDate(iv.recommendedScheduleDate)}` : 'needs scheduling';
    let title = `${label}: needed ${by}`;
    if (iv.outOfWindowUda?.date) {
      title += ` — you have one from ${shortDate(iv.outOfWindowUda.date)}, but this ARD's window pushed it out of range`;
    }
    return { kind: 'needed', label, sub: by, title };
  });
}
```

**Step 4: Run to verify it passes** — PASS.

**Step 5: Commit** — `git commit -m "feat(mds-list): pure coverage→chip render model"`

---

## Task 3: Styles

**Files:**
- Create: `content/css/mds-list-coverage.css`
- Modify: `content/css-bootstrap.js` (add import + bundle entry)

**Step 1:** Create `content/css/mds-list-coverage.css`:

```css
/* MDS In-Progress list interview-coverage chips */
.super-ilc-cell { white-space: nowrap; }
.super-ilc-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font: 600 11px/1 -apple-system, system-ui, sans-serif;
  padding: 2px 6px; margin: 1px 2px; border-radius: 10px; cursor: default;
  border: 1px solid transparent;
}
.super-ilc-chip--covered { background: #dcfce7; color: #15803d; border-color: #86efac; }
.super-ilc-chip--needed  { background: #fef3c7; color: #b45309; border-color: #fcd34d; cursor: pointer; }
.super-ilc-chip--neutral { background: #f1f5f9; color: #94a3b8; }
.super-ilc-chip--error   { background: #fee2e2; color: #b91c1c; }
.super-ilc-chip__sub { font-weight: 500; opacity: .85; }
.super-ilc-loading { color: #94a3b8; font: 500 11px/1 system-ui; }

/* row detail popover */
.super-ilc-pop {
  position: fixed; z-index: 2147483600; max-width: 360px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15,23,42,.18); padding: 12px 14px;
  font: 13px/1.5 -apple-system, system-ui, sans-serif; color: #1e293b;
}
.super-ilc-pop__title { font-weight: 700; margin-bottom: 6px; }
.super-ilc-pop__iv { padding: 6px 0; border-top: 1px solid #f1f5f9; }
.super-ilc-pop__iv:first-of-type { border-top: 0; }
```

**Step 2:** In `content/css-bootstrap.js`, add an import alongside the others (after `roundingReports`):
```js
import mdsListCoverage from './css/mds-list-coverage.css?inline';
```
and add `mdsListCoverage,` to the `CSS_BUNDLE` array.

**Step 3: Commit** — `git commit -m "feat(mds-list): coverage chip + popover styles"`

---

## Task 4: API client (batch POST through background worker)

**Files:**
- Create: `content/mds-list-coverage/api.js`

The background `API_REQUEST` handler already forwards `message.options` (method/body) to `apiRequest`, which injects `Authorization: Bearer` + `Content-Type: application/json` (`background/background.js:24-37, 384-393`). So a POST is:

```js
// content/mds-list-coverage/api.js
/** POST the visible rows' ids; returns { success, results } or throws. */
export async function fetchBatchCoverage({ orgSlug, facilityName, assessments }) {
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: '/api/extension/mds/interview-coverage/batch',
    options: {
      method: 'POST',
      body: JSON.stringify({ orgSlug, facilityName, assessments }),
    },
  });
  if (!response?.success) {
    const err = new Error(response?.error || 'Batch coverage request failed');
    err.status = response?.status;
    throw err;
  }
  return response.data; // { success: true, results: [...] }
}
```

No test (thin transport wrapper; logic lives in Tasks 1–2). **Commit** — `git commit -m "feat(mds-list): batch interview-coverage api client"`

---

## Task 5: Detection + orchestration module (the vanilla controller)

**Files:**
- Create: `content/mds-list-coverage.js`
- Modify: `content/content.js` (add import after the `mds-overlay.js` import, ~line 49)

This is the controller. It mirrors `mds-overlay.js`'s init/observer idiom. Reuses globals already on `window`: `getOrg()` and `getFacilityInfo()` (defined in `mds-overlay.js`; confirm both are reachable — `getFacilityInfo` is module-local, so expose it on `window` in `mds-overlay.js` if not already, OR re-read `#pccFacLink` here directly to avoid coupling).

**Step 1:** Implement detection + injection:

```js
// content/mds-list-coverage.js
// Overlays interview-coverage chips on the MDS List → In Progress screen.
// Frame note (fill in from Task 0): <TOP-FRAME confirmed | all_frames added>.
import { scrapeRows } from './mds-list-coverage/scrape.js';
import { toChips } from './mds-list-coverage/render-model.js';
import { fetchBatchCoverage } from './mds-list-coverage/api.js';
import { showRowDetail } from './mds-list-coverage/detail.js';

const ILC = { lastIdSet: '', resultsByKey: {}, busy: false };
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));

/** True only on the MDS list with the "In Progress" tab active. */
function isInProgressList() {
  const onMdsList = /\/care\/chart\/mds\/mds(list|portal)\.jsp/i.test(location.pathname + location.search) ||
                    document.querySelector('form[name="client"] ul.pccTabs');
  if (!onMdsList) return false;
  const active = document.querySelector('ul.pccTabs li.pccActiveTab a');
  return !!active && /in\s*progress/i.test(active.textContent || '');
}

/** The PCC data table that holds the rows (the one with the Name/Type columns). */
function findListTable() {
  // The rows live in the inner table under #msg1; it's the table whose rows
  // contain cp_mds.jsp name links.
  const candidate = [...document.querySelectorAll('table')]
    .find((t) => t.querySelector('a[href*="cp_mds.jsp"]') && t.querySelector('a[href*="sectionlisting.xhtml"], a[href*="launchCopyMDSAssessment"]'));
  return candidate || null;
}

function getContext() {
  const orgSlug = (typeof getOrg === 'function' ? getOrg()?.org : null) || '';
  // Prefer the shared helper; fall back to the facility link directly.
  let facilityName = '';
  if (typeof window.getFacilityInfo === 'function') facilityName = window.getFacilityInfo()?.facility || '';
  if (!facilityName) {
    const facLink = document.getElementById('pccFacLink');
    facilityName = facLink?.title || facLink?.textContent?.trim() || '';
  }
  return { orgSlug, facilityName };
}

function ensureHeaderColumn(table) {
  const headRow = table.querySelector('tr');
  if (!headRow || headRow.querySelector('.super-ilc-th')) return;
  const th = document.createElement('th');
  th.className = 'detailColHeader super-ilc-th';
  th.setAttribute('nowrap', 'nowrap');
  th.textContent = 'Interviews Due';
  headRow.appendChild(th);
}

function ensureRowCell(rowEl) {
  let cell = rowEl.querySelector('.super-ilc-cell');
  if (!cell) {
    cell = document.createElement('td');
    cell.className = 'super-ilc-cell';
    cell.setAttribute('valign', 'top');
    rowEl.appendChild(cell);
  }
  return cell;
}

function renderRow(rowEl, result, rowMeta) {
  const cell = ensureRowCell(rowEl);
  if (!result) { cell.innerHTML = '<span class="super-ilc-loading">…</span>'; return; }
  const chips = toChips(result);
  cell.innerHTML = chips.map((c) =>
    `<span class="super-ilc-chip super-ilc-chip--${c.kind}" title="${esc(c.title)}">` +
    `${c.kind === 'covered' ? '✓ ' : c.kind === 'needed' ? '⚠ ' : ''}${esc(c.label)}` +
    `${c.sub ? ` <span class="super-ilc-chip__sub">${esc(c.sub)}</span>` : ''}</span>`
  ).join('');
  // Clicking a row with real coverage opens the detail popover.
  if (result.status === 'ok') {
    cell.style.cursor = 'pointer';
    cell.onclick = (e) => {
      e.stopPropagation();
      window.SuperAnalytics?.track?.('mds_list_coverage_row_clicked', {
        required: Number(result.coverage?.summary?.required || 0),
        needed: Number(result.coverage?.summary?.needed || 0),
      });
      showRowDetail(cell, result, rowMeta);
    };
  }
}

async function runCoverage() {
  if (ILC.busy) return;
  const table = findListTable();
  if (!table) return;
  const rows = scrapeRows(table.querySelector('tbody') || table);
  if (!rows.length) return;

  const idSet = rows.map((r) => r.externalAssessmentId).sort().join(',');
  if (idSet === ILC.lastIdSet && Object.keys(ILC.resultsByKey).length) {
    // Same rows already covered (e.g. benign re-render) — just repaint.
    ensureHeaderColumn(table);
    rows.forEach((r) => renderRow(r.rowEl, ILC.resultsByKey[r.externalAssessmentId] || null, r));
    return;
  }

  const { orgSlug, facilityName } = getContext();
  if (!orgSlug || !facilityName) { console.warn('[ILC] missing org/facility'); return; }

  ILC.busy = true;
  ILC.lastIdSet = idSet;
  ensureHeaderColumn(table);
  rows.forEach((r) => renderRow(r.rowEl, null, r)); // loading state

  try {
    const data = await fetchBatchCoverage({
      orgSlug, facilityName,
      assessments: rows.map((r) => ({ externalAssessmentId: r.externalAssessmentId })),
    });
    ILC.resultsByKey = {};
    (data.results || []).forEach((res) => { ILC.resultsByKey[String(res.key)] = res; });
    rows.forEach((r) => renderRow(r.rowEl, ILC.resultsByKey[r.externalAssessmentId] || { status: 'not_synced' }, r));
    window.SuperAnalytics?.track?.('mds_list_coverage_shown', {
      rows: rows.length,
      ok: (data.results || []).filter((x) => x.status === 'ok').length,
      not_synced: (data.results || []).filter((x) => x.status === 'not_synced').length,
    });
  } catch (err) {
    console.error('[ILC] batch coverage failed:', err);
    ILC.lastIdSet = ''; // allow retry on next mutation
    rows.forEach((r) => renderRow(r.rowEl, { status: 'error' }, r));
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'mds_list_coverage',
      error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
      error_type: 'api_error',
    });
  } finally {
    ILC.busy = false;
  }
}

// --- init + re-render on table change (filters call submitRefresh/changeScreen) ---
async function initIlc() {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (!authState?.authenticated) return;
  if (!isInProgressList()) return;
  runCoverage();
}
window.SuperListCoverage = { runCoverage, initIlc };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initIlc, 400));
} else {
  setTimeout(initIlc, 400);
}

// PCC re-renders the table in place on unit/floor/status filter + screen change.
// Watch #msg1 (the rows container) and the tab strip; debounce + reset id-set.
let ilcDebounce = null;
const ilcObserver = new MutationObserver(() => {
  clearTimeout(ilcDebounce);
  ilcDebounce = setTimeout(() => { if (isInProgressList()) runCoverage(); }, 350);
});
function startIlcObserver() {
  const target = document.getElementById('msg1') || document.querySelector('form[name="client"]') || document.body;
  ilcObserver.observe(target, { childList: true, subtree: true });
}
startIlcObserver();

// Top-frame nav re-injects the script, but guard SPA-style URL flips too.
let ilcLastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== ilcLastUrl) {
    ilcLastUrl = location.href;
    ILC.lastIdSet = ''; ILC.resultsByKey = {};
    setTimeout(initIlc, 400);
  }
}).observe(document.body, { childList: true, subtree: true });
```

**Step 2:** In `content/content.js`, after `import './mds-overlay.js';` (line ~49) add:
```js
// 4.55. MDS In-Progress list interview-coverage overlay
import './mds-list-coverage.js';
```

**Step 3:** If `getFacilityInfo` is not on `window`, expose it in `content/mds-overlay.js` (it's defined at `mds-overlay.js:339`): add `window.getFacilityInfo = getFacilityInfo;` near the other `window.*` exports (~line 315). (The controller already falls back to `#pccFacLink`, so this is belt-and-suspenders.)

**Step 4: Commit** — `git commit -m "feat(mds-list): In-Progress interview-coverage controller + injection"`

---

## Task 6: Row detail popover

**Files:**
- Create: `content/mds-list-coverage/detail.js`

Self-contained vanilla popover anchored to the chip cell. Shows ARD/description header + one block per interview (label, status, window, covering/out-of-window UDA name + dates). Mirrors fields from the PDPM-analyzer item detail (matching assessment name, completed/lock dates, window, in-range) without pulling in Preact.

**Step 1:** Implement:

```js
// content/mds-list-coverage/detail.js
import { INTERVIEW_LABELS } from './render-model.js';
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
let popEl = null;

function close() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('click', onDocClick, true); } }
function onDocClick(e) { if (popEl && !popEl.contains(e.target)) close(); }

function ivBlock(iv) {
  const label = INTERVIEW_LABELS[iv.type] || String(iv.type || '').toUpperCase();
  const win = iv.window ? `${esc(iv.window.start)} → ${esc(iv.window.end)}` : '';
  if (iv.status === 'covered') {
    const u = iv.coveringUda || {};
    return `<div class="super-ilc-pop__iv"><b>${esc(label)}</b> — ✓ done<br>
      ${u.description ? `${esc(u.description)} · ` : ''}completed ${esc(u.date || '?')}${u.lockedDate ? ` · locked ${esc(u.lockedDate)}` : ''}
      ${win ? `<br><span style="color:#64748b">window ${win}</span>` : ''}</div>`;
  }
  const by = iv.recommendedScheduleDate ? ` by ${esc(iv.recommendedScheduleDate)}` : '';
  const oow = iv.outOfWindowUda
    ? `<br><span style="color:#b45309">Existing ${esc(iv.outOfWindowUda.description || 'UDA')} from ${esc(iv.outOfWindowUda.date)} is out of this ARD's window.</span>` : '';
  return `<div class="super-ilc-pop__iv"><b>${esc(label)}</b> — ⚠ schedule${by}
    ${win ? `<br><span style="color:#64748b">window ${win}</span>` : ''}${oow}</div>`;
}

export function showRowDetail(anchorEl, result, rowMeta) {
  close();
  const cov = result.coverage || {};
  popEl = document.createElement('div');
  popEl.className = 'super-ilc-pop';
  popEl.innerHTML =
    `<div class="super-ilc-pop__title">${esc(rowMeta?.patientName || 'Assessment')} — ${esc(cov.description || '')}</div>
     <div style="color:#64748b;font-size:12px;margin-bottom:6px">ARD ${esc(cov.ardDate || '?')} ·
       ${esc(cov.summary?.covered ?? 0)}/${esc(cov.summary?.required ?? 0)} done</div>
     ${(cov.interviews || []).map(ivBlock).join('')}`;
  document.body.appendChild(popEl);
  const r = anchorEl.getBoundingClientRect();
  popEl.style.top = `${Math.min(r.bottom + 6, window.innerHeight - popEl.offsetHeight - 12)}px`;
  popEl.style.left = `${Math.min(r.left, window.innerWidth - popEl.offsetWidth - 12)}px`;
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
}
```

**Step 2: Commit** — `git commit -m "feat(mds-list): row interview-coverage detail popover"`

---

## Task 7: Analytics allowlist

**Files:**
- Modify: `content/utils/analytics-schema.js`

`npm run build` runs `check:tracking`, which fails the build if a `track()` call uses an event not in the schema (see project memory: analytics schema allowlist gap). Add the three events this feature fires.

**Step 1:** In `content/utils/analytics-schema.js`, add near the other `mds_*` entries (~line 78):
```js
  mds_list_coverage_shown: ['rows', 'ok', 'not_synced'],
  mds_list_coverage_row_clicked: ['required', 'needed'],
```
`error_shown` already exists — confirm `surface`, `error_code`, `error_type` are accepted props; if `surface` values are enumerated anywhere, add `mds_list_coverage`.

**Step 2: Verify** — `npm run check:tracking` → exits 0.

**Step 3: Commit** — `git commit -m "chore(analytics): allowlist mds_list_coverage events"`

---

## Task 8: Build + manual verification

**Step 1: Run the unit tests** — `npx vitest run content/mds-list-coverage/` → all PASS.

**Step 2: Build** — `npm run build` → succeeds (includes `check:tracking`). Note bundle still emits to `dist/`.

**Step 3: Load + verify in PCC** (per CLAUDE.md worktree flow): `super-ext tehran-v1` → `chrome://extensions` Reload → open **Clinical → MDS List → In Progress**. Confirm:
- A trailing **"Interviews Due"** column appears with chips per row.
- ✓ chips for covered, ⚠ "by M/D" for needed, neutral `–` for `not_synced` (never a red ✗).
- Switching **Unit/Floor/Resident Status** re-renders chips (observer fires) without a full reload.
- Clicking a covered/needed row opens the detail popover with per-interview windows + UDA names.
- DevTools Network shows exactly **one** `POST .../interview-coverage/batch` per distinct row-set (not per row).

**Step 4: Verify with the verify skill** if desired (drive the page), then **Commit** any fixes.

---

## Risks & notes

- **Framing (Task 0)** is the one thing that can change the architecture — resolve it before Task 1.
- **PCC re-render churn:** the MutationObserver on `#msg1` is debounced (350ms) and gated by an id-set cache so benign DOM mutations don't spam the endpoint. If PCC mutates rows continuously, tighten the observer target to the rows `<tbody>`.
- **Pagination:** sample page had ~24 rows, no pager. Backend handles ~20–50 rows in one trip; if a real org renders a huge page, chunk `assessments` into batches of ~50 and merge `results` (backend already flagged this).
- **`key` matching:** backend echoes the exact `externalAssessmentId` string we send (prod-verified 1:1). We key `resultsByKey` by `String(res.key)` and look up by the scraped id string — keep both as strings.
- **Decision tree (CLAUDE.md):** built vanilla deliberately — render target is PCC's server-rendered table, same idiom as `mds-overlay.js`. Pure logic is isolated + unit-tested; only the thin DOM/transport shells are untested.

---

## Execution handoff

Plan saved here. Two execution options:
1. **Subagent-Driven (this session)** — dispatch a fresh subagent per task, review between tasks.
2. **Parallel Session (separate)** — open a new session with `superpowers:executing-plans`, batch with checkpoints.
