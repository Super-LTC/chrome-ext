/**
 * Create a single UDA (interview assessment) for a resident by replaying PCC's
 * newassess.jsp save as a same-origin POST. No PCC page JS touched.
 *
 * Mirrors the captured curl:
 *   POST /care/chart/assess/newassess.jsp?ESOLtabType=C&ESOLsave=S
 *   body: ESOLminiToken, ESOLclientid, std_assessment, assess_date, hour, minute,
 *         assessment_type=O, + the form's hidden defaults.
 *
 * Exports on window.MdsSchedulerCreate:
 *   createUda({ patientId, stdAssessmentId, assessDatePcc, miniToken? }) → true | throws
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

/** Re-scrape a fresh miniToken from a newassess.jsp GET for this client. */
async function _freshMiniToken(patientId) {
  const html = await _fetchText(`${NEWASSESS}?ESOLsave=N&ESOLtabType=C&ESOLclientid=${encodeURIComponent(patientId)}`);
  const m = html.match(/name="ESOLminiToken"\s+value="([^"]+)"/);
  if (!m) throw new Error('Could not find ESOLminiToken on newassess form');
  return m[1];
}

async function createUda({ patientId, stdAssessmentId, assessDatePcc, miniToken }) {
  const token = miniToken || (await _freshMiniToken(patientId));
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
    assess_date: assessDatePcc,            // M/D/YYYY
    assess_date_dummy: assessDatePcc,
    hour: '9',
    minute: '0',
    std_assessment: String(stdAssessmentId),
    assessment_type: 'O',                  // UDA → "Other"
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
  return true;
}

/**
 * picks: [{ type, stdAssessmentId, assessDatePcc, label }]
 * Sequential to keep PCC happy + progress simple. One fresh token reused.
 */
async function scheduleInterviews({ patientId, picks, onProgress }) {
  const result = { ok: true, created: [], errors: [] };
  let token = null;
  try { token = await _freshMiniToken(patientId); } catch (_) { token = null; }
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    onProgress?.({ index: i, total: picks.length, type: p.type, label: p.label, phase: 'creating' });
    try {
      await createUda({ patientId, stdAssessmentId: p.stdAssessmentId, assessDatePcc: p.assessDatePcc, miniToken: token });
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
