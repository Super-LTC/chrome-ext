import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  currentFacilityName,
  isAlreadyAtFacility,
  switchToFacility,
  _test,
} from '../facility-switch.js';

const { normalizeFacilityLabel, facilityIdFromHref } = _test;

describe('normalizeFacilityLabel', () => {
  it('strips the id PCC appends to its own menu entries', () => {
    // The chooser renders "Autumnwood Care Center - 3". Comparing that against
    // our stored facility name without stripping it never matches, and the
    // switch silently falls through to the id fallback every time.
    expect(normalizeFacilityLabel('Autumnwood Care Center - 3')).toBe(
      'autumnwood care center'
    );
  });

  it('leaves a number that is part of the name alone', () => {
    expect(normalizeFacilityLabel('Building 4 Health - 12')).toBe('building 4 health');
  });

  it('collapses whitespace and case so a menu entry matches a stored name', () => {
    expect(normalizeFacilityLabel('  Oak   Ridge\nCenter ')).toBe('oak ridge center');
  });
});

describe('facilityIdFromHref', () => {
  it('reads the switchToFacilityView argument', () => {
    expect(facilityIdFromHref('javascript:switchToFacilityView(3)')).toBe('3');
  });

  it('tolerates quoting and whitespace', () => {
    expect(facilityIdFromHref("javascript:switchToFacilityView( '17' )")).toBe('17');
  });

  it('returns null for anything else, so non-facility links are skipped', () => {
    expect(facilityIdFromHref('javascript:void(0)')).toBeNull();
    expect(facilityIdFromHref('/tools/faclist.jsp')).toBeNull();
    expect(facilityIdFromHref(null)).toBeNull();
  });
});

describe('facility detection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers the title over the possibly-truncated link text', () => {
    document.body.innerHTML =
      '<a id="pccFacLink" title="Autumnwood Care Center">Autumnwood Ca…</a>';
    expect(currentFacilityName()).toBe('Autumnwood Care Center');
  });

  it('reports no facility rather than guessing when PCC chrome is absent', () => {
    expect(currentFacilityName()).toBeNull();
    expect(isAlreadyAtFacility('Autumnwood Care Center')).toBe(false);
  });
});

describe('switchToFacility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function mountChooser({ current, entries }) {
    document.body.innerHTML = `
      <a id="pccFacLink" title="${current}">${current}</a>
      <div id="pccFacMenu">
        ${entries
          .map(
            (e) =>
              `<a href="javascript:switchToFacilityView(${e.id})">${e.name} - ${e.id}</a>`
          )
          .join('')}
      </div>
    `;
  }

  it('does nothing when we are already in the building', async () => {
    mountChooser({ current: 'Autumnwood Care Center', entries: [] });
    const result = await switchToFacility({ pccFacilityName: 'Autumnwood Care Center' });
    expect(result).toEqual({ ok: true, switching: false });
  });

  it('clicks the entry whose NAME matches, not whose id matches', async () => {
    // `pcc_system_id` is unique per PCC tenant, not per organization, so two
    // customers can both have facility 3. Trusting our stored id over the name
    // in the menu PCC just rendered for this session is how you land a regional
    // in somebody else's building.
    mountChooser({
      current: 'Oak Ridge Center',
      entries: [
        { id: '3', name: 'Somebody Elses Place' },
        { id: '9', name: 'Autumnwood Care Center' },
      ],
    });
    const clicked = [];
    document.querySelectorAll('#pccFacMenu a').forEach((a) => {
      a.click = () => clicked.push(a.getAttribute('href'));
    });

    const result = await switchToFacility({
      pccFacilityName: 'Autumnwood Care Center',
      pccSystemId: '3',
    });

    expect(result.ok).toBe(true);
    expect(result.facilityId).toBe('9');
    expect(clicked).toEqual(['javascript:switchToFacilityView(9)']);
  });

  it('falls back to the stored id only when no name matches', async () => {
    mountChooser({
      current: 'Oak Ridge Center',
      entries: [{ id: '3', name: 'Autumnwood Care Ctr' }],
    });
    const clicked = [];
    document.querySelectorAll('#pccFacMenu a').forEach((a) => {
      a.click = () => clicked.push(a.getAttribute('href'));
    });

    const result = await switchToFacility({
      pccFacilityName: 'Autumnwood Care Center',
      pccSystemId: '3',
    });
    expect(result.ok).toBe(true);
    expect(clicked).toEqual(['javascript:switchToFacilityView(3)']);
  });

  it('reports a facility that is not in the chooser instead of clicking anything', async () => {
    // Access revoked in PCC but not in Super is a real state — say so rather
    // than navigating somewhere arbitrary.
    mountChooser({
      current: 'Oak Ridge Center',
      entries: [{ id: '5', name: 'Elsewhere' }],
    });
    const result = await switchToFacility({
      pccFacilityName: 'Autumnwood Care Center',
      pccSystemId: '3',
    });
    expect(result).toMatchObject({ ok: false, reason: 'facility_not_in_chooser' });
  });

  it('reports when PCC has no facility chooser at all', async () => {
    const result = await switchToFacility({ pccFacilityName: 'Autumnwood Care Center' });
    expect(result).toMatchObject({ ok: false, reason: 'no_facility_chooser' });
  });

  it('refuses to act without a target', async () => {
    const result = await switchToFacility({});
    expect(result).toMatchObject({ ok: false, reason: 'no_target' });
  });
});
