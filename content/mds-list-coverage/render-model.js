// content/mds-list-coverage/render-model.js
// Pure mapping: one batch `result` → chip view-models + per-interview detail.
// No DOM, no network.

export const INTERVIEW_LABELS = { bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' };

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

// List chips. Covered = quiet (no date clutter, styled muted); needed = the
// only chip that carries a date + color. `title` is the per-chip hover summary.
export function toChips(result) {
  if (!result || result.status === 'error') {
    return [{ kind: 'error', label: '!', title: 'Coverage check failed for this row.' }];
  }
  if (result.status === 'not_synced') {
    return [{ kind: 'neutral', label: '–', title: 'Not synced to Super yet — no coverage data.' }];
  }
  return (result.coverage?.interviews || []).map((iv) => {
    const label = labelFor(iv.type);
    if (iv.status === 'covered') {
      const w = windowText(iv);
      return { kind: 'covered', label, title: w ? `${label} done · window ${w}` : `${label} done` };
    }
    const by = iv.recommendedScheduleDate ? shortDate(iv.recommendedScheduleDate) : '';
    return {
      kind: 'needed', label,
      sub: by ? `by ${by}` : '',
      title: by ? `${label} — schedule by ${by}` : `${label} — needs scheduling`,
    };
  });
}

// Single-interview detail for the anchored popover. Short lines, no "completed ?"
// filler — a covered item with no source UDA just shows its window.
export function interviewDetail(iv) {
  const label = labelFor(iv.type);
  const w = windowText(iv);
  if (iv.status === 'covered') {
    const lines = [w ? `In window ${w}` : 'In window'];
    if (iv.coveringUda?.description) {
      lines.push(iv.coveringUda.date
        ? `${iv.coveringUda.description} · ${shortDate(iv.coveringUda.date)}`
        : iv.coveringUda.description);
    }
    return { label, status: 'covered', heading: `${label} · Done`, lines };
  }
  const by = iv.recommendedScheduleDate ? shortDate(iv.recommendedScheduleDate) : '';
  const lines = [by ? `Schedule by ${by}` : 'Needs scheduling'];
  if (w) lines.push(`Window ${w}`);
  if (iv.outOfWindowUda?.date) {
    lines.push(`Earlier one from ${shortDate(iv.outOfWindowUda.date)} is outside this window.`);
  }
  return { label, status: 'needed', heading: `${label} · Schedule`, lines };
}
