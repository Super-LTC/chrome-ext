/**
 * Post-stamp polish: fill "(resident name)" placeholders in LIBRARY-added goals.
 *
 * The library-add wizard attaches goals by std id (`chkbox`) — PCC writes its
 * own library text verbatim, so name placeholders survive even though our
 * payload carries filled goal text. The focus is fine (the wizard echoes our
 * description); goals need this second pass.
 *
 * Discipline mirrors pcc-resolve.js: NO guessed PCC constants. We locate the
 * just-stamped focus on the live plan, collect the goal edit links inside its
 * row, open each goal's own edit form, round-trip every field PCC returned,
 * and change ONLY cp_description (placeholder → resident display name). A goal
 * whose form we can't confidently identify is left alone — a visible
 * "(resident name)" beats a corrupted goal.
 *
 * Best-effort by design: callers treat any failure as a warning, never as a
 * stamp failure.
 */

const DETAIL_PATH = '/care/chart/cp/careplandetail_rev.jsp';
const GOAL_EDIT_PATH = '/care/chart/cp/goaledit_rev.jsp';

const FILL_DEBUG = true;
function _dlog(...args) {
  if (FILL_DEBUG) console.log('[cp-goal-fill]', ...args);
}

// Same placeholder family the backend fills in focus text.
const NAME_PLACEHOLDER = /\(\s*(?:resident'?s?|patient'?s?)\s+name\s*\)|\(\s*name\s*\)/gi;

/** A name we may write into a chart: non-empty and not the JIT-stub "Patient <id>". */
export function isFillableName(name) {
  const n = String(name || '').trim();
  return n !== '' && !/^patient\s+\d+$/i.test(n);
}

/** "SMITH, JOHN (6106) NICK" → "SMITH, JOHN"; replace every placeholder. */
export function replaceNamePlaceholders(text, residentName) {
  const display = String(residentName || '').split('(')[0].trim();
  if (!display) return text;
  return String(text || '').replace(NAME_PLACEHOLDER, display);
}

export function hasNamePlaceholder(text) {
  NAME_PLACEHOLDER.lastIndex = 0;
  return NAME_PLACEHOLDER.test(String(text || ''));
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

/** All named fields of a form (selects → selected value, boxes only when checked). */
function _formFields(form) {
  const out = new Map();
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = el.getAttribute('name');
    if (el.tagName === 'SELECT') {
      const sel = el.querySelector('option[selected]') || el.querySelector('option');
      out.set(name, sel ? sel.getAttribute('value') ?? sel.textContent.trim() : '');
    } else if (el.tagName === 'TEXTAREA') {
      out.set(name, el.textContent ?? '');
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.hasAttribute('checked')) out.set(name, el.getAttribute('value') ?? 'on');
    } else if (el.type !== 'submit' && el.type !== 'button') {
      out.set(name, el.getAttribute('value') ?? '');
    }
  }
  return out;
}

/**
 * Walk plan pages; return the DOM row (tr) holding the focus's editNeed link.
 * PCC lays each focus out as one row with goals/interventions nested inside,
 * so goal edit links for THIS focus live inside the same row.
 */
