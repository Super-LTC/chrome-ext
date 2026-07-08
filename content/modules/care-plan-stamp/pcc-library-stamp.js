// content/modules/care-plan-stamp/pcc-library-stamp.js
//
// LIBRARY-add stamp path (SUP-54). Adds a proposed focus + its goals + interventions
// to PCC AS LIBRARY ITEMS (std-id-linked), not custom — so wording matches the
// facility's library and the items are recognized as theirs. Used by orchestrateStamp
// whenever a focus carries `libraryStdId`; otherwise the existing custom path runs.
//
// Endpoints + params mirror REAL PCC write curls captured 2026-07-07 (org eac / lib 8):
//   focus:  needwizard → etiologieswizard → neededit_rev.jsp (create, ESOLnewFocus=true)
//                                          → neededit_rev.jsp (edit: our text + review depts)
//   goals:  goalwizard_rev.jsp   (ESOLsave=Y, chkbox=<stdGoalId…>)
//   interv: interwizard_rev.jsp  (ESOLsave=Y, chkbox=<stdInterId…>)
//
// Pure body-builders + parse are ES-exported (unit-tested, no DOM). The fetch-driven
// createLibraryFocus/addLibraryGoals/addLibraryInterventions attach to
// window.CarePlanLibraryStamp.
//
// VALIDATION POINTS (confirm on the first real test-patient write):
//   (1) neededit "create" posted directly (no etiologieswizard nav) — the create curl
//       is self-contained (miniToken handles CSRF); if PCC requires the nav first, add it.
//   (2) MVP sends NO etiology checkboxes — the full r/t rides in our cp_description on the
//       edit. If PCC requires >=1 etiology to create, wire etiology ids through + select.
//   (3) ESOLreviewid=-1 (auto-pop is not inside a care-plan review).

const NEEDEDIT_URL = '/care/chart/cp/neededit_rev.jsp';
const GOALWIZARD_URL = '/care/chart/cp/goalwizard_rev.jsp';
const INTERWIZARD_URL = '/care/chart/cp/interwizard_rev.jsp';

// ============================== pure body builders ==============================

/** neededit CREATE — a NEW library focus. Empty ESOLtext1 → PCC assembles stem+etiologies. */
export function buildFocusCreateBody({ stdNeedId, etiologyIds = [], text = '', clientId, careplanId, miniToken }) {
  const body = new URLSearchParams({
    ESOLstdneedid: String(stdNeedId),
    ESOLgenneedid: '-1',
    ESOLneedid: '-1',
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'Y',
    ESOLminiToken: miniToken,
    ESOLpage: 'careplandetail_rev',
    ESOLreviewid: '-1',
    ESOLtext1: text || '',
    ESOLnewFocus: 'true',
  });
  for (const id of etiologyIds) body.append('chkbox', String(id));
  return body;
}

