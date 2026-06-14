// content/mds-list-coverage/detail.js
import { INTERVIEW_LABELS } from './render-model.js';
const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
let popEl = null;

function close() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('click', onDocClick, true); } }
function onDocClick(e) { if (popEl && !popEl.contains(e.target)) close(); }

function ivBlock(iv) {
  const label = INTERVIEW_LABELS[iv.type] || String(iv.type || '').toUpperCase();
  const win = iv.window ? `${esc(iv.window.start)} → ${esc(iv.window.end)}` : '';
  if (iv.status === 'covered') {
    const u = iv.coveringUda || {};
    return `<div class="super-ilc-pop__iv"><b>${esc(label)}</b> — ✓ done<br>
      ${u.description ? `${esc(u.description)} · ` : ''}completed ${esc(u.date || '?')}${u.lockedDate ? ` · locked ${esc(u.lockedDate)}` : ''}
      ${win ? `<br><span style="color:#64748b">window ${win}</span>` : ''}</div>`;
  }
  const by = iv.recommendedScheduleDate ? ` by ${esc(iv.recommendedScheduleDate)}` : '';
  const oow = iv.outOfWindowUda
    ? `<br><span style="color:#b45309">Existing ${esc(iv.outOfWindowUda.description || 'UDA')} from ${esc(iv.outOfWindowUda.date)} is out of this ARD's window.</span>` : '';
  return `<div class="super-ilc-pop__iv"><b>${esc(label)}</b> — ⚠ schedule${by}
    ${win ? `<br><span style="color:#64748b">window ${win}</span>` : ''}${oow}</div>`;
}

export function showRowDetail(anchorEl, result, rowMeta) {
  close();
  const cov = result.coverage || {};
  popEl = document.createElement('div');
  popEl.className = 'super-ilc-pop';
  popEl.innerHTML =
    `<div class="super-ilc-pop__title">${esc(rowMeta?.patientName || 'Assessment')} — ${esc(cov.description || '')}</div>
     <div style="color:#64748b;font-size:12px;margin-bottom:6px">ARD ${esc(cov.ardDate || '?')} ·
       ${esc(cov.summary?.covered ?? 0)}/${esc(cov.summary?.required ?? 0)} done</div>
     ${(cov.interviews || []).map(ivBlock).join('')}`;
  document.body.appendChild(popEl);
  const r = anchorEl.getBoundingClientRect();
  popEl.style.top = `${Math.min(r.bottom + 6, window.innerHeight - popEl.offsetHeight - 12)}px`;
  popEl.style.left = `${Math.min(r.left, window.innerWidth - popEl.offsetWidth - 12)}px`;
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
}
