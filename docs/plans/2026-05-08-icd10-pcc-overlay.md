# ICD-10 PCC Overlay (Live Dx List from DOM) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the ICD-10 viewer use the live PCC Med Diag DOM as truth for "what's already coded," so codes added/removed in PCC (via our AI Code Patient flow or directly) are reflected immediately instead of waiting up to 24h for the nightly sync.

**Architecture:** Scrape `#meddiaglisting` from PCC's DOM on every viewer open. Send full codes as `pccCodes` query param to `/api/extension/icd10-annotations[/v2]` so the backend uses the live set for Approved-vs-Top-Ranked routing (backend change already merged). For the Approved sidebar, merge the scraped list with the DB-returned diagnoses client-side — DB rows where they exist (rich: id/evidences/queryHistory), synthetic rows for codes the DB doesn't know yet. No new write endpoint, no caching, stateless.

**Tech Stack:** Vanilla JS, Vite bundler, no test framework installed (verification is manual + console-asserted).

**Background reading:**
- Backend handoff: `docs/handoffs/2026-05-08-icd10-pcc-overlay.md` (resolution at the bottom)
- DOM shape reference: see "DOM contract" appendix at bottom of this plan

---

## Task 1: Add the DOM scraper module

**Files:**
- Create: `content/icd10-viewer/pcc-dx-scraper.js`
- Modify: `content/content.js` (add import)

**Step 1: Create the scraper file**

Create `content/icd10-viewer/pcc-dx-scraper.js` with this exact content:

```js
/**
 * PCC Med Diag DOM scraper.
 *
 * Reads PCC's #meddiaglisting table on the patient's Med Diag page and
 * returns the patient's currently-coded ICD-10 list. Used by the ICD-10
 * viewer to override the backend's stale "what's already coded" set —
 * see docs/handoffs/2026-05-08-icd10-pcc-overlay.md for the why.
 *
 * Returns [] when the table isn't on the page (viewer was opened from
 * somewhere else). Callers must treat [] as "no override available" and
 * fall back to backend-only behavior, NOT as "patient has zero codes."
 */
const PCCDxScraper = {
  /**
   * @returns {Array<{
   *   icd10Code: string,
   *   description: string,
   *   rank: string,
   *   onsetDate: string,
   *   classification: string,
   *   pdpmComorbidity: string,
   *   clinicalCategory: string,
   * }>}
   */
  scrape() {
    const table = document.getElementById('meddiaglisting');
    if (!table) return [];

    // Build column-name → cell-index map from the header. Column order can
    // shift across PCC versions and the extension injects its own CP/Query
    // columns, so reading by label is the only stable approach.
    const headerCells = table.querySelectorAll('thead th');
    const idx = {};
    headerCells.forEach((th, i) => {
      const label = (th.textContent || '').trim().toLowerCase();
      if (label === 'code') idx.code = i;
      else if (label === 'description') idx.description = i;
      else if (label.includes('pdpm')) idx.pdpm = i;
      else if (label.includes('clinical category')) idx.category = i;
      else if (label === 'date') idx.onsetDate = i;
      else if (label === 'rank') idx.rank = i;
      else if (label === 'classification') idx.classification = i;
    });

    if (idx.code === undefined) {
      console.warn('[PCCDxScraper] Code column not found in #meddiaglisting header');
      return [];
    }

    const ICD10_RX = /^[A-Z]\d{2}(\.[A-Z0-9]+)?$/i;
    const rows = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const tds = tr.children;
      const codeCell = tds[idx.code];
      if (!codeCell) return;
      const code = (codeCell.textContent || '').trim();
      if (!ICD10_RX.test(code)) return; // header echoes, blank rows, etc.

      const cellText = (i) =>
        i !== undefined && tds[i] ? (tds[i].textContent || '').trim() : '';

      rows.push({
        icd10Code: code.toUpperCase(),
        description: cellText(idx.description),
        rank: cellText(idx.rank),
        onsetDate: cellText(idx.onsetDate),
        classification: cellText(idx.classification),
        pdpmComorbidity: cellText(idx.pdpm),
        clinicalCategory: cellText(idx.category),
      });
    });

    if (rows.length > 200) {
      console.warn(
        `[PCCDxScraper] Scraped ${rows.length} rows (>200). Selector may be picking up unintended content.`
      );
    }

    return rows;
  },

  /**
   * Wait for PCC's #meddiaglisting table to settle after a mutation
   * (e.g., post AI Code Patient batch submit, where PCC re-renders the
   * dx table async). Resolves once mutations have been quiet for `quietMs`,
   * or after `timeoutMs` no matter what.
   *
   * @param {{ timeoutMs?: number, quietMs?: number }} [opts]
   */
  async waitForSettled({ timeoutMs = 3000, quietMs = 250 } = {}) {
    const target = document.getElementById('meddiaglisting');
    if (!target) return;
    return new Promise((resolve) => {
      let quietTimer;
      let deadline;
      const done = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(deadline);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      observer.observe(target, { childList: true, subtree: true });
      // Cover the case where PCC was already done before we attached
      quietTimer = setTimeout(done, quietMs);
      deadline = setTimeout(done, timeoutMs);
    });
  },
};

window.PCCDxScraper = PCCDxScraper;
```

