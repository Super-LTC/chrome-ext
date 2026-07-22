/**
 * Mark a single PCC care plan focus as resolved.
 *
 * Strategy: NO hardcoded PCC form constants. We locate the focus's own edit
 * form (custom + library editors both carry `resolved_type`/`resolved_date`),
 * round-trip every field PCC returned, and change ONLY the resolution fields —
 * `resolved_type` is picked from the <select> options PCC itself offers (the
 * option labeled "Resolved…", never a guessed code). After the POST we re-walk
 * the active plan (showresolved=N) and only report ok when the focus is
 * actually gone — a 200 that didn't resolve is a hard error, never a silent
 * success.
 *
 *   resolveFocus({ patientId, careplanId, pccFocusId, pccFocusStdItemId, miniToken })
 *     → Promise<{ ok: true, alreadyResolved?: boolean }>
 *
 * Throws with a specific message on every other outcome (focus not found,
 * no edit form matched, PCC refused, still active after save).
 */

const DETAIL_PATH = '/care/chart/cp/careplandetail_rev.jsp';
const EDITOR_PATHS = [
  '/care/chart/cp/neededitcust_rev.jsp', // custom-focus editor
  '/care/chart/cp/neededit_rev.jsp',     // library-focus editor
];

const RESOLVE_DEBUG = true;
function _dlog(...args) {
  if (RESOLVE_DEBUG) console.log('[cp-resolve]', ...args);
}

async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → status ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

/** Walk plan pages; return the editNeed arg pair for pccFocusId, or null. */
async function _findFocusLink(patientId, pccFocusId, showResolved) {
  const MAX_PAGES = 60;
  let row = 1;
  let prevFirst = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${DETAIL_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLrow=${row}&showresolved=${showResolved}&ESOLsortby=C`;
    const html = await _fetchText(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('a[href*="editNeed("], a[onclick*="editNeed("]');
    if (!links.length) return null;
    for (const a of links) {
      const src = `${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''}`;
      const m = src.match(/editNeed\(\s*['"]?(\d+)['"]?(?:\s*,\s*['"]?(\d+))?/);
      if (!m) continue;
      const pair = { first: m[1], second: m[2] || m[1] };
      if (pair.first === String(pccFocusId) || pair.second === String(pccFocusId)) return pair;
    }
    const firstSrc = links[0].getAttribute('href') || links[0].getAttribute('onclick') || '';
    if (firstSrc === prevFirst) return null; // PCC clamps to last page — same rows again
    prevFirst = firstSrc;
    row += links.length;
  }
  return null;
}

/** All named fields of a form, selects as their selected value, boxes only when checked. */
function _formFields(form) {
  const out = new Map();
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = el.getAttribute('name');
    if (el.tagName === 'SELECT') {
      const sel = el.querySelector('option[selected]') || el.querySelector('option');
      out.set(name, sel ? sel.getAttribute('value') ?? sel.textContent.trim() : '');
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.hasAttribute('checked')) out.set(name, el.getAttribute('value') ?? 'on');
    } else if (el.type !== 'submit' && el.type !== 'button') {
      out.set(name, el.getAttribute('value') ?? el.textContent ?? '');
    }
  }
  return out;
}

/** The resolved_type option PCC offers: prefer a label matching /resolv/i, non-empty value. */
function _pickResolvedType(form) {
  const sel = form.querySelector('select[name="resolved_type"]');
  if (!sel) return null;
  const options = Array.from(sel.querySelectorAll('option'))
    .map((o) => ({ value: (o.getAttribute('value') ?? '').trim(), label: (o.textContent || '').trim() }))
    .filter((o) => o.value !== '');
  if (!options.length) return null;
  const preferred = options.find((o) => /resolv/i.test(o.label));
  return (preferred || options[0]).value;
}

function _todayDates() {
  const d = new Date();
  const yyyy = d.getFullYear();
  return {
    date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${yyyy}`,
    dateDummy: `${d.getMonth() + 1}/${d.getDate()}/${yyyy}`,
  };
}

/**
 * Try each editor path × each id until one returns a form that (a) has the
 * resolution fields and (b) echoes one of our ids in a hidden field — proof
 * it's THIS focus's form, not a blank editor.
 */
