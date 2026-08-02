// The conversation on one MDS item — right-side slide-in panel.
//
// Vanilla on purpose. The MDS overlay is 5,600 lines of vanilla injected into
// PCC's own DOM; mounting a Preact root per item inside that would be a new
// rendering model living inside an old one. CLAUDE.md's rule is "migrate only
// when you touch it", and this is not the place to start.
//
// Geometry matches `.thr__panel` (the 24-hour report): fixed overlay, 680px,
// backdrop, slide from the right. Same muscle memory, different content.

const MdsCommentThread = {
  _el: null,
  _esc: null,
  _ctx: null,
  _state: null,

  isOpen() {
    return !!this._el;
  },

  /** @param {object} result The overlay's per-item result object. */
  async open(result) {
    if (!result?.mdsItem) return;
    this.close();

    this._ctx = {
      mdsItem: result.mdsItem,
      mdsColumn: result.column || '',
      description: result.description || '',
      result,
    };
    this._state = { comments: [], teammates: [], assignees: [], suggestionReason: null, noSuggestionWhy: null, myAssignmentId: null, busy: false };

    this._mount();
    this._renderLoading();
    await this._load();
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

  _mount() {
    const overlay = document.createElement('div');
    overlay.className = 'mct__overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    const panel = document.createElement('div');
    panel.className = 'mct__panel';
    panel.addEventListener('click', (e) => e.stopPropagation());
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._el = overlay;

    this._esc = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._esc);
  },

  _panel() {
    return this._el?.querySelector('.mct__panel');
  },

  _renderLoading() {
    const p = this._panel();
    if (!p) return;
    p.innerHTML = `
      ${this._headerHtml()}
      <div class="mct__body"><p class="mct__muted">Loading conversation…</p></div>
    `;
    this._bindHeader();
  },

  _headerHtml() {
    const { mdsItem, description } = this._ctx || {};
    return `
      <header class="mct__header">
        <div class="mct__titles">
          <span class="mct__title">${esc(mdsItem || '')}</span>
          ${description ? `<span class="mct__subtitle">${esc(description)}</span>` : ''}
        </div>
        <button class="mct__close" aria-label="Close" data-track="mds_comment_panel_closed">&times;</button>
      </header>
    `;
  },

  _bindHeader() {
    this._panel()
      ?.querySelector('.mct__close')
      ?.addEventListener('click', () => this.close());
  },

  async _load() {
    try {
      const data = await window.MdsCommentsAPI.fetchThread(
        this._ctx.mdsItem,
        this._ctx.mdsColumn
      );
      const s = this._state;
      s.comments = data?.comments || [];
      s.teammates = data?.teammates || [];

      const sugg = data?.suggestion?.suggestions || [];
      // Pre-fill only on a NEW thread. Re-suggesting on an existing conversation
      // would silently re-assign somebody who has already answered.
      if (s.comments.length === 0 && sugg.length > 0) {
        s.assignees = sugg.map((x) => ({ id: x.userId, name: x.name, email: x.email }));
        s.suggestionReason = REASON_LABEL[sugg[0].reason] || null;
      } else {
        s.noSuggestionWhy =
          s.comments.length === 0 ? data?.suggestion?.why || null : null;
      }

      // An assignment addressed to me, still open — that is what turns "Reply"
      // into "Reply & resolve".
      s.myAssignmentId = data?.myAssignmentId || null;

      this._render();
    } catch (err) {
      const p = this._panel();
      if (p) {
        p.innerHTML = `${this._headerHtml()}<div class="mct__body"><p class="mct__error">Could not load this conversation.</p></div>`;
        this._bindHeader();
      }
      console.warn('[MdsComments] thread load failed:', err?.message);
    }
  },

  _render() {
    const p = this._panel();
    if (!p) return;
    const s = this._state;
    const isNew = s.comments.length === 0;
    const isReopen = !isNew && s.assignees.length > 0;

    p.innerHTML = `
      ${this._headerHtml()}
      <div class="mct__body">
        ${s.comments.length ? `<ol class="mct__thread">${s.comments.map(commentHtml).join('')}</ol>` : ''}
        <div class="mct__composer">
          <p class="mct__label">${isNew ? 'Ask someone to take a look' : 'Reply'}</p>
          <div class="mct__chips">
            <!-- NO_TRACK: removing a chip you just added is not a funnel step -->
            ${s.assignees.map((a) => `<span class="mct__chip">${esc(personLabel(a))}<button class="mct__chip-x" data-remove="${esc(a.id)}" aria-label="Remove">&times;</button></span>`).join('')}
            <button class="mct__chip-add" data-track="mds_comment_assignee_opened">+ ${s.assignees.length ? 'Add someone' : 'Assign someone'}</button>
          </div>
          ${s.suggestionReason && s.assignees.length ? `<p class="mct__hint">Suggested — ${esc(s.suggestionReason)}. Change it if that is not right.</p>` : ''}
          ${s.noSuggestionWhy && NO_SUGGESTION_COPY[s.noSuggestionWhy] ? `<p class="mct__hint">${esc(NO_SUGGESTION_COPY[s.noSuggestionWhy])} Pick someone to ask.</p>` : ''}
          <div class="mct__picker" hidden></div>
          <textarea class="mct__input" rows="3" maxlength="4000" placeholder="${isNew ? 'What do you want them to check?' : 'Add a reply…'}"></textarea>
          <p class="mct__error" hidden></p>
          <div class="mct__actions">
            <button class="mct__btn" data-action="post" data-track="mds_comment_posted">${isNew ? 'Send ask' : isReopen ? 'Reopen' : 'Reply'}</button>
            ${s.myAssignmentId ? '<button class="mct__btn mct__btn--primary" data-action="resolve" data-track="mds_comment_resolved">Reply &amp; resolve</button>' : ''}
          </div>
        </div>
      </div>
    `;
    this._bindHeader();
    this._bindComposer();
  },

  _bindComposer() {
    const p = this._panel();
    if (!p) return;
    const s = this._state;

    p.querySelectorAll('[data-remove]').forEach((btn) =>
      btn.addEventListener('click', () => {
        s.assignees = s.assignees.filter((a) => a.id !== btn.dataset.remove);
        this._render();
      })
    );

    p.querySelector('.mct__chip-add')?.addEventListener('click', () => {
      const picker = p.querySelector('.mct__picker');
      if (!picker) return;
      const available = s.teammates.filter((t) => !s.assignees.some((a) => a.id === t.id));
      // Picking a name is measured by mds_comment_posted's assignee_count,
      // not per keystroke of the picker.
      picker.innerHTML = available.length // NO_TRACK
        ? available.map((t) => `<button class="mct__picker-item" data-pick="${esc(t.id)}">${esc(personLabel(t))} <span class="mct__muted">${esc(t.email)}</span></button>`).join('')
        : '<p class="mct__muted">No one else has access to this building.</p>';
      picker.hidden = !picker.hidden;
      picker.querySelectorAll('[data-pick]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = s.teammates.find((x) => x.id === b.dataset.pick);
          if (t) s.assignees.push(t);
          this._render();
        })
      );
    });

    const input = p.querySelector('.mct__input');
    input?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        this._submit(s.myAssignmentId ? 'resolve' : 'post');
      }
    });

    p.querySelectorAll('[data-action]').forEach((btn) =>
      btn.addEventListener('click', () => this._submit(btn.dataset.action))
    );
  },

  async _submit(action) {
    const p = this._panel();
    const s = this._state;
    if (!p || s.busy) return;

    const input = p.querySelector('.mct__input');
    const message = (input?.value || '').trim();
    const errEl = p.querySelector('.mct__error');
    if (!message) {
      if (errEl) {
        errEl.textContent = 'Write something first.';
        errEl.hidden = false;
      }
      return;
    }

    s.busy = true;
    p.querySelectorAll('[data-action]').forEach((b) => (b.disabled = true));

    try {
      if (action === 'resolve' && s.myAssignmentId) {
        await window.MdsCommentsAPI.replyAndResolve({
          commentMentionId: s.myAssignmentId,
          message,
        });
        s.myAssignmentId = null;
      } else {
        await window.MdsCommentsAPI.postComment({
          mdsItem: this._ctx.mdsItem,
          mdsColumn: this._ctx.mdsColumn,
          message,
          assignedUserIds: s.assignees.map((a) => a.id),
        });
      }

      s.assignees = [];
      s.suggestionReason = null;
      await this._load();

      // Repaint the item's bubble and tell the rest of the app, matching the
      // `super:item-decision` side-channel the decision flow already uses.
      await window.CommentBadges?.load();
      window.dispatchEvent(
        new CustomEvent('super:mds-thread-changed', {
          detail: { mdsItem: this._ctx.mdsItem, column: this._ctx.mdsColumn },
        })
      );
      window.SuperToast?.success(action === 'resolve' ? 'Resolved' : 'Sent');
    } catch (err) {
      if (errEl) {
        errEl.textContent = 'Could not send. Try again.';
        errEl.hidden = false;
      }
      console.warn('[MdsComments] submit failed:', err?.message);
    } finally {
      s.busy = false;
      p.querySelectorAll('[data-action]').forEach((b) => (b.disabled = false));
    }
  },
};

