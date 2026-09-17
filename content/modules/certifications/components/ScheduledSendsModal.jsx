import { useState } from 'preact/hooks';
import { CertModal } from './CertModal.jsx';
import { HourglassIcon } from './HourglassIcon.jsx';
import { CertTypeBadge } from './CertTypeBadge.jsx';
import { ScheduleSlotPicker } from './ScheduleSlotPicker.jsx';
import { isSlotInFuture } from '../schedule-slot.js';
import { formatShortDate } from '../cert-urgency.js';

/**
 * ScheduledSendsModal — everything queued to go out at this facility.
 *
 * The per-cert hourglass answers "is this one handled?". This answers "what is
 * about to happen?", which is the question a nurse has on Friday afternoon about
 * next week. Soonest first, because the next thing to fire is the only one that
 * can still surprise anyone.
 *
 * Editing is inline: expanding a row swaps in the same picker the send modal
 * uses, so there is one mental model for "pick a day" and no second nested modal.
 */
function ScheduledRow({ schedule, onSaved, onCancelled }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(schedule.scheduledLocalDate);
  const [time, setTime] = useState(schedule.scheduledLocalTime);
  const [busy, setBusy] = useState(false);

  function handleSave() {
    if (!isSlotInFuture(date, time)) return;
    setBusy(true);
    window.CertAPI.updateScheduledSend(schedule.id, {
      scheduledLocalDate: date,
      scheduledLocalTime: time,
    })
      .then(() => {
        window.SuperToast?.success?.(`Rescheduled ${schedule.patientName}'s certification`);
        setEditing(false);
        onSaved?.();
      })
      .catch((err) => {
        console.error('[Certifications] Failed to reschedule:', err);
        window.SuperToast?.error?.(err.message || 'Failed to reschedule');
      })
      .finally(() => setBusy(false));
  }

  function handleCancel() {
    setBusy(true);
    window.CertAPI.cancelScheduledSend(schedule.id)
      .then(() => {
        window.SuperToast?.success?.(`Cancelled scheduled send for ${schedule.patientName}`);
        onCancelled?.();
      })
      .catch((err) => {
        console.error('[Certifications] Failed to cancel scheduled send:', err);
        window.SuperToast?.error?.('Failed to cancel scheduled send');
      })
      .finally(() => setBusy(false));
  }

  return (
    <div class="cert-sched__row">
      <div class="cert-sched__row-main">
        <div class="cert-sched__row-left">
          <CertTypeBadge type={schedule.certType} />
          <span class="cert-sched__patient">{schedule.patientName}</span>
        </div>
        <div class="cert-sched__row-right">
          <span class="cert-sched__when">
            <HourglassIcon size={12} filled />
            {schedule.displayLabel}
          </span>
          {/* NO_TRACK */}
          <button
            class="cert-sched__btn"
            onClick={() => setEditing(!editing)}
            disabled={busy}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
          {/* NO_TRACK */}
          <button
            class="cert-sched__btn cert-sched__btn--danger"
            onClick={handleCancel}
            disabled={busy}
          >
            {busy ? '...' : 'Cancel'}
          </button>
        </div>
      </div>

      <div class="cert-sched__row-meta">
        <span>Due {formatShortDate(schedule.certDueDate)}</span>
        <span>
          To {schedule.practitionerNames.length <= 2
            ? schedule.practitionerNames.join(' & ')
            : `${schedule.practitionerNames.length} practitioners`}
        </span>
      </div>

      {editing && (
        <div class="cert-sched__editor">
          <ScheduleSlotPicker
            date={date}
            time={time}
            onDateChange={setDate}
            onTimeChange={setTime}
          />
          {/* NO_TRACK */}
          <button
            class="cert-sched__btn cert-sched__btn--primary"
            onClick={handleSave}
            disabled={busy || !isSlotInFuture(date, time)}
          >
            {busy ? 'Saving...' : 'Save new time'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ScheduledSendsModal({ isOpen, onClose, schedules, loading, error, onRefetch }) {
  return (
    <CertModal
      isOpen={isOpen}
      onClose={onClose}
      title="Scheduled Sends"
      subtitle={
        loading
          ? 'Loading...'
          : `${schedules.length} certification${schedules.length === 1 ? '' : 's'} queued`
      }
      actions={[{ label: 'Done', variant: 'secondary', onClick: onClose }]}
    >
      {loading && (
        <div class="cm-loading">
          <div class="cm-loading__spinner" />
          Loading scheduled sends...
        </div>
      )}

      {!loading && error && <div class="cm-notice cm-notice--warn">{error}</div>}

      {!loading && !error && schedules.length === 0 && (
        <div class="cert-sched__empty">
          <HourglassIcon size={22} />
          <p class="cert-sched__empty-title">Nothing scheduled</p>
          <p class="cert-sched__empty-text">
            Open a certification and use the hourglass to queue it for a specific day.
          </p>
        </div>
      )}

      {!loading && !error && schedules.length > 0 && (
        <div class="cert-sched__list">
          {schedules.map((s) => (
            <ScheduledRow
              key={s.id}
              schedule={s}
              onSaved={onRefetch}
              onCancelled={onRefetch}
            />
          ))}
        </div>
      )}
    </CertModal>
  );
}
