import { describe, it, expect } from 'vitest';
import { matchCurrentBuilding, pinCurrentFirst, sameFacilityName } from '../region-pin.js';

const fac = (locationId, name, state, pccFacilityName) => ({
  locationId, name, state, pccFacilityName: pccFacilityName ?? name,
});

describe('matchCurrentBuilding', () => {
  const facilities = [
    fac('loc1', 'Regents Park Winter Park', 'FL'),
    fac('loc2', 'Regents Park Boca Raton', 'FL'),
    fac('loc3', 'Lilac Health Center', 'GA'),
  ];

  // The two names are genuinely different columns — 20 of 432 prod locations
  // disagree. We compare against PCC's name because that is what we scraped off
  // the page; comparing against the display name misses exactly those 20.
  it('matches on pccFacilityName, not the display name', () => {
    const riverside = [fac('loc9', 'Riverside Premier', 'NJ',
      'The Riverside Premier Rehabilitation & Healing Center')];
    expect(matchCurrentBuilding(riverside, 'The Riverside Premier Rehabilitation & Healing Center'))
      .toBe('loc9');
    // The short display name is NOT what PCC shows, so it must not match.
    expect(matchCurrentBuilding(riverside, 'Riverside Premier')).toBeNull();
  });

  it('falls back to the display name when pccFacilityName is absent', () => {
    // The column is nullable, so the field is typed nullable even though prod
    // has it set on 432/432. A null must degrade, not throw.
    const legacy = [{ locationId: 'loc8', name: 'Old Home', state: 'FL', pccFacilityName: null }];
    expect(matchCurrentBuilding(legacy, 'Old Home')).toBe('loc8');
  });

  it('matches an exact name', () => {
    expect(matchCurrentBuilding(facilities, 'Lilac Health Center')).toBe('loc3');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(matchCurrentBuilding(facilities, '  lilac health center ')).toBe('loc3');
  });

  // PCC appends a building/unit number to the facility name on some pages; the
  // backend's own resolver tolerates it, so the chip has to as well or it
  // silently stops appearing on exactly those pages.
  it("tolerates PCC's trailing building/unit suffix", () => {
    expect(matchCurrentBuilding(facilities, 'Lilac Health Center - 11')).toBe('loc3');
    expect(matchCurrentBuilding(facilities, 'Lilac Health Center – 2')).toBe('loc3');
  });

  // Some buildings genuinely END in an index — "Autumnwood Care Center - 3",
  // "Newark Nursing & Rehab - 7" are their real PCC names. Stripping the suffix
  // before trying an exact match would collapse two distinct buildings onto one
  // string and yield "ambiguous → no match" for both.
  it('prefers an exact match over the suffix-tolerant one', () => {
    const indexed = [
      fac('a3', 'Autumnwood Care Center', 'MI', 'Autumnwood Care Center - 3'),
      fac('a7', 'Autumnwood Care Center', 'MI', 'Autumnwood Care Center - 7'),
    ];
    expect(matchCurrentBuilding(indexed, 'Autumnwood Care Center - 3')).toBe('a3');
    expect(matchCurrentBuilding(indexed, 'Autumnwood Care Center - 7')).toBe('a7');
    // Bare stem is genuinely ambiguous across the two — no chip.
    expect(matchCurrentBuilding(indexed, 'Autumnwood Care Center')).toBeNull();
  });

  it('still strips the suffix when no exact match exists', () => {
    const one = [fac('b1', 'Bayview', 'FL', 'Bayview Health')];
    expect(matchCurrentBuilding(one, 'Bayview Health - 4')).toBe('b1');
  });

  it('returns null when nothing matches rather than guessing', () => {
    // The whole reason the landing is a grid and not an auto-drop: a wrong
    // match is worse than no match, so an unrecognised name must yield nothing.
    expect(matchCurrentBuilding(facilities, 'Some Other Home')).toBeNull();
    expect(matchCurrentBuilding(facilities, '')).toBeNull();
    expect(matchCurrentBuilding(facilities, null)).toBeNull();
  });

  it('refuses an ambiguous prefix match', () => {
    // "Regents Park" prefixes two buildings. Picking either is a coin flip
    // presented as a fact.
    expect(matchCurrentBuilding(facilities, 'Regents Park')).toBeNull();
  });

  it('does not match a name that merely contains a facility name', () => {
    expect(matchCurrentBuilding(facilities, 'Not Lilac Health Center Annex')).toBeNull();
  });

  it('survives a facility with no name', () => {
    expect(matchCurrentBuilding([fac('loc1', null, 'FL')], 'Anything')).toBeNull();
  });
});

