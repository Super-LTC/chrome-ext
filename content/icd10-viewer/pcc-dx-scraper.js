/**
 * PCC Med Diag DOM scraper.
 *
 * Reads PCC's #meddiaglisting table on the patient's Med Diag page and
 * returns the patient's currently-coded ICD-10 list. Used by the ICD-10
 * viewer to override the backend's stale "what's already coded" set —
 * see docs/handoffs/2026-05-08-icd10-pcc-overlay.md for the why.
 *
 * Returns [] when the table isn't on the page (viewer was opened from
 * somewhere else). Callers must treat [] as "no override available" and
 * fall back to backend-only behavior, NOT as "patient has zero codes."
 */
const PCCDxScraper = {
  /**
   * @returns {Array<{
   *   icd10Code: string,
   *   description: string,
   *   rank: string,
   *   onsetDate: string,
   *   classification: string,
   *   pdpmComorbidity: string,
   *   clinicalCategory: string,
   * }>}
   */
  scrape() {
    const table = document.getElementById('meddiaglisting');
    if (!table) return [];

    // Build column-name → cell-index map from the header. Column order can
    // shift across PCC versions and the extension injects its own CP/Query
    // columns, so reading by label is the only stable approach.
    const headerCells = table.querySelectorAll('thead th');
    const idx = {};
    headerCells.forEach((th, i) => {
      const label = (th.textContent || '').trim().toLowerCase();
      if (label === 'code') idx.code = i;
      else if (label === 'description') idx.description = i;
      else if (label.includes('pdpm')) idx.pdpm = i;
      else if (label.includes('clinical category')) idx.category = i;
      else if (label === 'date') idx.onsetDate = i;
      else if (label === 'rank') idx.rank = i;
      else if (label === 'classification') idx.classification = i;
    });

    if (idx.code === undefined) {
      console.warn('[PCCDxScraper] Code column not found in #meddiaglisting header');
      return [];
    }

    const ICD10_RX = /^[A-Z]\d{2}(\.[A-Z0-9]+)?$/i;
    const rows = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const tds = tr.children;
      const codeCell = tds[idx.code];
      if (!codeCell) return;
      const code = (codeCell.textContent || '').trim();
      if (!ICD10_RX.test(code)) return; // header echoes, blank rows, etc.

      const cellText = (i) =>
        i !== undefined && tds[i] ? (tds[i].textContent || '').trim() : '';

      rows.push({
        icd10Code: code.toUpperCase(),
        description: cellText(idx.description),
        rank: cellText(idx.rank),
        onsetDate: cellText(idx.onsetDate),
        classification: cellText(idx.classification),
        pdpmComorbidity: cellText(idx.pdpm),
        clinicalCategory: cellText(idx.category),
      });
    });

    if (rows.length > 200) {
      console.warn(
        `[PCCDxScraper] Scraped ${rows.length} rows (>200). Selector may be picking up unintended content.`
      );
    }

    return rows;
  },

  /**
   * Wait for PCC's #meddiaglisting table to settle after a mutation
   * (e.g., post AI Code Patient batch submit, where PCC re-renders the
   * dx table async). Resolves once mutations have been quiet for `quietMs`,
   * or after `timeoutMs` no matter what.
   *
   * @param {{ timeoutMs?: number, quietMs?: number }} [opts]
   */
  async waitForSettled({ timeoutMs = 3000, quietMs = 250 } = {}) {
    const target = document.getElementById('meddiaglisting');
    if (!target) return;
    return new Promise((resolve) => {
      let quietTimer;
      let deadline;
      const done = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(deadline);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      observer.observe(target, { childList: true, subtree: true });
      // Cover the case where PCC was already done before we attached
      quietTimer = setTimeout(done, quietMs);
      deadline = setTimeout(done, timeoutMs);
    });
  },
};

window.PCCDxScraper = PCCDxScraper;
