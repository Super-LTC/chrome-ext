// content/modules/care-plan-stamp/pcc-verify.js
//
// Read back what PCC ACTUALLY attached to a care plan, so the extension stops
// guessing. Everything else in the stamp path infers success from an HTTP 200 —
// but PCC answers 200 whether it attached all five goals or silently ignored
// every one, so a "success" today means only "the request didn't blow up".
//
// PCC's own care-plan detail page settles it. Each row action names its parent
// focus outright:
//
//   editNeed(genneedid, needid)
//   editGoal(goalid, stdneedid, genneedid, ...)                     ← 3rd arg
//   editIntervention(interid, stdinterid, stdneedid, genneedid, ...) ← 4th arg
//
// So one walk of the detail pages yields exact per-focus counts — no per-item
// fetches, and no guessing at row grouping by climbing DOM ancestors.
//
// Parsing is regex over the raw HTML on purpose: PCC ships loose markup (mixed
// quotes, unclosed tags) and these ids live inside javascript: hrefs and onclick
// bodies, which is text either way.

/** genneedid === needid ⟺ the focus was added custom; they differ for library adds. */
function _kind(genNeedId, needId) {
  return genNeedId === needId ? 'custom' : 'library';
}

/**
 * Parse one care-plan detail page into its focuses and the goal/intervention
 * rows hanging off them. Focus order follows the page. Ids stay strings — they
 * are opaque keys, and PCC pads/echoes them as text.
 */
