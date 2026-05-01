/**
 * Shared helpers for cert urgency / due-date display.
 *
 * Backend ships `cert.urgency` + `cert.daysUntilDue` computed with facility
 * timezone + grace period rules. Always prefer those.
 *
 * Legacy fallback computes locally for old backends still rolling out.
 * Uses local-midnight date parsing so 'YYYY-MM-DD' doesn't drift to the
 * previous day in US timezones.
 */

export function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  const s = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr + 'T00:00:00'
    : dateStr;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function formatShortDate(dateStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr || '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Returns { urgency, daysUntilDue } — prefers backend fields, falls back to local math. */
export function getCertUrgency(cert) {
  if (cert && cert.urgency) {
    return { urgency: cert.urgency, daysUntilDue: cert.daysUntilDue ?? 0 };
  }
  const due = parseDateOnly(cert?.dueDate);
  let daysUntilDue = 0;
  let isPastDue = false;
  if (due) {
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    daysUntilDue = Math.floor((due - now) / 86400000);
    isPastDue = daysUntilDue < 0;
  }
  let urgency;
  if (cert?.status === 'signed') urgency = 'signed';
  else if (cert?.status === 'skipped') urgency = 'skipped';
  else if (cert?.isDelayed) urgency = 'delayed';
  else if (cert?.status === 'sent') urgency = isPastDue ? 'awaiting_signature_overdue' : 'awaiting_signature';
  else if (isPastDue) urgency = 'overdue';
  else if (daysUntilDue <= 3) urgency = 'due_soon';
  else urgency = 'pending';
  return { urgency, daysUntilDue };
}

export function isOverdueUrgency(u) {
  return u === 'overdue' || u === 'awaiting_signature_overdue' || u === 'delayed';
}

/**
 * Legacy thin wrapper — returns just the day delta. Prefer getCertUrgency()
 * for any new code; this exists so call sites that only used `daysUntil` can
 * be migrated incrementally.
 */
export function getDaysUntil(dateStrOrCert) {
  if (typeof dateStrOrCert === 'string' || dateStrOrCert == null) {
    const due = parseDateOnly(dateStrOrCert);
    if (!due) return null;
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.floor((due - now) / 86400000);
  }
  return getCertUrgency(dateStrOrCert).daysUntilDue;
}
