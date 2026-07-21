/**
 * SettingsPanel — root of the Settings overlay opened from the gear FAB.
 * A centered modal card with pill-tabs: Weekly Reports · Profile · Team (soon).
 * Each tab owns its own scrollable body + save bar; the panel owns the chrome.
 */
import { useState, useEffect } from 'preact/hooks';
import { WeeklyReportsTab } from './WeeklyReportsTab.jsx';
import { ProfileTab } from './ProfileTab.jsx';
import { track } from '../../utils/analytics.js';

const GEAR = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CLOSE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const TABS = [
  { key: 'weekly', label: 'Weekly Reports' },
  { key: 'profile', label: 'Profile' },
  { key: 'team', label: 'Team', disabled: true, soon: true },
];

export function SettingsPanel({ facilityName, orgSlug, initialTab = 'weekly', onClose }) {
  const [tab, setTab] = useState(initialTab);
  const tabIndex = Math.max(0, TABS.findIndex((t) => t.key === tab));

  useEffect(() => { track('settings_opened', { source: 'fab' }); }, []);

  // Freeze the PCC page scroll while the panel is open so the wheel scrolls our
  // content, not the page behind. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div class="sset-overlay" role="dialog" aria-modal="true" aria-label="Super LTC settings">
      <div class="sset-backdrop" onClick={onClose} />
      <div class="sset-card">
        <header class="sset-head">
          <div class="sset-head__title">
            <span class="sset-head__icon">{GEAR}</span>
            <div style="min-width:0;">
              <h2 class="sset-head__h">Settings</h2>
              <p class="sset-head__sub">{facilityName || 'Your account'}</p>
            </div>
          </div>
          <button type="button" class="sset-head__close" onClick={onClose} aria-label="Close settings" data-track="settings_closed">{CLOSE}</button>
        </header>

        <nav class="sset-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key ? 'true' : 'false'}
              class={`sset-tab${tab === t.key ? ' is-active' : ''}${t.disabled ? ' is-disabled' : ''}`}
              onClick={() => !t.disabled && setTab(t.key)}
              disabled={t.disabled}
            >
              {t.label}
              {t.soon ? <span class="sset-tab__soon">Soon</span> : null}
            </button>
          ))}
          <span class="sset-tabs__ink" style={`transform: translateX(${tabIndex * 100}%);`} />
        </nav>

        {tab === 'weekly' && <WeeklyReportsTab facilityName={facilityName} orgSlug={orgSlug} />}
        {tab === 'profile' && <ProfileTab facilityName={facilityName} />}
      </div>
    </div>
  );
}
