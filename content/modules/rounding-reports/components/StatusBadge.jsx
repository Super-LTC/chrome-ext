// Status badge for rounding checks. Mirrors the web app's color/icon legend.
// present → green ✓ · not_present → red ✗ · not_applicable → slate — · pending → amber ⏳

const STATUS_META = {
  present: { label: 'Present', glyph: '✓', cls: 'rr-status--present' },
  not_present: { label: 'Not present', glyph: '✗', cls: 'rr-status--missing' },
  not_applicable: { label: 'N/A', glyph: '—', cls: 'rr-status--na' },
  pending: { label: 'Pending', glyph: '⏳', cls: 'rr-status--pending' },
};

export function StatusBadge({ status, withLabel = true }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span class={`rr-status ${meta.cls}`} title={meta.label}>
      <span class="rr-status__glyph" aria-hidden="true">{meta.glyph}</span>
      {withLabel && <span class="rr-status__label">{meta.label}</span>}
    </span>
  );
}

/** Dot row of the last N history entries, oldest → newest. */
export function HistoryDots({ history }) {
  if (!history || history.length === 0) return null;
  // history is newest-first from server; reverse for oldest→newest visual.
  const ordered = [...history].reverse();
  return (
    <span class="rr-history-dots" aria-label="Recent history">
      {ordered.map((h, i) => {
        const meta = STATUS_META[h.status] || STATUS_META.pending;
        const dateStr = h.sessionDate ? new Date(h.sessionDate).toLocaleDateString() : '';
        return (
          <span
            key={i}
            class={`rr-history-dot ${meta.cls}`}
            title={`${meta.label} · ${dateStr}`}
          />
        );
      })}
    </span>
  );
}