const REASON_LABEL = {
  declined_this_item: 'passed on this item',
  opened_this_mds: 'opened this MDS',
};

// An empty picker with no explanation reads as broken. Each of these is real:
// ~19% of skipped items fleet-wide have no reachable author.
const NO_SUGGESTION_COPY = {
  no_author_recorded: 'PCC has no author recorded for this assessment.',
  author_not_on_super: "We couldn't match the nurse who opened this MDS to a Super account.",
  author_not_at_this_facility: 'The nurse who worked this item no longer has access to this building.',
};

function personLabel(p) {
  return p?.name || (p?.email || '').split('@')[0] || 'Someone';
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

function commentHtml(c) {
  const asked = (c.assignedTo || []).map(personLabel).join(', ');
  return `
    <li class="mct__msg">
      <div class="mct__msg-head">
        <span class="mct__msg-author">${esc(personLabel({ name: c.authorName, email: c.authorEmail }))}</span>
        <span class="mct__muted">${esc(relativeTime(c.createdAt))}</span>
      </div>
      ${asked ? `<p class="mct__msg-asked">asked ${esc(asked)}</p>` : ''}
      <p class="mct__msg-body">${esc(c.message)}</p>
    </li>
  `;
}

window.MdsCommentThread = MdsCommentThread;
