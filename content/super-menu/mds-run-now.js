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
  // Patient anchor: numeric external id, or the MRN (pccPublicId) on flipped
  // pages where no numeric id is scrapeable (#967 resolves the run by MRN).
  return `${p.externalPatientId || p.pccPublicId}|${p.ardDate}`;
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

/**
 * Detect the "RUNNING" section response: a solve is already in flight for this
 * assessment, so the section endpoint returns 404 + `code: 'RUNNING'` plus the
 * same live progress shape `/run/status` emits (phase, sectionsDone/Total,
 * perSection, etaSeconds). Returns a normalized progress state the surface can
 * render as "Analyzing…", or null for any other response.
 *
 * Deliberately separate from runnableCode(): RUNNING must NOT offer "Run it" —
 * re-triggering an in-progress solve is exactly what the backend (PR #767) now
 * prevents. The surface shows progress and polls to completion instead.
 */
function runningState(res) {
  if (!res || res.status !== 404) return null;
  if (res.body?.code !== 'RUNNING') return null;
  const b = res.body;
  return {
    phase: b.phase || 'solving',
    sectionsDone: b.sectionsDone ?? 0,
    sectionsTotal: b.sectionsTotal ?? 0,
    perSection: Array.isArray(b.perSection) ? b.perSection : [],
    etaSeconds: b.etaSeconds ?? null,
    assessmentId: b.assessmentId || null,
  };
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
    pccPublicId: fields.pccPublicId || null,
    ardDate: fields.ardDate || null,
    assessmentType: fields.assessmentType || null,
    facilityName,
    orgSlug,
  };
}

// The fields POST /run can't run without, besides a patient anchor (checked
// separately below). All scraped live from the PCC DOM (or merged from a
// caller-supplied seed), so any can be transiently blank.
const REQUIRED_PARAMS = ['ardDate', 'assessmentType', 'facilityName', 'orgSlug'];

function hasRequiredParams(p) {
  return missingParams(p).length === 0;
}

/** Which required fields are blank. Empty array = good to run. The patient
 *  anchor is satisfied by EITHER a numeric externalPatientId OR the MRN
 *  (pccPublicId) — #967 resolves the run by MRN on flipped pages. */
function missingParams(p) {
  if (!p) return ['patient', ...REQUIRED_PARAMS];
  const missing = REQUIRED_PARAMS.filter((k) => !p[k]);
  if (!p.externalPatientId && !p.pccPublicId) missing.unshift('patient');
  return missing;
}

// Copy only the truthy entries of `seed` — lets a caller (e.g. PDPM patient
// scope) override scraped values without clobbering them with undefined.
function pickTruthy(obj) {
  const out = {};
  if (!obj) return out;
  for (const k of Object.keys(obj)) if (obj[k]) out[k] = obj[k];
  return out;
}

/**
 * Gather run params, retrying once after a short delay if the first scrape came
 * up short. PCC paints the assessment proptable + ESOLclientid anchors a beat
 * after the "Run it" card can render, so a click that lands too early scrapes
 * blanks (ardDate / assessmentType / externalPatientId). One re-scrape closes
 * that window. Emits telemetry on both recovery and persistent failure so we
 * can see how often the race bites and which field is the culprit.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.surface]      telemetry label
 * @param {string}  [opts.code]         originating 404 code
 * @param {object}  [opts.seed]         truthy values override scraped ones
 * @param {number}  [opts.retryDelayMs]
 * @returns {Promise<{ok:boolean, params:object, missing:string[]}>}
 */
async function gatherParamsResilient({ surface = 'unknown', code = null, seed = null, retryDelayMs = 400 } = {}) {
  const merge = () => ({ ...gatherParams(), ...pickTruthy(seed) });

  let params = merge();
  let missing = missingParams(params);
  if (!missing.length) return { ok: true, params, missing: [] };

  await new Promise((r) => setTimeout(r, retryDelayMs));
  params = merge();
  missing = missingParams(params);

  const track = window.SuperAnalytics?.track;
  if (!missing.length) {
    track?.('mds_run_params_recovered', { surface, code: code || 'unknown' });
    return { ok: true, params, missing: [] };
  }

  track?.('mds_run_params_missing', { surface, code: code || 'unknown', missing_fields: missing.join(',') });
  return { ok: false, params, missing };
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
          // Send whichever patient anchor(s) we have — backend prefers numeric,
          // resolves by MRN when the numeric id is EID-dead (#967).
          ...(params.externalPatientId ? { externalPatientId: params.externalPatientId } : {}),
          ...(params.pccPublicId ? { pccPublicId: params.pccPublicId } : {}),
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
        ardDate: params.ardDate,
        facilityName: params.facilityName,
        orgSlug: params.orgSlug,
      });
      // Guard: never stringify a null id into the query ("null"). Send the MRN
      // as the patient anchor when the numeric id is EID-dead (#967).
      if (params.externalPatientId) qs.set('externalPatientId', params.externalPatientId);
      if (params.pccPublicId) qs.set('pccPublicId', params.pccPublicId);
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
  runningState,
  introCopy,
  phaseCopy,
  gatherParams,
  gatherParamsResilient,
  hasRequiredParams,
  missingParams,
};

// Global for vanilla surfaces (mds-overlay.js). Preact modules can import directly.
window.MdsRunNow = MdsRunNow;
