import { useState, useEffect, useRef } from 'preact/hooks';
import { toggleReason } from '../reason-codes.js';

/**
 * ReasonChecklist — the checkbox cert form (certForm.template === 'champion_checkbox').
 *
 * Collapsed (the default once anything is checked): just the checked reasons as
 * chips plus "Edit reasons". Expanded: every reason on the org's paper form in one
 * grid, in the paper's order — the catalog arrives column-major, and a column-flow
 * grid lays it out like the printed form. `onExpandedChange` lets the modal widen
 * only while the grid is open. Boxes the AI checked
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
export function ReasonChecklist({ form, value, other, onChange, onOtherChange, onExpandedChange }) {
  const list = value || [];
  const byCode = new Map(list.map((s) => [s.code, s]));
  const otherText = (other || '').trim();

  // Summary first: the nurse sees what is checked, and opens the full 36-box
  // grid only to change it. With nothing to summarize, start open.
  // Until the nurse touches it, the view follows the data: open while nothing is
  // checked, the summary once reasons exist (the modal seeds `value` just after
  // mounting, and "Re-check from chart" can fill an empty form). After she opens,
  // closes or checks something herself, her choice holds.
  const touched = useRef(false);
  const [chosen, setChosen] = useState(false);
  const hasAny = list.length > 0 || !!otherText;
  const expanded = touched.current ? chosen : !hasAny;
  const setExpanded = (next) => {
    touched.current = true;
    setChosen(next);
  };
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded]);
  const toggle = (code) => {
    if (!touched.current) setExpanded(true);
    onChange(toggleReason(list, code, form));
  };
  const checkedInOrder = (form?.reasons || []).filter((r) => byCode.has(r.code));

  if (!expanded) {
    return (
      <div class="cm-reasons-wrap">
        <div class="cm-reasons-summary">
          {checkedInOrder.map((r) => {
            const sel = byCode.get(r.code);
            return (
              <span key={r.code} class="cm-reason-chip">
                <span class="cm-reason-chip__label">{r.label}</span>
                {sel.auto && <Sparkle code={r.code} evidence={sel.evidence} />}
              </span>
            );
          })}
          {otherText && <span class="cm-reason-chip cm-reason-chip--other">Other: {otherText}</span>}
          {/* NO_TRACK */}
          <button type="button" class="cm-reasons-toggle" onClick={() => setExpanded(true)}>
            Edit reasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="cm-reasons-wrap">
      {/* Only a real count; with nothing checked (even if Other is filled) say nothing. */}
      {list.length > 0 && <div class="cm-reasons__count">{list.length} checked</div>}
      <div
        class="cm-reasons"
        style={{ gridTemplateRows: `repeat(${Math.ceil((form?.reasons?.length || 0) / 4) || 1}, auto)` }}
      >
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
                onChange={() => toggle(r.code)}
              />
              <span class="cm-check-box" />
              <span class="cm-reason__label">{r.label}</span>
              {sel?.auto && <Sparkle code={r.code} evidence={sel.evidence} />}
            </label>
          );
        })}
      </div>
      <div class="cm-reasons-footer">
        <label class="cm-reasons-other">
          <span class="cm-reasons-other__label">Other</span>
          <input
            type="text"
            class="cm-input"
            value={other || ''}
            onInput={(e) => {
              if (!touched.current) setExpanded(true);
              onOtherChange(e.target.value);
            }}
            placeholder="Any other reason for skilled care"
          />
        </label>
        {(list.length > 0 || otherText) && (
          /* NO_TRACK */
          <button type="button" class="cm-reasons-toggle" onClick={() => setExpanded(false)}>
            Done
          </button>
        )}
      </div>
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
