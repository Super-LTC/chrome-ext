/**
 * Shared UI primitives for the Settings panel. Preact JSX (h auto-injected by
 * @preact/preset-vite — no `import { h }` needed, matching the rest of content/).
 */

/** Pill switch (role=switch). Controlled: parent owns `checked`. */
export function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      class={`sset-switch${checked ? ' is-on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span class="sset-switch__knob" />
    </button>
  );
}

/** Labelled section wrapper: an eyebrow label above an inset card, with an
 *  optional one-line `sub` description under the label. */
export function Section({ label, hint, sub, children }) {
  return (
    <section class="sset-section">
      {label ? (
        <div class="sset-section__head">
          <span class="sset-section__label">{label}</span>
          {hint ? <span class="sset-section__hint">{hint}</span> : null}
        </div>
      ) : null}
      {sub ? <div class="sset-section__sub">{sub}</div> : null}
      <div class="sset-section__body">{children}</div>
    </section>
  );
}

/**
 * Sticky footer with a status message + primary Save. `status` is
 * { kind: 'ok'|'err'|'idle', text } or null.
 */
export function SaveBar({ onSave, saving, disabled, status }) {
  return (
    <div class="sset-savebar">
      <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">
        {status?.text || ''}
      </div>
      <button
        type="button"
        class="sset-btn sset-btn--primary"
        onClick={onSave}
        disabled={saving || disabled}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
