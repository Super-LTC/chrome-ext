import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

/**
 * Reads + writes the user's per-facility notification preferences.
 *
 * One GET (on mount and on facility switch) populates the whole settings
 * popover: `settings` (the five toggle booleans), `modules` (per-facility
 * module enablement, used to hide a toggle whose module is off),
 * `settingModules` (which module gates each toggle — never hard-code this
 * client-side), plus `moduleEnabled` / `morningDigest` legacy aliases and the
 * `userId` (used to key the per-user banner-dismiss flag on shared
 * workstations).
 *
 * `prefs` is null while loading and when the certs module is disabled / the
 * user lacks access — callers treat null as "hide the settings + banner UI"
 * (same convention as useCertDashboard).
 *
 * `update(patch)` optimistically flips the given key(s), POSTs just that
 * subset, then reconciles `settings` from the response — reverting on error.
 *
 * Endpoints: GET/POST /api/extension/notification-preferences
 */
export function useNotificationPrefs({ facilityName, orgSlug }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(false);
  // Guards against a stale GET (from a prior facility) overwriting a newer one.
  const reqIdRef = useRef(0);

  const fetchPrefs = useCallback(async () => {
    if (!facilityName || !orgSlug) {
      setPrefs(null);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);

    try {
      const data = await window.CertAPI.fetchNotificationPrefs(facilityName, orgSlug);
      if (reqId !== reqIdRef.current) return; // a newer fetch superseded this one
      setPrefs(data);
    } catch (err) {
      // Network errors etc — treat as disabled (hide the UI), matching dashboard.
      console.warn('[Certifications] Notification prefs unavailable:', err);
      if (reqId === reqIdRef.current) setPrefs(null);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [facilityName, orgSlug]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  /**
   * Flip one toggle. Optimistic, then reconcile from the POST response.
   * Returns true on success, false on failure (caller can toast / not-nag).
   */
  const update = useCallback(async (key, value) => {
    if (!facilityName || !orgSlug) return false;

    // Optimistic: flip the key (and the morningDigest alias when relevant).
    setPrefs(prev => prev && ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
      ...(key === 'morningDigest' ? { morningDigest: value } : {}),
    }));

    try {
      const result = await window.CertAPI.updateNotificationPrefs(facilityName, orgSlug, { [key]: value });
      // Reconcile with the server's authoritative merged settings.
      setPrefs(prev => prev && ({
        ...prev,
        settings: result?.settings || prev.settings,
        morningDigest: result?.settings?.morningDigest ?? prev.morningDigest,
      }));
      return true;
    } catch (err) {
      console.error('[Certifications] Failed to update notification pref:', err);
      // Revert the optimistic flip.
      setPrefs(prev => prev && ({
        ...prev,
        settings: { ...prev.settings, [key]: !value },
        ...(key === 'morningDigest' ? { morningDigest: !value } : {}),
      }));
      return false;
    }
  }, [facilityName, orgSlug]);

  return { prefs, loading, update, refetch: fetchPrefs };
}
