import { useState } from 'preact/hooks';
import { CertListRow } from './CertListRow.jsx';
import { StayTypeBadge } from './StayTypeBadge.jsx';
import { formatShortDate, getCertUrgency, isOverdueUrgency } from '../cert-urgency.js';

/**
 * StayGroupCard — groups all certs for one Part A stay into a single card.
 *
 * Header: patient name + MA badge + chain indicator + Medicare Day + date
 * Chain indicator: 3 small colored dots (I / 14 / 30) showing chain status at a glance
 * Active certs shown as compact CertListRow
 * Signed certs collapsed under "▶ X previous" toggle
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
    <div class="cert__chain-indicator">
      {CHAIN_TYPES.map((type, i) => {
        const cert = certByType[type];
        const variant = getChainDotVariant(cert);
        return (
          <span key={type} class="cert__chain-item">
            {i > 0 && <span class="cert__chain-line" />}
            <span class={`cert__chain-dot cert__chain-dot--${variant}`} />
            <span class={`cert__chain-label cert__chain-label--${variant}`}>
              {CHAIN_LABELS[type]}
            </span>
          </span>
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
  onSkip,
  onDelay,
  onUnskip,
  onEditReason,
  onViewPractitioner,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  // Stay-level info from first cert (all certs in the stay share these)
  const first = allCerts[0];
  const patientName = first.patientName;
  const payerType = first.payerType;
  const currentMedicareDay = first.currentMedicareDay;
  const partAStartDate = first.partAStartDate;

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
          <ChainIndicator allCerts={allCerts} />
        </div>
        <div class="cert__stay-header-right">
          {currentMedicareDay != null && (
            <span class="cert__stay-meta">Day {currentMedicareDay}</span>
          )}
          {partAStartDate && (
            <span class="cert__stay-meta">{formatShortDate(partAStartDate)}</span>
          )}
        </div>
      </div>

      {/* Active cert rows */}
      <div class="cert__stay-certs">
        {displayCerts.map(cert => (
          <CertListRow
            key={cert.id}
            cert={cert}
            compact
            onSend={onSend}
            onSkip={onSkip}
            onDelay={onDelay}
            onUnskip={onUnskip}
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
                  onSkip={onSkip}
                  onDelay={onDelay}
                  onUnskip={onUnskip}
                  onEditReason={onEditReason}
                  onViewPractitioner={onViewPractitioner}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
