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
