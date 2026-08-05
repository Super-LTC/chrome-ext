/**
 * DemoApp — shell component for the generic demo pages (index.html,
 * medical-diagnosis.html). Renders the real Super speed-dial FAB and mounts
 * production Preact modules (MDS Command Center, QM Board, 24-Hour Report,
 * AI Chat) as overlays driven by FAB clicks and cross-component events.
 */
import { useState, useEffect } from 'preact/hooks';
import { MDSCommandCenter } from '../../content/modules/mds-command-center/MDSCommandCenter.jsx';
import { PDPMAnalyzer } from '../../content/modules/pdpm-analyzer/PDPMAnalyzer.jsx';
import { QueryItemsPage } from '../../content/modules/query-items/QueryItemsPage.jsx';
import { QMBoard } from '../../content/modules/qm-board/QMBoard.jsx';
import { FtagBoard } from '../../content/modules/ftag-prevention/FtagBoard.jsx';
import { TwentyFourHourReport } from '../../content/modules/twenty-four-hour-report/TwentyFourHourReport.jsx';
import { FeedbackModal } from '../../content/modules/feedback/FeedbackModal.jsx';
import { CoveragePanel } from '../../content/modules/care-plan-coverage/CoveragePanel.jsx';
import { DemoChatOverlay } from './DemoChatOverlay.jsx';
import { SuperDemoFab } from './SuperDemoFab.jsx';
import { useRef } from 'preact/hooks';

const FACILITY_NAME = 'SUNNY MEADOWS DEMO FACILITY';
const ORG_SLUG = 'demo-org';

const LEGACY_FAB_SELECTORS = [
  '#super-menu-fab',
  '.super-menu-fab',
  '.super-chat-fab',
  '#super-chat-button',
  '#super-menu-panel',
  '.super-menu-panel',
  '#super-chat-panel',
  '.super-chat-panel',
];

