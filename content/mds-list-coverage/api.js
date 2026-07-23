// content/mds-list-coverage/api.js
/** POST the visible rows' per-row keys ({externalAssessmentId?, pccPublicId?,
 *  ardDate?, description?}); returns { success, rowMap, results } (#967), or throws.
 *    rowMap  — index-parallel to `assessments`: the resolved externalAssessmentId
 *              (string) per row, or null when unresolvable.
 *    results — BatchCoverageResult[] keyed by `.key` (= externalAssessmentId).
 *  Correlate a row to its coverage via results.find(x => x.key === rowMap[i]). */
export async function fetchBatchCoverage({ orgSlug, facilityName, assessments }) {
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: '/api/extension/mds/interview-coverage/batch',
    options: {
      method: 'POST',
      body: JSON.stringify({ orgSlug, facilityName, assessments }),
    },
  });
  if (!response?.success) {
    const err = new Error(response?.error || 'Batch coverage request failed');
    err.status = response?.status;
    throw err;
  }
  return response.data; // { success: true, results: [...] }
}
