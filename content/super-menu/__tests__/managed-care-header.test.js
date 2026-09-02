// getPatientFromHeader() — which patient anchors the Clinical Update button
// hands to the backend.
//
// Regression: PCC labels the FACILITY MRN "Client ID" in the resident header.
// The old implementation read that span and sent the number as the PCC client
// id. It is numeric, so it passed every shape check and then matched no patient
// — "Patient not found for the provided external id" on every submit (Lilac /
// Ventura, 2026-09-02). Prod check the same day: across 42,169 active residents,
// NO patient's MRN equals their PCC client id, so that read can never be a
// client id. The MRN must ride in its own field.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../modules/managed-care/recert-api.js', () => ({ RecertAPI: {} }));

const NUMERIC_CLIENT = '25451060';
const MRN = '11006';

let getPatientFromHeader;

beforeEach(async () => {
  document.body.innerHTML = '';
  document.title = '';
  window.history.replaceState({}, '', '/');
  // client-id.js installs the shared resolvers on window; the header module reads them.
  await import('../client-id.js');
  ({ getPatientFromHeader } = await import('../managed-care-header.js'));
});

describe('getPatientFromHeader()', () => {
  it('sends the MRN as pccPublicId — never as the client id', () => {
    // Flipped chart page: no ESOLclientid in the URL at all, and the resident
    // header prints the MRN with PCC's "Client ID" tooltip.
    window.history.replaceState({}, '', '/chart.xhtml');
    document.title = `Doe, Jane (${MRN}) - PointClickCare`;
    document.body.innerHTML =
      `<div class="residentName" id="name">Doe, Jane <span title="Client ID: ${MRN}">(${MRN})</span></div>`;

    const { externalPatientId, pccPublicId } = getPatientFromHeader();

    expect(pccPublicId).toBe(MRN);
    expect(externalPatientId).not.toBe(MRN);
  });

  it('sends the numeric client id when the page still exposes one', () => {
    window.history.replaceState({}, '', `/chart.xhtml?ESOLclientid=${NUMERIC_CLIENT}`);
    document.title = `Doe, Jane (${MRN})`;
    document.body.innerHTML =
      `<div class="residentName" id="name">Doe, Jane <span title="Client ID: ${MRN}">(${MRN})</span></div>`;

    expect(getPatientFromHeader()).toEqual({
      externalPatientId: NUMERIC_CLIENT,
      pccPublicId: MRN,
      patientName: 'Doe, Jane',
    });
  });

  it('still uses the header span when it is NOT the MRN restated', () => {
    // Preserved behavior: a facility whose header really does print the client id.
    window.history.replaceState({}, '', '/chart.xhtml');
    document.title = `Doe, Jane (${MRN})`;
    document.body.innerHTML =
      `<div class="residentName" id="name">Doe, Jane <span title="Client ID: ${NUMERIC_CLIENT}">(${MRN})</span></div>`;

    const { externalPatientId, pccPublicId } = getPatientFromHeader();

    expect(externalPatientId).toBe(NUMERIC_CLIENT);
    expect(pccPublicId).toBe(MRN);
  });

  it('reports no patient at all off a resident chart', () => {
    window.history.replaceState({}, '', '/dashboard.xhtml');
    document.title = 'PointClickCare';

    expect(getPatientFromHeader()).toEqual({
      externalPatientId: null,
      pccPublicId: null,
      patientName: null,
    });
  });
});
