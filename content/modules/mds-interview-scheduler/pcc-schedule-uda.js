/**
 * Create a single UDA (interview assessment) for a resident by replaying PCC's
 * newassess.jsp save as a same-origin POST. No PCC page JS touched.
 *
 * Mirrors the captured save:
 *   POST /care/chart/assess/newassess.jsp?ESOLtabType=C&ESOLsave=S
 *   body: ESOLminiToken, ESOLclientid, std_assessment, assess_date, hour, minute,
 *         assessment_type=O, + the form's hidden defaults.
 *
 * Exports on window.MdsSchedulerCreate:
 *   createUda({ patientId, stdAssessmentId, assessDatePcc, miniToken?, hour?, minute? }) → true | throws
 *   scheduleInterviews({ patientId, picks, onProgress }) → { ok, created, errors }
 */
const NEWASSESS = '/care/chart/assess/newassess.jsp';

async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

/** The pre-selected value of a <select> in the fetched form (PCC marks the
 *  facility's current hour/minute SELECTED). Handles `SELECTED` and `selected=""`. */
function _selectedOption(html, name) {
  const block = html.match(new RegExp(`<select name="${name}"[^>]*>([\\s\\S]*?)</select>`, 'i'));
  if (!block) return null;
  const opt = block[1].match(/<option value="(\d+)"[^>]*\bselected/i);
  return opt ? opt[1] : null;
}

/**
 * GET a fresh newassess form for this client and read what we need from it:
 *   - ESOLminiToken (single-use save token)
 *   - the facility's CURRENT hour/minute (PCC pre-selects "now"). We MUST submit a
 *     time at or before now — a hardcoded 09:00 gets rejected as "in the future"
 *     when the facility clock is earlier in the day.
 */
async function _freshFormState(patientId) {
  const html = await _fetchText(`${NEWASSESS}?ESOLsave=N&ESOLtabType=C&ESOLclientid=${encodeURIComponent(patientId)}`);
  const m = html.match(/name="ESOLminiToken"\s+value="([^"]+)"/);
  if (!m) throw new Error('Could not find ESOLminiToken on newassess form');
  const now = new Date();
  const hour = _selectedOption(html, 'hour') ?? String(now.getHours());
  const minute = _selectedOption(html, 'minute') ?? String(now.getMinutes());
  return { token: m[1], hour, minute };
}

/** PCC's hidden assess_date is zero-padded MM/DD/YYYY (the dummy field is the
 *  unpadded human value). Match that exactly. */
function _padPccDate(d) {
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : String(d);
}

async function createUda({ patientId, stdAssessmentId, assessDatePcc, miniToken, hour, minute }) {
  let token = miniToken, h = hour, mm = minute;
  if (!token || h == null || mm == null) {
    const fs = await _freshFormState(patientId);
    token = token || fs.token;
    h = h ?? fs.hour;
    mm = mm ?? fs.minute;
  }
  const body = new URLSearchParams({
    ESOLminiToken: token,
    fromUDAPortal: 'N',
    ESOLclientid: String(patientId),
    ESOLsave: 'N',
    ESOLassessid: 'null',
    ESOLviewTransferInfo: 'N',
    retURL: '/admin/client/cp_assessment.jsp',
    fromMDSRaps: 'N',
    ESOLinquiryid: '-1',
    ESOLcrmentityid: '-1',
    ESOLrefreshautofill: 'N',
    fromMDS3SectionV: 'null',
    ESOLmdsAssessId: 'null',
    earliest: '',
    fromeInteractTransferForm: 'null',
    assess_date: _padPccDate(assessDatePcc), // hidden field: zero-padded MM/DD/YYYY
    assess_date_dummy: assessDatePcc,        // human field: unpadded M/D/YYYY
    hour: String(h),                         // facility "now" — never a future time
    minute: String(mm),
    std_assessment: String(stdAssessmentId),
    assessment_type: 'O',                    // UDA → "Other"
  });
  const res = await fetch(`${NEWASSESS}?ESOLtabType=C&ESOLsave=S`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC newassess POST → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }
  // PCC returns the newassess form HTML even on a SUCCESSFUL save (it serves a
  // fresh "add another" form + reloads the opener), so the form being present is
  // NOT a failure signal. A real failure surfaces as errormsg / login / non-200.
  return true;
}

/**
 * picks: [{ type, stdAssessmentId, assessDatePcc, label }]
 * Sequential to keep PCC happy + progress simple. Each createUda fetches its OWN
 * fresh form state (single-use miniToken + the facility's current time), so the
 * save time is never in the future and tokens aren't reused.
 */
async function scheduleInterviews({ patientId, picks, onProgress }) {
  const result = { ok: true, created: [], errors: [] };
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'creating' });
    try {
      await createUda({ patientId, stdAssessmentId: p.stdAssessmentId, assessDatePcc: p.assessDatePcc });
      result.created.push(p.type);
      onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'done' });
    } catch (e) {
      result.ok = false;
      result.errors.push({ type: p.type, error: e.message });
      onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'error', error: e.message });
    }
  }
  return result;
}

window.MdsSchedulerCreate = { createUda, scheduleInterviews };
