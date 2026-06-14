/**
 * MDS Interview Auto-Scheduler — orchestrator.
 *
 * On the New/Change MDS popup (newmds.xhtml):
 *   - silently prefetch + keyword-match the facility UDA library on load
 *   - wrap the popup's global submitSave() so that at Save we evaluate
 *     interview coverage once, and if anything is needed, show a confirm modal
 *     that creates the chosen UDAs before letting PCC persist the MDS.
 *
 * See docs/plans/2026-06-14-mds-interview-scheduler-design.md.
 */
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

function _teardown(overlay) {
  render(null, overlay);
  overlay.remove();
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
  const nUnmatched = needed.filter((i) => !matches[i.type]).length;
  const desc = coverage?.description || '';

  window.SuperAnalytics?.track?.('mds_interview_scheduler_shown', {
    description: desc,
    n_needed: needed.length,
    n_covered: (coverage?.interviews || []).filter((i) => i.status === 'covered').length,
    n_unmatched: nUnmatched,
    operation: form.operation || '',
  });

  // Mount modal.
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);

  const proceed = () => { _markHandled(); originalSubmitSave(); };

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
    // Even on partial error, proceed to save the MDS (UDAs are independent).
    if (res && !res.ok) console.warn('[mds-sched] some UDAs failed', res.errors);
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
  wrapped.__superOriginal = original;
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

window.MdsSchedulerInject = { init: _init };
