/**
 * SuperDemoFab — renders the real Super speed-dial FAB into the demo DOM.
 *
 * The markup + class names match content/super-menu/fab.js exactly so the
 * styles in panel.css (.super-bubble__main, .super-dial__action--mds/qm/chat,
 * etc.) and 24hr-report.css (.super-dial__action--24hr) apply unchanged.
 *
 * Used by both DemoApp (medical-diagnosis.html, index.html) and PCCDemoApp
 * (mds-section-i.html, mds-section-n.html, pcc-demo.html). The parent wires
 * each action to its own overlay via callbacks.
 */
import { useEffect, useState, useRef } from 'preact/hooks';

export function SuperDemoFab({
  onOpenMds,
  onOpenQm,
  onOpen24hr,
  onOpenChat,
  onOpenFeedback,
  onOpenCoverage,
  showCoverage = false,
  mdsBadgeCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click, like the real FAB does.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [open]);

  // Prevent an action-button click from bubbling up and closing the dial
  // before the overlay opens. Also close the dial immediately.
  const act = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    fn?.();
  };

  return (
    <div
      id="super-bubbles-container"
      ref={containerRef}
      class={open ? 'super-dial--open' : ''}
    >
      <button
        id="super-feedback-action"
        type="button"
        class="super-dial__action super-dial__action--feedback"
        aria-label="Send Feedback"
        onClick={act(onOpenFeedback)}
      >
        ?
      </button>

      <button
        id="super-chat-action"
        type="button"
        class="super-dial__action super-dial__action--chat"
        aria-label="Open Chat"
        onClick={act(onOpenChat)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button
        id="super-mds-action"
        type="button"
        class="super-dial__action super-dial__action--mds"
        aria-label="Open Dashboard"
        onClick={act(onOpenMds)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        {mdsBadgeCount > 0 && (
          <span class="super-dial__action-badge">{mdsBadgeCount > 99 ? '99+' : mdsBadgeCount}</span>
        )}
      </button>

      <button
        id="super-qm-action"
        type="button"
        class="super-dial__action super-dial__action--qm"
        aria-label="QM Board"
        onClick={act(onOpenQm)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </button>

      {showCoverage && (
        <button
          id="super-coverage-action"
          type="button"
          class="super-dial__action super-dial__action--coverage"
          aria-label="Care Plan Coverage"
          onClick={act(onOpenCoverage)}
        >
          CP
        </button>
      )}

      <button
        id="super-24hr-action"
        type="button"
        class="super-dial__action super-dial__action--24hr"
        aria-label="24-Hour Report"
        onClick={act(onOpen24hr)}
      >
        24H
      </button>

      <button
        id="super-bubble-main"
        type="button"
        class="super-bubble__main"
        aria-label="Super"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        S
      </button>
    </div>
  );
}
