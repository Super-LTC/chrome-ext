/**
 * ICD-10 Viewer API Module
 * Handles all API calls for ICD-10 annotations, diagnoses, documents, and word blocks
 */

// Fire api_request_failed when an API_REQUEST returns { success: false }.
// Vanilla file → uses window.SuperAnalytics. Endpoints MUST be sanitized
// templates with ':id' placeholders, never raw URLs with patient/document IDs.
function _trackIcd10ApiFail(endpoint, response) {
  try {
    const sa = window.SuperAnalytics;
    if (!sa) return;
    const status = sa.toHttpStatus ? sa.toHttpStatus({ message: response?.error }) : null;
    sa.track('api_request_failed', { endpoint, status });
  } catch (_) { /* analytics never breaks callers */ }
}

const ICD10API = {
  // Cache for word blocks (keyed by document ID)
  wordBlocksCache: new Map(),

  // Cache for evidence summaries (keyed by base code)
  summaryCache: new Map(),

  // Cache for presigned URLs with expiry tracking
  urlCache: new Map(),

  // Cache for v2 click-to-load annotation detail.
  // Key: `${patientId}|${mdsAssessmentId || ''}|${baseCode}` → annotations[]
  // Cleared on viewer close + when assessment changes.
  detailCache: new Map(),

  // Minimum time before URL expiry to trigger refresh (2 minutes)
  URL_REFRESH_THRESHOLD: 2 * 60 * 1000,

  /**
   * v2 mode toggle. ON by default during cutover.
   * Explicit opt-out: window.__ICD10_V2 = false  (falls back to v1).
   * (Also accepts an explicit `true` for symmetry / future tooling.)
   * @returns {boolean}
   */
  _useV2() {
    if (typeof window === 'undefined') return true;
    if (window.__ICD10_V2 === false) return false;
    return true;
  },

  /**
   * Build a cache key for v2 detail lookups so an assessment swap busts
   * the per-base-code cache without affecting other patients.
   */
  _detailCacheKey(patientId, baseCode, mdsAssessmentId) {
    return `${patientId}|${mdsAssessmentId || ''}|${baseCode}`;
  },

  /**
   * Get ICD-10 annotations for a patient
   * @param {string} patientId - Patient ID
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Object>} - { topRanked, flatAnnotations, counts }
   */
  async getAnnotations(patientId, facilityName, orgSlug, mdsAssessmentId, pccCodes) {
    const v2 = this._useV2();

    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay();
      if (v2) {
        return this._processV2ListResponse(this._adaptV1MockToV2(ICD10MockData.apiResponse));
      }
      return this._processAnnotationResponse(ICD10MockData.apiResponse);
    }

    const path = v2 ? '/api/extension/icd10-annotations/v2' : '/api/extension/icd10-annotations';
    const params = new URLSearchParams({
      patientId,
      facilityName,
      orgSlug,
    });
    if (v2 && mdsAssessmentId) params.set('mdsAssessmentId', mdsAssessmentId);

    // pccCodes: live PCC Med Diag list (override for backend's stale DB).
    // CRITICAL: only attach when there's at least one code. Sending an empty
    // string would tell the backend "patient has zero codes" → empty Approved
    // bucket → every code looks like a fresh suggestion. See handoff doc.
    if (Array.isArray(pccCodes) && pccCodes.length > 0) {
      params.set('pccCodes', pccCodes.join(','));
    }

    const endpoint = `${path}?${params}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackIcd10ApiFail(path, response);
      throw new Error(response.error || 'Failed to fetch annotations');
    }

    const data = response.data || response;
    return v2 ? this._processV2ListResponse(data) : this._processAnnotationResponse(data);
  },

  /**
   * Fetch full per-mention detail for one base code. v2-only.
   * Caches by (patientId, mdsAssessmentId, baseCode) for the viewer's lifetime.
   * Errors propagate so the caller can show an inline retry state.
   */
  async getAnnotationsByBaseCode(patientId, baseCode, facilityName, orgSlug, mdsAssessmentId) {
    const cacheKey = this._detailCacheKey(patientId, baseCode, mdsAssessmentId);
    if (this.detailCache.has(cacheKey)) return this.detailCache.get(cacheKey);

    if (this._useMockData()) {
      await this._simulateDelay(120);
      const annotations = this._extractMockAnnotationsByBaseCode(baseCode);
      this.detailCache.set(cacheKey, annotations);
      return annotations;
    }

    const params = new URLSearchParams({ patientId, facilityName, orgSlug });
    if (mdsAssessmentId) params.set('mdsAssessmentId', mdsAssessmentId);
    const endpoint = `/api/extension/icd10-annotations/v2/by-code/${encodeURIComponent(baseCode)}?${params}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/icd10-annotations/v2/by-code/:baseCode', response);
      throw new Error(response.error || 'Failed to fetch annotations for code');
    }

    const data = response.data || response;
    const annotations = data.annotations || [];
    this.detailCache.set(cacheKey, annotations);
    return annotations;
  },

  /**
   * Process v2 list response. Buckets are pre-grouped server-side; we just
   * normalize names so the existing sidebar component continues to work.
   * Output marker: `_v2: true` so downstream code can branch.
   */
  _processV2ListResponse(data) {
    const annotations = data.annotations || {};

    const normalizeRanked = (g) => ({
      // Preserve every server field; alias to the names existing code reads.
      ...g,
      groupCode: g.groupCode || g.group,
      groupName: g.groupName || g.displayName,
      // PDPM fields straight through (server-side truth).
      pdpmCategory: g.pdpmCategory || null,
      pdpmCategoryName: g.pdpmCategoryName || null,
      pdpmPoints: g.pdpmPoints,
      mdsItemCode: g.mdsItemCode || null,
      // v2 ranked groups intentionally have no annotations[]
      annotationCount: g.annotationCount ?? 0,
      documentCount: g.documentCount ?? 0,
    });

    const normalizeFlat = (g) => ({
      ...g,
      groupCode: g.groupCode || g.group,
      groupName: g.groupName || g.displayName,
      pdpmCategory: g.pdpmCategory || null,
      pdpmCategoryName: g.pdpmCategoryName || null,
      pdpmPoints: g.pdpmPoints,
      mdsItemCode: g.mdsItemCode || null,
      annotationCount: g.mentionCount ?? g.annotationCount ?? 0,
      mentionCount: g.mentionCount ?? g.annotationCount ?? 0,
    });

    const flatGroups = {
      nta: (annotations.nta || []).map(normalizeFlat),
      slp: (annotations.slp || []).map(normalizeFlat),
      other: (annotations.other || []).map(normalizeFlat),
      speculative: (annotations.speculative || []).map(normalizeFlat),
    };

    // One-time speculative-collision warning (cheap, won't spam): if a base code
    // appears in both `other` and `speculative`, log it so we can spot it later.
    try {
      const otherSet = new Set(flatGroups.other.map(g => g.groupCode));
      flatGroups.speculative.forEach(g => {
        if (otherSet.has(g.groupCode)) {
          console.warn('[ICD10] base code in both other and speculative:', g.groupCode);
        }
      });
    } catch (_) { /* never break the viewer for telemetry */ }

    return {
      _v2: true,
      topRanked: (annotations.topRanked || []).map(normalizeRanked),
      approved: (annotations.approved || []).map(normalizeRanked),
      flatAnnotations: [], // v2 ships no flat annotations on the list call
      flatGroups,
      counts: data.counts || {},
      admitDate: data.admitDate || null,
    };
  },

  /**
   * Adapt the v1 mock response into the v2 list shape so demos keep working
   * without re-recording fixtures. Strips heavy fields and groups flat
   * categories by base ICD-10 code.
   */
  _adaptV1MockToV2(v1) {
    const v1Annotations = v1?.annotations || {};

    const stripRanked = (g) => {
      // v2: server provides pdpmCategory directly. Mock fixtures are v1, so
      // synthesize from the first matching child annotation if absent.
      let pdpmCategory = g.pdpmCategory || null;
      if (!pdpmCategory) {
        const nta = (g.annotations || []).find(a => a.category === 'nta');
        const slp = (g.annotations || []).find(a => a.category === 'slp');
        if (nta) pdpmCategory = 'NTA';
        else if (slp) pdpmCategory = 'SLP';
      }
      return {
        group: g.groupCode || g.group || g.groupId,
        displayName: g.groupName || g.displayName || '',
        rank: g.rank,
        rationale: g.rationale || '',
        confidence: g.confidence ?? 0,
        evidenceStrength: g.evidenceStrength || null,
        pdpmCategory,
        pdpmCategoryName: g.pdpmCategoryName || null,
        pdpmPoints: g.pdpmPoints,
        mdsItemCode: g.mdsItemCode || null,
        annotationCount: g.annotationCount ?? g.annotations?.length ?? 0,
        documentCount: g.documentCount ?? 0,
        latestDocumentDate: g.latestDocumentDate,
      };
    };

    const groupFlat = (arr, defaultCategory) => {
      const map = new Map();
      (arr || []).forEach(ann => {
        const base = (ann.icd10Code || '').substring(0, 3);
        if (!base) return;
        if (!map.has(base)) {
          map.set(base, {
            group: base,
            displayName: ann.description || base,
            mentionCount: 0,
            pdpmCategory: ann.pdpmCategory || defaultCategory || null,
            pdpmCategoryName: ann.pdpmCategoryName || null,
            pdpmPoints: ann.pdpmPoints,
            mdsItemCode: ann.mdsItemCode || null,
          });
        }
        map.get(base).mentionCount += 1;
      });
      return Array.from(map.values());
    };

    return {
      success: true,
      version: 'v2',
      admitDate: v1?.admitDate || null,
      annotations: {
        topRanked: (v1Annotations.topRanked || []).map(stripRanked),
        approved: (v1Annotations.approved || []).map(stripRanked),
        nta: groupFlat(v1Annotations.nta, 'NTA'),
        slp: groupFlat(v1Annotations.slp, 'SLP'),
        other: groupFlat(v1Annotations.other, null),
        speculative: groupFlat(v1Annotations.speculative, null),
        existingDiagnosisBaseCodes: [],
      },
      counts: v1?.counts || {},
    };
  },

  /**
   * Pull mock annotations matching a base code, mimicking the v2 detail call.
   */
  _extractMockAnnotationsByBaseCode(baseCode) {
    const all = this._getAllMockAnnotations();
    return all.filter(a => (a.icd10Code || '').startsWith(baseCode));
  },

  /**
   * Process the API annotation response into the shape the viewer expects
   * @param {Object} data - Raw API response
   * @returns {Object} - { topRanked, approved, flatAnnotations, counts }
   */
  _processAnnotationResponse(data) {
    const annotations = data.annotations || {};
    const rawTopRanked = annotations.topRanked || [];
    const rawApproved = annotations.approved || [];

    // Normalize group field names: API uses group/displayName, sidebar expects groupCode/groupName
    const normalizeGroup = (g) => ({
      ...g,
      groupId: g.groupId || g.group || g.id,
      groupCode: g.groupCode || g.group,
      groupName: g.groupName || g.displayName,
      annotationCount: g.annotationCount ?? g.annotations?.length ?? 0,
      documentCount: g.documentCount ?? 0,
    });

    const topRanked = rawTopRanked.map(normalizeGroup);
    const approved = rawApproved.map(normalizeGroup);

    // Build flat annotations from nta, slp, other, speculative categories
    const flatAnnotations = [];

    if (annotations.nta) {
      annotations.nta.forEach(ann => flatAnnotations.push({ ...ann, category: ann.category || 'nta' }));
    }
    if (annotations.slp) {
      annotations.slp.forEach(ann => flatAnnotations.push({ ...ann, category: ann.category || 'slp' }));
    }
    if (annotations.other) {
      annotations.other.forEach(ann => flatAnnotations.push({ ...ann, category: ann.category || 'other' }));
    }
    if (annotations.speculative) {
      annotations.speculative.forEach(ann => flatAnnotations.push({ ...ann, category: ann.category || 'speculative' }));
    }

    return {
      topRanked,
      approved,
      flatAnnotations,
      counts: data.counts || {},
      admitDate: data.admitDate || null
    };
  },

  /**
   * Get approved diagnoses for a patient (already coded in PCC)
   * @param {string} patientId - Patient ID
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Array>} - Array of diagnosis objects
   */
  async getApprovedDiagnoses(patientId, facilityName, orgSlug) {
    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay();
      return ICD10MockData.approvedDiagnoses;
    }

    const endpoint = `/api/extension/patients/${encodeURIComponent(patientId)}/diagnoses?` +
      `facilityName=${encodeURIComponent(facilityName)}` +
      `&orgSlug=${encodeURIComponent(orgSlug)}` +
      // Backend ships exactEvidences/siblingEvidences per diagnosis when this
      // flag is set. Older deployments will silently ignore it and return
      // bare Diagnosis[] — frontend tolerates the absence.
      `&withEvidences=1`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/patients/:id/diagnoses', response);
      throw new Error(response.error || 'Failed to fetch diagnoses');
    }

    const data = response.data || response;
    return data.diagnoses || [];
  },

  /**
   * Get document with presigned URL
   * @param {string} documentId - Document ID
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @param {boolean} forceRefresh - Force refresh even if cached
   * @returns {Promise<Object>} - Document object with signedUrl
   */
  async getDocument(documentId, facilityName, orgSlug, forceRefresh = false) {
    // Check URL cache first
    if (!forceRefresh) {
      const cached = this.urlCache.get(documentId);
      if (cached && this._isUrlValid(cached)) {
        return cached;
      }
    }

    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay();
      const doc = ICD10MockData.documents[documentId];
      if (!doc) {
        throw new Error('Document not found');
      }
      // Refresh the expiry time
      doc.expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      this.urlCache.set(documentId, doc);
      return doc;
    }

    const endpoint = `/api/extension/documents/${encodeURIComponent(documentId)}?` +
      `facilityName=${encodeURIComponent(facilityName)}` +
      `&orgSlug=${encodeURIComponent(orgSlug)}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/documents/:id', response);
      throw new Error(response.error || 'Failed to fetch document');
    }

    // API may return document in various structures
    const data = response.data || response;
    const doc = data.document || data;

    // Ensure we have a signedUrl
    if (!doc.signedUrl && !doc.url && !doc.presignedUrl) {
      throw new Error('Document response missing URL');
    }

    // Normalize the URL field
    if (!doc.signedUrl) {
      doc.signedUrl = doc.url || doc.presignedUrl;
    }

    this.urlCache.set(documentId, doc);
    return doc;
  },

  /**
   * Get word blocks for a document (for PDF highlighting)
   * @param {string} documentId - Document ID
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Array>} - Array of word block objects
   */
  async getWordBlocks(documentId, facilityName, orgSlug) {
    // Check cache first (word blocks don't change)
    if (this.wordBlocksCache.has(documentId)) {
      return this.wordBlocksCache.get(documentId);
    }

    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay(100);
      // Search through topRanked groups and flat categories for matching annotations
      const allAnnotations = this._getAllMockAnnotations();
      const annotation = allAnnotations.find(a => a.documentId === documentId);
      const wordBlocks = annotation?.wordBlocks || [];
      this.wordBlocksCache.set(documentId, wordBlocks);
      return wordBlocks;
    }

    const endpoint = `/api/extension/documents/${encodeURIComponent(documentId)}/word-blocks?` +
      `facilityName=${encodeURIComponent(facilityName)}` +
      `&orgSlug=${encodeURIComponent(orgSlug)}`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/documents/:id/word-blocks', response);
      throw new Error(response.error || 'Failed to fetch word blocks');
    }

    const wordBlocks = response.data.wordBlocks || [];
    this.wordBlocksCache.set(documentId, wordBlocks);
    return wordBlocks;
  },

  /**
   * Get all annotations from mock data (searches topRanked groups + flat categories)
   * @returns {Array}
   */
  _getAllMockAnnotations() {
    const annotations = ICD10MockData.apiResponse?.annotations || {};
    const all = [];

    // Collect from topRanked groups
    if (annotations.topRanked) {
      annotations.topRanked.forEach(group => {
        if (group.annotations) {
          all.push(...group.annotations);
        }
      });
    }

    // Collect from flat categories
    ['nta', 'slp', 'other', 'speculative'].forEach(cat => {
      if (annotations[cat]) {
        all.push(...annotations[cat]);
      }
    });

    return all;
  },

  /**
   * Approve a diagnosis (add to PCC chart)
   * @param {string} patientId - Patient ID
   * @param {Object} annotation - The annotation to approve
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Object>} - Result of approval
   */
  async approveDiagnosis(patientId, annotation, facilityName, orgSlug) {
    // Use mock behavior in development
    if (this._useMockData()) {
      await this._simulateDelay(800);
      return { success: true, message: 'Diagnosis approved (mock)' };
    }

    const endpoint = `/api/extension/patients/${encodeURIComponent(patientId)}/diagnoses`;

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify({
          icd10Code: annotation.icd10Code,
          description: annotation.description,
          annotationId: annotation.id,
          facilityName,
          orgSlug
        })
      }
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/patients/:id/diagnoses', response);
      throw new Error(response.error || 'Failed to approve diagnosis');
    }

    return response.data;
  },

  /**
   * Dismiss a group for the patient's current admission. Server scopes the
   * record to (patientId, groupKey, admissionDate); calling twice is a no-op.
   * @returns {Promise<Object>} server response { success, dismissal }
   */
  async dismissGroup({ patientId, facilityName, orgSlug, groupKey, reason }) {
    if (this._useMockData()) {
      await this._simulateDelay(150);
      return { success: true, dismissal: { groupKey, mock: true } };
    }
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: '/api/extension/icd10-annotations/dismiss',
      options: {
        method: 'POST',
        body: JSON.stringify({ patientId, facilityName, orgSlug, groupKey, reason: reason || null }),
      },
    });
    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/icd10-annotations/dismiss', response);
      const err = new Error(response.error || 'Failed to dismiss code');
      err.status = response.status || null;
      err.serverMessage = response.error || null;
      throw err;
    }
    return response.data || response;
  },

  /**
   * Undismiss a previously-dismissed group (current-admission scope).
   */
  async undismissGroup({ patientId, facilityName, orgSlug, groupKey }) {
    if (this._useMockData()) {
      await this._simulateDelay(150);
      return { success: true };
    }
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: '/api/extension/icd10-annotations/undismiss',
      options: {
        method: 'POST',
        body: JSON.stringify({ patientId, facilityName, orgSlug, groupKey }),
      },
    });
    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/icd10-annotations/undismiss', response);
      const err = new Error(response.error || 'Failed to undismiss code');
      err.status = response.status || null;
      err.serverMessage = response.error || null;
      throw err;
    }
    return response.data || response;
  },

  /**
   * Check if a cached URL is still valid (has at least 2 minutes remaining)
   * @param {Object} doc - Document object with expiresAt
   * @returns {boolean}
   */
  _isUrlValid(doc) {
    if (!doc || !doc.expiresAt) return false;
    const expiresAt = new Date(doc.expiresAt).getTime();
    const now = Date.now();
    return (expiresAt - now) > this.URL_REFRESH_THRESHOLD;
  },

  /**
   * Check if we should use mock data
   * @returns {boolean}
   */
  _useMockData() {
    // Use mock data if the mock data module is loaded and we're in development
    // or if there's a flag set
    return typeof ICD10MockData !== 'undefined' &&
           (window.location.hostname === 'localhost' ||
            window.location.protocol === 'file:' ||
            window.location.hostname.includes('netlify.app') ||
            window.ICD10_USE_MOCK_DATA === true ||
            window.__DEMO_MODE === true);
  },

  /**
   * Simulate API delay for mock data
   * @param {number} ms - Delay in milliseconds
   */
  async _simulateDelay(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Get evidence summary for a base code
   * @param {string} patientId - Patient ID
   * @param {string} baseCode - Base ICD-10 code
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @param {string} [mdsAssessmentId] - Optional MDS assessment ID
   * @returns {Promise<Object>} - { summary }
   */
  async getEvidenceSummary(patientId, baseCode, facilityName, orgSlug, mdsAssessmentId) {
    // Check cache first
    if (this.summaryCache.has(baseCode)) {
      return this.summaryCache.get(baseCode);
    }

    // Use mock data in development
    if (this._useMockData()) {
      await this._simulateDelay(600);
      const result = { summary: `Evidence for ${baseCode} includes multiple clinical documents supporting this diagnosis. Documentation strength is moderate with consistent findings across assessments.` };
      this.summaryCache.set(baseCode, result);
      return result;
    }

    const endpoint = `/api/extension/icd10-annotations/summary`;

    const body = {
      patientId,
      baseCode,
      facilityName,
      orgSlug
    };
    if (mdsAssessmentId) {
      body.mdsAssessmentId = mdsAssessmentId;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method: 'POST',
        body: JSON.stringify(body)
      }
    });

    if (!response.success) {
      _trackIcd10ApiFail('/api/extension/icd10-annotations/summary', response);
      throw new Error(response.error || 'Failed to fetch evidence summary');
    }

    const data = response.data || response;
    const result = { summary: data.summary || '' };
    this.summaryCache.set(baseCode, result);
    return result;
  },

  /**
   * Report batch diagnosis submissions to Super backend
   * @param {string} patientId - Patient ID
   * @param {Array} results - Array of { icd10Code, description, annotationId, success, error }
   * @param {string} effectiveDate - The effective date used
   * @param {string} facilityName - Facility name
   * @param {string} orgSlug - Organization slug
   * @returns {Promise<Object>}
   */
  async reportBatchDiagnoses(patientId, results, effectiveDate, facilityName, orgSlug) {
    if (this._useMockData()) {
      await this._simulateDelay(300);
      return { success: true };
    }

    const endpoint = `/api/extension/patients/${encodeURIComponent(patientId)}/diagnoses/batch-report`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint,
        options: {
          method: 'POST',
          body: JSON.stringify({
            diagnoses: results.map(r => ({
              icd10Code: r.icd10Code,
              description: r.description,
              annotationId: r.annotationId,
              pccSubmitted: r.success,
              pccError: r.error || null,
              effectiveDate
            })),
            facilityName,
            orgSlug
          })
        }
      });

      if (!response.success) {
        console.warn('ICD10API: Batch report failed:', response.error);
      }
      return response.data || {};
    } catch (e) {
      console.warn('ICD10API: Batch report error (non-blocking):', e);
      return {};
    }
  },

  /**
   * Clear all caches
   */
  clearCaches() {
    this.wordBlocksCache.clear();
    this.urlCache.clear();
    this.summaryCache.clear();
    this.detailCache.clear();
  }
};

// Expose globally
window.ICD10API = ICD10API;
