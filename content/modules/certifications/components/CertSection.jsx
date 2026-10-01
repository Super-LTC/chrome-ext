import { useState, useCallback } from 'preact/hooks';
import { useCertsByPatient } from '../hooks/useCertsByPatient.js';
import { CertChainTimeline } from './CertChainTimeline.jsx';
import { SendCertModal } from './SendCertModal.jsx';
import { SkipCertModal } from './SkipCertModal.jsx';
import { DelayCertModal } from './DelayCertModal.jsx';

/**
 * CertSection — thin wrapper for the PDPM Analyzer patient overlay.
 *
 * Fetches patient certs, renders CertChainTimeline, wires modal actions.
 * Renders nothing if module is disabled (fetchByPatient returns 404)
 * or no certs exist for the patient.
 *
 * @param {{ patientId: string }} props
 */
export function CertSection({ patientId, collapsed, onToggleCollapse }) {
  const { certs, certForm, loading, refresh } = useCertsByPatient(patientId);

  // Modal state
  const [sendCert, setSendCert] = useState(null);
  const [skipCert, setSkipCert] = useState(null);
  const [delayCert, setDelayCert] = useState(null);

  // Resolve facility context for modals (lazy, same pattern)
  const [facilityCtx, setFacilityCtx] = useState({ facilityName: '', orgSlug: '' });

  const ensureFacilityCtx = useCallback(async () => {
    if (facilityCtx.facilityName && facilityCtx.orgSlug) return facilityCtx;
    const orgResponse = getOrg();
    const orgSlug = orgResponse?.org || '';
    const facilityName = window.getChatFacilityInfo?.() || '';
    const ctx = { facilityName, orgSlug };
    setFacilityCtx(ctx);
    return ctx;
  }, [facilityCtx]);

  const handleAction = useCallback(async (cert, action) => {
    if (action === 'send') {
      await ensureFacilityCtx();
      setSendCert(cert);
    } else if (action === 'skip') {
      setSkipCert(cert);
    } else if (action === 'delay') {
      setDelayCert(cert);
    } else if (action === 'unskip') {
      try {
        await window.CertAPI.unskipCert(cert.id);
        window.SuperToast?.success?.('Certification restored');
        refresh();
      } catch (err) {
        console.error('[CertSection] Failed to unskip:', err);
        window.SuperToast?.error?.('Failed to restore certification');
      }
    }
  }, [ensureFacilityCtx, refresh]);

  async function handleSkipCert(reason) {
    await window.CertAPI.skipCert(skipCert.id, reason);
    window.SuperToast?.success?.('Certification skipped');
    refresh();
  }

  async function handleDelayCert(reason) {
    await window.CertAPI.delayCert(delayCert.id, reason);
    window.SuperToast?.success?.('Certification marked as delayed');
    refresh();
  }

  // Don't render anything if loading, no certs, or module disabled
  if (loading) {
    return (
      <div class="pdpm-an__card">
        <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
          <span class="pdpm-an__card-title">Certifications</span>
          <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        {!collapsed && (
          <div class="pdpm-an__card-body" style="padding: 16px; text-align: center; color: #6b7280; font-size: 13px;">
            Loading certifications...
          </div>
        )}
      </div>
    );
  }

  if (!certs || certs.length === 0) return null;

  return (
    <>
      <div class="pdpm-an__card">
        <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
          <span class="pdpm-an__card-title">Certifications</span>
          <span class="pdpm-an__card-badge">{certs.length}</span>
          <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        {!collapsed && (
          <div class="pdpm-an__card-body" style="padding: 8px 12px;">
            <CertChainTimeline certs={certs} onAction={handleAction} />
          </div>
        )}
      </div>

      {/* Modals */}
      <SendCertModal
        isOpen={!!sendCert}
        onClose={() => setSendCert(null)}
        cert={sendCert}
        facilityName={facilityCtx.facilityName}
        orgSlug={facilityCtx.orgSlug}
        onSent={refresh}
        certForm={certForm}
      />

      <SkipCertModal
        isOpen={!!skipCert}
        onClose={() => setSkipCert(null)}
        cert={skipCert}
        onSkipped={handleSkipCert}
      />

      <DelayCertModal
        isOpen={!!delayCert}
        onClose={() => setDelayCert(null)}
        cert={delayCert}
        onDelayed={handleDelayCert}
      />
    </>
  );
}
