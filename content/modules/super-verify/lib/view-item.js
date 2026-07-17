import { sectionCodeForItem } from './verify-derive.js';

/**
 * Open a PCC MDS/UDA assessment in a new window so the Verify panel stays put.
 *
 * PCC's MDS section entry: /clinical/mds3/section.xhtml?ESOLassessid=
 * {id}[&sectioncode={code}]. This is the same endpoint the section scraper and
 * the query modal deep-link to; the legacy /care/chart/mds/mdssection.jsp path
 * redirects to the Care Plan instead of the assessment (SUP-129). Path is
 * relative so it resolves on whatever PCC host the user is on (www22/www28/…).
 */
function openPccAssessment(assessId, sectioncode) {
  if (!assessId) return false;
  let url = `/clinical/mds3/section.xhtml?ESOLassessid=${encodeURIComponent(assessId)}`;
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
