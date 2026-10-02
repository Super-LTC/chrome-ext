import { useState, useRef, useEffect } from 'preact/hooks';
import { CertListRow } from './CertListRow.jsx';
import { StayTypeBadge } from './StayTypeBadge.jsx';
import { ManualBadge } from './ManualBadge.jsx';
import { StayReviewBanner } from './StayReviewBanner.jsx';
import { StayReasonModal } from './StayReasonModal.jsx';
import { EndStayModal } from './EndStayModal.jsx';
import { AddStayCertModal } from './AddStayCertModal.jsx';
import { formatShortDate, getCertUrgency, isOverdueUrgency } from '../cert-urgency.js';

/**
 * StayGroupCard — groups all certs for one Part A stay into a single card.
 *
 * Header: patient name + MA badge + chain indicator + Medicare Day + date
 * Chain indicator: 3 small colored dots (I / 14 / 30) showing chain status at a glance
 * Active certs shown as compact CertListRow
 * Signed certs collapsed under "▶ X previous" toggle
 *
 * Stay-level controls (need a real partAStayId): "Manual" badge, the review
 * banner when the stay is flagged for a payer/discharge check, and a ⋮ menu to
 * switch manual/automatic, add a certification, or end the stay. These call
 * window.CertAPI directly and then `onStayChanged` so the tab refetches.
 */

const CHAIN_TYPES = ['initial', 'day_14_recert', 'day_30_recert'];
const CHAIN_LABELS = { initial: 'I', day_14_recert: '14', day_30_recert: '30' };

function getChainDotVariant(cert) {
  if (!cert) return 'empty';
  const { urgency } = getCertUrgency(cert);
  if (urgency === 'signed') return 'signed';
  if (urgency === 'skipped') return 'skipped';
  if (isOverdueUrgency(urgency)) return 'overdue';
  if (urgency === 'awaiting_signature') return 'sent';
  if (urgency === 'due_soon') return 'due-soon';
  return 'pending';
}

function ChainIndicator({ allCerts }) {
  const certByType = {};
  for (const cert of allCerts) {
    certByType[cert.type] = cert;
  }

  return (
    <div class="cert__chain-indicator" aria-label="Certification chain status">
      {CHAIN_TYPES.map((type) => {
        const cert = certByType[type];
        const variant = getChainDotVariant(cert);
        return (
          <span
            key={type}
            class={`cert__chain-dot cert__chain-dot--${variant}`}
            title={`${CHAIN_LABELS[type]}: ${variant}`}
          />
        );
      })}
    </div>
  );
}

