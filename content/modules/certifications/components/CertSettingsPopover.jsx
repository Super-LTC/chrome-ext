import { useState, useRef, useEffect } from 'preact/hooks';
import { track } from '../../../utils/analytics.js';

/**
 * Display order + short labels for the notification toggles. The set of toggles
 * actually shown is data-driven: a row renders only when its gating module
 * (from `settingModules[key]`) is enabled for the facility (`modules[...]`).
 * Most facilities will see 1–2 of these.
 */
const SETTING_META = [
  { key: 'morningDigest', label: 'Daily cert digest', hint: 'Email when a cert is overdue or due soon' },
  { key: 'certSigned', label: 'Cert signed by provider', hint: 'Email when a practitioner signs a cert' },
  { key: 'mcoLevelDigest', label: 'MCO level-correction digest', hint: 'Daily managed-care level summary' },
  { key: 'complianceDigest', label: 'Care-plan compliance digest', hint: 'Weekly care-plan compliance summary' },
  { key: 'auditCompleted', label: 'Audit/ADR completed', hint: 'Email when an ADR/audit defense completes' },
];

/**
 * Returns the toggle keys whose gating module is enabled for this facility.
 * The parent uses this to decide whether to render the gear at all.
 */
export function visibleSettingKeys(prefs) {
  if (!prefs?.settings) return [];
  const modules = prefs.modules || {};
  const settingModules = prefs.settingModules || {};
  return SETTING_META
    .filter(({ key }) => {
      if (!(key in prefs.settings)) return false;
      const mod = settingModules[key];
      // No declared gating module → show it; otherwise require the module on.
      return !mod || modules[mod] === true;
    })
    .map(({ key }) => key);
}

/**
 * ⚙ gear button + popover with the notification toggles for this facility.
 * Pure presentation over `prefs` (from useNotificationPrefs); flips go through
 * `onToggle(key, value)` which handles the optimistic update + POST.
 */
export function CertSettingsPopover({ prefs, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click (capture phase, matching CertListRow's menu).
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [open]);

  const visibleKeys = visibleSettingKeys(prefs);
  if (visibleKeys.length === 0) return null;

  const rows = SETTING_META.filter(m => visibleKeys.includes(m.key));

  function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) track('cert_settings_opened', { source: 'mds_cc' });
  }

  function handleToggle(key, current) {
    const value = !current;
    track('cert_setting_toggled', { setting: key, enabled: value });
    onToggle(key, value);
  }

  return (
    <div class="cert__settings" ref={ref}>
      {/* NO_TRACK — tracked via handleOpen so we only fire on open, not close */}
      <button
        class={`cert__settings-btn${open ? ' cert__settings-btn--active' : ''}`}
        onClick={handleOpen}
        aria-label="Notification settings"
        aria-expanded={open}
        title="Notification settings"
      >
        {/* gear icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div class="cert__settings-popover" role="menu">
          <div class="cert__settings-popover-head">Email notifications</div>
          {rows.map(({ key, label, hint }) => {
            const checked = !!prefs.settings[key];
            return (
              // Whole row is the switch (clickable + a11y). NO_TRACK — tracked in handleToggle.
              <div
                key={key}
                role="switch"
                tabIndex={0}
                aria-checked={checked}
                aria-label={label}
                class="cert__settings-row"
                onClick={() => handleToggle(key, checked)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggle(key, checked);
                  }
                }}
              >
                <span class="cert__settings-row-text">
                  <span class="cert__settings-row-label">{label}</span>
                  <span class="cert__settings-row-hint">{hint}</span>
                </span>
                <span class={`cert__switch${checked ? ' cert__switch--on' : ''}`} aria-hidden="true">
                  <span class="cert__switch-knob" />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
