/**
 * The cross-facility inbox — "what am I on the hook for?"
 *
 * Two surfaces: MDS items and 24-hour report findings. UB-04 mentions stay on
 * the web, because a row you cannot act on from inside PCC is a dead end.
 *
 * Its own launcher, deliberately NOT a tab inside the MDS Command Center: that
 * tab strip marks its contents seen on enter, which would quietly clear tags a
 * regional had not read yet.
 *
 * ── Three groups, in this order ───────────────────────────────────────────
 *   Asked of you  — an unresolved assignment. MDS only; the 24-hour schema has
 *                   no assignment axis at all. No dismiss affordance here — the
 *                   only way out is to answer, which is the whole feature.
 *   Mentioned you — a live mention. Worth surfacing, but nobody owes anything.
 *   Following     — threads you are in. Unread ones carry a dot.
 *
 * Styling follows `.thr__thread-*` in the 24-hour report — initial avatars,
 * Tailwind GRAY (not slate), 22px circles — so a conversation looks the same
 * wherever the extension shows one.
 */
import { isAlreadyAtFacility, switchToFacility } from './facility-switch.js';
import {
  clearRestore,
  sectionCodeForItem,
  sectionUrlFor,
  writeRestore,
} from './tag-restore.js';

const MdsTagInbox = {
  _el: null,
  _esc: null,
  _rows: [],
  _loading: false,

  isOpen() {
    return !!this._el;
  },

  async open() {
    if (this._el) return;
    this._mount();
    this._loading = true;
    this._render();
    await this.refresh();
  },

  close() {
    if (this._esc) {
      document.removeEventListener('keydown', this._esc);
      this._esc = null;
    }
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  },

  async refresh() {
    this._rows = await window.MdsCommentsAPI.fetchInbox();
    this._loading = false;
    if (!this._el) return;
    this._render();

    window.SuperAnalytics?.track('mds_inbox_opened', {
      open_count: this._rows.filter((r) => r.awaitingMe).length,
      unread_count: this._rows.filter((r) => r.unread).length,
    });
    // Opening the inbox is not reading the threads inside it, so the unread
    // side of the badge is left alone here — it clears thread by thread.
    window.updateMDSBadge?.();
  },

  _mount() {
    const overlay = document.createElement('div');
    overlay.className = 'mti__overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    const panel = document.createElement('div');
    panel.className = 'mti__panel';
    panel.addEventListener('click', (e) => e.stopPropagation());
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._el = overlay;

    this._esc = (e) => {
      // The thread panel sits above this one; let it take Escape first.
      if (e.key === 'Escape' && !window.MdsCommentThread?.isOpen()) this.close();
    };
    document.addEventListener('keydown', this._esc);
  },

  _panel() {
    return this._el?.querySelector('.mti__panel');
  },

  _render() {
    const p = this._panel();
    if (!p) return;

    const asked = this._rows.filter((r) => r.awaitingMe);
    const mentioned = this._rows.filter((r) => !r.awaitingMe && r.mentionsMe);
    const following = this._rows.filter((r) => !r.awaitingMe && !r.mentionsMe);

    p.innerHTML = `
      <header class="mti__header">
        <div>
          <span class="mti__title">Inbox</span>
          <span class="mti__subtitle">Conversations across your buildings</span>
        </div>
        <!-- NO_TRACK: mds_comment_panel_closed means the THREAD panel; reusing it here would inflate it. -->
        <button class="mti__close" aria-label="Close">&times;</button>
      </header>
      <div class="mti__body">
        ${this._loading ? '<p class="mti__muted">Loading…</p>' : ''}
        ${!this._loading && this._rows.length === 0 ? emptyStateHtml() : ''}
        ${asked.length ? groupHtml('Asked of you', asked) : ''}
        ${mentioned.length ? groupHtml('Mentioned you', mentioned) : ''}
        ${following.length ? groupHtml('Following', following) : ''}
      </div>
    `;

    p.querySelector('.mti__close')?.addEventListener('click', () => this.close());

    p.querySelectorAll('[data-thread]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-open]')) return;
        this._openRow(el.dataset.thread);
      });
      // The row claims role="button"; without this it is only pretending.
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this._openRow(el.dataset.thread);
      });
    });

    p.querySelectorAll('[data-open]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openInPcc(btn.dataset.open);
      })
    );
  },

  _rowByKey(threadKey) {
    return this._rows.find((r) => r.threadKey === threadKey) || null;
  },

  /**
   * Clicking a row.
   *
   * An MDS thread opens inline — the panel above this one is its natural home.
   * A 24-hour finding does not: its conversation lives inside the report, next
   * to the sources and the sign-off, and rebuilding that here would be a second
   * implementation of a screen that already exists.
   */
  async _openRow(threadKey) {
    const row = this._rowByKey(threadKey);
    if (!row) return;

    if (row.source === 'report_finding') {
      this._openInPcc(threadKey);
      return;
    }

    window.SuperAnalytics?.track('mds_inbox_thread_opened', {
      mds_item: row.mdsItem,
      awaiting_me: row.awaitingMe,
      same_facility: isAlreadyAtFacility(row.pccFacilityName || row.facilityName),
    });
    await window.MdsCommentThread?.openForRow(row, {
      onChange: () => this.refresh(),
      onOpenInPcc: () => this._openInPcc(threadKey),
    });
    // Opening it read it — reflect that without a round-trip.
    row.unread = false;
    this._render();
  },

  /**
   * Take the user to the thing itself, switching buildings if that is what it
   * takes. Always an explicit click; never something that happens to somebody.
   */
  async _openInPcc(threadKey) {
    const row = this._rowByKey(threadKey);
    if (!row) return;

    const targetFacility = row.pccFacilityName || row.facilityName;
    const sameFacility = isAlreadyAtFacility(targetFacility);

    const payload =
      row.source === 'report_finding'
        ? {
            source: 'report_finding',
            reportId: row.reportId,
            findingId: row.findingId,
            reportDateLocal: row.reportDateLocal,
            facilityName: row.facilityName,
            pccFacilityName: targetFacility,
          }
        : {
            source: 'mds_item',
            assessmentId: row.assessmentId,
            externalAssessmentId: row.externalAssessmentId,
            mdsItem: row.mdsItem,
            mdsColumn: row.mdsColumn,
            sectionCode: sectionCodeForItem(row.mdsItem),
            facilityName: row.facilityName,
            pccFacilityName: targetFacility,
          };

    window.SuperAnalytics?.track('mds_inbox_pcc_jump', {
      mds_item: row.mdsItem || row.source,
      same_facility: sameFacility,
    });

    if (sameFacility) {
      if (row.source === 'report_finding') {
        // The launcher is a no-op while a panel is already open, so re-point it
        // rather than silently doing nothing.
        window.TwentyFourHourReportLauncher?.close();
        window.TwentyFourHourReportLauncher?.open({
          restore: build24hrRestore(payload),
        });
        this.close();
        return;
      }
      writeRestore({ ...payload, stage: 'section' });
      window.location.href = sectionUrlFor(payload);
      return;
    }

    if (row.source === 'mds_item' && !row.externalAssessmentId) {
      window.SuperToast?.error('We do not have PCC’s id for that assessment yet.');
      window.SuperAnalytics?.track('mds_inbox_pcc_jump_failed', { reason: 'no_external_id' });
      return;
    }

    // Written BEFORE the click: PCC navigates as soon as its own handler runs,
    // so nothing after that point in this page's life is guaranteed to happen.
    writeRestore({ ...payload, stage: 'switch' });
    window.SuperToast?.info(`Switching to ${row.facilityName || targetFacility}…`);

    const result = await switchToFacility({
      pccFacilityName: targetFacility,
      pccSystemId: row.pccSystemId,
    });
    if (!result.ok) {
      clearRestore();
      window.SuperAnalytics?.track('mds_inbox_pcc_jump_failed', { reason: result.reason });
      window.SuperToast?.error(
        result.reason === 'facility_not_in_chooser'
          ? `${row.facilityName || targetFacility} is not in your PCC facility list.`
          : 'Could not open the PCC facility menu. Switch buildings manually and try again.'
      );
    }
  },
};

