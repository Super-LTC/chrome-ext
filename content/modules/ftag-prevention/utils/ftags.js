/**
 * F-Tag catalog — display metadata for the tags the detector tracks.
 *
 * `title`    — the survey tag's plain-English name (shown big on the tile).
 * `subtitle` — the specific signal this finding family represents.
 * `accent`   — tile left-border / accent color key (maps to CSS modifier).
 *
 * This is display-only. The authoritative list of which findings exist comes
 * from the feed; tags not in this catalog still render with a derived title.
 */
export const FTAG_CATALOG = {
  F684: { title: 'Quality of Care',          subtitle: 'Repeated refusals of a critical medication' },
  F580: { title: 'Notification of Change',   subtitle: 'Abnormal vital with no clinical note within 24h' },
  F697: { title: 'Pain Management',          subtitle: 'PRN pain med given, effectiveness not charted' },
  F692: { title: 'Nutrition & Hydration',    subtitle: 'Significant unaddressed weight loss' },
  F758: { title: 'Psychotropic Medications', subtitle: 'Long-term psychotropic without recent GDR' },
  F756: { title: 'Drug Regimen Review',      subtitle: 'Pharmacist DRR overdue (>60 days)' },
  F883: { title: 'Influenza & Pneumococcal', subtitle: 'Immunization status incomplete' },
  F678: { title: 'Code Status / CPR',        subtitle: 'Code status disagrees across the chart' },
};

/**
 * F678 headline by severity tier — the plain-English summary of WHY the finding
 * fired (the severity pill already carries the tier name). Drives the bold line
 * above the stacked source rows.
 */
export function codeStatusHeadline(severity) {
  switch (severity) {
    case 'critical': return 'Code status conflict in the chart';
    case 'high':     return 'Signed form contradicts the chart';
    case 'standard': return 'Old form differs from the chart';
    default:         return 'Code status conflict';
  }
}

export function ftagMeta(ftag) {
  return FTAG_CATALOG[ftag] || null;
}

/** Plain-English tag name for nurses who don't know F-tag numbers ("Quality of Care"). */
export function tagName(ftag) {
  return FTAG_CATALOG[ftag]?.title || ftag;
}

/**
 * "What to look for" hint shown atop the source view, so the nurse knows what
 * the highlighted rows mean and what action clears the finding.
 */
const SOURCE_HINT = {
  F684: 'Highlighted rows are refusals of a critical medication. Confirm the refusals were addressed (notified provider, documented) — then resolve.',
  F697: 'A PRN pain med was given but its effectiveness wasn’t charted. Highlighted doses need a follow-up note. Add the note in PCC, then resolve.',
  F580: 'An abnormal vital had no clinical note within 24h. Highlighted readings are out of range — document the notification, then resolve.',
  F692: 'Significant weight loss with no documented intervention. Highlighted weights show the decline — address it, then resolve.',
  F756: 'Pharmacist drug-regimen review is overdue (>60 days). Review the notes, then resolve.',
  F758: 'Long-term psychotropic without a recent gradual dose reduction. Review the order/notes, then resolve.',
  F678: 'This signed form is the one code-status source not in PointClickCare. Confirm it against the order and care plan, reconcile in PCC, then resolve.',
};

export function sourceHint(ftag) {
  return SOURCE_HINT[ftag] || '';
}

/** Human label for a snake_case vital type (e.g. blood_pressure → "Blood pressure"). */
export function vitalTypeLabel(vt) {
  if (!vt) return '';
  return String(vt)
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/o2/i, 'O₂');
}