**Step 2: Wire it into the bundle**

Modify `content/content.js`. Add the import line right after `pcc-client.js`:

```js
import './icd10-viewer/pcc-client.js';
import './icd10-viewer/pcc-dx-scraper.js';   // ← new line
import './icd10-viewer/icd10-sidebar.js';
```

**Step 3: Build and smoke-test the scraper in isolation**

Run: `npm run build`
Expected: Build succeeds, no errors. Bundle size ~1KB larger.

Then load the extension, navigate to a real patient's Med Diag page, open DevTools console, and run:

```js
window.PCCDxScraper.scrape()
```

Expected: An array of objects with `icd10Code`, `description`, etc. populated. Codes are uppercase. Length matches the visible row count in the table.

If running in a sandbox without a real patient: smoke-test by pasting the DOM contract HTML (appendix below) into a blank page, then running the same console call.

**Step 4: Commit**

```bash
git add content/icd10-viewer/pcc-dx-scraper.js content/content.js
git commit -m "feat(icd10): add PCC Med Diag DOM scraper

Reads #meddiaglisting from the PCC page and returns the patient's
currently-coded ICD-10 list. Used by the ICD-10 viewer to override
the backend's stale 'already coded' set — see handoff doc for context.
Stateless, returns [] when table not present."
```

---

## Task 2: Thread `pccCodes` through `ICD10API.getAnnotations`

**Files:**
- Modify: `content/icd10-viewer/icd10-api.js:63-96`

**Step 1: Update the signature and request**

Replace the entire `getAnnotations` method (lines 63–96 in `icd10-api.js`) with:

```js
  async getAnnotations(patientId, facilityName, orgSlug, mdsAssessmentId, pccCodes) {
    const v2 = this._useV2();

    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay();
      if (v2) {
        return this._processV2ListResponse(this._adaptV1MockToV2(ICD10MockData.apiResponse));
      }
      return this._processAnnotationResponse(ICD10MockData.apiResponse);
    }

    const path = v2 ? '/api/extension/icd10-annotations/v2' : '/api/extension/icd10-annotations';
    const params = new URLSearchParams({
      patientId,
      facilityName,
      orgSlug,
    });
    if (v2 && mdsAssessmentId) params.set('mdsAssessmentId', mdsAssessmentId);

    // pccCodes: live PCC Med Diag list (override for backend's stale DB).
    // CRITICAL: only attach when there's at least one code. Sending an empty
    // string would tell the backend "patient has zero codes" → empty Approved
    // bucket → every code looks like a fresh suggestion. See handoff doc.
    if (Array.isArray(pccCodes) && pccCodes.length > 0) {
      params.set('pccCodes', pccCodes.join(','));
    }

    const endpoint = `${path}?${params}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackIcd10ApiFail(path, response);
      throw new Error(response.error || 'Failed to fetch annotations');
    }

    const data = response.data || response;
    return v2 ? this._processV2ListResponse(data) : this._processAnnotationResponse(data);
  },
