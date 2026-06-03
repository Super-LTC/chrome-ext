// Super LTC Chrome Extension - Main Entry Point
// This file imports all vanilla JS modules in the correct order
// and will eventually mount the Preact app for modern components

// 1. Import global config + CSS bootstrap
//    css-bootstrap.js inlines every stylesheet into a single <style> tag
//    so rrweb (PostHog session recording) can render our UI in playback.
//    Must come BEFORE any UI module that creates DOM, otherwise FOUC.
import '../config.js';
import './css-bootstrap.js';
import './utils/analytics.js'; // initializes PostHog, sets super-properties, bootstraps auth

// 2. Import vanilla utilities (order matters - matches current manifest.json order)
import './mockData.js';
import './evidence-viewers.js';
import './section-transformers.js';

// 3. Import vanilla components
import './components/modal.js';
import './components/dropdown.js';
import './components/toast.js';

// 3.5. Import certifications API (makes window.CertAPI available for fab.js)
import './modules/certifications/cert-api.js';

// 3.6. Import notifications API (window.NotificationsAPI — badge + seen-state)
import './modules/notifications/notifications-api.js';

// 4. Import query system
import './queries/query-api.js';
import './queries/query-state.js';
import './queries/query-badges.js';
import './queries/query-panel.js';
import './queries/query-modal.js';
import './queries/query-send-modal.js';

// 4.5. Import MDS overlay (depends on queries, evidence-viewers, section-transformers)
import './mds-overlay.js';

// 4.6. Super MDS Mode — full-screen one-item-at-a-time blitz overlay
import './modules/super-mds-mode/SuperMDSMode.jsx';

// 5. Import ICD-10 viewer
import './icd10-viewer/icd10-mock-data.js';
import './icd10-viewer/icd10-api.js';
import './icd10-viewer/pcc-client.js';
import './icd10-viewer/pcc-dx-scraper.js';
import './icd10-viewer/icd10-sidebar.js';
import './icd10-viewer/icd10-evidence-panel.js';
import './icd10-viewer/icd10-pdf-viewer.js';
import './icd10-viewer/icd10-viewer.js';

// 6. Import super-menu modules
import './super-menu/state.js';
import './super-menu/utils.js';
import './super-menu/context.js';
import './super-menu/session.js';
import './super-menu/fab.js';
import './super-menu/panel.js';
import './super-menu/navigation.js';
import './super-menu/dashboard-state.js';
import './super-menu/dashboard-view.js';
import './super-menu/facility-dashboard-state.js';
import './super-menu/facility-dashboard-view.js';
import './super-menu/mds-view.js';
import './super-menu/chat-view.js';
import './super-menu/streaming.js';
import './super-menu/meddiag-augment.js';
import './super-menu/init.js';

// 6.4. Care Plan Auto-Pop stamping (injects button on careplandetail_rev.jsp)
//      Modules are exposed on window globals; the modal is dynamically imported
//      on click to keep the initial bundle small.
import './modules/care-plan-stamp/stamp-api.js';
import './modules/care-plan-stamp/audit-api.js';
import './modules/care-plan-stamp/pcc-resolve.js';
import './modules/care-plan-stamp/pcc-add-intervention.js';
import './modules/care-plan-stamp/pcc-discover.js';
import './modules/care-plan-stamp/pcc-stamp.js';
import './modules/care-plan-stamp/inject-button.js';
import './modules/care-plan-stamp/audit-banner.js';
import './modules/care-plan-stamp/audit-review-button.js';

// 6.5. Load PDF.js library into content script scope
import * as pdfjsLib from 'pdfjs-dist';
window.pdfjsLib = pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

// 7. Mount Preact app
import * as preact from 'preact';
import { render, h } from 'preact';
import { App } from './components/App.jsx';
import { Sidebar as ICD10SidebarComponent } from './modules/icd10-sidebar/Sidebar.jsx';
import { ArdEstimator } from './modules/ard-estimator/ArdEstimator.jsx';

// Expose Preact + ICD-10 Sidebar + ARD Estimator so the vanilla shims can
// mount the Preact trees synchronously (and the demo works without dynamic
// JSX imports that would fail against static bundles).
if (!window.__preact) window.__preact = preact;
window.__ICD10SidebarComponent = ICD10SidebarComponent;
window.__ArdEstimator = ArdEstimator;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPreactApp);
} else {
  initPreactApp();
}

function initPreactApp() {
  const root = document.createElement('div');
  root.id = 'super-ltc-root';
  document.body.appendChild(root);
  render(h(App, null), root);
}

// 8. Start update checker (polls GitHub Releases on this repo)
import { UpdateChecker } from './utils/update-checker.js';
UpdateChecker.startPolling();

// 9. Start PCC SPA navigation observer (fires pcc_page_viewed on path change)
import { startPccNavObserver } from './utils/pcc-nav-observer.js';
startPccNavObserver();

// 10. Install global delegated click listener for [data-track] elements
import { startTrackDelegate } from './utils/track-delegate.js';
startTrackDelegate();

// 11. Fire extension_loaded at most once per tab session. Content scripts
// re-inject on every PCC top-frame navigation, so an unthrottled track() here
// produced one event per page nav (~37K/wk).
import { track } from './utils/analytics.js';
try {
  if (!sessionStorage.getItem('super_ext_loaded_fired')) {
    sessionStorage.setItem('super_ext_loaded_fired', '1');
    track('extension_loaded');
  }
} catch {
  // sessionStorage unavailable (private mode, etc.) — fall back to firing.
  track('extension_loaded');
}
