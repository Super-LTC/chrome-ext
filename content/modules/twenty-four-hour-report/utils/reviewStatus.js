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

/**
 * The pill used to render STATUS_LABEL[open] === 'Open', which reads as a verb.
 * People clicked it expecting the resident's chart. The row now labels the pill
 * with the ACTION ("Sign off") or the RESULT ("Signed off") instead, so these
 * are only for aria/tooltips where a state reading is unambiguous.
 */
export const STATUS_LABEL = {
  [REVIEW_STATUS.OPEN]: 'Not signed off',
  [REVIEW_STATUS.NEEDS_INPUT]: 'Needs input',
  [REVIEW_STATUS.RESOLVED]: 'Signed off',
};

/** "Jonathan Cameron" -> "JC". Falls back to one letter, never empty. */
export function initialsOf(nameOrEmail) {
  const raw = String(nameOrEmail || '').trim();
  if (!raw) return '?';
  const base = raw.includes('@') ? raw.split('@')[0].replace(/[._-]+/g, ' ') : raw;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
/** Tie-break order at identical timestamps: actions before comments. */
const KIND_RANK = { action: 0, comment: 1 };

/**
 * A machine-found follow-up, as a timeline entry — or null.
 *
 * Only ever built from a POSITIVE detection. There is deliberately no "we looked
 * and found nothing" entry: absence of evidence is not evidence of absence when
 * our note sync can lag, and a false "nobody handled this" is the error that
 * makes someone stop trusting the whole feature.
 */
export function detectionEntry(followup) {
  if (!followup || followup.status !== 'detected') return null;
  if (!followup.summary || !followup.detectedSourceId) return null;
  return {
    kind: 'detection',
    at: followup.detectedAt || null,
    data: {
      id: followup.detectedSourceId,
      // PCC's id for the same note, when we have it. Distinct from `id`, which
      // is our clinical_notes row id and cannot be turned into a PCC URL.
      pccNoteId: followup.detectedPccNoteId || null,
      summary: followup.summary,
      detectedAt: followup.detectedAt || null,
    },
  };
}

export function mergeTimeline(actions, comments) {
  const items = [
    ...(Array.isArray(actions) ? actions : []).map((a) => ({ kind: 'action', at: a.createdAt, data: a })),
    ...(Array.isArray(comments) ? comments : []).map((c) => ({ kind: 'comment', at: c.createdAt, data: c })),
  ];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = a.item.at ? Date.parse(a.item.at) || 0 : 0;
      const tb = b.item.at ? Date.parse(b.item.at) || 0 : 0;
      if (ta !== tb) return ta - tb;
      if (a.item.kind !== b.item.kind) return KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind];
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
