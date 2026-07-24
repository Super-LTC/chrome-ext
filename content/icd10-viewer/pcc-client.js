/**
 * PCC Diagnosis Client
 * Handles direct same-origin requests to PointClickCare for adding diagnoses.
 * Runs in the content script context — fetch() includes session cookies automatically.
 */

// Verbose per-submit response dump (includes an 800-char HTML preview that can
// contain patient/diagnosis text). Default OFF so it never ships as noise/PHI;
// flip to true (or set window.__PCC_DIAG_DEBUG = true at runtime) to diagnose a
// "reported failure but PCC added it anyway" case. Real errors always surface
// via the concise console.warn below regardless of this flag.
const PCC_DIAG_DEBUG = false;

const PCCDiagnosisClient = {
  /**
   * Look up PCC internal diagnosis ID for an ICD-10 code
   * @param {string} icd10Code - e.g., "R52", "E11.9"
   * @returns {Promise<{diagnosisId: string, code: string, name: string}>}
   */
  async lookupCode(icd10Code) {
    if (this._useMockData()) {
      await this._simulateDelay(200);
      // Return a fake ID for mock mode
      return { diagnosisId: '999' + Math.floor(Math.random() * 1000), code: icd10Code, name: icd10Code + ' (mock)' };
    }

    const url = `/care/chart/cp/icd_find.jsp?` +
      `ESOLrow=1` +
      `&ESOLfindby=icd9_code` +
      `&ESOLview=All+Diagnosis` +
      `&ESOLdiaglib=4004` +
      `&substring=` +
      `&substring1=${encodeURIComponent(icd10Code)}` +
      `&substring2=` +
      `&ESOLincludeInactiveDiagnosisHid=N`;

    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'text/html' }
    });

    if (!response.ok) {
      throw new Error(`PCC ICD search failed: ${response.status}`);
    }

    // Detect login redirect (session expired)
    if (response.redirected && response.url.includes('login')) {
      throw new Error('SESSION_EXPIRED');
    }

    const html = await response.text();
    console.log('[PCCClient] lookupCode response URL:', response.url);
    console.log('[PCCClient] lookupCode response length:', html.length);
    console.log('[PCCClient] lookupCode response preview:', html.substring(0, 500));

    // Detect login page in response body
    if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
      throw new Error('SESSION_EXPIRED');
    }

    // Parse returnSelection("id", "code", "name", ...) from the HTML
    // PCC may use single or double quotes depending on version
    const results = [];
    const regex = /returnSelection\(["'](\d+)["'],\s*["']([^"']+)["'],\s*["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        diagnosisId: match[1],
        code: match[2],
        name: match[3]
      });
    }

    if (results.length === 0) {
      throw new Error(`Code "${icd10Code}" not found in PCC library`);
    }

    // Find exact match on code (case-insensitive)
    const exactMatch = results.find(r => r.code.toUpperCase() === icd10Code.toUpperCase());
    return exactMatch || results[0];
  },

  /**
   * Fetch rank options from PCC's new diagnosis form
   * @param {string} clientId - ESOLclientid
   * @returns {Promise<Array<{value: string, label: string}>>}
   */
  async fetchRankOptions(clientId) {
    if (this._useMockData()) {
      await this._simulateDelay(100);
      return [
        { value: '-1', label: '' },
        { value: '11900', label: 'Diagnosis Rank Insignificant' },
        { value: '10370', label: 'Admitting/Primary/Principal' },
        { value: '11720', label: 'Other Diagnosis' },
        { value: '11730', label: 'Diagnosis B' }
      ];
    }

    const url = `/care/chart/cp/clientdiag.jsp?ESOLclientid=${encodeURIComponent(clientId)}&hasLocation=false`;

    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'text/html' }
    });

    if (!response.ok) {
      throw new Error(`PCC rank options fetch failed: ${response.status}`);
    }

    const html = await response.text();

    if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
      throw new Error('SESSION_EXPIRED');
    }

    // Parse select[name="rank_id"] options from the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const select = doc.querySelector('select[name="rank_id"]');

    if (!select) {
      console.warn('PCCDiagnosisClient: rank_id dropdown not found');
      return [];
    }

    const options = [];
    select.querySelectorAll('option').forEach(opt => {
      options.push({
        value: opt.value,
        label: opt.textContent.trim()
      });
    });

    return options;
  },

  /**
   * Auto-select best rank from available options using keyword matching
   * Priority: "Other" > "Insignificant" > first non-empty option
   * @param {Array<{value: string, label: string}>} options
   * @returns {string} - Selected rank value
   */
  autoSelectRank(options) {
    if (!options || options.length === 0) return '-1';

    // Priority 1: Label containing "Other" (case-insensitive)
    const otherMatch = options.find(o =>
      o.label.toLowerCase().includes('other') && o.value !== '-1'
    );
    if (otherMatch) return otherMatch.value;

    // Priority 2: Label containing "Insignificant"
    const insignificantMatch = options.find(o =>
      o.label.toLowerCase().includes('insignificant') && o.value !== '-1'
    );
    if (insignificantMatch) return insignificantMatch.value;

    // Fallback: first non-empty option
    const firstNonEmpty = options.find(o => o.value !== '-1' && o.label.trim() !== '');
    return firstNonEmpty ? firstNonEmpty.value : '-1';
  },

  /**
   * Submit a single diagnosis to PCC
   * @param {Object} params
   * @param {string} params.clientId - ESOLclientid
   * @param {string} params.diagnosisId - PCC internal diagnosis ID (from lookupCode)
   * @param {string} params.icd10Code - ICD-10 code string
   * @param {string} params.description - Code description
   * @param {string} params.onsetDate - Effective date in MM/DD/YYYY format
   * @param {string} params.rankId - Rank dropdown value
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async submitDiagnosis({ clientId, diagnosisId, icd10Code, description, onsetDate, rankId }) {
    if (this._useMockData()) {
      await this._simulateDelay(500);
      return { success: true };
    }

    const formData = new URLSearchParams();
    formData.set('ESOLclientid', clientId);
    formData.set('ESOLsaveflag', 'SN');
    formData.set('ESOLrefresh', 'N');
    formData.set('ESOLcdid', '-1');
    formData.set('diagnosis_id', diagnosisId);
    formData.set('converted_from_id', '');
    formData.set('ESOLfrompo', 'N');
    formData.set('viewOnly', 'N');
    formData.set('fromDash', 'N');
    formData.set('ESOLeffectiveDate', '1900-01-01');
    formData.set('ESOLineffectiveDate', '');
    formData.set('ESOLconvert', 'N');
    formData.set('classDescription', '');
    formData.set('rankDescription', '');
    formData.set('PATHWAYCREATED', '');
    formData.set('ESOLisValidPrimaryDiag', '0');
    formData.set('ESOLselectedLib', '4004');
    formData.set('ESOLdiagPrincipalId', '-1');
    formData.set('icd9_code', icd10Code);
    formData.set('icd9_long_desc', description);
    formData.set('onset_date', onsetDate);
    formData.set('onset_date_dummy', onsetDate);
    formData.set('resolved_date', '');
    formData.set('resolved_date_dummy', '');
    formData.set('rank_id', rankId || '-1');
    formData.set('diagnosis_classification_id', '-1');
    formData.set('comments', '');

    try {
      const response = await fetch('/care/chart/cp/clientdiag.jsp', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });

      if (!response.ok) {
        return { success: false, error: `PCC returned status ${response.status}` };
      }

      const html = await response.text();

      if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
        return { success: false, error: 'SESSION_EXPIRED' };
      }

      // Parse the response and read the ACTUAL text of any `.errormsg` element.
      // PCC ships an EMPTY `<div class="errormsg"></div>` container on SUCCESS,
      // and its pages contain stray "Error:" substrings (JS handlers, templates).
      // The old check (`includes('class="errormsg"') || includes('Error:')`)
      // matched both of those on a successful add, so PCC-accepted diagnoses were
      // reported as "PCC returned an error" (the generic branch fired because the
      // container had no text to extract). We now fail ONLY when an errormsg
      // element actually contains text.
      let errText = '';
      let errormsgCount = 0;
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const errEls = [...doc.querySelectorAll('.errormsg')];
        errormsgCount = errEls.length;
        errText = errEls.map((el) => el.textContent.trim()).filter(Boolean).join('; ');
      } catch (_) {
        // DOMParser failed — fall back to a text-only extraction.
        const m = html.match(/class="errormsg"[^>]*>([\s\S]*?)<\//i);
        errText = m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
      }

      // Verbose diagnostics — gated so it never ships as noise/PHI. Enable via
      // PCC_DIAG_DEBUG or window.__PCC_DIAG_DEBUG to inspect the raw PCC response.
      if (PCC_DIAG_DEBUG || (typeof window !== 'undefined' && window.__PCC_DIAG_DEBUG)) {
        const errorColonIdx = html.indexOf('Error:');
        console.log('[PCCClient] submitDiagnosis response', {
          icd10Code,
          rankId: rankId || '-1',
          status: response.status,
          redirected: response.redirected,
          url: response.url,
          length: html.length,
          errormsgCount,
          errText: errText || '(none / empty container)',
          hasErrorColon: errorColonIdx !== -1,
          errorColonContext: errorColonIdx !== -1
            ? html.slice(Math.max(0, errorColonIdx - 80), errorColonIdx + 120)
            : null,
          preview: html.slice(0, 800),
        });
      }

      if (errText) {
        // Concise, PHI-free signal that always surfaces a genuine PCC rejection.
        console.warn('[PCCClient] submitDiagnosis rejected by PCC:', icd10Code, '—', errText);
        return { success: false, error: errText };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Submit a batch of staged codes to PCC in parallel
   * @param {Array} stagedCodes - Array of { icd10Code, description, annotationId, category }
   * @param {string} clientId - ESOLclientid
   * @param {string} onsetDate - Effective date in MM/DD/YYYY format
   * @param {string} rankId - Rank value for all codes
   * @param {Function} [onProgress] - Callback with (completedCount, total) for progress updates
   * @returns {Promise<Array<{icd10Code: string, description: string, annotationId: string, success: boolean, error?: string}>>}
   */
  async submitBatch(stagedCodes, clientId, onsetDate, rankId, onProgress) {
    let completed = 0;

    const promises = stagedCodes.map(async (code) => {
      try {
        // Step 1: Look up the PCC internal ID
        const lookup = await this.lookupCode(code.icd10Code);

        // Step 2: Submit to PCC
        const result = await this.submitDiagnosis({
          clientId,
          diagnosisId: lookup.diagnosisId,
          icd10Code: code.icd10Code,
          description: code.description,
          onsetDate,
          rankId
        });

        completed++;
        if (onProgress) onProgress(completed, stagedCodes.length);

        return {
          icd10Code: code.icd10Code,
          description: code.description,
          annotationId: code.annotationId,
          success: result.success,
          error: result.error || null
        };
      } catch (err) {
        completed++;
        if (onProgress) onProgress(completed, stagedCodes.length);

        return {
          icd10Code: code.icd10Code,
          description: code.description,
          annotationId: code.annotationId,
          success: false,
          error: err.message
        };
      }
    });

    return Promise.all(promises);
  },

  /**
   * Check if we should use mock data
   * @returns {boolean}
   */
  _useMockData() {
    return typeof ICD10MockData !== 'undefined' &&
           (window.location.hostname === 'localhost' ||
            window.location.protocol === 'file:' ||
            window.location.hostname.includes('netlify.app') ||
            window.ICD10_USE_MOCK_DATA === true ||
            window.__DEMO_MODE === true);
  },

  /**
   * Simulate delay
   * @param {number} ms
   */
  async _simulateDelay(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Expose globally
window.PCCDiagnosisClient = PCCDiagnosisClient;
