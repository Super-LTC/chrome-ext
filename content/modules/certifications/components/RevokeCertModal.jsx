import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';

/**
 * RevokeCertModal — collects a required reason, then revokes an outstanding
 * (sent) certification. Revoking invalidates the practitioner's live signing
 * link so the signature can no longer be completed. Reversible via the Undo
 * toast shown after a successful revoke.
 */
export function RevokeCertModal({ isOpen, onClose, cert, onRevoked }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleRevoke() {
    if (!reason.trim()) return;
    setSubmitting(true);
    onRevoked(reason)
      .then(() => { setReason(''); onClose(); })
      .catch(() => setSubmitting(false));
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke Certification"
      subtitle={cert?.patientName}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Revoking...' : 'Revoke', variant: 'destructive', onClick: handleRevoke, disabled: !reason.trim() || submitting }
      ]}
    >
      <div class="cm-section">
        <p class="cm-section__hint">
          This pulls back the outstanding signature request. The practitioner's
          existing signing link will stop working immediately. You can undo this
          right after.
        </p>
        <div class="cm-section__head">
          <span class="cm-section__label">Reason for Revoking</span>
        </div>
        <textarea
          class="cm-input cm-input--textarea"
          rows={3}
          value={reason}
          onInput={(e) => setReason(e.target.value)}
          placeholder="Why is this certification being revoked?"
        />
      </div>
    </CertModal>
  );
}
