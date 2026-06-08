/**
 * derive.js — normalization + aggregation for the F-Tag Prevention overlay.
 *
 * The backend `FtagFinding` row shape is defined in the web repo
 * (core/types/ftag-prevention.types.ts), not here, so this layer is
 * deliberately defensive: it reads each logical field from a list of
 * candidate keys and degrades gracefully when a field is absent. If the
 * real field names differ, this is the ONE file to adjust.
 *
 * The `FtagSource` discriminated union, by contrast, is fully specified in
 * the handoff and is passed through verbatim.
 */
import { ftagMeta, codeStatusHeadline, vitalTypeLabel } from './ftags.js';

const SEVERITY_RANK = { critical: 3, high: 2, standard: 1, low: 0 };

function pick(obj, keys, fallback = undefined) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

/**
 * Normalize one feed item ({ finding, status, source }) — or a bare finding —
 * into the flat shape the overlay renders.
 */
export function normalizeFinding(item) {
  const finding = item?.finding ?? item ?? {};
  // Per-finding display fields live in `finding.data` (drug, patientName,
  // refusalCount, …); top-level holds id/tag/severity/dates/ids. We look in
  // `data` first, then the top level, so both layouts work.
  const d = (finding.data && typeof finding.data === 'object') ? finding.data : {};
  const status = String(item?.status ?? finding.status ?? 'open').toLowerCase();
  const source = item?.source ?? finding.source ?? { kind: 'none' };

  const ftag = String(
    pick(finding, ['tag', 'ftag', 'fTag', 'ftagCode', 'fTagCode'], '')
  ).toUpperCase() || 'UNKNOWN';

  const severityRaw = String(
    pick(finding, ['severity', 'severityLevel', 'priority'], 'standard')
  ).toLowerCase();
  const severity = severityRaw in SEVERITY_RANK ? severityRaw : 'standard';

  const acute = Boolean(
    finding.acute ?? finding.isAcute ?? d.acute ?? d.isAcute ??
    String(pick({ ...d, ...finding }, ['urgencyBand', 'band', 'urgency'], '')).toLowerCase() === 'acute'
  );

  const meta = ftagMeta(ftag);

  const norm = {
    id: pick(finding, ['id', 'findingId', '_id']),
    ftag,
    status,
    source: source || { kind: 'none' },
    patientName: cleanName(pick(d, ['patientName', 'residentName', 'name'])
      || pick(finding, ['residentName', 'patientName', 'resident', 'name'], 'Unknown resident')),
    patientId: pick(finding, ['patientId', 'residentId', 'internalPatientId']),
    pccPatientId: pick(finding, ['pccPatientId', 'externalPatientId', 'clientId', 'pccClientId', 'externalClientId'])
      || pick(d, ['pccPatientId', 'externalPatientId', 'clientId']),
    severity,
    acute,
    triggeredAt: pick(finding, ['triggeredAt', 'flaggedAt', 'detectedAt', 'createdAt', 'updatedAt']),
    // Bold one-liner shown in the list ("Refused Insulin Aspart 33×").
    clinicalDetail: pick(finding, ['clinicalDetail', 'detail', 'headline', 'title', 'summary', 'label'])
      || buildClinicalDetail(ftag, d),
    // Small grey tag next to it ("INSULIN", "ANTISEIZURE").
    detailTag: pick(d, ['criticalClass', 'medClass', 'medicationClass', 'drugClass', 'category', 'class'])
      || pick(finding, ['medClass', 'medicationClass', 'drugClass', 'category', 'class']),
    rationale: pick(finding, ['rationale', 'reason', 'description', 'explanation', 'why'])
      || pick(d, ['rationale', 'reason', 'description']),
    resolutionType: pick(finding, ['resolutionType', 'resolution']),
    resolvedAt: pick(finding, ['resolvedAt', 'closedAt']),
    resolvedBy: pick(finding, ['resolvedBy', 'closedBy']),
    snoozedAt: pick(finding, ['snoozedAt']),
    snoozedBy: pick(finding, ['snoozedBy']),
    snoozedUntil: pick(finding, ['snoozedUntil', 'snoozeUntil']),
    // Evidence = the data blob minus fields shown elsewhere.
    evidence: finding.evidence ?? finding.evidenceFields ?? cleanEvidence(d),
    raw: finding,
    catalogTitle: meta?.title || ftag,
    catalogSubtitle: meta?.subtitle || '',
  };

  // F678 (Code Status / CPR) renders a bespoke card: four stacked source rows
  // with the minority value tinted, a "what to reconcile" line, and a "View
  // form" action when a signed directive is present. Build that structure here
  // and suppress the generic evidence dump (which otherwise shows raw JSON).
  if (ftag === 'F678') {
    const codeStatus = buildCodeStatus(d);
    norm.codeStatus = codeStatus;
    norm.clinicalDetail = codeStatusHeadline(severity);
    norm.detailTag = null;
    norm.evidence = null;
    // Route "View form" through the existing SourceView dispatch: synthesize a
    // `document` source from the signed-directive entry when one exists, else
    // leave it `none` so no source affordance shows (EMR sources are already on
    // the nurse's PCC screen).
    const ds = codeStatus.documentSource;
    norm.source = ds
      ? {
          // Real feed carries the doc id in `sourceRef`; `documentId` is the
          // handoff name and may be absent — accept either.
          kind: 'document',
          documentId: ds.documentId ?? ds.sourceRef ?? null,
          page: ds.page ?? null,
          evidence: ds.evidence ?? null,
          documentType: ds.documentType ?? null,
          confidence: ds.confidence ?? null,
          normalized: ds.normalized ?? null,
        }
      : { kind: 'none' };
  }

  // F580 (Notification of Change) leads with the abnormal vital + a high/low
  // direction, like the web card ("Pulse 134 bpm ▲ high"), instead of the
  // generic subtitle + raw-id chips.
  if (ftag === 'F580') {
    const vital = buildVital(d);
    if (vital) {
      norm.vital = vital;
      norm.clinicalDetail = `${vital.label} ${vital.value}`.trim();
      norm.detailTag = null;
      norm.evidence = vitalEvidence(d);
    }
  }

  return norm;
}

