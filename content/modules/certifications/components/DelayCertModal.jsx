import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';

export function DelayCertModal({ isOpen, onClose, cert, onDelayed }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleDelay() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    onDelayed(reason)
      .then(() => { setReason(''); setSubmitting(false); onClose(); })
      .catch((err) => {
        console.error('[Certifications] Delay failed:', err);
        setError(err?.message || 'Could not mark as delayed. Try again.');
        setSubmitting(false);
      });
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="Mark as Delayed"
      subtitle={cert?.patientName}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Saving...' : 'Mark Delayed', variant: 'primary', onClick: handleDelay, disabled: !reason.trim() || submitting }
      ]}
    >
      <div class="cm-section cm-section--warn">
        <div class="cm-section__head">
          <span class="cm-section__icon cm-section__icon--warn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          <span class="cm-section__label">Delay Reason</span>
          <span class="cm-section__badge cm-section__badge--warn">Required</span>
        </div>
        <p class="cm-section__hint">This will log a delay reason for compliance. The cert remains unsent.</p>
        <textarea
          class="cm-input cm-input--textarea"
          rows={3}
          value={reason}
          onInput={(e) => setReason(e.target.value)}
          placeholder="Why is this certification being delayed?"
        />
        {error && <div class="cm-error" role="alert">{error}</div>}
      </div>
    </CertModal>
  );
}
