/**
 * Pure view-model helpers for the PDPM drawer (the `drawer` block of
 * /api/extension/mds/pdpm-potential). No DOM, no fetch — tested in
 * __tests__/drawer-model.test.js.
 *
 * Payload shape (superapp core/types/pdpm-drawer.types.ts):
 *   pricing  { mode: medicare|texas|cmi|none, label, unit: usd|cmi|null, estimate, components, note }
 *   window   { kind: five_day|obra|single, dueDate, bestDate }
 *   current  DrawerScore — the MDS as coded today
 *   days[]   { date, dayNumber, isCurrentArd, supported: DrawerScore, withReview: DrawerScore }
 *   items[]  { key, mdsItem, mdsColumn, name, source, review, components[], ntaPoints,
 *              nursingCategory, slpGroup, capturedDates[], dismissed }
 *   ntaBands [{ label, minPoints }]
 */

export const NURSING_ORDER = ['ES', 'SCH', 'SCL', 'CC', 'BSCP', 'RPF'];

export const NURSING_LABELS = {
  ES: 'Extensive Services',
  SCH: 'Special Care High',
  SCL: 'Special Care Low',
  CC: 'Clinically Complex',
  BSCP: 'Behavioral & Cognitive',
  RPF: 'Reduced Physical Function',
};

export const TAB_ORDER = [
  { key: 'nursing', label: 'Nursing' },
  { key: 'nta', label: 'NTA' },
  { key: 'slp', label: 'SLP' },
];

export const DISMISS_REASONS = [
  { value: 'not_supported', label: 'Not supported' },
  { value: 'outside_lookback', label: 'Outside look-back' },
  { value: 'coded_elsewhere', label: 'Coded elsewhere' },
  { value: 'not_given', label: 'Not given' },
  { value: 'other', label: 'Other' },
];

export function reasonLabel(value) {
  return DISMISS_REASONS.find((r) => r.value === value)?.label || null;
}

/** "2026-10-04" → "10/4". Date-only strings, so no time zone is involved. */
export function shortDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  if (!m || !d) return '';
  return `${Number(m)}/${Number(d)}`;
}

/**
 * A pricing amount as text. Dollars: Medicare whole dollars; Texas to the cent
 * (its table is published to the cent). CMI: two decimals.
 *   compact → bar labels ("$642", "1.53")
 */
