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
import { CarePlanStampModal } from '../../content/modules/care-plan-stamp/CarePlanStampModal.jsx';
import { DemoQueryModal } from './DemoQueryModal.jsx';
import { DemoChatOverlay } from './DemoChatOverlay.jsx';
import { SuperDemoFab } from './SuperDemoFab.jsx';
import { isCarePlanDemoPage } from '../demo-care-plan-wire.js';
// Section I badges are driven by the SAME fixtures the popover reads, scored by
// the SAME logic the live overlay uses — so a badge and its evidence panel can
// never disagree about "code it" vs "don't code".
import { SECTION_I_DETAIL, sectionIAiAnswer } from '../demo-section-i-fixtures.js';
import { determineStatus, formatAnswerForDisplay } from '../../content/super-menu/mds-badge.js';

const FACILITY_NAME = 'SUNNY MEADOWS DEMO FACILITY';
const ORG_SLUG = 'demo-org';
const DEMO_PATIENT_ID = '2657226';
const DEMO_PATIENT_NAME = 'Doe, Jane';

const isCarePlanDetailPage = isCarePlanDemoPage;

function scrapeCarePlanPatientName() {
  const txt = document.body?.innerText || '';
  const m = txt.match(/Resident:\s*([^\n(]+)/);
  return m ? m[1].replace(/DO NOT USE/i, '').trim() : DEMO_PATIENT_NAME;
}

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
  const [carePlanModal, setCarePlanModal] = useState(null); // { defaultMode: 'initial' | 'comprehensive' }
  const toastTimer = useRef(null);
  const injectedBadges = useRef([]);
  // Keeps the latest resolveBadge available to the (mount-only) tour hook below.
  const resolveBadgeRef = useRef(null);

  // ── Guided tour overlay openers (additive; consumed by demo/tour/tour-runner.jsx) ──
  useEffect(() => {
    window.__superDemoTour = {
      openOverlay: (name) => setOverlay(name),       // 'commandCenter' | 'qm' | '24hr' | 'coverage' | 'feedback' | 'chat'
      closeOverlay: () => { setOverlay(null); setPopoverItem(null); },
      openPopover: (code) => window.dispatchEvent(new CustomEvent('demo:badge-click', { detail: { code } })),
      // Guided tour (Chapter 3): mark a Section I badge resolved once the
      // physician signs the query back. Mirrors the Agree/Disagree path.
      resolveBadge: (code, decision = 'agree') => resolveBadgeRef.current?.(code, decision),
    };
    return () => { delete window.__superDemoTour; };
  }, []);

  // ── Care plan modal opener (registered for sync click wire in demo-care-plan-wire.js) ──
  useEffect(() => {
    window.__demoRegisterCarePlanOpener?.((opts) => {
      setCarePlanModal(opts || { defaultMode: 'comprehensive' });
    });
    return () => {
      window.__demoCarePlanOpener = null;
    };
  }, []);

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
      // Captured care plan HTML ships with the baked-in vanilla FAB markup
      // — hide it so only the Preact <SuperDemoFab> shows.
      '#super-bubbles-container',
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
        itemName: SECTION_I_DETAIL[code]?.item?.itemName || code,
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

    // ── Icon + answer markup mirrors the live overlay's injectBadge() exactly. ──
    const ICONS = { match: '✓', mismatch: '✗', review: '⚠', info: 'ℹ' };

    for (const wrapper of wrappers) {
      const code = wrapper.id.replace('_wrapper', '');
      const label = wrapper.querySelector('.question_label');
      if (!label) continue;
      if (label.querySelector('.super-badge')) continue;

      // Only badge items Super actually analyzed — same as production, where the
      // backend returns results for a subset of items, not every question.
      const aiAnswer = sectionIAiAnswer(code);
      if (!aiAnswer) continue;

      const pcc = readPccAnswer(wrapper);  // 'Yes' | 'No' | null
      // Shared logic: identical to content/mds-overlay.js determineStatus().
      const status = determineStatus(aiAnswer, pcc);
      const answerText = formatAnswerForDisplay(aiAnswer.answer);

      const badge = document.createElement('span');
      badge.className = `super-badge super-badge--${status}`;
      badge.setAttribute('data-mds-item', code);
      badge.innerHTML = `<span class="super-badge__icon">${ICONS[status] || ''}</span> Super: ${answerText}`;

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('demo:badge-click', { detail: { code } }));
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

  // ── Inject the Care Plan Audit banner above the action row, demo-only. ──
  //
  // Real prod path (audit-banner.js) gates on careplandetail_rev.jsp in the
  // URL, which the demo page won't match. We replicate the banner here against
  // the same anchor (#idNewCustomFocusBtn) so the captured care plan page
  // shows the audit CTA exactly like prod.
  useEffect(() => {
    if (!isCarePlanDetailPage()) return;

    let cancelled = false;
    let banner, cta, dismiss;
    const openAudit = () => setCarePlanModal({ defaultMode: 'comprehensive' });
    const inject = () => {
      if (cancelled) return;
      const anchor = document.getElementById('idNewCustomFocusBtn');
      if (!anchor) return;
      const actionRow = anchor.closest('tr, div');
      if (!actionRow?.parentNode) return;
      // Yank any banner the installed extension already injected — the demo
      // banner has to win or its Review button won't open the demo modal.
      document.querySelectorAll('#super-audit-banner, .super-audit-banner').forEach((el) => el.remove());

      banner = document.createElement('div');
      banner.id = 'super-audit-banner';
      banner.className = 'super-audit-banner is-actionable';
      // Use HTML entities (&middot;, &rarr;, &times;) — the captured PCC page
      // declares charset=windows-1252, which can mangle inline non-ASCII bytes.
      banner.innerHTML =
        '<span class="super-audit-banner__icon">🔍</span>' +
        '<span class="super-audit-banner__text">SuperLTC Audit &middot; <strong>5</strong> to add &middot; <strong>2</strong> to remove &middot; <strong>3</strong> to verify</span>' +
        '<button type="button" class="super-audit-banner__cta">Review &rarr;</button>' +
        '<button type="button" class="super-audit-banner__dismiss" aria-label="Dismiss">&times;</button>';
      actionRow.parentNode.insertBefore(banner, actionRow);

      cta = banner.querySelector('.super-audit-banner__cta');
      dismiss = banner.querySelector('.super-audit-banner__dismiss');
      cta.addEventListener('click', openAudit);
      dismiss.addEventListener('click', () => banner.remove());
    };
    inject();
    // Re-inject once more after a short delay so we beat the prod extension's
    // polling injector that fires up to 10 retries over ~2.5s.
    const tid = setTimeout(inject, 800);

    return () => {
      cancelled = true;
      clearTimeout(tid);
      cta?.removeEventListener('click', openAudit);
      banner?.remove();
    };
  }, []);

  // ── Inject AI Care Plan buttons if the captured page doesn't have them. ──
  // Clicks are handled synchronously by demo-care-plan-wire.js (capture phase).
  useEffect(() => {
    if (!isCarePlanDetailPage()) return;

    const BTN_ID_PREFIX = 'super-cpas-btn-';
    const STYLE = `
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      border: 1px solid #4338ca;
      font-weight: 600;
      margin-left: 6px;
      cursor: pointer;
    `;

    const inject = () => {
      document.querySelectorAll('[id="idNewCustomFocusBtn"]').forEach((target, i) => {
        const btnId = `${BTN_ID_PREFIX}${i}`;
        if (document.getElementById(btnId)) return;
        const btn = document.createElement('input');
        btn.type = 'button';
        btn.className = 'pccButton';
        btn.id = btnId;
        btn.value = '✨ AI Care Plan';
        btn.title = 'AI-assisted care plan: auto-populate for new admits, audit + review for established plans';
        btn.style.cssText = STYLE;
        btn.setAttribute('data-track', 'care_plan_autopop_button_clicked');
        target.parentNode.insertBefore(btn, target.nextSibling);
      });
    };

    inject();
    let tries = 0;
    const tid = setInterval(() => {
      tries += 1;
      inject();
      if (tries >= 10) clearInterval(tid);
    }, 250);
    return () => clearInterval(tid);
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
    setCarePlanModal(null);
  }, []);

  const handleCommandCenterClose = useCallback((opts) => {
    if (opts?.hide) return;
    setOverlay(null);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setOverlay(null);
    setPopoverItem(null);
  }, []);

  // ── Agree / Disagree on a Section I item ──
  // Mirrors the live overlay: a decision marks the badge "dismissed" (agree →
  // struck-through match, disagree → struck-through "Dismissed" with the note
  // cue) and shows a confirmation toast. The captured page is static, so unlike
  // production we don't click the PCC answer link — the visual resolution is
  // what the demo needs to convey.
  const resolveBadge = useCallback((code, decision, note) => {
    const badge = document.querySelector(`.super-badge[data-mds-item="${code}"]`);
    if (!badge) return;
    const ai = sectionIAiAnswer(code);
    const answerText = ai ? formatAnswerForDisplay(ai.answer) : '';
    if (decision === 'agree') {
      badge.className = 'super-badge super-badge--match super-badge--dismissed';
      badge.innerHTML = `<span class="super-badge__icon">✓</span> Super: ${answerText}`;
    } else {
      badge.className = 'super-badge super-badge--mismatch super-badge--dismissed super-badge--disagreed';
      const hasNote = !!(note && note.trim());
      badge.innerHTML = `<span class="super-badge__icon">✗</span> Dismissed${hasNote ? ' <span class="super-badge__note-cue" aria-hidden="true">💬</span>' : ''}`;
      if (hasNote) badge.title = note.trim();
    }
  }, []);

  resolveBadgeRef.current = resolveBadge;

  const handleItemAgree = useCallback((data) => {
    const code = data?.item?.mdsItem || popoverItem?.mdsItem;
    const name = SECTION_I_DETAIL[code]?.item?.itemName || code;
    resolveBadge(code, 'agree');
    window.dispatchEvent(new CustomEvent('demo:toast', { detail: { type: 'success', message: `Agreed — ${name} marked resolved` } }));
    handlePopoverClose();
  }, [popoverItem, resolveBadge, handlePopoverClose]);

  const handleItemDismiss = useCallback((data, reason) => {
    const code = data?.item?.mdsItem || popoverItem?.mdsItem;
    const name = SECTION_I_DETAIL[code]?.item?.itemName || code;
    resolveBadge(code, 'disagree', reason);
    window.dispatchEvent(new CustomEvent('demo:toast', { detail: { type: 'info', message: `Dismissed — feedback recorded for ${name}` } }));
    handlePopoverClose();
  }, [popoverItem, resolveBadge, handlePopoverClose]);

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
          onAgree={handleItemAgree}
          onDismiss={handleItemDismiss}
        />
      )}

      {/* ── Feedback Modal ── */}
      {overlay === 'feedback' && (
        <FeedbackModal onClose={handleClose} />
      )}

      {/* ── Care Plan wizard (Initial Auto-Pop + Comprehensive Audit) ── */}
      {carePlanModal && (
        <CarePlanStampModal
          patientId={DEMO_PATIENT_ID}
          patientName={scrapeCarePlanPatientName()}
          facilityName={FACILITY_NAME}
          orgSlug={ORG_SLUG}
          defaultMode={carePlanModal.defaultMode}
          onClose={() => setCarePlanModal(null)}
        />
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
