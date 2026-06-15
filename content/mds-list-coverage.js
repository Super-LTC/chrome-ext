// content/mds-list-coverage.js
// Overlays interview-coverage chips on the MDS List → In Progress screen.
// Frame note: confirmed top-frame / TODO verify on live page (see plan Task 0).
import { scrapeRows } from './mds-list-coverage/scrape.js';
import { toChips } from './mds-list-coverage/render-model.js';
import { fetchBatchCoverage } from './mds-list-coverage/api.js';
import { attachInterviewHover } from './mds-list-coverage/detail.js';

const ILC = { lastIdSet: '', resultsByKey: {}, busy: false };
// Per-state chip glyph (upcoming is intentionally faint/subtle, never an ✗).
const CHIP_ICONS = { covered: '✓ ', in_progress: '◐ ', needed: '⚠ ', upcoming: '· ' };

/** True only on the MDS list with the "In Progress" tab active. */
function isInProgressList() {
  const onMdsList = /\/care\/chart\/mds\/mds(list|portal)\.jsp/i.test(location.pathname + location.search) ||
                    document.querySelector('form[name="client"] ul.pccTabs');
  if (!onMdsList) return false;
  const active = document.querySelector('ul.pccTabs li.pccActiveTab a');
  return !!active && /in\s*progress/i.test(active.textContent || '');
}

/** The PCC data table that holds the rows (the one with the Name/Type columns). */
function findListTable() {
  // The data rows live in the table inside #msg1. Anchor there so we don't
  // match the outer wrapper tables (which contain the data table as a
  // descendant and would yield a phantom wrapper "row").
  const inMsg = document.querySelector('#msg1 table');
  if (inMsg && inMsg.querySelector('a[href*="sectionlisting.xhtml"], a[href*="launchCopyMDSAssessment"]')) return inMsg;
  // Fallback: the innermost matching table (one with no nested <table>).
  const matches = [...document.querySelectorAll('table')].filter((t) =>
    t.querySelector('a[href*="cp_mds.jsp"]') &&
    t.querySelector('a[href*="sectionlisting.xhtml"], a[href*="launchCopyMDSAssessment"]'));
  return [...matches].reverse().find((t) => !t.querySelector('table')) || matches[matches.length - 1] || null;
}

function getContext() {
  const orgSlug = (typeof getOrg === 'function' ? getOrg()?.org : null) || '';
  let facilityName = '';
  if (typeof window.getFacilityInfo === 'function') facilityName = window.getFacilityInfo()?.facility || '';
  if (!facilityName) {
    const facLink = document.getElementById('pccFacLink');
    facilityName = facLink?.title || facLink?.textContent?.trim() || '';
  }
  return { orgSlug, facilityName };
}

function ensureHeaderColumn(table) {
  const headRow = table.querySelector('tr');
  if (!headRow || headRow.querySelector('.super-ilc-th')) return;
  const th = document.createElement('th');
  th.className = 'detailColHeader super-ilc-th';
  th.setAttribute('nowrap', 'nowrap');
  th.textContent = 'Interviews Due';
  headRow.appendChild(th);
}

function ensureRowCell(rowEl) {
  let cell = rowEl.querySelector('.super-ilc-cell');
  if (!cell) {
    cell = document.createElement('td');
    cell.className = 'super-ilc-cell';
    cell.setAttribute('valign', 'top');
    rowEl.appendChild(cell);
  }
  return cell;
}

function renderRow(rowEl, result, rowMeta) {
  const cell = ensureRowCell(rowEl);
  const chips = result ? toChips(result) : null;
  // Dirty-check by signature: only rebuild when content changes. Rebuilding
  // mutates #msg1, which our own MutationObserver watches — skipping no-op
  // writes is what stops the re-render loop.
  const sig = result ? JSON.stringify(chips) : 'loading';
  if (cell.__ilcSig === sig) return;
  cell.__ilcSig = sig;
  cell.textContent = '';

  if (!result) {
    const s = document.createElement('span');
    s.className = 'super-ilc-loading';
    s.textContent = '…';
    cell.appendChild(s);
    return;
  }

  // Each interview is its own chip (icon + label, no inline dates). Hover/click
  // opens the detail popover anchored to that chip. The source interview rides
  // on `c.iv` so we don't depend on a fragile index zip.
  chips.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = `super-ilc-chip super-ilc-chip--${c.kind}`;
    const icon = CHIP_ICONS[c.kind] || '';
    chip.append(`${icon}${c.label}`);
    if (c.iv) {
      chip.classList.add('super-ilc-chip--clickable');
      attachInterviewHover(chip, c.iv, () => {
        window.SuperAnalytics?.track?.('mds_list_coverage_row_clicked', {
          required: Number(result.coverage?.summary?.required || 0),
          needed: Number(result.coverage?.summary?.needed || 0),
        });
      });
    } else if (c.title) {
      chip.title = c.title; // neutral / error chips keep a plain tooltip
    }
    cell.appendChild(chip);
  });
}

