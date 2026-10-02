import { useState } from 'preact/hooks';

/**
 * StayReviewBanner — amber strip inside a stay card when the stay needs the
 * nurse to look at it. The reason sentence comes from the server.
 *
 *   payer_check  → "Still managed care" (keep) / "End stay" (opens a date picker)
 *   discharged   → "End stay" (ends on the flagged date) / "Keep open" (keep)
 *
 * `onConfirm` / `onEnd` may return promises; a rejection shows a toast with the
 * server's message and re-enables the buttons.
 */

const FALLBACK_REASON = {
  payer_check: 'Check the payer for this stay.',
  discharged: 'This resident looks discharged. End the stay?',
};

export function StayReviewBanner({ kind, reason, onConfirm, onEnd }) {
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('[Certifications] Stay review failed:', err);
      window.SuperToast?.error?.(err?.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const text = reason || FALLBACK_REASON[kind] || 'This stay needs a look.';

  return (
    <div class={`cert__stay-review cert__stay-review--${kind}`} role="status">
      <span class="cert__stay-review-text">{text}</span>
      <div class="cert__stay-review-actions">
        {kind === 'payer_check' && (
          <>
            <button class="cert__stay-review-btn cert__stay-review-btn--primary" data-track="cert_stay_review_confirm" data-track-prop-kind={kind} data-action="confirm" disabled={busy} onClick={() => run(onConfirm)}>
              Still managed care
            </button>
            <button class="cert__stay-review-btn" data-track="cert_stay_review_end" data-track-prop-kind={kind} data-action="end" disabled={busy} onClick={() => run(onEnd)}>
              End stay
            </button>
          </>
        )}
        {kind !== 'payer_check' && (
          <>
            <button class="cert__stay-review-btn cert__stay-review-btn--primary" data-track="cert_stay_review_end" data-track-prop-kind={kind} data-action="end" disabled={busy} onClick={() => run(onEnd)}>
              End stay
            </button>
            <button class="cert__stay-review-btn" data-track="cert_stay_review_confirm" data-track-prop-kind={kind} data-action="confirm" disabled={busy} onClick={() => run(onConfirm)}>
              Keep open
            </button>
          </>
        )}
      </div>
    </div>
  );
}
