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
 *
 * Badge parity with fab.js updateMDSBadge(): the FAB fetches the notification
 * summary itself and paints the inbox count, the 24H unseen dot, and the
 * aggregate on the main "S" bubble. It registers window.updateMDSBadge so the
 * real inbox-panel/comment-thread modules can trigger a repaint after a post
 * or resolve, exactly as they do against the production FAB.
 */
import { useEffect, useState, useRef } from 'preact/hooks';

export function SuperDemoFab({
  onOpenMds,
  onOpenQm,
  onOpenFtag,
  onOpen24hr,
  onOpenChat,
  onOpenInbox,
  onOpenFeedback,
  onOpenCoverage,
  showCoverage = false,
  showFtag = false,
  mdsBadgeCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(null);
  const containerRef = useRef(null);

  // Live badge state, refreshed whenever a comment module announces a change.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const facilityName = window.SuperOverlay?.facilityName || 'SUNNY MEADOWS DEMO FACILITY';
      const orgSlug = window.getOrg?.()?.org || 'demo-org';
      const summary = await window.NotificationsAPI?.fetchSummary(facilityName, orgSlug);
      if (!cancelled && summary) setNotif(summary);
    };
    refresh();
    window.updateMDSBadge = refresh;
    // comment-thread.js announces every post/resolve on this channel.
    window.addEventListener('super:mds-thread-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('super:mds-thread-changed', refresh);
      if (window.updateMDSBadge === refresh) delete window.updateMDSBadge;
    };
  }, []);

  // Re-check on every dial open — opening the 24hr report marks it seen, and
  // the dot should be gone the next time the dial unfolds.
  useEffect(() => {
    if (open) window.updateMDSBadge?.();
  }, [open]);

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

  const inboxCount =
    (notif?.tagActionCount || 0) + (notif?.tagMentionCount || 0) + (notif?.tagUnreadCount || 0);
  const show24hrDot = !!notif?.report24hUnseen;
  const mainCount = mdsBadgeCount + inboxCount + (show24hrDot ? 1 : 0);

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

      {/* Ask Super (AI). A sparkle, not a speech bubble: the bubble belongs to
          the thing where a real person is on the other end. */}
      <button
        id="super-chat-action"
        type="button"
        class="super-dial__action super-dial__action--chat"
        aria-label="Ask Super"
        onClick={act(onOpenChat)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/>
          <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/>
        </svg>
      </button>

      {/* Inbox — MDS items somebody asked you about, plus 24hr findings you
          were mentioned on, across every building you can reach. */}
      <button
        id="super-inbox-action"
        type="button"
        class="super-dial__action super-dial__action--inbox"
        aria-label="Inbox"
        onClick={act(onOpenInbox)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {inboxCount > 0 && (
          <span class="super-dial__action-badge" id="super-inbox-badge">
            {inboxCount > 99 ? '99+' : inboxCount}
          </span>
        )}
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
        QM
      </button>

      {showFtag && (
        <button
          id="super-ftag-action"
          type="button"
          class="super-dial__action super-dial__action--ftag"
          aria-label="F-Tag Prevention"
          onClick={act(onOpenFtag)}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </button>
      )}

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
        {show24hrDot && <span class="super-dial__action-dot" id="super-24hr-dot" />}
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
        {mainCount > 0 && (
          <span class="super-bubble__badge" id="super-bubble-badge">
            {mainCount > 99 ? '99+' : mainCount}
          </span>
        )}
      </button>
    </div>
  );
}
