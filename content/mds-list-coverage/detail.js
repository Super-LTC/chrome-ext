// content/mds-list-coverage/detail.js
// A small popover for ONE interview, anchored to its chip. Shows on hover
// (with a grace delay so it survives the gap between chip and popover) and
// also on click (which additionally fires the analytics signal).
import { interviewDetail } from './render-model.js';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]));

let popEl = null;
let hideTimer = null;

function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
function scheduleHide() { cancelHide(); hideTimer = setTimeout(close, 140); }

function close() {
  cancelHide();
  if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('click', onDocClick, true); }
}
function onDocClick(e) { if (popEl && !popEl.contains(e.target)) close(); }

function showFor(anchorEl, iv) {
  close();
  const d = interviewDetail(iv);
  popEl = document.createElement('div');
  popEl.className = `super-ilc-pop super-ilc-pop--${d.status}`;
  popEl.innerHTML =
    `<div class="super-ilc-pop__h">${esc(d.heading)}</div>` +
    d.lines.map((l) => `<div class="super-ilc-pop__l">${esc(l)}</div>`).join('');
  // Keep it open while the pointer is over the popover itself.
  popEl.addEventListener('mouseenter', cancelHide);
  popEl.addEventListener('mouseleave', scheduleHide);
  document.body.appendChild(popEl);
  position(popEl, anchorEl);
}

/** Wire hover + click for one interview chip. `onClick` fires the analytics signal. */
export function attachInterviewHover(chip, iv, onClick) {
  chip.addEventListener('mouseenter', () => { cancelHide(); showFor(chip, iv); });
  chip.addEventListener('mouseleave', scheduleHide);
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick?.();
    cancelHide();
    showFor(chip, iv);
    // After an intentional click, let an outside click dismiss it too.
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  });
}

// Anchor under the chip; flip above if it would overflow the viewport bottom,
// and clamp horizontally so it never runs off-screen.
function position(el, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  const pw = el.offsetWidth, ph = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  let left = r.left;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  el.style.top = `${Math.max(8, top)}px`;
  el.style.left = `${Math.max(8, left)}px`;
}