/** neededit EDIT — set our wording + review departments + initiation date on the new focus. */
export function buildFocusEditBody({ genNeedId, stdNeedId, description, reviewDepartments = [], clientId, dates, miniToken }) {
  const slots = [0, 1, 2, 3, 4].map((i) => (reviewDepartments[i] != null ? String(reviewDepartments[i]) : ''));
  return new URLSearchParams({
    ESOLcareplanid: '-1',
    ESOLclientid: String(clientId),
    ESOLstdneedid: String(stdNeedId),
    ESOLgenneedid: String(genNeedId),
    ESOLwizard: 'N',
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

/** goalwizard save — attach the checked library goals to the focus. */
export function buildGoalWizardBody({ genNeedId, needId, stdNeedId, goalStdIds = [], focusDescription = '', clientId, careplanId, miniToken }) {
  const body = new URLSearchParams({
    ESOLstdneedid: String(stdNeedId),
    ESOLneedid: String(needId),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'N',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLgenneedid: String(genNeedId),
    ESOLreviewid: '-1',
    focus: focusDescription || '',
  });
  for (const id of goalStdIds) body.append('chkbox', String(id));
  return body;
}

/** interwizard save — attach the checked library interventions to the focus. */
export function buildInterWizardBody({ genNeedId, needId, stdNeedId, interStdIds = [], clientId, careplanId, miniToken, dates }) {
  const body = new URLSearchParams({
    ESOLstdneedid: String(stdNeedId),
    ESOLneedid: String(needId),
    ESOLcareplanid: String(careplanId),
    ESOLclientid: String(clientId),
    ESOLwizard: 'N',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLgenneedid: String(genNeedId),
    ESOLresnewstdtask: 'null',
    ESOLisstdTask: 'N',
    ESOLfocusdate: dates.date,
    ESOLfromPage: '',
    ESOLreviewid: '-1',
    initDate: dates.date,
    initDate_dummy: dates.dateDummy,
  });
  for (const id of interStdIds) body.append('chkbox', String(id));
  return body;
}

/**
 * Recover the new focus id after create. PCC returns it as genneedid==needid —
 * via a redirect to goalwizard (response.url) or embedded in the response html
 * (ESOLlastneed like the custom flow, or an ESOLgenneedid link). null if absent.
 */
export function parseNewFocusId(html, responseUrl) {
  const fromUrl = String(responseUrl || '').match(/ESOLgenneedid=(\d+)/);
  if (fromUrl && fromUrl[1] !== '-1') return fromUrl[1];
  const lastNeed = String(html || '').match(/ESOLlastneed\.value\s*=\s*"(\d+)"/);
  if (lastNeed && lastNeed[1] !== '-1') return lastNeed[1];
  const genNeed = String(html || '').match(/ESOLgenneedid=(\d+)/);
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

/**
 * Split proposed goals/interventions into the library ones (batch-added by std id
 * via the wizard) and the custom ones (AI-authored / off-library → custom endpoint).
 */
export function partitionByLibrary(items = []) {
  const libraryStdIds = [];
  const custom = [];
  for (const it of items || []) {
    if (it && _hasStdId(it.libraryStdId)) libraryStdIds.push(String(it.libraryStdId));
    else custom.push(it);
  }
  return { libraryStdIds, custom };
}

// ============================ fetch-driven (content script) ============================

function _todayDates() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return { date: `${mm}/${dd}/${yyyy}`, dateDummy: `${d.getMonth() + 1}/${d.getDate()}/${yyyy}` };
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
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) throw new Error('PCC session expired');
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }
  return { html, url: res.url };
}

/**
 * Create a library-linked focus, then set our wording + review departments.
 * Returns the new genNeedId (== needId for a fresh focus).
 */
export async function createLibraryFocus({ patientId, careplanId, miniToken, stdNeedId, description, etiologyIds, reviewDepartments }) {
  const created = await _post(
    NEEDEDIT_URL,
    buildFocusCreateBody({ stdNeedId, etiologyIds: etiologyIds || [], text: '', clientId: patientId, careplanId, miniToken }),
  );
  const genNeedId = parseNewFocusId(created.html, created.url);
  if (!genNeedId) throw new Error('Library focus created but PCC did not return a new focus id');
  await _post(
    NEEDEDIT_URL,
    buildFocusEditBody({ genNeedId, stdNeedId, description, reviewDepartments: reviewDepartments || [], clientId: patientId, dates: _todayDates(), miniToken }),
  );
  return genNeedId;
}

/** Add the given library std goals to a focus (single batch POST). Returns count added. */
export async function addLibraryGoals({ patientId, careplanId, miniToken, genNeedId, needId, stdNeedId, goalStdIds, focusDescription }) {
  if (!goalStdIds || goalStdIds.length === 0) return 0;
  await _post(
    GOALWIZARD_URL,
    buildGoalWizardBody({ genNeedId, needId: needId ?? genNeedId, stdNeedId, goalStdIds, focusDescription, clientId: patientId, careplanId, miniToken }),
  );
  return goalStdIds.length;
}

/** Add the given library std interventions to a focus (single batch POST). Returns count added. */
export async function addLibraryInterventions({ patientId, careplanId, miniToken, genNeedId, needId, stdNeedId, interStdIds }) {
  if (!interStdIds || interStdIds.length === 0) return 0;
  await _post(
    INTERWIZARD_URL,
    buildInterWizardBody({ genNeedId, needId: needId ?? genNeedId, stdNeedId, interStdIds, clientId: patientId, careplanId, miniToken, dates: _todayDates() }),
  );
  return interStdIds.length;
}

if (typeof window !== 'undefined') {
  window.CarePlanLibraryStamp = { createLibraryFocus, addLibraryGoals, addLibraryInterventions };
}
