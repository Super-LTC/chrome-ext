/**
 * DischargePlanPicker — radio group for Plan for Discharge.
 *
 * Options default to Home Health Agency / Facility Care; an org on a custom
 * paper form passes its own via `options` (e.g. certForm.dischargeOptions).
 * Other always comes last, with a free-text input.
 *
 * Stored as a plain string: the option's own text, or "Other: [text]". The
 * picker's `option` value IS that text (or 'other'), so composing needs no
 * lookup and works the same for every option set.
 */

export const DEFAULT_DISCHARGE_OPTIONS = ['Home Health Agency', 'Facility Care'];

const OTHER = 'other';
const OTHER_PREFIX = 'Other: ';

/**
 * Parse a stored planForDischarge string back into option + otherText.
 * @param {string|null} str
 * @param {string[]} [options] — the option set the picker shows
 */
export function parseDischargePlan(str, options = DEFAULT_DISCHARGE_OPTIONS) {
  if (!str) return { option: '', otherText: '' };
  if (options.includes(str)) return { option: str, otherText: '' };
  if (str.startsWith(OTHER_PREFIX)) return { option: OTHER, otherText: str.slice(OTHER_PREFIX.length) };
  // Legacy free text, or a value from another option set — keep its words as "other"
  return { option: OTHER, otherText: str };
}

/** Compose option + otherText into a single string for the API */
export function composeDischargePlan(option, otherText) {
  if (!option) return '';
  if (option === OTHER) return `${OTHER_PREFIX}${otherText}`;
  return option;
}

/** Check if a valid discharge plan is selected */
export function isDischargePlanValid(option, otherText) {
  if (!option) return false;
  if (option === OTHER) return (otherText || '').trim().length > 0;
  return true;
}

export function DischargePlanPicker({ option, otherText, onOptionChange, onOtherTextChange, options }) {
  const choices = [
    ...(options?.length ? options : DEFAULT_DISCHARGE_OPTIONS).map((o) => ({ value: o, label: o })),
    { value: OTHER, label: 'Other' },
  ];
  return (
    <div class="cm-discharge">
      {choices.map(opt => (
        <label
          key={opt.value}
          class={`cm-discharge__option${option === opt.value ? ' cm-discharge__option--selected' : ''}`}
        >
          <input
            type="radio"
            class="cm-discharge__radio"
            name="dischargePlan"
            value={opt.value}
            checked={option === opt.value}
            onChange={() => onOptionChange(opt.value)}
          />
          <span class="cm-discharge__dot" />
          <span class="cm-discharge__label">{opt.label}</span>
        </label>
      ))}
      {option === OTHER && (
        <input
          class="cm-input cm-discharge__other-input"
          type="text"
          value={otherText}
          onInput={(e) => onOtherTextChange(e.target.value)}
          placeholder="e.g., Assisted living, long-term care, hospice..."
          autoFocus
        />
      )}
    </div>
  );
}
