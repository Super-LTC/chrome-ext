/**
 * Effective source kind for a normalized finding.
 *
 * The feed's `source.kind` is authoritative — EXCEPT some older F684/F697 rows
 * predate the orderId enrichment and come back as `none`. The finding-anchored
 * /findings/[id]/mar endpoint still resolves a MAR window for those, so we treat
 * MAR-capable tags as `mar` even when the descriptor says `none`. All other
 * kinds are taken verbatim.
 */
const MAR_TAGS = new Set(['F684', 'F697']);

export function effectiveSourceKind(finding) {
  const kind = finding?.source?.kind || 'none';
  if (kind === 'none' && MAR_TAGS.has(finding?.ftag)) return 'mar';
  return kind;
}

/** Whether a row should show a "View source" affordance at all. */
export function hasSourceView(finding) {
  return effectiveSourceKind(finding) !== 'none';
}
