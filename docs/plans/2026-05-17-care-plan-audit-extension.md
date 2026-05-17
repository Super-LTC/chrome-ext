# Care Plan Audit — Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the new backend `PlanAuditService` (PR #467) into the Chrome extension as three surfaces: (A) a slim audit banner + Comprehensive-Review mode of the existing auto-pop modal on PCC's Care Plan Detail page, (B) the same audit panel as a launchable wizard on PCC's Care Plan Review page (`view_review.jsp`), with mode toggle inside the modal. Orders-page integration is explicitly **out of scope**.

**Architecture:** Extend (not replace) the existing `CarePlanStampModal` to support a `mode` prop with two values — `'initial'` (current auto-pop behavior, calls `/auto-pop`) and `'comprehensive'` (new audit behavior, calls `/audit`). Comprehensive mode renders a new left-rail component with **collapsible sections** (Add / Verify / Remove) reusing the existing badge vocabulary. Right pane swaps per bucket. New PCC helper marks focuses resolved (for the Remove bucket). Banner injection mirrors the existing button-injection pattern.

**Tech Stack:** Preact + hooks (no new deps), existing `chrome.runtime.sendMessage({type:'API_REQUEST'})` relay, MutationObserver injection pattern from `inject-button.js`.

---

## Reference: backend contract

See chat handoff §1 for full spec. Key shape:

```ts
GET|POST /api/extension/care-plan/audit
Body: { patientId, orgSlug, facilityName, patientName?, tokenValues?, orgDropdowns? }

Response.audit:
  toAdd[]:    { ruleId, reason, coverageSignal, focus: ProposedFocus | null }
  toRemove[]: { focusId, focusText, reason, pccFocusId, pccFocusStdItemId }
  toCheck[]:  { kind, detail, reason, focusId, pccFocusId, pccFocusStdItemId }
  hasCoverageCheckData: boolean
```

`toAdd[].focus` is the **same `ProposedFocus` shape** that `/auto-pop` returns in `focuses[]` — so stamping reuses the existing `_composeFocus` + `pcc-stamp.js` path unchanged.

---

## Decisions locked from brainstorming

1. **Button on care plan detail page** stays where it is (next to "New Custom Focus"). Rename `✨ Generate Initial Care Plan` → `✨ AI Care Plan`. State-aware default mode: empty plan → Initial, established plan → Comprehensive. Toggle lives **inside** the modal.
2. **Banner** above the action row on `careplandetail_rev.jsp`. Slim single-line strip with counts + "Review →". Dismissible per session. Hidden if all counts are 0 (collapsed to a quiet "✓" indicator).
3. **Mini-wizard IA:** NO tabs. Left rail = three **collapsible sections** (Add / Verify / Remove). Right pane swaps per selected item. Auto-expand the section the nurse entered from.
4. **Care Plan Review page (`view_review.jsp`):** show a **global** audit panel (not department-sliced — Drew explicitly chose global for v1). Same component as the Comprehensive mini-wizard, mounted from a new injected button/banner on that page.
5. **Orders page: OUT OF SCOPE.** Do not inject anything there.
6. **Verify bucket judgment actions** ([Mark verified] / [Keep]) are local-state only for v1. No new persistence endpoint. Drew will add one once nurse feedback shapes what to save.

---

## File layout

**New files:**
- `content/modules/care-plan-stamp/audit-api.js` — endpoint client (mirrors `stamp-api.js`)
- `content/modules/care-plan-stamp/pcc-resolve.js` — PCC "mark focus resolved" helper
- `content/modules/care-plan-stamp/audit-banner.js` — banner injection on `careplandetail_rev.jsp`
- `content/modules/care-plan-stamp/audit-review-button.js` — button injection on `view_review.jsp`
- `content/modules/care-plan-stamp/components/ScopeToggle.jsx` — Initial/Comprehensive segmented control
- `content/modules/care-plan-stamp/components/AuditFocusList.jsx` — left rail w/ collapsible sections
- `content/modules/care-plan-stamp/components/AddBucketPane.jsx` — right pane for `toAdd`
- `content/modules/care-plan-stamp/components/RemoveBucketPane.jsx` — right pane for `toRemove`
- `content/modules/care-plan-stamp/components/VerifyBucketPane.jsx` — right pane for `toCheck`

**Modified files:**
- `content/modules/care-plan-stamp/inject-button.js` — rename button label
- `content/modules/care-plan-stamp/CarePlanStampModal.jsx` — add `mode` prop, conditional rendering
- `content/content.js` — import new files

---

# Phase 1 — Foundation: API + PCC resolve helper

## Task 1: Add `audit-api.js`

**Files:**
- Create: `content/modules/care-plan-stamp/audit-api.js`

**Step 1.** Copy `stamp-api.js` shape. Single export `fetchAudit({ patientId, facilityName, orgSlug, patientName, orgDropdowns, tokenValues })` that POSTs to `/api/extension/care-plan/audit` via the `API_REQUEST` relay.

```javascript
// content/modules/care-plan-stamp/audit-api.js
async function fetchAudit({ patientId, facilityName, orgSlug, patientName = null, orgDropdowns = null, tokenValues = null }) {
  const body = {
    patientId: String(patientId),
    facilityName: facilityName || '',
    orgSlug: orgSlug || '',
  };
  if (patientName) body.patientName = patientName;
  if (orgDropdowns) body.orgDropdowns = orgDropdowns;
  if (tokenValues) body.tokenValues = tokenValues;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: '/api/extension/care-plan/audit',
    options: { method: 'POST', body: JSON.stringify(body) },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch care plan audit');
    err.endpoint = '/api/extension/care-plan/audit';
    throw err;
  }
  return response.data || response;
}

window.CarePlanAuditAPI = { fetchAudit };
```

**Step 2.** Import in `content/content.js` right after `stamp-api.js`:

```javascript
import './modules/care-plan-stamp/audit-api.js';
```

**Step 3.** Build (`npm run build`), reload extension, open DevTools console on PCC, run:
```javascript
await window.CarePlanAuditAPI.fetchAudit({ patientId: '<known patient>', facilityName: 'Bethesda Care Centre', orgSlug: 'super-ltc' })
```
Expect a response object with `audit.toAdd[]`, `audit.toRemove[]`, `audit.toCheck[]`. If 404 or 500, ping Drew with the response — don't proceed.

**Step 4. Commit:**
```bash
git add content/modules/care-plan-stamp/audit-api.js content/content.js
git commit -m "feat(care-plan-audit): add audit-api client"
```

---

## Task 2: Add `pcc-resolve.js` — mark focus resolved in PCC

