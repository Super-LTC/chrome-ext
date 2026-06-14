// content/mds-list-coverage/render-model.js
// Pure mapping: one batch `result` → chip view-models. No DOM, no network.

export const INTERVIEW_LABELS = { bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' };

// MM/D format to match the PCC list date style; tolerant of YYYY-MM-DD input.
function shortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[2])}/${Number(m[3])}`;
  return String(iso);
}

function labelFor(type) {
  return INTERVIEW_LABELS[type] || String(type || '').toUpperCase();
}

export function toChips(result) {
  if (!result || result.status === 'error') {
    return [{ kind: 'error', label: '!', title: 'Coverage check failed for this row.' }];
  }
  if (result.status === 'not_synced') {
    return [{ kind: 'neutral', label: '–', title: 'Not synced to Super yet — no coverage data.' }];
  }
  const interviews = result.coverage?.interviews || [];
  return interviews.map((iv) => {
    const label = labelFor(iv.type);
    if (iv.status === 'covered') {
      const u = iv.coveringUda;
      return { kind: 'covered', label,
        title: u ? `${label}: done — ${u.description} (${shortDate(u.date)})` : `${label}: done in window` };
    }
    const by = iv.recommendedScheduleDate ? `by ${shortDate(iv.recommendedScheduleDate)}` : 'needs scheduling';
    let title = `${label}: needed ${by}`;
    if (iv.outOfWindowUda?.date) {
      title += ` — you have one from ${shortDate(iv.outOfWindowUda.date)}, but this ARD's window pushed it out of range`;
    }
    return { kind: 'needed', label, sub: by, title };
  });
}
