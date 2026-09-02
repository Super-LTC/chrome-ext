// Tests for scrapePccPublicIdFromDOM() + resolveStablePatientRef() (client-id.js).
//
// pccPublicId (MRN) is the durable patient anchor that survives PCC's EID
// migration — it's printed in the resident header and page <title>. #966 accepts
// it as a SEPARATE param from externalPatientId, so resolveStablePatientRef()
// returns BOTH keys when both are scrapeable (backend prefers numeric, ignores
// the rest → free redundancy).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  scrapePccPublicIdFromDOM,
  resolveStablePatientRef,
  scrapeClientIdFromResidentPhoto,
} from '../client-id.js';

const NUMERIC_CLIENT = '3078168';
const MRN = 'AC72452125';
const EID = 'EID_0qp9Dt46t1IKFj6k';

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
  window.history.replaceState({}, '', '/');
});

describe('scrapePccPublicIdFromDOM()', () => {
  it('reads the parenthetical MRN from the page title', () => {
    document.title = `Section N - Doe, Jane (${MRN}) - PointClickCare`;
    expect(scrapePccPublicIdFromDOM()).toBe(MRN);
  });

  it('reads the MRN from the resident header when the title lacks it', () => {
    document.title = 'PointClickCare';
    document.body.innerHTML = `<div class="residentName">Doe, Jane (${MRN})</div>`;
    expect(scrapePccPublicIdFromDOM()).toBe(MRN);
  });

  it('accepts a purely numeric MRN', () => {
    document.title = 'Sanders, Gordon (000953026)';
    expect(scrapePccPublicIdFromDOM()).toBe('000953026');
  });

  it('ignores all-caps decorations without a digit, e.g. (OBRA)', () => {
    document.title = `MDS (OBRA) - Doe, Jane (${MRN})`;
    expect(scrapePccPublicIdFromDOM()).toBe(MRN);
  });

  it('returns null when no parenthetical id is present', () => {
    document.title = 'PointClickCare Dashboard';
    expect(scrapePccPublicIdFromDOM()).toBeNull();
  });
});

