/**
 * Profile subtab — edit the signed-in user's display name + position/title.
 * These flow onto cover letters and signatures. Email is read-only here.
 * Reads/writes /api/extension/me through settings-api.
 */
import { useState, useEffect, useCallback } from 'preact/hooks';
import { getProfile, saveProfile } from './utils/settings-api.js';
import { Section, SaveBar } from './ui.jsx';
import { track } from '../../utils/analytics.js';

const POSITION_SUGGESTIONS = ['MDS Coordinator', 'DON', 'Administrator', 'Nurse', 'Regional'];

export function ProfileTab() {
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

  return (
    <>
      <div class="sset-body">
        <Section label="Your details" hint="Shown on cover letters & signatures">
          <div class="sset-field">
            <label class="sset-label">Full name</label>
            <input
              class="sset-input"
              type="text"
              value={name}
              placeholder="e.g. Jane Rivera, RN"
              maxLength={100}
              onInput={edit(setName)}
            />
          </div>

          <div class="sset-field">
            <label class="sset-label">Position / title</label>
            <input
              class="sset-input"
              type="text"
              value={position}
              placeholder="e.g. MDS Coordinator"
              maxLength={100}
              onInput={edit(setPosition)}
            />
            <div class="sset-chips">
              {POSITION_SUGGESTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  class="sset-chip"
                  onClick={() => { setPosition(p); setDirty(true); setStatus(null); }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div class="sset-field">
            <label class="sset-label">Email</label>
            <input class="sset-input" type="email" value={email} disabled />
          </div>
        </Section>
      </div>
      <SaveBar onSave={save} saving={saving} disabled={!dirty} status={status} />
    </>
  );
}
