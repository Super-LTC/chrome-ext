import { useState, useEffect } from 'preact/hooks';
import { track } from '../../../utils/analytics.js';

/**
 * Per-user, per-facility dismiss key. Keyed on userId (not just facility)
 * because SNF workstations are shared on one browser profile — nurse A's
 * "Not now" must not suppress the nudge for nurse B. orgSlug is included since
 * facilityName isn't guaranteed unique across orgs.
 */
function dismissKey(userId, orgSlug, facilityName) {
  return `certDigestBannerDismissed:${userId}:${orgSlug}:${facilityName}`;
}

/**
 * Dismissible nudge to opt into the daily cert digest. Discovery mechanism for
 * the (off-by-default) digest — without it nobody finds the toggle.
 *
 * Shows only when ALL are true:
 *   - moduleEnabled === true   (medACert on for this facility)
 *   - morningDigest === false  (user hasn't opted in)
 *   - not locally dismissed    (chrome.storage.local, per user+facility)
 *
 * Source of truth for opted-in stays the backend (morningDigest); the local
 * flag only suppresses the nudge. Turning it on here also sets the flag so it
 * never re-nags — from then on the gear popover is where they manage it.
 *
 * `onTurnOn` flips morningDigest (returns true on success). On success we hide,
 * set the dismiss flag, and toast.
 */
export function CertDigestBanner({ prefs, facilityName, orgSlug, onTurnOn }) {
  // null = dismiss state not yet read from storage (don't render/flash yet)
  const [dismissed, setDismissed] = useState(null);
  const [busy, setBusy] = useState(false);

  const userId = prefs?.userId;
  const eligibleByPrefs = !!prefs && prefs.moduleEnabled === true && prefs.morningDigest === false;

  // Read the per-user dismiss flag whenever the identifying keys change.
  useEffect(() => {
    if (!eligibleByPrefs || !userId || !orgSlug || !facilityName) {
      setDismissed(null);
      return;
    }
    let cancelled = false;
    const key = dismissKey(userId, orgSlug, facilityName);
    chrome.storage.local.get([key]).then(res => {
      if (!cancelled) setDismissed(!!res[key]);
    }).catch(() => {
      if (!cancelled) setDismissed(false); // storage error → show the nudge
    });
    return () => { cancelled = true; };
  }, [eligibleByPrefs, userId, orgSlug, facilityName]);

  const visible = eligibleByPrefs && dismissed === false;

  // Fire the impression once per time the banner becomes visible.
  useEffect(() => {
    if (visible) track('cert_digest_banner_shown', {});
  }, [visible]);

  if (!visible) return null;

  function persistDismiss() {
    const key = dismissKey(userId, orgSlug, facilityName);
    chrome.storage.local.set({ [key]: true }).catch(() => {});
    setDismissed(true);
  }

  async function handleTurnOn() {
    if (busy) return;
    setBusy(true);
    track('cert_digest_banner_enabled', {});
    let ok = false;
    try {
      ok = await onTurnOn();
    } finally {
      setBusy(false);
    }
    if (ok) {
      // morningDigest is now true (hides the banner on its own); set the flag
      // too so we never re-nag even if they later toggle it off.
      persistDismiss();
      window.SuperToast?.success?.("Daily digest on — you'll get it around 8 AM");
    } else {
      window.SuperToast?.error?.('Could not turn on the digest — try again');
    }
  }

  function handleDismiss() {
    track('cert_digest_banner_dismissed', {});
    persistDismiss();
  }

  return (
    <div class="cert__digest-banner">
      <span class="cert__digest-banner-icon" aria-hidden="true">{'\u{1F4EC}'}</span>
      <span class="cert__digest-banner-text">
        <strong>Stay ahead of cert deadlines.</strong>{' '}
        Get a daily email when a Medicare cert is overdue or due this week — only sends when there's something to act on.
      </span>
      <div class="cert__digest-banner-actions">
        {/* NO_TRACK — tracked in handleTurnOn */}
        <button
          class="cert__digest-banner-cta"
          onClick={handleTurnOn}
          disabled={busy}
        >
          {busy ? 'Turning on…' : 'Turn on daily digest'}
        </button>
        {/* NO_TRACK — tracked in handleDismiss */}
        <button class="cert__digest-banner-dismiss-text" onClick={handleDismiss}>
          Not now
        </button>
        {/* NO_TRACK — tracked in handleDismiss */}
        <button class="cert__digest-banner-close" onClick={handleDismiss} aria-label="Dismiss">
          {'×'}
        </button>
      </div>
    </div>
  );
}
