/**
 * Mark a single PCC care plan focus as resolved.
 *
 * STUB — not yet wired. Drew will capture the real PCC editNeed POST fields
 * (URL, method, full form body) from DevTools Network tab when a nurse
 * manually resolves a focus, then fill in the implementation below.
 *
 * Until then, the Remove bucket's [Confirm & resolve] action surfaces a
 * friendly error so the rest of the audit UI can be built and tested
 * without blocking on the PCC POST capture.
 *
 * Reference implementation pattern lives in pcc-stamp.js — the resolve call
 * should reuse the same editNeed endpoint but populate `resolved_date` and
 * `resolved_type` instead of leaving them empty (see existing
 * `resolved_date: ''` lines in pcc-stamp.js).
 *
 * Expected eventual signature (don't change without coordinating with
 * Remove pane / modal wiring):
 *   resolveFocus({ patientId, careplanId, pccFocusId, pccFocusStdItemId, miniToken, resolvedType? })
 *     → Promise<{ ok: true }>
 */

async function resolveFocus(/* args */) {
  throw new Error(
    'PCC focus-resolve not yet wired. Capture the editNeed POST in DevTools and fill in pcc-resolve.js.'
  );
}

window.CarePlanResolveAPI = { resolveFocus };
