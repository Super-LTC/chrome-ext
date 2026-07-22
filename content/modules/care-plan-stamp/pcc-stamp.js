/**
 * PCC stamping client for Care Plan Auto-Pop.
 *
 * Same-origin POSTs to PCC's three JSP endpoints, sequentially per focus:
 *   focus → goals → interventions
 *
 * Response parsing: PCC echoes a `refreshParent()` script in the response body
 * after a successful save. We parse the new IDs out of that script.
 *
 * Exports on `window.CarePlanStampClient`:
 *   - createCustomFocus({...}) → focusId
 *   - createCustomGoal({...}) → goalId | true (true if response shape lacks ID)
 *   - createCustomIntervention({...}) → interId | true
 *   - orchestrateStamp({ proposal, careplanId, miniToken, deptNames, onProgress }) → StampResult
 *
 * SUP-54: when a focus carries `libraryStdId`, the FOCUS + its goals + interventions are
 * added FROM THE FACILITY LIBRARY through PCC's own wizard (neededit → goalwizard →
 * interwizard, one draft id throughout) — see pcc-library-stamp.stampLibraryFocus. The
 * library std ids ride as `chkbox`, so all three are real library items, not custom.
 * Only focuses/goals/interventions WITHOUT a std id (built-in / AI-authored) fall back to
 * the custom endpoints (neededitcust / goaledit / intereditcust).
 */
import { stampLibraryFocus, isLibraryFocus } from './pcc-library-stamp.js';
import { editStampedLibraryTexts } from './pcc-library-edit.js';

// Verbose stamping trace — flip false once the library-add path is confirmed in real
// PCC. Logs every PCC POST (url / status / response snippet) + per-item outcome as
// [cp-stamp]. The response snippet is the tell: a 200 that attached nothing looks
// different from a 200 that did.
const STAMP_DEBUG = true;
function _dlog(...args) {
  if (STAMP_DEBUG) console.log('[cp-stamp]', ...args);
}

const FOCUS_URL = '/care/chart/cp/neededitcust_rev.jsp';
const GOAL_URL = '/care/chart/cp/goaledit_rev.jsp';
const INTERVENTION_URL = '/care/chart/cp/intereditcust_rev.jsp';

// Default dept name map for this org's Review Department dropdown.
// Used to build `departmentDescriptions` which PCC echoes back in its UI.
// Caller can override via deptNames param. If a position_id isn't in the map,
// we fall back to "Unknown" — PCC accepts this since the position_id_* is what matters.
const DEFAULT_DEPT_NAMES = {
  9042: 'Nursing',
  9043: 'Dietary',
  9045: 'Activities',
  9106: 'Therapy',
  9123: 'Social Services',
  10632: 'NP Insight',
  10638: 'Restorative Nursing',
  10643: 'Care Team',
  10647: '3rd Party Vendor',
};

function _todayDates() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return {
    date: `${mm}/${dd}/${yyyy}`,         // MM/DD/YYYY (hidden field)
    dateDummy: `${d.getMonth() + 1}/${d.getDate()}/${yyyy}`, // M/D/YYYY (display)
  };
}

function _targetDate90() {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return {
    date: `${mm}/${dd}/${yyyy}`,
    dateDummy: `${d.getMonth() + 1}/${d.getDate()}/${yyyy}`,
  };
}

