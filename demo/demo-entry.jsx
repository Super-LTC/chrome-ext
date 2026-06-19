/**
 * Demo entry point — loaded by each demo HTML page as a module script.
 *
 * 1. Install mocks synchronously (before any component code evaluates)
 * 2. Import CSS (Vite bundles them)
 * 3. Dynamically import DemoApp (ensures mocks are ready)
 */

// ── Step 1: Install mocks SYNCHRONOUSLY before anything else ──
import { createMockChrome } from './demo-mock-chrome.js';
import { installGlobalMocks } from './demo-mock-globals.js';

createMockChrome();
installGlobalMocks();
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
import '../content/css/clinical-notes-modal.css';
import '../content/css/diagnosis-query-modal.css';
import '../content/css/ard-estimator.css';
import '../content/css/ai-chat.css';
import '../content/css/qm-board.css';
import '../content/css/qm-command-center.css';
import '../content/css/ftag-prevention.css';
import '../content/css/24hr-report.css';
import './demo-chat.css';
import './demo-document-viewer.css';

// ── Step 3: Mount DemoApp ──
// Mocks are installed above (module body executes in order, before render).
// Component hooks only call chrome.runtime.sendMessage inside useEffect,
// which fires after mount, so static imports are safe.
import * as preact from 'preact';
import { render } from 'preact';
import { DemoApp } from './components/DemoApp.jsx';
import { QueryItemsPage } from '../content/modules/query-items/QueryItemsPage.jsx';
import { Sidebar as ICD10SidebarComponent } from '../content/modules/icd10-sidebar/Sidebar.jsx';
import { ArdEstimator } from '../content/modules/ard-estimator/ArdEstimator.jsx';
import { Icd10QueryFlow } from '../content/modules/icd10-query-flow/Icd10QueryFlow.jsx';
import { DiagnosisConfirmationDialog } from '../content/modules/diagnosis-confirmation/DiagnosisConfirmationDialog.jsx';
import { bootTour } from './tour/tour-runner.jsx';
import { TourChrome } from './tour/TourChrome.jsx';

// Expose preact + components globally so icd10-viewer.js uses synchronous
// globals instead of dynamic JSX imports (which would 404 against static bundles).
window.__preact = preact;
window.__QueryItemsPage = QueryItemsPage;
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

  render(<DemoApp />, root);

  let tourRoot = document.getElementById('super-tour-chrome');
  if (!tourRoot) {
    tourRoot = document.createElement('div');
    tourRoot.id = 'super-tour-chrome';
    document.body.appendChild(tourRoot);
  }
  render(<TourChrome />, tourRoot);

  console.log('[Demo] DemoApp mounted');
  setTimeout(() => { try { bootTour(); } catch (e) { console.warn('[tour] boot failed', e); } }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
