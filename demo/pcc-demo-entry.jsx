/**
 * PCC Demo entry point — variant of demo-entry.jsx for pcc-demo.html.
 *
 * Mounts PCCDemoApp (with real Preact overlays) instead of the generic DemoApp.
 */

// ── Step 1: Install mocks SYNCHRONOUSLY before anything else ──
import { createMockChrome } from './demo-mock-chrome.js';
import { installGlobalMocks } from './demo-mock-globals.js';
import { installCarePlanAuditMocks } from './demo-care-plan-audit-fixtures.js';
import { installCarePlanDemoWire } from './demo-care-plan-wire.js';

createMockChrome();
installGlobalMocks();
installCarePlanAuditMocks();
installCarePlanDemoWire();
window.__DEMO_MODE = true;

// ── Step 2: Import CSS (Vite will bundle these) ──
import '../content/css/variables.css';
import '../content/css/base.css';
import '../content/css/super-components.css';
import '../content/css/panel.css';
import '../content/css/mds-command-center.css';
import '../content/css/pdpm-analyzer.css';
import '../content/css/item-detail.css';
import '../content/css/query-items.css';
import '../content/css/query.css';
import '../content/css/selector.css';
import '../content/css/popover.css';
import '../content/css/evidence-viewer.css';
import '../content/css/pdf-viewer.css';
import '../content/css/pdf-modal.css';
import '../content/css/sections.css';
import '../content/css/certifications.css';
import '../content/css/admin-modal.css';
import '../content/css/mds-planner.css';
import '../content/css/uda-modal.css';
import '../content/css/care-plan-coverage.css';
import '../content/css/care-plan-stamp.css';
import '../content/css/clinical-notes-modal.css';
import '../content/css/diagnosis-query-modal.css';
import '../content/css/ard-estimator.css';
import '../content/css/qm-board.css';
import '../content/css/qm-command-center.css';
import '../content/css/24hr-report.css';
import '../content/css/mds-comments.css';
import '../content/css/ai-chat.css';
import '../content/css/draggable-overlay.css';
import './demo-chat.css';
import './demo-qm-overrides.css';
import './pcc-demo-overrides.css';

// ── Step 2.5: Register the REAL comment/inbox/notification modules ──
// Side-effect imports: each hangs its singleton on window (MdsCommentsAPI,
// CommentBadges, MdsCommentThread, MdsTagInbox, NotificationsAPI) — the same
// objects the production content script registers. The demo talks to them
// through those globals; the mock chrome layer answers their API calls.
// (inbox-panel's PCC facility-switch / deep-link imports are aliased to demo
// shims in vite.demo.config.js.)
import '../content/modules/notifications/notifications-api.js';
import '../content/modules/mds-comments/comments-api.js';
import '../content/modules/mds-comments/comment-badges.js';
import '../content/modules/mds-comments/comment-thread.js';
import '../content/modules/mds-comments/inbox-panel.js';

// ── Step 3: Mount PCCDemoApp ──
import * as preact from 'preact';
import { render } from 'preact';
import { PCCDemoApp } from './components/PCCDemoApp.jsx';
import { Sidebar as ICD10SidebarComponent } from '../content/modules/icd10-sidebar/Sidebar.jsx';
import { ArdEstimator } from '../content/modules/ard-estimator/ArdEstimator.jsx';
import { Icd10QueryFlow } from '../content/modules/icd10-query-flow/Icd10QueryFlow.jsx';
import { DiagnosisConfirmationDialog } from '../content/modules/diagnosis-confirmation/DiagnosisConfirmationDialog.jsx';
import { initDraggableOverlays } from '../content/utils/draggable-overlay.js';
import { bootTour } from './tour/tour-runner.jsx';
import { TourChrome } from './tour/TourChrome.jsx';
import { installResponsiveFit } from './demo-responsive-fit.js';

// Expose preact + components globally so the vanilla icd10-viewer.js can
// mount Preact trees without dynamic JSX imports in the classic-script load path.
window.__preact = preact;
window.__ICD10SidebarComponent = ICD10SidebarComponent;
window.__ArdEstimator = ArdEstimator;
window.__Icd10QueryFlow = Icd10QueryFlow;
window.__DiagnosisConfirmationDialog = DiagnosisConfirmationDialog;

function boot() {
  let root = document.getElementById('super-demo-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'super-demo-root';
    document.body.appendChild(root);
  }

  installResponsiveFit();
  render(<PCCDemoApp />, root);
  initDraggableOverlays();

  let tourRoot = document.getElementById('super-tour-chrome');
  if (!tourRoot) {
    tourRoot = document.createElement('div');
    tourRoot.id = 'super-tour-chrome';
    document.body.appendChild(tourRoot);
  }
  render(<TourChrome />, tourRoot);

  console.log('[PCC Demo] PCCDemoApp mounted');
  setTimeout(() => { try { bootTour(); } catch (e) { console.warn('[tour] boot failed', e); } }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
