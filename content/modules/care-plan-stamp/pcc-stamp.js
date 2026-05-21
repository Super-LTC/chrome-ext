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
 */

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
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  // PCC's pccMessage error block (rare but possible — e.g. duplicate, validation).
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
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

/**
 * Orchestrate the full stamp for a proposal.
 *
 * Sequential — each focus must complete before its goals/interventions can chain
 * to it, and we don't parallelize across focuses to keep PCC happy and progress
 * UX simple. Errors are captured per-focus; no rollback (per backend agent's call).
 */
async function orchestrateStamp({ proposal, careplanId, miniToken, deptNames, onProgress }) {
  const focuses = (proposal.focuses || []).filter((f) => !f._skipped);
  const result = {
    ok: true,
    focusesStamped: 0,
    goalsStamped: 0,
    interventionsStamped: 0,
    errors: [],
  };

  const t0 = Date.now();

  for (let i = 0; i < focuses.length; i++) {
    const focus = focuses[i];
    const phaseBase = { focusIndex: i, focusTotal: focuses.length, ruleId: focus.ruleId, ruleLabel: focus.description.slice(0, 60) };

    onProgress?.({ ...phaseBase, phase: 'focus' });

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
    } catch (e) {
      result.ok = false;
      result.errors.push({ ruleId: focus.ruleId, phase: 'focus', error: e.message });
      continue; // can't stamp goals/interventions without a focus ID
    }

    // Goals
    const goals = focus.goals || [];
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
      }
    }

    // Interventions
    const inters = focus.interventions || [];
    for (let v = 0; v < inters.length; v++) {
      const inter = inters[v];
      onProgress?.({ ...phaseBase, phase: 'intervention', subIndex: v, subTotal: inters.length });
      try {
        // Migration: if intervention has `positions[]`, use that; else fall back
        // to `positionOne` (legacy from current backend proposal API).
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
      }
    }
  }

  result.durationMs = Date.now() - t0;
  return result;
}

window.CarePlanStampClient = {
  createCustomFocus,
  createCustomGoal,
  createCustomIntervention,
  orchestrateStamp,
};
