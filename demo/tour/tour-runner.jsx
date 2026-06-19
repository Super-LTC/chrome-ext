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
