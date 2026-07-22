/**
 * Post-add personalization of LIBRARY-stamped goals/interventions.
 *
 * The library chkbox add is the point (linkage + the facility's own position/
 * kardex auto-config), but it stamps LIBRARY TEXT VERBATIM — no text field in
 * the wizard POST. This pass mirrors what a nurse does next: open each stamped
 * item's own edit form and personalize the text ("(resident name)" fills,
 * completed (specify) blanks, nurse edits). PCC itself demands this — library
 * items show "A Personalization of this Focus is Required" until edited.
 *
 * Matching is exact-by-construction: each edit carries `libraryText` (what PCC
 * just stamped, shipped by the backend or taken from the unchanged payload
 * text) and `targetText` (what the nurse approved). A form qualifies ONLY when
 * one of its fields' current value equals a pending edit's libraryText
 * (whitespace-normalized) AND the form echoes one of the row's link ids. We
 * round-trip every other field and change just that one. Anything ambiguous is
 * left as stamped — visible library text beats a corrupted item.
 *
 * Best-effort by design: callers treat failures as warnings, never as stamp
 * failures.
 */

const DETAIL_PATH = '/care/chart/cp/careplandetail_rev.jsp';
// Candidate editor endpoints for goal + intervention rows. Which one a given
// link opens is discovered, not assumed — the text match is the identifier.
const EDIT_PATHS = [
  '/care/chart/cp/goaledit_rev.jsp',
  '/care/chart/cp/intereditcust_rev.jsp',
  '/care/chart/cp/interedit_rev.jsp',
];

const EDIT_DEBUG = true;
function _dlog(...args) {
  if (EDIT_DEBUG) console.log('[cp-lib-edit]', ...args);
}

export function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
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
 * Walk plan pages; return { link, ids } for the focus's editNeed anchor.
 * The caller climbs ancestors from the link to scope the focus's row-group.
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
        return { link: a, ids: [m[1], m[2] || m[1]] };
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
 * Candidate goal/intervention edit calls inside a focus row-group. We don't
 * assume PCC's function names beyond "not editNeed": every other edit-style
 * call with numeric args is a candidate — the text match downstream is what
 * identifies the right item. Returns [{fn, ids}] deduped.
 */
