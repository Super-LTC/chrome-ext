# Guided Demo Tour Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A self-serve, click-through guided product tour layered on the existing demo — a prospect opens a hosted link and is walked, step by step with narration, across the multi-page demo (ICD-10 → Section I → physician query + phone → Command Center → facility features), ending on a value summary + CTA.

**Architecture:** A new Preact `GuidedTour` "step-runner" mounts on each captured demo page. It reads a declarative tour script and drives the proven **driver.js** spotlight/tooltip library. Progress lives in `sessionStorage`, so the tour survives page navigations and resumes at the right step. The runner performs tedious transitions (open overlays, navigate, scroll) and waits for the prospect's real clicks on the "aha" moments.

**Tech Stack:** Preact + Vite (existing demo build), driver.js (new dep) for spotlight visuals, sessionStorage for cross-page resume, Playwright MCP for verification.

**Design doc:** `docs/plans/2026-06-19-guided-demo-tour-design.md`

**Key facts (verified):**
- Demo pages are separate documents. Captured PCC pages (`mds-section-i.html`, etc.) load the BUILT bundle `pcc-demo-entry.built.js` (mounted by `demo/pcc-demo-entry.jsx` → `PCCDemoApp`). The `medical-diagnosis.html` / `index.html` pages load `demo-entry.built.js` (`demo/demo-entry.jsx` → `DemoApp`). **After ANY edit you MUST run `npm run demo:build`** — dev-server reload alone won't update captured pages.
- Dev server: `npm run demo -- --port 5174 --no-open`, then open `http://localhost:5174/demo/<page>.html`.
- ICD-10 surface lives on `medical-diagnosis.html` (DemoApp): injected table columns `.super-meddiag-th--cp`, `.super-meddiag-chip--cp`, `.super-meddiag-th--q`, `.super-meddiag-chip--q` on `#meddiaglisting`; FAB opens the ICD-10 Viewer (`.icd10-viewer-modal`, `.icd10-viewer__sidebar`, `.icd10-viewer__evidence-panel`, `.icd10-viewer__estimate-btn`, `.icd10-viewer__push-btn`).
- Section I badges (PCCDemoApp): `.super-badge[data-mds-item="I0200"]` etc. Popover: `.cc-pop`, actions `.sid__btn--agree`, `.sid__btn--dismiss`, `.sid__btn--primary` (Query Physician). Badge click dispatches `demo:badge-click`. Toasts via `window.dispatchEvent(new CustomEvent('demo:toast', {detail:{type,message}}))`.
- FAB overlays in PCCDemoApp are React state (`overlay`): `'commandCenter' | 'qm' | '24hr' | 'chat' | 'coverage' | 'feedback'`. The query modal is `window.QuerySendModal.show(...)`.

---

## Phase 0 — Setup

### Task 0.1: Add driver.js dependency

**Files:**
- Modify: `package.json`

**Step 1:** Install driver.js.
Run: `npm install driver.js`
Expected: `driver.js` appears under `dependencies` in `package.json`, no errors.

**Step 2:** Verify it resolves.
Run: `node -e "require.resolve('driver.js'); console.log('ok')"`
Expected: prints `ok`.

**Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore(demo): add driver.js for guided tour"
```

### Task 0.2: Create tour folder scaffold

**Files:**
- Create: `demo/tour/tour-state.js`

**Step 1:** Create the shared state module (single source for sessionStorage + page detection).

```js
// demo/tour/tour-state.js
// Cross-page tour state. The demo is several separate documents, so progress
// must persist in sessionStorage and resume on each page load.
const KEY = 'superTour';

const DEFAULT = { active: false, index: 0, hud: { ntaPoints: 0, dollarsPerDay: 0 }, doctorName: 'Dr. Patel' };

