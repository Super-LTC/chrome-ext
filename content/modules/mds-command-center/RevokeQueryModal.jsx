import { useState } from 'preact/hooks';
import { Modal } from '../../components/Modal.jsx';

/**
 * RevokeQueryModal — collects a required reason, then revokes an outstanding
 * (sent) diagnosis query. Revoking invalidates the practitioner's live signing
 * link so the signature can no longer be completed. Reversible via the Undo
 * toast shown after a successful revoke.
 *
 * `onRevoked(reason)` must return a promise; the modal closes on resolve and
 * stays open (re-enabling the button) on reject.
 */
export function RevokeQueryModal({ isOpen, query, onClose, onRevoked }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleRevoke() {
    if (!reason.trim()) return;
    setSubmitting(true);
    onRevoked(reason)
      .then(() => { setReason(''); onClose(); })
      .catch(() => setSubmitting(false));
  }

  const patient = query?.patientName || 'this patient';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke Query"
      icon="↩"
      size="small"
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        {
          label: submitting ? 'Revoking…' : 'Revoke',
          variant: 'danger',
          onClick: handleRevoke,
          disabled: !reason.trim() || submitting,
        },
      ]}
    >
      <p class="mds-cc__revoke-hint">
        This pulls back the outstanding signature request for <strong>{patient}</strong>.
        The practitioner's existing signing link will stop working immediately.
        You can undo this right after.
      </p>
      <label class="mds-cc__revoke-label" for="mds-cc-revoke-reason">Reason for revoking</label>
      <textarea
        id="mds-cc-revoke-reason"
        class="mds-cc__revoke-textarea"
        rows={3}
        value={reason}
        onInput={(e) => setReason(e.target.value)}
        placeholder="Why is this query being revoked?"
      />
    </Modal>
  );
}
