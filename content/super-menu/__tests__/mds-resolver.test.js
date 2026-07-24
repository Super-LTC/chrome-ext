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
  document.title = '';
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

describe('pccPublicId ride-along on the MDS context chokepoints', () => {
  const MRN = 'AC72452125';

  it('sends pccPublicId (from the title) on POST bodies — the durable anchor on flipped pages', () => {
    document.title = `Section N - Doe, Jane (${MRN})`;
    expect(window.getMDSContextBodyFields().pccPublicId).toBe(MRN);
  });

  it('sends pccPublicId on GET params', () => {
    document.title = `Section N - Doe, Jane (${MRN})`;
    const params = window.appendMDSContextParams(new URLSearchParams());
    expect(params.get('pccPublicId')).toBe(MRN);
  });

  it('rides along WITH the numeric external id when both are known (free redundancy)', () => {
    document.title = `Doe, Jane (${MRN})`;
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    const out = window.getMDSContextBodyFields();
    expect(out.externalPatientId).toBe(EXTERNAL_ID);
    expect(out.pccPublicId).toBe(MRN);
  });

  it('omits pccPublicId when no MRN is on the page', () => {
    document.title = 'PointClickCare';
    expect(window.getMDSContextBodyFields()).not.toHaveProperty('pccPublicId');
  });
});

describe('getMDSContext() scope detection on flipped pages', () => {
  afterEach(() => { window.history.replaceState({}, '', '/'); });

  it("reports scope 'mds' on a flipped section page even when no numeric id is recoverable", () => {
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qdFxemS33H7GHe3&sectioncode=N');
    const ctx = window.getMDSContext();
    expect(ctx.scope).toBe('mds');           // gate on raw URL presence, not the numeric
    expect(ctx.assessmentId).toBeNull();     // numeric not recoverable → null (never the EID)
  });

  it('recovers the numeric assessmentId from the DOM when present', () => {
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_x&sectioncode=N');
    document.body.innerHTML = `<a onclick="toggleToolsWindow(this, '3120458', 'N')">t</a>`;
    const ctx = window.getMDSContext();
    expect(ctx.scope).toBe('mds');
    expect(ctx.assessmentId).toBe('3120458');
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

  it('never sends the internal SuperOverlay.patientId as externalPatientId, and never forwards the EID', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID };
    const ctx = window.getChatContext();
    expect(ctx.externalPatientId).not.toBe(INTERNAL_ID);
    expect(ctx).not.toHaveProperty('externalPatientId'); // nothing resolvable → omit, don't leak internal id
    // The URL's ESOLassessid is an EID_ token with no numeric recoverable from
    // the DOM → omit externalAssessmentId entirely (never forward the EID).
    expect(ctx).not.toHaveProperty('externalAssessmentId');
  });

  it('sends the numeric external id when it is known', () => {
    window.SuperOverlay = { patientId: INTERNAL_ID, externalPatientId: EXTERNAL_ID };
    expect(window.getChatContext().externalPatientId).toBe(EXTERNAL_ID);
  });

  it('recovers and sends the numeric externalAssessmentId from the DOM on a flipped page', () => {
    document.body.innerHTML = `<a onclick="toggleToolsWindow(this, '3120458', 'N')">t</a>`;
    const ctx = window.getChatContext();
    expect(ctx.externalAssessmentId).toBe('3120458');
  });

  it('sends pccPublicId (MRN) as the durable patient anchor on a flipped page', () => {
    document.title = 'Section I - Doe, Jane (AC72452125)';
    expect(window.getChatContext().pccPublicId).toBe('AC72452125');
  });
});
