// content/modules/care-plan-stamp/pcc-library-stamp.js
//
// LIBRARY-add path for a care-plan focus + its goals + interventions (SUP-54), driven
// through PCC's OWN wizard — the exact sequence a nurse's browser fires when they add a
// focus from the library. Reverse-engineered from a real successful capture (cp_final.har,
// org eac / library 49 / std focus 2072):
//
//   1. GET  neededit_rev.jsp?ESOLnewFocus=true&ESOLwizard=Y   → PCC mints the draft focus id
//   2. POST neededit_rev.jsp   (ESOLwizard=Y, ESOLsave=Y, our cp_description + review depts)
//   3. GET  goalwizard_rev.jsp    (prime the goal picker for that focus)
//   4. POST goalwizard_rev.jsp    (chkbox=<library std goal id> — one per goal)
//   5. GET  interwizard_rev.jsp   (prime the intervention picker)
//   6. POST interwizard_rev.jsp   (chkbox=<library std intervention id> — one per intervention)
//
// ONE draft id flows through every call. This is the whole fix: the earlier attempts used
// the CUSTOM endpoints (goaledit / intereditcust, ESOLwizard=N) without a wizard session,
// so PCC treated the fresh focus as orphaned ("the related focus has been deleted") — an id
// problem that was never really about the id. The library std ids are exactly the `chkbox`
// values the backend already ships on each goal/intervention (libraryStdId, PR #850).
//
// Pure URL/body builders + the id parse are ES-exported and unit-tested (no DOM/fetch).
// The fetch-driven stampLibraryFocus attaches to window.CarePlanLibraryStamp.

const NEEDEDIT_URL = '/care/chart/cp/neededit_rev.jsp';
const GOALWIZARD_URL = '/care/chart/cp/goalwizard_rev.jsp';
const INTERWIZARD_URL = '/care/chart/cp/interwizard_rev.jsp';

const LIB_DEBUG = true;
function _dlog(...args) {
  if (LIB_DEBUG) console.log('[cp-lib-stamp]', ...args);
}

// ============================== pure builders (no DOM) ==============================

/** Step 1 — the create GET. PCC mints a draft focus for `stdNeedId` and returns its id. */
export function buildFocusCreateUrl({ stdNeedId, clientId, careplanId }) {
  const qs = new URLSearchParams({
    ESOLreviewid: '-1',
    ESOLgenneedid: '-1',
    ESOLstdneedid: String(stdNeedId),
    ESOLclientid: String(clientId),
    ESOLneedid: '-1',
    ESOLstatus: '1',
    ESOLwizard: 'Y',
    ESOLcareplanid: String(careplanId),
    ESOLnewFocus: 'true',
  });
  return `${NEEDEDIT_URL}?${qs.toString()}`;
}

/** Step 2 — commit our wording + review departments onto the draft (WIZARD mode). */
export function buildFocusSaveBody({ genNeedId, stdNeedId, description, reviewDepartments = [], clientId, careplanId, miniToken, dates }) {
  const slots = [0, 1, 2, 3, 4].map((i) => (reviewDepartments[i] != null ? String(reviewDepartments[i]) : ''));
  return new URLSearchParams({
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLstdneedid: String(stdNeedId),
    ESOLgenneedid: String(genNeedId),
    ESOLwizard: 'Y',
    ESOLrow: 'null',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLreviewid: '-1',
    ESOLpositionid: '-1',
    date_initiated: dates.date,
    date_initiated_dummy: dates.dateDummy,
    resolved_type: '',
    resolved_date: '',
    cp_description: description,
    carePlanTypeIds: '',
    position_id_one: slots[0],
    position_id_two: slots[1],
    position_id_three: slots[2],
    position_id_four: slots[3],
    position_id_five: slots[4],
  });
}

/**
 * Step 3 — prime the goal picker. `genNeedId` = the COMMITTED focus id (post-save),
 * `needId` = the original draft/need id. PCC's goal form carries both.
 */
export function buildGoalWizardUrl({ genNeedId, needId, stdNeedId, clientId, careplanId }) {
  const nid = needId != null ? needId : genNeedId;
  const qs = new URLSearchParams({
    ESOLgenneedid: String(genNeedId),
    ESOLneedid: String(nid),
    ESOLstdneedid: String(stdNeedId),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'Y',
    ESOLreviewid: '-1',
  });
  return `${GOALWIZARD_URL}?${qs.toString()}`;
}

