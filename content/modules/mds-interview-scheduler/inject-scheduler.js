/**
 * MDS Interview Auto-Scheduler — orchestrator.
 *
 * On the New/Change MDS popup (newmds.xhtml):
 *   - silently prefetch + keyword-match the facility UDA library on load
 *   - intercept the Save button click (capture phase, since content scripts run
 *     in an isolated world and can't wrap the page's submitSave()) so that at
 *     Save we evaluate interview coverage once, and if anything is needed, show
 *     a confirm modal that creates the chosen UDAs before re-dispatching the
 *     click to let PCC persist the MDS with its native flow.
 *
 * See docs/plans/2026-06-14-mds-interview-scheduler-design.md.
 */
import { render, h } from 'preact';
import { SchedulerModal, SchedulerLoading } from './SchedulerModal.jsx';
import { buildCoverageQuery, isoToPccDate } from './lib/coverage-query.js';
import { matchLibraryToInterviews } from './lib/library-match.js';
import { mdsBetaEnabled } from '../../mds-beta-gate.js';

const OVERLAY_ID = 'super-mds-sched-overlay';

// 🔴 KILL SWITCH — the whole interview scheduler is parked for now (UX needs a
// rethink; see the "save hijack feels like a surprise" discussion). Code is kept
// intact; _init() bails before installing anything. Flip back to true to re-enable.
const SCHEDULER_ENABLED = false;

// ⚠️ TEMP TEST FLAG — REMOVE BEFORE SHIP.
// true → real gate + real coverage (real patient), CREATE the UDAs for real, but
// do NOT fire the MDS save (abort it) so you can verify UDA creation in isolation.
const MDS_SCHED_TEST = false;

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Non-blocking toast via the shared SuperToast (success/error). Safe no-op if
 *  it's unavailable in this context. */
function _toast(type, message) {
  try {
    const t = window.SuperToast;
    if (t && typeof t[type] === 'function') t[type](message);
    else if (t?.show) t.show({ type, message });
    else console.info('[mds-sched]', message);
  } catch { /* toast must never break the save */ }
}

function _isNewMdsPopup() {
  return window.location.href.includes('/clinical/mds3_popup/newmds.xhtml');
}

// --- "Don't show again" suppression -----------------------------------------
// A nurse can hide the scheduler via the modal's checkbox. Persisted in
// same-origin localStorage (NOTE: per workstation, not per nurse — shared
// computers share it). When hidden, Save just proceeds normally and the only
// thing we show is a small "turn on" pill so it's always recoverable.
const HIDDEN_KEY = 'superMdsSchedulerHidden';
function _isHidden() {
  return localStorage.getItem(HIDDEN_KEY) === 'true';
}
function _setHidden(on) {
  localStorage.setItem(HIDDEN_KEY, on ? 'true' : 'false');
  _renderResetPill();
}

function _notice(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483646;`
    + `background:#1d4ed8;color:#fff;padding:9px 14px;border-radius:8px;`
    + `font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Small "turn on" pill — shown ONLY when the scheduler has been hidden, so the
// nurse can always get it back. Nothing shows while the scheduler is active.
const PILL_ID = 'super-mds-sched-pill';
function _renderResetPill() {
  if (!_isNewMdsPopup()) return;
  const existing = document.getElementById(PILL_ID);
  if (!_isHidden()) { existing?.remove(); return; }
  if (existing) return;
  const p = document.createElement('div');
  p.id = PILL_ID;
  p.title = 'Turn the Super interview scheduler back on';
  p.style.cssText = `position:fixed;left:8px;bottom:8px;z-index:2147483640;cursor:pointer;padding:6px 10px;`
    + `border-radius:8px;font:600 11px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;color:#475569;`
    + `background:#fff;border:1px solid #e2e8f0;box-shadow:0 4px 14px rgba(0,0,0,.16);`;
  p.innerHTML = 'Interview scheduler off · <span style="color:#4f46e5;">Turn on</span>';
  p.addEventListener('click', () => { _setHidden(false); _notice('Interview scheduler turned back on.'); });
  document.body.appendChild(p);
}

let _libraryPromise = null;     // raw options, fetched on load (the slow part)
function _prefetchLibrary() {
  const { patientId } = window.MdsSchedulerForm.readFormState();
  if (!patientId) return;
  _libraryPromise = window.MdsSchedulerLibrary
    .fetchAssessmentLibrary(patientId)
    .catch((e) => { console.warn('[mds-sched] library prefetch failed', e); return []; });
}

