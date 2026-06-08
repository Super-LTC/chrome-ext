import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * DocumentViewer — source view for F678's `document` kind: the signed
 * POLST/MOLST/DNR directive, the one code-status source not already on the
 * nurse's PCC screen. Reuses the existing vanilla PDF stack:
 *
 *   window.ICD10API.getDocument(id, facilityName, orgSlug)  → { signedUrl, ... }
 *   window.ICD10PDFViewer.init(host) + .loadDocument(doc, [], page)
 *
 * We jump to the page vision read the code status on and show the evidence
 * string as a caption so the nurse knows exactly what we saw.
 */
export function DocumentViewer({ source, facilityName, orgSlug }) {
  const hostRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const documentId = source?.documentId;
  const page = source?.page || 1;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const api = window.ICD10API;
      const viewer = window.ICD10PDFViewer;
      if (!documentId) { setError('No signed form on this finding'); setLoading(false); return; }
      if (!api?.getDocument || !viewer?.init || !viewer?.loadDocument) {
        setError('Document viewer unavailable'); setLoading(false); return;
      }
      try {
        const doc = await api.getDocument(documentId, facilityName, orgSlug);
        if (cancelled || !hostRef.current) return;
        viewer.init(hostRef.current);
        await viewer.loadDocument(doc, [], page, '');
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('[FTagPrevention] form fetch failed', e);
        if (!cancelled) { setError(e?.message || 'Failed to load form'); setLoading(false); }
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

      {error ? (
        <div className="ftp-doc__error">{error}</div>
      ) : (
        <>
          {loading && <div className="ftp-doc__loading">Loading form…</div>}
          <div className="ftp-doc__viewer" ref={hostRef}></div>
        </>
      )}
    </div>
  );
}

function valueWord(normalized) {
  if (normalized === 'dnr') return 'DNR';
  if (normalized === 'full_code') return 'Full Code';
  return 'code status';
}
