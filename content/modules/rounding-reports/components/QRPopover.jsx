import { useEffect, useRef, useState } from 'preact/hooks';
import QRCode from 'qrcode';

function fmtCountdown(secs) {
  if (secs <= 0) return 'Expired';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `Expires in ${m}:${String(s).padStart(2, '0')}`;
}

export function QRPopover({ mintQr, onClose }) {
  const canvasRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const { url, expiresInSeconds } = await mintQr();
      setUrl(url);
      setSecondsLeft(expiresInSeconds || 1800);
    } catch (err) {
      console.error('[QRPopover] mint failed:', err);
      setError(err.message || 'Failed to generate QR link');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1 }).catch(err => {
      console.error('[QRPopover] toCanvas failed:', err);
      setError('Could not render QR — use the copy link instead.');
    });
  }, [url]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  function handleBackdrop(e) {
    if (e.target.classList.contains('rr-qr-backdrop')) onClose();
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('[QRPopover] copy failed:', err);
    }
  }

  return (
    <div class="rr-qr-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true">
      <div class="rr-qr-modal">
        {/* NO_TRACK */}
        <button class="rr-qr-close" onClick={onClose} aria-label="Close" type="button">×</button>
        <h3 class="rr-qr-title">Scan with your phone</h3>

        {loading && <div class="rr-loading">Generating QR…</div>}
        {error && <div class="rr-banner rr-banner--error">{error}</div>}

        {url && !error && (
          <>
            <div class="rr-qr-canvas">
              <canvas ref={canvasRef} width="220" height="220" />
            </div>
            <div class="rr-qr-expiry">
              {fmtCountdown(secondsLeft)}
              {/* NO_TRACK */}
              <button class="rr-btn rr-btn--ghost rr-btn--small" onClick={generate} type="button">
                Refresh
              </button>
            </div>
            <div class="rr-qr-actions">
              <button class="rr-btn rr-btn--secondary" onClick={handleCopy} type="button" data-track="rounding_qr_link_copied">
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a
                class="rr-qr-fallback"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                No phone? Open on this device →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