export function formatAmount(pricing, value, { compact = false } = {}) {
  if (value == null || !pricing || pricing.unit == null) return '';
  if (pricing.unit === 'cmi') return value.toFixed(2);
  if (pricing.mode === 'texas' && !compact) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** "+$70/day", "+0.14" — or '' when there is no difference. */
export function formatDelta(pricing, delta) {
  if (delta == null || !pricing || pricing.unit == null) return '';
  if (pricing.unit === 'cmi') {
    if (Math.abs(delta) < 0.005) return '';
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`;
  }
  const rounded = pricing.mode === 'texas' ? Math.round(delta * 100) / 100 : Math.round(delta);
  if (rounded === 0) return '';
  const abs = Math.abs(rounded);
  const body = pricing.mode === 'texas' ? abs.toFixed(2) : abs.toLocaleString('en-US');
  return `${rounded > 0 ? '+' : '−'}$${body}/day`;
}

/** The code the header shows: the payer's own group (Texas "C2X") or the HIPPS. */
export function displayCode(score) {
  return score?.rateGroup || score?.hipps || '';
}

/** The day the drawer opens on: the current ARD, else the best day, else the last. */
export function defaultDay(drawer) {
  const days = drawer?.days || [];
  return (days.find((d) => d.isCurrentArd) || days.find((d) => d.date === drawer?.window?.bestDate) || days[days.length - 1])?.date || null;
}

export function dayByDate(drawer, date) {
  const days = drawer?.days || [];
  return days.find((d) => d.date === date) || days[0] || null;
}

/** Is the item inside its look-back on `date`? */
export function capturedOn(item, date) {
  return !date || !Array.isArray(item.capturedDates) || item.capturedDates.includes(date);
}

/**
 * Items after local (optimistic) decisions are applied. `overrides` maps item
 * key → { reason, note } for a just-dismissed item, or null for a just-undone one.
 */
export function withOverrides(items, overrides) {
  if (!overrides) return items || [];
  return (items || []).map((it) => {
    if (!(it.key in overrides)) return it;
    const o = overrides[it.key];
    return { ...it, dismissed: o ? { reason: o.reason, note: o.note || null, decidedAt: o.decidedAt || null } : null };
  });
}

/** Tabs to show: paid components that have at least one item, with open counts. */
export function visibleTabs(drawer, items) {
  const comps = drawer?.pricing?.components || {};
  return TAB_ORDER.filter((t) => comps[t.key] !== false)
    .map((t) => {
      const inTab = items.filter((i) => i.components?.includes(t.key));
      return { ...t, total: inTab.length, open: inTab.filter((i) => !i.dismissed).length };
    })
    .filter((t) => t.total > 0);
}

/** Open (not dismissed) items — the Opportunities badge. */
export function openCount(items) {
  return items.filter((i) => !i.dismissed).length;
}

function byReviewThenName(a, b) {
  if (!!a.dismissed !== !!b.dismissed) return a.dismissed ? 1 : -1;
  if (a.review !== b.review) return a.review ? 1 : -1;
  return String(a.name).localeCompare(String(b.name));
}

/** NTA rows, biggest points first, dismissed last. */
export function ntaRows(items) {
  return items
    .filter((i) => i.components?.includes('nta'))
    .sort((a, b) => (!!a.dismissed !== !!b.dismissed ? (a.dismissed ? 1 : -1) : (b.ntaPoints || 0) - (a.ntaPoints || 0)));
}

/**
 * Nursing accordion groups, highest category first. The category the resident
 * lands in on the selected day (with everything found, review included) is the
 * one that opens by default.
 */
export function nursingGroups(items, day) {
  const landing = day?.withReview?.nursingCategory || null;
  const inTab = items.filter((i) => i.components?.includes('nursing') && i.nursingCategory);
  const cats = NURSING_ORDER.filter((cat) => inTab.some((i) => i.nursingCategory === cat));
  // Nothing lands on this day (every finding is outside its look-back): open the
  // highest category anyway, so the tab never reads as empty.
  const openCat = cats.includes(landing) ? landing : cats[0];
  return cats.map((cat) => {
    const groupItems = inTab.filter((i) => i.nursingCategory === cat).sort(byReviewThenName);
    return {
      key: cat,
      label: NURSING_LABELS[cat] || cat,
      items: groupItems,
      open: groupItems.filter((i) => !i.dismissed).length,
      isLanding: cat === landing,
      defaultOpen: cat === openCat,
    };
  });
}

const SLP_ORDER = ['Swallowing & diet', 'Comorbidities', 'Other SLP'];

export function slpGroups(items) {
  const inTab = items.filter((i) => i.components?.includes('slp'));
  const labels = [...new Set(inTab.map((i) => i.slpGroup || 'Other SLP'))].sort(
    (a, b) => SLP_ORDER.indexOf(a) - SLP_ORDER.indexOf(b)
  );
  return labels.map((label, idx) => {
    const groupItems = inTab.filter((i) => (i.slpGroup || 'Other SLP') === label).sort(byReviewThenName);
    return { key: label, label, items: groupItems, open: groupItems.filter((i) => !i.dismissed).length, isLanding: false, defaultOpen: idx === 0 };
  });
}

/**
 * The NTA meter for a day: coded points, what supported items add, what review
 * items add on top. Scale runs a little past the top band so the last tick fits.
 */
export function ntaMeter(drawer, day) {
  const bands = drawer?.ntaBands || [];
  const coded = drawer?.current?.ntaPoints ?? 0;
  const supported = day?.supported?.ntaPoints ?? coded;
  const withReview = day?.withReview?.ntaPoints ?? supported;
  const top = bands.length ? bands[bands.length - 1].minPoints : 12;
  const max = Math.max(top + 2, withReview + 1);
  return {
    coded,
    supported,
    withReview,
    max,
    fromBand: drawer?.current?.ntaBand || '',
    toBand: day?.withReview?.ntaBand || '',
    bands,
  };
}

/**
 * Bar geometry for the ARD card. Bars only differ by the items that move between
 * days, so drawing them from zero makes every bar look the same height. Instead
 * the lowest supported amount sits at 45% and the highest total at 100% — the
 * amounts are printed above each bar, so nothing is hidden by the offset.
 */
export function ardBars(drawer) {
  const days = drawer?.days || [];
  const sup = days.map((d) => d.supported.amount ?? 0);
  const tot = days.map((d) => d.withReview.amount ?? d.supported.amount ?? 0);
  const lo = Math.min(...sup);
  const hi = Math.max(...tot);
  const span = hi - lo;
  const pct = (v) => (span <= 0 ? 70 : 45 + ((v - lo) / span) * 55);
  return days.map((d, i) => {
    const supPct = pct(sup[i]);
    const totPct = pct(tot[i]);
    return {
      date: d.date,
      dayNumber: d.dayNumber,
      isCurrentArd: d.isCurrentArd,
      isBest: d.date === drawer?.window?.bestDate,
      supported: d.supported.amount,
      total: d.withReview.amount,
      supportedPct: supPct,
      reviewPct: Math.max(0, totPct - supPct),
    };
  });
}

/** "10/1 pays +$43/day over the current ARD" — only when the best day beats it. */
export function ardHint(drawer) {
  const days = drawer?.days || [];
  const best = days.find((d) => d.date === drawer?.window?.bestDate);
  const cur = days.find((d) => d.isCurrentArd);
  if (!best || !cur || best.date === cur.date) return null;
  const gain = (best.supported.amount ?? 0) - (cur.supported.amount ?? 0);
  const text = formatDelta(drawer.pricing, gain);
  if (!text || gain <= 0) return null;
  return { date: best.date, delta: text.replace('/day', '') };
}

/** Section letter → whether the drawer can show a "Go to MDS" for it. */
export function sectionOf(item) {
  return String(item?.mdsItem || '').charAt(0).toUpperCase();
}
