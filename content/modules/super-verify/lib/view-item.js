import { sectionCodeForItem } from './verify-derive.js';

/**
 * Open an MDS item's section page in PointClickCare (new tab so the Verify
 * panel stays put). Best-effort: needs the assessment id + a derivable section.
 */
export function openItemInPcc(assessId, mdsItem) {
  const code = sectionCodeForItem(mdsItem);
  if (!assessId || !code) return false;
  const url = `/clinical/mds3/section.xhtml?ESOLassessid=${encodeURIComponent(assessId)}&sectioncode=${encodeURIComponent(code)}`;
  window.open(url, '_blank', 'noopener');
  return true;
}
