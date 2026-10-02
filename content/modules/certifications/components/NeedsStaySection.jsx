import { useState } from 'preact/hooks';
import { StayTypeBadge } from './StayTypeBadge.jsx';
import { StartStayModal } from './StartStayModal.jsx';
import { StayReasonModal } from './StayReasonModal.jsx';
import { formatShortDate } from '../cert-urgency.js';

/**
 * NeedsStaySection — top-of-tab list of residents the census shows on a
 * skilled payer (Medicare A or managed care) who have no cert stay, because
 * one couldn't be started for them automatically.
 *
 * Collapsed by default to a one-line count. Each row offers:
 *   - Start stay  → StartStayModal, prefilled with this resident and dates
 *   - Not needed  → asks why, then dismisses the row
 *
 * Renders nothing when the list is empty. `onChanged` refetches the tab.
 */

function itemKey(item) {
  return `${item.patientId}:${item.payerType}:${item.startDate}`;
}

export function NeedsStaySection({ items, facilityName, orgSlug, managedCareEnabled, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  // Stored in state (not built inline) so the modal's prefill is a stable
  // object and its reset-on-open effect doesn't fire on every render.
  const [startPrefill, setStartPrefill] = useState(null);
  const [dismissItem, setDismissItem] = useState(null);

  if (!items || items.length === 0) return null;

  const n = items.length;

  function openStart(item) {
    setStartPrefill({
      patientId: item.patientId,
      patientName: item.patientName,
      payerType: item.payerType,
      startDate: item.startDate,
      endDate: item.endDate || null,
    });
  }

  async function handleDismiss(reason) {
    const item = dismissItem;
    await window.CertAPI.dismissNeedsStay(facilityName, orgSlug, {
      patientId: item.patientId,
      payerType: item.payerType,
      startDate: item.startDate,
      reason,
    });
    window.SuperToast?.success?.('Marked as not needed');
    onChanged?.();
  }

  return (
    <div class={`cert__needs-stay${expanded ? ' cert__needs-stay--open' : ''}`}>
      <button class="cert__needs-stay-head" data-track="cert_needs_stay_toggled" data-track-prop-expanded={expanded ? 'false' : 'true'} onClick={() => setExpanded(!expanded)} aria-expanded={expanded ? 'true' : 'false'}>
        <span class="cert__needs-stay-chevron" aria-hidden="true">{expanded ? '▼' : '▶'}</span>
        <span class="cert__needs-stay-title">
          {n} resident{n !== 1 ? 's' : ''} may need a cert stay
        </span>
        <span class="cert__needs-stay-explainer">
          The census shows a skilled payer but no certification stay was started.
        </span>
      </button>

      {expanded && (
        <div class="cert__needs-stay-list">
          {items.map(item => {
            const ended = !!item.endDate;
            return (
              <div class="cert__needs-stay-row" key={itemKey(item)} data-patient-id={item.patientId}>
                <div class="cert__needs-stay-info">
                  <span class="cert__needs-stay-name">{item.patientName}</span>
                  <StayTypeBadge payerType={item.payerType} />
                  {item.payer && <span class="cert__needs-stay-payer">{item.payer}</span>}
                  <span class="cert__needs-stay-dates">
                    {ended
                      ? `${formatShortDate(item.startDate)} – ${formatShortDate(item.endDate)}`
                      : `Since ${formatShortDate(item.startDate)}`}
                  </span>
                  {(ended || item.patientStatus === 'discharged') && (
                    <span class="cert__needs-stay-tag">Discharged</span>
                  )}
                </div>
                <div class="cert__needs-stay-actions">
                  <button class="cert__needs-stay-btn cert__needs-stay-btn--primary" data-track="cert_needs_stay_start_clicked" data-track-prop-payer-type={item.payerType} onClick={() => openStart(item)}>
                    Start stay
                  </button>
                  <button class="cert__needs-stay-btn" data-track="cert_needs_stay_dismiss_clicked" data-track-prop-payer-type={item.payerType} onClick={() => setDismissItem(item)}>
                    Not needed
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StartStayModal
        isOpen={!!startPrefill}
        onClose={() => setStartPrefill(null)}
        facilityName={facilityName}
        orgSlug={orgSlug}
        prefill={startPrefill}
        managedCareEnabled={managedCareEnabled}
        onStarted={onChanged}
      />

      <StayReasonModal
        isOpen={!!dismissItem}
        onClose={() => setDismissItem(null)}
        title="No cert stay needed"
        subtitle={dismissItem?.patientName}
        hint="This resident will drop off the list for this payer and start date."
        placeholder="e.g., Payer was entered in error; resident is private pay"
        submitLabel="Not needed"
        onSubmit={handleDismiss}
      />
    </div>
  );
}