export function parseItemLinkIds(rowHtml) {
  const out = [];
  const seen = new Set();
  const re = /\b(\w*edit\w*)\s*\(\s*((?:['"]?\d[^)]*)?)\)/gi;
  let m;
  while ((m = re.exec(String(rowHtml || ''))) !== null) {
    const fn = m[1];
    if (/^editNeed$/i.test(fn)) continue;
    const ids = (m[2].match(/\d+/g) || []).filter((d) => d !== '-1' && d.length >= 2);
    if (!ids.length) continue;
    const key = `${fn}:${ids.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fn, ids });
  }
  return out;
}

/**
 * PCC's detail page is nested tables — closest('tr') from the focus link is
 * the INNERMOST row (focus cell only). Climb ancestors until the container
 * gains edit-call candidates, stopping before it swallows a DIFFERENT focus's
 * editNeed link (then we've climbed past our row-group into the whole table).
 */
export function findRowGroupHtml(focusLink, focusIds) {
  let el = focusLink;
  let lastOwn = null;
  for (let depth = 0; depth < 8 && el; depth++, el = el.parentElement) {
    const html = el.innerHTML || '';
    const otherFocus = [...html.matchAll(/editNeed\(\s*['"]?(\d+)/gi)]
      .some((mm) => !focusIds.includes(mm[1]));
    if (otherFocus) break;
    lastOwn = html;
    if (parseItemLinkIds(html).length) return html;
  }
  return lastOwn;
}

/**
 * Open one row link's edit form and match it against the pending edits.
 * Returns { url, fields, fieldName, edit } when a field's current value equals
 * a pending edit's libraryText, or null.
 */
async function _matchEditForm({ patientId, careplanId, focusId, ids, pendingEdits }) {
  for (const path of EDIT_PATHS) {
    for (const itemId of ids) {
      const params = new URLSearchParams({
        ESOLclientid: String(patientId),
        ESOLcareplanid: String(careplanId),
        ESOLneedid: String(focusId),
        ESOLgenneedid: String(focusId),
        ESOLreviewid: '-1',
      });
      // Goal editors key on goalid, intervention editors on interid — set both
      // families; PCC ignores params it doesn't use.
      params.set('ESOLgoalid', String(itemId));
      params.set('ESOLgengoalid', String(itemId));
      params.set('ESOLinterid', String(itemId));
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
        const fields = _formFields(form);
        const echoes = Array.from(fields.values()).some((v) => ids.includes(String(v)));
        if (!echoes) continue;
        for (const [name, value] of fields) {
          const nv = normText(value);
          if (!nv) continue;
          const edit = pendingEdits.find((e) => !e.done && normText(e.libraryText) === nv);
          if (edit) return { url, fields, fieldName: name, edit };
        }
      }
    }
  }
  return null;
}

/**
 * Personalize the just-stamped library items of one focus.
 * `edits`: [{ libraryText, targetText }] — libraryText is what PCC stamped.
 * Returns { attempted, edited, failed, unmatched } — never throws past its
 * own guardrails.
 */
export async function editStampedLibraryTexts({ patientId, careplanId, focusId, miniToken, edits }) {
  const out = { attempted: 0, edited: 0, failed: 0, unmatched: 0 };
  const pendingEdits = (edits || [])
    .filter((e) => e && normText(e.libraryText) && normText(e.targetText) &&
      normText(e.libraryText) !== normText(e.targetText))
    .map((e) => ({ ...e, done: false }));
  if (!pendingEdits.length) return out;

  const row = await _findFocusRow(patientId, focusId);
  if (!row) {
    _dlog('stamped focus not found on active plan — skipping personalization', focusId);
    out.unmatched = pendingEdits.length;
    return out;
  }
  const groupHtml = findRowGroupHtml(row.link, row.ids);
  const itemLinks = parseItemLinkIds(groupHtml);
  _dlog(`focus ${focusId}: ${pendingEdits.length} edit(s) pending, ${itemLinks.length} item link(s):`,
    [...new Set(itemLinks.map((g) => g.fn))].join(', ') || '(none — dump a goal row edit-link HTML if this persists)');

  for (const { ids } of itemLinks) {
    if (pendingEdits.every((e) => e.done)) break;
    let hit;
    try {
      hit = await _matchEditForm({ patientId, careplanId, focusId, ids, pendingEdits });
    } catch (e) {
      _dlog('edit form lookup failed', ids, e?.message);
      continue;
    }
    if (!hit) continue;
    out.attempted += 1;
    try {
      const body = new URLSearchParams();
      for (const [k, v] of hit.fields) body.set(k, v ?? '');
      body.set('ESOLsave', 'Y');
      body.set('ESOLrefresh', 'N');
      body.set(hit.fieldName, hit.edit.targetText);
      if (!body.get('ESOLminiToken') && miniToken) body.set('ESOLminiToken', miniToken);
      const res = await fetch(hit.url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const html = await res.text();
      _dlog('personalize POST', ids.join('/'), '→', res.status, '| field', hit.fieldName,
        '| resp:', html.slice(0, 160).replace(/\s+/g, ' ').trim());
      if (!res.ok || /class="errormsg"/i.test(html) || /will not be saved/i.test(html)) {
        out.failed += 1;
        continue;
      }
      hit.edit.done = true;
      out.edited += 1;
    } catch (e) {
      _dlog('personalize POST failed', ids, e?.message);
      out.failed += 1;
    }
  }
  out.unmatched = pendingEdits.filter((e) => !e.done).length - out.failed;
  if (out.unmatched < 0) out.unmatched = 0;
  _dlog('personalization done', out);
  return out;
}

if (typeof window !== 'undefined') {
  window.CarePlanLibraryEdit = { editStampedLibraryTexts };
}
