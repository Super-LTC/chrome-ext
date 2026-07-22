/**
 * Profile subtab — edit the signed-in user's display name + position/title.
 * These flow onto cover letters and signatures, so the tab leads with a live
 * preview of exactly how the nurse will appear there. Email is read-only.
 * Reads/writes /api/extension/me through settings-api.
 */
import { useState, useEffect, useCallback } from 'preact/hooks';
import { getProfile, saveProfile } from './utils/settings-api.js';
import { Section, SaveBar } from './ui.jsx';
import { track } from '../../utils/analytics.js';

const POSITION_SUGGESTIONS = ['MDS Coordinator', 'DON', 'Administrator', 'Nurse', 'Regional'];

/** Up to two initials for the preview avatar; falls back to a dash. */
function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '–';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function ProfileTab({ facilityName }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [email, setEmail] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await getProfile();
        if (!alive) return;
        setName(me.name || '');
        setPosition(me.position || '');
        setEmail(me.email || '');
      } catch (e) {
        if (alive) setLoadError(e.message || 'Could not load your profile.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const edit = (setter) => (e) => { setter(e.target.value); setDirty(true); setStatus(null); };

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const me = await saveProfile({ name: name.trim(), position: position.trim() });
      track('profile_saved', { source: 'extension' });
      setName(me.name || '');
      setPosition(me.position || '');
      setDirty(false);
      setStatus({ kind: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  }, [name, position]);

  if (loading) {
    return (
      <div class="sset-body">
        <div class="sset-loading"><div class="sset-spinner" /><span>Loading your profile…</span></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div class="sset-body">
        <div class="sset-notice">
          <div class="sset-notice__title">Couldn't load profile</div>
          <div class="sset-notice__text">{loadError}</div>
        </div>
      </div>
    );
  }

  // Preview mirrors the signature block: name on top, "title · building" beneath.
  const previewName = name.trim() || 'Your name';
  const previewMeta = [position.trim(), facilityName].filter(Boolean).join(' · ');
  const activePosition = position.trim().toLowerCase();

  return (
    <>
      <div class="sset-body">
        <Section label="How you'll appear" sub="On cover letters and signatures you send.">
          <div class="sset-identity">
            <span class="sset-identity__avatar" aria-hidden="true">{initialsOf(name)}</span>
            <span class="sset-identity__text">
              <span class={`sset-identity__name${name.trim() ? '' : ' is-empty'}`}>{previewName}</span>
              {previewMeta ? <span class="sset-identity__meta">{previewMeta}</span> : null}
            </span>
          </div>
        </Section>

        <Section label="Your details">
          <div class="sset-field">
            <label class="sset-label" for="sset-name">Full name</label>
            <input
              id="sset-name"
              class="sset-input"
              type="text"
              value={name}
              placeholder="e.g. Jane Rivera, RN"
              maxLength={100}
              onInput={edit(setName)}
            />
          </div>

          <div class="sset-field">
            <label class="sset-label" for="sset-position">Position / title</label>
            <input
              id="sset-position"
              class="sset-input"
              type="text"
              value={position}
              placeholder="e.g. MDS Coordinator"
              maxLength={100}
              onInput={edit(setPosition)}
            />
            <div class="sset-chips">
              {POSITION_SUGGESTIONS.map((p) => {
                const on = activePosition === p.toLowerCase();
                return (
                  <button
                    key={p}
                    type="button"
                    class={`sset-chip${on ? ' is-active' : ''}`}
                    aria-pressed={on ? 'true' : 'false'}
                    onClick={() => { setPosition(p); setDirty(true); setStatus(null); }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div class="sset-readonly">
            <span class="sset-readonly__label">Email</span>
            <span class="sset-readonly__value" title={email}>{email || '—'}</span>
          </div>
        </Section>
      </div>
      <SaveBar onSave={save} saving={saving} disabled={!dirty} dirty={dirty} status={status} />
    </>
  );
}
