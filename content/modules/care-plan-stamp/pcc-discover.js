/**
 * PCC discovery helpers for Care Plan Auto-Pop stamping.
 *
 * All requests are same-origin (content script → PCC) and use session cookies.
 * Discovery steps run once at modal-open, before any stamping POSTs.
 *
 * What this exports on `window.CarePlanStampDiscover`:
 *   - discoverCarePlanId(patientId)  → '42469' (string)
 *   - discoverMiniToken(patientId, careplanId) → 'g4IWqSs644' (string)
 *   - scrapeOrgDropdowns(patientId, careplanId) → { reviewDepts: Set<number>, positions: Set<number>, kardex: Set<number> }
 *   - validateProposalIds(proposal, dropdowns) → { ok, missing: [{ id, kind, where }] }
 */

const CARE_PLAN_DETAIL_PATH = '/care/chart/cp/careplandetail_rev.jsp';
const FOCUS_FORM_PATH = '/care/chart/cp/neededitcust_rev.jsp';
const INTERVENTION_FORM_PATH = '/care/chart/cp/intereditcust_rev.jsp';

async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} failed: ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

/**
 * Find the parent care plan ID for a patient.
 * The careplandetail page hardcodes it into JS function bodies; we grep the first match.
 */
async function discoverCarePlanId(patientId) {
  const url = `${CARE_PLAN_DETAIL_PATH}?ESOLclientid=${encodeURIComponent(patientId)}`;
  const html = await _fetchText(url);
  const m = html.match(/ESOLcareplanid=(\d+)/);
  if (!m) throw new Error('Could not find ESOLcareplanid on careplandetail page');
  return m[1];
}

/**
 * Scrape the CSRF nonce. Session-scoped — same token reused across focus/goal/intervention.
 * Pull from the focus form GET (cheapest form to load).
 */
async function discoverMiniToken(patientId, careplanId) {
  const url = `${FOCUS_FORM_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLreviewid=-1&ESOLcareplanid=${encodeURIComponent(careplanId)}`;
  const html = await _fetchText(url);
  const m = html.match(/name="ESOLminiToken"\s+value="([^"]+)"/);
  if (!m) throw new Error('Could not find ESOLminiToken in focus form');
  return m[1];
}

/**
 * Scrape the dropdown option IDs + labels PCC ships for this org. Returns both:
 *   - Sets for fast validation of incoming proposal IDs
 *   - Maps (id → label) for human-readable rendering in the UI
 *
 * Per-org drift means we can't ship a static lookup; we read live every time.
 */
async function scrapeOrgDropdowns(patientId, careplanId) {
  const focusUrl = `${FOCUS_FORM_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLreviewid=-1&ESOLcareplanid=${encodeURIComponent(careplanId)}`;
  const interUrl = `${INTERVENTION_FORM_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLneedid=-1&ESOLgenneedid=-1&ESOLstdneedid=-1`;
  const [focusHtml, interHtml] = await Promise.all([_fetchText(focusUrl), _fetchText(interUrl)]);

  const reviewDeptOptions = _extractOptionsWithLabels(focusHtml, 'position_id_one');
  const positionOptions = _extractOptionsWithLabels(interHtml, 'position_id');
  const kardexOptions = _extractOptionsWithLabels(interHtml, 'category_id');
  const flowsheetOptions = _extractOptionsWithLabels(interHtml, 'fsttype_id');

  const toSet = (opts) => new Set(opts.map((o) => o.id));
  const toMap = (opts) => Object.fromEntries(opts.map((o) => [o.id, o.label]));

  return {
    // Sets for validation
    reviewDepts: toSet(reviewDeptOptions),
    positions: toSet(positionOptions),
    kardex: toSet(kardexOptions),
    // Maps for rendering
    reviewDeptLabels: toMap(reviewDeptOptions),
    positionLabels: toMap(positionOptions),
    kardexLabels: toMap(kardexOptions),
    flowsheetLabels: toMap(flowsheetOptions),
    // Raw arrays for dropdown <select> rendering (preserve PCC's order)
    reviewDeptOptions,
    positionOptions,
    kardexOptions,
    flowsheetOptions,
  };
}

/**
 * Extract <option value=N>Label</option> pairs from a named <select>.
 * Uses DOMParser to handle PCC's loose HTML (mixed quotes, missing closers).
 */
