// content/mds-list-coverage/detail.js
// Click-to-toggle popover for ONE interview, anchored to its chip. No hover —
// clicking a chip opens it (clicking the same chip or outside closes it), so
// there's no accidental-hover noise and nothing to "mouse out of the way."
import { interviewDetail } from './render-model.js';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]));

let popEl = null;

function close() {
  if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('click', onDocClick, true); }
}
function onDocClick(e) { if (popEl && !popEl.contains(e.target)) close(); }

// PCC opens a UDA/assessment here; the UDA externalId IS the ESOLassessid.
// Live page origin (PCC host varies per customer: www21, www10, …).
function udaUrl(id) {
  return `${location.origin}/care/chart/mds/mdssection.jsp?ESOLassessid=${encodeURIComponent(id)}`;
}

function buildHtml(d) {
  const parts = [`<div class="super-ilc-pop__h">${esc(d.heading)}</div>`];
  if (d.name) parts.push(`<div class="super-ilc-pop__name">${esc(d.name)}</div>`);
  (d.meta || []).forEach((m) => parts.push(`<div class="super-ilc-pop__l">${esc(m)}</div>`));
  if (d.note) parts.push(`<div class="super-ilc-pop__note">${esc(d.note)}</div>`);
  if (d.udaId) {
    parts.push(`<a class="super-ilc-pop__link" href="${esc(udaUrl(d.udaId))}" target="_blank" rel="noopener">View in PCC ↗</a>`);
  }
  return parts.join('');
}

/** Click toggles the popover for this chip. `onOpen` fires the analytics signal. */
export function attachInterviewPopover(chip, iv, onOpen) {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popEl && popEl.__anchor === chip) { close(); return; } // toggle off
    open(chip, iv, onOpen);
  });
}

function open(chip, iv, onOpen) {
  close();
  onOpen?.();
  const d = interviewDetail(iv);
  popEl = document.createElement('div');
  popEl.className = `super-ilc-pop super-ilc-pop--${d.status}`;
  popEl.__anchor = chip;
  popEl.innerHTML = buildHtml(d);
  popEl.querySelector('.super-ilc-pop__link')?.addEventListener('click', () => {
    window.SuperAnalytics?.track?.('mds_list_coverage_uda_opened', { status: d.status });
  });
  document.body.appendChild(popEl);
  position(popEl, chip);
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
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
