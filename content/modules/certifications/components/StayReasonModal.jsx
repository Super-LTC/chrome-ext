import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';

/**
 * StayReasonModal — one required reason, one action. Used for the cert-stay
 * decisions that only need a "why" on record: "No cert stay needed" and
 * switching a stay between manual and automatic.
 *
 * `onSubmit(reason)` returns a promise; a rejection shows its message (the
 * server's error is written for the nurse) and keeps the modal open.
 */
function StayReasonModalBody({
  isOpen,
  onClose,
  title,
  subtitle,
  hint,
  label = 'Reason',
  placeholder,
  submitLabel = 'Save',
  submittingLabel = 'Saving...',
  onSubmit,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = !!reason.trim() && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    Promise.resolve()
      .then(() => onSubmit(reason.trim()))
      .then(() => { setSubmitting(false); onClose(); })
      .catch((err) => {
        console.error('[Certifications] Stay action failed:', err);
        setError(err?.message || 'Could not save. Try again.');
        setSubmitting(false);
      });
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? submittingLabel : submitLabel, variant: 'primary', onClick: handleSubmit, disabled: !canSubmit },
      ]}
    >
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">{label}</span>
          <span class="cm-section__badge cm-section__badge--warn">Required</span>
        </div>
        {hint && <p class="cm-section__hint cm-section__hint--plain">{hint}</p>}
        <textarea
          class="cm-input cm-input--textarea"
          rows={3}
          value={reason}
          onInput={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          data-field="reason"
        />
        {error && <div class="cm-error" role="alert">{error}</div>}
      </div>
    </CertModal>
  );
}

/**
 * The body only mounts while open, so every open starts from a fresh form —
 * no reset effect racing the nurse's first keystroke.
 */
export function StayReasonModal(props) {
  if (!props.isOpen) return null;
  return <StayReasonModalBody {...props} />;
}
