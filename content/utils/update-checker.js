// Update checker — compares three versions:
//   running  = what Chrome loaded into memory at startup (chrome.runtime.getManifest)
//   disk     = what's on disk right now (may have been swapped by Windows updater)
//   github   = latest release tag on GitHub (informational — drives release notes)
//
// The banner fires on disk > running. That's the only state where clicking
// "Reload" will actually apply a new version — otherwise the user reloads
// and nothing happens, which is worse than no banner at all.
//
// The Windows scheduled-task updater is responsible for pulling files from
// GitHub → disk. The extension never downloads files itself.

import { track, setVersionProperties } from './analytics.js';

const GITHUB_API = 'https://api.github.com/repos/Superjonathan123/chrome-ext/releases/latest';
const DISK_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // 5 min — cheap, local read
const GITHUB_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — rate-limited
const STORAGE_KEY = 'updateCheck';

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export const UpdateChecker = {
  _listeners: [],
  _driftReported: false, // fire update_disk_drift at most once per session

  onUpdateAvailable(cb) {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter(l => l !== cb);
    };
  },

  async getCurrentStatus() {
    const { [STORAGE_KEY]: cached } = await chrome.storage.local.get(STORAGE_KEY);
    return cached || null;
  },

  /** Read manifest.json from disk — bypasses the in-memory copy. */
  async _readDiskVersion() {
    try {
      const url = chrome.runtime.getURL('manifest.json') + '?t=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const parsed = await res.json();
      return parsed?.version || null;
    } catch (err) {
      console.warn('[UpdateChecker] disk version read failed:', err);
      return null;
    }
  },

  /** Fetch GitHub latest release — used for release notes / link only. */
  async _fetchGithubRelease(cached) {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;

    try {
      const res = await fetch(GITHUB_API, { cache: 'no-store', headers });
      if (res.status === 304) return { notModified: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const release = await res.json();
      return {
        version: (release.tag_name || '').replace(/^v/, ''),
        notes: release.body || '',
        releaseName: release.name || release.tag_name || '',
        releaseUrl: release.html_url || '',
        etag: res.headers.get('etag') || null,
      };
    } catch (err) {
      console.warn('[UpdateChecker] github fetch failed:', err);
      track('update_check_failed', {
        error_code: String(err?.code || err?.name || 'fetch_failed'),
      });
      return null;
    }
  },

  async check({ force = false } = {}) {
    const running = chrome.runtime.getManifest().version;
    const { [STORAGE_KEY]: cached } = await chrome.storage.local.get(STORAGE_KEY);

    // Always read disk version — it's cheap and local.
    const disk = await this._readDiskVersion();

    // Throttle GitHub calls separately.
    let github = cached?.github || null;
    const githubStale = !cached?.githubCheckedAt || (Date.now() - cached.githubCheckedAt) > GITHUB_CHECK_INTERVAL_MS;
    let githubCheckedAt = cached?.githubCheckedAt || 0;
    if (force || githubStale) {
      const fresh = await this._fetchGithubRelease(cached);
      if (fresh && !fresh.notModified) {
        github = fresh;
      }
      githubCheckedAt = Date.now();
    }

    const diskNewerThanRunning = disk ? compareVersions(disk, running) > 0 : false;

    const status = {
      runningVersion: running,
      diskVersion: disk,
      latestVersion: github?.version || disk || running,
      updateAvailable: diskNewerThanRunning, // banner driver
      notes: github?.notes || '',
      releaseName: github?.releaseName || '',
      releaseUrl: github?.releaseUrl || '',
      github,
      etag: github?.etag || cached?.etag || null,
      githubCheckedAt,
      lastCheckedAt: Date.now(),
      dismissedVersion: cached?.dismissedVersion || null,
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: status });

    // Push version state onto the PostHog person record so we can filter people
    // by who is on which version. Runs every disk-check (cheap, idempotent).
    setVersionProperties({
      runningVersion: running,
      diskVersion: disk,
      driftDetected: diskNewerThanRunning,
    });

    if (status.updateAvailable && status.diskVersion !== status.dismissedVersion) {
      this._listeners.forEach(cb => {
        try { cb(status); } catch (e) { console.warn('[UpdateChecker] listener error:', e); }
      });
    }

    // Stale-reload tracking: fire once if disk is ahead of running, regardless
    // of dismissal. Tells us who is sitting on outdated runtimes in PostHog.
    if (status.updateAvailable && !this._driftReported) {
      this._driftReported = true;
      track('update_disk_drift', {
        running_version: String(status.runningVersion || ''),
        disk_version: String(status.diskVersion || ''),
      });
    }
    return status;
  },

  startPolling() {
    this.check();
    // Disk check is cheap — poll every 5 min so the banner surfaces
    // promptly after the Windows updater swaps files.
    setInterval(() => this.check(), DISK_CHECK_INTERVAL_MS);
  },

  openExtensionsPage() {
    chrome.runtime.sendMessage({ type: 'OPEN_EXTENSIONS_PAGE' });
  },

  openReleasePage() {
    this.getCurrentStatus().then(s => {
      if (s?.releaseUrl) {
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: s.releaseUrl });
      }
    });
  },

  async dismiss() {
    const { [STORAGE_KEY]: cached } = await chrome.storage.local.get(STORAGE_KEY);
    if (cached) {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { ...cached, dismissedVersion: cached.diskVersion || cached.latestVersion },
      });
    }
  },
};

if (typeof window !== 'undefined') {
  window.__UpdateChecker = UpdateChecker;

  // Dev/preview helper — paste in DevTools console to preview the banner:
  //   __previewUpdateBanner('1.0.99')
  // Clear with: __clearUpdateBanner()
  window.__previewUpdateBanner = async (fakeDiskVersion = '9.9.9') => {
    const running = chrome.runtime.getManifest().version;
    const fake = {
      runningVersion: running,
      diskVersion: fakeDiskVersion,
      latestVersion: fakeDiskVersion,
      updateAvailable: true,
      notes: 'Preview — this is a test banner.\n• Example change one\n• Example change two',
      releaseName: `v${fakeDiskVersion}`,
      releaseUrl: `https://github.com/Superjonathan123/chrome-ext/releases/tag/v${fakeDiskVersion}`,
      lastCheckedAt: Date.now(),
      dismissedVersion: null,
    };
    await chrome.storage.local.set({ updateCheck: fake });
    UpdateChecker._listeners.forEach(cb => cb(fake));
    console.log('[UpdateChecker] Preview banner injected. Reload page if not visible.');
  };
  window.__clearUpdateBanner = async () => {
    await chrome.storage.local.remove('updateCheck');
    console.log('[UpdateChecker] Cleared. Banner will be hidden after next check.');
  };
}
