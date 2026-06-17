/**
 * Pure logic for the Aide Scoring Quality screen — ported verbatim from the web
 * reference (aide-scorecard.react-reference.tsx + aide-quality-panel.react-reference.tsx).
 *
 * SIGN CONVENTION (read before touching this):
 *   deviation / averageDeviation / overallAverageDeviation = baseline - aideScore.
 *     positive => aide scored BELOW baseline => "scoring LOW"  (residents rated less independent)
 *     negative => aide scored ABOVE baseline => "scoring HIGH" (residents rated more independent)
 *   The UI FLIPS the sign for display so "+" = high and "−" = low (see `signed`).
 *   Tones: sky = high, rose = low, emerald = on track.
 *   Grade tones: A=emerald, B=teal, C=amber, D=orange, F=rose.
 */

export const SHIFT_LABELS = ['Day', 'Eve', 'Night'];
/** GG codes are 1-6, so the largest possible deviation magnitude is 5. */
export const BAR_MAX = 5;

/** Signed deviation as the user reads it: + = above baseline (high), − = below (low). */
export function signed(deviation) {
  // deviation = baseline - score (positive = below baseline). Flip for display.
  const v = -(deviation ?? 0);
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${Math.abs(v).toFixed(1)}`;
}

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

/** Tone for a raw deviation value (used by category bars / example scores). */
export function deviationTone(deviation, significant = true) {
  if (!significant) return 'slate';
  // deviation > 0 => below baseline (low) => rose; < 0 => above (high) => sky
  return deviation > 0 ? 'rose' : 'sky';
}

/** Roster direction tone — keyed off summary.direction, gated by significance. */
export function directionTone(summary) {
  if (!summary || !summary.isSignificant) return 'slate';
  return summary.direction === 'above' ? 'sky' : 'rose';
}

/** Short muted direction label, e.g. "+1.4 · high". */
export function directionLabel(summary) {
  if (!summary || summary.assessmentCount === 0) return 'no data';
  if (!summary.isSignificant) return `${signed(summary.overallAverageDeviation)} · on track`;
  return `${signed(summary.overallAverageDeviation)} · ${summary.direction === 'above' ? 'high' : 'low'}`;
}

/** Headline status pill: { label, tone }. */
export function statusOf(summary) {
  if (!summary || summary.assessmentCount === 0) return { label: 'No data', tone: 'slate' };
  if (summary.isHighVariance) return { label: 'Inconsistent', tone: 'amber' };
  if (!summary.isSignificant) return { label: 'On Track', tone: 'emerald' };
  return summary.direction === 'below'
    ? { label: 'Scoring Low', tone: 'rose' }
    : { label: 'Scoring High', tone: 'sky' };
}

/** One-sentence plain-English coaching line. Ported verbatim from the web ref. */
export function coachingLine(detail) {
  const s = detail?.summary;
  if (!s || s.assessmentCount === 0) return 'No scored assessments with valid MDS baselines yet.';

  const cats = (detail.categoryDeviations || [])
    .filter((c) => c.isSignificant)
    .sort((a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation))
    .slice(0, 3)
    .map((c) => c.name);
  const catList =
    cats.length === 0
      ? ''
      : cats.length === 1
        ? cats[0]
        : `${cats.slice(0, -1).join(', ')} and ${cats[cats.length - 1]}`;

  const pts = Math.abs(s.overallAverageDeviation).toFixed(1);

  if (s.isHighVariance) {
    return `Scores swing widely against the MDS baseline (±${s.variance.toFixed(1)} pts)${
      catList ? `, most in ${catList}` : ''
    }. Inconsistent scoring — worth reviewing how levels are being judged.`;
  }
  if (!s.isSignificant) {
    return `Scores closely match the MDS baseline (within ${pts} pts on average). No action needed.`;
  }
  if (s.direction === 'above') {
    return `Tends to score about ${pts} points ABOVE the MDS baseline${
      catList ? `, especially ${catList}` : ''
    } — rating residents as more independent than the assessment. Aim to align with the assessed level.`;
  }
  return `Tends to score about ${pts} points BELOW the MDS baseline${
    catList ? `, especially ${catList}` : ''
  } — rating residents as less independent than the assessment. Aim to align with the assessed level.`;
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
