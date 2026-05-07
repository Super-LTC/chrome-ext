/**
 * PCCDemoApp — orchestrator for the captured PCC demo pages
 * (mds-section-i.html, mds-section-n.html, pcc-demo.html).
 *
 * Runs on top of a real captured PCC page. On mount it:
 *   1. Hides the legacy vanilla Super side-panel / modals / FAB
 *   2. Injects Super badges into every MDS question wrapper
 *   3. Wires badge clicks → real ItemPopover with evidence
 *   4. Renders the real Super speed-dial FAB with full QM + 24hr parity
 *   5. Handles PDPM Analyzer launches from Command Center
 *   6. Intercepts the page's QuerySendModal so Preact query flow works
 */
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { MDSCommandCenter } from '../../content/modules/mds-command-center/MDSCommandCenter.jsx';
import { PDPMAnalyzer } from '../../content/modules/pdpm-analyzer/PDPMAnalyzer.jsx';
import { ItemPopover } from '../../content/modules/mds-command-center/ItemPopover.jsx';
import { QMBoard } from '../../content/modules/qm-board/QMBoard.jsx';
import { TwentyFourHourReport } from '../../content/modules/twenty-four-hour-report/TwentyFourHourReport.jsx';
import { FeedbackModal } from '../../content/modules/feedback/FeedbackModal.jsx';
import { CoveragePanel } from '../../content/modules/care-plan-coverage/CoveragePanel.jsx';
import { DemoQueryModal } from './DemoQueryModal.jsx';
import { DemoChatOverlay } from './DemoChatOverlay.jsx';
import { SuperDemoFab } from './SuperDemoFab.jsx';

const FACILITY_NAME = 'SUNNY MEADOWS DEMO FACILITY';
const ORG_SLUG = 'demo-org';

// ── AI's verdict for each MDS Section I item ──
// AI_VERDICT[code] = 'Yes' | 'No' | 'review'
// The badge status (match/mismatch/review) is computed at injection time by
// comparing AI_VERDICT to the PCC-form selected answer, so red/green badges
// are always consistent with what's actually checked on the page.
//
// Items not listed here default to AI agreeing with PCC (always match).
const AI_VERDICT = {
  // Confirmed mismatches — AI found chart evidence that PCC missed
  I0200: 'Yes',  // Anemia — labs show low hemoglobin
  I0600: 'Yes',  // Heart Failure — echo + lasix
  I4200: 'Yes',  // MDRO — culture/sensitivity flag
  I5400: 'Yes',  // Alzheimer's — donepezil + dx note
  I5800: 'Yes',  // Anxiety — sertraline daily

  // Items needing clinician review (evidence ambiguous)
  I0900: 'review',  // PVD — partial evidence
  I4300: 'review',  // Diabetes w/ PVD — depends on I0900 confirmation
  I5500: 'review',  // MS — historical mention only
};

