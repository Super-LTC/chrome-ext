/**
 * Read the New/Change MDS popup's form + page context.
 * Facility lives in the OPENER window (the popup is a bare form), org is in
 * same-origin localStorage, patient id is in the form/URL.
 *
 * Exports on window.MdsSchedulerForm:
 *   readFormState() → { patientId, ard, a0310a, a0310b, a0310c, a0310f, a0310g,
 *                       miniToken, operation, facilityName, orgSlug }
 */
function _val(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? (el.value || '') : '';
}

function _resolvePatientId() {
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (fromUrl) return fromUrl;
  return _val('ESOLclientid') || null;
}

function _facilityFromOpener() {
  // getChatFacilityInfo() reads #pccFacLink, which is in the MAIN window, not
  // this popup. Reach into the opener (same origin). Fall back to local helper.
  try {
    const link = window.opener?.document?.getElementById('pccFacLink');
    if (link) return link.title || link.textContent?.trim() || '';
  } catch (_) { /* cross-window access can throw if opener navigated */ }
  if (typeof getChatFacilityInfo === 'function') return getChatFacilityInfo() || '';
  return '';
}

function readFormState() {
  return {
    patientId: _resolvePatientId(),
    ard: _val('ard'),
    a0310a: _val('a0310a'),
    a0310b: _val('a0310b'),
    a0310c: _val('a0310c'),
    a0310f: _val('a0310f'),
    a0310g: _val('a0310g'),
    a0310h: _val('a0310h'),   // SNF Part A PPS Discharge (radio: 0/1) — affects discharge GG
    miniToken: _val('ESOLminiToken'),
    operation: _val('operation'),         // 'N' new, 'X' change
    facilityName: _facilityFromOpener(),
    orgSlug: (typeof getOrg === 'function' ? (getOrg()?.org || '') : ''),
  };
}

window.MdsSchedulerForm = { readFormState };