/* ---- F580 vitals: lead line + direction + curated evidence ---- */

// Out-of-range bands for the common vitals (low, high). Used only to label the
// already-flagged value's direction; backend `direction`/`flag` wins if present.
const VITAL_RANGES = {
  pulse: [60, 100], heart_rate: [60, 100], hr: [60, 100],
  temperature: [97, 99.5], temp: [97, 99.5],
  respiratory_rate: [12, 20], respiration: [12, 20], resp: [12, 20],
  blood_sugar: [70, 180], blood_glucose: [70, 180], glucose: [70, 180],
  oxygen_saturation: [92, null], spo2: [92, null], o2_sat: [92, null], pulse_ox: [92, null],
  blood_pressure: [90, 140], systolic: [90, 140], bp: [90, 140],
};

function vitalDirection(d) {
  const explicit = String(pick(d, ['direction', 'abnormalDirection', 'flag', 'highLow', 'trend'], '')).toLowerCase();
  if (/high|^h$|up|above/.test(explicit)) return 'high';
  if (/low|^l$|down|below/.test(explicit)) return 'low';

  const vt = String(pick(d, ['vitalType', 'vital', 'type'], '')).toLowerCase().replace(/\s+/g, '_');
  const range = VITAL_RANGES[vt];
  if (!range) return null;
  const num = parseFloat(String(pick(d, ['rawValue', 'value', 'reading', 'result'], '')));
  if (Number.isNaN(num)) return null;
  const [lo, hi] = range;
  if (lo != null && num < lo) return 'low';
  if (hi != null && num > hi) return 'high';
  return null;
}

