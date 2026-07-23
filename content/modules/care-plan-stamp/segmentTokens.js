// content/modules/care-plan-stamp/segmentTokens.js
//
// Token-key uniqueness for care-plan `descriptionSegments`.
//
// The stamp modal keys all token values by `s.tokenKey` in ONE shared
// `tokenValues` map per focus. That is fine for the focus statement (its token
// keys are unique + meaningful to the backend, e.g. `discharge_destination`),
// but library goals/interventions routinely carry MULTIPLE tokens with the same
// `tokenKey` — e.g. the Bathing intervention "Provide [select] assistance of
// [select] person(s)" ships two `inline` tokens. Keyed by `tokenKey` alone they
// collide (picking one fills both) and clash across interventions.
//
// `withStableTokenKeys` stamps a stable, position-derived `_ukey` onto every
// token inside GOALS and INTERVENTIONS (focus-level tokens are left untouched so
// the backend `tokenValues` contract is preserved). `tokenKeyOf` is the single
// accessor every consumer (render / compose / unfilled-count) uses so they all
// agree on the key.

/** The value-map key for a token segment: its unique `_ukey` if present, else the raw tokenKey. */
export function tokenKeyOf(segment) {
  if (!segment) return undefined;
  return segment._ukey || segment.tokenKey;
}

/**
 * Sentinel tokenValue meaning "nurse deselected this menu item — omit it from
 * the composed text". Used by multiselect tokens (PCC "check the statements
 * that apply" evidence-menu bullets).
 */
export const TOKEN_OMIT = '__omit__';

/**
 * Is an evidence-menu bullet checked (composes into the text)?
 *
 * Default is evidence-driven, mirroring every other slot: the backend marks a
 * bullet the chart already answers (e.g. the clause IS a positively-answered
 * PHQ-9 question) `needsFilling:false` + receipt → checked; anything else is
 * the NURSE's assertion → unchecked. An explicit nurse action (a stored value
 * or TOKEN_OMIT) always wins over the default.
 */
export function isMenuChecked(segment, tokenValues) {
  const v = (tokenValues || {})[tokenKeyOf(segment)];
  if (v === TOKEN_OMIT) return false;
  if (v != null && String(v).trim()) return true;
  return segment?.needsFilling === false;
}

/**
 * Group consecutive multiselect tokens (separated only by whitespace text)
 * into single render units, so "AEB" + 5 bullets shows as ONE "check what
 * applies" control instead of 5 inline boxes. Returns a render plan:
 *   [{kind:'seg', seg, idx} | {kind:'msgroup', tokens:[{seg, idx}]}]
 * `idx` is the segment's index in the ORIGINAL array (factor-removal and
 * compose logic key off original indices).
 */
export function groupEvidenceMenus(segments) {
  const arr = segments || [];
  const plan = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (!(s && s.kind === 'token' && s.tokenKey === 'multiselect')) {
      plan.push({ kind: 'seg', seg: s, idx: i });
      continue;
    }
    const tokens = [{ seg: s, idx: i }];
    let j = i + 1;
    while (j < arr.length) {
      const n = arr[j];
      if (n && n.kind === 'text' && /^\s*$/.test(n.value || '')) { j++; continue; }
      if (n && n.kind === 'token' && n.tokenKey === 'multiselect') {
        tokens.push({ seg: n, idx: j });
        j++;
        continue;
      }
      break;
    }
    plan.push({ kind: 'msgroup', tokens });
    i = j - 1;
  }
  return plan;
}

/**
 * Strip a dangling evidence connector ("…social isolation AEB") left at the
 * END of a composed description when the nurse checked none of the menu
 * bullets. A connector followed by real content is untouched.
 */
export function trimComposedConnector(text) {
  return String(text || '').replace(
    /\s*\b(?:AEB|as evidenced by|r\/t|related to|due to|secondary to)\s*[:,-]?\s*$/i,
    '',
  );
}