```

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Verify call sites still work (signature is backward-compatible)**

`pccCodes` is the 5th positional arg, all existing callers pass 4 args, so they continue to work unchanged.

Run:
```bash
grep -n "ICD10API.getAnnotations(" content/icd10-viewer/icd10-viewer.js
```
Expected: 2 hits. Both pass 4 args. Both will keep working (no `pccCodes` → no param sent → same behavior as today).

**Step 4: Commit**

```bash
git add content/icd10-viewer/icd10-api.js
git commit -m "feat(icd10): accept optional pccCodes in getAnnotations

Optional 5th arg. When provided as a non-empty array, attaches
pccCodes=<csv> to the v1/v2 annotations endpoint. Backend uses it
to override the stale DB-derived 'already coded' set. Empty/absent
falls back to today's behavior."
```

---

## Task 3: Wire scraper → API in the viewer's initial load

**Files:**
- Modify: `content/icd10-viewer/icd10-viewer.js:354-383` (`_loadData`)

**Step 1: Update `_loadData` to scrape + thread pccCodes**

Replace the body of `_loadData` (currently lines 354–383) with:

```js
  /**
   * Load annotations and diagnoses data
   */
  async _loadData() {
    try {
      // Scrape PCC's live dx list off the DOM. This is the freshest source —
      // the backend mirrors PCC nightly so its DB lags by up to ~24h. Codes
      // are sent to the annotations endpoint so it routes Approved vs Top
      // Ranked correctly. Returns [] when not on the meddiag page → falls
      // back to backend-only behavior (NOT "patient has zero codes").
      const scraped = (window.PCCDxScraper?.scrape?.() || []);
      this._pccDxList = scraped;
      const pccCodes = scraped.map((d) => d.icd10Code);
      console.log('[ICD10Viewer] Scraped PCC dx list:', pccCodes.length, 'codes');

      // Fetch data in parallel
      const [annotationData, approvedDiagnoses] = await Promise.all([
        ICD10API.getAnnotations(
          this.patientId,
          this.facilityName,
          this.orgSlug,
          this._assessmentId,
          pccCodes
        ),
        ICD10API.getApprovedDiagnoses(this.patientId, this.facilityName, this.orgSlug)
      ]);

      this._v2 = annotationData._v2 === true;
      this.topRanked = annotationData.topRanked || [];
      this.approved = annotationData.approved || [];
      this.annotations = annotationData.flatAnnotations || [];
      this.flatGroups = annotationData.flatGroups || null;
      this.counts = annotationData.counts || {};
      this.admitDate = annotationData.admitDate || null;
      this.approvedDiagnoses = this._mergeApprovedFromPcc(approvedDiagnoses || [], scraped);

      // Initialize components
      this._initializeComponents();

    } catch (error) {
      console.error('ICD10Viewer: Failed to load data:', error);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_viewer',
        error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
        error_type: 'api_error',
      });
      this._showError(`Failed to load ICD-10 data: ${error.message}`);
    }
  },
```

**Step 2: Don't run yet — `_mergeApprovedFromPcc` is added in Task 4. Build will fail.**

That's intentional — we're committing in small bites. The next task adds the merge helper. Skip the build step here.

**Step 3: Commit**

```bash
git add content/icd10-viewer/icd10-viewer.js
git commit -m "wip(icd10): scrape PCC dx list on viewer open and thread to API

