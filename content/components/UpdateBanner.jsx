import { useState, useEffect, useRef } from 'preact/hooks';
import { UpdateChecker } from '../utils/update-checker.js';
import { track } from '../utils/analytics.js';
import { TrackedButton } from './TrackedButton.jsx';

export function UpdateBanner() {
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [step, setStep] = useState('ready'); // 'ready' | 'instructions' | 'opened'
  const shownFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    UpdateChecker.getCurrentStatus().then(s => {
      if (!cancelled && s?.updateAvailable && s.diskVersion !== s.dismissedVersion) {
        setStatus(s);
      }
    });

    const unsubscribe = UpdateChecker.onUpdateAvailable(s => {
      if (s.diskVersion !== s.dismissedVersion) setStatus(s);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Fire update_banner_shown once when banner first becomes visible.
  useEffect(() => {
    if (status && !hidden && !shownFiredRef.current) {
      shownFiredRef.current = true;
      track('update_banner_shown', {
        current_version: String(status.runningVersion || ''),
        latest_version: String(status.diskVersion || status.latestVersion || ''),
      });
    }
  }, [status, hidden]);

  if (!status || hidden) return null;

  const handleShowHow = () => setStep('instructions');
  const handleOpenExtensions = () => {
    UpdateChecker.openExtensionsPage();
    setStep('opened');
  };
  const handleDismiss = () => {
    UpdateChecker.dismiss();
    setHidden(true);
  };

  // Step 2 & 3: instructions / post-open — both show the same guidance card
  if (step === 'instructions' || step === 'opened') {
    return (
      <div className="super-update-banner super-update-banner--instructions" role="status">
        <TrackedButton
          track="update_banner_clicked"
          trackProps={{
            action: 'dismiss',
            current_version: String(status.runningVersion || ''),
            latest_version: String(status.diskVersion || status.latestVersion || ''),
          }}
          type="button"
          className="super-update-banner__dismiss super-update-banner__dismiss--top"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ×
        </TrackedButton>

        <div className="super-update-banner__instr-title">
          <ReloadIcon />
          <span>How to finish the update</span>
        </div>

        <div className="super-update-banner__instr-version">
          v{status.runningVersion} → v{status.diskVersion}
        </div>

        <ol className="super-update-banner__instr-steps">
          <li>
            Click <strong>Open Extensions Page</strong> below.
          </li>
          <li>
            Find <strong>Super LTC</strong> on that page.
          </li>
          <li>
            Click the <ReloadIcon inline /> <strong>reload icon</strong> on its
            card.
            <div className="super-update-banner__instr-nope">
              Don't click the blue "Update" button at the top — it's slow.
            </div>
          </li>
          <li>Come back here and refresh the page.</li>
        </ol>

        <div className="super-update-banner__instr-mock" aria-hidden="true">
          <div className="super-update-banner__instr-label">chrome://extensions</div>
          <div className="super-update-banner__instr-card">
            <div className="super-update-banner__instr-card-top">
              <div className="super-update-banner__instr-card-logo">S</div>
              <div className="super-update-banner__instr-card-info">
                <div className="super-update-banner__instr-card-title">
                  Super LTC for Point Click Care{' '}
                  <span className="super-update-banner__instr-card-ver">v{status.diskVersion}</span>
                </div>
                <div className="super-update-banner__instr-card-desc">
                  AI-powered clinical tools for PointClickCare…
                </div>
              </div>
            </div>
            <div className="super-update-banner__instr-card-actions">
              <div className="super-update-banner__instr-pill">Details</div>
              <div className="super-update-banner__instr-pill">Remove</div>
              <div className="super-update-banner__instr-pill super-update-banner__instr-pill--danger">Errors</div>
              <div className="super-update-banner__instr-card-spacer" />
              <div className="super-update-banner__instr-reload-target">
                <ReloadIcon />
              </div>
              <div className="super-update-banner__instr-toggle">
                <div className="super-update-banner__instr-toggle-knob" />
              </div>
            </div>
          </div>
          <div className="super-update-banner__instr-hint">↑ click the ↻ icon</div>
        </div>

        {step === 'instructions' ? (
          <TrackedButton
            track="update_banner_clicked"
            trackProps={{
            action: 'reload',
            current_version: String(status.runningVersion || ''),
            latest_version: String(status.diskVersion || status.latestVersion || ''),
          }}
            type="button"
            className="super-update-banner__reload super-update-banner__reload--full"
            onClick={handleOpenExtensions}
          >
            Open Extensions Page
          </TrackedButton>
        ) : (
          <>
            <div className="super-update-banner__opened-hint">
              ✓ Opened in a new tab. Click the ↻ icon there, then come back and
              reload this page.
            </div>
            <TrackedButton
              track="update_banner_clicked"
              trackProps={{
            action: 'reload',
            current_version: String(status.runningVersion || ''),
            latest_version: String(status.diskVersion || status.latestVersion || ''),
          }}
              type="button"
              className="super-update-banner__reload super-update-banner__reload--full"
              onClick={() => {
                // Prefer background-driven reload — reliable across iframes / CSP
                try {
                  chrome.runtime.sendMessage({ type: 'RELOAD_CURRENT_TAB' }, () => {
                    // Fallback if message path fails (e.g. service worker asleep)
                    setTimeout(() => { try { location.reload(); } catch {} }, 300);
                  });
                } catch {
                  try { location.reload(); } catch {}
                }
              }}
            >
              Reload this page
            </TrackedButton>
          </>
        )}
      </div>
    );
  }

  // Step 1: default — update available (compact)
  return (
    <div className="super-update-banner" role="status">
      <div className="super-update-banner__dot" aria-hidden="true" />
      <div className="super-update-banner__text">
        <strong>Update ready</strong>
        <span className="super-update-banner__version">
          v{status.runningVersion} → v{status.diskVersion}
        </span>
      </div>
      <TrackedButton
        track="update_banner_clicked"
        trackProps={{ action: 'reload' }}
        type="button"
        className="super-update-banner__reload"
        onClick={handleShowHow}
        title={status.notes ? `What's new:\n${status.notes}` : 'Show how to apply the update'}
      >
        Show me how
      </TrackedButton>
      <TrackedButton
        track="update_banner_clicked"
        trackProps={{ action: 'dismiss' }}
        type="button"
        className="super-update-banner__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss until next update"
        title="Dismiss"
      >
        ×
      </TrackedButton>
    </div>
  );
}

function ReloadIcon({ inline = false }) {
  return (
    <svg
      className={inline ? 'super-update-banner__reload-icon super-update-banner__reload-icon--inline' : 'super-update-banner__reload-icon'}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
