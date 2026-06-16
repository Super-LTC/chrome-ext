/**
 * Drill-in evidence translation for the GG comparison measures (ADL Decline,
 * Walk-Indep). The evaluators emit raw paired evidence — a target row
 * (`GG0170B1 = 01`, note "Target 1 vs prior 4 (decline of 3)") AND a prior row
 * (`GG0170B3 = 04`, note "Prior value for comparison") for EACH declining item.
 * Rendered raw that's an 8-row dump of cryptic keys where `88` reads like a
 * high/good number (it actually means "not attempted" = dependent-equivalent).
 *
 * `ggComparisonLines` pairs target+prior by base GG key, translates keys→item
 * names and codes→performance labels, and computes the point drop, so the
 * drill-in can show one clear before→after line per declining item.
 *
 * Ported from web/components/quality-measures/qm-evidence-view.ts. Pure (no
 * Preact, no imports) so it's unit-tested via scripts/test-qm-evidence-view.mjs.
 * TS types stripped for the JS bundle.
 */

/** GG self-care / mobility item base keys → friendly names (the 5 tracked items). */
const GG_NAME = {
  GG0130A: 'Eating',
  GG0170B: 'Sit to Lying',
  GG0170D: 'Sit to Stand',
  GG0170F: 'Toilet Transfer',
  GG0170I: 'Walk 10 Feet',
};

/** GG performance codes → labels. Higher code = more independent. */
const GG_LABEL = {
  '01': 'Dependent',
  '02': 'Maximal',
  '03': 'Moderate',
  '04': 'Supervision',
  '05': 'Setup',
  '06': 'Independent',
  '07': 'Refused',
  '09': 'N/A',
  '10': 'Not attempted',
  '88': 'Not attempted',
};

/** key like `GG0170B1` → { base: 'GG0170B', col: '1' }; null if not a GG column key. */
function parseGgKey(mdsItem) {
  const m = /^(GG\d{4}[A-Z])([135])$/.exec(mdsItem);
  return m ? { base: m[1], col: m[2] } : null;
}

function pad2(value) {
  const v = value.trim();
  return v.length === 1 ? `0${v}` : v;
}

/** CMS recode: not-attempted / refused / N/A codes are dependent-equivalent (1). */
function recode(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return NaN;
  if (n === 7 || n === 9 || n === 10 || n === 88) return 1;
  return n;
}

function ggLabel(code) {
  return GG_LABEL[pad2(code)] ?? code;
}

/**
 * Translate the paired GG evidence into one before→after line per declining
 * item. Non-GG evidence (e.g. B&B H0300/H0400) is ignored — those measures keep
 * the generic evidence rows since their notes are already human-readable.
 *
 * Returns { lines: GgComparisonLine[], targetType, targetArd, priorArd }, where
 * each line = { name, baseKey, priorCode, priorLabel, nowCode, nowLabel, drop }.
 */
export function ggComparisonLines(evidence) {
  const byBase = new Map();
  for (const e of evidence) {
    const parsed = parseGgKey(e.mdsItem);
    if (!parsed) continue;
    const slot = byBase.get(parsed.base) ?? {};
    const isPrior = (e.note ?? '').toLowerCase().startsWith('prior');
    if (isPrior) slot.prior = e;
    else slot.target = e;
    byBase.set(parsed.base, slot);
  }

  const lines = [];
  let targetType = null;
  let targetArd = null;
  let priorArd = null;

  for (const [base, { target, prior }] of byBase) {
    if (!target || !prior) continue;
    const drop = recode(prior.value) - recode(target.value);
    lines.push({
      name: GG_NAME[base] ?? base,
      baseKey: base,
      priorCode: pad2(prior.value),
      priorLabel: ggLabel(prior.value),
      nowCode: pad2(target.value),
      nowLabel: ggLabel(target.value),
      drop,
    });
    targetType = targetType ?? target.assessmentType ?? null;
    targetArd = targetArd ?? target.assessmentArdDate ?? null;
    priorArd = priorArd ?? prior.assessmentArdDate ?? null;
  }

  lines.sort((a, b) => b.drop - a.drop || a.name.localeCompare(b.name));
  return { lines, targetType, targetArd, priorArd };
}

/** True for the measures whose drill-in should use the translated GG lines. */
export function isGgComparisonMeasure(id) {
  return id === 'adl_decline' || id === 'walk_indep_worsened';
}