describe('pinCurrentFirst', () => {
  const facilities = [
    fac('a', 'Alpha', 'FL'),
    fac('b', 'Bravo', 'GA'),
    fac('c', 'Charlie', 'FL'),
  ];
  const groups = [{ key: 'FL', facilities: 2 }, { key: 'GA', facilities: 1 }];

  it('is a no-op when there is no current building', () => {
    const r = pinCurrentFirst(groups, facilities, null);
    expect(r.groups.map((g) => g.key)).toEqual(['FL', 'GA']);
    expect(r.membersOf('FL').map((f) => f.locationId)).toEqual(['a', 'c']);
  });

  it("floats the current building's state group to the top", () => {
    const r = pinCurrentFirst(groups, facilities, 'b');
    expect(r.groups.map((g) => g.key)).toEqual(['GA', 'FL']);
  });

  it('floats the current building to the front of its own group', () => {
    const r = pinCurrentFirst(groups, facilities, 'c');
    expect(r.membersOf('FL').map((f) => f.locationId)).toEqual(['c', 'a']);
  });

  // The group headings render `g.facilities` straight off the payload. Pinning
  // is an ORDERING, never a move between groups — otherwise the heading says
  // "2 buildings" over a list of one and the screen contradicts itself.
  it('never moves a building out of its group or changes the counts', () => {
    const r = pinCurrentFirst(groups, facilities, 'c');
    expect(r.groups.find((g) => g.key === 'FL').facilities).toBe(2);
    expect(r.membersOf('FL')).toHaveLength(2);
    expect(r.membersOf('GA').map((f) => f.locationId)).toEqual(['b']);
  });

  it('leaves order alone when the current building is already first', () => {
    const r = pinCurrentFirst(groups, facilities, 'a');
    expect(r.groups.map((g) => g.key)).toEqual(['FL', 'GA']);
    expect(r.membersOf('FL').map((f) => f.locationId)).toEqual(['a', 'c']);
  });

  it('groups a stateless building under Unknown, matching the payload key', () => {
    const r = pinCurrentFirst([{ key: 'Unknown', facilities: 1 }], [fac('z', 'Zulu', null)], 'z');
    expect(r.membersOf('Unknown').map((f) => f.locationId)).toEqual(['z']);
  });

  it('tolerates a current id that is not in the payload', () => {
    const r = pinCurrentFirst(groups, facilities, 'nope');
    expect(r.groups.map((g) => g.key)).toEqual(['FL', 'GA']);
    expect(r.membersOf('FL').map((f) => f.locationId)).toEqual(['a', 'c']);
  });
});

describe('sameFacilityName', () => {
  it('matches identical names', () => {
    expect(sameFacilityName('Lilac Health Center', 'Lilac Health Center')).toBe(true);
  });

  it('ignores case and spacing', () => {
    expect(sameFacilityName('  lilac  health center ', 'Lilac Health Center')).toBe(true);
  });

  // The reason this helper exists rather than a `===` at the call site.
  it("tolerates PCC's unit suffix on one side only", () => {
    expect(sameFacilityName('Lilac Health Center - 11', 'Lilac Health Center')).toBe(true);
  });

  it('still distinguishes two genuinely indexed buildings', () => {
    expect(sameFacilityName('Autumnwood Care Center - 3', 'Autumnwood Care Center - 7')).toBe(false);
  });

  it('is false for different buildings and for missing names', () => {
    expect(sameFacilityName('Alpha', 'Beta')).toBe(false);
    expect(sameFacilityName(null, 'Alpha')).toBe(false);
    expect(sameFacilityName('Alpha', null)).toBe(false);
    expect(sameFacilityName(null, null)).toBe(false);
  });
});
