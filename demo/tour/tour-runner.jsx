// demo/tour/tour-runner.jsx
import { driver } from 'driver.js';
import { render } from 'preact';
import 'driver.js/dist/driver.css';
import './tour.css';
import { STEPS, CHAPTERS } from './tour-script.js';
import { getTourState, setTourState, resetTour, currentPageId } from './tour-state.js';
import { PhoneMock } from './PhoneMock.jsx';

let drv = null;
let cleanupFns = [];
// Tracks the chapter of the most recently rendered step so we can detect chapter
// transitions (and show a title card). Persisted in tour state so a cross-page
// hop still shows the card if the chapter changed across the navigation.
let lastRenderedChapter = null;

// ── Phone mockup (Chapter 3) ──
// A step may carry a `phone` field, e.g. `phone: { state: 'incoming' }`. We
// render PhoneMock into a dedicated #super-tour-phone container (mirroring how
// TourChrome is mounted) and unmount it when the tour moves past the phone
// chapter or ends.
function phoneContainer(create) {
  let el = document.getElementById('super-tour-phone');
  if (!el && create) {
    el = document.createElement('div');
    el.id = 'super-tour-phone';
    document.body.appendChild(el);
  }
  return el;
}

function showPhone(phone) {
  const el = phoneContainer(true);
  render(<PhoneMock state={phone.state} doctorName={getTourState().doctorName} message={phone.message} />, el);
}

function clearPhone() {
  const el = phoneContainer(false);
  if (el) { render(null, el); el.remove(); }
}

// ── Chapter title card ──
// A brief full-screen branded interstitial shown when the tour enters a new
// chapter. Purely visual: it appears, holds ~1.4s, fades out, then resolves so
// the actual step renders. It does NOT touch the step's advance mode.
function showChapterCard(chapter) {
  return new Promise((resolve) => {
    const title = CHAPTERS[chapter];
    if (!title) { resolve(); return; }
    const card = document.createElement('div');
    card.className = 'super-tour-chapter-card';
    card.innerHTML = `
      <div class="super-tour-chapter-inner">
        <div class="super-tour-chapter-mark"><span class="super-tour-mark" aria-hidden="true">S</span></div>
        <div class="super-tour-chapter-eyebrow">Chapter ${chapter}</div>
        <div class="super-tour-chapter-title"></div>
      </div>`;
    card.querySelector('.super-tour-chapter-title').textContent = title;
    document.body.appendChild(card);
    // force reflow so the enter transition runs
    void card.offsetWidth;
    card.classList.add('is-in');
    const hold = setTimeout(() => {
      card.classList.remove('is-in');
      card.classList.add('is-out');
      const done = setTimeout(() => { card.remove(); resolve(); }, 360);
      cleanupFns.push(() => { clearTimeout(done); card.remove(); });
    }, 1400);
    cleanupFns.push(() => { clearTimeout(hold); card.remove(); });
  });
}

