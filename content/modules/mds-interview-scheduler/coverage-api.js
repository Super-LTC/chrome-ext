/**
 * Backend client for the interview-coverage engine.
 * Auth handled by background.js via the API_REQUEST relay (bearer token).
 * GET /api/extension/mds/interview-coverage with query params.
 *
 * Exports on window.MdsSchedulerAPI:
 *   fetchInterviewCoverage(query) → coverage response | throws
 */
async function fetchInterviewCoverage(query) {
  // Strip empty/undefined; encode as query string.
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const endpoint = `/api/extension/mds/interview-coverage?${params.toString()}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: { method: 'GET' },
  });

  if (!response?.success) {
    const err = new Error(response?.error || 'Failed to fetch interview coverage');
    err.endpoint = endpoint;
    err.code = response?.code || response?.data?.code;
    throw err;
  }
  return response.data || response;
}

window.MdsSchedulerAPI = { fetchInterviewCoverage };
