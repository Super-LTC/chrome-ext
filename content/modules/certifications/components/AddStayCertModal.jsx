import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';

export const STAY_CERT_TYPES = [
  { value: 'initial', label: 'Initial certification' },
  { value: 'day_14_recert', label: 'Day 14 recertification' },
  { value: 'day_30_recert', label: 'Day 30 recertification' },
];

/**
 * AddStayCertModal — add one certification to an existing stay. It is created
 * as a draft; the nurse sends it from the list like any other.
 *
 * Defaults the type to the first one the stay doesn't have yet.
 * `onSubmit({type, dueDate})` returns a promise.
 */
function AddStayCertModalBody({ isOpen, onClose, patientName, existingTypes = [], onSubmit }) {
  const firstMissing = STAY_CERT_TYPES.find(t => !existingTypes.includes(t.value))?.value || 'initial';
  const [type, setType] = useState(firstMissing);
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = !!type && !!dueDate && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    Promise.resolve()
      .then(() => onSubmit({ type, dueDate }))
      .then(() => { setSubmitting(false); onClose(); })
      .catch((err) => {
        console.error('[Certifications] Add certification failed:', err);
        setError(err?.message || 'Could not add the certification. Try again.');
        setSubmitting(false);
      });
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add certification"
      subtitle={patientName}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Adding...' : 'Add', variant: 'primary', onClick: handleSubmit, disabled: !canSubmit },
      ]}
    >
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">Type</span>
        </div>
        <select
          class="cm-input cm-input--select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          data-field="type"
        >
          {STAY_CERT_TYPES.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}{existingTypes.includes(t.value) ? ' (already on this stay)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">Due date</span>
          <span class="cm-section__badge cm-section__badge--warn">Required</span>
        </div>
        <input
          class="cm-input cm-input--date"
          type="date"
          value={dueDate}
          onInput={(e) => setDueDate(e.target.value)}
          data-field="dueDate"
        />
        <p class="cm-section__hint cm-section__hint--plain cm-section__hint--below">
          It's added as a draft. Send it from the list as usual.
        </p>
      </div>
      {error && <div class="cm-error" role="alert">{error}</div>}
    </CertModal>
  );
}

/**
 * The body only mounts while open, so every open starts from a fresh form —
 * no reset effect racing the nurse's first keystroke.
 */
export function AddStayCertModal(props) {
  if (!props.isOpen) return null;
  return <AddStayCertModalBody {...props} />;
}
