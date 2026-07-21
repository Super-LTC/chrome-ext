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

/**
 * Labelled section wrapper: an eyebrow label above an inset card.
 * `hint` is a short right-aligned count ("6 selected"); `sub` is a descriptive
 * line that wraps under the label, for copy too long to sit on the same row.
 */
export function Section({ label, hint, sub, children }) {
  return (
    <section class="sset-section">
      {label ? (
        <div class="sset-section__head">
          <span class="sset-section__label">{label}</span>
          {hint ? <span class="sset-section__hint">{hint}</span> : null}
        </div>
      ) : null}
      {sub ? <p class="sset-section__sub">{sub}</p> : null}
      <div class="sset-section__body">{children}</div>
    </section>
  );
}

/**
 * Sticky footer with a status message + primary Save. `status` is
 * { kind: 'ok'|'err'|'idle', text } or null. When `dirty` and nothing else is
 * being reported, the status slot explains why Save is live.
 */
export function SaveBar({ onSave, saving, disabled, dirty, status }) {
  const text = status?.text || (dirty && !saving ? 'Unsaved changes' : '');
  const kind = status ? status.kind : (dirty ? 'dirty' : null);
  return (
    <div class="sset-savebar">
      <div class={`sset-status${kind ? ` is-${kind}` : ''}`} role="status">
        {text}
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