async function _postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC POST ${url} → status ${res.status}`);
  const html = await res.text();
  _dlog('POST', url, '→', res.status, '| len', html.length, '| resp:', html.slice(0, 240).replace(/\s+/g, ' ').trim());
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  // PCC's pccMessage error block (rare but possible — e.g. duplicate, validation).
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }
  // Plain-text refusal (200, no errormsg class) — e.g. "***The related focus has been
  // deleted. Goal/Intervention will not be saved." Must be treated as a hard failure,
  // never silently counted as saved.
  if (/will not be saved/i.test(html) || /related focus has been (deleted|resolved)/i.test(html)) {
    const m = html.match(/\*\*\*\s*([^<\n]{5,160})/);
    throw new Error(`PCC refused save: ${m ? m[1].trim() : 'related focus unavailable'}`);
  }
  return html;
}

/**
 * Create a custom focus. Returns the new focus ID PCC assigned.
 */
async function createCustomFocus({ patientId, careplanId, miniToken, description, reviewDepartments, deptNames }) {
  const { date, dateDummy } = _todayDates();
  const names = { ...DEFAULT_DEPT_NAMES, ...(deptNames || {}) };
  const slots = [0, 1, 2, 3, 4].map((i) => reviewDepartments[i] != null ? String(reviewDepartments[i]) : '');
  const deptDescriptions = slots
    .filter(Boolean)
    .map((id) => `${names[Number(id)] || 'Unknown'}=${id};`)
    .join('');

  const body = new URLSearchParams({
    ESOLclientid: String(patientId),
    ESOLsave: 'Y',
    departmentDescriptions: deptDescriptions,
    ESOLminiToken: miniToken,
    ESOLcareplanid: String(careplanId),
    resolved_date: '',
    date_initiated: date,
    date_initiated_dummy: dateDummy,
    cp_description: description,
    carePlanTypeIds: '',
    position_id_one: slots[0],
    position_id_two: slots[1],
    position_id_three: slots[2],
    position_id_four: slots[3],
    position_id_five: slots[4],
  });

  const url = `${FOCUS_URL}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLreviewid=-1&ESOLcareplanid=${encodeURIComponent(careplanId)}`;
  const html = await _postForm(url, body);

  // Successful save embeds: ow.document.needs.ESOLlastneed.value = "929781";
  const m = html.match(/ESOLlastneed\.value\s*=\s*"(\d+)"/);
  if (!m || m[1] === '' || m[1] === '-1') {
    throw new Error('Focus saved but PCC did not return a new focus ID');
  }
  return m[1];
}

/**
 * Create a custom goal under a focus. v0 doesn't chain anything off the goal ID,
 * so we return `true` on success rather than failing if the regex doesn't match.
 */
async function createCustomGoal({ patientId, focusId, miniToken, description, focusDescription }) {
  const { date, dateDummy } = _todayDates();
  const target = _targetDate90();

  const body = new URLSearchParams({
    ESOLcareplanid: '-1',
    ESOLclientid: String(patientId),
    ESOLstdneedid: '-1',
    ESOLgoalid: '-1',
    ESOLstdgoalid: '-1',
    ESOLrow: 'null',
    ESOLsave: 'Y',
    ESOLrefresh: 'N',
    ESOLminiToken: miniToken,
    ESOLneedid: String(focusId),
    ESOLcustomgoal: 'Y',
    ESOLgenneedid: String(focusId),
    ESOLreviewid: '-1',
    focusDescription: focusDescription || '',
    resolved_type: '',
    resolved_date: '',
    date_initiated: date,
    date_initiated_dummy: dateDummy,
    target_date: target.date,
    target_date_dummy: target.dateDummy,
    cp_description: description,
  });

  const html = await _postForm(GOAL_URL, body);

  // Best-effort ID extraction. If PCC's response shape for goals echoes
  // ESOLlastgoal differently, we still treat HTTP 200 + non-error as success.
  const m = html.match(/ESOLlastgoal\.value\s*=\s*"(\d+)"/);
  return m && m[1] && m[1] !== '-1' ? m[1] : true;
}

/**
 * Create a custom intervention under a focus. Same return convention as goal.
 *
 * Positions: pass `positions: number[]` (1-5 items) — PCC supports up to 5 slots.
 * Legacy callers passing `positionOne` are still accepted and treated as positions[0].
 */
async function createCustomIntervention({ patientId, focusId, miniToken, description, instruction, kardexCategory, positions, positionOne }) {
  const { date, dateDummy } = _todayDates();

  // Backward compat — if positions[] not passed, fall back to positionOne (legacy field).
  const positionList = Array.isArray(positions) && positions.length > 0
    ? positions
    : (positionOne != null ? [positionOne] : []);
  // Pad to 5 slots with -1 (PCC's "not selected" sentinel)
  const slot = (i) => positionList[i] != null ? String(positionList[i]) : '-1';

  const body = new URLSearchParams({
    ESOLquestion: '',
    std_freq_id: '-1',
    ESOLclientid: String(patientId),
    ESOLneedid: String(focusId),
    retURL: '',
    ESOLpositionid: '-1',
    ESOLpositionid2: '-1',
    ESOLpositionid3: '-1',
    ESOLpositionid4: '-1',
    ESOLpositionid5: '-1',
    ESOLinitdate: '',
    ESOLresdate: '',
    ESOLinterid: '-1',
    ESOLdesc: '',
    ESOLrow: 'null',
    ESOLsave: 'Y',
    ESOLminiToken: miniToken,
    ESOLrefresh: 'false',
    ESOLpage: 'interedit',
    ESOLnewsched: '',
    ESOLgenneedid: String(focusId),
    ESOLscheduleid: '',
    ESOListask: 'N',
    ESOLresnewcustask: 'null',
    ESOLfocustext: '',
    ESOLstdfocusid: '',
    ESOLstdneedid: '-1',
    currentFreqId: '',
    ESOLrefreshAfterSetFreq: '-1',
    ESOLfocusdate: date.replace(/^0/, '').replace(/\/0/, '/'), // PCC expects M/D/YYYY here
    ESOLfromPage: '',
    resolved_date: '',
    date_initiated: date,
    date_initiated_dummy: dateDummy,
    cp_description: description,
    instruction: instruction || '',
    category_id: kardexCategory != null ? String(kardexCategory) : '-1',
    fsttype_id: '-1',
    oldfsstype_id: '-1',
    position_id: slot(0),
    position_id_2: slot(1),
    position_id_3: slot(2),
    position_id_4: slot(3),
    position_id_5: slot(4),
    iconId: '-1',
  });

  const html = await _postForm(INTERVENTION_URL, body);

  const m = html.match(/ESOLlastinter\.value\s*=\s*"(\d+)"/);
  return m && m[1] && m[1] !== '-1' ? m[1] : true;
}

/** A usable PCC std id: present, non-empty, not the "-1" custom sentinel. */
function _hasStd(id) {
  return id != null && String(id) !== '' && String(id) !== '-1';
}

/**
 * Stamp goals + interventions onto an EXISTING focus id via the custom endpoints
 * (goaledit / intereditcust). Used for non-library focuses and for the odd library
 * item that has no std id. Mutates `result` (counts + errors) in place.
 */
async function _stampCustomItems({ proposal, focus, focusId, miniToken, goals, interventions, result, phaseBase, onProgress }) {
  for (let g = 0; g < goals.length; g++) {
    onProgress?.({ ...phaseBase, phase: 'goal', subIndex: g, subTotal: goals.length });
    try {
      await createCustomGoal({
        patientId: proposal.patientId,
        focusId,
        miniToken,
        description: goals[g].description,
        focusDescription: focus.description,
      });
      result.goalsStamped += 1;
    } catch (e) {
      result.ok = false;
      result.errors.push({ ruleId: focus.ruleId, phase: 'goal', error: e.message });
      _dlog('custom goal FAILED:', e.message);
    }
  }
  for (let v = 0; v < interventions.length; v++) {
    const inter = interventions[v];
    onProgress?.({ ...phaseBase, phase: 'intervention', subIndex: v, subTotal: interventions.length });
    try {
      const positionList = Array.isArray(inter.positions) && inter.positions.length > 0
        ? inter.positions
        : (inter.positionOne != null ? [inter.positionOne] : []);
      await createCustomIntervention({
        patientId: proposal.patientId,
        focusId,
        miniToken,
        description: inter.description,
        instruction: inter.instruction,
        kardexCategory: inter.kardexCategory,
        positions: positionList,
      });
      result.interventionsStamped += 1;
    } catch (e) {
      result.ok = false;
      result.errors.push({ ruleId: focus.ruleId, phase: 'intervention', error: e.message });
      _dlog('custom intervention FAILED:', e.message);
    }
  }
}

/**
 * Orchestrate the full stamp for a proposal.
 *
 * Sequential — each focus must complete before its goals/interventions can chain
 * to it, and we don't parallelize across focuses to keep PCC happy and progress
 * UX simple. Errors are captured per-focus; no rollback (per backend agent's call).
 */
export async function orchestrateStamp({ proposal, careplanId, miniToken, deptNames, onProgress }) {
  const focuses = (proposal.focuses || []).filter((f) => !f._skipped);
  const result = {
    ok: true,
    focusesStamped: 0,
    goalsStamped: 0,
    interventionsStamped: 0,
    errors: [],
  };

  const t0 = Date.now();
  _dlog('START build=wizard-committedid-2026-07-08', { patientId: proposal.patientId, careplanId, focuses: focuses.length });

  for (let i = 0; i < focuses.length; i++) {
    const focus = focuses[i];
    const phaseBase = { focusIndex: i, focusTotal: focuses.length, ruleId: focus.ruleId, ruleLabel: focus.description.slice(0, 60) };
    const library = isLibraryFocus(focus);
    const goals = focus.goals || [];
    const inters = focus.interventions || [];

    onProgress?.({ ...phaseBase, phase: 'focus' });
    _dlog(`focus[${i}]`, focus.ruleId, library ? 'LIBRARY' : 'custom', 'stdId=' + focus.libraryStdId,
      'goals=' + goals.length, 'interv=' + inters.length);

    // SUP-54 library path: focus + its library goals/interventions go through PCC's own
    // wizard in one shot (see stampLibraryFocus) — library linkage + the facility's own
    // position/kardex auto-config are the point, so EVERY std-id item stays a chkbox add.
    // The chkbox stamps LIBRARY text verbatim, so personalized items (name fills,
    // completed (specify) blanks, nurse edits) get a POST-ADD EDIT of their stamped text
    // (see pcc-library-edit.js) — same as a nurse adding from the library then editing.
    if (library) {
      const libGoalIds = goals.filter((g) => _hasStd(g.libraryStdId)).map((g) => String(g.libraryStdId));
      const libInterIds = inters.filter((v) => _hasStd(v.libraryStdId)).map((v) => String(v.libraryStdId));
      const customGoals = goals.filter((g) => !_hasStd(g.libraryStdId));
      const customInters = inters.filter((v) => !_hasStd(v.libraryStdId));
      // Personalizations owed after the add: what PCC stamped (libraryText from the
      // backend, or the payload text when only ext-side fills/edits changed it) → what
      // the nurse approved (the composed text; desc+instruction re-joined — the split
      // only exists for custom-field caps, the library item is one text).
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const owedEdits = [...goals, ...inters]
        .filter((item) => _hasStd(item.libraryStdId))
        .map((item) => ({
          libraryText: item.libraryText ?? item._payloadDescription ?? null,
          targetText: [item.description, item.instruction].filter(Boolean).join(' '),
        }))
        .filter((e) => e.libraryText && norm(e.libraryText) !== norm(e.targetText));
      _dlog(`focus[${i}] library adds: ${libGoalIds.length} goals + ${libInterIds.length} interventions · ` +
        `${owedEdits.length} personalization edit(s) owed · ${customGoals.length}/${customInters.length} custom stragglers`);

      let focusId;
      try {
        onProgress?.({ ...phaseBase, phase: 'goal', subIndex: 0, subTotal: goals.length });
        const r = await stampLibraryFocus({
          patientId: proposal.patientId,
          careplanId,
          miniToken,
          stdNeedId: focus.libraryStdId,
          description: focus.description,
          reviewDepartments: focus.reviewDepartments || [],
          goalStdIds: libGoalIds,
          interventionStdIds: libInterIds,
        });
        focusId = r.focusId;
        result.focusesStamped += 1;
        result.goalsStamped += r.goalsStamped;
        result.interventionsStamped += r.interventionsStamped;
        for (const err of r.errors) {
          result.ok = false;
          result.errors.push({ ruleId: focus.ruleId, phase: err.phase, error: err.error });
        }
        _dlog(`focus[${i}] library stamp → focusId=${focusId}`, r);
        // Personalize the stamped library texts (the nurse's add-then-edit,
        // automated). Best-effort: a miss leaves honest library text on the
        // chart and a warning in errors — never fails the stamp.
        if (owedEdits.length) {
          try {
            const pr = await editStampedLibraryTexts({
              patientId: proposal.patientId,
              careplanId,
              focusId,
              miniToken,
              edits: owedEdits,
            });
            if (pr.failed || pr.unmatched) {
              result.errors.push({
                ruleId: focus.ruleId,
                phase: 'personalize',
                error: `${pr.failed} personalization edit(s) failed, ${pr.unmatched} unmatched — library text left as stamped`,
              });
            }
          } catch (e) {
            _dlog(`focus[${i}] personalization pass failed (library text left as stamped):`, e.message);
            result.errors.push({ ruleId: focus.ruleId, phase: 'personalize', error: e.message });
          }
        }
      } catch (e) {
        result.ok = false;
        result.errors.push({ ruleId: focus.ruleId, phase: 'focus', error: e.message });
        _dlog(`focus[${i}] LIBRARY FOCUS FAILED:`, e.message);
        continue; // no focus id → nothing to attach stragglers to
      }

      // Custom stragglers (rare) — goals/interventions the library row had no std id for.
      await _stampCustomItems({ proposal, focus, focusId, miniToken, goals: customGoals, interventions: customInters, result, phaseBase, onProgress });
      continue;
    }

    // Non-library focus: custom focus + custom goals/interventions (the existing path).
    let focusId;
    try {
      focusId = await createCustomFocus({
        patientId: proposal.patientId,
        careplanId,
        miniToken,
        description: focus.description,
        reviewDepartments: focus.reviewDepartments || [],
        deptNames,
      });
      result.focusesStamped += 1;
      _dlog(`focus[${i}] custom created → focusId=${focusId}`);
    } catch (e) {
      result.ok = false;
      result.errors.push({ ruleId: focus.ruleId, phase: 'focus', error: e.message });
      _dlog(`focus[${i}] CUSTOM CREATE FAILED:`, e.message);
      continue;
    }
    await _stampCustomItems({ proposal, focus, focusId, miniToken, goals, interventions: inters, result, phaseBase, onProgress });
  }

  result.durationMs = Date.now() - t0;
  _dlog('DONE', {
    focusesStamped: result.focusesStamped,
    goalsStamped: result.goalsStamped,
    interventionsStamped: result.interventionsStamped,
    ok: result.ok,
    errors: result.errors,
  });
  return result;
}

if (typeof window !== 'undefined') {
  window.CarePlanStampClient = {
    createCustomFocus,
    createCustomGoal,
    createCustomIntervention,
    orchestrateStamp,
  };
}