// ── Toast component ──

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const colors = {
    success: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
    error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
    warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  };
  const c = colors[toast.type] || colors.info;
  return (
    <div
      style={{
        position: 'fixed', bottom: '96px', right: '24px', zIndex: 200000,
        padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
        background: c.bg, color: c.text, border: `1px solid ${c.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '340px',
        animation: 'fadeInUp 0.2s ease',
      }}
      onClick={onDismiss}
    >
      {toast.message}
    </div>
  );
}

// ── Main component ──

export function PCCDemoApp() {
  const [overlay, setOverlay] = useState(null);
  const [popoverItem, setPopoverItem] = useState(null);
  const [pdpmContext, setPdpmContext] = useState(null);
  const [toast, setToast] = useState(null);
  const [queryData, setQueryData] = useState(null);
  const toastTimer = useRef(null);
  const injectedBadges = useRef([]);

  // ── Hide legacy vanilla Super elements on mount ──
  useEffect(() => {
    const selectors = [
      '#superPanel', '#superPopover', '#superModal',
      '.super-side-panel', '.super-popover-panel',
      '.super-modal-overlay', '#super-fab-old',
      '.super-fab', '.super-menu-fab', '#super-menu-fab',
      '#super-chat-button', '.super-chat-fab',
      '#super-chat-panel', '.super-chat-panel',
      '#super-menu-panel', '.super-menu-panel',
      '#notesModal',
      // NOTE: do NOT hide .super-modal here — the Preact FeedbackModal uses
      // that class. Vanilla legacy modals attached before mount have their
      // own ids (#superModal, #notesModal) which we hide above.
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });
  }, []);

  // ── Listen for badge click events (from injected vanilla badges) ──
  useEffect(() => {
    function handleBadgeClick(e) {
      const code = e.detail?.code;
      if (!code) return;
      setOverlay('itemPopover');
      setPopoverItem({
        mdsItem: code,
        categoryKey: code,
        itemName: getItemLabel(code),
      });
    }
    window.addEventListener('demo:badge-click', handleBadgeClick);
    return () => window.removeEventListener('demo:badge-click', handleBadgeClick);
  }, []);

  // ── Inject Super badges into real PCC question wrappers ──
  useEffect(() => {
    // Remove any existing badges injected by demo-mds-overlay.js
    document.querySelectorAll('.super-badge').forEach(b => b.remove());

    // Discover every MDS-I item present on the page and read its
    // currently-selected answer so badge color reflects reality.
    const wrappers = document.querySelectorAll('[id^="I"][id$="_wrapper"]');
    const badges = [];

    for (const wrapper of wrappers) {
      const code = wrapper.id.replace('_wrapper', '');
      const label = wrapper.querySelector('.question_label');
      if (!label) continue;
      if (label.querySelector('.super-badge')) continue;

      const pcc = readPccAnswer(wrapper);
      if (pcc === null) continue;  // skip items with no answer captured

      const aiVerdict = AI_VERDICT[code] || pcc;  // default: AI agrees with PCC
      let status, text;
      if (aiVerdict === 'review') {
        status = 'review';
        text = '! Super: Needs Review';
      } else if (aiVerdict === pcc) {
        status = 'match';
        text = `+ Super: ${aiVerdict}`;
      } else {
        status = 'mismatch';
        text = `X Super: ${aiVerdict}`;
      }

      const badge = document.createElement('span');
      badge.className = `super-badge super-badge--${status}`;
      badge.textContent = text;
      badge.setAttribute('data-mds-item', code);
      const def = { status };
      badge.style.cssText = `
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 8px; border-radius: 4px; font-size: 11px;
        font-weight: 600; cursor: pointer; margin-left: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        vertical-align: middle;
      `;

      if (def.status === 'match') {
        badge.style.background = '#dcfce7';
        badge.style.color = '#166534';
        badge.style.border = '1px solid #86efac';
      } else if (def.status === 'mismatch') {
        badge.style.background = '#fee2e2';
        badge.style.color = '#991b1b';
        badge.style.border = '1px solid #fca5a5';
      } else if (def.status === 'review') {
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.style.border = '1px solid #fcd34d';
      }

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('demo:badge-click', { detail: { code } }));
      });

      badge.addEventListener('mouseenter', () => {
        badge.style.transform = 'translateY(-1px)';
        badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
      });
      badge.addEventListener('mouseleave', () => {
        badge.style.transform = '';
        badge.style.boxShadow = '';
      });

      const bTag = label.querySelector(':scope > b');
      if (bTag) {
        bTag.appendChild(badge);
      } else {
        label.appendChild(badge);
      }

      badges.push(badge);
    }

    injectedBadges.current = badges;
    console.log(`[PCCDemoApp] Injected ${badges.length} Super badges into PCC form`);

    return () => {
      badges.forEach(b => b.remove());
    };
  }, []);

  // ── Listen for PDPM open events from Command Center ──
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

  // ── Toast listener ──
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

  // ── Override QuerySendModal to open Preact modal ──
  useEffect(() => {
    window.QuerySendModal = {
      show(opts) {
        if (opts && !opts.aiAnswer && (opts.keyFindings || opts.evidence || opts.rationale || opts.status)) {
          opts = { mdsItem: opts.mdsItem, description: opts.description, aiAnswer: opts };
        }
        setQueryData(opts);
      },
    };
  }, []);

  // ── Handlers ──

  const handleClose = useCallback(() => {
    setOverlay(null);
    setPopoverItem(null);
    setPdpmContext(null);
  }, []);

  const handleCommandCenterClose = useCallback((opts) => {
    if (opts?.hide) return;
    setOverlay(null);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setOverlay(null);
    setPopoverItem(null);
  }, []);

  return (
    <>
      {/* ── MDS Command Center ── */}
      {overlay === 'commandCenter' && (
        <MDSCommandCenter
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleCommandCenterClose}
        />
      )}

      {/* ── QM Board ── */}
      {overlay === 'qm' && (
        <QMBoard
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleClose}
        />
      )}

      {/* ── 24-Hour Report ── */}
      {overlay === '24hr' && (
        <TwentyFourHourReport
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          onClose={handleClose}
        />
      )}

      {/* ── AI Chat ── */}
      {overlay === 'chat' && (
        <DemoChatOverlay
          patientId="2657226"
          onClose={handleClose}
        />
      )}

      {/* ── PDPM Analyzer (launched from Command Center) ── */}
      {overlay === 'pdpm' && pdpmContext && (
        <div style={pdpmWrapperStyle}>
          <div style={pdpmHeaderStyle}>
            <span style={{ fontWeight: 600 }}>PDPM Analyzer</span>
            <button onClick={handleClose} style={closeButtonStyle}>&times;</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <PDPMAnalyzer context={pdpmContext} onClose={handleClose} />
          </div>
        </div>
      )}

      {/* ── Item Popover (badge clicks) ── */}
      {overlay === 'itemPopover' && popoverItem && (
        <ItemPopover
          item={popoverItem}
          context={{ assessmentId: '4860265' }}
          onClose={handlePopoverClose}
        />
      )}

      {/* ── Feedback Modal ── */}
      {overlay === 'feedback' && (
        <FeedbackModal onClose={handleClose} />
      )}

      {/* ── Care Plan Coverage ── */}
      {overlay === 'coverage' && (
        <div style={pdpmWrapperStyle}>
          <div style={pdpmHeaderStyle}>
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
        onOpen24hr={() => setOverlay('24hr')}
        onOpenChat={() => setOverlay('chat')}
        onOpenFeedback={() => setOverlay('feedback')}
        onOpenCoverage={() => setOverlay('coverage')}
        showCoverage={true}
      />

      {/* ── Query Modal ── */}
      {queryData && (
        <DemoQueryModal
          queryData={queryData}
          onClose={() => setQueryData(null)}
        />
      )}

      {/* ── Toast ── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

// ── Read the currently-selected PCC answer for a question wrapper.
// Returns 'Yes' | 'No' | null. Handles both the radio-input pattern and the
// styled-button "selected" pattern PCC uses for locked responses.
function readPccAnswer(wrapper) {
  const checked = wrapper.querySelector('input[type=radio]:checked, input[type=checkbox]:checked');
  if (checked) {
    const txt = (checked.parentElement?.textContent || checked.value || '').trim();
    if (/^yes/i.test(txt)) return 'Yes';
    if (/^no/i.test(txt)) return 'No';
  }
  // Locked-response styled buttons: PCC marks the active one with a class
  // like "selected" or applies an aria-pressed/checked attribute.
  const active = wrapper.querySelector(
    '.selected, [class*="selected"], [aria-pressed="true"], [aria-checked="true"]'
  );
  if (active) {
    const txt = (active.textContent || '').trim();
    if (/^yes/i.test(txt)) return 'Yes';
    if (/^no/i.test(txt)) return 'No';
  }
  return null;
}

// ── Item label map ──

function getItemLabel(code) {
  const labels = {
    I0100: 'Cancer',
    I0200: 'Anemia',
    I0300: 'Atrial Fibrillation / Dysrhythmias',
    I0400: 'Coronary Artery Disease (CAD)',
    I0500: 'Deep Venous Thrombosis (DVT)',
    I0600: 'Heart Failure',
    I0700: 'Hypertension (HTN)',
    I0800: 'Orthostatic Hypotension',
    I0900: 'Peripheral Vascular Disease (PVD)',
    I1100: 'Cirrhosis',
    I1200: 'GERD',
    I2000: 'Diabetes Mellitus (DM)',
    I2100: 'Thyroid Disorder',
    I2300: 'Anemia',
    I2900: 'Drug/Medication Induced Depression',
    I4200: 'Multi-Drug Resistant Organism (MDRO)',
    I4300: 'Diabetes with PVD',
    I4400: 'Pneumonia',
    I4500: 'Septicemia',
    I4900: 'Schizophrenia',
    I5100: 'Hemiplegia / Hemiparesis',
    I5200: 'Paraplegia',
    I5250: 'Quadriplegia',
    I5300: 'Aphasia',
    I5350: 'Non-Alzheimer Dementia',
    I5400: 'Alzheimer Disease',
    I5500: 'Multi-Sclerosis',
    I5600: 'Malnutrition',
    I5700: 'Schizophrenia',
    I5800: 'Anxiety Disorder',
    I5900: 'PTSD',
    I5950: 'Psychotic Disorder',
    I6000: 'Asthma / COPD / CLD',
    I6100: 'Respiratory Failure',
    I6200: 'None of the Above',
    I6300: 'None of the Above',
    I6500: 'Seizure / Epilepsy',
    I7900: 'None of the Above',
    I8000: 'Additional Diagnoses',
  };
  return labels[code] || `MDS Item ${code}`;
}

// ── Styles ──

const pdpmWrapperStyle = {
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

const pdpmHeaderStyle = {
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