/** Step 4 — check the library goal std ids (one chkbox each) + echo the focus text. */
export function buildGoalWizardBody({ genNeedId, needId, stdNeedId, clientId, careplanId, miniToken, goalStdIds = [], focusDescription }) {
  const nid = needId != null ? needId : genNeedId;
  const body = new URLSearchParams({
    ESOLstdneedid: String(stdNeedId),
    ESOLneedid: String(nid),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'Y',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLgenneedid: String(genNeedId),
    ESOLreviewid: '-1',
  });
  for (const id of goalStdIds) body.append('chkbox', String(id));
  body.append('focus', focusDescription || '');
  return body;
}

/** Step 5 — prime the intervention picker (committed genneedid + draft needid). */
export function buildInterWizardUrl({ genNeedId, needId, stdNeedId, clientId, careplanId }) {
  const nid = needId != null ? needId : genNeedId;
  const qs = new URLSearchParams({
    ESOLgenneedid: String(genNeedId),
    ESOLwizard: 'Y',
    ESOLneedid: String(nid),
    ESOLstdneedid: String(stdNeedId),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
  });
  return `${INTERWIZARD_URL}?${qs.toString()}`;
}

/** Step 6 — check the library intervention std ids (one chkbox each). */
export function buildInterWizardBody({ genNeedId, needId, stdNeedId, clientId, careplanId, miniToken, interventionStdIds = [], dates }) {
  const nid = needId != null ? needId : genNeedId;
  const body = new URLSearchParams({
    ESOLstdneedid: String(stdNeedId),
    ESOLneedid: String(nid),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'Y',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLgenneedid: String(genNeedId),
    ESOLresnewstdtask: 'null',
    ESOLisstdTask: 'N',
    ESOLfocusdate: dates.focusDate,
    ESOLfromPage: '',
    ESOLreviewid: '-1',
    initDate: dates.date,
    initDate_dummy: dates.dateDummy,
  });
  for (const id of interventionStdIds) body.append('chkbox', String(id));
  return body;
}

/**
 * Split the committed genneedid + draft needid out of a URL — used on the save POST's
 * final url (fetch follows the 302 whose Location is goalwizard?ESOLgenneedid=<committed>&
 * ESOLneedid=<draft>). Either is null when absent (e.g. the save didn't redirect).
 */
export function parseWizardIds(url) {
  const s = String(url || '');
  const gen = s.match(/ESOLgenneedid=(\d+)/);
  const need = s.match(/ESOLneedid=(\d+)/);
  return {
    genNeedId: gen && gen[1] !== '-1' ? gen[1] : null,
    needId: need && need[1] !== '-1' ? need[1] : null,
  };
}

/**
 * Recover the draft focus id from the create GET. PCC returns it as a hidden
 * ESOLgenneedid form field (create-form), an ESOLlastneed JS assignment (save-response),
 * or an ESOLgenneedid in the response URL. Ignores the -1 sentinel. null if absent.
 */