async function _findFocusRow(patientId, focusId) {
  const MAX_PAGES = 60;
  let row = 1;
  let prevFirst = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${DETAIL_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLrow=${row}&showresolved=N&ESOLsortby=C`;
    const html = await _fetchText(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('a[href*="editNeed("], a[onclick*="editNeed("]');
    if (!links.length) return null;
    for (const a of links) {
      const src = `${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''}`;
      const m = src.match(/editNeed\(\s*['"]?(\d+)['"]?(?:\s*,\s*['"]?(\d+))?/);
      if (!m) continue;
      if (m[1] === String(focusId) || (m[2] || '') === String(focusId)) {
        return a.closest('tr') || a.parentElement;
      }
    }
    const firstSrc = links[0].getAttribute('href') || links[0].getAttribute('onclick') || '';
    if (firstSrc === prevFirst) return null;
    prevFirst = firstSrc;
    row += links.length;
  }
  return null;
}

/**
 * Goal edit link args inside a focus row. PCC's goal links call a goal-edit JS
 * function (editGoal / editGoalCust / …) — accept any edit*(…) call whose name
 * mentions "goal", plus direct hrefs into goaledit. Returns [{ids:[..]}].
 */
export function parseGoalLinkIds(rowHtml) {
  const out = [];
  const seen = new Set();
  const re = /(?:edit\w*goal\w*|goal\w*edit\w*)\s*\(\s*([^)]*)\)/gi;
  let m;
  while ((m = re.exec(String(rowHtml || ''))) !== null) {
    const ids = (m[1].match(/\d+/g) || []).filter((d) => d !== '-1' && d.length >= 2);
    if (!ids.length) continue;
    const key = ids.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ids });
  }
  return out;
}

/**
 * Open the goal's own edit form. Tries the id args from the link in both goal
 * slots. Accepts a form ONLY when it (a) has cp_description, (b) that text
 * still contains a name placeholder, and (c) some field echoes one of the ids
 * — proof it's a real, populated editor for THIS goal.
 */
async function _findGoalEditForm({ patientId, careplanId, focusId, ids }) {
  for (const goalId of ids) {
    const params = new URLSearchParams({
      ESOLclientid: String(patientId),
      ESOLcareplanid: String(careplanId),
      ESOLneedid: String(focusId),
      ESOLgenneedid: String(focusId),
      ESOLgoalid: String(goalId),
      ESOLgengoalid: String(goalId),
      ESOLreviewid: '-1',
    });
    const url = `${GOAL_EDIT_PATH}?${params.toString()}`;
    let html;
    try {
      html = await _fetchText(url);
    } catch (e) {
      _dlog('goal editor GET failed', url, e?.message);
      continue;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const form of doc.querySelectorAll('form')) {
      const descEl = form.querySelector('[name="cp_description"]');
      if (!descEl) continue;
      const fields = _formFields(form);
      const desc = fields.get('cp_description') || '';
      if (!hasNamePlaceholder(desc)) {
        _dlog('goal form found but no placeholder in cp_description — leaving as-is', goalId);
        return null;
      }
      const echoes = Array.from(fields.values()).some((v) => ids.includes(String(v)));
      if (!echoes) {
        _dlog('goal form does not echo goal id — refusing to edit', url);
        continue;
      }
      return { url, fields, desc };
    }
  }
  return null;
}

/**
 * Fill name placeholders in all goals of one just-stamped focus.
 * Returns { attempted, edited, failed } — never throws past its own guardrails.
 */
export async function fillGoalNamePlaceholders({ patientId, careplanId, focusId, miniToken, residentName }) {
  const out = { attempted: 0, edited: 0, failed: 0 };
  if (!isFillableName(residentName)) {
    _dlog('no fillable resident name — leaving placeholders visible');
    return out;
  }
  const row = await _findFocusRow(patientId, focusId);
  if (!row) {
    _dlog('stamped focus not found on active plan — skipping goal fill', focusId);
    return out;
  }
  const goalLinks = parseGoalLinkIds(row.innerHTML);
  _dlog(`focus ${focusId}: ${goalLinks.length} goal edit link(s) in row`);
  for (const { ids } of goalLinks) {
    let hit;
    try {
      hit = await _findGoalEditForm({ patientId, careplanId, focusId, ids });
    } catch (e) {
      _dlog('goal form lookup failed', ids, e?.message);
      continue;
    }
    if (!hit) continue; // no placeholder, or form not confidently identified
    out.attempted += 1;
    try {
      const body = new URLSearchParams();
      for (const [k, v] of hit.fields) body.set(k, v ?? '');
      body.set('ESOLsave', 'Y');
      body.set('ESOLrefresh', 'N');
      body.set('cp_description', replaceNamePlaceholders(hit.desc, residentName));
      if (!body.get('ESOLminiToken') && miniToken) body.set('ESOLminiToken', miniToken);
      const res = await fetch(hit.url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const html = await res.text();
      _dlog('goal fill POST', ids.join('/'), '→', res.status, '| resp:', html.slice(0, 160).replace(/\s+/g, ' ').trim());
      if (!res.ok || /class="errormsg"/i.test(html) || /will not be saved/i.test(html)) {
        out.failed += 1;
        continue;
      }
      out.edited += 1;
    } catch (e) {
      _dlog('goal fill POST failed', ids, e?.message);
      out.failed += 1;
    }
  }
  _dlog('goal name fill done', out);
  return out;
}

if (typeof window !== 'undefined') {
  window.CarePlanGoalNameFill = { fillGoalNamePlaceholders };
}