Scrape on every _loadData call, pass full codes to getAnnotations.
approvedDiagnoses now flows through _mergeApprovedFromPcc — that
helper is added in the next commit; bundle won't build until then."
```

(Yes, the WIP commit fails to build. We're committing per logical change, not per buildable state. The merge helper lands in the very next commit.)

---

## Task 4: Add the `_mergeApprovedFromPcc` helper

**Files:**
- Modify: `content/icd10-viewer/icd10-viewer.js` (add a new method near `_computeApprovedDiagnosisMeta`, around line 806)

**Step 1: Add the method**

Insert this method into the `ICD10Viewer` object. A good home is right above `_computeApprovedDiagnosisMeta` (~line 806). Put it after the closing `},` of `_refreshApprovedDiagnoses` (~line 792).

```js
  /**
   * Merge backend's approvedDiagnoses (rich: id, evidences, queryHistory,
   * PDPM badges) with the live PCC scrape so the Approved sidebar reflects
   * what's actually on the dx sheet RIGHT NOW.
   *
   * Rules:
   *   - For each scraped code: if a DB row exists for that code, keep the
   *     DB row (it's strictly richer).
   *   - If no DB row: emit a synthetic row from the scrape so the user
   *     sees the just-coded item immediately. Marked `__synthetic: true`
   *     for downstream styling. No id, no evidences, no queryHistory —
   *     those land on the next sync.
   *   - DB rows whose code is NOT in the scrape are dropped. That's
   *     correct: the user struck them out in PCC since the last sync.
   *
   * If the scrape was empty (viewer opened from somewhere off the meddiag
   * page), return the DB list unchanged — we have no override signal.
   */
  _mergeApprovedFromPcc(dbDiagnoses, scraped) {
    if (!Array.isArray(scraped) || scraped.length === 0) {
      return dbDiagnoses;
    }
    const dbByCode = new Map();
    for (const dx of dbDiagnoses) {
      if (dx?.icd10Code) dbByCode.set(dx.icd10Code.toUpperCase(), dx);
    }

    return scraped.map((s) => {
      const code = s.icd10Code.toUpperCase();
      const dbRow = dbByCode.get(code);
      if (dbRow) return dbRow;
      return {
        id: null,
        icd10Code: code,
        description: s.description,
        rank: s.rank,
        classification: s.classification,
        onsetDate: s.onsetDate,
        // Best-effort PDPM hints from the page. Backend authoritative
        // values land on the next sync.
        pdpmCategory: s.pdpmComorbidity || null,
        pdpmCategoryName: s.pdpmComorbidity || null,
        clinicalCategory: s.clinicalCategory || null,
        __synthetic: true,
      };
    });
  },
```

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Smoke-test in browser**

1. Reload the unpacked extension at `chrome://extensions` (the `dist/` folder).
2. Open a real patient's Med Diag page.
3. Open DevTools, switch to the Network tab, filter for `icd10-annotations`.
4. Click "AI Code Patient" → wait for viewer to open.
5. Inspect the request URL.

Expected: URL contains `&pccCodes=C02.9,Z74.1,...` matching the codes visible in the dx table.

Also expected on the backend (per handoff): CloudWatch logs `[ICD10] Patient has N active PCC diagnoses (source=pcc-live)`. Backend team can confirm.

**Step 4: Commit**

```bash
git add content/icd10-viewer/icd10-viewer.js
git commit -m "feat(icd10): merge approved sidebar with live PCC dx list

_mergeApprovedFromPcc keeps DB rows where they exist (rich data),
synthesizes rows for codes the DB doesn't know yet (just-added),
drops DB rows the user struck out. Empty scrape → DB list unchanged."
```

---

## Task 5: Refresh after AI Code Patient submit (with DOM-settle wait)

**Files:**
- Modify: `content/icd10-viewer/icd10-viewer.js:773-792` (`_refreshApprovedDiagnoses`)

