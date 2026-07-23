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
    const params = new URLSearchParams({ facilityName, orgSlug });
    // NUMERIC assessment id only — never an EID_ token. When it's EID-dead the
    // resolver context appended below (pccPublicId + ARD + assessmentType) binds
    // the assessment instead (#967 — this panel silently emptied on flipped pages).
    if (/^\d+$/.test(String(mdsAssessmentId || ''))) params.set('mdsAssessmentId', mdsAssessmentId);
    window.appendMDSContextParams?.(params);

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
    // A codeless print is allowed — the physician fills the ICD-10 line in on
    // paper. Send empty strings so the print PDF just leaves the code blank.
    const response = await chrome.runtime.sendMessage({
      type: 'PRINT_QUERY_PDF',
      queryId,
      selectedIcd10Code: code || '',
      selectedIcd10Description: description || '',
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
   * Full-library ICD-10 search for the nurse's "attach a suggested code" picker.
   * Backend searches the entire dictionary by code or description (min 2 chars)
   * and already scrubs initial-encounter (…A/…B/…C) codes server-side, so the
   * extension does not filter. Returns the raw `{ results }` payload data;
   * callers normalize via normalizeSearchResults().
   * @param {string} q - Search text (code or description)
   * @returns {Promise<{results: Array<{code: string, description: string}>}>}
   */
  async searchIcd10(q) {
    const query = (q || '').trim();
    if (query.length < 2) return { results: [] };

    const endpoint = `/api/extension/icd10-search?q=${encodeURIComponent(query)}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackApiFail('/api/extension/icd10-search', response);
      throw new Error(response.error || 'Failed to search ICD-10 codes');
    }

    return { results: response.data?.results || [] };
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
  },

  /**
   * Edit an existing query's note and/or effective (onset) date. Allowed by the
   * backend until the query is `signed` (it enforces this with a 400; callers
   * should also gate the UI and handle the error defensively).
   *
   * Only the keys you pass are changed:
   *   - `nurseEditedNote`: string to replace the note.
   *   - `effectiveDate`: `"YYYY-MM-DD"` to set, or `null` to CLEAR back to the
   *     createdAt default. `null` is meaningful, so it's forwarded as-is; a key
   *     left `undefined` is omitted entirely (leave unchanged).
   *   - `recommendedIcd10`: replaces the candidate codes the doctor is offered.
   *     Must be a NON-EMPTY `[{ code, description?, reason? }]` — the backend
   *     400s on `[]`, so there is no "clear back to codeless" via PATCH. A
   *     caller whose nurse cleared the selection must omit the key.
   *     Note: on `I8000:<code>` queries the first code becomes the query's
   *     identity and the server syncs `mdsItem`/`mdsItemName` to it, so the
   *     returned query may have a different `mdsItem` than the one sent.
   * @param {string} queryId
   * @param {{ nurseEditedNote?: string, effectiveDate?: string|null, recommendedIcd10?: Array<{code: string, description?: string, reason?: string}> }} changes
   * @returns {Promise<Object>} the updated query (with fresh `timing`)
   */
  async patchQuery(queryId, changes = {}) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}`;

    // Build the body from only the keys the caller actually provided. `null` is
    // a real value (clear effectiveDate); `undefined` means "don't touch".
    const body = {};
    if (changes.nurseEditedNote !== undefined) body.nurseEditedNote = changes.nurseEditedNote;
    if (changes.effectiveDate !== undefined) body.effectiveDate = changes.effectiveDate;
    // Guard the backend's non-empty rule here too, so a caller that slipped an
    // empty array through gets "leave unchanged" instead of a 400.
    if (Array.isArray(changes.recommendedIcd10) && changes.recommendedIcd10.length > 0) {
      body.recommendedIcd10 = changes.recommendedIcd10;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'PATCH',
        body: JSON.stringify(body)
      }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id', response);
      throw new Error(response.error || 'Failed to update query');
    }

    return response.data?.query || response.data;
  },

  /**
   * Preview the ARD/effective-date `timing` for a query that doesn't exist yet
   * (the create form). The backend owns the lookback window + 7-vs-30-day rule,
   * so we ask it rather than deriving locally.
   *
   * Best-effort by design: a failed preview must NEVER block query creation, so
   * this resolves to `null` (rather than throwing) on any error or missing
   * `mdsItem`. Callers treat `null` as "no window guidance available".
   * @param {{ mdsItem: string, ardDate?: string|null, effectiveDate?: string|null }} params
   * @returns {Promise<Object|null>} the `timing` object, or null
   */
  async previewTiming({ mdsItem, ardDate, effectiveDate } = {}) {
    if (!mdsItem) return null;

    const params = new URLSearchParams({ mdsItem });
    if (ardDate) params.set('ardDate', ardDate);
    if (effectiveDate) params.set('effectiveDate', effectiveDate);

    const endpoint = `/api/extension/diagnosis-queries/preview-timing?${params}`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint
      });
      if (!response?.success) {
        _trackApiFail('/api/extension/diagnosis-queries/preview-timing', response || {});
        return null;
      }
      return response.data?.timing || null;
    } catch (err) {
      console.warn('Super LTC: preview-timing failed (non-fatal)', err);
      return null;
    }
  },

  /**
   * Revoke an outstanding (sent) diagnosis query — invalidates the
   * practitioner's live signing link so the signature can no longer be
   * completed. Reversible via unrevokeQuery. `reason` is required (non-empty).
   * @param {string} queryId
   * @param {string} reason
   * @returns {Promise<Object>} the updated query
   */
  async revokeQuery(queryId, reason) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}/revoke`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify({ reason })
      }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/revoke', response);
      throw new Error(response.error || 'Failed to revoke query');
    }

    return response.data?.query || response.data;
  },

  /**
   * Un-revoke a diagnosis query — restores it to its prior `sent` status.
   * No request body.
   * @param {string} queryId
   * @returns {Promise<Object>} the updated query
   */
  async unrevokeQuery(queryId) {
    const endpoint = `/api/extension/diagnosis-queries/${queryId}/revoke`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: { method: 'DELETE' }
    });

    if (!response.success) {
      _trackApiFail('/api/extension/diagnosis-queries/:id/revoke', response);
      throw new Error(response.error || 'Failed to un-revoke query');
    }

    return response.data?.query || response.data;
  }
};

// Make available globally
window.QueryAPI = QueryAPI;
