// Comment bubbles on MDS items.
//
// Sibling of QueryBadges: same seam (appended next to the main Super badge from
// injectBadge), same lifecycle, so the two sit together and neither knows about
// the other.
//
// Two states, deliberately not one:
//   count only   — grey. There is a conversation here.
//   awaitingMe   — amber + dot. YOU were asked and have not answered.
//
// The nurse coding an item is usually not the person who was asked about it. A
// single count conflates "someone is talking about this" with "you owe an
// answer", and a bubble that nags everybody gets ignored by everybody.
//
// Nothing renders when an item has no conversation. Absence should be silent.

const CommentBadges = {
  /** `${mdsItem}${mdsColumn}` -> { count, awaitingMe }. Loaded once per section. */
  _badges: {},

  /** Replace the whole map after a fetch, then repaint what is on screen. */
  setBadges(map) {
    this._badges = map || {};
    this.refreshAll();
  },

  /** Merge one item's state after a post, without refetching the section. */
  updateItem(mdsItem, mdsColumn, badge) {
    const key = `${mdsItem}${mdsColumn || ''}`;
    if (!badge || !badge.count) delete this._badges[key];
    else this._badges[key] = badge;
    this.refreshAll();
  },

  getBadge(mdsItem, mdsColumn) {
    return this._badges[`${mdsItem}${mdsColumn || ''}`] || null;
  },

  /**
   * Inject or update the bubble for one question element.
   * Called from injectBadge() in mds-overlay.js, right after QueryBadges.
   */
  injectCommentBadge(questionEl, result, mainBadge) {
    if (!questionEl || !result?.mdsItem) return;

    const existing = questionEl.querySelector('.super-badge--comment');
    if (existing) existing.remove();

    const state = this.getBadge(result.mdsItem, result.column);
    // No conversation, no affordance. An empty bubble on every item would be
    // noise on a section with dozens of rows.
    if (!state || !state.count) return;

    const badge = document.createElement('div');
    badge.className =
      'super-badge super-badge--comment' +
      (state.awaitingMe ? ' super-badge--comment-awaiting' : '');
    badge.setAttribute('data-mds-item', result.mdsItem);
    if (result.column) badge.setAttribute('data-column', result.column);
    badge.title = state.awaitingMe
      ? 'Someone is waiting on your answer'
      : `${state.count} comment${state.count === 1 ? '' : 's'}`;

    badge.innerHTML = `
      <svg class="super-badge__svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="super-badge__text">${state.count}</span>
      ${state.awaitingMe ? '<span class="super-badge__dot" aria-hidden="true"></span>' : ''}
    `;

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      window.MdsCommentThread?.open(result);
    });

    if (mainBadge && mainBadge.parentElement) {
      mainBadge.parentElement.appendChild(badge);
    }
  },

  /**
   * Repaint every bubble currently on the page.
   *
   * Re-reads from `SuperOverlay.results` rather than tracking its own elements:
   * the overlay rebuilds badges on every decision, so anything this module held
   * onto would be detached nodes within a click or two.
   */
  refreshAll() {
    const results = window.SuperOverlay?.results || [];
    for (const result of results) {
      const el = result.element || document.getElementById(result.elementId);
      if (!el) continue;
      const mainBadge = el.querySelector('.super-badge:not(.super-badge--comment):not(.super-badge--query):not(.super-badge--query-status)');
      if (!mainBadge) continue;
      this.injectCommentBadge(el, result, mainBadge);
    }
  },

  /** Load the section's badges. Safe to call repeatedly. */
  async load() {
    const map = await window.MdsCommentsAPI?.fetchBadges();
    // null means the request failed — keep whatever we had rather than blanking
    // every bubble on a transient error.
    if (map) this.setBadges(map);
  },
};

window.CommentBadges = CommentBadges;

/**
 * The last leg of a jump from the inbox: we are on the right section page, so
 * find the item, scroll to it and open its conversation.
 *
 * This polls `SuperOverlay.results` rather than hooking a repaint, because the
 * overlay's scan finishes on its own schedule — it fetches section data first,
 * and on a slow facility that is several seconds after this page loaded. Tying
 * the handoff to a render callback would make it a race we lose intermittently,
 * which is the worst kind of bug to be told about second-hand.
 *
 * If the item never appears we say so. Landing on the right page and silently
 * doing nothing reads as the feature being broken.
 */
const ARRIVAL_TIMEOUT_MS = 20000;
const ARRIVAL_POLL_MS = 300;

function findScannedItem(mdsItem, mdsColumn) {
  const results = window.SuperOverlay?.results || [];
  return (
    results.find(
      (r) => r.mdsItem === mdsItem && (r.column || '') === (mdsColumn || '')
    ) || null
  );
}

async function landOnTaggedItem(arrival) {
  if (!arrival?.mdsItem) return;
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const match = findScannedItem(arrival.mdsItem, arrival.mdsColumn);
    if (match) {
      const el = match.element || document.getElementById(match.elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('super-highlight');
        setTimeout(() => el.classList.remove('super-highlight'), 2000);
      }
      // After the scroll settles, so the panel does not slide in over a moving
      // page.
      setTimeout(() => window.MdsCommentThread?.open(match), 400);
      window.SuperMdsTagArrival = null;
      return;
    }
    await new Promise((r) => setTimeout(r, ARRIVAL_POLL_MS));
  }

  window.SuperMdsTagArrival = null;
  window.SuperToast?.warning(
    `${arrival.mdsItem} is not on this page — the assessment may have changed.`
  );
}

window.addEventListener('super:mds-tag-arrived', (e) => {
  landOnTaggedItem(e.detail);
});
