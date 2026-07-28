/**
 * F-Tag PCC deep-links.
 *
 * These moved to content/utils/pcc-links.js when the 24-hour report became the
 * fifth call site for the same URL patterns. Re-exported here so F-Tag's imports
 * keep working; prefer importing from the shared util directly in new code.
 *
 * F-Tag keeps its own popup target name so a note opened from the F-Tag board
 * doesn't reuse — and navigate away — a window opened from another surface.
 */
export {
  patientDashboardUrl,
  progressNoteUrl,
  navigatePcc,
} from '../../../utils/pcc-links.js';

import { openPccWindow as openSharedPccWindow } from '../../../utils/pcc-links.js';

export function openPccWindow(url, target = 'ftag_progress_note') {
  return openSharedPccWindow(url, target);
}
