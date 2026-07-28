import { useState, useEffect } from 'preact/hooks';

/**
 * useCurrentUser — the signed-in Super user, from chrome.storage.local.
 *
 * The content script has never surfaced the current user in any UI; until now
 * `chrome.storage.local.user` was read only by PostHog identify, the popup, and
 * pcc-identity. Anything that attributes an action to "you" needs it.
 *
 * Re-reads on storage change so a sign-out mid-session clears the identity
 * rather than leaving a stale name on screen.
 *
 * Returns { user, loading }. `user` is null when signed out or still loading.
 */
export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      try {
        chrome.storage.local.get(['user'], (result) => {
          if (cancelled) return;
          setUser(result?.user || null);
          setLoading(false);
        });
      } catch {
        // Extension context invalidated (reload / update) — fail quiet.
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    read();

    const onChanged = (changes, area) => {
      if (area === 'local' && changes.user) {
        setUser(changes.user.newValue || null);
      }
    };

    try {
      chrome.storage.onChanged.addListener(onChanged);
    } catch {
      /* no-op */
    }

    return () => {
      cancelled = true;
      try {
        chrome.storage.onChanged.removeListener(onChanged);
      } catch {
        /* no-op */
      }
    };
  }, []);

  return { user, loading };
}

/** Display label for a user object — name, else email, else a neutral fallback. */
export function userLabel(user, fallback = 'Someone') {
  if (!user) return fallback;
  return user.name || user.email || fallback;
}
