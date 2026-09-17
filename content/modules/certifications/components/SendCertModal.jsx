import { useState, useEffect } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';
import { DischargePlanPicker, parseDischargePlan, composeDischargePlan, isDischargePlanValid } from './DischargePlanPicker.jsx';
import { GenerateReasonButton } from './GenerateReasonButton.jsx';
import { ScheduleSlotPicker } from './ScheduleSlotPicker.jsx';
import { HourglassIcon } from './HourglassIcon.jsx';
import { defaultSlot, formatSlot, isSlotInFuture } from '../schedule-slot.js';

/**
 * SendCertModal — single-screen send flow, with a schedule mode.
 * Shows clinical reason (recerts), delay reason (delayed), and practitioner selection.
 *
 * Scheduling lives here as a MODE rather than in its own modal, deliberately. A
 * scheduled send has to satisfy exactly the same preconditions as an immediate
 * one — a recert queued without its clinical reason would fail unattended at
 * 6 AM with nobody watching — so it reuses these fields, this validation and the
 * same practitioner picker. Only the footer differs: commit now, or commit to a
 * future moment.
 *
 * `startInScheduleMode` lets the cert row's hourglass open straight into it.
 */
export function SendCertModal({ isOpen, onClose, cert, facilityName, orgSlug, onSent, startInScheduleMode = false, onScheduleChanged }) {
  const [clinicalReason, setClinicalReason] = useState('');
  const [estimatedDays, setEstimatedDays] = useState(30);
  const [dischargeOption, setDischargeOption] = useState('');
  const [dischargeOtherText, setDischargeOtherText] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [practitioners, setPractitioners] = useState([]);
  const [practitionersLoading, setPractitionersLoading] = useState(false);
  const [selectedPractitioners, setSelectedPractitioners] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [slotDate, setSlotDate] = useState('');
  const [slotTime, setSlotTime] = useState('06:00');
  const [cancelling, setCancelling] = useState(false);

  // The live schedule the backend stamped onto this cert, if any.
  const existingSchedule = cert?.scheduledSend || null;

  const isRecert = cert?.type === 'day_14_recert' || cert?.type === 'day_30_recert';
  const isDelayed = cert?.isDelayed;
  const certTypeLabel = cert?.type === 'initial' ? 'Initial' : cert?.type === 'day_14_recert' ? 'Day 14 Recert' : 'Day 30 Recert';

  useEffect(() => {
    if (!isOpen || !cert) return;
    setClinicalReason(cert.clinicalReason || '');
    setEstimatedDays(cert.estimatedDays || 30);
    const parsed = parseDischargePlan(cert.planForDischarge);
    setDischargeOption(parsed.option);
    setDischargeOtherText(parsed.otherText);
    setDelayReason(cert.delayReason || '');

    // An existing schedule seeds the picker and its recipients, so "Edit" opens
    // on what is actually queued rather than on the defaults.
    const slot = existingSchedule
      ? { date: existingSchedule.scheduledLocalDate, time: existingSchedule.scheduledLocalTime }
      : defaultSlot(cert.dueDate);
    setSlotDate(slot.date);
    setSlotTime(slot.time);
    setScheduleMode(startInScheduleMode || !!existingSchedule);
    setSelectedPractitioners(new Set(existingSchedule?.practitionerIds || []));

    setPractitionersLoading(true);
    window.CertAPI.fetchPractitioners(facilityName, orgSlug)
      .then(practs => setPractitioners(practs))
      .catch(err => {
        console.error('[Certifications] Failed to load practitioners:', err);
        window.SuperAnalytics?.track?.('error_caught', {
          surface: 'cert_practitioners_load',
          error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        });
      })
      .finally(() => setPractitionersLoading(false));
  }, [isOpen, cert?.id]);

  function handleSend() {
    if (selectedPractitioners.size === 0) return;
    if (isRecert && !clinicalReason.trim()) return;
    if (isRecert && !isDischargePlanValid(dischargeOption, dischargeOtherText)) return;
    if (isDelayed && !delayReason.trim()) return;
    setSending(true);
    const planForDischarge = composeDischargePlan(dischargeOption, dischargeOtherText);
    const saveReason = isRecert
      ? window.CertAPI.saveClinicalReason(cert.id, { clinicalReason, estimatedDays, planForDischarge })
      : Promise.resolve();
    saveReason
      .then(() => window.CertAPI.sendCert(cert.id, [...selectedPractitioners], isDelayed ? delayReason : undefined))
      .then(() => {
        const names = practitioners
          .filter(p => selectedPractitioners.has(p.id))
          .map(p => `${p.firstName} ${p.lastName}`);
        const recipientStr = names.length <= 2
          ? names.join(' & ')
          : `${names.length} practitioners`;
        window.SuperToast?.success?.(`${certTypeLabel} for ${cert.patientName} sent to ${recipientStr}`);
        onSent?.();
        onClose();
      })
      .catch(err => {
        console.error('[Certifications] Failed to send:', err);
        window.SuperAnalytics?.track?.('error_shown', {
          surface: 'cert_send',
          error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
          error_type: 'api_error',
        });
        window.SuperToast?.error?.('Failed to send certification');
      })
      .finally(() => setSending(false));
  }

  /**
   * Shared precondition check for both commit paths. Identical on purpose: a
   * scheduled send is the same send, later, so anything that would block it now
   * must block it then — otherwise the failure surfaces at 6 AM instead of here.
   */
  function meetsSendPreconditions() {
    if (selectedPractitioners.size === 0) return false;
    if (isRecert && !clinicalReason.trim()) return false;
    if (isRecert && !isDischargePlanValid(dischargeOption, dischargeOtherText)) return false;
    if (isDelayed && !delayReason.trim()) return false;
    return true;
  }

  function handleSchedule() {
    if (!meetsSendPreconditions()) return;
    if (!isSlotInFuture(slotDate, slotTime)) return;
    setSending(true);

    const planForDischarge = composeDischargePlan(dischargeOption, dischargeOtherText);
    const saveReason = isRecert
      ? window.CertAPI.saveClinicalReason(cert.id, { clinicalReason, estimatedDays, planForDischarge })
      : Promise.resolve();

    saveReason
      .then(() => window.CertAPI.scheduleCertSend(cert.id, {
        practitionerIds: [...selectedPractitioners],
        scheduledLocalDate: slotDate,
        scheduledLocalTime: slotTime,
        delayReason: isDelayed ? delayReason : undefined,
      }))
      .then(() => {
        window.SuperToast?.success?.(
          `${certTypeLabel} for ${cert.patientName} scheduled for ${formatSlot(slotDate, slotTime)}`
        );
        onScheduleChanged?.();
        onSent?.();
        onClose();
      })
      .catch(err => {
        console.error('[Certifications] Failed to schedule:', err);
        window.SuperAnalytics?.track?.('error_shown', {
          surface: 'cert_schedule',
          error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
          error_type: 'api_error',
        });
        window.SuperToast?.error?.(err.message || 'Failed to schedule certification');
      })
      .finally(() => setSending(false));
  }

  function handleCancelSchedule() {
    setCancelling(true);
    window.CertAPI.cancelCertSchedule(cert.id)
      .then(() => {
        window.SuperToast?.success?.(`Scheduled send cancelled for ${cert.patientName}`);
        onScheduleChanged?.();
        onSent?.();
        onClose();
      })
      .catch(err => {
        console.error('[Certifications] Failed to cancel schedule:', err);
        window.SuperToast?.error?.('Failed to cancel scheduled send');
      })
      .finally(() => setCancelling(false));
  }

  function togglePractitioner(id) {
    setSelectedPractitioners(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedPractitioners(prev =>
      prev.size === practitioners.length ? new Set() : new Set(practitioners.map(p => p.id))
    );
  }

  if (!cert) return null;

  const preconditionsMet = meetsSendPreconditions();
  const canSend = preconditionsMet && !sending;
  const canSchedule = preconditionsMet && isSlotInFuture(slotDate, slotTime) && !sending;

  // Footer: "Send now" is always available. The hourglass toggles the schedule
  // picker into the body and swaps the primary button's commitment; in schedule
  // mode the toggle reads as a way back rather than a dead end.
  const actions = [
    { label: 'Cancel', variant: 'secondary', onClick: onClose },
    {
      label: scheduleMode ? 'Send now instead' : 'Schedule',
      variant: 'ghost',
      icon: <HourglassIcon size={13} filled={!!existingSchedule} />,
      onClick: () => setScheduleMode(!scheduleMode),
      disabled: sending || cancelling,
    },
    scheduleMode
      ? {
          label: sending
            ? 'Scheduling...'
            : existingSchedule
              ? 'Update schedule'
              : `Schedule for ${formatSlot(slotDate, slotTime)}`,
          variant: 'primary',
          onClick: handleSchedule,
          disabled: !canSchedule,
        }
      : {
          label: sending ? 'Sending...' : `Send to ${selectedPractitioners.size} practitioner${selectedPractitioners.size !== 1 ? 's' : ''}`,
          variant: 'primary',
          onClick: handleSend,
          disabled: !canSend,
        },
  ];

  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title={scheduleMode ? 'Schedule Certification' : 'Send Certification'}
      subtitle={`${cert.patientName} · ${certTypeLabel}`}
      actions={actions}
    >
      {/* Already queued — the one place a nurse can see and undo it for this cert */}
      {existingSchedule && (
        <div class="cm-scheduled-banner">
          <span class="cm-scheduled-banner__icon">
            <HourglassIcon size={14} filled />
          </span>
          <div class="cm-scheduled-banner__text">
            <strong>Scheduled {existingSchedule.displayLabel}</strong>
            <span class="cm-scheduled-banner__meta">
              Sending now instead will replace it.
            </span>
          </div>
          {/* NO_TRACK */}
          <button
            class="cm-scheduled-banner__cancel"
            onClick={handleCancelSchedule}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel send'}
          </button>
        </div>
      )}

      {scheduleMode && (
        <ScheduleSlotPicker
          date={slotDate}
          time={slotTime}
          onDateChange={setSlotDate}
          onTimeChange={setSlotTime}
        />
      )}
      {/* Clinical Reason */}
      {isRecert && (
        <div class="cm-section">
          <div class="cm-section__head">
            <span class="cm-section__icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </span>
            <span class="cm-section__label">Clinical Reason</span>
            <GenerateReasonButton
              certId={cert.id}
              certType={cert.type}
              hasText={!!clinicalReason.trim()}
              surface="send"
              onGenerated={(text) => setClinicalReason(text)}
            />
          </div>
          <textarea
            class="cm-input cm-input--textarea"
            rows={2}
            value={clinicalReason}
            onInput={(e) => setClinicalReason(e.target.value)}
            placeholder="Reason for continued skilled nursing care..."
          />
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
            option={dischargeOption}
            otherText={dischargeOtherText}
            onOptionChange={setDischargeOption}
            onOtherTextChange={setDischargeOtherText}
          />
        </div>
      )}

      {/* Delay Reason */}
      {isDelayed && (
        <div class="cm-section cm-section--warn">
          <div class="cm-section__head">
            <span class="cm-section__icon cm-section__icon--warn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
            <span class="cm-section__label">Delay Reason</span>
            <span class="cm-section__badge cm-section__badge--warn">Required</span>
          </div>
          <p class="cm-section__hint">This certification is overdue. Document the reason for compliance.</p>
          <textarea
            class="cm-input cm-input--textarea"
            rows={2}
            value={delayReason}
            onInput={(e) => setDelayReason(e.target.value)}
            placeholder="Why was this certification delayed..."
          />
        </div>
      )}

      {/* Send history */}
      {cert.sends?.length > 0 && (
        <div class="cm-notice">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          Previously sent to {cert.sends.map(s => s.practitionerName).join(', ')}
        </div>
      )}

      {/* Practitioners */}
      <div class="cm-section">
        <div class="cm-section__head">
          <span class="cm-section__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </span>
          <span class="cm-section__label">Send to</span>
          <span class="cm-section__count">{selectedPractitioners.size} of {practitioners.length}</span>
        </div>
        {practitionersLoading ? (
          <div class="cm-loading">
            <div class="cm-loading__spinner" />
            Loading practitioners...
          </div>
        ) : (
          <div class="cm-practitioners">
            <label class="cm-pract cm-pract--all">
              <input
                type="checkbox"
                class="cm-check"
                checked={selectedPractitioners.size === practitioners.length && practitioners.length > 0}
                onChange={toggleAll}
              />
              <span class="cm-check-box" />
              <span class="cm-pract__label">Select all</span>
            </label>
            {practitioners.map(p => (
              <label key={p.id} class={`cm-pract${selectedPractitioners.has(p.id) ? ' cm-pract--selected' : ''}`}>
                <input
                  type="checkbox"
                  class="cm-check"
                  checked={selectedPractitioners.has(p.id)}
                  onChange={() => togglePractitioner(p.id)}
                />
                <span class="cm-check-box" />
                <span class="cm-pract__label">
                  {p.firstName} {p.lastName}
                  {p.title && <span class="cm-pract__title">{p.title}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </CertModal>
  );
}
