import { useState } from 'preact/hooks';

/**
 * GenerateReasonButton — AI-drafts a "Clinical Reason for Continued Stay" for a
 * recert. Only fires on explicit tap (real LLM call, ~3–8s, so it's disabled
 * while in-flight and offers "Regenerate" once the field has text).
 *
 * The button only generates a draft — it never saves. onGenerated hands the text
 * back to the parent, which drops it into the editable textarea for the nurse.
 *
 * @param {Object} props
 * @param {string} props.certId       — certification internal id
 * @param {string} props.certType     — day_14_recert | day_30_recert (analytics)
 * @param {boolean} props.hasText      — field already has text → "Regenerate"
 * @param {'send'|'edit'} props.surface — which modal (analytics)
 * @param {'text'|'checkbox'} [props.form] — 'checkbox' for orgs on a checkbox
 *   cert form: the same endpoint suggests boxes instead of prose, the button
 *   reads "Re-check from chart", and analytics carry form: 'checkbox'.
 * @param {(text: string, source: string, body: Object) => void} props.onGenerated
 *   — `body` is the whole response; checkbox callers read body.reasonCodes.
 */
export function GenerateReasonButton({ certId, certType, hasText, surface, form = 'text', onGenerated }) {
  const [loading, setLoading] = useState(false);
  const isCheckbox = form === 'checkbox';
  // Standard events stay byte-for-byte what they were; checkbox ones are tagged.
  const formProps = isCheckbox ? { form: 'checkbox' } : {};

  function handleClick() {
    if (loading) return;
    window.SuperAnalytics?.track?.('cert_reason_generate_clicked', {
      cert_type: certType,
      is_regenerate: !!hasText,
      surface,
      ...formProps,
    });
    setLoading(true);
    window.CertAPI.generateClinicalReason(certId)
      .then((body) => {
        const { clinicalReason, source } = body;
        onGenerated(clinicalReason, source, body);
        window.SuperAnalytics?.track?.('cert_reason_generated', {
          cert_type: certType,
          source,
          surface,
          ...formProps,
        });
        if (source === 'fallback') {
          window.SuperToast?.info?.('Draft ready — please review before saving');
        }
      })
      .catch(err => {
        console.error('[Certifications] Failed to generate clinical reason:', err);
        window.SuperAnalytics?.track?.('error_shown', {
          surface: 'cert_reason_generate',
          error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
          error_type: 'api_error',
        });
        window.SuperToast?.error?.(err.message || 'Failed to generate clinical reason');
      })
      .finally(() => setLoading(false));
  }

  return (
    <button
      type="button"
      class="cm-gen-btn"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <>
          <span class="cm-gen-btn__spinner" />
          {isCheckbox ? 'Checking chart…' : 'Generating…'}
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.8L18.7 9l-4.8 1.9L12 15.7l-1.9-4.8L5.3 9l4.8-1.2z"/><path d="M19 14l.7 1.9L21.6 16l-1.9.7L19 18.6l-.7-1.9L16.4 16l1.9-.1z"/></svg>
          {isCheckbox ? 'Re-check from chart' : hasText ? 'Regenerate' : 'Generate'}
        </>
      )}
    </button>
  );
}
