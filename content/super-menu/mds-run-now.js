// MDS "Run it" — shared on-demand pipeline trigger.
//
// When a nurse edits an assessment's ARD/type in PCC, PCC mints a fresh
// assessment whose lookback changed; it usually hasn't synced into our DB yet,
// so the MDS section / PDPM endpoints 404. Instead of a dead end, the overlay
// offers a "Run it" button that fires a hard sync + full solver run and shows
// live progress.
//
// This module owns ONLY the trigger + poll state machine. It renders no UI —
// surfaces (section overlay, PDPM analyzer) drive their own UI from callbacks.
//
// Backend contract:
//   POST /api/extension/mds/run
//        body { externalPatientId, ardDate, assessmentType, facilityName, orgSlug }
//        → 202 { success:true, started:true }
//   GET  /api/extension/mds/run/status?externalPatientId&ardDate&facilityName&orgSlug
//        → { success, phase, sectionsTotal, sectionsDone, perSection[], etaSeconds,
//            assessmentId, lastError }
//   phase ∈ none | syncing | extracting_docs | solving | done | failed

const POLL_INTERVAL_MS = 3500;
// The pre-schedule window: right after POST /run, the assessment+schedule don't
// exist yet (~30–90s hard sync), so /status returns phase "none". Treat "none"
// as "still syncing" for up to 4 min; past that the trigger Lambda likely died.
const NONE_TIMEOUT_MS = 4 * 60 * 1000;

// Both 404 shapes are Run-it-eligible — the nurse's remedy is identical (run the
// full MDS). The code only drives copy/telemetry, never the action.
//   ASSESSMENT_NOT_FOUND → not synced (expect syncing/extracting phases)
//   NO_RUN_YET           → synced but this section unsolved (jumps toward solving)
const RUNNABLE_CODES = new Set(['ASSESSMENT_NOT_FOUND', 'NO_RUN_YET']);

// In-flight runs keyed by patient+ARD. A second start() for the same run returns
// the existing handle — covers the backend's "one click" pre-sync dedup gap.
const inflight = new Map();

function runKey(p) {
  return `${p.externalPatientId}|${p.ardDate}`;
}

function apiSend(endpoint, options) {
  return chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint, options });
}

/**
 * Classify an API_REQUEST response. Returns the runnable code
 * ('ASSESSMENT_NOT_FOUND' | 'NO_RUN_YET') when the 404 means "not analyzed yet",
 * or null for any other response (real data, or a genuine error).
 */
function runnableCode(res) {
  if (!res || res.status !== 404) return null;
  const code = res.body?.code;
  if (RUNNABLE_CODES.has(code)) return code;
  // Transitional fallback for any route not yet emitting the code field.
  const msg = res.error || res.body?.error || '';
  if (/assessment not found/i.test(msg)) return 'ASSESSMENT_NOT_FOUND';
  if (/no completed run/i.test(msg)) return 'NO_RUN_YET';
  return null;
}

/** Intro copy for the pre-click "Run it" card, by 404 code. */
function introCopy(code) {
  return code === 'NO_RUN_YET'
    ? "This section hasn't been analyzed yet."
    : 'No analysis yet for this assessment.';
}

/** UI copy for a poll state. Surfaces render this however they like. */
function phaseCopy(state) {
  const phase = state?.phase || 'none';
  switch (phase) {
    case 'none':
    case 'syncing':
      return { title: 'Fetching records from PCC…', detail: '', busy: true };
    case 'extracting_docs':
      return { title: 'Extracting documents…', detail: 'This is the longest step.', busy: true };
    case 'solving': {
      const done = state.sectionsDone ?? 0;
      const total = state.sectionsTotal ?? 0;
      const eta = state.etaSeconds;
      const detail = eta != null && eta > 0 ? `~${Math.ceil(eta / 60)} min remaining` : '';
      return { title: `Analyzing — ${done} of ${total} sections`, detail, busy: true };
    }
    case 'done':
      return { title: 'Analysis ready', detail: '', busy: false };
    case 'failed':
      return { title: 'Something went wrong', detail: state.lastError || '', busy: false };
    default:
      return { title: 'Working…', detail: '', busy: true };
  }
}

/** Gather POST /run params from the current PCC page. */
function gatherParams() {
  const fields = (window.getMDSContextBodyFields && window.getMDSContextBodyFields()) || {};
  const orgSlug = window.getOrg?.()?.org || '';
  const facilityName = window.getChatFacilityInfo?.() || '';
  return {
    externalPatientId: fields.externalPatientId || null,
    ardDate: fields.ardDate || null,
    assessmentType: fields.assessmentType || null,
    facilityName,
    orgSlug,
  };
}

function hasRequiredParams(p) {
  return !!(p && p.externalPatientId && p.ardDate && p.assessmentType && p.facilityName && p.orgSlug);
}