export function getTourState() {
  try { return { ...DEFAULT, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}

export function setTourState(patch) {
  const next = { ...getTourState(), ...patch };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function resetTour() { sessionStorage.removeItem(KEY); }

// Stable page id from the current document filename.
export function currentPageId() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace('.html', '');
}
```

**Step 2: Commit**
```bash
git add demo/tour/tour-state.js
git commit -m "feat(demo): tour cross-page state module"
```

---

## Phase 1 — Tour engine core

### Task 1.1: driver.js wrapper + step-runner skeleton

**Files:**
- Create: `demo/tour/tour-runner.jsx`
- Create: `demo/tour/tour.css`

**Step 1:** Create `tour.css` with a minimal branded driver.js theme override (full polish comes in Phase 8). Include the `.super-tour-*` namespacing.

```css
/* demo/tour/tour.css */
.driver-popover.super-tour {
  background: #fff; border-radius: 14px; padding: 0;
  box-shadow: 0 24px 60px rgba(49, 46, 129, 0.28); max-width: 360px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.driver-popover.super-tour .driver-popover-title { font-size: 15px; font-weight: 700; color: #1e1b4b; }
.driver-popover.super-tour .driver-popover-description { font-size: 13px; color: #374151; line-height: 1.5; }
.driver-popover.super-tour .driver-popover-progress-text { color: #6b7280; font-size: 11px; }
.driver-popover.super-tour .driver-popover-navigation-btns button {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; border: none;
  border-radius: 8px; padding: 7px 14px; font-weight: 600; text-shadow: none;
}
/* pulse ring on the spotlighted target */
@keyframes superTourPulse { 0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); } 70% { box-shadow: 0 0 0 10px rgba(99,102,241,0); } 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); } }
.super-tour-pulse { animation: superTourPulse 1.6s ease-out infinite; border-radius: 6px; }
```

**Step 2:** Create `tour-runner.jsx` — the engine. It exposes `bootTour()` called by each demo entry. Uses driver.js for one highlight at a time, advances per the step's `advance` mode, navigates across pages, and resumes from `sessionStorage`.

```jsx
// demo/tour/tour-runner.jsx
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import { STEPS } from './tour-script.js';
import { getTourState, setTourState, resetTour, currentPageId } from './tour-state.js';

let drv = null;
let cleanupFns = [];

function clearStep() {
  cleanupFns.forEach((fn) => { try { fn(); } catch {} });
  cleanupFns = [];
  document.querySelectorAll('.super-tour-pulse').forEach((el) => el.classList.remove('super-tour-pulse'));
}

async function waitForSelector(selector, timeout = 8000) {
  if (!selector) return null;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

function goToIndex(index) {
  setTourState({ active: true, index });
  const step = STEPS[index];
  if (!step) { finishTour(); return; }
  if (step.page && step.page !== currentPageId()) {
    // Different page → persist and navigate; the new page resumes here.
    location.href = `${step.page}.html`;
    return;
  }
  renderStep(index);
}

async function renderStep(index) {
  clearStep();
  const step = STEPS[index];
  if (!step) { finishTour(); return; }

  if (typeof step.before === 'function') {
    try { await step.before(); } catch (e) { console.warn('[tour] before() failed', e); }
  }

  const el = await waitForSelector(step.selector);

  drv = driver({
    showProgress: true,
    progressText: `Step {{current}} of {{total}}`,
    popoverClass: 'super-tour',
    allowClose: false,
    overlayColor: 'rgba(17, 24, 39, 0.55)',
    steps: [{
      element: el || undefined,
      popover: {
        title: step.title,
        description: step.body,
        side: step.placement || 'bottom',
        showButtons: step.advance === 'next' ? ['next'] : [],
      },
    }],
  });
  drv.drive();

  if (el && step.advance === 'click') {
    el.classList.add('super-tour-pulse');
    const onClick = () => { el.removeEventListener('click', onClick, true); advance(); };
    // capture phase so we advance even if the app handles the click first
    el.addEventListener('click', onClick, true);
    cleanupFns.push(() => el.removeEventListener('click', onClick, true));
  } else if (step.advance === 'event' && step.event) {
    const onEvent = () => { window.removeEventListener(step.event, onEvent); advance(); };
    window.addEventListener(step.event, onEvent);
    cleanupFns.push(() => window.removeEventListener(step.event, onEvent));
  } else if (step.advance === 'next') {
    // driver.js Next button → poll for its destroy, or wire onNextClick
    drv.setConfig?.({ onNextClick: () => advance() });
  } else if (step.advance === 'auto') {
    const t = setTimeout(() => advance(), step.autoMs || 1600);
    cleanupFns.push(() => clearTimeout(t));
  }

  if (step.hud) setTourState({ hud: { ...getTourState().hud, ...step.hud } });
}

function advance() {
  clearStep();
  try { drv?.destroy(); } catch {}
  goToIndex(getTourState().index + 1);
}

function finishTour() {
  clearStep();
  try { drv?.destroy(); } catch {}
  // End card handled in Phase 8; for now just deactivate.
  setTourState({ active: false });
  window.dispatchEvent(new CustomEvent('tour:finished'));
}

export function startTour() { resetTour(); goToIndex(0); }
export function exitTour() { clearStep(); try { drv?.destroy(); } catch {}; resetTour(); window.dispatchEvent(new CustomEvent('tour:exited')); }

// Called by each demo entry on every page load.
export function bootTour() {
  const st = getTourState();
  const params = new URLSearchParams(location.search);
  if (!st.active && params.get('tour') === '1') { startTour(); return; }
  if (st.active) {
    // Resume — but only if the saved step belongs to this page (else navigate).
    goToIndex(st.index);
  }
}
```

**Step 3:** Create a stub `demo/tour/tour-script.js` so the import resolves (real steps in later phases).

```js
// demo/tour/tour-script.js
export const STEPS = [];
```

**Step 4:** Build.
Run: `npm run demo:build`
Expected: build succeeds, no import errors.

**Step 5: Commit**
```bash
git add demo/tour/tour-runner.jsx demo/tour/tour.css demo/tour/tour-script.js
git commit -m "feat(demo): guided-tour engine (driver.js wrapper + cross-page resume)"
```

### Task 1.2: Boot the tour from both demo entries

**Files:**
- Modify: `demo/pcc-demo-entry.jsx`
- Modify: `demo/demo-entry.jsx`

**Step 1:** In each entry, after the Preact app mounts, import and call `bootTour()`. Add near the end of each entry's mount logic:

```js
import { bootTour } from './tour/tour-runner.jsx';
// ...after render(...):
setTimeout(() => { try { bootTour(); } catch (e) { console.warn('[tour] boot failed', e); } }, 400);
```
(The 400ms delay lets the demo's own overlays/badges inject first.)

**Step 2:** Build.
Run: `npm run demo:build`
Expected: success.

**Step 3:** Manual/Playwright check.
Open `http://localhost:5174/demo/mds-section-i.html?tour=1`.
Expected: tour starts at step 0 (once steps exist). For now, with empty STEPS, `bootTour` calls `startTour` → `goToIndex(0)` → `finishTour` (no error in console).

**Step 4: Commit**
```bash
git add demo/pcc-demo-entry.jsx demo/demo-entry.jsx
git commit -m "feat(demo): boot guided tour on each demo page"
```

### Task 1.3: Expose overlay openers for the runner

**Files:**
- Modify: `demo/components/PCCDemoApp.jsx`
- Modify: `demo/components/DemoApp.jsx`

**Step 1:** In `PCCDemoApp`, add a `useEffect` that exposes a window hook so the tour can open FAB overlays programmatically:

```jsx
useEffect(() => {
  window.__superDemoTour = {
    openOverlay: (name) => setOverlay(name),       // 'commandCenter' | 'qm' | '24hr' | 'coverage' | ...
    closeOverlay: () => { setOverlay(null); setPopoverItem(null); },
    openPopover: (code) => window.dispatchEvent(new CustomEvent('demo:badge-click', { detail: { code } })),
  };
  return () => { delete window.__superDemoTour; };
}, []);
```

**Step 2:** In `DemoApp`, add an analogous hook exposing whatever opens the ICD-10 Viewer (inspect DemoApp's overlay state for the ICD-10 viewer action and wire `openIcd10()` accordingly).

**Step 3:** Build + console-check that `window.__superDemoTour` exists on the Section I page.
Run: `npm run demo:build`; in browser console: `typeof window.__superDemoTour.openOverlay` → `"function"`.

**Step 4: Commit**
```bash
git add demo/components/PCCDemoApp.jsx demo/components/DemoApp.jsx
git commit -m "feat(demo): expose overlay openers for guided tour"
```

---

## Phase 2 — Start screen, progress, exit

### Task 2.1: Start screen + Exit/Restart controls

**Files:**
- Create: `demo/tour/TourChrome.jsx` (start card, exit button, progress bar)
- Modify: `demo/tour/tour-runner.jsx` (render chrome, fire state changes)

**Step 1:** Build a Preact `TourChrome` mounted once per page into its own container. It shows:
- A **start card** (only when `?tour=1` and not yet started, or when no `active` state) with "Take the 2-minute guided tour" / "Explore on your own".
- A persistent **top progress bar** + "Step N of M" + **Exit** while active.
The runner emits `tour:step` events (`{index,total}`) the chrome listens to.

**Step 2:** Mount `TourChrome` from each demo entry (its own `render` into a `#super-tour-chrome` div appended to body).

**Step 3:** Build + browser check: visiting `?tour=1` shows the start card; clicking "Explore on your own" dismisses it and leaves the normal demo usable.

**Step 4: Commit**
```bash
git add demo/tour/TourChrome.jsx demo/tour/tour-runner.jsx demo/pcc-demo-entry.jsx demo/demo-entry.jsx
git commit -m "feat(demo): tour start screen, progress bar, exit control"
```

---

## Phase 3 — Chapter 1: ICD-10 coding (medical-diagnosis.html)

### Task 3.1: Author Chapter 1 steps

**Files:**
- Modify: `demo/tour/tour-script.js`

**Step 1:** Add chapter-1 steps (page id `medical-diagnosis`). Use the verified selectors. Example skeleton:

```js
export const STEPS = [
  // Chapter 1 — ICD-10 coding
  { id: 'c1-intro', chapter: 1, page: 'medical-diagnosis', selector: null, placement: 'center',
    title: 'Meet Jane Doe', body: "Her MDS is signed and ready to submit. Watch Super double-check it against her chart — starting with her diagnoses.", advance: 'next' },
  { id: 'c1-cp-header', chapter: 1, page: 'medical-diagnosis', selector: '.super-meddiag-th--cp',
    title: 'Care-plan coverage', body: 'Super adds a coverage shield to every diagnosis — green = covered, amber = partial, red = no care plan.', advance: 'next', placement: 'bottom' },
  { id: 'c1-cp-shield', chapter: 1, page: 'medical-diagnosis', selector: '.super-meddiag-chip--cp',
    title: 'Click a shield', body: 'See exactly which care-plan focus and intervention cover this diagnosis — and what is missing.', advance: 'click', placement: 'left' },
  { id: 'c1-query-chip', chapter: 1, page: 'medical-diagnosis', selector: '.super-meddiag-chip--q',
    title: 'Query status', body: 'These chips track physician queries per diagnosis — pending, signed, or overdue.', advance: 'next', placement: 'left' },
  // open ICD-10 viewer via the exposed hook
  { id: 'c1-open-icd10', chapter: 1, page: 'medical-diagnosis', selector: '.icd10-viewer__sidebar',
    before: async () => window.__superDemoTour?.openIcd10?.(),
    title: 'AI-suggested ICD-10 codes', body: 'Super scans the chart and suggests billable ICD-10 codes, grouped by PDPM impact.', advance: 'next', placement: 'right' },
  { id: 'c1-evidence', chapter: 1, page: 'medical-diagnosis', selector: '.icd10-viewer__evidence-panel',
    title: 'Every code is backed by evidence', body: 'Click any code to see the exact chart mentions that support it.', advance: 'next', placement: 'left' },
  { id: 'c1-estimate', chapter: 1, page: 'medical-diagnosis', selector: '.icd10-viewer__estimate-btn',
    title: 'See the PDPM impact', body: 'Check how the codes change the PDPM estimate before committing anything.', advance: 'next', placement: 'top' },
];
```
(Exact selectors/labels confirmed against the page during implementation; adjust `advance`/`before` as the DOM requires.)

**Step 2:** Build + walk Chapter 1 in the browser via Playwright: each step spotlights the right element; `click` steps advance on real click; the ICD-10 viewer opens via the hook.

**Step 3: Commit**
```bash
git add demo/tour/tour-script.js
git commit -m "feat(demo): guided tour chapter 1 (ICD-10 coding)"
```

---

## Phase 4 — Chapter 2: Section I detection

### Task 4.1: Author Chapter 2 steps + cross-page hop

**Files:**
- Modify: `demo/tour/tour-script.js`

**Step 1:** Append chapter-2 steps (page id `mds-section-i`). The first chapter-2 step has `page: 'mds-section-i'`, so the runner auto-navigates from `medical-diagnosis.html`. Steps:
- Intro/legend (centered card): green/red/yellow meaning.
- Spotlight `.super-badge[data-mds-item="I0200"]`, `advance: 'click'` → opens popover.
- Spotlight popover evidence (`.cc-pop .sid__step-summary`), `advance: 'next'`.
- Spotlight `.sid__btn--agree`, `advance: 'click'` (or `advance: 'event'` on a `tour:agreed` event) → badge resolves. `hud: { ntaPoints: 1 }`.

**Step 2:** Verify cross-page resume: start the tour on `medical-diagnosis.html`, advance through Chapter 1; at the Chapter 2 boundary the browser navigates to `mds-section-i.html` and the tour resumes at the Section I intro.

**Step 3: Commit**
```bash
git add demo/tour/tour-script.js
git commit -m "feat(demo): guided tour chapter 2 (Section I) + cross-page resume"
```

---

## Phase 5 — Chapter 3: Physician query + phone mockup

### Task 5.1: PhoneMock component

**Files:**
- Create: `demo/tour/PhoneMock.jsx`
- Modify: `demo/tour/tour.css` (phone styles)

**Step 1:** Build a CSS iPhone frame component with states: `incoming` (SMS arrives), `typing` (doctor typing indicator), `signed` (✓ Signed). Props: `state`, `doctorName`, `message`. Slides up from bottom-right. Exposed via the runner so a step can mount/advance it.

**Step 2:** Build + render the phone in isolation (temporary mount) to confirm it looks right.

**Step 3: Commit**
```bash
git add demo/tour/PhoneMock.jsx demo/tour/tour.css
git commit -m "feat(demo): phone mockup for query notification"
```

### Task 5.2: Author Chapter 3 steps (query flow + phone)

**Files:**
- Modify: `demo/tour/tour-script.js`
- Modify: `demo/tour/tour-runner.jsx` (support `step.phone` state transitions)

**Step 1:** Steps:
- Spotlight a yellow badge `.super-badge[data-mds-item="I2300"]` (UTI), `advance: 'click'` → popover.
- Spotlight `.sid__btn--primary` (Query Physician), `advance: 'click'` → `window.QuerySendModal` opens (DemoQueryModal).
- Guide through doctor selection + Send (spotlight modal controls; `advance: 'event'` on query-sent — add a `tour:query-sent` dispatch in DemoQueryModal's send handler).
- `before` shows PhoneMock `incoming`; next step `typing`; next `signed`; caption explains text/email delivery.
- On phone `signed`, resolve the badge (dispatch `demo:toast` + mark dismissed) and continue.

**Step 2:** Add a `tour:query-sent` event dispatch in `demo/components/DemoQueryModal.jsx` send handler (so the tour knows the query was sent).

**Step 3:** Build + walk Chapter 3 end to end in the browser: badge → query modal → send → phone incoming → typing → signed → badge resolves.

**Step 4: Commit**
```bash
git add demo/tour/tour-script.js demo/tour/tour-runner.jsx demo/components/DemoQueryModal.jsx
git commit -m "feat(demo): guided tour chapter 3 (physician query + phone mockup)"
```

---

## Phase 6 — Chapter 4: Command Center (PDPM/HIPPS)

### Task 6.1: Author Chapter 4 steps

**Files:**
- Modify: `demo/tour/tour-script.js`

**Step 1:** Steps (page `mds-section-i`):
- `before: () => window.__superDemoTour.openOverlay('commandCenter')`, spotlight the HIPPS/payment card (confirm selector in MDSCommandCenter, e.g. `.mds-cc__hipps` / payment block), `advance: 'next'`.
- Narrate the dollar impact; set `hud: { dollarsPerDay: <number> }`.
- Close overlay via hook at chapter end.

**Step 2:** Build + verify the Command Center opens and the right card is spotlighted.

**Step 3: Commit**
```bash
git add demo/tour/tour-script.js
git commit -m "feat(demo): guided tour chapter 4 (Command Center PDPM/HIPPS)"
```

---

## Phase 7 — Chapter 5: Facility features (QM / 24hr / Care Plan)

### Task 7.1: Author Chapter 5 steps

**Files:**
- Modify: `demo/tour/tour-script.js`

**Step 1:** Short stops, each opened via `window.__superDemoTour.openOverlay(...)`:
- QM Board (`'qm'`) — spotlight the Five-Star tile/grid; 1–2 steps.
- 24-hour Report (`'24hr'`) — spotlight the report summary; 1 step.
- Care Plan — open the care-plan flow (coverage `'coverage'` overlay, or navigate to `clinical-care-plan-detail.html` for the audit banner); 1–2 steps.
- Close overlays between sub-stops.

**Step 2:** Build + verify each overlay opens and is spotlighted; transitions are clean.

**Step 3: Commit**
```bash
git add demo/tour/tour-script.js
git commit -m "feat(demo): guided tour chapter 5 (QM / 24hr / Care Plan)"
```

---

## Phase 8 — Look & feel polish + end card

### Task 8.1: Value HUD

**Files:**
- Create: `demo/tour/ValueHud.jsx`
- Modify: `demo/tour/tour-runner.jsx`, `demo/tour/tour.css`

**Step 1:** Corner HUD that reads `getTourState().hud` and animates counts up as steps set `hud`. Persisted across pages via state.

**Step 2:** Build + verify it increments at the anemia (NTA +1) and Command Center ($/day) steps and persists across the page hop.

**Step 3: Commit**
```bash
git add demo/tour/ValueHud.jsx demo/tour/tour-runner.jsx demo/tour/tour.css
git commit -m "feat(demo): value-found HUD"
```

### Task 8.2: Narrator avatar + chapter title cards + motion

**Files:**
- Modify: `demo/tour/tour.css`, `demo/tour/tour-runner.jsx`, `demo/tour/TourChrome.jsx`

**Step 1:** Add the Super "S" avatar into the driver popover header (custom popover render or DOM injection after `drive()`). Add full-screen chapter title cards shown when `step.chapter` changes (e.g. "Chapter 3 — Closing the loop with the physician"), ~1.5s, then auto-advance into the chapter. Add spotlight glide + popover fade transitions.

**Step 2:** Build + visual pass in the browser (screenshots) — confirm branded look, pulse ring, smooth transitions, chapter cards.

**Step 3: Commit**
```bash
git add demo/tour/tour.css demo/tour/tour-runner.jsx demo/tour/TourChrome.jsx
git commit -m "feat(demo): tour branded visuals, narrator avatar, chapter cards"
```

### Task 8.3: End card + CTA

**Files:**
- Modify: `demo/tour/TourChrome.jsx`, `demo/tour/tour-runner.jsx`

**Step 1:** On `finishTour()`, show a full-screen summary: value tally from HUD ("Super found N missed diagnoses and \$X/day"), recap bullets, and a CTA button (configurable URL). Offer "Restart tour".

**Step 2:** Build + verify the end card appears after the last step and Restart re-seeds the tour from Chapter 1.

**Step 3: Commit**
```bash
git add demo/tour/TourChrome.jsx demo/tour/tour-runner.jsx
git commit -m "feat(demo): tour end card + CTA"
```

---

## Phase 9 — Full run-through + deploy

### Task 9.1: End-to-end verification

**Step 1:** From a clean session (`resetTour()` / new tab), open `http://localhost:5174/demo/medical-diagnosis.html?tour=1` and walk ALL chapters start→finish via Playwright, asserting at each chapter: correct page, correct element spotlighted, click/event advances work, HUD updates, phone renders, end card shows. Capture screenshots per chapter.

**Step 2:** Verify "Explore on your own" and "Exit" leave a fully usable normal demo (badges, popovers, FAB all still work).

**Step 3:** Verify both production builds still pass: `npm run build` and `npm run demo:build`.

### Task 9.2: Deploy

**Step 1:** Run `npm run demo:deploy` (rsync → `demo-dist/` for Netlify) per existing workflow; confirm the tour entry (`?tour=1`) works on the deployed URL.

**Step 2: Commit any deploy-config changes**
```bash
git add -A
git commit -m "chore(demo): deploy guided tour"
```

---

## Notes for the implementer

- **Always `npm run demo:build` after editing** any `demo/` or `content/` file before checking captured pages.
- Selectors in chapter steps are best-effort from research; confirm each against the live DOM and adjust. Prefer stable ids/data-attributes; if an overlay lacks a good hook, add a `data-tour="..."` attribute to the real component (additive, safe).
- Keep the tour strictly additive — it must never break the free-explore demo. All tour code lives under `demo/tour/` plus thin boot calls and the `window.__superDemoTour` hook.
- DRY the step list; YAGNI on authoring tooling. Commit after every task.
- If a step's target can't be found within the timeout, log and skip rather than hanging (already handled by `waitForSelector` returning null → driver shows a centered popover).
```
