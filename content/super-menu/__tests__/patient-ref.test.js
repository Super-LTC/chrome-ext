// Tests for scrapePccPublicIdFromDOM() + resolveStablePatientRef() (client-id.js).
//
// pccPublicId (MRN) is the durable patient anchor that survives PCC's EID
// migration — it's printed in the resident header and page <title>. #966 accepts
// it as a SEPARATE param from externalPatientId, so resolveStablePatientRef()
// returns BOTH keys when both are scrapeable (backend prefers numeric, ignores
// the rest → free redundancy).

import { describe, it, expect, beforeEach } from 'vitest';
import { scrapePccPublicIdFromDOM, resolveStablePatientRef } from '../client-id.js';

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
