import { formatSlot, isSlotInFuture, timeOptions, todayLocal } from '../schedule-slot.js';

/**
 * Date + time picker for a scheduled send.
 *
 * Time is a half-hour select rather than a free text field: nobody schedules a
 * certification for 6:07, and a select cannot produce an unparseable value.
 * The `min` on the date input stops a nurse picking yesterday, which the backend
 * would reject anyway — better to make it unreachable than to explain it.
 */
export function ScheduleSlotPicker({ date, time, onDateChange, onTimeChange }) {
  const valid = isSlotInFuture(date, time);

  return (
    <div class="cm-section cm-section--schedule">
      <div class="cm-section__head">
        <span class="cm-section__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </span>
        <span class="cm-section__label">Send on</span>
      </div>

      <div class="cm-schedule__row">
        <input
          class="cm-input cm-input--date"
          type="date"
          value={date}
          min={todayLocal()}
          onInput={(e) => onDateChange(e.target.value)}
        />
        <select
          class="cm-input cm-input--time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
        >
          {timeOptions().map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {valid ? (
        <p class="cm-section__hint">
          Goes out <strong>{formatSlot(date, time)}</strong>, facility time. Cancels itself if the
          resident is discharged or the cert is signed first.
        </p>
      ) : (
        <p class="cm-section__hint cm-section__hint--warn">
          Pick a date and time in the future.
        </p>
      )}
    </div>
  );
}