function _extractOptionsWithLabels(html, selectName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sel = doc.querySelector(`select[name="${selectName}"]`);
  if (!sel) return [];
  return Array.from(sel.options)
    .filter((o) => o.value && o.value !== '-1' && o.value !== '')
    .map((o) => ({ id: Number(o.value), label: (o.textContent || '').trim() }));
}

/**
 * Check that every ID our proposal will submit actually exists in this org's dropdowns.
 * Returns { ok, missing } — caller decides whether to fail loudly or attempt to remap.
 */
function validateProposalIds(proposal, dropdowns) {
  const missing = [];
  const focuses = proposal?.focuses || [];

  // Backend guarantees: fields it couldn't resolve (canonical → numeric ID via
  // the org's dropdowns) are returned as undefined/omitted, never as bad IDs.
  // So we only validate fields that are actually present. An absent positionOne
  // / kardexCategory just means "don't set that on the PCC POST" — PCC accepts.
  for (const focus of focuses) {
    for (const id of focus.reviewDepartments || []) {
      if (id == null) continue;
      if (!dropdowns.reviewDepts.has(id)) {
        missing.push({ id, kind: 'reviewDepartment', where: `focus "${focus.ruleId}"` });
      }
    }
    for (const inter of focus.interventions || []) {
      if (inter.kardexCategory != null && !dropdowns.kardex.has(inter.kardexCategory)) {
        missing.push({ id: inter.kardexCategory, kind: 'kardexCategory', where: `intervention in "${focus.ruleId}"` });
      }
      if (inter.positionOne != null && !dropdowns.positions.has(inter.positionOne)) {
        missing.push({ id: inter.positionOne, kind: 'positionOne', where: `intervention in "${focus.ruleId}"` });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

// ============================================================
// Library browser — discover this facility's PCC libraries.
// Per-org variance means we can't ship a static mapping; we
// scrape live at modal-open and let the nurse drill in.
// ============================================================

/**
 * Discover the libraries available in this facility's care-plan wizard.
 * Returns: [{ id, label }]
 */
async function discoverLibraries(patientId, careplanId) {
  const url = `/care/chart/cp/needwizard_rev.jsp?ESOLclientid=${encodeURIComponent(patientId)}&ESOLreviewid=-1&ESOLpositionid=-1&ESOLcareplanid=${encodeURIComponent(careplanId)}`;
  const html = await _fetchText(url);
  return _parseSelectFromHtml(html, 'libraryid');
}

/**
 * Discover diagcats for a given library. Requires a POST refresh of the wizard.
 */
async function discoverCategoriesForLibrary(libraryId, patientId, careplanId, miniToken) {
  const body = new URLSearchParams({
    libraryid: String(libraryId),
    diagcatid: '-1',
    ESOLclientid: String(patientId),
    ESOLstdneedid: '',
    ESOLwizard: 'Y',
    ESOLminiToken: miniToken,
    ESOLreviewid: '-1',
    ESOLpositionid: '-1',
    ESOLcareplanid: String(careplanId),
  });
  const res = await fetch('/care/chart/cp/needwizard_rev.jsp', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC needwizard POST → ${res.status}`);
  const html = await res.text();
  return _parseSelectFromHtml(html, 'diagcatid');
}

/**
 * Discover focuses for a given (library, diagcat) — list of std focuses w/ IDs + text.
 */
async function discoverFocusesForCategory(libraryId, diagcatId, patientId, careplanId, miniToken) {
  const body = new URLSearchParams({
    libraryid: String(libraryId),
    diagcatid: String(diagcatId),
    ESOLclientid: String(patientId),
    ESOLstdneedid: '',
    ESOLwizard: 'Y',
    ESOLminiToken: miniToken,
    ESOLreviewid: '-1',
    ESOLpositionid: '-1',
    ESOLcareplanid: String(careplanId),
  });
  const res = await fetch('/care/chart/cp/needwizard_rev.jsp', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`PCC needwizard POST → ${res.status}`);
  const html = await res.text();

  // Each focus: <a href="javascript:addNeed(STDNEEDID)">add</a> ... <td>FOCUS TEXT</td>
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const focuses = [];
  doc.querySelectorAll('a[href*="addNeed"]').forEach((a) => {
    const m = a.getAttribute('href').match(/addNeed\((\d+)\)/);
    if (!m) return;
    const tr = a.closest('tr');
    if (!tr) return;
    // The focus text is in the second td of the row (first td has the add link).
    const tds = tr.querySelectorAll('td');
    const text = (tds[1]?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) focuses.push({ stdNeedId: m[1], text });
  });
  return focuses;
}

/**
 * For a chosen library focus, fetch its standard goals + interventions
 * so we can preview/stamp them. Both wizards return checkbox lists.
 */
async function discoverFocusContents(stdNeedId, patientId, careplanId) {
  const [goalsHtml, intersHtml] = await Promise.all([
    _fetchText(`/care/chart/cp/goalwizard_rev.jsp?ESOLstdneedid=${encodeURIComponent(stdNeedId)}&ESOLclientid=${encodeURIComponent(patientId)}&ESOLcareplanid=${encodeURIComponent(careplanId)}`),
    _fetchText(`/care/chart/cp/interwizard_rev.jsp?ESOLstdneedid=${encodeURIComponent(stdNeedId)}&ESOLclientid=${encodeURIComponent(patientId)}&ESOLcareplanid=${encodeURIComponent(careplanId)}`),
  ]);

  const extractCheckboxRows = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('input[type="checkbox"][name="chkbox"]'))
      .map((c) => {
        const tr = c.closest('tr');
        const text = tr ? tr.textContent.replace(/\s+/g, ' ').replace(/\s*Available\s*$/, '').trim() : '';
        return { stdId: c.value, text };
      })
      .filter((r) => r.text);
  };

  return {
    goals: extractCheckboxRows(goalsHtml),
    interventions: extractCheckboxRows(intersHtml),
  };
}

/**
 * Walk the dropdown options in a select element. Robust to PCC's mixed quote/no-quote syntax.
 */
function _parseSelectFromHtml(html, name) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sel = doc.querySelector(`select[name="${name}"]`);
  if (!sel) return [];
  return Array.from(sel.options)
    .filter((o) => o.value && o.value !== '-1')
    .map((o) => ({ id: o.value, label: (o.textContent || '').trim() }));
}

/**
 * Fetch the patient's full care plan via PCC's `careplandetail_rev.jsp` and
 * walk every page so we capture every existing focus (not just the rows that
 * happen to be visible in the user's current DOM).
 *
 * PCC paginates server-side via the `ESOLrow` query param — page 1 = ESOLrow=1,
 * next page = ESOLrow=1 + pageSize, etc. Page size is 5 in the wild (deduced
 * from observed referer flow: row=1 → row=6). We loop until a page adds zero
 * new editNeed links (PCC clamps to the last page when you walk past the end,
 * so the next request just returns the same rows again).
 *
 * Returns: { careplanId, focusTexts: string[] }
 */
async function scrapeFullCarePlan(patientId) {
  const PAGE_SIZE = 5;
  const MAX_PAGES = 60; // 60 * 5 = 300 focuses. More than any real care plan.
  const seen = new Set();
  let careplanId = null;
  let row = 1;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${CARE_PLAN_DETAIL_PATH}?ESOLclientid=${encodeURIComponent(patientId)}&ESOLrow=${row}&showresolved=N&ESOLsortby=C`;
    const html = await _fetchText(url);
    if (!careplanId) {
      const m = html.match(/ESOLcareplanid=(\d+)/);
      if (m) careplanId = m[1];
    }
    const beforeCount = seen.size;
    // Each focus row contains an editNeed(...) anchor whose nearest tr → first span.text1 holds the focus statement.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('a[href*="editNeed("]');
    links.forEach((a) => {
      const tr = a.closest('tr');
      if (!tr) return;
      const span = tr.querySelector('span.text1');
      if (!span) return;
      const t = (span.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) seen.add(t);
    });
    // Page added nothing new → we're past the end, PCC is repeating.
    if (seen.size === beforeCount) break;
    row += PAGE_SIZE;
  }

  return { careplanId, focusTexts: Array.from(seen) };
}

window.CarePlanStampDiscover = {
  discoverCarePlanId,
  discoverMiniToken,
  scrapeOrgDropdowns,
  validateProposalIds,
  discoverLibraries,
  discoverCategoriesForLibrary,
  discoverFocusesForCategory,
  discoverFocusContents,
  scrapeFullCarePlan,
};
