/**
 * API client for Super Verify. Goes through the existing background
 * `API_REQUEST` relay (same Bearer token as every /api/extension/* call).
 *
 * Relay contract (background/background.js):
 *   success → { success: true,  data }
 *   failure → { success: false, error, status, body }   (body may carry `code`)
 */

/** Base for all verify-side failures; carries the HTTP status + parsed body. */
export class VerifyError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'VerifyError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** 404 PATIENT_NOT_FOUND — resident hasn't synced to Super yet. */
export class PatientNotSyncedError extends VerifyError {
  constructor(opts) {
    super("This resident hasn't synced to Super yet.", opts);
    this.name = 'PatientNotSyncedError';
  }
}

/** 400 — the scraped blob was empty/invalid (wrong DOM). Don't retry blindly. */
export class BadScrapeError extends VerifyError {
  constructor(opts) {
    super('Could not read the MDS answers on this page.', opts);
    this.name = 'BadScrapeError';
  }
}

/** 403 — user lacks access to this facility, or the org lacks the module. */
export class AccessError extends VerifyError {
  constructor(message, opts) {
    super(message || 'Access denied.', opts);
    this.name = 'AccessError';
  }
}

function relay(endpoint, body) {
  return chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: { method: 'POST', body: JSON.stringify(body) },
  });
}

function toError(result) {
  const status = result?.status;
  const body = result?.body || {};
  const code = body.code;
  const message = result?.error || body.error || `Request failed (${status || 'unknown'})`;
  const opts = { status, code, body };

  if (status === 404 && code === 'PATIENT_NOT_FOUND') return new PatientNotSyncedError(opts);
  if (status === 400) return new BadScrapeError(opts);
  if (status === 403) return new AccessError(message, opts);
  return new VerifyError(message, opts);
}

/**
 * Scrape → verify. Builds the request body from the page globals
 * (`getCurrentParams`, `getPCCAssessmentMetaFromDOM` from super-menu/context.js)
 * and POSTs the answers blob.
 *
 * @param {object} args
 * @param {string} args.assessId     PCC assessment id (externalAssessmentId)
 * @param {string} args.patientId    PCC client id   (externalPatientId)
 * @param {object} args.answersBlob  { sectionStatuses, answers } from the scraper
 * @returns {Promise<object>} the full verify response (PDPM fields + `qm`)
 */
export async function postVerify({ assessId, patientId, answersBlob }) {
  const { facilityName, orgSlug } = window.getCurrentParams?.() || {};
  const { ardDate, assessmentType } = window.getPCCAssessmentMetaFromDOM?.() || {};

  const body = {
    orgSlug,
    facilityName,
    externalPatientId: String(patientId),
    externalAssessmentId: String(assessId),
  };
  // Always send ardDate when scrapeable — makes day-0 (not-yet-synced) work.
  if (ardDate) body.ardDate = ardDate;
  if (assessmentType) body.assessmentType = assessmentType;
  body.answers = answersBlob;

  const result = await relay('/api/extension/mds/verify', body);
  if (result?.success) return result.data;
  throw toError(result);
}

/**
 * Accept/dismiss a PDPM detection. Reuses the existing detection user-decision
 * endpoint (same body shape as mds-overlay.js `postItemDecision`). On success
 * it fires `super:item-decision` so the live PDPM analyzer stays in sync.
 *
 * @param {object} args
 * @param {string} args.mdsItem
 * @param {string} [args.mdsColumn]
 * @param {'agree'|'disagree'} args.decision
 * @param {string} [args.note]     required (non-empty) on dismiss
 * @param {string} args.assessId
 */
export async function postDetectionDecision({ mdsItem, mdsColumn, decision, note, assessId }) {
  const { facilityName, orgSlug } = window.getCurrentParams?.() || {};
  const body = {
    externalAssessmentId: String(assessId),
    facilityName,
    orgSlug,
    decision,
    note: note || '',
    mdsColumn: mdsColumn || '',
    ...(window.getMDSContextBodyFields?.() || {}),
  };

  const result = await relay(
    `/api/extension/mds/items/${encodeURIComponent(mdsItem)}/decision`,
    body,
  );
  if (!result?.success) throw toError(result);

  // Keep the existing MDS-overlay PDPM analyzer in sync with the new decision.
  window.dispatchEvent(
    new CustomEvent('super:item-decision', {
      detail: { mdsItem, column: mdsColumn || '', decision },
    }),
  );
  return result.data;
}