function buildVital(d) {
  if (!d || typeof d !== 'object') return null;
  const vt = pick(d, ['vitalType', 'vital', 'type']);
  const value = pick(d, ['rawValue', 'value', 'reading', 'result']);
  if (!vt && !value) return null;
  return {
    label: vt ? vitalTypeLabel(vt) : 'Vital',
    value: value != null ? String(value) : '',
    direction: vitalDirection(d),
  };
}

// Curated F580 evidence: the reading, when it was taken, and how long it went
// un-noted — no internal ids. Each piece is best-effort; absent ones are skipped.
function vitalEvidence(d) {
  const rows = [];
  const reading = pick(d, ['rawValue', 'value', 'reading', 'result']);
  if (reading != null) rows.push({ label: 'reading', value: String(reading) });
  const taken = pick(d, ['takenAt', 'measuredAt', 'observedAt', 'recordedAt', 'vitalDate', 'effectiveDate']);
  if (taken) rows.push({ label: 'taken', value: taken });
  const hours = pick(d, ['hoursWithoutNote', 'hoursSinceNote', 'noteGapHours', 'hoursElapsed', 'hoursWithout']);
  if (hours != null) rows.push({ label: 'no note within', value: `${hours}h` });
  return rows.length ? rows : null;
}

// Fixed render order + display label for F678's code-status sources.
const CS_ORDER = [
  ['pcc_record', 'Record'],
  ['order', 'Order'],
  ['care_plan', 'Care plan'],
  ['document', 'Form'],
];

function csValueLabel(normalized) {
  if (normalized === 'full_code') return 'Full Code';
  if (normalized === 'dnr') return 'DNR';
  return '—';
}

/**
 * Build the F678 code-status view model from `finding.data`:
 *   - rows: the four sources in fixed order (present or `—`), with minority-tint
 *     and stale flags
 *   - minorityValue: 'full_code' | 'dnr' | 'tie' | null (the odd-one-out side)
 *   - documentSource: the signed-directive entry, if any (drives "View form")
 *   - reconcile: one-line "what to reconcile" sentence
 */
function buildCodeStatus(d) {
  const sources = Array.isArray(d?.sources) ? d.sources : [];
  const staleSet = new Set(Array.isArray(d?.staleSources) ? d.staleSources : []);

  // First entry per source wins (defensive against dupes).
  const byKey = new Map();
  for (const s of sources) {
    if (s && s.source && !byKey.has(s.source)) byKey.set(s.source, s);
  }

  // Minority = the less-common known value among present sources. Tie → both.
  let fullCount = 0;
  let dnrCount = 0;
  for (const s of byKey.values()) {
    if (s.normalized === 'full_code') fullCount += 1;
    else if (s.normalized === 'dnr') dnrCount += 1;
  }
  let minorityValue = null;
  if (fullCount > 0 && dnrCount > 0) {
    if (fullCount < dnrCount) minorityValue = 'full_code';
    else if (dnrCount < fullCount) minorityValue = 'dnr';
    else minorityValue = 'tie';
  }
  const isMinority = (normalized) => {
    if (!normalized || normalized === 'unknown') return false;
    if (minorityValue === 'tie') return true;
    return normalized === minorityValue;
  };

  const rows = CS_ORDER.map(([key, label]) => {
    const s = byKey.get(key);
    const normalized = s?.normalized || null;
    const docMeta = key === 'document' && s
      ? { documentType: s.documentType ?? null, confidence: s.confidence ?? null }
      : null;
    return {
      key,
      label,
      present: !!s,
      normalized,
      value: csValueLabel(normalized),
      isMinority: s ? isMinority(normalized) : false,
      stale: staleSet.has(key),
      docMeta,
      // Full source text shown in the collapsible details, so the nurse can
      // adjudicate without opening PCC. Order: the raw order text. Care plan:
      // the focus + its goals/interventions.
      detail: buildSourceDetail(key, s),
    };
  });

  return {
    rows,
    minorityValue,
    conflictingSources: Array.isArray(d?.conflictingSources) ? d.conflictingSources : [],
    staleSources: Array.isArray(d?.staleSources) ? d.staleSources : [],
    documentSource: byKey.get('document') || null,
    reconcile: buildReconcileLine(rows, minorityValue),
  };
}

