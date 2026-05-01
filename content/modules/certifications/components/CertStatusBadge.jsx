/**
 * CertStatusBadge — color-coded urgency/status indicator.
 *
 * Backend ships `cert.urgency` + `cert.daysUntilDue` (facility-timezone +
 * grace-period aware). Use those if present; fall back to local derivation
 * for old backends still rolling out.
 */
import { formatShortDate, getCertUrgency } from '../cert-urgency.js';

export function CertStatusBadge({ status, isDelayed, dueDate, signedAt, urgency, daysUntilDue }) {
  const resolved = getCertUrgency({ status, isDelayed, dueDate, urgency, daysUntilDue });

  const u = resolved.urgency;
  const days = resolved.daysUntilDue;

  if (u === 'overdue' || u === 'awaiting_signature_overdue' || (u === 'delayed' && days < 0)) {
    const daysOver = Math.abs(days);
    return (
      <span class="cert__status-badge cert__status-badge--overdue">
        {daysOver} DAY{daysOver !== 1 ? 'S' : ''} OVERDUE
      </span>
    );
  }

  if (u === 'due_soon') {
    const label = days === 0 ? 'DUE TODAY' : `DUE IN ${days} DAY${days !== 1 ? 'S' : ''}`;
    return (
      <span class="cert__status-badge cert__status-badge--due-soon">
        {label}
      </span>
    );
  }

  if (u === 'awaiting_signature') {
    return (
      <span class="cert__status-badge cert__status-badge--awaiting">
        AWAITING SIGNATURE
      </span>
    );
  }

  if (u === 'signed') {
    return (
      <span class="cert__status-badge cert__status-badge--signed">
        Signed {formatShortDate(signedAt)}
      </span>
    );
  }

  if (u === 'delayed') {
    return (
      <span class="cert__status-badge cert__status-badge--delayed">
        DELAYED
      </span>
    );
  }

  if (u === 'skipped') {
    return (
      <span class="cert__status-badge cert__status-badge--skipped">
        SKIPPED
      </span>
    );
  }

  return (
    <span class="cert__status-badge cert__status-badge--pending">
      PENDING
    </span>
  );
}
