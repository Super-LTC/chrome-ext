// content/mds-list-coverage/render-model.js
// Pure mapping: one batch `result` → chip view-models + per-interview detail.
// No DOM, no network.
//
// Status is FOUR values (backend contract Jun 15 2026):
//   covered      — done: a locked, in-window form (coveringUda, state 'locked')
//   in_progress  — started + filled + in window but NOT signed (inProgressUda, state 'open')
//   needed       — nothing in window (optional outOfWindowUda)
//   upcoming     — window not open yet → subtle, never an ✗

export const INTERVIEW_LABELS = { bims: 'BIMS', phq: 'PHQ-9', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' };

// M/D — strip the year to keep the UI calm (e.g. 2026-06-09 → 6/9).
function shortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : String(iso);
}

function labelFor(type) {
  return INTERVIEW_LABELS[type] || String(type || '').toUpperCase();
}

// "6/9–6/16" (en dash), or '' when no window.
function windowText(iv) {
  return iv?.window ? `${shortDate(iv.window.start)}–${shortDate(iv.window.end)}` : '';
}

function isLocked(uda) {
  if (!uda) return false;
  return uda.state ? uda.state === 'locked' : !!uda.lockedDate;
}

// List chips. Visual severity gradient (quiet → loud): upcoming, covered,
// in_progress, needed. Only `needed` gets a solid pill. `title` is a plain-text
// fallback (the popover is the real hover surface).
export function toChips(result) {
  if (!result || result.status === 'error') {
    return [{ kind: 'error', label: '!', title: 'Coverage check failed for this row.' }];
  }
  if (result.status === 'not_synced') {
    return [{ kind: 'neutral', label: '–', title: 'Not synced to Super yet — no coverage data.' }];
  }
  return (result.coverage?.interviews || []).map((iv) => {
    const label = labelFor(iv.type);
    const w = windowText(iv);
    switch (iv.status) {
      case 'covered':
        return { kind: 'covered', label, title: w ? `${label} done · ${w}` : `${label} done` };
      case 'in_progress':
        return { kind: 'in_progress', label, title: `${label} — in progress, not signed` };
      case 'upcoming':
        return { kind: 'upcoming', label,
          title: iv.window?.start ? `${label} — upcoming, window opens ${shortDate(iv.window.start)}` : `${label} — upcoming` };
      case 'needed':
      default: {
        const by = iv.recommendedScheduleDate ? shortDate(iv.recommendedScheduleDate) : '';
        return { kind: 'needed', label, sub: by ? `by ${by}` : '',
          title: by ? `${label} — schedule by ${by}` : `${label} — needs scheduling` };
      }
    }
  });
}

// Single-interview detail for the anchored popover. Shows the real UDA name
// (verbatim) + its date + locked/open when the backend provides one.
export function interviewDetail(iv) {
  const label = labelFor(iv.type);
  const w = windowText(iv);

  if (iv.status === 'covered') {
    const u = iv.coveringUda;
    const lines = [];
    if (u?.description) lines.push(u.description);
    if (u?.date) lines.push(`Completed ${shortDate(u.date)} · ${isLocked(u) ? 'locked' : 'open'}`);
    else if (u) lines.push(isLocked(u) ? 'Locked' : 'Open');
    lines.push(w ? `Window ${w}` : 'In window');
    return { label, status: 'covered', heading: `${label} · Done`, lines, udaId: u?.id };
  }

  if (iv.status === 'in_progress') {
    const u = iv.inProgressUda;
    const lines = [];
    if (u?.description) lines.push(u.description);
    lines.push(u?.date ? `Started ${shortDate(u.date)} · not signed` : 'Started — not signed yet');
    if (iv.recommendedScheduleDate) lines.push(`Sign by ${shortDate(iv.recommendedScheduleDate)}`);
    if (w) lines.push(`Window ${w}`);
    return { label, status: 'in_progress', heading: `${label} · In progress`, lines, udaId: u?.id };
  }

  if (iv.status === 'upcoming') {
    const lines = [iv.window?.start ? `Window opens ${shortDate(iv.window.start)}` : 'Window not open yet'];
    if (iv.recommendedScheduleDate) lines.push(`Plan for ${shortDate(iv.recommendedScheduleDate)}`);
    return { label, status: 'upcoming', heading: `${label} · Upcoming`, lines };
  }

  // needed
  const by = iv.recommendedScheduleDate ? shortDate(iv.recommendedScheduleDate) : '';
  const lines = [by ? `Schedule by ${by}` : 'Needs scheduling'];
  if (w) lines.push(`Window ${w}`);
  if (iv.outOfWindowUda?.date) {
    lines.push(`Earlier one from ${shortDate(iv.outOfWindowUda.date)} is outside this window.`);
  }
  return { label, status: 'needed', heading: `${label} · Schedule`, lines, udaId: iv.outOfWindowUda?.id };
}