export function DemoApp() {
  const [overlay, setOverlay] = useState(null);
  const [pdpmContext, setPdpmContext] = useState(null);
  const [queryContext, setQueryContext] = useState(null);
  const [restore24, setRestore24] = useState(null); // deep-link into the 24hr report (from the inbox)
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ── SuperToast surface (the inbox's "Switching to …" etc.) ──
  useEffect(() => {
    function handleToast(e) {
      const { type, message } = e.detail || {};
      setToast({ type: type || 'info', message: message || '' });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3000);
    }
    window.addEventListener('demo:toast', handleToast);
    return () => {
      window.removeEventListener('demo:toast', handleToast);
      clearTimeout(toastTimer.current);
    };
  }, []);

  // ── 24hr launcher shim — the inbox's "Open the report" drives this exactly
  //    like it drives the production launcher in fab.js. ──
  useEffect(() => {
    window.TwentyFourHourReportLauncher = {
      isOpen: () => false,
      open: ({ restore } = {}) => {
        setRestore24(restore || null);
        setOverlay('24hr');
      },
      close: () => {},
    };
    return () => { delete window.TwentyFourHourReportLauncher; };
  }, []);

  // ── Guided tour overlay openers (additive; consumed by demo/tour/tour-runner.jsx) ──
  useEffect(() => {
    window.__superDemoTour = {
      // DemoApp FAB overlays: 'commandCenter' | 'qm' | 'ftag' | '24hr' | 'chat' | 'feedback' | 'coverage'
      openOverlay: (name) => setOverlay(name),
      closeOverlay: () => setOverlay(null),
      // ICD-10 Viewer is the vanilla global mounted on medical-diagnosis.html.
      openIcd10: () => {
        if (window.ICD10Viewer && typeof window.ICD10Viewer.open === 'function') {
          window.ICD10Viewer.open();
        } else {
          console.warn('[tour] ICD10Viewer not available');
        }
      },
    };
    return () => { delete window.__superDemoTour; };
  }, []);

  // Hide the vanilla demo-super-menu.js FAB/panel so the real Preact FAB
  // doesn't fight it on the page.
  useEffect(() => {
    LEGACY_FAB_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.display = 'none';
      });
    });
  }, []);

  // PDPM launches from inside the MDS Command Center
  useEffect(() => {
    function handleOpenPdpm(e) {
      const opts = e.detail || {};
      setPdpmContext({
        scope: opts.scope || 'mds',
        assessmentId: opts.assessmentId || '4860265',
        patientId: opts.patientId,
        patientName: opts.patientName,
        facilityName: FACILITY_NAME,
      });
      setOverlay('pdpm');
    }
    window.addEventListener('demo:open-pdpm', handleOpenPdpm);
    return () => window.removeEventListener('demo:open-pdpm', handleOpenPdpm);
  }, []);

  // Query Items launches (e.g. from a "Query Items" CTA in Command Center)
  useEffect(() => {
    function handleOpenQueryItems(e) {
      const opts = e.detail || {};
      setQueryContext({
        patientId: opts.patientId || '2657226',
        patientName: opts.patientName || 'Doe, Jane',
        assessmentId: opts.assessmentId || '4860265',
      });
      setOverlay('queryItems');
    }
    window.addEventListener('demo:open-query-items', handleOpenQueryItems);
    return () => window.removeEventListener('demo:open-query-items', handleOpenQueryItems);
  }, []);

  // Vanilla demo-super-menu's "AI Chat" hook — still forwarded to our overlay.
  useEffect(() => {
    function handleOpenChat() { setOverlay('chat'); }
    window.addEventListener('demo:open-chat', handleOpenChat);
    return () => window.removeEventListener('demo:open-chat', handleOpenChat);
  }, []);

  function handleClose() {
    setOverlay(null);
    setPdpmContext(null);
    setQueryContext(null);
  }

  // Command Center dispatches { hide: true } when it wants to temporarily
  // duck under a secondary overlay (e.g. PDPM). Don't fully close in that case.
  function handleCommandCenterClose(opts) {
    if (opts?.hide) return;
    setOverlay(null);
  }

  return (
    <>
      {/* ── Overlays ── */}
      {overlay === 'commandCenter' && (
        <MDSCommandCenter
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleCommandCenterClose}
        />
      )}

      {overlay === 'qm' && (
        <QMBoard
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleClose}
        />
      )}

      {overlay === 'ftag' && (
        <FtagBoard
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleClose}
        />
      )}

      {overlay === '24hr' && (
        <TwentyFourHourReport
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          restore={restore24}
          onClose={() => { setRestore24(null); handleClose(); }}
        />
      )}

      {overlay === 'chat' && (
        <DemoChatOverlay
          patientId="2657226"
          onClose={handleClose}
        />
      )}

      {overlay === 'pdpm' && pdpmContext && (
        <div style={overlayWrapperStyle}>
          <div style={overlayHeaderStyle}>
            <span style={{ fontWeight: 600 }}>PDPM Analyzer</span>
            <button onClick={handleClose} style={closeButtonStyle}>&times;</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PDPMAnalyzer context={pdpmContext} onClose={handleClose} />
          </div>
        </div>
      )}

      {overlay === 'queryItems' && queryContext && (
        <div style={overlayWrapperStyle}>
          <div style={overlayHeaderStyle}>
            <span style={{ fontWeight: 600 }}>Query Items</span>
            <button onClick={handleClose} style={closeButtonStyle}>&times;</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <QueryItemsPage
              patientId={queryContext.patientId}
              patientName={queryContext.patientName}
              facilityName={FACILITY_NAME}
              orgSlug={ORG_SLUG}
              assessmentId={queryContext.assessmentId}
              onClose={handleClose}
              onBack={handleClose}
            />
          </div>
        </div>
      )}

      {overlay === 'feedback' && (
        <FeedbackModal onClose={handleClose} />
      )}

      {overlay === 'coverage' && (
        <div style={overlayWrapperStyle}>
          <div style={overlayHeaderStyle}>
            <span style={{ fontWeight: 600 }}>Care Plan Coverage</span>
            <button onClick={handleClose} style={closeButtonStyle}>&times;</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CoveragePanel
              patientId="2657226"
              patientName="Doe, Jane"
              facilityName={FACILITY_NAME}
              orgSlug={ORG_SLUG}
              onClose={handleClose}
            />
          </div>
        </div>
      )}

      {/* ── Real Super speed-dial FAB ── */}
      <SuperDemoFab
        onOpenMds={() => setOverlay('commandCenter')}
        onOpenQm={() => setOverlay('qm')}
        onOpenFtag={() => setOverlay('ftag')}
        onOpen24hr={() => { setRestore24(null); setOverlay('24hr'); }}
        onOpenChat={() => setOverlay('chat')}
        onOpenInbox={() => window.MdsTagInbox?.open()}
        onOpenFeedback={() => setOverlay('feedback')}
        onOpenCoverage={() => setOverlay('coverage')}
        showCoverage={true}
        showFtag={true}
      />

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: '96px', right: '24px', zIndex: 200000,
            padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            background: TOAST_COLORS[toast.type]?.bg || TOAST_COLORS.info.bg,
            color: TOAST_COLORS[toast.type]?.text || TOAST_COLORS.info.text,
            border: `1px solid ${TOAST_COLORS[toast.type]?.border || TOAST_COLORS.info.border}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '340px',
          }}
          onClick={() => setToast(null)}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

const TOAST_COLORS = {
  success: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
  error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
};

// Generic host for secondary overlays (PDPM, Query Items) that don't ship
// their own backdrop. QMBoard / TwentyFourHourReport / MDSCommandCenter all
// render their own overlay chrome.

const overlayWrapperStyle = {
  position: 'fixed',
  inset: '20px',
  zIndex: 100000,
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const overlayHeaderStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#f9fafb',
  flexShrink: 0,
};

const closeButtonStyle = {
  background: 'transparent',
  border: 'none',
  fontSize: '22px',
  cursor: 'pointer',
  color: '#6b7280',
  padding: '0 4px',
  lineHeight: 1,
};