**Files:**
- Create: `content/modules/care-plan-stamp/pcc-resolve.js`
- Reference: `content/modules/care-plan-stamp/pcc-stamp.js:80-145` (existing editNeed form POST pattern)

PCC's existing edit-need POST already accepts a `resolved_date` field — the existing stamp code sends `resolved_date: ''` to leave focuses active. To resolve, we re-POST the same form with today's date and `resolved_type` populated.

**Step 1.** Read `content/modules/care-plan-stamp/pcc-stamp.js` end-to-end first (~330 lines). Identify the `_postEditNeedForm` (or equivalent) helper and its URL/body shape. Note any hidden fields it requires beyond `ESOLneedid`/`ESOLgenneedid`/`ESOLpnneedid`.

**Step 2.** Implement:

```javascript
// content/modules/care-plan-stamp/pcc-resolve.js
/**
 * Mark a single PCC care plan focus as resolved.
 *
 * Reuses the same editNeed POST endpoint as pcc-stamp.js, but populates
 * resolved_date + resolved_type instead of leaving them empty.
 *
 * pccFocusId and pccFocusStdItemId come from /api/extension/care-plan/audit
 * (audit.toRemove[].pccFocusId / .pccFocusStdItemId).
 */
async function resolveFocus({ patientId, careplanId, pccFocusId, pccFocusStdItemId, miniToken, resolvedType = 'Resolved' }) {
  // Build form body — see pcc-stamp.js _postEditNeedForm for the full field list.
  // Required differences from a normal save:
  //   resolved_date: MM/DD/YYYY (today)
  //   resolved_type: 'Resolved'
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const resolvedDate = `${mm}/${dd}/${today.getFullYear()}`;

  // TODO during implementation: match the exact form fields pcc-stamp.js uses.
  // The minimal set for an edit-resolve appears to be:
  //   ESOLclientid, ESOLcareplanid, ESOLneedid (=pccFocusId),
  //   ESOLgenneedid (=pccFocusStdItemId or 0), ESOLpnneedid (same),
  //   action=editNeedSave, resolved_date, resolved_type, miniToken
  // Verify against the actual editNeed POST captured in the Network tab when
  // a nurse manually resolves a focus in PCC.
  const formBody = new URLSearchParams({
    ESOLclientid: String(patientId),
    ESOLcareplanid: String(careplanId),
    ESOLneedid: String(pccFocusId),
    ESOLgenneedid: String(pccFocusStdItemId || pccFocusId),
    ESOLpnneedid: String(pccFocusStdItemId || pccFocusId),
    action: 'editNeedSave',
    resolved_date: resolvedDate,
    resolved_type: resolvedType,
    miniToken: miniToken || '',
  });

  const res = await fetch('/care/chart/cp/editNeed.jsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`PCC resolve failed: HTTP ${res.status}`);
  return { ok: true };
}

window.CarePlanResolveAPI = { resolveFocus };
```

**Step 3.** Import in `content/content.js`:
```javascript
import './modules/care-plan-stamp/pcc-resolve.js';
```

