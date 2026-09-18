// Regression tests for getDiagnosisQueryPatientId() (context.js).
//
// Bug (prod, Sep 16-17 2026): "Send" on a diagnosis query from the MDS section
// page failed with the toast "Failed to send: Missing required fields:
// patientId, facilityName, orgSlug, mdsItem, mdsItemName". The backend logged
// `patientId: true` (missing) with every other field present — the extension
// POSTed an EMPTY patientId.
//
// Why: the send modal resolved the patient through SuperOverlay.patientId →
// MDSViewState → resolveStableClientId(). On a PCC MDS section page
// (section.xhtml) the client id is NEVER in the page URL, and
// resolveStableClientId() returns null the moment the URL has no ESOLclientid —
// it deliberately does not guess from the DOM (a resident LIST page would latch
// onto a random resident). So when the overlay had not cached the internal id,
// all three sources were empty.
//
// The numeric PCC client id WAS on the page the whole time: the same page's
// /api/extension/mds/items/* call carried externalPatientId, which
// getMDSResolverPatientId() recovers via scrapeNumericClientIdFromDOM(). The
// query path simply never looked there.
//
// The create endpoint accepts EITHER id (it tries our internal id first, then
// the PCC external id), so the DOM-scraped numeric id is a valid last resort.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const INTERNAL_ID = '0gr4ld5af2z4'; // assessment.patientId (SuperLTC internal)
const EXTERNAL_ID = '3041789';      // assessment.externalPatientId (PCC numeric)
const PAGE_ID = '7009142';          // numeric ESOLclientid recovered from the page (synthetic)

beforeAll(async () => {
  globalThis.chrome = { runtime: { onMessage: { addListener() {} } } };
  await import('../context.js'); // side effects: window.getDiagnosisQueryPatientId, ...
});

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
  delete window.SuperOverlay;
  delete window.MDSViewState;
  window.history.replaceState({}, '', '/');
});

describe('getDiagnosisQueryPatientId()', () => {
  it('recovers the numeric client id from the page on an MDS section page (no ESOLclientid in the URL)', () => {
    // section.xhtml: assessment id in the URL, client id only in the DOM.
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k');
    document.body.innerHTML = `<input name="ESOLclientid" value="${PAGE_ID}">`;

    expect(window.getDiagnosisQueryPatientId()).toBe(PAGE_ID);
  });

  it('prefers the internal id the overlay cached for the rendered assessment', () => {
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k');
    document.body.innerHTML = `<input name="ESOLclientid" value="${PAGE_ID}">`;
    window.SuperOverlay = { patientId: INTERNAL_ID };

    expect(window.getDiagnosisQueryPatientId()).toBe(INTERNAL_ID);
  });

  it('uses the numeric client id from the URL on a normal patient page', () => {
    window.history.replaceState({}, '', `/chart.xhtml?ESOLclientid=${PAGE_ID}`);

    expect(window.getDiagnosisQueryPatientId()).toBe(PAGE_ID);
  });

  it('falls back to the external id cached from a prior section response', () => {
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k');
    window.SuperOverlay = { externalPatientId: EXTERNAL_ID };

    expect(window.getDiagnosisQueryPatientId()).toBe(EXTERNAL_ID);
  });

  it('returns null when the page carries no patient anchor at all', () => {
    window.history.replaceState({}, '', '/mds3/section.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k');

    expect(window.getDiagnosisQueryPatientId()).toBeNull();
  });
});