// Inline source detail for the F678 expandable section. Order carries its full
// text in rawValue; care_plan carries the focus text + goals[]/interventions[].
function buildSourceDetail(key, s) {
  if (!s) return null;
  if (key === 'order') {
    const text = s.rawValue ? String(s.rawValue).trim() : null;
    return text ? { kind: 'order', text } : null;
  }
  if (key === 'care_plan') {
    const focus = s.rawValue ? String(s.rawValue).trim() : null;
    const goals = (Array.isArray(s.goals) ? s.goals : []).map((g) => String(g).trim()).filter(Boolean);
    const interventions = (Array.isArray(s.interventions) ? s.interventions : []).map((i) => String(i).trim()).filter(Boolean);
    if (!focus && !goals.length && !interventions.length) return null;
    return { kind: 'care_plan', focus, goals, interventions };
  }
  return null;
}

function joinLabels(labels) {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// "Care plan says DNR; chart says Full Code — reconcile." On a 1-vs-1 tie, name
// both sides instead of a majority "chart".
function buildReconcileLine(rows, minorityValue) {
  const known = rows.filter((r) => r.present && (r.normalized === 'full_code' || r.normalized === 'dnr'));
  if (known.length < 2) return null;

  if (minorityValue === 'tie') {
    const [a, b] = known;
    return `${a.label} says ${a.value}; ${b.label} says ${b.value} — reconcile.`;
  }

  const minVal = csValueLabel(minorityValue);
  const majVal = csValueLabel(minorityValue === 'full_code' ? 'dnr' : 'full_code');
  const dissenters = known.filter((r) => r.normalized === minorityValue).map((r) => r.label);
  const subject = joinLabels(dissenters);
  const verb = dissenters.length === 1 ? 'says' : 'say';
  return `${subject} ${verb} ${minVal}; chart says ${majVal} — reconcile.`;
}

// Collapse PCC's double spaces; leave the rest ("Smith, Robert (NWK41026)") intact.
function cleanName(name) {
  if (!name) return 'Unknown resident';
  return String(name).replace(/\s{2,}/g, ' ').trim();
}

// Build the bold clinical one-liner from the data blob, best-effort per signal.
function buildClinicalDetail(ftag, d) {
  if (!d || typeof d !== 'object') return null;
  if (d.drug && d.refusalCount != null) return `Refused ${d.drug} ${d.refusalCount}×`;
  if (d.drug) return d.drug;
  if (d.weightLossPct != null) return `${d.weightLossPct}% weight loss`;
  if (d.vitalType && d.value != null) return `${d.vitalType} ${d.value}`;
  return null;
}

// Strip fields already surfaced (name, drug+count in the detail line) and any
// internal ids the nurse shouldn't see, then order the useful supporting
// numbers/dates first so the trimmed evidence line reads cleanly.
const EVIDENCE_OMIT = new Set([
  // already shown in the name / detail line
  'patientName', 'residentName', 'name', 'criticalClass', 'drug', 'refusalCount',
  'status', 'sources', 'conflictingSources', 'staleSources',
  // internal ids — noise for a nurse
  'pccPatientId', 'externalPatientId', 'clientId', 'patientId',
  'orderId', 'administrationRecordId', 'externalAssessmentId',
  'id', 'findingId', 'dedupKey', 'locationId',
  'vitalId', 'weightId', 'assessmentId', 'noteId', 'documentId', 'sourceRef', 'focusId',
  'externalId', 'mdsId', 'recordId',
]);
const EVIDENCE_ORDER = ['lastRefusal', 'firstRefusal', 'windowDays', 'weightLossPct', 'vitalType', 'value', 'around'];

function cleanEvidence(d) {
  if (!d || typeof d !== 'object') return null;
  const entries = Object.entries(d).filter(([k, v]) =>
    !EVIDENCE_OMIT.has(k) && v !== null && v !== undefined && v !== '');
  entries.sort((a, b) => {
    const ia = EVIDENCE_ORDER.indexOf(a[0]); const ib = EVIDENCE_ORDER.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const out = {};
  for (const [k, v] of entries) out[k] = v;
  return Object.keys(out).length ? out : null;
}

export function severityRank(sev) {
  return SEVERITY_RANK[sev] ?? 0;
}


/**
 * Tag filter chips for the flat list: one entry per F-tag present in the feed,
 * with its count and worst severity (for chip emphasis). Ordered by worst
 * severity then count, so the most pressing tags lead.
 */
export function tagFilters(findings) {
  const map = new Map();
  for (const f of findings) {
    if (!map.has(f.ftag)) map.set(f.ftag, { tag: f.ftag, count: 0, worstSeverity: 'standard' });
    const t = map.get(f.ftag);
    t.count += 1;
    if (severityRank(f.severity) > severityRank(t.worstSeverity)) t.worstSeverity = f.severity;
  }
  return [...map.values()].sort((a, b) =>
    (severityRank(b.worstSeverity) - severityRank(a.worstSeverity)) || (b.count - a.count)
  );
}

/** "1 day ago", "about 16 hours ago", "3 days ago" — best-effort relative time. */
export function formatAgo(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `about ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `over ${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Bucket a finding's flagged date into a coarse, scannable group so the open
 * feed reads as a few dated sections instead of one long wall.
 * Returns { key, label, rank } — lower rank sorts first (most recent on top).
 */
export function dateBucket(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return { key: 'unknown', label: 'Undated', rank: 5 };

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const startOfYesterday = startOfToday.getTime() - dayMs;
  const startOfWeek = startOfToday.getTime() - 7 * dayMs;

  if (t >= startOfToday.getTime()) return { key: 'today', label: 'Today', rank: 0 };
  if (t >= startOfYesterday)        return { key: 'yesterday', label: 'Yesterday', rank: 1 };
  if (t >= startOfWeek)             return { key: 'week', label: 'Earlier this week', rank: 2 };
  return { key: 'older', label: 'Older', rank: 3 };
}

/** Short date label "May 6, 2026" for evidence windows / vitals dates. */
export function formatDate(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Flatten a finding's `evidence` blob into label/value pairs for generic
 * rendering, since its exact shape is unknown. Arrays of {label,value} and
 * plain objects are both handled; scalars become a single row.
 */
export function evidenceRows(evidence) {
  if (!evidence) return [];
  if (Array.isArray(evidence)) {
    return evidence.map((e, i) => {
      if (e && typeof e === 'object') {
        return { label: e.label ?? e.key ?? `#${i + 1}`, value: stringifyVal(e.value ?? e.val ?? e) };
      }
      return { label: `#${i + 1}`, value: stringifyVal(e) };
    });
  }
  if (typeof evidence === 'object') {
    return Object.entries(evidence).map(([k, v]) => ({ label: humanizeKey(k), value: stringifyVal(v) }));
  }
  return [{ label: 'Evidence', value: stringifyVal(evidence) }];
}

// Friendlier labels for cryptic feed keys (weight-loss windows, etc.). Anything
// not listed falls through to the generic camelCase/snake_case humanizer.
const KEY_LABELS = {
  w30date: '30-day weight', w180date: '180-day weight',
  w30: '30-day weight', w180: '180-day weight',
  latestdate: 'latest weight', latest: 'latest weight',
  weightlosspct: 'weight loss', windowdays: 'window',
  lastrefusal: 'last refusal', firstrefusal: 'first refusal',
};

function humanizeKey(k) {
  const mapped = KEY_LABELS[String(k).toLowerCase()];
  if (mapped) return mapped;
  return String(k)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function stringifyVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}
