/**
 * "You're here" — locating the PCC building the user is currently looking at
 * inside the all-buildings region payload, and floating it to the front.
 *
 * WHY THIS IS A CHIP AND NOT AN AUTO-DROP. The only handle we have on the
 * current building is a NAME: PCC's facility name scraped off the page vs
 * `location.name` on the payload. That match has a real failure rate, and
 * dropping someone into the wrong building's numbers is far worse than making
 * them click. So the landing is always the grid; this module only decides which
 * card gets a chip and which group sorts first. Every failure mode here is
 * "no chip", never "wrong building".
 *
 * WHICH NAME WE COMPARE. Buildings have TWO names, and they are different
 * columns rather than aliases: `name` is the short label customers chose
 * ("Riverside Premier"), `pccFacilityName` is what PCC calls it ("The Riverside
 * Premier Rehabilitation & Healing Center"). 20 of 432 prod locations disagree.
 * What we scrape off the page is PCC's name, so that is what we match on —
 * comparing against the display name would silently fail on exactly those 20.
 * The server resolves the same way (`LocationService.resolveFacilityForExtensionUser`
 * matches `locations.pccFacilityName` with the same trailing-suffix tolerance).
 */

const norm = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '');

/** Strip PCC's trailing building/unit suffix: "Lilac Health Center - 11". */
const stripSuffix = (s) => norm(s).replace(/\s*[-–—]\s*\d+\s*$/, '');

/** The name a facility is addressed by, falling back for the nullable column. */
const nameOf = (f) => f.pccFacilityName ?? f.name;

/** Exactly one match, or null. Ambiguity is treated as no match, never a guess. */
const soleMatch = (facilities, pick, target) => {
  const hits = facilities.filter((f) => f && pick(f) === target);
  return hits.length === 1 ? hits[0].locationId : null;
};

/**
 * The locationId of the building matching the PCC facility name scraped off the
 * page, or null.
 *
 * Exact (normalized) equality only. Substring and prefix matching are
 * deliberately absent: "Regents Park" prefixes two real buildings in one org, so
 * a prefix rule would confidently chip the wrong card. An ambiguous match is
 * treated as no match.
 *
 * TWO PASSES, exact first. Some buildings genuinely end in an index —
 * "Autumnwood Care Center - 3" and "- 7" are real, distinct PCC names — so
 * stripping the suffix up front would collapse them onto one string and make
 * both unmatchable. Exact equality resolves those; the suffix-tolerant pass then
 * catches PCC appending a unit number to a name that doesn't carry one.
 *
 * `pccFacilityName` is nullable on the wire (the column is), so we fall back to
 * the display name for any row missing it rather than dropping the row.
 *
 * @param {Array<{locationId: string, name?: string|null, pccFacilityName?: string|null}>} facilities
 * @param {string|null|undefined} scrapedName  The facility name read off the PCC page.
 * @returns {string|null}
 */
export function matchCurrentBuilding(facilities, scrapedName) {
  if (!scrapedName || !Array.isArray(facilities)) return null;

  const exact = norm(scrapedName);
  if (!exact) return null;

  return (
    soleMatch(facilities, (f) => norm(nameOf(f)), exact)
    ?? soleMatch(facilities, (f) => stripSuffix(nameOf(f)), stripSuffix(scrapedName))
  );
}

/**
 * Do these two strings name the same building?
 *
 * Exists so "is this the building the user has open in PCC" has ONE answer.
 * A raw `===` looks equivalent and isn't: PCC appends a unit suffix on some
 * pages, so the page name and `pccFacilityName` can differ by "- 11" for the
 * same building. Callers that compare directly silently take the
 * different-building branch on exactly those pages.
 *
 * Exact first, then suffix-tolerant on ONE SIDE ONLY. Stripping both sides looks
 * equivalent and is not: "Autumnwood Care Center - 3" and "- 7" are two real,
 * distinct buildings that both reduce to the same stem, so a both-sides strip
 * declares them the same building. The asymmetric form still matches
 * "Lilac Health Center - 11" against "Lilac Health Center", which is the case
 * that actually occurs — PCC adding a suffix the payload doesn't carry.
 */
export function sameFacilityName(a, b) {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  return stripSuffix(a) === norm(b) || norm(a) === stripSuffix(b);
}

/**
 * Reorder the board so the current building reads first, WITHOUT moving it
 * between groups.
 *
 * Pinning is ordering only. The group headings render `g.facilities` straight
 * off the payload, so lifting a card out of its state group would leave a
 * heading claiming "2 buildings" above a list of one — the screen contradicting
 * its own numbers. Instead the current building's state group floats to the top
 * and the building floats to the front of that group.
 *
 * @param {Array<{key: string}>} groups
 * @param {Array<{locationId: string, state?: string|null}>} facilities
 * @param {string|null} currentLocationId
 * @returns {{groups: Array, membersOf: (key: string) => Array}}
 */
export function pinCurrentFirst(groups, facilities, currentLocationId) {
  const byGroup = new Map();
  for (const f of facilities) {
    // 'Unknown' matches the key the region service uses for a stateless location.
    const key = f.state ?? 'Unknown';
    const list = byGroup.get(key);
    if (list) list.push(f);
    else byGroup.set(key, [f]);
  }

  const current = currentLocationId
    ? facilities.find((f) => f.locationId === currentLocationId)
    : null;

  if (!current) {
    return { groups, membersOf: (key) => byGroup.get(key) ?? [] };
  }

  const currentKey = current.state ?? 'Unknown';

  // Stable partition, so everything except the pinned entries keeps payload order.
  const sortedGroups = [
    ...groups.filter((g) => g.key === currentKey),
    ...groups.filter((g) => g.key !== currentKey),
  ];

  return {
    groups: sortedGroups,
    membersOf: (key) => {
      const members = byGroup.get(key) ?? [];
      if (key !== currentKey) return members;
      return [current, ...members.filter((f) => f.locationId !== current.locationId)];
    },
  };
}
