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

const OVERLAY_ID = 'super-mds-sched-overlay';

function _isNewMdsPopup() {
  return window.location.href.includes('/clinical/mds3_popup/newmds.xhtml');
}

// --- Safe mode (dry-run) ----------------------------------------------------
// While ON, we run the FULL flow (coverage fetch, library match, modal) but
// create NO UDAs and block the real MDS save — so you can verify everything
// without writing real data. Persisted in same-origin localStorage; toggle via
// the on-page badge or `window.MdsScheduler.setSafeMode(false)` in the console.
//
// ⚠ Defaults ON for the test phase. BEFORE MERGE: default to OFF (or remove the
// gating + badge) so the feature actually creates records in production.
const DRY_RUN_KEY = 'superMdsSchedulerDryRun';
function _isSafeMode() {
  const v = localStorage.getItem(DRY_RUN_KEY);
  return v === null ? true : v === 'true';
}
function _setSafeMode(on) {
  localStorage.setItem(DRY_RUN_KEY, on ? 'true' : 'false');
  _renderBadge();
}

function _notice(msg, tone) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483646;`
    + `background:${tone === 'warn' ? '#b45309' : '#1d4ed8'};color:#fff;padding:9px 14px;border-radius:8px;`
    + `font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// --- On-page badge: confirms our build is active + shows/toggles the mode -----
const BADGE_ID = 'super-mds-sched-badge';
function _renderBadge() {
  if (!_isNewMdsPopup()) return;
  let b = document.getElementById(BADGE_ID);
  if (!b) {
    b = document.createElement('div');
    b.id = BADGE_ID;
    b.title = 'Super LTC MDS Scheduler — click to toggle Safe Mode';
    b.addEventListener('click', _toggleSafeMode);
    document.body.appendChild(b);
  }
  const safe = _isSafeMode();
  b.style.cssText = `position:fixed;left:8px;bottom:8px;z-index:2147483640;cursor:pointer;padding:6px 10px;`
    + `border-radius:8px;font:600 11px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;`
    + `box-shadow:0 4px 14px rgba(0,0,0,.28);max-width:230px;background:${safe ? '#0f766e' : '#b91c1c'};`;
  b.innerHTML = safe
    ? '🧪 Super Scheduler · SAFE MODE<br><span style="font-weight:400;opacity:.9">Save creates nothing · click to go LIVE</span>'
    : '● Super Scheduler · LIVE<br><span style="font-weight:400;opacity:.9">Save will create real records · click for Safe Mode</span>';
}
function _toggleSafeMode() {
  if (_isSafeMode()) {
    // eslint-disable-next-line no-alert
    if (!confirm('Turn OFF Safe Mode?\n\nSave will then create REAL UDAs and a REAL MDS in PointClickCare.')) return;
    _setSafeMode(false);
    _notice('LIVE MODE — Save will create real records.', 'warn');
  } else {
    _setSafeMode(true);
    _notice('SAFE MODE — nothing will be created.');
  }
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

async function _onSave(proceedWithSave) {
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

  // Best-effort deep-link to an existing UDA (covered / in-progress / out-of-window).
  // Opens in a NEW TAB so it can't disturb the MDS popup. UNVERIFIED URL pattern —
  // PCC's UDA opener for these encoded ids isn't confirmed; verify by clicking.
  const openUda = (uda) => {
    if (!uda?.id) return;
    const cid = form.patientId;
    const url = `/clinical/interaction/app.xhtml?ESOLassessid=${encodeURIComponent(uda.id)}`
      + `&retURL=${encodeURIComponent('/admin/client/cp_assessment.jsp')}`
      + `&ESOLclientid=${encodeURIComponent(cid)}&ESOLtabType=C&ESOLinquiryid=-1`
      + `&templateId=null&writable=true#/interactions/${encodeURIComponent(uda.id)}`;
    window.open(url, '_blank', 'noopener');
  };

  const onSkip = () => {
    window.SuperAnalytics?.track?.('mds_interview_scheduler_skipped', {
      description: desc, n_needed: needed.length,
    });
    _teardown(overlay);
    proceed();
  };

  const onConfirm = async (picks, setProgress) => {
    window.SuperAnalytics?.track?.('mds_interview_scheduler_confirmed', {
      description: desc, n_selected: picks?.length || 0, n_needed: needed.length,
    });
    if (!picks || picks.length === 0) { _teardown(overlay); proceed(); return; }

    if (_isSafeMode()) {
      const lines = picks.map((p) => `• ${p.label} → ${p.assessmentLabel || '(no form selected)'} on ${p.assessDatePcc || '?'}`).join('\n');
      _teardown(overlay);
      // eslint-disable-next-line no-alert
      alert(`SAFE MODE — nothing was created.\n\nWould schedule ${picks.length}:\n${lines}\n\nThe MDS save is also blocked in Safe Mode. Click the badge (bottom-left) to go LIVE.`);
      proceed();   // no-op in safe mode (resume blocks + notices)
      return;
    }

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
    _teardown(overlay);
    // Never block the MDS save (UDAs are independent) — but if any failed, make
    // sure the nurse SEES it (otherwise they'd assume it scheduled). A blocking
    // alert here is appropriate: it pauses before the save-navigation.
    const failedTypes = (res && !res.ok)
      ? picks.filter((p) => !res.created.includes(p.type)).map((p) => p.label)
      : (!res ? picks.map((p) => p.label) : []);
    if (failedTypes.length > 0) {
      console.warn('[mds-sched] some UDAs failed', res?.errors);
      // eslint-disable-next-line no-alert
      alert(`Super LTC: scheduled ${res?.created?.length || 0} of ${picks.length} interviews.\n\nCouldn't schedule: ${failedTypes.join(', ')}.\nPlease add ${failedTypes.length === 1 ? 'it' : 'these'} manually. The MDS will still save.`);
    }
    proceed();
  };

  render(h(SchedulerModal, { coverage, matches, libraryOptions: options, isoToPccDate, openUda, onConfirm, onSkip }), overlay);
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
    if (_isSafeMode()) { _notice('SAFE MODE: MDS save blocked (nothing created).', 'warn'); return; }
    _resuming = true;
    btn.click();                               // runs PCC's native onclick natively
    _resuming = false;
  };

  _onSave(resume).catch((err) => {
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

function _init() {
  if (!_isNewMdsPopup()) return;
  // Render the badge FIRST so a prefetch/hook error can never suppress it —
  // it's also our "is the right build active?" signal.
  try { _renderBadge(); } catch (e) { console.warn('[mds-sched] badge render failed', e); }
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
  setSafeMode: (on) => _setSafeMode(!!on),   // false → LIVE (creates real records)
  isSafeMode: _isSafeMode,
};
