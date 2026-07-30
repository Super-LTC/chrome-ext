/**
 * NoteModal — read the progress note that was linked to a finding, without
 * leaving the report.
 *
 * The first version made "open note" navigate to PointClickCare. In a list of
 * 295 findings that costs you your place to answer a five-second question, and
 * we already hold the note text server-side. So read it here; going to the
 * chart stays available for when you actually want to act.
 *
 * This IS a dialog stacked on the report panel — the one place it earns its
 * keep, because a note is a block of prose that would blow out row height.
 */

import { useEffect, useState, useRef } from 'preact/hooks';

export function NoteModal({
  reportId,
  findingId,
  summary,
  detectedAt,
  chartHref,
  onOpenChart,
  onClose,
}) {
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase: the report panel also listens for Escape, and the topmost
    // layer should win rather than closing everything at once.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          endpoint: `/api/extension/24hr-report/finding/note?reportId=${encodeURIComponent(
            reportId
          )}&findingId=${encodeURIComponent(findingId)}`,
          options: { method: 'GET' },
        });
        if (cancelled) return;
        if (!res?.success) throw new Error(res?.error || 'Could not load that note');
        setNote(res.data?.note ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load that note');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, findingId]);

  const when = (() => {
    if (!detectedAt) return '';
    const d = new Date(detectedAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  })();

  return (
    <div class="thr__modal-scrim" onClick={onClose}>
      <div
        class="thr__modal"
        role="dialog"
        aria-modal="true"
        aria-label="Linked progress note"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="thr__modal-head">
          <div>
            <p class="thr__modal-kicker">Linked progress note</p>
            {note?.type && <h3 class="thr__modal-title">{note.type}</h3>}
            {when && <p class="thr__modal-when">{when}</p>}
          </div>
          <button
            type="button"
            class="thr__modal-close"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {summary && <p class="thr__modal-summary">{summary}</p>}

        <div class="thr__modal-body">
          {loading && <p class="thr__trail-empty">Loading note…</p>}
          {error && <p class="thr__trail-error">{error}</p>}
          {!loading && !error && !note?.text && (
            <p class="thr__trail-empty">
              The note text isn’t available here — open the chart to read it.
            </p>
          )}
          {note?.text && <pre class="thr__modal-note">{note.text}</pre>}
        </div>

        <div class="thr__modal-foot">
          {chartHref && (
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              // NO_TRACK — the navigation itself is recorded by the row's
              // existing open-in-PCC handler.
              onClick={() => {
                onOpenChart?.(chartHref);
                onClose();
              }}
            >
              Open in PointClickCare
            </button>
          )}
          {/* Dismisses a reader; report_24hr_detection_note_opened already
              records that the note was read. */}
          {/* NO_TRACK */}
          <button type="button" class="thr__btn thr__btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