describe('resolveStablePatientRef()', () => {
  it('returns BOTH externalPatientId and pccPublicId when both scrape', () => {
    // Mid-migration chart page: URL carries an EID, but the hidden input still
    // holds the numeric client id, which resolveStableClientId() recovers.
    window.history.replaceState({}, '', `/chart.xhtml?ESOLclientid=${EID}`);
    document.title = `Doe, Jane (${MRN})`;
    document.body.innerHTML = `<input name="ESOLclientid" value="${NUMERIC_CLIENT}">`;
    expect(resolveStablePatientRef()).toEqual({ externalPatientId: NUMERIC_CLIENT, pccPublicId: MRN });
  });

  it('returns pccPublicId only on a flipped MDS page (numeric client id gone)', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLclientid=${EID}`);
    document.title = `Doe, Jane (${MRN})`;
    expect(resolveStablePatientRef()).toEqual({ pccPublicId: MRN });
  });

  it('never puts the raw EID token in externalPatientId', () => {
    window.history.replaceState({}, '', `/chart.xhtml?ESOLclientid=${EID}`);
    document.title = `Doe, Jane (${MRN})`;
    const ref = resolveStablePatientRef();
    expect(ref.externalPatientId).toBeUndefined();
    expect(ref.pccPublicId).toBe(MRN);
  });

  it('returns externalPatientId only when the header/title has no MRN', () => {
    window.history.replaceState({}, '', `/chart.xhtml?ESOLclientid=${NUMERIC_CLIENT}`);
    document.title = 'PointClickCare';
    expect(resolveStablePatientRef()).toEqual({ externalPatientId: NUMERIC_CLIENT });
  });

  it('returns an empty object when nothing is resolvable', () => {
    window.history.replaceState({}, '', '/dashboard.xhtml');
    document.title = 'PointClickCare';
    expect(resolveStablePatientRef()).toEqual({});
  });
});

// PCC serves the resident-header photo as `<numeric client id>.jpg`. Verified
// against prod 2026-09-02: on MRN 11006's chart the header photo is
// `21068632.jpg`, and 21068632 is that patient's stored external_patient_id.
// This is the only stable id source on PCC chart pages that carry no
// ESOLclientid in the URL at all — the shape that broke Clinical Update.
const PHOTO_CLIENT = '21068632';
const NUMERIC_MRN = '11006';

const residentHeader = (photoSrc) => `
  <div class="rh-header">
    <img class="rh-photo-img" src="${photoSrc}" alt="resident photo">
    <div class="residentName" id="name">Henry, Avenella <span title="Client ID: ${NUMERIC_MRN}">(${NUMERIC_MRN})</span></div>
  </div>`;

describe('scrapeClientIdFromResidentPhoto()', () => {
  it('reads the client id out of the resident-header photo filename', () => {
    document.body.innerHTML = residentHeader(`/pcc/photo/${PHOTO_CLIENT}.jpg`);
    expect(scrapeClientIdFromResidentPhoto()).toBe(PHOTO_CLIENT);
  });

  it('handles an absolute URL with a query string', () => {
    document.body.innerHTML = residentHeader(
      `https://www19.pointclickcare.com/photos/${PHOTO_CLIENT}.jpg?v=3`
    );
    expect(scrapeClientIdFromResidentPhoto()).toBe(PHOTO_CLIENT);
  });

  it('ignores images outside the resident header', () => {
    document.body.innerHTML = `
      <div class="wound-gallery"><img src="/uploads/9988776655.jpg"></div>
      <div class="residentName" id="name">Henry, Avenella</div>`;
    expect(scrapeClientIdFromResidentPhoto()).toBeNull();
  });

  it('will not mistake a short filename for a client id (MRNs are 4-5 digits)', () => {
    document.body.innerHTML = residentHeader(`/pcc/photo/${NUMERIC_MRN}.jpg`);
    expect(scrapeClientIdFromResidentPhoto()).toBeNull();
  });

  it('returns null off a resident chart', () => {
    document.body.innerHTML = '<div class="resident-list"><img src="/img/123456.jpg"></div>';
    expect(scrapeClientIdFromResidentPhoto()).toBeNull();
  });
});

describe('resolveStablePatientRef() on a URL with NO ESOLclientid', () => {
  it('recovers the client id from the photo and still reports the MRN', () => {
    // The Ventura shape: no client id in the URL, PCC's header labels the MRN
    // "Client ID". Before the photo source this returned MRN-only, and the
    // Clinical Update wizard sent the MRN as a client id → 404 on every submit.
    window.history.replaceState({}, '', '/chart.xhtml');
    document.title = `Henry, Avenella (${NUMERIC_MRN})`;
    document.body.innerHTML = residentHeader(`/pcc/photo/${PHOTO_CLIENT}.jpg`);

    expect(resolveStablePatientRef()).toEqual({
      externalPatientId: PHOTO_CLIENT,
      pccPublicId: NUMERIC_MRN,
    });
  });

  it('falls back to the MRN alone when the chart has no photo', () => {
    window.history.replaceState({}, '', '/chart.xhtml');
    document.title = `Henry, Avenella (${NUMERIC_MRN})`;
    document.body.innerHTML = `<div class="residentName" id="name">Henry, Avenella</div>`;

    expect(resolveStablePatientRef()).toEqual({ pccPublicId: NUMERIC_MRN });
  });

  it('never latches onto a resident from a LIST page', () => {
    window.history.replaceState({}, '', '/residentlist.xhtml');
    document.title = 'Resident List';
    document.body.innerHTML = '<table><tr><td><img src="/pcc/photo/21068632.jpg"></td></tr></table>';

    expect(resolveStablePatientRef()).toEqual({});
  });
});
