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
  }
};

// Make available globally
window.CertAPI = CertAPI;