/** The 24-hour panel's own restore contract — version 1, 30-minute TTL. */
export function build24hrRestore(payload) {
  return {
    version: 1,
    facilityName: payload.pccFacilityName,
    orgSlug: window.getOrg?.()?.org || '',
    date: payload.reportDateLocal,
    findingId: payload.findingId,
    scrollTop: 0,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
}

function emptyStateHtml() {
  return `
    <div class="mti__empty">
      <p class="mti__empty-title">Nothing waiting on you</p>
      <p class="mti__muted">
        When someone asks about an MDS item or tags you on a 24-hour report finding,
        it lands here — from any building you have access to.
      </p>
    </div>
  `;
}

function groupHtml(title, rows) {
  return `
    <section class="mti__group">
      <h3 class="mti__group-title">${esc(title)} <span class="mti__count">${rows.length}</span></h3>
      <ol class="mti__list">${rows.map(rowHtml).join('')}</ol>
    </section>
  `;
}

// Matches the FAB's own launcher glyphs, so the pill and the button a user
// would press to get there say the same word.
const SOURCE_LABEL = {
  mds_item: 'MDS',
  report_finding: '24H',
};

function rowHtml(r) {
  const here = isAlreadyAtFacility(r.pccFacilityName || r.facilityName);
  // The preview names the author of the message being previewed, always. Using
  // the asker's name here reads as "Dana asked <somebody else's words>" the
  // moment anyone replies.
  const who = r.lastMessage.authorName || 'Someone';
  // Who asked is a fact about the thread, not about this message. Redundant on
  // a one-message thread, where the preview already IS the ask.
  const showAsker = r.awaitingMe && r.askedByName && r.messageCount > 1;
  const openLabel =
    r.source === 'report_finding'
      ? here
        ? 'Open the report'
        : 'Open in PCC'
      : here
        ? 'Open the MDS'
        : 'Open in PCC';

  // A list is for choosing what to open, not for reading. One quiet line of
  // "who: what", clipped — the avatars and the wrapped message body that were
  // here before turned four rows into a wall.
  const meta = [
    r.patientLabel,
    showAsker ? `${r.askedByName} asked` : null,
    relativeTime(r.lastMessage.createdAt),
    r.messageCount > 1 ? `${r.messageCount} messages` : null,
  ].filter(Boolean);

  return `
    <li class="mti__row" data-thread="${esc(r.threadKey)}" role="button" tabindex="0">
      <div class="mti__row-head">
        <span class="mti__source mti__source--${esc(r.source)}">${esc(SOURCE_LABEL[r.source] || r.source)}</span>
        <span class="mti__item">${esc(r.itemLabel)}</span>
        ${r.unread ? '<span class="mti__dot" aria-label="Unread"></span>' : ''}
      </div>
      <p class="mti__preview"><span class="mti__who">${esc(who)}:</span> ${esc(r.lastMessage.message)}</p>
      <div class="mti__row-foot">
        <span class="mti__meta">${esc(meta.join(' · '))}</span>
        ${r.facilityName && !here ? `<span class="mti__facility">${esc(r.facilityName)}</span>` : ''}
        <!-- NO_TRACK: _openInPcc fires mds_inbox_pcc_jump itself, with properties. -->
        <button class="mti__open" data-open="${esc(r.threadKey)}">${esc(openLabel)}</button>
      </div>
    </li>
  `;
}

function relativeTime(iso) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** PCC's DOM is the host page — everything user-supplied is escaped on the way in. */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

window.MdsTagInbox = MdsTagInbox;

export { MdsTagInbox };
