import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';
import { todayISO } from '../stay-dates.js';

/**
 * EndStayModal — pick the stay's last day (defaults to today) and, unless
 * `askReason` is false, say why.
 *
 * Two callers: the stay ⋮ menu ("End stay", reason required) and the review
 * banner (answering a payer-check or discharged flag — the flag is the reason,
 * so no box). `defaultEndDate` pre-fills the discharge date for the latter.
 *
 * `onSubmit({endDate, reason})` returns a promise; a rejection shows its
 * message and keeps the modal open.
 */
function EndStayModalBody({
  isOpen,
  onClose,
  patientName,
  startDate,
  askReason = true,
  hint = 'No more certifications will be due after this date.',
  defaultEndDate = null,
  onSubmit,
}) {
  const [endDate, setEndDate] = useState(defaultEndDate || todayISO());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const today = todayISO();
  let dateProblem = null;
  if (!endDate) dateProblem = 'Pick the last day of the stay.';
  else if (endDate > today) dateProblem = "The end date can't be in the future.";
  else if (startDate && endDate < startDate) dateProblem = "The end date can't be before the stay started.";

  const canSubmit = !dateProblem && (!askReason || !!reason.trim()) && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    Promise.resolve()
      .then(() => onSubmit({ endDate, reason: askReason ? reason.trim() : undefined }))
      .then(() => { setSubmitting(false); onClose(); })
      .catch((err) => {
        console.error('[Certifications] End stay failed:', err);
        setError(err?.message || 'Could not end the stay. Try again.');
        setSubmitting(false);
      });
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="End stay"
      subtitle={patientName}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Ending...' : 'End stay', variant: 'primary', onClick: handleSubmit, disabled: !canSubmit },
      ]}
    >
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">Last day of the stay</span>
        </div>
        {hint && <p class="cm-section__hint cm-section__hint--plain">{hint}</p>}
        <input
          class="cm-input cm-input--date"
          type="date"
          value={endDate}
          min={startDate || undefined}
          max={today}
          onInput={(e) => setEndDate(e.target.value)}
          data-field="endDate"
        />
        {endDate && dateProblem && <div class="cm-field-note" role="note">{dateProblem}</div>}
      </div>
      {askReason && (
        <div class="cm-section">
          <div class="cm-section__head">
            <span class="cm-section__label">Reason</span>
            <span class="cm-section__badge cm-section__badge--warn">Required</span>
          </div>
          <textarea
            class="cm-input cm-input--textarea"
            rows={2}
            value={reason}
            onInput={(e) => setReason(e.target.value)}
            placeholder="e.g., Payer changed to private pay"
            data-field="reason"
          />
        </div>
      )}
      {error && <div class="cm-error" role="alert">{error}</div>}
    </CertModal>
  );
}

/**
 * The body only mounts while open, so every open starts from a fresh form —
 * no reset effect racing the nurse's first keystroke.
 */
export function EndStayModal(props) {
  if (!props.isOpen) return null;
  return <EndStayModalBody {...props} />;
}
