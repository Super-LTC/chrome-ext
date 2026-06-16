/**
 * Fetch + parse the facility's UDA assessment library from PCC's newassess.jsp.
 * Same-origin GET using session cookies (mirrors care-plan-stamp/pcc-discover).
 *
 * Exports on window.MdsSchedulerLibrary:
 *   fetchAssessmentLibrary(patientId) → [{ id, label }]   (std_assessment options)
 */
async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

async function fetchAssessmentLibrary(patientId) {
  // newassess.jsp renders the std_assessment <select> for this client.
  const url = `/care/chart/assess/newassess.jsp?ESOLsave=N&ESOLtabType=C&ESOLclientid=${encodeURIComponent(patientId)}`;
  const html = await _fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sel = doc.querySelector('select[name="std_assessment"]');
  if (!sel) return [];
  return Array.from(sel.options)
    .filter((o) => o.value && o.value !== '' && o.value !== '-1')
    .map((o) => ({ id: o.value, label: (o.textContent || '').trim() }));
}

window.MdsSchedulerLibrary = { fetchAssessmentLibrary };
