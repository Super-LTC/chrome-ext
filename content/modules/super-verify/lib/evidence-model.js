/**
 * Shaping for the QM evidence a Verify card shows.
 *
 * The backend has always sent enough to answer "what changed, versus what?" —
 * every evidence row carries assessmentId / assessmentType / assessmentArdDate,
 * and the decline evaluators emit the PRIOR assessment's value alongside the
 * target's. The panel just rendered a flat list of `code=value` chips and hid
 * `note` in a title tooltip, so the one thing a nurse needed was the one thing
 * not on screen: TSI says "eating 6→5 vs the April 30 assessment", we said
 * "GG0130A13=5".
 *
 * Everything here is derived from fields the payload already states. Nothing
 * parses a code's column suffix or a note's prose to infer meaning.
 */

/**
 * Rows whose `mdsItem` is a computed SUMMARY rather than an MDS item —
 * `DFS-summary` today, carrying observed/expected/delta in `note`. They must
 * not reach the item list or the "View <item>" deep link: PCC has no such
 * field, so the link would open nothing.
 */
export function isSummaryKey(code) {
  return typeof code === 'string' && code.endsWith('-summary');
}

/**
 * GG item names, so a decline reads "Eating" instead of "GG0130A13".
 * Mirrors core/services/qm-planner/dfs/gg-item-labels.ts — the extension can't
 * import from core, and these are fixed by the RAI manual, so this copy can't
 * drift the way most copies do.
 */
export const GG_LABELS = {
  GG0130A: 'Eating',
  GG0130B: 'Oral hygiene',
  GG0130C: 'Toileting hygiene',
  GG0170A: 'Roll left and right',
  GG0170C: 'Lying to sitting on side of bed',
  GG0170D: 'Sit to stand',
  GG0170E: 'Chair/bed-to-chair transfer',
  GG0170F: 'Toilet transfer',
  GG0170I: 'Walk 10 feet',
  GG0170J: 'Walk 50 feet with two turns',
  GG0170R: 'Wheel 50 feet with two turns',
};

/**
 * The item identity, independent of which column it was read from.
 *
 * The evaluator writes `${item}${column}` — the target as GG0130A3 and the
 * prior as GG0130A1 — so the raw codes never match even though it's the same
 * item. Resolving through the label map (a lookup against a known set, not a
 * regex on the code's shape) recovers the base code so the two can be paired.
 * Non-GG items fall back to the code itself, which pairs only on an exact
 * match — safe: an unpaired row just renders on its own.
 */
export function baseItemKey(code) {
  if (!code) return '';
  return Object.keys(GG_LABELS).find((k) => code.startsWith(k)) || code;
}

/** Evidence codes carry a column suffix (GG0130A1 / GG0130A3), hence prefix match. */
export function itemLabel(code) {
  const base = baseItemKey(code);
  return GG_LABELS[base] || base || '';
}

/**
 * GG values are stored zero-padded ('05'), but clinicians say "a 5" and TSI
 * writes "6→5". Number() only for genuinely numeric values, so '88' (not
 * attempted) and any non-numeric code pass through untouched.
 */
export function displayValue(v) {
  const s = String(v ?? '');
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "OBRA Quarterly · Apr 30, 2026".
 *
 * Split on the string rather than `new Date(iso)`: a bare ISO date parses as
 * UTC, so west of Greenwich it renders as the previous day — and an ARD off by
 * one is exactly the kind of wrong that looks right.
 */
export function assessmentLabel(e) {
  const [y, m, d] = String((e && e.assessmentArdDate) || '').split('-');
  const mi = Number(m) - 1;
  const when = y && m && d && MONTHS[mi] ? `${MONTHS[mi]} ${Number(d)}, ${y}` : null;
  return [e && e.assessmentType, when].filter(Boolean).join(' · ');
}

/**
 * Split evidence into computed summaries and per-assessment groups.
 *
 * Grouped on `assessmentId` — the payload already states which MDS each value
 * came from, so there is nothing to infer. `targetId` (the assessment under
 * review) sorts first; the rest are what it's being judged against.
 */
export function groupEvidence(evidence, targetId) {
  const rows = evidence || [];
  const summaries = rows.filter((e) => isSummaryKey(e.mdsItem));
  const groups = [];
  for (const e of rows) {
    if (isSummaryKey(e.mdsItem)) continue;
    let g = groups.find((x) => x.id === e.assessmentId);
    if (!g) {
      g = {
        id: e.assessmentId,
        label: assessmentLabel(e),
        isTarget: e.assessmentId === targetId,
        rows: [],
      };
      groups.push(g);
    }
    g.rows.push(e);
  }
  groups.sort((a, b) => Number(b.isTarget) - Number(a.isTarget));
  return { summaries, groups };
}

/**
 * The shape SUP-253 is actually after: one row per item, "6 → 5", with the
 * baseline named ONCE.
 *
 * Grouping by assessment (above) answers "compared against what?" but still
 * leaves the nurse pairing "Eating 05" in one list with "Eating 06" in another
 * — which is the manual diffing this was supposed to remove. TSI states it as a
 * single fact per item; so does this.
 *
 * Only attempted when there is exactly ONE prior assessment: with two or more,
 * "from" is ambiguous and a made-up arrow would be worse than two honest lists.
 * Falls back to `groups` in that case, and whenever nothing pairs.
 */
export function pairEvidence(evidence, targetId) {
  const rows = evidence || [];
  const summaries = rows.filter((e) => isSummaryKey(e.mdsItem));
  const items = rows.filter((e) => !isSummaryKey(e.mdsItem));
  const target = items.filter((e) => e.assessmentId === targetId);
  const prior = items.filter((e) => e.assessmentId !== targetId);
  const priorIds = [...new Set(prior.map((e) => e.assessmentId))];

  if (prior.length && priorIds.length === 1) {
    const byKey = new Map();
    for (const e of target) {
      byKey.set(baseItemKey(e.mdsItem), {
        key: baseItemKey(e.mdsItem),
        label: itemLabel(e.mdsItem),
        code: e.mdsItem,
        to: displayValue(e.value),
        from: null,
      });
    }
    let paired = 0;
    for (const e of prior) {
      const k = baseItemKey(e.mdsItem);
      const row = byKey.get(k);
      if (row) {
        row.from = displayValue(e.value);
        paired += 1;
      } else {
        byKey.set(k, { key: k, label: itemLabel(e.mdsItem), code: e.mdsItem, to: null, from: displayValue(e.value) });
      }
    }
    if (paired > 0) {
      return {
        summaries,
        comparison: { baselineLabel: assessmentLabel(prior[0]), rows: [...byKey.values()] },
        groups: [],
      };
    }
  }
  return { summaries, comparison: null, groups: groupEvidence(items, targetId).groups };
}

/** Unique real MDS item codes — drives the header line and the View button. */
export function evidenceItemCodes(measure) {
  return [
    ...new Set(
      ((measure && measure.evidence) || [])
        .map((e) => e.mdsItem)
        .filter((c) => c && !isSummaryKey(c)),
    ),
  ];
}
