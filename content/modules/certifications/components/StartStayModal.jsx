import { useState, useEffect, useMemo } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';
import { todayISO } from '../stay-dates.js';

/**
 * StartStayModal — start a cert stay by hand.
 *
 * Opened from two places:
 *   - the "+ Start cert stay" header button: no `prefill`, so the nurse picks
 *     a resident from the facility list (fetchCertResidents);
 *   - a "Needs a cert stay" row: `prefill` = {patientId, patientName,
 *     payerType, startDate, endDate}, resident fixed, dates filled in.
 *
 * The stay starts in manual mode with a draft initial certification — nothing
 * goes to a doctor until the nurse sends it from the list.
 *
 * `managedCareEnabled === false` hides the Managed care choice (unless the
 * prefill itself is managed care). null/undefined = unknown → shown.
 */

const PAYER_CHOICES = [
  { value: 'medicare_a', label: 'Medicare A' },
  { value: 'managed_care', label: 'Managed care' },
];

function StartStayModalBody({ isOpen, onClose, facilityName, orgSlug, prefill = null, managedCareEnabled, onStarted }) {
  const [residents, setResidents] = useState([]);
  const [residentsLoading, setResidentsLoading] = useState(!prefill);
  const [residentsError, setResidentsError] = useState(null);
  const [search, setSearch] = useState('');

  const showManaged = managedCareEnabled !== false || prefill?.payerType === 'managed_care';
  const payerChoices = PAYER_CHOICES.filter(c => c.value !== 'managed_care' || showManaged);

  // Initial values come from the prefill (a "Needs a cert stay" row), if any.
  const [patientId, setPatientId] = useState(prefill?.patientId || '');
  const [payerType, setPayerType] = useState(prefill?.payerType === 'managed_care' ? 'managed_care' : 'medicare_a');
  const [startDate, setStartDate] = useState(prefill?.startDate || '');
  const [hasLeft, setHasLeft] = useState(!!prefill?.endDate);
  const [endDate, setEndDate] = useState(prefill?.endDate || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // The picker list — only needed when no resident is prefilled.
  useEffect(() => {
    if (prefill || !facilityName || !orgSlug) return;
    let cancelled = false;
    setResidentsLoading(true);
    setResidentsError(null);
    window.CertAPI.fetchCertResidents(facilityName, orgSlug)
      .then((rows) => { if (!cancelled) setResidents(rows || []); })
      .catch((err) => {
        console.error('[Certifications] Failed to load residents:', err);
        if (!cancelled) setResidentsError(err?.message || 'Could not load residents');
      })
      .finally(() => { if (!cancelled) setResidentsLoading(false); });
    return () => { cancelled = true; };
  }, [prefill, facilityName, orgSlug]);

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter(r =>
      (r.patientName || '').toLowerCase().includes(term) ||
      String(r.patientExternalId || '').toLowerCase().includes(term)
    );
  }, [residents, search]);

  const today = todayISO();
  let dateProblem = null;
  if (startDate && startDate > today) dateProblem = "The start date can't be in the future.";
  else if (hasLeft && endDate && endDate > today) dateProblem = "The end date can't be in the future.";
  else if (hasLeft && endDate && startDate && endDate < startDate) dateProblem = "The end date can't be before the start date.";

  const canSubmit =
    !!patientId &&
    !!payerType &&
    !!startDate &&
    (!hasLeft || !!endDate) &&
    !dateProblem &&
    !!reason.trim() &&
    !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    Promise.resolve()
      .then(() => window.CertAPI.startManualStay(facilityName, orgSlug, {
        patientId,
        payerType,
        startDate,
        endDate: hasLeft ? endDate : null,
        reason: reason.trim(),
      }))
      .then((result) => {
        setSubmitting(false);
        window.SuperToast?.success?.('Cert stay started');
        onClose();
        onStarted?.(result);
      })
      .catch((err) => {
        console.error('[Certifications] Start stay failed:', err);
        setError(err?.message || 'Could not start the cert stay. Try again.');
        setSubmitting(false);
      });
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="Start cert stay"
      subtitle={prefill?.patientName}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Starting...' : 'Start stay', variant: 'primary', onClick: handleSubmit, disabled: !canSubmit },
      ]}
    >
      {!prefill && (
        <div class="cm-section">
          <div class="cm-section__head">
            <span class="cm-section__label">Resident</span>
          </div>
          <input
            class="cm-input"
            type="search"
            value={search}
            onInput={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID"
            data-field="residentSearch"
          />
          <div class="cm-resident-list" role="radiogroup" aria-label="Resident">
            {residentsLoading && <div class="cm-resident-list__state">Loading residents...</div>}
            {!residentsLoading && residentsError && (
              <div class="cm-error" role="alert">{residentsError}</div>
            )}
            {!residentsLoading && !residentsError && filteredResidents.length === 0 && (
              <div class="cm-resident-list__state">
                {residents.length === 0 ? 'No residents found' : 'No residents match'}
              </div>
            )}
            {!residentsLoading && !residentsError && filteredResidents.map(r => {
              const disabled = !!r.hasOpenStay;
              const selected = patientId === r.patientId;
              return (
                <label
                  key={r.patientId}
                  class={`cm-resident${selected ? ' cm-resident--selected' : ''}${disabled ? ' cm-resident--disabled' : ''}`}
                  data-patient-id={r.patientId}
                >
                  <input
                    type="radio"
                    class="cm-discharge__radio"
                    name="startStayResident"
                    value={r.patientId}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => setPatientId(r.patientId)}
                  />
                  <span class="cm-resident__name">{r.patientName}</span>
                  {r.status === 'discharged' && <span class="cm-resident__tag">Discharged</span>}
                  <span class="cm-resident__meta">
                    {disabled ? 'already has a stay' : (r.currentPayer || '')}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">Payer</span>
        </div>
        <div class="cm-discharge cm-discharge--inline">
          {payerChoices.map(c => (
            <label
              key={c.value}
              class={`cm-discharge__option${payerType === c.value ? ' cm-discharge__option--selected' : ''}`}
            >
              <input
                type="radio"
                class="cm-discharge__radio"
                name="startStayPayer"
                value={c.value}
                checked={payerType === c.value}
                onChange={() => setPayerType(c.value)}
              />
              <span class="cm-discharge__dot" />
              <span class="cm-discharge__label">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__label">Start date</span>
          <span class="cm-section__badge cm-section__badge--warn">Required</span>
        </div>
        <input
          class="cm-input cm-input--date"
          type="date"
          value={startDate}
          max={today}
          onInput={(e) => setStartDate(e.target.value)}
          data-field="startDate"
        />
        <label class="cm-inline-check">
          <input
            type="checkbox"
            class="cm-check"
            checked={hasLeft}
            onChange={(e) => setHasLeft(e.target.checked)}
            data-field="hasLeft"
          />
          <span class="cm-check-box" />
          <span>Resident has already left</span>
        </label>
        {hasLeft && (
          <input
            class="cm-input cm-input--date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={today}
            onInput={(e) => setEndDate(e.target.value)}
            aria-label="End date"
            data-field="endDate"
          />
        )}
        {dateProblem && <div class="cm-field-note" role="note">{dateProblem}</div>}
      </div>

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
          placeholder="e.g., Payer was entered late in the census"
          data-field="reason"
        />
      </div>

      <p class="cm-footnote">
        This starts a manual stay. The initial certification is created as a draft — send it from the list as usual.
      </p>
      {error && <div class="cm-error" role="alert">{error}</div>}
    </CertModal>
  );
}

/**
 * The body only mounts while open, so every open starts from a fresh form —
 * no reset effect racing the nurse's first keystroke.
 */
export function StartStayModal(props) {
  if (!props.isOpen) return null;
  return <StartStayModalBody {...props} />;
}