async function _findEditForm({ patientId, careplanId, pccFocusStdItemId, ids }) {
  for (const path of EDITOR_PATHS) {
    for (const id of ids) {
      const params = new URLSearchParams({
        ESOLclientid: String(patientId),
        ESOLcareplanid: String(careplanId),
        ESOLneedid: String(id),
        ESOLreviewid: '-1',
      });
      if (pccFocusStdItemId && String(pccFocusStdItemId) !== '-1') {
        params.set('ESOLstdneedid', String(pccFocusStdItemId));
      }
      const url = `${path}?${params.toString()}`;
      let html;
      try {
        html = await _fetchText(url);
      } catch (e) {
        _dlog('editor GET failed', url, e?.message);
        continue;
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const form of doc.querySelectorAll('form')) {
        if (!form.querySelector('select[name="resolved_type"], input[name="resolved_type"]')) continue;
        if (!form.querySelector('[name="resolved_date"]')) continue;
        const fields = _formFields(form);
        const echoes = Array.from(fields.values()).some((v) => ids.includes(String(v)));
        if (!echoes) {
          _dlog('form has resolve fields but does not echo focus id', url);
          continue;
        }
        _dlog('edit form found', url, '| fields', fields.size);
        return { url, form, fields };
      }
    }
  }
  return null;
}

async function resolveFocus({ patientId, careplanId, pccFocusId, pccFocusStdItemId, miniToken }) {
  if (!patientId || !careplanId || !pccFocusId) {
    throw new Error('resolveFocus: missing patientId/careplanId/pccFocusId');
  }

  // 1. Locate the focus on the live plan (both editNeed ids — PCC rows carry
  //    an instance id AND the real need id; either may be what we synced).
  const active = await _findFocusLink(patientId, pccFocusId, 'N');
  if (!active) {
    // Not on the active plan — resolved already? Confirm before claiming so.
    const resolved = await _findFocusLink(patientId, pccFocusId, 'Y');
    if (resolved) {
      _dlog('focus already resolved in PCC — nothing to do');
      return { ok: true, alreadyResolved: true };
    }
    throw new Error('Focus not found on this care plan (active or resolved) — refresh and retry');
  }
  const ids = [...new Set([active.first, active.second, String(pccFocusId)])];

  // 2. The focus's own edit form.
  const hit = await _findEditForm({ patientId, careplanId, pccFocusStdItemId, ids });
  if (!hit) {
    throw new Error('Could not locate the PCC edit form for this focus — resolve it manually this time (and report this: the form layout may have changed)');
  }

  // 3. Round-trip the form; change only the resolution fields.
  const resolvedType = _pickResolvedType(hit.form);
  if (!resolvedType) {
    throw new Error('PCC edit form offers no resolution types — resolve manually');
  }
  const { date, dateDummy } = _todayDates();
  const body = new URLSearchParams();
  for (const [k, v] of hit.fields) body.set(k, v ?? '');
  body.set('ESOLsave', 'Y');
  body.set('resolved_type', resolvedType);
  body.set('resolved_date', date);
  if (hit.fields.has('resolved_date_dummy')) body.set('resolved_date_dummy', dateDummy);
  if (!body.get('ESOLminiToken') && miniToken) body.set('ESOLminiToken', miniToken);

  const res = await fetch(hit.url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const html = await res.text();
  _dlog('resolve POST', hit.url, '→', res.status, '| resp:', html.slice(0, 200).replace(/\s+/g, ' ').trim());
  if (!res.ok) throw new Error(`PCC resolve POST → status ${res.status}`);
  if (/class="errormsg"/i.test(html)) {
    const m = html.match(/class="errormsg"[^>]*>([^<]+)/i);
    throw new Error(`PCC error: ${m ? m[1].trim() : 'unknown'}`);
  }

  // 4. Trust only the plan itself: the focus must be OFF the active list now.
  const stillActive = await _findFocusLink(patientId, pccFocusId, 'N');
  if (stillActive) {
    throw new Error('PCC accepted the save but the focus is still active — resolve manually and report this');
  }
  _dlog('verified: focus no longer on active plan');
  return { ok: true };
}

window.CarePlanResolveAPI = { resolveFocus };