function _teardown(overlay) {
  render(null, overlay);
  overlay.remove();
}

async function _onSave(proceedWithSave, abortSave) {
  if (_isHidden()) return proceedWithSave();   // nurse opted out — never interrupt
  const form = window.MdsSchedulerForm.readFormState();
  const query = buildCoverageQuery(form);
  if (!query) return proceedWithSave();

  // Show the spinner the instant Save is clicked, while we fetch coverage.
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);
  render(h(SchedulerLoading), overlay);

  let coverage;
  try {
    coverage = await window.MdsSchedulerAPI.fetchInterviewCoverage(query);
  } catch (e) {
    console.warn('[mds-sched] coverage fetch failed; saving without scheduling', e);
    _teardown(overlay);
    return proceedWithSave();
  }

  const needed = (coverage?.interviews || []).filter((i) => i.status === 'needed');
  if (needed.length === 0) { _teardown(overlay); return proceedWithSave(); }   // silent passthrough

  // Keyword-match the library NOW, with the final A0310 type (so the GG variant
  // is right for this ARD). Matching is cheap+pure; only the fetch was slow.
  const options = (await _libraryPromise) || [];
  const matches = matchLibraryToInterviews(options, { a0310a: form.a0310a, a0310f: form.a0310f });
  const nUnmatched = needed.filter((i) => !matches[i.type]).length;
  const desc = coverage?.description || '';

  window.SuperAnalytics?.track?.('mds_interview_scheduler_shown', {
    description: desc,
    n_needed: needed.length,
    n_covered: (coverage?.interviews || []).filter((i) => i.status === 'covered').length,
    n_in_progress: (coverage?.interviews || []).filter((i) => i.status === 'in_progress').length,
    n_unmatched: nUnmatched,
    operation: form.operation || '',
  });

  const proceed = () => proceedWithSave();

  // Deep-link to an existing UDA (covered / in-progress / out-of-window).
  // Relative URL → works on any PCC host (www19/www21/…). New tab so it can't
  // disturb the MDS popup.
  const openUda = (uda) => {
    if (!uda?.id) return;
    window.open(`/care/chart/mds/mdssection.jsp?ESOLassessid=${encodeURIComponent(uda.id)}`, '_blank', 'noopener');
  };

  const onSkip = () => {
    window.SuperAnalytics?.track?.('mds_interview_scheduler_skipped', {
      description: desc, n_needed: needed.length,
    });
    _teardown(overlay);
    proceed();
  };

  // "Don't show this again" — hide for the future AND just close our modal,
  // handing control back to the PCC form (no save). The nurse clicks Save
  // themselves and it goes through untouched (now suppressed).
  const onDismiss = () => {
    window.SuperAnalytics?.track?.('mds_interview_scheduler_hidden', {
      description: desc, n_needed: needed.length,
    });
    _setHidden(true);
    _teardown(overlay);
    abortSave?.();
  };

  const onConfirm = async (picks, setProgress) => {
    window.SuperAnalytics?.track?.('mds_interview_scheduler_confirmed', {
      description: desc, n_selected: picks?.length || 0, n_needed: needed.length,
    });
    if (!picks || picks.length === 0) { _teardown(overlay); proceed(); return; }

    let res;
    try {
      res = await window.MdsSchedulerCreate.scheduleInterviews({
        patientId: form.patientId, picks, onProgress: setProgress,
      });
    } catch (e) {
      console.warn('[mds-sched] scheduling threw; saving MDS anyway', e);
    }
    window.SuperAnalytics?.track?.('mds_interview_scheduler_scheduled', {
      n_selected: picks.length,
      n_created: res?.created?.length || 0,
      n_failed: res?.errors?.length || 0,
    });

    // TEMP TEST: UDAs were created for real — but do NOT fire the MDS save. Report
    // the outcome and abort, so you can verify the UDAs landed in isolation.
    if (MDS_SCHED_TEST) {
      _teardown(overlay);
      const created = (res?.created || []).join(', ') || 'none';
      const errors = (res?.errors || []).map((e) => `${e.type}: ${e.error}`).join('\n  ') || 'none';
      alert(`TEST — UDAs created, MDS NOT saved\n\nCreated: ${created}\nErrors:\n  ${errors}`);
      abortSave?.();
      return;
    }

    _teardown(overlay);
    // Never block the MDS save — UDAs are independent. Surface the outcome as a
    // toast (non-blocking) and give it a beat to render before the save navigates
    // the popup away.
    const createdCount = res?.created?.length || 0;
    const failedTypes = (res && !res.ok)
      ? picks.filter((p) => !res.created.includes(p.type)).map((p) => p.label)
      : (!res ? picks.map((p) => p.label) : []);
    if (failedTypes.length > 0) {
      console.warn('[mds-sched] some UDAs failed', res?.errors);
      _toast('error', `Scheduled ${createdCount} of ${picks.length}. Couldn't schedule ${failedTypes.join(', ')} — add ${failedTypes.length === 1 ? 'it' : 'them'} manually. The MDS will still save.`);
      await _sleep(2000);
    } else {
      _toast('success', `Scheduled ${createdCount} assessment${createdCount === 1 ? '' : 's'} for this resident.`);
      await _sleep(1000);
    }
    proceed();
  };

  render(h(SchedulerModal, {
    coverage, matches, libraryOptions: options, isoToPccDate, openUda, onConfirm, onSkip, onDismiss,
  }), overlay);
}

