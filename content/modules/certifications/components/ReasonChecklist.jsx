import { toggleReason } from '../reason-codes.js';

/**
 * ReasonChecklist — the checkbox cert form (certForm.template === 'champion_checkbox').
 *
 * Every reason on the org's paper form, in one grid, in the paper's order. The
 * catalog arrives column-major (column 1 top→bottom, then column 2…), so CSS
 * `columns: 4` lays it out exactly like the printed form. Boxes the AI checked
 * carry a sparkle; hovering or focusing it shows the evidence (clamped to three
 * lines; the full text is in the sparkle's title).
 *
 * Controlled: `value` is CertReasonSelection[] ([{code, auto, evidence}]) and
 * `other` the free-text Other line; changes go back through onChange / onOtherChange.
 *
 * @param {Object} props
 * @param {{reasons: Array<{code: string, label: string, column: number}>}} props.form
 * @param {Array<{code: string, auto: boolean, evidence: string|null}>|null} props.value
 * @param {string|null} props.other
 * @param {(next: Array<{code: string, auto: boolean, evidence: string|null}>) => void} props.onChange
 * @param {(text: string) => void} props.onOtherChange
 */
export function ReasonChecklist({ form, value, other, onChange, onOtherChange }) {
  const list = value || [];
  const byCode = new Map(list.map((s) => [s.code, s]));

  return (
    <div class="cm-reasons-wrap">
      {/* Only a real count; with nothing checked (even if Other is filled) say nothing. */}
      {list.length > 0 && <div class="cm-reasons__count">{list.length} checked</div>}
      <div class="cm-reasons">
        {(form?.reasons || []).map((r) => {
          const sel = byCode.get(r.code);
          return (
            <label
              key={r.code}
              class={`cm-reason${sel ? ' cm-reason--selected' : ''}`}
              data-column={r.column}
            >
              <input
                type="checkbox"
                class="cm-check"
                checked={!!sel}
                onChange={() => onChange(toggleReason(list, r.code, form))}
              />
              <span class="cm-check-box" />
              <span class="cm-reason__label">{r.label}</span>
              {sel?.auto && <Sparkle code={r.code} evidence={sel.evidence} />}
            </label>
          );
        })}
      </div>
      <label class="cm-reasons-other">
        <span class="cm-reasons-other__label">Other</span>
        <input
          type="text"
          class="cm-input"
          value={other || ''}
          onInput={(e) => onOtherChange(e.target.value)}
          placeholder="Any other reason for skilled care"
        />
      </label>
    </div>
  );
}

function Sparkle({ code, evidence }) {
  const tipId = `cm-reason-why-${code}`;
  return (
    <span
      class="cm-reason__spark"
      role="img"
      tabindex="0"
      aria-describedby={tipId}
      aria-label="Checked by AI"
      // The tooltip clamps at three lines; the native title carries the whole text.
      title={evidence || undefined}
      // The sparkle sits inside the row's <label>; without this a click on it
      // would activate the label and toggle the box.
      onClick={(e) => e.preventDefault()}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.8L18.7 9l-4.8 1.9L12 15.7l-1.9-4.8L5.3 9l4.8-1.2z"/><path d="M19 14l.7 1.9L21.6 16l-1.9.7L19 18.6l-.7-1.9L16.4 16l1.9-.1z"/></svg>
      <span class="cm-reason__why" role="tooltip" id={tipId}>
        {evidence || 'Checked by AI'}
      </span>
    </span>
  );
}
