import { sectionCodeForItem } from './verify-derive.js';

/**
 * Open a PCC MDS/UDA assessment in a new window so the Verify panel stays put.
 *
 * PCC's classic MDS section entry: /care/chart/mds/mdssection.jsp?ESOLassessid=
 * {id}[&sectioncode={code}]. Path is relative so it resolves on whatever PCC
 * host the user is on (www22/www28/…).
 */
function openPccAssessment(assessId, sectioncode) {
  if (!assessId) return false;
  let url = `/care/chart/mds/mdssection.jsp?ESOLassessid=${encodeURIComponent(assessId)}`;
  if (sectioncode) url += `&sectioncode=${encodeURIComponent(sectioncode)}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=1280,height=900');
  return true;
}

// Deep-link an MDS item's section (jumps to the item's section when supported).
export function openItemInPcc(assessId, mdsItem) {
  return openPccAssessment(assessId, sectionCodeForItem(mdsItem) || undefined);
}

// Deep-link a linked interview UDA by its own external assessment id.
export function openUdaInPcc(externalAssessmentId) {
  return openPccAssessment(externalAssessmentId);
}