// --- Save interception via DOM events --------------------------------------
//
// Content scripts run in an ISOLATED world, so we can't wrap the page's global
// submitSave()/canProceedWithSubmission(). DOM events + element.click() DO cross
// the world boundary, so we intercept the Save button click in the CAPTURE phase
// (fires before PCC's inline onclick), run our async flow, then "resume" the real
// save by re-dispatching a click that bypasses our own listener — letting PCC's
// native onclick (validation + confirm flow + submitSave) run untouched.
//
// Known v1 gaps (documented in the design doc): the CTRL-SHIFT-S keyboard save
// and the server-confirm auto-resubmit call submitSave() directly in page context
// (not via a button click), so they bypass this interceptor. The first creates a
// rare keyboard-only blind spot; the second is fine — our UDAs were already
// created on the click pass, and the coverage re-check is idempotent anyway.

const SAVE_BTN_ID = 'idSaveBtn';
let _resuming = false;     // true while we re-dispatch the click to let PCC save
let _busy = false;         // guard against re-entrant intercepts mid-flow

function _onCaptureClick(e) {
  if (_resuming) return;                       // our own resume click — let it through
  const btn = e.target?.closest?.(`#${SAVE_BTN_ID}`);
  if (!btn) return;
  if (_busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }

  // Block PCC's inline onclick for now; we'll re-trigger it after our flow.
  e.preventDefault();
  e.stopImmediatePropagation();
  _busy = true;

  const resume = () => {
    _busy = false;
    _resuming = true;
    btn.click();                               // runs PCC's native onclick natively
    _resuming = false;
  };
  const abort = () => { _busy = false; };       // close our modal, hand control back to the form (no save)

  _onSave(resume, abort).catch((err) => {
    console.warn('[mds-sched] save flow errored; saving anyway', err);
    resume();
  });
}

let _listenerInstalled = false;
function _installSaveHook() {
  if (_listenerInstalled) return;
  // Capture phase on document → fires before the button's inline onclick.
  document.addEventListener('click', _onCaptureClick, true);
  _listenerInstalled = true;
}

async function _init() {
  if (!SCHEDULER_ENABLED) return;   // parked — see KILL SWITCH note up top
  if (!_isNewMdsPopup()) return;
  // Beta gate: only allowlisted users get the scheduler (auto-schedule UI +
  // create-flow). Fails closed — non-testers get the native PCC save, untouched.
  if (!(await mdsBetaEnabled())) return;
  // Only shows the "turn on" pill if the scheduler was hidden; nothing otherwise.
  try { _renderResetPill(); } catch (e) { console.warn('[mds-sched] pill render failed', e); }
  try { _prefetchLibrary(); } catch (e) { console.warn('[mds-sched] prefetch failed', e); }
  try { _installSaveHook(); } catch (e) { console.warn('[mds-sched] save hook failed', e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}

window.MdsSchedulerInject = { init: _init };
window.MdsScheduler = {
  hide: () => _setHidden(true),     // stop showing the scheduler modal
  show: () => _setHidden(false),    // re-enable it
  isHidden: _isHidden,
};
