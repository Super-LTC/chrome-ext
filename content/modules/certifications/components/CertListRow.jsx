import { useState, useRef, useEffect } from 'preact/hooks';
import { CertTypeBadge } from './CertTypeBadge.jsx';
import { CertStatusBadge } from './CertStatusBadge.jsx';
import { MAPayerBadge } from './MAPayerBadge.jsx';
import { formatShortDate, getCertUrgency, isOverdueUrgency } from '../cert-urgency.js';

/**
 * CertListRow — two-line card for a single certification.
 *
 * Line 1: type badge + patient name + MA badge + status badge + primary action
 * Line 2: due date + medicare day + send history (expandable) + signed-by
 * Overflow menu: Skip, Edit Clinical Reason, Mark as Delayed (contextual)
 */

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getPrimaryAction(cert) {
  const { urgency } = getCertUrgency(cert);
  const hasSends = cert.sends?.length > 0;

  if (urgency === 'skipped') {
    return { label: 'Unskip', variant: 'ghost', action: 'unskip' };
  }
  if (urgency === 'signed') {
    return null;
  }
  if (isOverdueUrgency(urgency)) {
    return { label: hasSends ? 'Resend' : 'Send', variant: 'destructive', action: 'send' };
  }
  if (hasSends) {
    return { label: 'Resend', variant: 'outline', action: 'send' };
  }
  return { label: 'Send', variant: 'primary', action: 'send' };
}

function SendHistorySummary({ sends }) {
  if (!sends || sends.length === 0) return null;

  const label = sends.length === 1
    ? `Sent to ${sends[0].practitionerName}`
    : `Sent ${sends.length} times`;

  return (
    <span class="cert__row-meta cert__row-meta--link cert__sends-summary">
      {label}
    </span>
  );
}

function SendHistoryExpanded({ sends }) {
  return (
    <div class="cert__sends-detail">
      {sends.map((s, i) => (
        <div key={i} class="cert__sends-detail-row">
          <span class="cert__sends-detail-name">{s.practitionerName}{s.practitionerTitle ? `, ${s.practitionerTitle}` : ''}</span>
          <span class="cert__sends-detail-date">{formatDateTime(s.sentAt)}</span>
          {s.smsStatus && <span class={`cert__sends-detail-status cert__sends-detail-status--${s.smsStatus}`}>{s.smsStatus}</span>}
        </div>
      ))}
    </div>
  );
}

export function CertListRow({ cert, compact, onSend, onSkip, onUnskip, onDelay, onEditReason, onViewPractitioner }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendsExpanded, setSendsExpanded] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [menuOpen]);

  const primaryAction = getPrimaryAction(cert);
  const isRecert = cert.type === 'day_14_recert' || cert.type === 'day_30_recert';
  const showSkip = cert.status !== 'skipped' && cert.status !== 'signed';
  const showDelay = cert.status === 'pending' && !cert.isDelayed && cert.status !== 'signed';
  const showEditReason = isRecert && cert.status !== 'signed';
  const hasSends = cert.sends?.length > 0;

  // Urgency class for row accent styling — driven by backend-computed urgency
  const { urgency } = getCertUrgency(cert);
  let urgencyClass = '';
  if (urgency === 'signed') urgencyClass = ' cert__row--signed';
  else if (urgency === 'skipped') urgencyClass = ' cert__row--skipped';
  else if (isOverdueUrgency(urgency)) urgencyClass = ' cert__row--overdue';
  else if (urgency === 'due_soon') urgencyClass = ' cert__row--due-soon';

  function handlePrimaryClick(e) {
    e.stopPropagation();
    if (!primaryAction) return;
    if (primaryAction.action === 'send') onSend?.(cert);
    if (primaryAction.action === 'unskip') onUnskip?.(cert);
  }

  function handleMenuAction(action) {
    setMenuOpen(false);
    if (action === 'skip') onSkip?.(cert);
    if (action === 'delay') onDelay?.(cert);
    if (action === 'editReason') onEditReason?.(cert);
  }

  return (
    <div class={`cert__row${urgencyClass}`}>
      <div class="cert__row-top">
        <div class="cert__row-left">
          <CertTypeBadge type={cert.type} />
          {!compact && <span class="cert__row-patient">{cert.patientName}</span>}
          {!compact && <MAPayerBadge payerType={cert.payerType} />}
        </div>
        <div class="cert__row-right">
          <CertStatusBadge
            status={cert.status}
            isDelayed={cert.isDelayed}
            dueDate={cert.dueDate}
            signedAt={cert.signedAt}
            urgency={cert.urgency}
            daysUntilDue={cert.daysUntilDue}
          />
          {primaryAction && (
            <button
              class={`cert__row-action cert__row-action--${primaryAction.variant}`}
              onClick={handlePrimaryClick}
              data-track="cert_clicked"
              data-track-prop-cert-type={cert.type}
            >
              {primaryAction.label}
            </button>
          )}
          {(showSkip || showDelay || showEditReason) && (
            <div class="cert__row-menu-container" ref={menuRef}>
              {/* NO_TRACK */}
              <button
                class="cert__row-menu-btn"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                aria-label="More actions"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>
              {menuOpen && (
                <div class="cert__row-menu">
                  {showSkip && (
                    // NO_TRACK
                    <button class="cert__row-menu-item" onClick={() => handleMenuAction('skip')}>
                      Skip Certification
                    </button>
                  )}
                  {showDelay && (
                    // NO_TRACK
                    <button class="cert__row-menu-item" onClick={() => handleMenuAction('delay')}>
                      Mark as Delayed
                    </button>
                  )}
                  {showEditReason && (
                    // NO_TRACK
                    <button class="cert__row-menu-item" onClick={() => handleMenuAction('editReason')}>
                      Edit Clinical Reason
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div class="cert__row-bottom">
        {cert.dueDate && <span class="cert__row-meta">Due {formatShortDate(cert.dueDate)}</span>}
        {!compact && cert.currentMedicareDay != null && <span class="cert__row-meta">Medicare Day {cert.currentMedicareDay}</span>}
        {hasSends && (
          <span onClick={(e) => { e.stopPropagation(); setSendsExpanded(!sendsExpanded); }}>
            <SendHistorySummary sends={cert.sends} />
          </span>
        )}
        {cert.signedByName && (
          <span
            class={`cert__row-meta${cert.signedByPractitionerId && onViewPractitioner ? ' cert__row-meta--link' : ''}`}
            onClick={cert.signedByPractitionerId && onViewPractitioner ? (e) => { e.stopPropagation(); onViewPractitioner(cert.signedByPractitionerId); } : undefined}
          >
            {cert.signedByName}{cert.signedByTitle ? `, ${cert.signedByTitle}` : ''}
          </span>
        )}
      </div>
      {sendsExpanded && hasSends && (
        <SendHistoryExpanded sends={cert.sends} />
      )}
    </div>
  );
}
