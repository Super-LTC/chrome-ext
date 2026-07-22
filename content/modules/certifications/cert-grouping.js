/**
 * Pure grouping + search helpers for cert lists: flat array → patient → stay → certs.
 *
 * A patient can have more than one Part A stay (readmits, interruptions), so the
 * stay tier is real and not cosmetic. Field resolution is deliberately tolerant:
 * the main `/certifications` route returns the full `CertificationWithDetails`
 * shape, while the `/certifications/audit` route is a leaner projection. Every
 * field read here falls back rather than assuming, so the same helper serves
 * both lists (and degrades instead of throwing if a projection drops a column).
 *
 * Server-computed truth (`urgency`, `actionNeeded`) is preferred wherever it's
 * present; the local derivation only fills in when the field is absent.
 */
import { getCertUrgency, isOverdueUrgency, parseDateOnly } from './cert-urgency.js';

/** Statuses where the cert is finished — nothing further is owed on it. */
const TERMINAL_STATUSES = new Set(['signed', 'skipped', 'revoked']);

export function isTerminalCertStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Does this cert still need someone to act? Prefers the backend's `actionNeeded`
 * (time-pressure aware, facility timezone) and only derives when it's missing.
 * @param {Object} cert
 * @returns {boolean}
 */
export function isCertActionNeeded(cert) {
  if (!cert) return false;
  if (typeof cert.actionNeeded === 'boolean') return cert.actionNeeded;
  if (isTerminalCertStatus(cert.status)) return false;
  const { urgency } = getCertUrgency(cert);
  return isOverdueUrgency(urgency) || urgency === 'due_soon';
}

/**
 * Free-text match over the fields a nurse actually types: patient name and the
 * PCC MRN. Case- and whitespace-insensitive substring.
 * @param {Object} cert
 * @param {string} query
 * @returns {boolean}
 */
export function matchesCertSearch(cert, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (!cert) return false;
  const name = String(cert.patientName || '').toLowerCase();
  const mrn = String(cert.patientExternalId || '').toLowerCase();
  return name.includes(q) || mrn.includes(q);
}

/**
 * Filter a flat cert list by the search box. Returns the input array unchanged
 * when the query is empty, so callers can pass it through unconditionally.
 * @param {Array} certs
 * @param {string} query
 * @returns {Array}
 */
export function filterCertsBySearch(certs, query) {
  const list = Array.isArray(certs) ? certs : [];
  if (!String(query || '').trim()) return list;
  return list.filter((c) => matchesCertSearch(c, query));
}

/** Identity for the patient tier — internal id, then MRN, then name. */
function patientKeyOf(cert) {
  return String(cert.patientId || cert.patientExternalId || cert.patientName || 'unknown');
}

/**
 * Identity for the stay tier. `partAStayId` is the real key; when a projection
 * omits it, the Part A start date separates stays for the same patient well
 * enough (two stays can't begin on the same day).
 */
function stayKeyOf(cert) {
  return String(cert.partAStayId || cert.partAStartDate || 'unknown');
}

/** Ascending by due date; nulls sort last. */
function byDueDate(a, b) {
  const da = parseDateOnly(a.dueDate);
  const db = parseDateOnly(b.dueDate);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

/** Within a stay: the cert chain order (Initial → 14 → 30), else by due date. */
function byChainOrder(a, b) {
  const sa = a.sequenceNumber;
  const sb = b.sequenceNumber;
  if (typeof sa === 'number' && typeof sb === 'number' && sa !== sb) return sa - sb;
  return byDueDate(a, b);
}

/** Newest stay first; unknown start dates sort last. */
function byStayStartDesc(a, b) {
  const da = parseDateOnly(a.partAStartDate);
  const db = parseDateOnly(b.partAStartDate);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return db - da;
}

/**
 * Group a flat cert list into patient → stay → certs.
 *
 * Ordering is lookup-oriented (patients A–Z), because this drives the
 * facility-wide audit list where the task is "find this resident", not
 * "work the queue". Within a patient, newest stay first; within a stay, the
 * cert chain in sequence order.
 *
 * @param {Array} certs flat cert rows
 * @returns {Array<{
 *   patientKey: string, patientName: string, patientExternalId: string,
 *   certCount: number, actionNeededCount: number,
 *   stays: Array<{
 *     stayId: string, partAStartDate: ?string, stayEndDate: ?string,
 *     payerType: ?string, stayStatus: ?string, medicareDay: ?number,
 *     certs: Array, certCount: number, actionNeededCount: number, nextDue: ?string
 *   }>
 * }>}
 */
export function groupCertsByStay(certs) {
  const list = Array.isArray(certs) ? certs : [];
  const patients = new Map();

  for (const cert of list) {
    if (!cert) continue;
    const pKey = patientKeyOf(cert);
    if (!patients.has(pKey)) {
      patients.set(pKey, {
        patientKey: pKey,
        patientName: cert.patientName || '—',
        patientExternalId: cert.patientExternalId || '',
        stays: new Map(),
      });
    }
    const patient = patients.get(pKey);
    // Backfill identity from whichever row happens to carry it.
    if (!patient.patientExternalId && cert.patientExternalId) {
      patient.patientExternalId = cert.patientExternalId;
    }

    const sKey = stayKeyOf(cert);
    if (!patient.stays.has(sKey)) {
      patient.stays.set(sKey, {
        stayId: sKey,
        partAStartDate: cert.partAStartDate || null,
        stayEndDate: cert.stayEndDate || null,
        payerType: cert.payerType || null,
        stayStatus: cert.stayStatus || null,
        // `currentMedicareDay` is the live census day (main route);
        // `medicareDayAtDue` is the per-cert snapshot (audit route).
        medicareDay: cert.currentMedicareDay ?? cert.medicareDayAtDue ?? null,
        certs: [],
      });
    }
    const stay = patient.stays.get(sKey);
    // Stay-level facts can be missing on some rows — take the first non-null.
    if (stay.partAStartDate == null && cert.partAStartDate != null) stay.partAStartDate = cert.partAStartDate;
    if (stay.stayEndDate == null && cert.stayEndDate != null) stay.stayEndDate = cert.stayEndDate;
    if (stay.payerType == null && cert.payerType != null) stay.payerType = cert.payerType;
    if (stay.stayStatus == null && cert.stayStatus != null) stay.stayStatus = cert.stayStatus;
    if (stay.medicareDay == null) {
      stay.medicareDay = cert.currentMedicareDay ?? cert.medicareDayAtDue ?? null;
    }
    stay.certs.push(cert);
  }

  const out = [];
  for (const patient of patients.values()) {
    const stays = [...patient.stays.values()].map((stay) => {
      const sorted = [...stay.certs].sort(byChainOrder);
      const open = sorted.filter((c) => !isTerminalCertStatus(c.status));
      const nextDue = open.slice().sort(byDueDate)[0]?.dueDate || null;
      return {
        ...stay,
        certs: sorted,
        certCount: sorted.length,
        actionNeededCount: sorted.filter(isCertActionNeeded).length,
        nextDue,
      };
    });
    stays.sort(byStayStartDesc);

    out.push({
      patientKey: patient.patientKey,
      patientName: patient.patientName,
      patientExternalId: patient.patientExternalId,
      stays,
      certCount: stays.reduce((n, s) => n + s.certCount, 0),
      actionNeededCount: stays.reduce((n, s) => n + s.actionNeededCount, 0),
    });
  }

  out.sort((a, b) => a.patientName.localeCompare(b.patientName));
  return out;
}
