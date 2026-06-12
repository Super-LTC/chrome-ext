/**
 * Super Verify — injects a "Super Verify" button next to PCC's native Verify
 * button on the MDS section-listing page (`/clinical/mds3/sectionlisting.xhtml`).
 *
 * On click it scrapes every section's live answers, POSTs them to
 * `/api/extension/mds/verify`, and opens a full-screen Preact results modal
 * (PDPM reimbursement findings + QM trigger preview).
 *
 * Mirrors `modules/care-plan-stamp/inject-button.js`: URL check, idempotent
 * injection, polling init, MutationObserver re-injection on SPA nav, and a
 * dynamic Preact import so the modal stays out of the initial bundle.
 *
 * NOTE: stub for Task 1 (module skeleton). Real injection lands in Task 5.
 */

export function injectSuperVerifyButton() {
  // Implemented in Task 5.
}