**Step 4. Manual verification (CRITICAL — do not skip):**
1. In PCC, open a test patient's care plan, pick a focus you can re-create.
2. Open DevTools Network tab, manually click PCC's edit on that focus, set resolved date + type, save. **Capture the request URL, method, and full form body.**
3. Update `pcc-resolve.js` to match the exact field names PCC uses (the snippet above is a best-guess based on existing stamp code — verify, don't trust).
4. Test via console:
   ```javascript
   await window.CarePlanResolveAPI.resolveFocus({ patientId: '...', careplanId: '...', pccFocusId: '...', miniToken: '...' })
   ```
5. Verify the focus is marked resolved in PCC. **Restore the focus** before continuing.

**Step 5. Commit:**
```bash
git add content/modules/care-plan-stamp/pcc-resolve.js content/content.js
git commit -m "feat(care-plan-audit): add PCC focus-resolve helper"
```

---

# Phase 2 — Modal: scope toggle + Comprehensive mode skeleton

## Task 3: Rename button label, default mode hint

**Files:**
- Modify: `content/modules/care-plan-stamp/inject-button.js:28-29`

**Step 1.** Change button value text:
```javascript
btn.value = '✨ AI Care Plan';
btn.title = 'AI-assisted care plan: auto-populate for new admits, audit + review for established plans';
```

**Step 2.** Add a `defaultMode` resolver — detect if the patient has existing focuses by scraping the page (mirroring `_scrapeExistingFocusTexts`). Pass to modal as `defaultMode: 'initial' | 'comprehensive'`.

In `_handleClick`:
```javascript
const existingTexts = _scrapeExistingFocusTexts();
const defaultMode = existingTexts.length === 0 ? 'initial' : 'comprehensive';
await _openModal({ patientId, patientName, facilityName, orgSlug, defaultMode });
```

In `_openModal`, pass `defaultMode` through to `CarePlanStampModal`:
```javascript
render(
  h(CarePlanStampModal, { patientId, patientName, facilityName, orgSlug, defaultMode, onClose: handleClose }),
  overlay
);
```

**Step 3. Commit:**
```bash
git add content/modules/care-plan-stamp/inject-button.js
git commit -m "feat(care-plan-audit): rename button to AI Care Plan, detect default mode"
```

---

## Task 4: Add `mode` state + ScopeToggle to `CarePlanStampModal`

**Files:**
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx`
- Create: `content/modules/care-plan-stamp/components/ScopeToggle.jsx`

**Step 1.** Create `ScopeToggle.jsx`:

```jsx
import { h } from 'preact';

/**
 * Segmented control at the top of the wizard. Switches between the two
 * proposal sources:
 *   - 'initial'       → /api/extension/care-plan/auto-pop (universals)
 *   - 'comprehensive' → /api/extension/care-plan/audit    (full audit)
 *
 * Picks the default based on patient state (empty plan vs. established).
 * Nurse can override mid-session; switching re-fetches.
 */
export const ScopeToggle = ({ mode, onChange, disabled }) => {
  const opts = [
    { id: 'initial', label: 'Initial Admit', hint: 'Empty plan · universals only' },
    { id: 'comprehensive', label: 'Comprehensive Review', hint: 'Audit existing plan' },
  ];
  return (
    <div className="super-scope-toggle" role="radiogroup" aria-label="Care plan scope">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          disabled={disabled}
          onClick={() => mode !== o.id && onChange(o.id)}
          className={mode === o.id ? 'super-scope-toggle__opt is-active' : 'super-scope-toggle__opt'}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
```

**Step 2.** Add CSS (append to existing modal CSS — find where it lives by grepping for `.super-cpas` or similar in `content/css/`):

```css
.super-scope-toggle {
  display: inline-flex;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}
.super-scope-toggle__opt {
  border: 0;
  background: transparent;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms, color 120ms;
}
.super-scope-toggle__opt.is-active {
  background: #fff;
  color: #4338ca;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.super-scope-toggle__opt:disabled { opacity: 0.5; cursor: not-allowed; }
```

**Step 3.** In `CarePlanStampModal.jsx`:

- Add `defaultMode` prop (default `'initial'`).
- Add `const [mode, setMode] = useState(defaultMode || 'initial');`
- Add `const [audit, setAudit] = useState(null);` for the audit response.
- In the existing `useEffect` that fetches the proposal, **gate the fetch on `mode`** — if `mode === 'comprehensive'`, call `CarePlanAuditAPI.fetchAudit` and store in `setAudit`. If `mode === 'initial'`, keep the existing `fetchProposal` path.
- Add `mode` to the effect deps. Switching toggle re-fetches.
- Render `<ScopeToggle mode={mode} onChange={setMode} disabled={stage === 'stamping'} />` in the modal header (next to the title, before the `+ Add from PCC Library` button).

**Step 4.** Build, manually verify:
- Open a patient with no plan → toggle defaults to Initial, behaves as before.
- Open a patient with focuses → toggle defaults to Comprehensive, console shows the audit fetch.
- Switching toggle re-fetches.

Right pane will be wrong/empty for Comprehensive — that's expected, next tasks fix it.

**Step 5. Commit:**
```bash
git add content/modules/care-plan-stamp/components/ScopeToggle.jsx content/modules/care-plan-stamp/CarePlanStampModal.jsx content/css/
git commit -m "feat(care-plan-audit): add scope toggle + audit fetch wiring"
```

---

# Phase 3 — Comprehensive mode UI

## Task 5: Build `AuditFocusList.jsx` (left rail with collapsible sections)

**Files:**
- Create: `content/modules/care-plan-stamp/components/AuditFocusList.jsx`

**Design:** Three collapsible sections in this order: Add / Verify / Remove. Each shows count badge next to the section title. Auto-expand the section with the most items (or all-collapsed-but-Add if entered via banner CTA — pass `initiallyExpanded` prop).

```jsx
import { h } from 'preact';
import { useState } from 'preact/hooks';

/**
 * Three-bucket left rail for Comprehensive Review mode.
 *
 * Bucket sections:
 *   - Add    (toAdd[])    — propose new focuses
 *   - Verify (toCheck[])  — nurse-judgment items
 *   - Remove (toRemove[]) — high-confidence stale focuses
 *
 * Selected item is identified by { bucket, idx }. Parent owns selection.
 *
 * No tabs — nurses lose track when work hides behind a tab. Collapsible
 * sections show counts even when collapsed so the nurse can see what's
 * pending across all three.
 */
export const AuditFocusList = ({
  audit,
  selected,           // { bucket: 'add'|'verify'|'remove', idx: number }
  onSelect,           // (selected) => void
  initiallyExpanded,  // 'add' | 'verify' | 'remove' — auto-open this bucket
  stamping,           // boolean — disable interactions during stamp/resolve
  resolveStatus,      // { [focusId]: 'pending' | 'done' | 'error' }
}) => {
  const toAdd = audit?.toAdd || [];
  const toCheck = audit?.toCheck || [];
  const toRemove = audit?.toRemove || [];

  // Default: expand the bucket with the most items, OR the requested one.
  const defaultExpanded = initiallyExpanded || (
    toAdd.length >= toCheck.length && toAdd.length >= toRemove.length ? 'add' :
    toCheck.length >= toRemove.length ? 'verify' : 'remove'
  );
  const [expanded, setExpanded] = useState({
    add: defaultExpanded === 'add' || toAdd.length > 0,
    verify: defaultExpanded === 'verify',
    remove: defaultExpanded === 'remove',
  });

  const toggle = (b) => setExpanded((e) => ({ ...e, [b]: !e[b] }));
  const isSel = (b, i) => selected?.bucket === b && selected?.idx === i;

  if (toAdd.length === 0 && toCheck.length === 0 && toRemove.length === 0) {
    return (
      <div className="super-audit-empty">
        <div className="super-audit-empty__icon">✓</div>
        <div className="super-audit-empty__title">Care plan looks complete</div>
        <div className="super-audit-empty__subtitle">No additions, removals, or verifications recommended.</div>
      </div>
    );
  }

  return (
    <div className="super-audit-rail">
      <Section
        title="Add" tone="add" count={toAdd.length}
        expanded={expanded.add} onToggle={() => toggle('add')}
      >
        {toAdd.map((item, i) => (
          <Row
            key={item.ruleId}
            kind="add"
            title={item.focus?.description || item.ruleId}
            subtitle={item.reason}
            badge={item.coverageSignal === 'ai_says_missing' ? 'AI gap'
                 : item.coverageSignal === 'ai_says_partial' ? 'Partial'
                 : null}
            selected={isSel('add', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'add', idx: i })}
          />
        ))}
      </Section>

      <Section
        title="Verify" tone="verify" count={toCheck.length}
        expanded={expanded.verify} onToggle={() => toggle('verify')}
      >
        {toCheck.map((item, i) => (
          <Row
            key={`${item.kind}-${item.focusId || i}`}
            kind="verify"
            title={item.detail}
            subtitle={item.reason}
            badge={_verifyBadge(item.kind)}
            selected={isSel('verify', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'verify', idx: i })}
          />
        ))}
      </Section>

      <Section
        title="Remove" tone="remove" count={toRemove.length}
        expanded={expanded.remove} onToggle={() => toggle('remove')}
      >
        {toRemove.map((item, i) => (
          <Row
            key={item.focusId}
            kind="remove"
            title={item.focusText}
            subtitle={item.reason}
            status={resolveStatus?.[item.focusId]}
            selected={isSel('remove', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'remove', idx: i })}
          />
        ))}
      </Section>
    </div>
  );
};

const Section = ({ title, tone, count, expanded, onToggle, children }) => (
  <div className={`super-audit-section super-audit-section--${tone} ${expanded ? 'is-open' : ''}`}>
    <button type="button" className="super-audit-section__head" onClick={onToggle} aria-expanded={expanded}>
      <span className="super-audit-section__caret">{expanded ? '▾' : '▸'}</span>
      <span className="super-audit-section__title">{title}</span>
      <span className="super-audit-section__count">{count}</span>
    </button>
    {expanded && <div className="super-audit-section__body">{children}</div>}
  </div>
);

const Row = ({ kind, title, subtitle, badge, status, selected, disabled, onClick }) => (
  <button
    type="button"
    className={`super-audit-row super-audit-row--${kind} ${selected ? 'is-selected' : ''} ${status ? `is-${status}` : ''}`}
    onClick={onClick}
    disabled={disabled}
  >
    <div className="super-audit-row__title">{title}</div>
    {subtitle && <div className="super-audit-row__subtitle">{subtitle}</div>}
    {badge && <span className="super-audit-row__badge">{badge}</span>}
    {status === 'done' && <span className="super-audit-row__check">✓</span>}
    {status === 'pending' && <span className="super-audit-row__spinner">…</span>}
    {status === 'error' && <span className="super-audit-row__error">!</span>}
  </button>
);

const _verifyBadge = (kind) => ({
  history_focus: 'History',
  soft_remove: 'Soft remove',
  unrecognized_focus: 'Custom',
  partial_coverage: 'Partial',
}[kind] || null);
```

**Step 2.** Add CSS for the rail. Mirror the existing modal sidebar styles (`.super-cpas-...`). Tones:
- `--add` accent: indigo (`#6366f1`)
- `--verify` accent: amber (`#d97706`)
- `--remove` accent: rose (`#e11d48`)

Counts render as a small pill badge next to the title.

**Step 3.** Commit:
```bash
git add content/modules/care-plan-stamp/components/AuditFocusList.jsx content/css/
git commit -m "feat(care-plan-audit): AuditFocusList left-rail w/ collapsible sections"
```

---

## Task 6: Build `AddBucketPane.jsx` (right pane for `toAdd`)

**Files:**
- Create: `content/modules/care-plan-stamp/components/AddBucketPane.jsx`
- Reference: `CarePlanStampModal.jsx` focus-detail rendering (`composedFocuses[activeIdx]` block — search for "Focus" / "GOALS" / "INTERVENTIONS" headers)

**Design:** Renders the same focus-detail card the existing modal already uses for auto-pop focuses — just one item at a time. Action button at the bottom of the pane: `[Stamp] [Skip]`.

**Step 1.** Read `CarePlanStampModal.jsx:400-700` (the right-pane block) to identify the reusable focus-rendering helper. If it's inlined, factor it out into `components/FocusCard.jsx` first (separate commit) — both panes will use it.

**Step 2.** Implement:

```jsx
import { h } from 'preact';
import { FocusCard } from './FocusCard.jsx';  // factored out from CarePlanStampModal

/**
 * Right-pane content for one selected `toAdd` item.
 *
 * Renders the proposed focus (same FocusCard shape used in Initial Admit mode)
 * plus a reason banner + action row at the bottom.
 */
export const AddBucketPane = ({
  item,              // audit.toAdd[idx]
  focusState,        // local edit state (skipped, focusText, goals, tokenValues, etc.)
  onPatch,           // (patch) => void
  onStamp,           // () => Promise<void>
  onSkip,            // () => void
  stamping,          // boolean
  dropdowns,
}) => {
  return (
    <div className="super-audit-pane">
      <ReasonBanner tone="add" reason={item.reason} signal={item.coverageSignal} />
      <FocusCard
        focus={item.focus}
        focusState={focusState}
        onPatch={onPatch}
        dropdowns={dropdowns}
      />
      <div className="super-audit-pane__actions">
        <button className="super-btn super-btn--secondary" onClick={onSkip} disabled={stamping}>Skip</button>
        <button className="super-btn super-btn--primary" onClick={onStamp} disabled={stamping}>Stamp focus</button>
      </div>
    </div>
  );
};

const ReasonBanner = ({ tone, reason, signal }) => (
  <div className={`super-audit-reason super-audit-reason--${tone}`}>
    <div className="super-audit-reason__label">Why this is suggested</div>
    <div className="super-audit-reason__text">{reason}</div>
    {signal === 'ai_says_missing' && <span className="super-audit-reason__signal is-red">AI: gap</span>}
    {signal === 'ai_says_partial' && <span className="super-audit-reason__signal is-amber">AI: partial</span>}
  </div>
);
```

**Step 3.** [If factoring needed] Pull the focus-detail block out of `CarePlanStampModal.jsx` into `components/FocusCard.jsx`. Replace the inline JSX in the existing modal with `<FocusCard ... />`. Verify Initial Admit mode still works identically — manual smoke test before continuing.

**Step 4.** Commit (two commits if you factored FocusCard separately):
```bash
git add content/modules/care-plan-stamp/components/FocusCard.jsx content/modules/care-plan-stamp/CarePlanStampModal.jsx
git commit -m "refactor(care-plan-stamp): extract FocusCard for reuse"

git add content/modules/care-plan-stamp/components/AddBucketPane.jsx
git commit -m "feat(care-plan-audit): AddBucketPane (stamp from audit)"
```

---

## Task 7: Build `RemoveBucketPane.jsx`

**Files:**
- Create: `content/modules/care-plan-stamp/components/RemoveBucketPane.jsx`

```jsx
import { h } from 'preact';

/**
 * Right-pane content for one selected `toRemove` item.
 *
 * Shows the focus text, the cessation evidence, and a single primary action:
 * confirm + resolve in PCC.
 */
export const RemoveBucketPane = ({
  item,            // audit.toRemove[idx]
  onResolve,       // () => Promise<void>
  status,          // 'pending' | 'done' | 'error' | undefined
  errorMessage,    // string | undefined
}) => {
  return (
    <div className="super-audit-pane">
      <ReasonBanner tone="remove" reason={item.reason} />
      <div className="super-audit-removecard">
        <div className="super-audit-removecard__label">Focus to resolve</div>
        <div className="super-audit-removecard__text">{item.focusText}</div>
      </div>
      <div className="super-audit-pane__actions">
        {status === 'done' ? (
          <div className="super-audit-done">✓ Resolved in PCC</div>
        ) : (
          <>
            {status === 'error' && <div className="super-audit-error">{errorMessage || 'Resolve failed. Try again.'}</div>}
            <button
              className="super-btn super-btn--danger"
              onClick={onResolve}
              disabled={status === 'pending'}
            >
              {status === 'pending' ? 'Resolving…' : 'Confirm & resolve'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const ReasonBanner = ({ tone, reason }) => (
  <div className={`super-audit-reason super-audit-reason--${tone}`}>
    <div className="super-audit-reason__label">Cessation evidence</div>
    <div className="super-audit-reason__text">{reason}</div>
  </div>
);
```

**Step 2. Commit:**
```bash
git add content/modules/care-plan-stamp/components/RemoveBucketPane.jsx
git commit -m "feat(care-plan-audit): RemoveBucketPane (resolve focus in PCC)"
```

---

## Task 8: Build `VerifyBucketPane.jsx`

**Files:**
- Create: `content/modules/care-plan-stamp/components/VerifyBucketPane.jsx`

```jsx
import { h } from 'preact';

/**
 * Right-pane content for one selected `toCheck` item.
 *
 * Renders kind-specific UI:
 *   - history_focus     → "Verify still relevant" + [Resolve] [Keep]
 *   - soft_remove       → "Umbrella applies" + [Resolve] [Keep]
 *   - partial_coverage  → "AI flagged dx as partially covered" + [Mark verified] [Add new focus]
 *   - unrecognized_focus→ "Custom nurse focus — informational" + [Keep] only
 *
 * v1: judgment actions are local-state only (no persistence). See plan §6.
 */
export const VerifyBucketPane = ({
  item,             // audit.toCheck[idx]
  localState,       // 'pending' | 'verified' | 'kept' | undefined
  onMarkVerified,   // () => void
  onKeep,           // () => void
  onResolve,        // () => Promise<void>     — only used for soft_remove / history_focus
  resolveStatus,    // 'pending' | 'done' | 'error' | undefined — only when resolve initiated
}) => {
  const config = _kindConfig(item.kind);
  return (
    <div className="super-audit-pane">
      <ReasonBanner tone="verify" label={config.label} reason={item.reason} />
      <div className="super-audit-verifycard">
        <div className="super-audit-verifycard__label">{config.detailLabel}</div>
        <div className="super-audit-verifycard__text">{item.detail}</div>
      </div>
      <div className="super-audit-pane__actions">
        {_renderActions(item, config, { localState, onMarkVerified, onKeep, onResolve, resolveStatus })}
      </div>
    </div>
  );
};

const _kindConfig = (kind) => ({
  history_focus:      { label: 'Historical framing', detailLabel: 'Focus' },
  soft_remove:        { label: 'Soft remove candidate', detailLabel: 'Focus' },
  partial_coverage:   { label: 'Partial coverage', detailLabel: 'Diagnosis' },
  unrecognized_focus: { label: 'Custom focus', detailLabel: 'Focus' },
}[kind] || { label: 'Verify', detailLabel: 'Detail' });

const _renderActions = (item, config, { localState, onMarkVerified, onKeep, onResolve, resolveStatus }) => {
  if (localState === 'verified') return <div className="super-audit-done">✓ Marked verified (this session)</div>;
  if (localState === 'kept') return <div className="super-audit-done super-audit-done--neutral">Kept on plan</div>;

  if (item.kind === 'unrecognized_focus') {
    return <button className="super-btn super-btn--secondary" onClick={onKeep}>Keep on plan</button>;
  }
  if (item.kind === 'partial_coverage') {
    return (
      <>
        <button className="super-btn super-btn--secondary" onClick={onMarkVerified}>Mark verified</button>
        {/* "Add new focus" is forward-looking; v1 just verifies. Backend will */}
        {/* route partial-coverage items into Add bucket in a later release. */}
      </>
    );
  }
  // history_focus or soft_remove
  return (
    <>
      <button className="super-btn super-btn--secondary" onClick={onKeep}>Keep</button>
      <button
        className="super-btn super-btn--danger"
        onClick={onResolve}
        disabled={resolveStatus === 'pending'}
      >
        {resolveStatus === 'pending' ? 'Resolving…' : 'Resolve in PCC'}
      </button>
    </>
  );
};

const ReasonBanner = ({ tone, label, reason }) => (
  <div className={`super-audit-reason super-audit-reason--${tone}`}>
    <div className="super-audit-reason__label">{label}</div>
    <div className="super-audit-reason__text">{reason}</div>
  </div>
);
```

**Step 2. Commit:**
```bash
git add content/modules/care-plan-stamp/components/VerifyBucketPane.jsx
git commit -m "feat(care-plan-audit): VerifyBucketPane (kind-specific judgment UI)"
```

---

## Task 9: Wire panes into `CarePlanStampModal` for `mode === 'comprehensive'`

**Files:**
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx`

**Step 1.** Add state for audit-mode interactions:

```javascript
const [audit, setAudit] = useState(null);
const [auditSelected, setAuditSelected] = useState({ bucket: 'add', idx: 0 });
const [auditFocusStates, setAuditFocusStates] = useState({});  // keyed by `${bucket}:${idx}` for add items
const [resolveStatus, setResolveStatus] = useState({});         // { [focusId]: 'pending'|'done'|'error' }
const [verifyLocal, setVerifyLocal] = useState({});             // { [`${idx}`]: 'verified'|'kept' }
const [stampedAddItems, setStampedAddItems] = useState(new Set()); // ruleIds of toAdd items already stamped
```

**Step 2.** In the existing fetch effect, branch on `mode`:

```javascript
if (mode === 'comprehensive') {
  const auditResp = await window.CarePlanAuditAPI.fetchAudit({
    patientId, facilityName, orgSlug, orgDropdowns,
  });
  if (cancelled) return;
  setAudit(auditResp.audit);
  // Default selection: first Add item, or Verify, or Remove (whichever exists)
  const firstBucket = auditResp.audit.toAdd.length ? 'add'
    : auditResp.audit.toCheck.length ? 'verify'
    : auditResp.audit.toRemove.length ? 'remove' : 'add';
  setAuditSelected({ bucket: firstBucket, idx: 0 });
  setStage('ready');
} else {
  /* existing /auto-pop fetch path — unchanged */
}
```

**Step 3.** Conditional render in the modal body: when `mode === 'comprehensive'`, render `<AuditFocusList />` in the left column and the appropriate pane in the right column based on `auditSelected.bucket`.

```jsx
{mode === 'comprehensive' ? (
  <div className="super-cpas-body">
    <AuditFocusList
      audit={audit}
      selected={auditSelected}
      onSelect={setAuditSelected}
      stamping={stage === 'stamping'}
      resolveStatus={resolveStatus}
    />
    <div className="super-cpas-pane">
      {auditSelected.bucket === 'add' && audit.toAdd[auditSelected.idx] && (
        <AddBucketPane
          item={audit.toAdd[auditSelected.idx]}
          focusState={auditFocusStates[`add:${auditSelected.idx}`] || _emptyFocusState()}
          onPatch={(p) => _patchAuditFocus('add', auditSelected.idx, p)}
          onStamp={() => _stampAuditAddItem(auditSelected.idx)}
          onSkip={() => _skipAuditAddItem(auditSelected.idx)}
          stamping={stage === 'stamping'}
          dropdowns={dropdowns}
        />
      )}
      {auditSelected.bucket === 'remove' && audit.toRemove[auditSelected.idx] && (
        <RemoveBucketPane
          item={audit.toRemove[auditSelected.idx]}
          status={resolveStatus[audit.toRemove[auditSelected.idx].focusId]}
          onResolve={() => _resolveAuditItem(audit.toRemove[auditSelected.idx])}
        />
      )}
      {auditSelected.bucket === 'verify' && audit.toCheck[auditSelected.idx] && (
        <VerifyBucketPane
          item={audit.toCheck[auditSelected.idx]}
          localState={verifyLocal[auditSelected.idx]}
          onMarkVerified={() => setVerifyLocal((v) => ({ ...v, [auditSelected.idx]: 'verified' }))}
          onKeep={() => setVerifyLocal((v) => ({ ...v, [auditSelected.idx]: 'kept' }))}
          onResolve={() => _resolveAuditItem(audit.toCheck[auditSelected.idx])}
          resolveStatus={resolveStatus[audit.toCheck[auditSelected.idx].focusId]}
        />
      )}
    </div>
  </div>
) : (
  /* existing Initial Admit body — unchanged */
)}
```

**Step 4.** Implement the action handlers (sketch — flesh out during impl):

```javascript
const _stampAuditAddItem = async (idx) => {
  const item = audit.toAdd[idx];
  if (!item?.focus) return;
  setStage('stamping');
  const focusState = auditFocusStates[`add:${idx}`] || _emptyFocusState();
  const composed = _composeFocus(item.focus, focusState);
  await window.CarePlanStamp.stampFocuses({
    patientId, careplanId, miniToken,
    focuses: [composed],
    // ... rest of args mirroring the Initial-mode stamp call
  });
  setStampedAddItems((s) => new Set([...s, item.ruleId]));
  setStage('ready');
  window.SuperAnalytics?.track?.('care_plan_audit_item_stamped', { rule_id: item.ruleId });
};

const _resolveAuditItem = async (item) => {
  if (!item.pccFocusId) {
    setResolveStatus((s) => ({ ...s, [item.focusId]: 'error' }));
    return;
  }
  setResolveStatus((s) => ({ ...s, [item.focusId]: 'pending' }));
  try {
    await window.CarePlanResolveAPI.resolveFocus({
      patientId, careplanId, miniToken,
      pccFocusId: item.pccFocusId,
      pccFocusStdItemId: item.pccFocusStdItemId,
    });
    setResolveStatus((s) => ({ ...s, [item.focusId]: 'done' }));
    window.SuperAnalytics?.track?.('care_plan_audit_item_resolved', { focus_id: item.focusId });
  } catch (e) {
    setResolveStatus((s) => ({ ...s, [item.focusId]: 'error' }));
  }
};

const _skipAuditAddItem = async (idx) => {
  const item = audit.toAdd[idx];
  await window.CarePlanStampAPI.persistSkip({
    patientId, orgSlug, facilityName, ruleId: item.ruleId, isSkipping: true,
  });
  // Optimistically remove from local audit state, advance selection
  setAudit((a) => ({ ...a, toAdd: a.toAdd.filter((_, i) => i !== idx) }));
  setAuditSelected({ bucket: 'add', idx: Math.max(0, idx - 1) });
};
```

**Step 5. Manual verification:**
- Open a patient with focuses → Comprehensive defaults.
- Verify left rail shows three sections with correct counts.
- Click items in each section → right pane updates.
- Stamp an Add item → focus appears in PCC.
- Resolve a Remove item → focus marked resolved in PCC.
- Verify a Verify item → local "verified" badge appears.

**Step 6. Commit:**
```bash
git add content/modules/care-plan-stamp/CarePlanStampModal.jsx
git commit -m "feat(care-plan-audit): wire comprehensive-mode panes into modal"
```

---

## Task 10: Contextual bottom CTA + section auto-advance

**Files:**
- Modify: `content/modules/care-plan-stamp/components/AuditFocusList.jsx` (sticky footer slot)
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx`

**Step 1.** In the modal, compute a primary action based on the active bucket:

| Bucket | CTA label | Action |
|---|---|---|
| add | "Add all N to care plan" | Loop stamp over unstamped add items |
| remove | "Resolve all N" | Loop resolve over unresolved remove items |
| verify | "Mark all N verified" | Local-state mark |

**Step 2.** Render at the bottom of the left rail (sticky), mirroring the existing Initial-mode "Add all 4 to care plan" CTA.

**Step 3.** After each individual action (stamp/resolve/verify), auto-advance selection to next un-actioned item in the same bucket. If bucket is empty, advance to next non-empty bucket.

**Step 4. Commit:**
```bash
git add content/modules/care-plan-stamp/
git commit -m "feat(care-plan-audit): contextual bulk CTA + auto-advance"
```

---

# Phase 4 — Banner on Care Plan Detail page

## Task 11: Inject audit banner

**Files:**
- Create: `content/modules/care-plan-stamp/audit-banner.js`
- Modify: `content/content.js`

**Design:** Slim single-line strip injected above PCC's action row (where the "AI Care Plan" button lives). Renders counts from a lazy audit fetch. Dismissible per session (sessionStorage). Hidden if all counts are 0.

```javascript
// content/modules/care-plan-stamp/audit-banner.js
const BANNER_ID = 'super-audit-banner';
const DISMISS_KEY = 'super_audit_banner_dismissed';  // sessionStorage, per-patient

function _isCarePlanDetailPage() {
  return window.location.href.includes('careplandetail_rev.jsp');
}

function _resolvePatientId() {
  return new URLSearchParams(window.location.search).get('ESOLclientid')
    || document.querySelector('input[name="ESOLclientid"]')?.value
    || null;
}

function _dismissKeyFor(patientId) {
  return `${DISMISS_KEY}:${patientId}`;
}

async function _renderBanner() {
  if (!_isCarePlanDetailPage()) return;
  if (document.getElementById(BANNER_ID)) return;

  const patientId = _resolvePatientId();
  if (!patientId) return;
  if (sessionStorage.getItem(_dismissKeyFor(patientId))) return;

  // Find injection target: the action row containing "New Custom Focus" / our button.
  const newCustomBtn = document.querySelector('[id="idNewCustomFocusBtn"]');
  if (!newCustomBtn) return;
  const actionRow = newCustomBtn.closest('div, td, tr') || newCustomBtn.parentElement;
  if (!actionRow) return;

  // Insert placeholder banner so something shows during fetch.
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'super-audit-banner is-loading';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">Loading care plan audit…</span>
  `;
  actionRow.parentNode.insertBefore(banner, actionRow);

  // Fetch audit. Reuse the same modal-mount path for [Review →].
  try {
    const facilityName = typeof getChatFacilityInfo === 'function' ? (getChatFacilityInfo() || '') : '';
    const orgSlug = typeof getOrg === 'function' ? (getOrg()?.org || '') : '';
    const resp = await window.CarePlanAuditAPI.fetchAudit({ patientId, facilityName, orgSlug });
    _paint(banner, resp.audit, { patientId, facilityName, orgSlug });
  } catch (e) {
    banner.className = 'super-audit-banner is-error';
    banner.innerHTML = `<span class="super-audit-banner__icon">⚠</span> <span>Audit failed. <a href="#" id="super-audit-retry">Retry</a></span>`;
    banner.querySelector('#super-audit-retry')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      banner.remove();
      _renderBanner();
    });
  }
}

