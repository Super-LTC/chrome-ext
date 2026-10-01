import { useState, useEffect } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';
import { DischargePlanPicker, parseDischargePlan, composeDischargePlan, isDischargePlanValid } from './DischargePlanPicker.jsx';
import { GenerateReasonButton } from './GenerateReasonButton.jsx';
import { ReasonChecklist } from './ReasonChecklist.jsx';
import { mergeRegenerated, hasAnyReason, seedReasonOther, NO_REASON_MESSAGE } from '../reason-codes.js';

/**
 * EditClinicalReasonModal — edit a recert's reason, estimated stay and discharge plan.
 *
 * With an org-level `certForm` (checkbox cert form) a recert's reason is the
 * org's paper checklist instead of free text, and onSaved receives
 * { reasonCodes, reasonOther, estimatedDays, planForDischarge } — no
 * clinicalReason. Without one, onSaved gets the standard
 * { clinicalReason, estimatedDays, planForDischarge }.
 */
export function EditClinicalReasonModal({ isOpen, onClose, cert, onSaved, certForm = null }) {
  const [clinicalReason, setClinicalReason] = useState('');
  const [reasons, setReasons] = useState([]);
  const [reasonOther, setReasonOther] = useState('');
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [estimatedDays, setEstimatedDays] = useState(30);
  const [dischargeOption, setDischargeOption] = useState('');
  const [dischargeOtherText, setDischargeOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRecert = cert?.type === 'day_14_recert' || cert?.type === 'day_30_recert';
  const checkboxForm = !!certForm && isRecert;
  const dischargeOptions = checkboxForm && certForm.dischargeOptions?.length ? certForm.dischargeOptions : undefined;

  useEffect(() => {
    if (isOpen && cert) {
      setClinicalReason(cert.clinicalReason || '');
      setReasons(cert.reasonCodes ?? []);
      setReasonOther(seedReasonOther(cert));
      setEstimatedDays(cert.estimatedDays || 30);
      const parsed = parseDischargePlan(cert.planForDischarge, dischargeOptions);
      setDischargeOption(parsed.option);
      setDischargeOtherText(parsed.otherText);
    }
  }, [isOpen, cert?.id]);

  const hasReason = checkboxForm ? hasAnyReason(reasons, reasonOther) : !!clinicalReason.trim();
  const canSave = hasReason && isDischargePlanValid(dischargeOption, dischargeOtherText) && !submitting;

  function handleSave() {
    if (!hasReason && checkboxForm) {
      // Save is disabled in this state; this covers a click that slips through.
      window.SuperToast?.error?.(NO_REASON_MESSAGE);
      return;
    }
    if (!canSave) return;
    setSubmitting(true);
    const planForDischarge = composeDischargePlan(dischargeOption, dischargeOtherText);
    const body = checkboxForm
      ? { reasonCodes: reasons, reasonOther: reasonOther.trim() || null, estimatedDays, planForDischarge }
      : { clinicalReason, estimatedDays, planForDischarge };
    onSaved(body)
      .then(() => onClose())
      .catch(() => setSubmitting(false));
  }

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title={checkboxForm ? 'Edit Reasons' : 'Edit Clinical Reason'}
      subtitle={cert?.patientName}
      wide={checkboxForm && reasonsOpen}
      actions={[
        { label: 'Cancel', variant: 'secondary', onClick: onClose },
        { label: submitting ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, disabled: !canSave }
      ]}
    >
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </span>
          <span class="cm-section__label">{checkboxForm ? 'Reasons for continued care' : 'Clinical Reason'}</span>
          {checkboxForm ? (
            <GenerateReasonButton
              certId={cert?.id}
              certType={cert?.type}
              hasText={hasReason}
              surface="edit"
              form="checkbox"
              onGenerated={(_text, _source, body) =>
                setReasons(current => mergeRegenerated(current, body?.reasonCodes, certForm))
              }
            />
          ) : (
            <GenerateReasonButton
              certId={cert?.id}
              certType={cert?.type}
              hasText={!!clinicalReason.trim()}
              surface="edit"
              onGenerated={(text) => setClinicalReason(text)}
            />
          )}
        </div>
        {checkboxForm ? (
          <>
            <ReasonChecklist
              form={certForm}
              value={reasons}
              other={reasonOther}
              onChange={setReasons}
              onOtherChange={setReasonOther}
              onExpandedChange={setReasonsOpen}
            />
            {!hasReason && (
              <p class="cm-section__hint cm-section__hint--warn">{NO_REASON_MESSAGE}</p>
            )}
          </>
        ) : (
          <textarea
            class="cm-input cm-input--textarea"
            rows={3}
            value={clinicalReason}
            onInput={(e) => setClinicalReason(e.target.value)}
            placeholder="Describe the clinical reason for continued skilled nursing care..."
          />
        )}
        <div class="cm-section__row">
          <span class="cm-section__meta">Estimated stay</span>
          <div class="cm-input--days-wrap">
            <input
              class="cm-input cm-input--days"
              type="number"
              min={1}
              value={estimatedDays}
              onInput={(e) => setEstimatedDays(parseInt(e.target.value) || 30)}
            />
            <span class="cm-input--days-unit">days</span>
          </div>
        </div>
        <div class="cm-section__divider" />
        <div class="cm-section__head">
          <span class="cm-section__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span class="cm-section__label">Plan for Discharge</span>
        </div>
        <DischargePlanPicker
          options={dischargeOptions}
          option={dischargeOption}
          otherText={dischargeOtherText}
          onOptionChange={setDischargeOption}
          onOtherTextChange={setDischargeOtherText}
        />
      </div>
    </CertModal>
  );
}
