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

// Deep-link a linked interview UDA (BIMS/PHQ-9/GG/Pain) in PCC by its own
// external assessment id. NOTE: best-effort URL — confirm the exact PCC UDA
// "view detail" path; if it 404s this is the single line to correct.
export function openUdaInPcc(externalAssessmentId) {
  if (!externalAssessmentId) return false;
  const url = `/care/chart/assess/assessmentsummary.xhtml?ESOLassessid=${encodeURIComponent(externalAssessmentId)}`;
  window.open(url, '_blank', 'noopener');
  return true;
}