function _paint(banner, audit, ctx) {
  const a = audit.toAdd.length, c = audit.toCheck.length, r = audit.toRemove.length;
  const total = a + c + r;

  if (total === 0) {
    banner.className = 'super-audit-banner is-clean';
    banner.innerHTML = `<span class="super-audit-banner__icon">✓</span> <span>SuperLTC audit: care plan looks complete.</span>`;
    return;
  }

  banner.className = 'super-audit-banner is-actionable';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">
      SuperLTC Audit ·
      ${a ? `<strong>${a}</strong> to add` : ''}${a && (c || r) ? ' · ' : ''}
      ${r ? `<strong>${r}</strong> to remove` : ''}${r && c ? ' · ' : ''}
      ${c ? `<strong>${c}</strong> to verify` : ''}
    </span>
    <button type="button" class="super-audit-banner__cta">Review →</button>
    <button type="button" class="super-audit-banner__dismiss" aria-label="Dismiss">×</button>
  `;
  banner.querySelector('.super-audit-banner__cta').addEventListener('click', () => _openWizardFromBanner(ctx, audit));
  banner.querySelector('.super-audit-banner__dismiss').addEventListener('click', () => {
    sessionStorage.setItem(_dismissKeyFor(ctx.patientId), '1');
    banner.remove();
  });
}

async function _openWizardFromBanner({ patientId, facilityName, orgSlug }, audit) {
  // Re-use the existing modal open path with mode forced to 'comprehensive'.
  const [{ render, h }, { CarePlanStampModal }] = await Promise.all([
    import('preact'),
    import('./CarePlanStampModal.jsx'),
  ]);
  const overlay = document.createElement('div');
  overlay.id = 'super-cpas-overlay';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const handleClose = () => { render(null, overlay); overlay.remove(); document.body.style.overflow = ''; };
  render(
    h(CarePlanStampModal, {
      patientId, facilityName, orgSlug,
      patientName: '',
      defaultMode: 'comprehensive',
      onClose: handleClose,
    }),
    overlay
  );
  window.SuperAnalytics?.track?.('care_plan_audit_opened_from_banner', { patient_id: patientId });
}

function _initWithPolling() {
  _renderBanner();
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (document.getElementById(BANNER_ID)) { clearInterval(id); return; }
    _renderBanner();
    if (tries >= 10) clearInterval(id);
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initWithPolling);
} else {
  _initWithPolling();
}

let _lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== _lastUrl) {
    _lastUrl = window.location.href;
    if (_isCarePlanDetailPage()) _initWithPolling();
  }
}).observe(document.body, { childList: true, subtree: true });
```

**Step 2.** CSS:
```css
.super-audit-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; margin: 6px 0;
  border-radius: 8px; font-size: 13px;
  background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3;
}
.super-audit-banner.is-clean { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.super-audit-banner.is-error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.super-audit-banner__icon { font-size: 16px; }
.super-audit-banner__text { flex: 1; }
.super-audit-banner__cta {
  background: #4338ca; color: #fff; border: 0; padding: 5px 12px;
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.super-audit-banner__dismiss {
  background: transparent; border: 0; color: inherit; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 0 4px; opacity: 0.5;
}
.super-audit-banner__dismiss:hover { opacity: 1; }
```

**Step 3.** Import in `content/content.js` after `inject-button.js`:
```javascript
import './modules/care-plan-stamp/audit-banner.js';
```

**Step 4. Manual verify:**
- Care Plan Detail page → banner appears with real counts.
- Click "Review →" → modal opens in Comprehensive mode.
- Click × → banner gone; reload page → still gone (sessionStorage).
- Different patient → banner reappears (per-patient dismiss).
- Patient with clean plan → green "✓ looks complete" variant.

**Step 5. Commit:**
```bash
git add content/modules/care-plan-stamp/audit-banner.js content/content.js content/css/
git commit -m "feat(care-plan-audit): banner on care plan detail page"
```

---

# Phase 5 — Care Plan Review page (view_review.jsp)

## Task 12: Inject AI Care Plan button + banner on `view_review.jsp`

**Files:**
- Create: `content/modules/care-plan-stamp/audit-review-button.js`
- Modify: `content/content.js`

**Design:** On `view_review.jsp` (per-department review page), inject:
1. The same `🔍 Run AI Care Plan Audit` banner above the per-department table (uses the same banner component logic from Task 11, but adapted for this page's DOM).
2. Force `defaultMode: 'comprehensive'` (this page is always a review of an established plan).
3. Global scope — do NOT filter audit by department for v1 (Drew's call).

```javascript
// content/modules/care-plan-stamp/audit-review-button.js
const BTN_ID = 'super-audit-review-btn';
const BANNER_ID = 'super-audit-review-banner';

function _isReviewPage() {
  return window.location.href.includes('view_review.jsp');
}

function _resolvePatientId() {
  const m = window.location.search.match(/ESOLclientid=(\d+)/);
  return m ? m[1] : null;
}

async function _render() {
  if (!_isReviewPage()) return;
  if (document.getElementById(BANNER_ID)) return;

  const patientId = _resolvePatientId();
  if (!patientId) return;

  // Inject above the per-department table. Anchor: the <table> with the
  // "Department / Assigned To / Reviewed By / Completed Date" header.
  // Fallback: prepend to <body> if anchor not found.
  const heading = Array.from(document.querySelectorAll('th, td')).find(el => /Department/i.test(el.textContent.trim()));
  const table = heading?.closest('table');
  const anchor = table || document.querySelector('.content, body');
  if (!anchor) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'super-audit-banner is-loading';
  banner.innerHTML = `<span class="super-audit-banner__icon">🔍</span> <span>Loading care plan audit…</span>`;
  anchor.parentNode.insertBefore(banner, anchor);

  try {
    const facilityName = typeof getChatFacilityInfo === 'function' ? (getChatFacilityInfo() || '') : '';
    const orgSlug = typeof getOrg === 'function' ? (getOrg()?.org || '') : '';
    const resp = await window.CarePlanAuditAPI.fetchAudit({ patientId, facilityName, orgSlug });
    const a = resp.audit.toAdd.length, c = resp.audit.toCheck.length, r = resp.audit.toRemove.length;
    const total = a + c + r;

    if (total === 0) {
      banner.className = 'super-audit-banner is-clean';
      banner.innerHTML = `<span class="super-audit-banner__icon">✓</span> <span>SuperLTC audit: plan looks complete.</span>`;
      return;
    }

    banner.className = 'super-audit-banner is-actionable';
    banner.innerHTML = `
      <span class="super-audit-banner__icon">🔍</span>
      <span class="super-audit-banner__text">
        SuperLTC Audit ·
        ${a ? `<strong>${a}</strong> to add` : ''}${a && (c || r) ? ' · ' : ''}
        ${r ? `<strong>${r}</strong> to remove` : ''}${r && c ? ' · ' : ''}
        ${c ? `<strong>${c}</strong> to verify` : ''}
      </span>
      <button type="button" class="super-audit-banner__cta" id="${BTN_ID}">Open audit →</button>
    `;
    banner.querySelector(`#${BTN_ID}`).addEventListener('click', () => _openWizard({ patientId, facilityName, orgSlug }));
  } catch (e) {
    banner.className = 'super-audit-banner is-error';
    banner.innerHTML = `<span class="super-audit-banner__icon">⚠</span> <span>Audit failed.</span>`;
  }
}

async function _openWizard({ patientId, facilityName, orgSlug }) {
  const [{ render, h }, { CarePlanStampModal }] = await Promise.all([
    import('preact'),
    import('./CarePlanStampModal.jsx'),
  ]);
  const overlay = document.createElement('div');
  overlay.id = 'super-cpas-overlay';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const handleClose = () => { render(null, overlay); overlay.remove(); document.body.style.overflow = ''; };
  render(
    h(CarePlanStampModal, {
      patientId, facilityName, orgSlug,
      patientName: '',
      defaultMode: 'comprehensive',
      onClose: handleClose,
    }),
    overlay
  );
  window.SuperAnalytics?.track?.('care_plan_audit_opened_from_review_page', { patient_id: patientId });
}

function _initWithPolling() {
  _render();
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (document.getElementById(BANNER_ID)) { clearInterval(id); return; }
    _render();
    if (tries >= 10) clearInterval(id);
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initWithPolling);
} else {
  _initWithPolling();
}