export function StayGroupCard({
  stayId,
  displayCerts,
  historyCerts,
  allCerts,
  onSend,
  onSchedule,
  onSkip,
  onDelay,
  onUnskip,
  onRevoke,
  onEditReason,
  onViewPractitioner,
  dischargeDate,        // discharged tab: ISO date of the ended Part A stay
  outstandingCount,     // discharged tab: # certs still unsigned (pending/sent/delayed)
  onStayChanged,        // refetch after a stay-level action (mode / end / review / add cert)
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [endModal, setEndModal] = useState(null); // null | 'menu' | 'review'
  const [addCertOpen, setAddCertOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the stay menu on outside click (same pattern as CertListRow).
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [menuOpen]);

  // Stay-level info from first cert (all certs in the stay share these)
  const first = allCerts[0];
  const patientName = first.patientName;
  const payerType = first.payerType;
  const currentMedicareDay = first.currentMedicareDay;
  const partAStartDate = first.partAStartDate;

  // Stay-level state, carried on every cert of the stay. Group keys fall back to
  // a cert id when a cert has no stay, so stay actions use partAStayId only.
  const stayKey = first.partAStayId || null;
  const isManual = first.stayMode === 'manual';
  const reviewKind = first.stayReviewKind || null;
  const reviewReason = first.stayReviewReason || null;
  const stayEnded = first.stayStatus === 'ended' || !!first.stayEndDate || !!dischargeDate;
  const existingTypes = allCerts
    .filter(c => c.status !== 'skipped' && c.status !== 'revoked')
    .map(c => c.type);

  function stayDone(message) {
    window.SuperToast?.success?.(message);
    onStayChanged?.();
  }

  async function handleModeChange(reason) {
    const mode = isManual ? 'auto' : 'manual';
    await window.CertAPI.setStayMode(stayKey, mode, reason);
    stayDone(mode === 'manual' ? 'Stay switched to manual' : 'Stay back to automatic');
  }

  async function handleEndStay({ endDate, reason }) {
    if (endModal === 'review') {
      await window.CertAPI.resolveStayReview(stayKey, { action: 'end', endDate });
    } else {
      await window.CertAPI.endStay(stayKey, { endDate, reason });
    }
    stayDone('Stay ended');
  }

  async function handleReviewAction(action) {
    await window.CertAPI.resolveStayReview(stayKey, { action });
    stayDone(action === 'end' ? 'Stay ended' : 'Stay kept open');
  }

  async function handleAddCert({ type, dueDate }) {
    await window.CertAPI.addStayCertification(stayKey, { type, dueDate });
    stayDone('Certification added');
  }

  function handleMenuAction(action) {
    setMenuOpen(false);
    if (action === 'mode') setModeModalOpen(true);
    if (action === 'addCert') setAddCertOpen(true);
    if (action === 'end') setEndModal('menu');
  }

  // Compute card urgency for accent styling — driven by backend-computed urgency
  const hasOverdue = displayCerts.some(cert => isOverdueUrgency(getCertUrgency(cert).urgency));
  const hasDueSoon = !hasOverdue && displayCerts.some(cert => getCertUrgency(cert).urgency === 'due_soon');
  let cardUrgency = '';
  if (hasOverdue) cardUrgency = ' cert__stay-card--overdue';
  else if (hasDueSoon) cardUrgency = ' cert__stay-card--due-soon';

  return (
    <div class={`cert__stay-card${cardUrgency}`}>
      {/* Stay header */}
      <div class="cert__stay-header">
        <div class="cert__stay-header-left">
          <span class="cert__stay-patient">{patientName}</span>
          <StayTypeBadge payerType={payerType} />
          {isManual && <ManualBadge />}
          <ChainIndicator allCerts={allCerts} />
          {outstandingCount > 0 && (
            <span class="cert__stay-due-badge">
              {outstandingCount} cert{outstandingCount !== 1 ? 's' : ''} still due
            </span>
          )}
        </div>
        <div class="cert__stay-header-right">
          {dischargeDate && (
            <span class="cert__stay-meta cert__stay-meta--discharged">
              Discharged {formatShortDate(dischargeDate)}
            </span>
          )}
          {currentMedicareDay != null && (
            <span class="cert__stay-meta">Day {currentMedicareDay}</span>
          )}
          {partAStartDate && (
            <span class="cert__stay-meta">{formatShortDate(partAStartDate)}</span>
          )}
          {stayKey && (
            <div class="cert__row-menu-container cert__stay-menu" ref={menuRef}>
              <button class="cert__row-menu-btn" data-track="cert_stay_menu_opened" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} aria-label="Stay actions">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>
              {menuOpen && (
                <div class="cert__row-menu">
                  <button class="cert__row-menu-item" data-track="cert_stay_mode_clicked" data-track-prop-to-mode={isManual ? 'auto' : 'manual'} data-action="mode" onClick={() => handleMenuAction('mode')}>
                    {isManual ? 'Back to automatic' : 'Switch to manual'}
                  </button>
                  <button class="cert__row-menu-item" data-track="cert_stay_add_cert_clicked" data-action="addCert" onClick={() => handleMenuAction('addCert')}>
                    Add certification
                  </button>
                  {!stayEnded && (
                    <button class="cert__row-menu-item cert__row-menu-item--danger" data-track="cert_stay_end_clicked" data-action="end" onClick={() => handleMenuAction('end')}>
                      End stay
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {stayKey && reviewKind && (
        <StayReviewBanner
          kind={reviewKind}
          reason={reviewReason}
          onConfirm={() => handleReviewAction('confirm')}
          onEnd={() => setEndModal('review')}
        />
      )}

      {/* Active cert rows */}
      <div class="cert__stay-certs">
        {displayCerts.map(cert => (
          <CertListRow
            key={cert.id}
            cert={cert}
            compact
            onSend={onSend}
            onSchedule={onSchedule}
            onSkip={onSkip}
            onDelay={onDelay}
            onUnskip={onUnskip}
            onRevoke={onRevoke}
            onEditReason={onEditReason}
            onViewPractitioner={onViewPractitioner}
          />
        ))}
      </div>

      {/* History toggle (signed/skipped) */}
      {historyCerts.length > 0 && (
        <div class="cert__stay-history">
          <button
            class="cert__stay-history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <span class="cert__stay-history-icon">{historyOpen ? '\u25BC' : '\u25B6'}</span>
            {historyCerts.length} previous certification{historyCerts.length !== 1 ? 's' : ''}
          </button>
          {historyOpen && (
            <div class="cert__stay-history-list">
              {historyCerts.map(cert => (
                <CertListRow
                  key={cert.id}
                  cert={cert}
                  compact
                  onSend={onSend}
                  onSchedule={onSchedule}
                  onSkip={onSkip}
                  onDelay={onDelay}
                  onUnskip={onUnskip}
                  onRevoke={onRevoke}
                  onEditReason={onEditReason}
                  onViewPractitioner={onViewPractitioner}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {stayKey && (
        <>
          <StayReasonModal
            isOpen={modeModalOpen}
            onClose={() => setModeModalOpen(false)}
            title={isManual ? 'Back to automatic' : 'Switch to manual'}
            subtitle={patientName}
            hint={isManual
              ? 'The system will go back to starting and ending this stay from PCC data.'
              : "The system will stop starting or ending this stay from PCC data. Recerts will still be created on schedule for you to send."}
            placeholder={isManual ? 'e.g., Census is correct now' : "e.g., Payer in PCC doesn't match the authorization"}
            submitLabel={isManual ? 'Back to automatic' : 'Switch to manual'}
            onSubmit={handleModeChange}
          />
          <EndStayModal
            isOpen={!!endModal}
            onClose={() => setEndModal(null)}
            patientName={patientName}
            startDate={partAStartDate}
            askReason={endModal !== 'review'}
            defaultEndDate={endModal === 'review' && reviewKind === 'discharged' ? first.patientDischargeDate || null : null}
            hint={endModal === 'review' && reviewKind === 'discharged'
              ? 'Defaults to the discharge date in PCC. Certifications due after this date are cancelled.'
              : undefined}
            onSubmit={handleEndStay}
          />
          <AddStayCertModal
            isOpen={addCertOpen}
            onClose={() => setAddCertOpen(false)}
            patientName={patientName}
            existingTypes={existingTypes}
            onSubmit={handleAddCert}
          />
        </>
      )}
    </div>
  );
}
