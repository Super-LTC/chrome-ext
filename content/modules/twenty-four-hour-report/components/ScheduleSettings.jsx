import { useEffect, useRef, useState } from 'preact/hooks';
import {
  formatHourLabel,
  formatTimezoneLabel,
  intervalsEqual,
  WEEKDAYS,
} from '../utils/api.js';

const PRESET_HOURS = [3, 6, 7];
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

/**
 * ScheduleSettings — always-visible schedule bar + popover editor.
 */
export function ScheduleSettings({
  isOpen,
  onToggle,
  onClose,
  schedule,
  loading,
  saving,
  error,
  selectedHour,
  onHourChange,
  isDirty,
  intervalByDay,
  onIntervalChange,
  intervalsDirty,
  validIntervals,
  defaultIntervalByDay,
  onSave,
  onReset,
  onRetry,
}) {
  const wrapRef = useRef(null);
  const [showAllHours, setShowAllHours] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowAllHours(false);
      return undefined;
    }
    const handlePointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Revert of local edits is centralized in the parent's onClose handler.
  const handleCancel = () => {
    onClose();
  };

  const tzLabel = formatTimezoneLabel(schedule?.timezone);
  const savedLabel = schedule ? formatHourLabel(schedule.scheduleHour) : null;
  const defaultHour = schedule?.defaultScheduleHour ?? 3;
  const hourDiffersFromDefault = schedule != null && schedule.scheduleHour !== defaultHour;
  const intervalsDifferFromDefault =
    defaultIntervalByDay != null &&
    intervalByDay != null &&
    !intervalsEqual(intervalByDay, defaultIntervalByDay);
  const showReset = hourDiffersFromDefault || intervalsDifferFromDefault;
  const canSave = (isDirty || intervalsDirty) && !saving;
  const intervals = validIntervals?.length ? validIntervals : [24, 48, 72];
  const presetsCoverSelection = selectedHour != null && PRESET_HOURS.includes(selectedHour);

  const triggerText = (() => {
    if (loading) return 'Loading report schedule…';
    if (error && !schedule) return 'Could not load schedule';
    if (savedLabel) {
      return (
        <>
          Daily report at <strong>{savedLabel}</strong>
          {tzLabel ? <> ({tzLabel})</> : null}
        </>
      );
    }
    return 'Set report delivery time';
  })();

  const panel = (() => {
    if (loading) {
      return <div class="thr__schedule-loading">Loading schedule…</div>;
    }
    if (error && !schedule) {
      return (
        <div class="thr__schedule-error">
          <p>Couldn't load report schedule.</p>
          {/* NO_TRACK */}
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      );
    }

    return (
      <>
        <div class="thr__schedule-head">
          <span class="thr__schedule-label">When does the daily report run?</span>
          <p class="thr__schedule-help">
            Pick the hour each day when this building's automated 24-hour report
            is generated. The report covers the previous 24 hours ending at that
            time{tzLabel ? <> ({tzLabel})</> : null}.
          </p>
        </div>

        <p class="thr__schedule-presets-label">Popular times</p>
        <div class="thr__schedule-presets">
          {PRESET_HOURS.map((h) => {
            const isSelected = selectedHour === h;
            return (
              <button
                key={h}
                type="button"
                class={`thr__preset-pill${isSelected ? ' is-selected' : ''}`}
                onClick={() => onHourChange(h)}
                disabled={saving}
                aria-pressed={isSelected}
              >
                {formatHourLabel(h)}
              </button>
            );
          })}
        </div>

        {!showAllHours && !presetsCoverSelection && selectedHour != null && (
          <p class="thr__schedule-current-pick">
            Selected: <strong>{formatHourLabel(selectedHour)}</strong>
          </p>
        )}

        {!showAllHours && (
          // NO_TRACK
          <button
            type="button"
            class="thr__schedule-more-btn"
            onClick={() => setShowAllHours(true)}
          >
            Choose a different hour
          </button>
        )}

        {showAllHours && (
          <div class="thr__hour-picker">
            <p class="thr__schedule-presets-label">All hours</p>
            <div class="thr__hour-grid" role="listbox" aria-label="Select hour">
              {ALL_HOURS.map((h) => {
                const isSelected = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-label={formatHourLabel(h)}
                    class={`thr__hour-pill${isSelected ? ' is-selected' : ''}`}
                    onClick={() => onHourChange(h)}
                    disabled={saving}
                  >
                    {formatHourLabel(h)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {intervalByDay && (
          <div class="thr__window-section">
            <p class="thr__schedule-presets-label">Report window per day</p>
            <p class="thr__schedule-help thr__window-help">
              How far back each day's report looks. Set a day to 48h or 72h so
              its report covers days no one is on site.
            </p>
            <div class="thr__window-list" role="group" aria-label="Report window per weekday">
              {WEEKDAYS.map(({ key, label }) => {
                const current = Number(intervalByDay[key]);
                const isWeekendCover = key === '1' && current === 72;
                return (
                  <div class="thr__window-row" key={key}>
                    <span class="thr__window-day">
                      {label}
                      {isWeekendCover && (
                        <span class="thr__window-note"> · covers the weekend</span>
                      )}
                    </span>
                    <div
                      class="thr__window-seg"
                      role="radiogroup"
                      aria-label={`${label} report window`}
                    >
                      {intervals.map((iv) => {
                        const isSelected = current === iv;
                        return (
                          // NO_TRACK
                          <button
                            key={iv}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            class={`thr__window-opt${isSelected ? ' is-selected' : ''}`}
                            onClick={() => onIntervalChange(key, iv)}
                            disabled={saving}
                          >
                            {iv}h
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && schedule && (
          <p class="thr__schedule-inline-error" role="alert">{error}</p>
        )}

        <div class="thr__schedule-footer">
          {showReset && (
            // NO_TRACK
            <button
              type="button"
              class="thr__schedule-reset-btn"
              onClick={onReset}
              disabled={saving}
            >
              Reset to defaults
            </button>
          )}
          <div class="thr__schedule-actions">
            {/* NO_TRACK */}
            <button
              type="button"
              class="thr__schedule-cancel"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            {/* NO_TRACK */}
            <button
              type="button"
              class="thr__schedule-save"
              onClick={onSave}
              disabled={!canSave}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </>
    );
  })();

  return (
    <div class="thr__settings-wrap" ref={wrapRef}>
      {/* NO_TRACK */}
      <button
        type="button"
        class={`thr__schedule-trigger${isOpen ? ' is-open' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={loading && !schedule}
      >
        <span class="thr__schedule-trigger-icon" aria-hidden="true">
          <GearIcon />
        </span>
        <span class="thr__schedule-trigger-text">{triggerText}</span>
        <span class="thr__schedule-trigger-action">
          {isOpen ? 'Close' : 'Change'}
        </span>
      </button>

      {isOpen && (
        <div
          class="thr__schedule-popover"
          role="dialog"
          aria-label="Report delivery time"
        >
          {panel}
        </div>
      )}
    </div>
  );
}