let _lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== _lastUrl) {
    _lastUrl = window.location.href;
    if (_isReviewPage()) _initWithPolling();
  }
}).observe(document.body, { childList: true, subtree: true });
```

**Step 2.** Import in `content/content.js`:
```javascript
import './modules/care-plan-stamp/audit-review-button.js';
```

**Step 3. Manual verify:**
- Navigate to a care plan review page → banner appears.
- Click "Open audit →" → modal opens in Comprehensive mode with the same patient's audit.

**Step 4. Commit:**
```bash
git add content/modules/care-plan-stamp/audit-review-button.js content/content.js
git commit -m "feat(care-plan-audit): banner + wizard launch on view_review page"
```

---

# Phase 6 — Polish

## Task 13: Telemetry events

Confirm these `window.SuperAnalytics?.track?.()` calls are present:

- `care_plan_audit_opened_from_banner` (banner CTA)
- `care_plan_audit_opened_from_review_page` (review page CTA)
- `care_plan_audit_opened_from_button` (AI Care Plan button when defaulting to Comprehensive — add in `inject-button.js`)
- `care_plan_audit_modal_opened` (modal mount in Comprehensive mode — add to the fetch effect)
- `care_plan_audit_item_stamped` (Add bucket stamp)
- `care_plan_audit_item_resolved` (Remove or Verify→Resolve)
- `care_plan_audit_item_verified` (Verify → mark verified locally)
- `care_plan_audit_item_skipped` (Add → skip)
- `care_plan_audit_scope_toggled` (ScopeToggle interaction)

Each event includes `patient_id` and event-specific fields (`rule_id`, `focus_id`, `kind`, etc.).

**Commit:**
```bash
git add content/modules/care-plan-stamp/
git commit -m "feat(care-plan-audit): telemetry events"
```

---

## Task 14: End-to-end smoke test + Drew handoff

Run through the test plan from §7 of Drew's handoff:

1. Open a Bethesda patient with stale focuses (Drew has spot-check patients — ping him).
2. Banner appears on Care Plan Detail page with non-zero counts.
3. Click Review → modal opens in Comprehensive mode.
4. Add tab → stamp one focus → confirm PCC accepts → count decrements.
5. Remove tab → confirm-resolve → confirm PCC marks resolved → count decrements.
6. Verify tab → click each `kind` → confirm UI per kind.
7. Toggle to Initial Admit → confirms existing auto-pop renders.
8. Toggle back to Comprehensive → audit re-renders.
9. Navigate to `view_review.jsp` → banner appears, wizard launches.

Then ping Drew:
- Confirm `pcc-resolve.js` field set is correct (he can spot-check from server logs).
- Ask whether Verify-bucket actions need a persistence endpoint after seeing nurse usage.

---

## Out-of-scope (do not implement)

- Orders page integration — Drew explicitly excluded.
- Department-sliced audit on review page — global only for v1.
- Standalone Care Plan Review dashboard (Drew's "Surface D") — separate future doc.
- Persisting Verify-bucket judgments — local-state only for v1.

---

## Risk notes

1. **`pcc-resolve.js` field set is guessed.** The exact PCC form for resolving a focus must be captured from a real Network tab POST before this code can be trusted. Do this in Task 2 Step 4 — do not skip.
2. **Audit endpoint latency.** The audit doesn't auto-refresh coverage check. If a patient has never had `/care-plan/check` run, the audit returns library-only (`hasCoverageCheckData: false`). Surface this in the banner subtitle? Defer until we see how often this happens in practice.
3. **Modal complexity creep.** `CarePlanStampModal.jsx` is already 2,248 lines. Adding Comprehensive mode could push it to 3,000+. Factor `FocusCard` out (Task 6 Step 3) — if the file grows past ~2,800, do a follow-up commit to extract the Initial-mode body into its own component too.
4. **Banner positioning.** PCC's Care Plan Detail page DOM is legacy table layout. Verify the banner injection anchor (`idNewCustomFocusBtn`'s parent) doesn't break under different PCC themes or facility customizations. The polling+MutationObserver pattern should catch most cases.

---

## Phasing summary

| Phase | Tasks | Output |
|---|---|---|
| 1 | 1-2 | API client + PCC resolve helper |
| 2 | 3-4 | Button rename + ScopeToggle wired |
| 3 | 5-10 | Comprehensive mode left rail + three panes + actions |
| 4 | 11 | Banner on Care Plan Detail page |
| 5 | 12 | Banner + wizard launch on review page |
| 6 | 13-14 | Telemetry + smoke test |

Each phase ends in a working state — extension can ship after Phase 4 if Phase 5 slips. Estimated effort: ~1 week focused, ~2 weeks interleaved.
