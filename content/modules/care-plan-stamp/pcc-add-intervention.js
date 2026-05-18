/**
 * Add one or more interventions to an EXISTING PCC focus.
 *
 * STUB — Drew will capture the real PCC "Add Intervention" POST from
 * DevTools Network tab and fill in the implementation. The shape and
 * sequencing below is the best-guess based on pcc-stamp.js's
 * editIntervention pattern.
 *
 * Expected eventual signature:
 *   addInterventions({
 *     patientId, careplanId, miniToken,
 *     pccFocusId, pccFocusStdItemId,
 *     interventions: Array<{ description, kardexCategory, positionOne }>,
 *     orgDropdowns,   // for resolving canonicals to PCC IDs client-side, OR
 *                      // pass canonicals through and resolve server-side
 *   })
 *     → Promise<{ ok: true, addedCount: number, errors: Array<{ idx, message }> }>
 *
 * Sequential PCC POSTs — PCC doesn't bulk-accept. On any single failure,
 * surface and stop; preserve completed adds.
 */

async function addInterventions(/* args */) {
  throw new Error(
    'Add-intervention to existing focus not yet wired. Capture the PCC POST in DevTools and fill in pcc-add-intervention.js.'
  );
}

window.CarePlanAddInterventionAPI = { addInterventions };
