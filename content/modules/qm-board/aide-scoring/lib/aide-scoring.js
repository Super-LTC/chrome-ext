/**
 * Pure logic for the Aide Scoring Quality screen. Ported from the web reference
 * and rebuilt for the plain-English clarity redesign (web PR #808).
 *
 * SIGN CONVENTION (read before touching this):
 *   deviation / averageDeviation / overallAverageDeviation = peerAverage - aideScore.
 *     positive => aide scored BELOW peers => rates the resident MORE dependent (needs more help)
 *     negative => aide scored ABOVE peers => rates the resident LESS dependent (needs less help)
 *   Everything a nurse reads is framed in DEPENDENCE, never "high/low" or a bare
 *   number: `less dep.` (blue/sky) vs `more dep.` (red/rose), `on track` (emerald),
 *   `inconsistent` (amber). Magnitude is spoken in the word ("a bit / way").
 *   GG scale: 1 = fully dependent → 6 = independent.
 *   Grade tones: A=emerald, B=teal, C=amber, D=orange, F=rose.
 */

export const SHIFT_LABELS = ['Day', 'Eve', 'Night'];
/** GG codes are 1-6, so the largest possible deviation magnitude is 5. */
export const BAR_MAX = 5;
/** Weeks of weekly history required before the trend chart is meaningful. */
export const MIN_TREND_WEEKS = 3;

/** `.qmc` tone suffix for a grade letter (A=emerald … F=rose). */
export function gradeTone(grade) {
  switch ((grade || '')[0]) {
    case 'A': return 'emerald';
    case 'B': return 'teal';
    case 'C': return 'amber';
    case 'D': return 'orange';
    default:  return 'rose';
  }
}

/** Roster direction tone — keyed off summary.direction, gated by significance. */
export function directionTone(summary) {
  if (!summary || !summary.isSignificant) return 'slate';
  return summary.direction === 'above' ? 'sky' : 'rose';
}

/** Short muted direction label for the collapsed roster row (dependence framing). */
export function directionLabel(summary) {
  if (!summary || summary.assessmentCount === 0) return 'no data';
  if (!summary.isSignificant) return 'on track';
  return summary.direction === 'above' ? 'less dep.' : 'more dep.';
}

/**
 * One-line plain-English verdict + a status-dot tone. Replaces the signed
 * headline + status pill — a nurse reads the sentence, not a number.
 */
export function verdictOf(summary) {
  if (!summary || summary.assessmentCount === 0)
    return { line: 'Not enough scored assessments yet.', tone: 'slate' };
  if (summary.isHighVariance)
    return { line: 'Scoring is inconsistent — swings both above and below the team.', tone: 'amber' };
  if (!summary.isSignificant)
    return { line: 'Scores in line with the rest of the team.', tone: 'emerald' };
  return summary.direction === 'above'
    ? { line: 'Rates residents as less dependent — needing less help — than the team.', tone: 'sky' }
    : { line: 'Rates residents as more dependent — needing more help — than the team.', tone: 'rose' };
}

/**
 * Per-category DEPENDENCE label + tone. deviation = peerAverage − score.
 * deviation < 0 → scored ABOVE peers → "less dep." (needs less help, sky);
 * deviation > 0 → scored BELOW peers → "more dep." (needs more help, rose).
 * Magnitude is spoken in the word: <1.3 = "a bit ", >2.3 = "way ", else "".
 */
export function categoryLabel(deviation, significant) {
  if (!significant) return { word: 'on track', tone: 'emerald' };
  const size = Math.abs(deviation) < 1.3 ? 'a bit ' : Math.abs(deviation) > 2.3 ? 'way ' : '';
  const lessDep = deviation < 0;
  return { word: `${size}${lessDep ? 'less' : 'more'} dep.`, tone: lessDep ? 'sky' : 'rose' };
}

/**
 * Trend verdict — compare early vs late accuracy (closeness to peers; lower
 * |dev| = better). Positive delta = the aide's scores got closer to the team.
 */
export function trendVerdict(pts) {
  const half = Math.floor(pts.length / 2);
  const avg = (a) => a.reduce((s, p) => s + Math.abs(p.averageDeviation), 0) / Math.max(a.length, 1);
  const delta = avg(pts.slice(0, half)) - avg(pts.slice(half)); // + = got closer to team
  if (delta > 0.3) return { word: 'Yes, improving', arrow: '↗', tone: 'emerald' };
  if (delta < -0.3) return { word: 'Drifting further', arrow: '↘', tone: 'rose' };
  return { word: 'Holding steady', arrow: '→', tone: 'slate' };
}

/** "Jun 28" from a YYYY-MM-DD string (UTC-safe, no timezone drift). */
export function fmtDate(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const SORT_OPTIONS = [
  { value: 'grade-worst', label: 'Grade · worst first' },
  { value: 'grade-best', label: 'Grade · best first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'scores', label: 'Most scores' },
];

export function sortAides(aides, key) {
  const copy = [...(aides || [])];
  switch (key) {
    case 'grade-best':
      return copy.sort((a, b) => b.gradeScore - a.gradeScore);
    case 'name':
      return copy.sort((a, b) => a.aideName.localeCompare(b.aideName));
    case 'scores':
      return copy.sort((a, b) => b.assessmentCount - a.assessmentCount);
    case 'grade-worst':
    default:
      return copy.sort((a, b) => a.gradeScore - b.gradeScore);
  }
}

/** "Flagged" = clearly-failing grades (D/F) a DON should coach first. */
export function flaggedCount(aides) {
  return (aides || []).filter((a) => a.grade?.[0] === 'D' || a.grade?.[0] === 'F').length;
}

/**
 * Top 1–2 significant categories an aide is off in (names joined), e.g.
 * "Toilet Transfer, Eating". Returns null when nothing is significant (on track).
 */
export function topOffIn(summary, max = 2) {
  const cats = (summary?.categoryDeviations || [])
    .filter((c) => c.isSignificant)
    .sort((a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation))
    .slice(0, max)
    .map((c) => c.name);
  return cats.length ? cats.join(', ') : null;
}