// Inject the Super "S" narrator avatar into the driver popover header so each
// step reads as "spoken" by Super.
function injectNarrator() {
  const titleEl = document.querySelector('.driver-popover.super-tour .driver-popover-title');
  if (titleEl && !titleEl.querySelector('.super-tour-narrator')) {
    const avatar = document.createElement('span');
    avatar.className = 'super-tour-narrator super-tour-mark';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'S';
    titleEl.prepend(avatar);
  }
}

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

  // Tell the chrome (progress bar) immediately, before any chapter card, so the
  // bar reads "Step 1 of N" the instant the tour starts.
  window.dispatchEvent(new CustomEvent('tour:step', {
    detail: { index, total: STEPS.length },
  }));

  // Chapter title card: show when entering a NEW chapter. Falls back to the
  // persisted chapter so a cross-page hop still detects the transition. Skipped
  // on the very first step (prevChapter null) — the start card already intro'd.
  const prevChapter = lastRenderedChapter != null
    ? lastRenderedChapter
    : getTourState().lastChapter;
  if (step.chapter != null && prevChapter != null && step.chapter !== prevChapter) {
    await showChapterCard(step.chapter);
  }
  lastRenderedChapter = step.chapter;
  setTourState({ lastChapter: step.chapter });

  if (typeof step.before === 'function') {
    try { await step.before(); } catch (e) { console.warn('[tour] before() failed', e); }
  }

  // Phone mockup: show/update when this step declares one, clear when it moves
  // past the phone chapter.
  if (step.phone) showPhone(step.phone);
  else clearPhone();

  const el = await waitForSelector(step.selector);

  // Center the target in the viewport before spotlighting so edge elements
  // (far-right table columns, items low on the page) don't push the popover
  // off-screen. Give the scroll a moment to settle before driver.js measures.
  if (el) {
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((r) => setTimeout(r, 240));
    } catch {}
  }

  const isNext = step.advance === 'next';
  drv = driver({
    // Each step is its own single-step driver instance, so driver.js's built-in
    // progress would always read "Step 1 of 1". The TourChrome top bar shows the
    // real progress instead, so disable driver's own.
    showProgress: false,
    popoverClass: 'super-tour',
    allowClose: false,
    overlayColor: 'rgba(17, 24, 39, 0.55)',
    // Single-step config uses the "done" button; label it "Next" so next-mode
    // steps read naturally instead of "Done" mid-tour.
    doneBtnText: 'Next',
    // Wire Next BEFORE drive() so driver.js v1.4 binds the handler reliably.
    onNextClick: isNext ? () => advance() : undefined,
    steps: [{
      element: el || undefined,
      popover: {
        title: step.title,
        description: step.body,
        side: step.placement || 'bottom',
        showButtons: isNext ? ['next'] : [],
      },
    }],
  });
  drv.drive();
  injectNarrator();

  // Tell the tour chrome (progress bar) which step we're on.
  window.dispatchEvent(new CustomEvent('tour:step', {
    detail: { index, total: STEPS.length },
  }));

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
  } else if (step.advance === 'auto') {
    const t = setTimeout(() => advance(), step.autoMs || 1600);
    cleanupFns.push(() => clearTimeout(t));
  }

  if (step.hud) {
    const nextHud = { ...getTourState().hud, ...step.hud };
    setTourState({ hud: nextHud });
    window.dispatchEvent(new CustomEvent('tour:hud', { detail: { hud: nextHud } }));
  }
}

function advance() {
  clearStep();
  try { drv?.destroy(); } catch {}
  goToIndex(getTourState().index + 1);
}

function finishTour() {
  clearStep();
  clearPhone();
  try { drv?.destroy(); } catch {}
  // Close any overlay the last chapter left open so the end card lands clean.
  try { window.__superDemoTour?.closeOverlay?.(); } catch {}
  const hud = getTourState().hud;
  setTourState({ active: false });
  // TourChrome renders the branded end card from this event's hud tally.
  window.dispatchEvent(new CustomEvent('tour:finished', { detail: { hud } }));
}

export function startTour() {
  resetTour();
  lastRenderedChapter = null;
  goToIndex(0);
}
export function exitTour() { clearStep(); clearPhone(); try { drv?.destroy(); } catch {}; try { window.__superDemoTour?.closeOverlay?.(); } catch {}; lastRenderedChapter = null; resetTour(); window.dispatchEvent(new CustomEvent('tour:exited')); }

// Called by each demo entry on every page load.
export function bootTour() {
  const st = getTourState();
  const params = new URLSearchParams(location.search);
  if (!st.active && params.get('tour') === '1') {
    // Show the start card (via TourChrome) and let the prospect opt in.
    // The card calls startTour() when "Take the guided tour" is clicked.
    window.dispatchEvent(new CustomEvent('tour:offer'));
    return;
  }
  if (st.active) {
    // Resume — but only if the saved step belongs to this page (else navigate).
    goToIndex(st.index);
  }
}