**Step 1: Update `_refreshApprovedDiagnoses` to wait + re-scrape + re-fetch annotations too**

After AI Code Patient submits a batch, PCC re-renders the dx table async. We need to wait for that, then re-scrape, then re-fetch BOTH endpoints (annotations needs fresh `pccCodes` so just-coded items leave Top Ranked).

Replace the entire `_refreshApprovedDiagnoses` method with:

```js
  /**
   * Refetch state after a write that changes the PCC dx list (AI Code
   * Patient batch submit, query submit, etc.). PCC re-renders the dx
   * table async, so we wait for the DOM to settle before scraping —
   * otherwise we'd capture pre-submit state and the just-coded items
   * would still show as Top Ranked suggestions.
   */
  async _refreshApprovedDiagnoses() {
    try {
      // Wait for PCC's table mutation to settle (post-submit re-render).
      // No-op when not on the meddiag page (target absent → resolves immediately).
      await window.PCCDxScraper?.waitForSettled?.();

      const scraped = (window.PCCDxScraper?.scrape?.() || []);
      this._pccDxList = scraped;
      const pccCodes = scraped.map((d) => d.icd10Code);

      // Re-fetch annotations (so Top Ranked drops just-coded items) AND
      // approved diagnoses in parallel.
      const [annotationData, fresh] = await Promise.all([
        ICD10API.getAnnotations(
          this.patientId,
          this.facilityName,
          this.orgSlug,
          this._assessmentId,
          pccCodes
        ),
        ICD10API.getApprovedDiagnoses(this.patientId, this.facilityName, this.orgSlug),
      ]);

      this.topRanked = annotationData.topRanked || [];
      this.approved = annotationData.approved || [];
      this.annotations = annotationData.flatAnnotations || [];
      this.flatGroups = annotationData.flatGroups || null;
      this.counts = annotationData.counts || {};
      this.approvedDiagnoses = this._mergeApprovedFromPcc(fresh || [], scraped);

      ICD10Sidebar.updateData({
        topRanked: this.topRanked,
        approved: this.approved,
        annotations: this.annotations,
        flatGroups: this.flatGroups,
        approvedDiagnoses: this.approvedDiagnoses,
        counts: this.counts,
        approvedBaseCodes: this._computeApprovedBaseCodes(),
      });
      if (typeof ICD10EvidencePanel?.setApprovedLeafCodes === 'function') {
        ICD10EvidencePanel.setApprovedLeafCodes(this._computeApprovedLeafCodes());
      }
      if (typeof ICD10EvidencePanel?.setApprovedDiagnosisMeta === 'function') {
        ICD10EvidencePanel.setApprovedDiagnosisMeta(this._computeApprovedDiagnosisMeta());
      }
    } catch (err) {
      console.warn('[ICD10Viewer] Failed to refresh approved diagnoses post-write:', err);
    }
  },
```

**Step 2: Verify `ICD10Sidebar.updateData` accepts those keys**

Open `content/icd10-viewer/icd10-sidebar.js` and check that `updateData` (or equivalent) accepts `topRanked`, `approved`, `annotations`, `flatGroups`, `counts`, `approvedDiagnoses`, `approvedBaseCodes`. The viewer already sets these via `_initializeComponents` so they're known fields, but `updateData` may have a narrower API.

Run:
```bash
grep -n "updateData" content/icd10-viewer/icd10-sidebar.js
```

If `updateData` doesn't accept all these keys, the safe fallback for this task is to update only the previously-supported keys (`approvedDiagnoses`, `approvedBaseCodes`) and leave a TODO; document in the commit message.

**Step 3: Build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Smoke-test the post-submit flow**

