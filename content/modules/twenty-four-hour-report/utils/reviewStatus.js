/**
 * Review-status vocabulary for a 24-hour report finding.
 *
 * Sign-off is NOT a dismiss. Resolving a finding never hides it — it records
 * that a named person looked and took care of it, which is the whole ask:
 * "somebody saw this, I'm signing off that this is taken care of."
 */

export const REVIEW_STATUS = {
  OPEN: 'open',
  NEEDS_INPUT: 'needs_input',
  RESOLVED: 'resolved',
};

/**
 * Legacy (v1) findings predate `reviewStatus` entirely, so a missing value means
 * nobody has acted on it — not that the data is broken.
 */
export function reviewStatusOf(finding) {
  const raw = finding?.reviewStatus;
  if (raw === REVIEW_STATUS.NEEDS_INPUT || raw === REVIEW_STATUS.RESOLVED) return raw;
  return REVIEW_STATUS.OPEN;
}

export const STATUS_LABEL = {
  [REVIEW_STATUS.OPEN]: 'Open',
  [REVIEW_STATUS.NEEDS_INPUT]: 'Needs input',
  [REVIEW_STATUS.RESOLVED]: 'Signed off',
};

/** Past-tense phrasing for the trail: "Jake signed off". */
export const ACTION_VERB = {
  needs_input: 'flagged for input',
  resolved: 'signed off',
  reopened: 'reopened',
};

/**
 * Short relative time for trail entries — "8:14a" style is ambiguous across a
 * multi-day report, so anything older than a day gets a date.
 */
export function formatTrailTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

/**
 * Merge sign-off actions and comments into one chronological timeline.
 *
 * They interleave rather than sitting in separate lists because together they
 * ARE the story of the finding — "Ricky asked whether the MD was called, Joanna
 * answered, Jake signed off" only reads correctly in order. Splitting them would
 * make you reconstruct the sequence from timestamps by eye.
 *
 * Stable: equal timestamps keep actions ahead of comments, so a comment posted
 * alongside a sign-off reads as the explanation for it.
 */
export function mergeTimeline(actions, comments) {
  const items = [
    ...(Array.isArray(actions) ? actions : []).map((a) => ({ kind: 'action', at: a.createdAt, data: a })),
    ...(Array.isArray(comments) ? comments : []).map((c) => ({ kind: 'comment', at: c.createdAt, data: c })),
  ];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.item.at) || 0;
      const tb = Date.parse(b.item.at) || 0;
      if (ta !== tb) return ta - tb;
      if (a.item.kind !== b.item.kind) return a.item.kind === 'action' ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** First name only, so the pill stays short: "✓ Jake 2:14 PM". */
export function shortName(name, email) {
  const source = name || email || '';
  if (!source) return 'Someone';
  if (name) return name.split(/\s+/)[0];
  return source.split('@')[0];
}