async function runCoverage() {
  if (ILC.busy) return;
  const table = findListTable();
  if (!table) return;
  const rows = scrapeRows(table.querySelector('tbody') || table);
  if (!rows.length) return;

  const idSet = rows.map((r) => r.externalAssessmentId).sort().join(',');
  if (idSet === ILC.lastIdSet && Object.keys(ILC.resultsByKey).length) {
    ensureHeaderColumn(table);
    rows.forEach((r) => renderRow(r.rowEl, ILC.resultsByKey[r.externalAssessmentId] || null, r));
    return;
  }

  const { orgSlug, facilityName } = getContext();
  if (!orgSlug || !facilityName) { console.warn('[ILC] missing org/facility'); return; }

  ILC.busy = true;
  ILC.lastIdSet = idSet;
  ensureHeaderColumn(table);
  rows.forEach((r) => renderRow(r.rowEl, null, r));

  try {
    const data = await fetchBatchCoverage({
      orgSlug, facilityName,
      assessments: rows.map((r) => ({ externalAssessmentId: r.externalAssessmentId })),
    });
    ILC.resultsByKey = {};
    (data.results || []).forEach((res) => { ILC.resultsByKey[String(res.key)] = res; });
    rows.forEach((r) => renderRow(r.rowEl, ILC.resultsByKey[r.externalAssessmentId] || { status: 'not_synced' }, r));
    window.SuperAnalytics?.track?.('mds_list_coverage_shown', {
      rows: rows.length,
      ok: (data.results || []).filter((x) => x.status === 'ok').length,
      not_synced: (data.results || []).filter((x) => x.status === 'not_synced').length,
    });
  } catch (err) {
    console.error('[ILC] batch coverage failed:', err);
    ILC.lastIdSet = '';
    rows.forEach((r) => renderRow(r.rowEl, { status: 'error' }, r));
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'mds_list_coverage',
      error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
      error_type: 'api_error',
    });
  } finally {
    ILC.busy = false;
  }
}

async function initIlc() {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (!authState?.authenticated) return;
  if (!isInProgressList()) return;
  runCoverage();
}
window.SuperListCoverage = { runCoverage, initIlc };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initIlc, 400));
} else {
  setTimeout(initIlc, 400);
}

// PCC re-renders the table in place on unit/floor/status filter + screen change.
let ilcDebounce = null;
const isOurNode = (n) => n && n.nodeType === 1 &&
  (n.classList?.contains('super-ilc-cell') || n.classList?.contains('super-ilc-th') || n.closest?.('.super-ilc-cell'));
const ilcObserver = new MutationObserver((muts) => {
  // Ignore mutations we caused ourselves (chip writes into our cells, header th)
  // so our own DOM writes don't re-trigger a render cycle.
  const external = muts.some((m) => {
    if (m.target?.closest?.('.super-ilc-cell')) return false;
    const added = [...m.addedNodes];
    if (added.length && added.every(isOurNode)) return false;
    return true;
  });
  if (!external) return;
  clearTimeout(ilcDebounce);
  ilcDebounce = setTimeout(() => { if (isInProgressList()) runCoverage(); }, 350);
});
function startIlcObserver() {
  const target = document.getElementById('msg1') || document.querySelector('form[name="client"]') || document.body;
  ilcObserver.observe(target, { childList: true, subtree: true });
}
startIlcObserver();

let ilcLastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== ilcLastUrl) {
    ilcLastUrl = location.href;
    ILC.lastIdSet = ''; ILC.resultsByKey = {};
    setTimeout(initIlc, 400);
  }
}).observe(document.body, { childList: true, subtree: true });