/**
 * Unique tokenKeys still needing a nurse value across a focus's statement +
 * goals + interventions. This is the single source of truth for the wizard's
 * "Needs input" gate.
 *
 * Pass the EFFECTIVE goals/interventions — the nurse's edited lists with
 * deletions applied (`state.goals`/`state.interventions` when set) — NOT the
 * raw backend arrays. A goal/intervention the nurse removed because it wasn't
 * applicable must drop its unfilled-token requirement; scanning the raw arrays
 * (the previous behavior) left "Needs input" stuck on and blocked the add.
 *
 * Keys come from `tokenKeyOf` (each token's stamped `_ukey`, else raw
 * tokenKey). Callers MUST pass segments that already carry their stable `_ukey`
 * (i.e. post-`withStableTokenKeys` for the raw fallback, or the edit-state
 * arrays which retain the `_ukey` stamped at first compose) so the keys line up
 * with how `tokenValues` was filled. This function deliberately NEVER re-stamps:
 * re-deriving `_ukey` on a deletion-shortened array would shift surviving items'
 * index-derived keys off their stored values, making filled slots read empty.
 *
 * Multiselect evidence bullets are skipped — they carry a sensible default
 * (evidence-backed clauses pre-checked, the rest omitted, connector trimmed),
 * so they never block or count as a required input.
 */
export function unfilledTokenKeys(descriptionSegments, goals, interventions, tokenValues) {
  const tv = tokenValues || {};
  const keys = new Set();
  const walk = (segs) => {
    for (const s of segs || []) {
      if (s && s.kind === 'token' && s.needsFilling) {
        if (s.tokenKey === 'multiselect') continue;
        const key = tokenKeyOf(s);
        const v = tv[key];
        if (!v || !String(v).trim()) keys.add(key);
      }
    }
  };
  walk(descriptionSegments);
  (goals || []).forEach((g) => walk(g && g.descriptionSegments));
  (interventions || []).forEach((iv) => walk(iv && iv.descriptionSegments));
  return [...keys];
}

function _tagArray(arr, prefix) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((item, ii) => {
    if (!item || !Array.isArray(item.descriptionSegments)) return item;
    let changed = false;
    const segs = item.descriptionSegments.map((s, si) => {
      if (s && s.kind === 'token') {
        changed = true;
        return { ...s, _ukey: `${prefix}${ii}_${si}` };
      }
      return s;
    });
    return changed ? { ...item, descriptionSegments: segs } : item;
  });
}

/**
 * Return a focus whose token segments each carry a stable, globally-unique
 * `_ukey` — goals ("g…"), interventions ("iv…"), AND the focus statement
 * itself ("f_…"). Focus statements from facility libraries routinely carry
 * multiple tokens with the same type-derived tokenKey ("…AEB [select] [select]"
 * ships two `inline` tokens; three menu bullets share `multiselect`) — keyed by
 * tokenKey alone, picking one filled ALL of them. Nothing reads focus-level
 * tokenValues by literal key (code_status etc. flow through tokenKeyOf too),
 * so unique keys are safe. No-op passthrough when there are no segments.
 */
export function withStableTokenKeys(focus) {
  if (!focus || typeof focus !== 'object') return focus;
  const hasGoals = Array.isArray(focus.goals);
  const hasInterventions = Array.isArray(focus.interventions);
  const hasFocusTokens =
    Array.isArray(focus.descriptionSegments) &&
    focus.descriptionSegments.some((s) => s && s.kind === 'token');
  if (!hasGoals && !hasInterventions && !hasFocusTokens) return focus;
  return {
    ...focus,
    ...(hasFocusTokens
      ? {
          descriptionSegments: focus.descriptionSegments.map((s, si) =>
            s && s.kind === 'token' ? { ...s, _ukey: `f_${si}` } : s,
          ),
        }
      : {}),
    ...(hasGoals ? { goals: _tagArray(focus.goals, 'g') } : {}),
    ...(hasInterventions ? { interventions: _tagArray(focus.interventions, 'iv') } : {}),
  };
}
