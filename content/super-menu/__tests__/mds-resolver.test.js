// Regression tests for the MDS-resolver externalPatientId (context.js).
//
// Bug (handoff 2026-07-23): MDS section/overlay/i8000 calls resolved
// `externalPatientId` through getMDSResolverPatientId(), which fell back to
// SuperOverlay.patientId — our INTERNAL SuperLTC id — before the DOM scrape.
// The backend rejects the internal id as an externalPatientId, so the overlay
// showed "not synced" (ASSESSMENT_NOT_FOUND) on any section whose request
// carried the internal id (i8000) or none at all.
//
// The fix: never emit the internal id as externalPatientId. Resolve the numeric
// PCC id from the current page (URL/DOM), falling back only to the numeric
// EXTERNAL id captured from a prior section response (SuperOverlay.externalPatientId).
//
// context.js is a global-style module (attaches helpers to window and calls
// chrome.runtime at import), so we stub chrome, import once for side effects,
// then drive the real public helpers the section fetches use.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const INTERNAL_ID = '0gr4ld5af2z4'; // shape of assessment.patientId (SuperLTC internal)
const EXTERNAL_ID = '3041789';      // shape of assessment.externalPatientId (PCC numeric)
const PAGE_ID = '2745953';          // numeric ESOLclientid scraped from the live page

beforeAll(async () => {
  globalThis.chrome = { runtime: { onMessage: { addListener() {} } } };
  await import('../context.js'); // side effects: window.getMDSContextBodyFields, appendMDSContextParams, ...
});

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.SuperOverlay;
});

describe('getMDSContextBodyFields() externalPatientId (POST bodies)', () => {
  it('omits externalPatientId rather than sending the internal SuperOverlay.patientId', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID }; // internal id cached, nothing else
    expect(window.getMDSContextBodyFields()).not.toHaveProperty('externalPatientId');
  });

  it('sends the numeric external id cached from a prior section response when the page has no client id', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    expect(window.getMDSContextBodyFields().externalPatientId).toBe(EXTERNAL_ID);
  });

  it("prefers the current page's numeric client id over the cached external id (never sends a stale/other patient)", () => {
    document.body.innerHTML = `<input name="ESOLclientid" value="${PAGE_ID}">`;
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    expect(window.getMDSContextBodyFields().externalPatientId).toBe(PAGE_ID);
  });
});

describe('appendMDSContextParams() externalPatientId (GET section/i8000/evidence params)', () => {
  it('sets externalPatientId to the cached numeric external id, not the internal id', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    const params = window.appendMDSContextParams(new URLSearchParams());
    expect(params.get('externalPatientId')).toBe(EXTERNAL_ID);
  });

  it('omits externalPatientId entirely when only the internal id is known', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID };
    const params = window.appendMDSContextParams(new URLSearchParams());
    expect(params.has('externalPatientId')).toBe(false);
  });
});

describe('getChatContext() externalPatientId on MDS pages', () => {
  beforeEach(() => {
    // MDS section page: ESOLassessid present, no ESOLclientid in the URL.
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qdFxemS33H7GHe3&sectioncode=I');
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('never sends the internal SuperOverlay.patientId as externalPatientId', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID };
    const ctx = window.getChatContext();
    expect(ctx.externalPatientId).not.toBe(INTERNAL_ID);
    expect(ctx).not.toHaveProperty('externalPatientId'); // nothing resolvable → omit, don't leak internal id
    expect(ctx.externalAssessmentId).toBe('EID_0qdFxemS33H7GHe3');
  });

  it('sends the numeric external id when it is known', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    expect(window.getChatContext().externalPatientId).toBe(EXTERNAL_ID);
  });
});
