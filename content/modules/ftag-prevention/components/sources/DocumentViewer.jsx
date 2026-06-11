import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * DocumentViewer — source view for F678's `document` kind: the signed
 * POLST/MOLST/DNR directive, the one code-status source not already on the
 * nurse's PCC screen.
 *
 * Opens the actual signed PDF URL in a NEW BROWSER TAB rather than embedding it
 * in the in-app pop-over viewer (which is fiddly for a quick form check). We
 * fetch the signed URL, jump it to the page vision read the status on
 * (`#page=N`), and best-effort auto-open a new tab — with an explicit button as
 * the fallback if the browser's popup blocker swallows the auto-open.
 *
 *   window.ICD10API.getDocument(id, facilityName, orgSlug) → { signedUrl, ... }
 */
export function DocumentViewer({ source, facilityName, orgSlug }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  const documentId = source?.documentId;
  const page = source?.page || 1;

  const openPdf = () => {
    if (urlRef.current) window.open(urlRef.current, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const api = window.ICD10API;
      if (!documentId) { setError('No signed form on this finding'); setStatus('error'); return; }
      if (!api?.getDocument) { setError('Document service unavailable'); setStatus('error'); return; }
      try {
        const doc = await api.getDocument(documentId, facilityName, orgSlug);
        if (cancelled) return;
        const url = doc?.signedUrl || doc?.url || doc?.presignedUrl;
        if (!url) throw new Error('No PDF URL on this form');
        urlRef.current = page > 1 ? `${url}#page=${page}` : url;
        setStatus('ready');
        // Best-effort auto-open in a new tab; the button below covers popup blocks.
        window.open(urlRef.current, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('[FTagPrevention] form fetch failed', e);
        if (!cancelled) { setError(e?.message || 'Failed to load form'); setStatus('error'); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [documentId, page, facilityName, orgSlug]);

  return (
    <div className="ftp-doc">
      {source?.evidence && (
        <div className="ftp-doc__caption">
          We read: <b>{valueWord(source.normalized)}</b> — “{source.evidence}”
          {source.confidence ? ` (${source.confidence} confidence)` : ''}
        </div>
      )}

      {status === 'error' ? (
        <div className="ftp-doc__error">{error}</div>
      ) : status === 'loading' ? (
        <div className="ftp-doc__loading">Opening signed form…</div>
      ) : (
        <div className="ftp-doc__open">
          <p className="ftp-doc__open-msg">The signed form opens in a new browser tab{page > 1 ? ` (page ${page})` : ''}.</p>
          <button type="button" className="ftp-doc__open-btn" onClick={openPdf}> {/* NO_TRACK: navigating into this source already fires ftag_view_source */}
            Open signed form
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function valueWord(normalized) {
  if (normalized === 'dnr') return 'DNR';
  if (normalized === 'full_code') return 'Full Code';
  return 'code status';
}
