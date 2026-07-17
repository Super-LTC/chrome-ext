// Certification API Layer for Super LTC Chrome Extension
// Handles all API calls related to Medicare certifications

const CertAPI = {
  /**
   * Fetch certification dashboard summary for a facility
   * Returns null when certs module is disabled for the facility
   * @param {string} facilityName
   * @param {string} orgSlug
   * @returns {Promise<{pending, overdue, dueSoon, signedLast7Days}|null>}
   */
  async fetchDashboard(facilityName, orgSlug) {
    const params = new URLSearchParams({ facilityName, orgSlug });
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/dashboard?${params}`,
      options: { method: 'GET' }
    });

    // Non-2xx (404/403) means module disabled or no access — return null
    if (!response.success) return null;

    return response.data || null;
  },

  /**
   * Fetch certifications list with optional filters
   * @param {string} facilityName
   * @param {string} orgSlug
   * @param {Object} [filters]
   * @param {string} [filters.status] - Filter by status (pending, sent, signed, skipped)
   * @param {string} [filters.patientId] - Filter by patient
   * @returns {Promise<Array>}
   */
  async fetchCertifications(facilityName, orgSlug, filters = {}) {
    const params = new URLSearchParams({ facilityName, orgSlug });
    if (filters.status) params.set('status', filters.status);
    if (filters.patientId) params.set('patientId', filters.patientId);

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications?${params}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch certifications');
    }

    return response.data?.certifications || [];
  },

  /**
   * Fetch a page of discharged patients (ended Part A stays), newest-discharge-first.
   * Patient-grouped + paginated — distinct shape from fetchCertifications.
   * @param {string} facilityName
   * @param {string} orgSlug
   * @param {Object} [opts]
   * @param {number} [opts.limit=10] - page size (max 50 server-side)
   * @param {number} [opts.offset=0] - for "load more", pass offset += limit
   * @returns {Promise<{discharged: Array, hasMore: boolean, limit: number, offset: number}>}
   */
  async fetchDischarged(facilityName, orgSlug, { limit = 10, offset = 0 } = {}) {
    const params = new URLSearchParams({ facilityName, orgSlug, limit, offset });
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/discharged?${params}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch discharged certifications');
    }

    const data = response.data || {};
    return {
      discharged: data.discharged || [],
      hasMore: !!data.hasMore,
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  },

  /**
   * Fetch a page of the facility-wide certification AUDIT list — EVERY cert for
   * the facility regardless of status or how long ago it was signed. This is the
   * un-capped counterpart to the dashboard's 7-day "signed" window and the
   * discharged archive: a currently-admitted resident whose cert was signed
   * weeks ago shows up in neither of those, which is exactly the gap for a 100%
   * compliance audit. Flat (not stay-grouped) + paginated, with a total.
   *
   * Note: signedAfter/signedBefore filter on signed_at, so a date range narrows
   * to signed certs only. Omit them (and status) to pull the complete list.
   *
   * @param {string} facilityName
   * @param {string} orgSlug
   * @param {Object} [opts]
   * @param {string} [opts.status]        - status filter (pending|sent|signed|delayed|skipped|revoked); omit for ALL
   * @param {string} [opts.signedAfter]   - ISO date (YYYY-MM-DD), inclusive lower bound on signed_at
   * @param {string} [opts.signedBefore]  - ISO date (YYYY-MM-DD), inclusive upper bound on signed_at
   * @param {number} [opts.limit=100]     - page size (max 500 server-side)
   * @param {number} [opts.offset=0]      - for "load more", pass offset += limit
   * @returns {Promise<{certs: Array, total: number, hasMore: boolean, limit: number, offset: number}>}
   */
  async fetchAuditCerts(facilityName, orgSlug, { status, signedAfter, signedBefore, limit = 100, offset = 0 } = {}) {
    const params = new URLSearchParams({ facilityName, orgSlug, limit, offset });
    if (status) params.set('status', status);
    if (signedAfter) params.set('signedAfter', signedAfter);
    if (signedBefore) params.set('signedBefore', signedBefore);

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/audit?${params}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch certification audit list');
    }

    const data = response.data || {};
    return {
      certs: data.certs || [],
      total: data.total ?? 0,
      hasMore: !!data.hasMore,
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  },

  /**
   * Fetch cert chain for a specific patient
   * @param {string} facilityName
   * @param {string} orgSlug
   * @param {string} patientId
   * @returns {Promise<Array>}
   */
  async fetchByPatient(facilityName, orgSlug, patientId) {
    const params = new URLSearchParams({ patientId, facilityName, orgSlug });
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/by-patient?${params}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch patient certifications');
    }

    return response.data?.certifications || response.data || [];
  },

  /**
   * Fetch practitioners for a facility (for send modal)
   * @param {string} facilityName
   * @param {string} orgSlug
   * @returns {Promise<Array>}
   */
  async fetchPractitioners(facilityName, orgSlug) {
    const params = new URLSearchParams({ facilityName, orgSlug });
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/practitioners?${params}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch practitioners');
    }

    return response.data?.practitioners || [];
  },

  /**
   * Fetch send history for a certification
   * @param {string} certId
   * @returns {Promise<Array>}
   */
  async fetchSendHistory(certId) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/sends`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch send history');
    }

    return response.data?.sends || [];
  },

  /**
   * Save clinical reason for a certification
   * @param {string} certId
   * @param {Object} data
   * @param {string} data.clinicalReason
   * @param {number} data.estimatedDays
   * @param {string} [data.planForDischarge]
   * @returns {Promise<Object>}
   */
  async saveClinicalReason(certId, { clinicalReason, estimatedDays, planForDischarge }) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}`,
      options: {
        method: 'PUT',
        body: JSON.stringify({ clinicalReason, estimatedDays, planForDischarge })
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to save clinical reason');
    }

    return response.data;
  },

  /**
   * Send certification to practitioners
   * @param {string} certId
   * @param {Array<string>} practitionerIds
   * @param {string} [delayReason]
   * @returns {Promise<Object>}
   */
  async sendCert(certId, practitionerIds, delayReason) {
    const body = { practitionerIds };
    if (delayReason) body.delayReason = delayReason;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/send`,
      options: {
        method: 'POST',
        body: JSON.stringify(body)
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to send certification');
    }

    return response.data;
  },

  /**
   * Mark a certification as delayed (log delay reason without sending)
   * @param {string} certId
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async delayCert(certId, reason) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/delay`,
      options: {
        method: 'POST',
        body: JSON.stringify({ reason })
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to mark certification as delayed');
    }

    return response.data;
  },

  /**
   * Skip a certification
   * @param {string} certId
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async skipCert(certId, reason) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/skip`,
      options: {
        method: 'POST',
        body: JSON.stringify({ reason })
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to skip certification');
    }

    return response.data;
  },

  /**
   * Fetch practitioner workload (queue + recently signed)
   * @param {string} practitionerId
   * @returns {Promise<{practitioner, queue, recentlySigned}>}
   */
  async fetchPractitionerWorkload(practitionerId, facilityName, orgSlug) {
    const params = new URLSearchParams();
    if (facilityName) params.set('facilityName', facilityName);
    if (orgSlug) params.set('orgSlug', orgSlug);
    const qs = params.toString();
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/practitioners/${practitionerId}${qs ? `?${qs}` : ''}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch practitioner workload');
    }

    return response.data;
  },

  /**
   * Get a short-lived signed URL to view a cert's PDF.
   * @param {string} certId
   * @param {{delayed?: boolean}} [opts] - delayed=true returns the delay-letter variant
   * @returns {Promise<{url: string}>}
   */
  async viewSignedPdf(certId, { delayed } = {}) {
    const path = delayed ? 'delayed-pdf' : 'pdf';
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/${path}`,
      options: { method: 'GET' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch certification PDF');
    }

    return { url: response.data?.url };
  },

  /**
   * Unskip a certification
   * @param {string} certId
   * @returns {Promise<Object>}
   */
  async unskipCert(certId) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/skip`,
      options: { method: 'DELETE' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to unskip certification');
    }

    return response.data;
  },

  /**
   * Revoke an outstanding (sent) certification — invalidates the practitioner's
   * live signing link so the signature can no longer be completed. Reversible
   * via unrevokeCert. `reason` is required (non-empty).
   * @param {string} certId
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async revokeCert(certId, reason) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/revoke`,
      options: {
        method: 'POST',
        body: JSON.stringify({ reason })
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to revoke certification');
    }

    return response.data;
  },

  /**
   * Un-revoke a certification — restores it to its prior `sent` status. No body.
   * @param {string} certId
   * @returns {Promise<Object>}
   */
  async unrevokeCert(certId) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/certifications/${certId}/revoke`,
      options: { method: 'DELETE' }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to un-revoke certification');
    }

    return response.data;
  },

  /**
   * Read the user's notification preferences for a facility. ONE round-trip
   * populates the whole settings popover (all five toggles) plus which modules
   * are enabled (used to hide toggles whose module is off) and the userId
   * (used to key the per-user banner-dismiss flag on shared workstations).
   *
   * Returns null when the certs module is disabled or the user lacks access —
   * callers treat null as "hide the settings/banner UI" (same as fetchDashboard).
   *
   * @param {string} facilityName
   * @param {string} orgSlug
   * @returns {Promise<{settings, modules, settingModules, moduleEnabled, morningDigest, userId}|null>}
   */
  async fetchNotificationPrefs(facilityName, orgSlug) {
    const params = new URLSearchParams({ facilityName, orgSlug });
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/notification-preferences?${params}`,
      options: { method: 'GET' }
    });

    // Non-2xx (404/403) means module disabled or no access — return null
    if (!response.success) return null;

    return response.data || null;
  },

  /**
   * Flip one or more notification toggles for a facility. The backend merges any
   * subset, so pass just the key(s) being changed. Returns the full updated
   * `settings` object so the caller can reconcile optimistic state.
   *
   * @param {string} facilityName
   * @param {string} orgSlug
   * @param {Object} patch - subset of toggle booleans, e.g. { morningDigest: true }
   * @returns {Promise<{settings: Object, morningDigest: boolean}>}
   */
  async updateNotificationPrefs(facilityName, orgSlug, patch) {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/notification-preferences`,
      options: {
        method: 'POST',
        body: JSON.stringify({ facilityName, orgSlug, ...patch })
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to update notification preferences');
    }

    return response.data;
  }
};

// Make available globally
window.CertAPI = CertAPI;
