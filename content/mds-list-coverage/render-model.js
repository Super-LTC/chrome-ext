// content/mds-list-coverage/render-model.js
// Pure mapping: one batch `result` → chip view-models + per-interview detail.
// No DOM, no network.
//
// Status is FOUR values (backend contract Jun 15 2026):
//   covered      — done: a locked, in-window form (coveringUda, state 'locked')
//   in_progress  — started + filled + in window but NOT signed (inProgressUda, state 'open')
//   needed       — nothing in window (optional outOfWindowUda)
//   upcoming     — window not open yet → subtle, never an ✗
//
// `window` is the RAI LOOK-BACK period (label "Look back"), not a generic window.
// GG additionally carries an OBSERVE window (coveringUda.date..observedEndDate).
// Deep-link from the UDA's `externalId` (PCC id) — `id` is internal.

export const INTERVIEW_LABELS = { bims: 'BIMS', phq: 'PHQ-9', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' };

// Fixed display order: BIMS · PHQ-9 · GG · Pain (unknown types sort last, stable).
const ORDER = { bims: 0, phq: 1, phq9: 1, gg: 2, pain: 3 };
function ordered(interviews) {
  return [...interviews].sort((a, b) => (ORDER[a.type] ?? 99) - (ORDER[b.type] ?? 99));
}

// M/D — strip the year to keep the UI calm (e.g. 2026-06-09 → 6/9).
function shortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : String(iso);
}

function labelFor(type) {
  return INTERVIEW_LABELS[type] || String(type || '').toUpperCase();
}

// Look-back period "6/9–6/16" (en dash), or '' when absent.
function lookbackText(iv) {
  return iv?.window ? `${shortDate(iv.window.start)}–${shortDate(iv.window.end)}` : '';
}

// Deep-link target is the PCC externalId (id is internal-only).
function udaLink(uda) {
  return uda ? (uda.externalId || uda.id) : undefined;
}

// List chips — icon-first, NO dates inline (dates live in the popup). Each ok
// chip carries its source `iv` so the controller can wire hover/click without
// a fragile index zip. Visual severity is carried entirely by `kind` + CSS.
export function toChips(result) {
  if (!result || result.status === 'error') {
    return [{ kind: 'error', label: '!', title: 'Coverage check failed for this row.' }];
  }
  if (result.status === 'not_synced') {
    return [{ kind: 'neutral', label: '–', title: 'Not synced to Super yet — no coverage data.' }];
  }
  return ordered(result.coverage?.interviews || []).map((iv) => {
    const label = labelFor(iv.type);
    const w = lookbackText(iv);
    let kind, title;
    switch (iv.status) {
      case 'covered':
        kind = 'covered'; title = w ? `${label} done · look back ${w}` : `${label} done`; break;
      case 'in_progress':
        kind = 'in_progress'; title = `${label} — in progress, not signed`; break;
      case 'upcoming':
        kind = 'upcoming';
        title = iv.window?.start ? `${label} — upcoming, opens ${shortDate(iv.window.start)}` : `${label} — upcoming`; break;
      case 'needed':
      default: {
        kind = 'needed';
        const by = iv.recommendedScheduleDate ? shortDate(iv.recommendedScheduleDate) : '';
        title = by ? `${label} — schedule by ${by}` : `${label} — needs scheduling`;
      }
    }
    return { kind, label, title, iv };
  });
}

function observedText(u) {
  if (!u?.date) return '';
  const end = u.observedEndDate && u.observedEndDate !== u.date ? `–${shortDate(u.observedEndDate)}` : '';
  return `Observed ${shortDate(u.date)}${end}`;
}

// Structured detail for the popover: { heading, name?, meta[], note?, udaId? }.
// Kept terse on purpose — name (the form), a couple of muted date lines, and an
// out-of-window note only when relevant.
export function interviewDetail(iv) {
  const label = labelFor(iv.type);
  const w = lookbackText(iv);
  const isGG = iv.type === 'gg';

  if (iv.status === 'covered') {
    const u = iv.coveringUda;
    const meta = [];
    if (isGG) { const o = observedText(u); if (o) meta.push(o); }
    else if (u?.date) meta.push(`Completed ${shortDate(u.date)}`);
    if (w) meta.push(`Look back ${w}`);
    return { label, status: 'covered', heading: `${label} · Done`, name: u?.description, meta, udaId: udaLink(u) };
  }

  if (iv.status === 'in_progress') {
    const u = iv.inProgressUda;
    const meta = ['Started, not signed'];
    if (iv.recommendedScheduleDate) meta.push(`Sign by ${shortDate(iv.recommendedScheduleDate)}`);
    if (w) meta.push(`Look back ${w}`);
    return { label, status: 'in_progress', heading: `${label} · In progress`, name: u?.description, meta, udaId: udaLink(u) };
  }

  if (iv.status === 'upcoming') {
    const meta = [iv.window?.start ? `Opens ${shortDate(iv.window.start)}` : 'Not open yet'];
    if (iv.recommendedScheduleDate) meta.push(`Plan for ${shortDate(iv.recommendedScheduleDate)}`);
    return { label, status: 'upcoming', heading: `${label} · Upcoming`, meta };
  }

  // needed
  const meta = [iv.recommendedScheduleDate ? `Schedule by ${shortDate(iv.recommendedScheduleDate)}` : 'Needs scheduling'];
  if (w) meta.push(`Look back ${w}`);
  const note = iv.outOfWindowUda?.date ? `Earlier form from ${shortDate(iv.outOfWindowUda.date)} is out of window` : undefined;
  return { label, status: 'needed', heading: `${label} · Schedule`, meta, note, udaId: udaLink(iv.outOfWindowUda) };
}