export function parseNewFocusId(html, responseUrl) {
  const s = String(html || '');
  const fromUrl = String(responseUrl || '').match(/ESOLgenneedid=(\d+)/);
  if (fromUrl && fromUrl[1] !== '-1') return fromUrl[1];
  const hiddenNameFirst = s.match(/name=["']?ESOLgenneedid["']?[^>]*value=["'](\d+)["']/i);
  if (hiddenNameFirst && hiddenNameFirst[1] !== '-1') return hiddenNameFirst[1];
  const hiddenValueFirst = s.match(/value=["'](\d+)["'][^>]*name=["']?ESOLgenneedid["']?/i);
  if (hiddenValueFirst && hiddenValueFirst[1] !== '-1') return hiddenValueFirst[1];
  const lastNeed = s.match(/ESOLlastneed\.value\s*=\s*"(\d+)"/);
  if (lastNeed && lastNeed[1] !== '-1') return lastNeed[1];
  const genNeed = s.match(/ESOLgenneedid["=:\s]+["']?(\d+)/i);
  if (genNeed && genNeed[1] !== '-1') return genNeed[1];
  return null;
}

/** A usable PCC std id: present, non-empty, not the "-1" custom sentinel. */
function _hasStdId(id) {
  return id != null && String(id) !== '' && String(id) !== '-1';
}

/** Whether a proposed focus should be added FROM THE LIBRARY (vs custom-stamped). */
export function isLibraryFocus(focus) {
  return !!focus && _hasStdId(focus.libraryStdId);
}

// ============================ fetch-driven (content script) ============================

function _todayDates() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return {
    date: `${mm}/${dd}/${yyyy}`,
    dateDummy: `${d.getMonth() + 1}/${d.getDate()}/${yyyy}`,
    focusDate: `${yyyy}-${mm}-${dd} 00:00:00`,
  };
}

async function _get(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → status ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) throw new Error('PCC session expired');
  return html;
}

async function _post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC POST ${url} → status ${res.status}`);
  const html = await res.text();
  _dlog('POST', url.replace(/\?.*/, ''), '→', res.status, '| resp:', html.slice(0, 200).replace(/\s+/g, ' ').trim());
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) throw new Error('PCC session expired');
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }
  // Plain-text refusal (200, no errormsg class) — a wizard write against a focus PCC
  // thinks is gone. Never silently count it as saved.
  if (/will not be saved/i.test(html) || /related focus has been (deleted|resolved)/i.test(html)) {
    const m = html.match(/\*\*\*\s*([^<\n]{5,160})/);
    throw new Error(`PCC refused save: ${m ? m[1].trim() : 'related focus unavailable'}`);
  }
  // res.url is the FINAL url after fetch follows any 302 — the save redirect carries the
  // committed focus id, so callers parse it with parseWizardIds.
  return { html, url: res.url };
}

/**
 * Add a focus + its library goals + library interventions through PCC's wizard.
 * `goalStdIds` / `interventionStdIds` are the PCC std ids (the backend's libraryStdId)
 * checked as `chkbox`. Returns { focusId, goalsStamped, interventionsStamped, errors }.
 *
 * The focus create+save throws on failure (no focus → caller records a focus error).
 * Goal + intervention batches are caught here so one refusal doesn't sink the other.
 */
export async function stampLibraryFocus({
  patientId,
  careplanId,
  miniToken,
  stdNeedId,
  description,
  reviewDepartments,
  goalStdIds = [],
  interventionStdIds = [],
}) {
  const out = { focusId: null, goalsStamped: 0, interventionsStamped: 0, errors: [] };
  const dates = _todayDates();

  // 1 + 2. Create the draft, then commit our wording onto it (both in wizard mode).
  const createUrl = buildFocusCreateUrl({ stdNeedId, clientId: patientId, careplanId });
  const createHtml = await _get(createUrl);
  const draftId = parseNewFocusId(createHtml, createUrl);
  _dlog('stampLibraryFocus: stdNeedId=', stdNeedId, '→ draft focusId=', draftId);
  if (!draftId) throw new Error('Library focus: PCC returned no draft id from create');
  const saved = await _post(
    NEEDEDIT_URL,
    buildFocusSaveBody({ genNeedId: draftId, stdNeedId, description, reviewDepartments: reviewDepartments || [], clientId: patientId, careplanId, miniToken, dates }),
  );

  // PCC RE-KEYS the focus on save: the draft (620064) is retired and a COMMITTED id
  // (620074) is minted. It comes back in the 302 redirect (goalwizard?ESOLgenneedid=…),
  // which fetch has already followed → it's in saved.url. Goals/interventions MUST target
  // that committed genneedid (with the draft as needid), or PCC 200s "the related focus
  // has been deleted" and nothing attaches. This was the whole bug. See cp_test.har.
  const committed = parseWizardIds(saved.url);
  const genNeedId = committed.genNeedId || draftId;
  const needId = committed.needId || draftId;
  out.focusId = genNeedId;
  _dlog(`stampLibraryFocus: draft ${draftId} → committed genneedid ${genNeedId} (needid ${needId})`);

  // 3 + 4. Goals — prime the wizard, then batch-check all library goal ids in one POST.
  if (goalStdIds.length) {
    try {
      await _get(buildGoalWizardUrl({ genNeedId, needId, stdNeedId, clientId: patientId, careplanId }));
      await _post(
        GOALWIZARD_URL,
        buildGoalWizardBody({ genNeedId, needId, stdNeedId, clientId: patientId, careplanId, miniToken, goalStdIds, focusDescription: description }),
      );
      out.goalsStamped = goalStdIds.length;
      _dlog(`stampLibraryFocus: ${goalStdIds.length} goal(s) added to focus ${genNeedId}`);
    } catch (e) {
      out.errors.push({ phase: 'goal', error: e.message });
      _dlog('stampLibraryFocus: goal wizard FAILED:', e.message);
    }
  }

  // 5 + 6. Interventions — same shape as goals.
  if (interventionStdIds.length) {
    try {
      await _get(buildInterWizardUrl({ genNeedId, needId, stdNeedId, clientId: patientId, careplanId }));
      await _post(
        INTERWIZARD_URL,
        buildInterWizardBody({ genNeedId, needId, stdNeedId, clientId: patientId, careplanId, miniToken, interventionStdIds, dates }),
      );
      out.interventionsStamped = interventionStdIds.length;
      _dlog(`stampLibraryFocus: ${interventionStdIds.length} intervention(s) added to focus ${genNeedId}`);
    } catch (e) {
      out.errors.push({ phase: 'intervention', error: e.message });
      _dlog('stampLibraryFocus: intervention wizard FAILED:', e.message);
    }
  }

  return out;
}

if (typeof window !== 'undefined') {
  window.CarePlanLibraryStamp = { stampLibraryFocus };
}
