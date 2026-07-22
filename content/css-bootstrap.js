// CSS bootstrap.
//
// Why this exists: Chrome injects manifest content_scripts CSS as <link>
// tags pointing at chrome-extension:// URLs. PostHog session recording
// (rrweb) cannot inline cross-origin stylesheets — `linkElement.sheet
// .cssRules` throws SecurityError on chrome-extension:// origins — and
// the link href doesn't resolve in PostHog's playback iframe. Result:
// our extension UI appeared completely unstyled in session replays.
//
// Fix: import every CSS file with vite's `?inline` query (embeds the
// processed CSS as a string in the JS bundle at build time), concatenate
// in cascade order, and inject as a single <style> tag. rrweb serializes
// <style>.textContent fine, so playback renders our UI with full styling.
//
// To add a new CSS file:
//   1. Add `?inline` import below in cascade order.
//   2. Append it to CSS_BUNDLE.
// Do NOT add CSS files to manifest.json content_scripts — they will not
// render in session recordings. Do NOT use plain `import './foo.css'`
// in JS files either — same problem.

// --- Foundation (must come first) ----------------------------------------
import variables from './css/variables.css?inline';
import base from './css/base.css?inline';

// --- Manifest-order shared UI -------------------------------------------
import popover from './css/popover.css?inline';
import panel from './css/panel.css?inline';
import sections from './css/sections.css?inline';
import evidenceViewer from './css/evidence-viewer.css?inline';
import adminModal from './css/admin-modal.css?inline';
import clinicalNotesModal from './css/clinical-notes-modal.css?inline';
import therapyModal from './css/therapy-modal.css?inline';
import pdfModal from './css/pdf-modal.css?inline';
import diagnosisQueryModal from './css/diagnosis-query-modal.css?inline';
import superComponents from './css/super-components.css?inline';
import draggableOverlay from './css/draggable-overlay.css?inline';
import selector from './css/selector.css?inline';
import query from './css/query.css?inline';
import icd10Viewer from './css/icd10-viewer.css?inline';
import queryItems from './css/query-items.css?inline';
import feedback from './css/feedback.css?inline';
import chatbot from './chatbot.css?inline';
import styles from './styles.css?inline';

// --- Module-specific (was previously imported in content.js) -------------
import mdsCommandCenter from './css/mds-command-center.css?inline';
import pdpmAnalyzer from './css/pdpm-analyzer.css?inline';
import itemDetail from './css/item-detail.css?inline';
import pdfViewer from './css/pdf-viewer.css?inline';
import aiChat from './css/ai-chat.css?inline';
import certifications from './css/certifications.css?inline';
import carePlanCoverage from './css/care-plan-coverage.css?inline';
import ardEstimator from './css/ard-estimator.css?inline';
import mdsPlanner from './css/mds-planner.css?inline';
import udaModal from './css/uda-modal.css?inline';
import qmBoard from './css/qm-board.css?inline';
import managedCare from './css/managed-care.css?inline';
import qmCommandCenter from './css/qm-command-center.css?inline';
import ftagPrevention from './css/ftag-prevention.css?inline';
import twentyFourHourReport from './css/24hr-report.css?inline';
import updateBanner from './css/update-banner.css?inline';
import meddiagAugment from './css/meddiag-augment.css?inline';
import carePlanStamp from './css/care-plan-stamp.css?inline';
import roundingReports from './css/rounding-reports.css?inline';
import mdsListCoverage from './css/mds-list-coverage.css?inline';
import superVerify from './css/super-verify.css?inline';
import i8000Overlay from './css/i8000-overlay.css?inline';
import ipaView from './css/ipa-view.css?inline';
import extensionSettings from './css/extension-settings.css?inline';

const CSS_BUNDLE = [
  variables,
  base,
  popover,
  panel,
  sections,
  evidenceViewer,
  adminModal,
  clinicalNotesModal,
  therapyModal,
  pdfModal,
  diagnosisQueryModal,
  superComponents,
  draggableOverlay,
  selector,
  query,
  icd10Viewer,
  queryItems,
  feedback,
  chatbot,
  styles,
  mdsCommandCenter,
  pdpmAnalyzer,
  itemDetail,
  pdfViewer,
  aiChat,
  certifications,
  carePlanCoverage,
  ardEstimator,
  mdsPlanner,
  udaModal,
  qmBoard,
  managedCare,
  qmCommandCenter,
  ftagPrevention,
  twentyFourHourReport,
  updateBanner,
  meddiagAugment,
  carePlanStamp,
  roundingReports,
  mdsListCoverage,
  superVerify,
  i8000Overlay,
  ipaView,
  extensionSettings,
].join('\n\n');

function injectCss() {
  if (document.getElementById('super-ltc-css')) return;
  const style = document.createElement('style');
  style.id = 'super-ltc-css';
  style.textContent = CSS_BUNDLE;
  (document.head || document.documentElement).appendChild(style);
}

injectCss();