function trackBucket(ms) {
  const s = ms / 1000;
  if (s < 60) return 'lt_1m';
  if (s < 120) return '1_2m';
  if (s < 240) return '2_4m';
  if (s < 360) return '4_6m';
  return 'gt_6m';
}

/**
 * Start an on-demand run and poll to completion.
 *
 * @param {object} params   { externalPatientId, ardDate, assessmentType, facilityName, orgSlug }
 * @param {object} cb
 * @param {(state)=>void}        cb.onPhase        every poll tick
 * @param {(section,state)=>void} cb.onSectionDone  once per section as it completes
 * @param {(state)=>void}        cb.onDone         terminal: phase === 'done'
 * @param {(message)=>void}      cb.onError        terminal failure
 * @param {string} [surface]  telemetry label ('section_overlay' | 'pdpm_analyzer')
 * @param {string} [code]     originating 404 code, for telemetry
 * @returns {{cancel:()=>void}}
 */
function start(params, cb = {}, surface = 'unknown', code = null) {
  const key = runKey(params);
  const existing = inflight.get(key);
  if (existing) return existing;

  const startedAt = Date.now();
  const seenCompleted = new Set();
  let cancelled = false;
  let timer = null;

  const handle = {
    cancel() {
      cancelled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      inflight.delete(key);
    },
  };
  inflight.set(key, handle);

  const fail = (msg) => {
    if (cancelled) return;
    window.SuperAnalytics?.track?.('mds_run_failed', {
      surface, code: code || 'unknown', duration_ms_bucket: trackBucket(Date.now() - startedAt),
    });
    handle.cancel();
    cb.onError?.(msg || 'Something went wrong');
  };

  const finish = (state) => {
    if (cancelled) return;
    window.SuperAnalytics?.track?.('mds_run_completed', {
      surface, code: code || 'unknown',
      sections_total: state?.sectionsTotal ?? 0,
      duration_ms_bucket: trackBucket(Date.now() - startedAt),
    });
    handle.cancel();
    cb.onDone?.(state);
  };

  window.SuperAnalytics?.track?.('mds_run_triggered', { surface, code: code || 'unknown' });

  // Optimistic first paint before the POST resolves.
  cb.onPhase?.({ phase: 'none', sectionsDone: 0, sectionsTotal: 0, etaSeconds: null, optimistic: true });

  (async () => {
    try {
      const res = await apiSend('/api/extension/mds/run', {
        method: 'POST',
        body: JSON.stringify({
          externalPatientId: params.externalPatientId,
          ardDate: params.ardDate,
          assessmentType: params.assessmentType,
          facilityName: params.facilityName,
          orgSlug: params.orgSlug,
        }),
      });
      if (cancelled) return;
      if (!res || !res.success) return fail(res?.error || 'Could not start the run');
    } catch (e) {
      return fail(e?.message || 'Could not start the run');
    }
    poll();
  })();

  async function poll() {
    if (cancelled) return;

    let state = null;
    try {
      const qs = new URLSearchParams({
        externalPatientId: params.externalPatientId,
        ardDate: params.ardDate,
        facilityName: params.facilityName,
        orgSlug: params.orgSlug,
      });
      const res = await apiSend(`/api/extension/mds/run/status?${qs}`, { method: 'GET' });
      if (cancelled) return;
      if (res && res.success) state = res.data || {};
    } catch { /* transient — tolerate below */ }

    if (cancelled) return;

    // Transient status failure: tolerate within the none-timeout, else give up.
    if (!state) {
      if (Date.now() - startedAt > NONE_TIMEOUT_MS) return fail('Lost connection to the run');
      return schedule();
    }

    const phase = state.phase || 'none';

    if (phase === 'none') {
      if (Date.now() - startedAt > NONE_TIMEOUT_MS) {
        return fail("The run didn't start — please retry");
      }
      cb.onPhase?.({ ...state, phase: 'none', optimistic: true });
      return schedule();
    }

    if (phase === 'failed') return fail(state.lastError || 'The analysis failed');

    // Incremental reveal — fire once per section as it flips to completed.
    if (Array.isArray(state.perSection)) {
      for (const s of state.perSection) {
        if (s.status === 'completed' && !seenCompleted.has(s.section)) {
          seenCompleted.add(s.section);
          cb.onSectionDone?.(s.section, state);
        }
      }
    }

    cb.onPhase?.(state);

    if (phase === 'done') return finish(state);

    schedule();
  }

  function schedule() {
    if (cancelled) return;
    timer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  return handle;
}

export const MdsRunNow = {
  start,
  runnableCode,
  introCopy,
  phaseCopy,
  gatherParams,
  hasRequiredParams,
};

// Global for vanilla surfaces (mds-overlay.js). Preact modules can import directly.
window.MdsRunNow = MdsRunNow;
