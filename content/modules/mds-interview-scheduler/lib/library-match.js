/**
 * Keyword-match a facility's UDA library (std_assessment <option> list) to the
 * four MDS interview types. Names vary wildly per facility, so this is a scored
 * best-guess — the modal always lets the nurse override the pick from the full
 * library. Returns null for a type with no plausible match.
 *
 * Tuned against three real facility libraries (see library-match.test.js). Key
 * lessons baked in:
 *   - "Staff Assessment" variants are the *fallback* when a resident can't be
 *     interviewed — penalize them so the resident interview wins.
 *   - "Interview" / "3.0" signal the real MDS resident interview vs a clinical
 *     evaluation (e.g. "Pain Interview (MDS 3.0)" beats "Pain Evaluation").
 *   - Section GG has per-assessment-type variants (Admission / Discharge /
 *     OBRA-IPA functional forms); use the A0310 context to prefer the right one.
 *   - Short tokens ("gg") must be word-boundary matched, never bare substring.
 */

// [regex, weight] — highest matching weight per type is the base score.
const TYPE_RULES = {
  bims: [
    [/brief interview for mental status/, 10],
    [/\bbims\b/, 10],
  ],
  phq: [
    [/\bphq[-\s]?9\b/, 10],
    [/\bphq9\b/, 9],
    [/\bphq\b/, 9],
    [/\bmood\b/, 3],
  ],
  gg: [
    [/section\s*gg/, 10],
    [/\bgg\b/, 10],
    [/usual performance/, 6],
    [/functional abilit/, 5],
    [/\bfunctional\b/, 3],
  ],
  pain: [
    [/\bpain\b/, 10],
    [/section\s*j\b/, 6],
  ],
};

function _baseScore(label, rules) {
  let best = 0;
  for (const [re, w] of rules) {
    if (re.test(label)) best = Math.max(best, w);
  }
  return best;
}

/**
 * For GG, which functional variant does this assessment want?
 * Admission (A0310A=01) → "admission"; any discharge (A0310F 10/11/12) →
 * "discharge"; everything else (quarterly / annual / PPS / IPA) → OBRA/IPA/interim.
 */
function _ggPreferenceRegex({ a0310a, a0310f } = {}) {
  if (a0310a === '01') return /admission/;
  if (['10', '11', '12'].includes(a0310f)) return /discharge/;
  return /obra|ipa|interim/;
}

function _scoreFor(type, label, context) {
  let score = _baseScore(label, TYPE_RULES[type]);
  if (score <= 0) return 0;                       // modifiers only apply to real hits

  if (/staff assessment/.test(label)) score -= 8; // resident interview wins over staff fallback
  if (/\binterview\b/.test(label)) score += 3;    // the actual resident interview
  if (/3\.0/.test(label)) score += 2;             // MDS 3.0 form signal

  if (type === 'gg' && context) {
    // A type-matched "Functional Abilities … {Admission|Discharge|Interim/OBRA/IPA}"
    // form (the real CMS GG data-collection form for THIS ARD type) should beat a
    // generic "Section GG" form (base 10) — facilities actually chart on the
    // variant. +6 puts a variant-matched functional form (5) at 11 > 10.
    if (_ggPreferenceRegex(context).test(label)) score += 6;
  }
  return score;
}

/**
 * @param options [{ id, label }]
 * @param context optional { a0310a, a0310f } — nudges the GG variant pick
 * @returns { bims, phq, gg, pain } each { id, label } | null
 */
export function matchLibraryToInterviews(options, context) {
  const out = { bims: null, phq: null, gg: null, pain: null };
  for (const type of Object.keys(TYPE_RULES)) {
    let bestOpt = null;
    let bestScore = 0;
    for (const opt of options || []) {
      const s = _scoreFor(type, (opt.label || '').toLowerCase(), context);
      if (s > bestScore) { bestScore = s; bestOpt = opt; }
    }
    out[type] = bestOpt;
  }
  return out;
}