1. Reload extension, open a real patient's Med Diag page.
2. Click AI Code Patient, stage a code that's NOT currently on the dx sheet, hit Submit.
3. Watch Network tab: the post-submit refresh should fire `getAnnotations` AND `getApprovedDiagnoses` (both with `pccCodes` containing the new code).
4. The just-submitted code should appear in the Approved sidebar instead of remaining in Top Ranked.
5. Manually delete a code in PCC (use PCC's native UI or refresh after deleting elsewhere) → that code should fall back into Top Ranked / NTA / SLP, not stay pinned to Approved.

**Step 5: Commit**

```bash
git add content/icd10-viewer/icd10-viewer.js
git commit -m "feat(icd10): refresh annotations + approved on post-submit, await DOM settle

After AI Code Patient (or any write that mutates the dx list), wait
for PCC's table re-render to settle, re-scrape, then re-fetch BOTH
annotations and approvedDiagnoses with the fresh pccCodes. Just-coded
items now leave Top Ranked immediately; just-removed items return."
```

---

## Task 6: Bump version and final smoke

**Files:**
- Modify: `package.json` (version bump)
- Modify: `dist/manifest.json` is auto-generated by build; don't hand-edit

**Step 1: Bump patch version**

Open `package.json` and bump `"version"` by one patch (e.g., `1.0.32` → `1.0.33`).

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds. Bundle output mentions the new version.

**Step 3: Manual end-to-end test**

Reload extension. On a real patient's Med Diag page:

| Test | Expected |
|---|---|
| Open viewer | Network shows `&pccCodes=...` on annotations call |
| Approved sidebar | Shows every code in PCC's table, in PCC's order |
| Code currently in PCC but recent (post-last-sync) | Appears in Approved as synthetic (`__synthetic: true` in console; if FE has styling for it, looks slightly different) |
| Code in DB but recently removed from PCC | Does NOT appear in Approved; appears in Top Ranked / NTA / SLP per backend bucket |
| AI Code Patient submit a new code | After settle, code moves into Approved automatically without viewer re-open |
| Open viewer from a non-meddiag page (if possible) | Works normally — no `pccCodes` param sent, falls back to DB-only behavior, no errors |

If anything fails, do not ship — file the gap and stop here.

**Step 4: Commit + tag**

```bash
git add package.json
git commit -m "chore: bump to v1.0.33 — live PCC dx overlay for ICD-10 viewer"
```

(Don't push or tag without explicit user confirmation — see CLAUDE.md.)

---

## Appendix: DOM contract for `#meddiaglisting`

The scraper depends on:

- A `<table>` with id `meddiaglisting` somewhere in the document.
- A `<thead>` containing `<th>` cells whose text content is one of:
  - `Code` (required) — the cell index where the ICD-10 code lives
  - `Description`, `Date`, `Rank`, `Classification` (optional but normally present)
  - `PDPM Comorbidities (NTA Points)` (matched as "contains pdpm")
  - `Clinical Category` (matched as "contains clinical category")
- A `<tbody>` with `<tr>` rows; each row has cells in the same order as the header.
- Cell text values are read with `.textContent.trim()`. The "T" therapy marker, super-meddiag CP/Query chips, and `update` action links are ignored — they live in their own columns and the scraper doesn't read them.
- Codes match `/^[A-Z]\d{2}(\.[A-Z0-9]+)?$/i` after trim. Anything else in the code column is skipped (non-data rows).

If PCC ever reorders columns or renames headers, the scraper degrades gracefully: `idx.code === undefined` → returns `[]` → viewer falls back to backend-only behavior.

---

## What we are explicitly NOT doing

- ❌ No new write endpoint, no DB upsert from the extension.
- ❌ No caching of the scraped list — every viewer open re-reads the DOM.
- ❌ No retry / fallback if the param is malformed — if scrape returns garbage, backend rejects → viewer falls back to today's behavior.
- ❌ No backend changes (already merged separately).
- ❌ No MDS / PDPM equivalent (separate work — the user explicitly scoped this PR to ICD-10 only).
- ❌ No tests in a new framework — this codebase has no test runner installed and adding one isn't in scope.