export function parsePlanPage(html) {
  const s = String(html || '');
  const focuses = [];
  const seen = new Set();

  for (const m of s.matchAll(/editNeed\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*\)/g)) {
    const [, genNeedId, needId] = m;
    if (seen.has(genNeedId)) continue;
    seen.add(genNeedId);
    focuses.push({ genNeedId, needId, kind: _kind(genNeedId, needId) });
  }

  // Requiring digits in every captured slot is what keeps these off the page's
  // own `function editGoal(goalid, stdneedid, ...)` declarations.
  const goals = [];
  for (const m of s.matchAll(/editGoal\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?/g)) {
    goals.push({ goalId: m[1], stdNeedId: m[2], genNeedId: m[3] });
  }

  const interventions = [];
  for (const m of s.matchAll(/editIntervention\(\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?\s*,\s*['"]?(\d+)['"]?/g)) {
    interventions.push({ interId: m[1], stdInterId: m[2], stdNeedId: m[3], genNeedId: m[4] });
  }

  for (const [genNeedId, text] of _focusTexts(s)) {
    const f = focuses.find((x) => x.genNeedId === genNeedId);
    if (f) f.text = text;
  }

  return { focuses, goals, interventions };
}

/**
 * Focus statements, keyed by committed focus id. PCC renders each in a
 * `span.text1` inside the focus's row. Needs a DOM; where none exists the
 * focuses simply come back without `text` and callers fall back to id matching.
 */
function _focusTexts(html) {
  const out = new Map();
  if (typeof DOMParser === 'undefined') return out;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const a of doc.querySelectorAll('a[href*="editNeed("], a[onclick*="editNeed("]')) {
    const src = `${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''}`;
    const m = src.match(/editNeed\(\s*['"]?(\d+)/);
    if (!m || out.has(m[1])) continue;
    const tr = a.closest('tr');
    const span = tr && tr.querySelector('span.text1');
    const text = normText(span ? span.textContent : '');
    if (text) out.set(m[1], text);
  }
  return out;
}

/** Whitespace- and case-insensitive comparison key for a focus statement. */
export function normText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Find the focus carrying `text` among parsed plan focuses, or null.
 *
 * This is how a just-stamped focus is resolved to the id that ACTUALLY holds it:
 * we wrote the statement ourselves, so we can match on it, whereas PCC's save
 * response returns an id that may not be on the plan at all
 * (see `pcc-discover.js` — "the save response returns a phantom").
 */
export function findFocusByText(focuses, text) {
  const want = normText(text);
  if (!want) return null;
  return (focuses || []).find((f) => normText(f.text) === want) || null;
}

/**
 * Whether to read back after every stamp.
 *
 * On by default while we establish how often PCC silently drops attachments —
 * we have no baseline, because the UI has been reporting success regardless.
 * `?cpverify=0` (or `superltc_cpverify=0`) turns it off if the extra page reads
 * ever become a problem on a big plan.
 */
export function verifyEnabled() {
  try {
    const qs = new URLSearchParams(globalThis.location?.search || '');
    const v = qs.get('cpverify') ?? globalThis.localStorage?.getItem('superltc_cpverify');
    return v !== '0';
  } catch {
    return true;
  }
}

// ============================ fetch-driven (content script) ============================

const CARE_PLAN_DETAIL_PATH = '/care/chart/cp/careplandetail_rev.jsp';
const PAGE_SIZE = 5;      // PCC's server-side page size (row=1 → row=6 → …)
const MAX_PAGES = 60;     // 300 focuses — more than any real plan

async function _fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} → status ${res.status}`);
  const html = await res.text();
  // An expired session renders a login page, which parses as an EMPTY plan —
  // indistinguishable from "PCC attached nothing". Throw instead of quietly
  // reporting zero and blaming PCC for losing the nurse's work.
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

/**
 * Walk the patient's whole care plan and report what's on it.
 *
 * Returns `{ focuses, goals, interventions, counts, pages }`. Only active rows
 * are read (`showresolved=N`) — a resolved item is off the working plan, which
 * is what the nurse means by "it isn't there".
 *
 * PCC clamps to the last page when you walk past the end, so a page that adds
 * no new focus is the stop signal.
 */
export async function scanCarePlan(patientId) {
  const focuses = [];
  const goals = [];
  const interventions = [];
  const seen = new Set();
  let pages = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${CARE_PLAN_DETAIL_PATH}?ESOLclientid=${encodeURIComponent(patientId)}` +
      `&ESOLrow=${1 + i * PAGE_SIZE}&showresolved=N&ESOLsortby=C`;
    const html = await _fetchText(url);
    pages += 1;

    const parsed = parsePlanPage(html);
    const before = seen.size;
    for (const f of parsed.focuses) {
      if (seen.has(f.genNeedId)) continue;
      seen.add(f.genNeedId);
      focuses.push(f);
      // Only take rows belonging to focuses this page introduced, so a repeated
      // final page can't double-count.
      goals.push(...parsed.goals.filter((g) => g.genNeedId === f.genNeedId));
      interventions.push(...parsed.interventions.filter((v) => v.genNeedId === f.genNeedId));
    }
    if (seen.size === before) break;
  }

  const scan = { focuses, goals, interventions, pages };
  return { ...scan, counts: countsByFocus(scan) };
}

/**
 * Check what a just-stamped focus REALLY got, by reading the live plan.
 *
 * Resolution is by focus text, not by the id PCC handed back on save: we wrote
 * that text, so it's ours to match on, whereas the save-response id can be a
 * phantom that was never on the plan. When they disagree, the plan wins —
 * `idMatchedSaveResponse: false` is the signal that the id we'd have attached
 * goals to was the wrong one.
 *
 * Returns counts requested vs. attached; `complete` is the honest answer to
 * "did the nurse's work land?". `scan` is passed back so a batch can reuse one
 * walk across many focuses.
 */
export async function verifyStampedFocus({
  patientId,
  focusText,
  requested = {},
  saveResponseFocusId = null,
  scan = null,
}) {
  const planScan = scan || (await scanCarePlan(patientId));
  const hit = findFocusByText(planScan.focuses, focusText);
  const goalsRequested = requested.goals ?? 0;
  const interventionsRequested = requested.interventions ?? 0;

  if (!hit) {
    return {
      found: false,
      focusId: null,
      idSource: null,
      idMatchedSaveResponse: false,
      route: null,
      goalsRequested,
      interventionsRequested,
      goalsAttached: 0,
      interventionsAttached: 0,
      complete: false,
      pages: planScan.pages,
      scan: planScan,
    };
  }

  const counts = planScan.counts[hit.genNeedId] || { goals: 0, interventions: 0 };
  return {
    found: true,
    focusId: hit.genNeedId,
    idSource: saveResponseFocusId && String(saveResponseFocusId) === hit.genNeedId
      ? 'save_response'
      : 'plan_lookup',
    idMatchedSaveResponse: saveResponseFocusId != null &&
      String(saveResponseFocusId) === hit.genNeedId,
    route: hit.kind,
    goalsRequested,
    interventionsRequested,
    goalsAttached: counts.goals,
    interventionsAttached: counts.interventions,
    complete: counts.goals >= goalsRequested &&
      counts.interventions >= interventionsRequested,
    pages: planScan.pages,
    scan: planScan,
  };
}

/**
 * Verify one stamped focus and emit `care_plan_stamp_verified`.
 *
 * Never throws: verification is observation, and a failed read-back must not
 * turn a stamp that actually worked into an error the nurse has to act on. A
 * read-back that couldn't run returns `null` and the caller falls back to the
 * old optimistic counts.
 *
 * `extra` carries the context only the caller has — how the write was routed,
 * whether we primed the form, how fast we chained, and what the personalization
 * pass did.
 */
export async function verifyAndReport({ patientId, focusText, requested, saveResponseFocusId, extra = {} }) {
  if (!verifyEnabled()) return null;
  const t0 = Date.now();
  let v;
  try {
    v = await verifyStampedFocus({ patientId, focusText, requested, saveResponseFocusId });
  } catch (e) {
    console.log('[cp-verify] read-back failed (stamp result unchanged):', e?.message);
    return null;
  }

  window.SuperAnalytics?.track?.('care_plan_stamp_verified', {
    route: v.route ?? extra.route ?? null,
    n_goals_requested: v.goalsRequested,
    n_goals_attached: v.goalsAttached,
    n_interventions_requested: v.interventionsRequested,
    n_interventions_attached: v.interventionsAttached,
    focus_found: v.found,
    complete: v.complete,
    id_source: v.idSource,
    id_matched_save_response: v.idMatchedSaveResponse,
    primed: extra.primed ?? null,
    ms_focus_to_first_attach: extra.msFocusToFirstAttach ?? null,
    personalize_attempted: extra.personalizeAttempted ?? null,
    personalize_edited: extra.personalizeEdited ?? null,
    personalize_failed: extra.personalizeFailed ?? null,
    personalize_unmatched: extra.personalizeUnmatched ?? null,
    repair_attempted: extra.repairAttempted ?? false,
    repair_succeeded: extra.repairSucceeded ?? false,
    n_plan_pages: v.pages,
    verify_ms: Date.now() - t0,
  });

  console.log('[cp-verify]', v.complete ? 'OK' : 'SHORTFALL',
    `focus=${v.focusId} route=${v.route} goals=${v.goalsAttached}/${v.goalsRequested}`,
    `interv=${v.interventionsAttached}/${v.interventionsRequested}`,
    `idSource=${v.idSource}`);

  return v;
}

if (typeof window !== 'undefined') {
  window.CarePlanStampVerify = {
    scanCarePlan, verifyStampedFocus, verifyAndReport, verifyEnabled,
  };
}

/**
 * Per-focus tallies keyed by committed focus id: `{ [genNeedId]: {goals, interventions} }`.
 * Every focus on the page gets an entry, including one with nothing attached — a
 * focus sitting at 0/0 is precisely the failure this module exists to catch.
 */
export function countsByFocus(parsed) {
  const out = {};
  for (const f of parsed?.focuses || []) {
    out[f.genNeedId] = { goals: 0, interventions: 0 };
  }
  for (const g of parsed?.goals || []) {
    if (out[g.genNeedId]) out[g.genNeedId].goals += 1;
  }
  for (const v of parsed?.interventions || []) {
    if (out[v.genNeedId]) out[v.genNeedId].interventions += 1;
  }
  return out;
}
