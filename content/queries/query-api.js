// Query API Layer for Super LTC Chrome Extension
// Handles all API calls related to diagnosis queries

// Fire api_request_failed when an API_REQUEST returns { success: false }.
// `endpoint` MUST be a sanitized template (with `:id` placeholders) — never the
// raw URL with patient/query IDs. Vanilla file → uses window.SuperAnalytics.
function _trackApiFail(endpoint, response) {
  try {
    const sa = window.SuperAnalytics;
    if (!sa) return;
    const status = sa.toHttpStatus ? sa.toHttpStatus({ message: response?.error }) : null;
    sa.track('api_request_failed', { endpoint, status });
  } catch (_) { /* analytics never breaks callers */ }
}

const QueryAPI = {
  /**
   * Fetch queries for a specific MDS assessment
   * @param {string} mdsAssessmentId - PCC external assessment ID
   * @param {string} facilityName - PCC facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<{queries: Array, mdsAssessment: Object|null}>}
   */
  async fetchAssessmentQueries(mdsAssessmentId, facilityName, orgSlug) {
    const params = new URLSearchParams({
      mdsAssessmentId,
      facilityName,
      orgSlug
    });

    const endpoint = `/api/extension/diagnosis-queries/by-assessment?${params}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/by-assessment', response);
      throw new Error(response.error || 'Failed to fetch assessment queries');
    }

    return {
      queries: response.data?.queries || [],
      mdsAssessment: response.data?.mdsAssessment || null,
      totalCount: response.data?.totalCount || 0
    };
  },

  /**
   * Fetch dashboard queries (all facilities)
   * @returns {Promise<{pending: Array, outstanding: Array, recentlySigned: Array, counts: Object}>}
   */
  async fetchDashboardQueries() {
    const endpoint = `/api/extension/diagnosis-queries/dashboard`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/dashboard', response);
      throw new Error(response.error || 'Failed to fetch dashboard queries');
    }

    return {
      pending: response.data?.pending || [],
      outstanding: response.data?.outstanding || [],
      recentlySigned: response.data?.recentlySigned || [],
      counts: response.data?.counts || { pending: 0, outstanding: 0, recentlySigned: 0 }
    };
  },

  /**
   * Resend SMS notification for a query
   * @param {string} queryId - Query UUID
   * @param {Array<string>} practitionerIds - Optional specific practitioners to resend to
   * @returns {Promise<{resendCount: number, results: Array}>}
   */
  async resendQuery(queryId, practitionerIds = null) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}/resend`;
    const body = practitionerIds ? { practitionerIds } : {};

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify(body)
      }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/resend', response);
      throw new Error(response.error || 'Failed to resend query');
    }

    return {
      resendCount: response.data?.resendCount || 0,
      results: response.data?.results || []
    };
  },

  /**
   * Get signed PDF URL for a query
   * @param {string} queryId - Query UUID
   * @returns {Promise<{pdfUrl: string, expiresAt: string}>}
   */
  async getQueryPdf(queryId) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}/pdf`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/pdf', response);
      throw new Error(response.error || 'Failed to get PDF URL');
    }

    return {
      pdfUrl: response.data?.pdfUrl,
      expiresAt: response.data?.expiresAt
    };
  },

  /**
   * Generate the unsigned print-preview PDF for a query and trigger a
   * download via the background service worker. The background does the
   * authenticated POST, base64-encodes the bytes, and hands the data URL to
   * chrome.downloads — content scripts can't ferry binary across runtime.
   * @param {string} queryId
   * @param {{code: string, description: string, filename?: string}} selected
   * @returns {Promise<{downloadId: number}>}
   */
  async printQueryPdf(queryId, { code, description, filename } = {}) {
    if (!code || !description) {
      throw new Error('selectedIcd10Code and selectedIcd10Description are required');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'PRINT_QUERY_PDF',
      queryId,
      selectedIcd10Code: code,
      selectedIcd10Description: description,
      filename,
    });

    if (!response?.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/print', response || {});
      throw new Error(response?.error || 'Failed to print query');
    }

    return { downloadId: response.downloadId };
  },

  /**
   * Create a new diagnosis query
   * @param {Object} queryData - Query data
   * @returns {Promise<{query: Object}>}
   */
  async createQuery(queryData) {
    const endpoint = `/api/extension/diagnosis-queries`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify(queryData)
      }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries', response);
      throw new Error(response.error || 'Failed to create query');
    }

    return {
      query: response.data?.query
    };
  },

  /**
   * Send a query to practitioners
   * @param {string} queryId - Query UUID
   * @param {Array<string>} practitionerIds - Practitioner IDs to send to
   * @param {string} nurseEditedNote - Note text
   * @returns {Promise<Object>}
   */
  async sendQuery(queryId, practitionerIds, nurseEditedNote) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}/send`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify({
          practitionerIds,
          nurseEditedNote
        })
      }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/send', response);
      throw new Error(response.error || 'Failed to send query');
    }

    return response.data;
  },

  /**
   * Generate AI note for a query
   * @param {string} mdsItem - MDS item code
   * @param {Object} solverResult - AI solver result
   * @returns {Promise<{note: string, preferredIcd10: Object, icd10Options: Array}>}
   */
  async generateNote(mdsItem, solverResult) {
    const endpoint = `/api/extension/diagnosis-queries/generate-note`;

    // Forward the source ICD-10 code at the top level when the caller has
    // it on the solverResult (set by Icd10QueryFlow from the row the user
    // clicked). Backend defaults preferredIcd10 to this code when it's a
    // valid option, instead of letting the model pick alphabetically.
    const sourceIcd10Code = solverResult?.icd10Code || solverResult?.sourceIcd10Code || solverResult?.code || null;
    const body = sourceIcd10Code
      ? { mdsItem, icd10Code: sourceIcd10Code, solverResult }
      : { mdsItem, solverResult };

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify(body)
      }
    });

    if (!response.success || !response.data?.note) {
      _trackApiFail('/api/extension/diagnosis-queries/generate-note', response);
      throw new Error(response.error || 'Failed to generate note');
    }

    return {
      note: response.data.note,
      preferredIcd10: response.data.preferredIcd10 || null,
      icd10Options: response.data.icd10Options || []
    };
  },

  /**
   * Fetch practitioners for a facility
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Array>}
   */
  async fetchPractitioners(facilityName, orgSlug) {
    const endpoint = `/api/extension/practitioners?facilityName=${encodeURIComponent(facilityName)}&orgSlug=${orgSlug}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/practitioners', response);
      throw new Error(response.error || 'Failed to fetch practitioners');
    }

    return response.data?.practitioners || [];
  },

  /**
   * Fetch a single query by ID
   * @param {string} queryId - Query UUID
   * @returns {Promise<Object>} Full query object
   */
  async getQuery(queryId) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id', response);
      throw new Error(response.error || 'Failed to fetch query');
    }

    return response.data?.query || response.data;
  }
};

// Make available globally
window.QueryAPI = QueryAPI;
