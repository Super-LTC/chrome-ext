/**
 * The cross-facility inbox — "what am I on the hook for?"
 *
 * Its own launcher on the FAB, deliberately NOT a tab inside the MDS Command
 * Center: that tab strip marks its contents seen on enter, which would quietly
 * clear tags a regional had not read yet.
 *
 * Two groups, in this order, because the list is read for obligations before it
 * is read for news:
 *   Asked of you  — an unresolved assignment. No dismiss affordance; the only
 *                   way out is to answer, which is the whole feature.
 *   Following     — threads you are in. Unread ones carry a dot.
 *
 * Vanilla, matching `comment-thread.js`. Geometry mirrors `.thr__panel` so the
 * 24-hour report and this feel like one product.
 */
import {
  isAlreadyAtFacility,
  switchToFacility,
} from './facility-switch.js';
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

    const open = this._rows.filter((r) => r.awaitingMe).length;
    const unread = this._rows.filter((r) => r.unread).length;
    window.SuperAnalytics?.track('mds_inbox_opened', {
      open_count: open,
      unread_count: unread,
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
    const following = this._rows.filter((r) => !r.awaitingMe);

    p.innerHTML = `
      <header class="mti__header">
        <div>
          <span class="mti__title">Inbox</span>
          <span class="mti__subtitle">Conversations on MDS items, across your buildings</span>
        </div>
        <!-- NO_TRACK: mds_comment_panel_closed means the THREAD panel; reusing it here would inflate it. -->
        <button class="mti__close" aria-label="Close">&times;</button>
      </header>
      <div class="mti__body">
        ${this._loading ? '<p class="mti__muted">Loading…</p>' : ''}
        ${!this._loading && this._rows.length === 0 ? emptyStateHtml() : ''}
        ${asked.length ? sectionHtml('Asked of you', asked) : ''}
        ${following.length ? sectionHtml('Following', following) : ''}
      </div>
    `;

    p.querySelector('.mti__close')?.addEventListener('click', () => this.close());

    p.querySelectorAll('[data-thread]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-pcc]')) return;
        this._openThread(el.dataset.thread);
      });
      // The row claims role="button"; without this it is only pretending.
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this._openThread(el.dataset.thread);
      });
    });

    p.querySelectorAll('[data-pcc]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openInPcc(btn.dataset.pcc);
      })
    );
  },

  _rowByKey(threadKey) {
    return this._rows.find((r) => r.threadKey === threadKey) || null;
  },

  async _openThread(threadKey) {
    const row = this._rowByKey(threadKey);
    if (!row) return;
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
   * Take the user to the item in PCC, switching buildings if that is what it
   * takes. Always an explicit click; never something that happens to somebody.
   */
  async _openInPcc(threadKey) {
    const row = this._rowByKey(threadKey);
    if (!row) return;

    const targetFacility = row.pccFacilityName || row.facilityName;
    const sameFacility = isAlreadyAtFacility(targetFacility);
    const payload = {
      assessmentId: row.assessmentId,
      externalAssessmentId: row.externalAssessmentId,
      mdsItem: row.mdsItem,
      mdsColumn: row.mdsColumn,
      sectionCode: sectionCodeForItem(row.mdsItem),
      facilityName: row.facilityName,
      pccFacilityName: targetFacility,
    };

    window.SuperAnalytics?.track('mds_inbox_pcc_jump', {
      mds_item: row.mdsItem,
      same_facility: sameFacility,
    });

    if (sameFacility) {
      writeRestore({ ...payload, stage: 'section' });
      window.location.href = sectionUrlFor(payload);
      return;
    }

    if (!row.externalAssessmentId) {
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

function emptyStateHtml() {
  return `
    <div class="mti__empty">
      <p class="mti__empty-title">Nothing waiting on you</p>
      <p class="mti__muted">
        When a regional asks about an MDS item, it lands here — from any building you have access to.
      </p>
    </div>
  `;
}

function sectionHtml(title, rows) {
  return `
    <section class="mti__group">
      <h3 class="mti__group-title">${esc(title)} <span class="mti__count">${rows.length}</span></h3>
      <ol class="mti__list">${rows.map(rowHtml).join('')}</ol>
    </section>
  `;
}

function rowHtml(r) {
  const here = isAlreadyAtFacility(r.pccFacilityName || r.facilityName);
  // The preview names the author of the message being previewed, always. Using
  // the asker's name here reads as "Dana asked <somebody else's words>" the
  // moment anyone replies — the same misattribution the toast had.
  const who = r.lastMessage.authorName || 'Someone';
  // Who asked is worth knowing, but it is a fact about the thread, not about
  // this message, so it sits in the metadata line. Redundant on a one-message
  // thread, where the preview already is the ask.
  const showAsker = r.awaitingMe && r.askedByName && r.messageCount > 1;
  return `
    <li class="mti__row${r.unread ? ' mti__row--unread' : ''}" data-thread="${esc(r.threadKey)}" role="button" tabindex="0">
      <div class="mti__row-head">
        <span class="mti__item">${esc(r.itemLabel)}</span>
        ${r.unread ? '<span class="mti__dot" aria-label="Unread"></span>' : ''}
      </div>
      <div class="mti__meta">
        ${r.patientLabel ? `<span class="mti__resident">${esc(r.patientLabel)}</span>` : ''}
        ${showAsker ? `<span class="mti__asker">${esc(r.askedByName)} asked</span>` : ''}
        ${
          r.facilityName && !here
            ? `<span class="mti__facility">${esc(r.facilityName)}</span>`
            : ''
        }
      </div>
      <p class="mti__preview"><span class="mti__who">${esc(who)}</span> ${esc(
        truncate(r.lastMessage.message, 120)
      )}</p>
      <div class="mti__row-foot">
        <span class="mti__muted">${esc(relativeTime(r.lastMessage.createdAt))}${
          r.messageCount > 1 ? ` · ${r.messageCount} messages` : ''
        }</span>
        <!-- NO_TRACK: _openInPcc fires mds_inbox_pcc_jump itself, with properties. -->
        <button class="mti__pcc" data-pcc="${esc(r.threadKey)}">
          ${here ? 'Open the MDS' : 'Open in PCC'}
        </button>
      </div>
    </li>
  `;
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
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
