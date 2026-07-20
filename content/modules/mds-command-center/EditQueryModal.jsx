import { useState, useEffect } from 'preact/hooks';
import { Modal } from '../../components/Modal.jsx';
import {
  formatArdBadge,
  resolveEffectiveDate,
  isDateInWindow,
  windowGuidanceText,
  outsideWindowWarning,
} from '../../queries/lib/query-timing.js';

/**
 * EditQueryModal — edit an already-sent (or pending) diagnosis query's note and
 * effective (onset) date from the MDS Command Center Queries tab. Editing is
 * allowed until the physician signs; the doctor's signing portal reads live, so
 * edits take effect without revoke/resend.
 *
 * The command-center dashboard list doesn't carry the note text or `timing`, so
 * on open we fetch the full query (`getQuery`) to prefill the note + show the
 * ARD window guidance. `onSaved(queryId, changes)` must return a promise; the
 * modal closes on resolve and stays open (re-enabling Save) on reject.
 */
export function EditQueryModal({ isOpen, query, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [timing, setTiming] = useState(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [initialNote, setInitialNote] = useState('');
  const [initialDate, setInitialDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // On open, hydrate from the full query (note + timing live there, not on the
  // dashboard list object). Falls back to the list object so the date is still
  // editable even if the fetch fails.
  useEffect(() => {
    if (!isOpen || !query?.id) return undefined;
    let cancelled = false;

    const seed = (fq) => {
      const n = fq.nurseEditedNote || fq.aiGeneratedNote || '';
      const d = resolveEffectiveDate(fq);
      setNote(n); setInitialNote(n);
      setDate(d); setInitialDate(d);
      setTiming(fq.timing || null);
    };

    setLoading(true);
    setLoadError(false);
    setSubmitting(false);

    window.QueryAPI.getQuery(query.id)
      .then((fq) => { if (!cancelled) seed(fq || query); })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[Super] Failed to load full query for edit', err);
        setLoadError(true);
        seed(query); // degrade: note may be blank, date/edit still work
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, query?.id]);

  const badge = formatArdBadge(timing);
  const guidance = windowGuidanceText(timing?.lookbackWindow);
  const outside = isDateInWindow(date, timing?.lookbackWindow) === false;
  const warning = outside ? outsideWindowWarning(timing?.lookbackDays, timing?.lookbackWindow) : null;

  const dirty = note !== initialNote || date !== initialDate;

  function handleSave() {
    if (submitting) return;
    if (!dirty) { onClose(); return; }
    const changes = {};
    if (note !== initialNote) changes.nurseEditedNote = note;
    // '' clears the effective date back to the createdAt default (null).
    if (date !== initialDate) changes.effectiveDate = date || null;

    setSubmitting(true);
    onSaved(query.id, changes)
      .then(() => onClose())
      .catch(() => setSubmitting(false));
  }

  const patient = query?.patientName || 'this patient';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Query"
      icon="✎"
      size="small"
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        {
          label: submitting ? 'Saving…' : 'Save',
          variant: 'primary',
          onClick: handleSave,
          disabled: submitting || loading || !dirty,
        },
      ]}
    >
      {loading ? (
        <div class="mds-cc__edit-loading">Loading query…</div>
      ) : (
        <>
          <p class="mds-cc__edit-hint">
            Edits go live for <strong>{patient}</strong> right away — the doctor sees them when they open
            the signing link. You can edit until it's signed; no need to revoke.
          </p>

          <label class="mds-cc__edit-label" for="mds-cc-edit-note">Note for physician</label>
          <textarea
            id="mds-cc-edit-note"
            class="mds-cc__edit-textarea"
            rows={4}
            value={note}
            onInput={(e) => setNote(e.target.value)}
            placeholder="Note for physician..."
          />
          {loadError && (
            <div class="mds-cc__edit-loaderr">Couldn't load the saved note — editing may overwrite it.</div>
          )}

          <div class="mds-cc__edit-date-row">
            <label class="mds-cc__edit-label" for="mds-cc-edit-date">Effective date</label>
            {badge && <span class={`super-ard-badge super-ard-badge--${badge.tone}`}>{badge.text}</span>}
          </div>
          <input
            id="mds-cc-edit-date"
            type="date"
            class="mds-cc__edit-date-input"
            value={date}
            onInput={(e) => setDate(e.target.value)}
          />
          {guidance && <div class="mds-cc__edit-guidance">{guidance}</div>}
          {warning && <div class="mds-cc__edit-warning">{warning}</div>}
        </>
      )}
    </Modal>
  );
}
