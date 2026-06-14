/**
 * Keyword-match a facility's UDA library (std_assessment <option> list) to the
 * four MDS interview types. Names vary per facility, so we score by keyword and
 * pick the highest-scoring option per type. Best-effort: returns null for a type
 * with no plausible match (caller surfaces "schedule manually").
 *
 * Keyword weights are ordered: a more specific term outranks a generic one
 * (e.g. an explicit "gg" beats a generic "functional").
 */
const KEYWORDS = {
  bims: [['brief interview for mental status', 3], ['bims', 3]],
  phq: [['phq-9', 3], ['phq', 3], ['phq-2 to 9', 3], ['mood', 1]],
  gg: [['section gg', 3], ['gg', 3], ['functional', 1]],
  pain: [['pain', 3], ['section j', 2]],
};

function _score(label, kws) {
  const l = label.toLowerCase();
  let best = 0;
  for (const [term, weight] of kws) {
    if (l.includes(term)) best = Math.max(best, weight);
  }
  return best;
}

export function matchLibraryToInterviews(options) {
  const out = { bims: null, phq: null, gg: null, pain: null };
  for (const type of Object.keys(KEYWORDS)) {
    let bestOpt = null;
    let bestScore = 0;
    for (const opt of options || []) {
      const s = _score(opt.label || '', KEYWORDS[type]);
      if (s > bestScore) { bestScore = s; bestOpt = opt; }
    }
    out[type] = bestOpt;
  }
  return out;
}
