import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Combobox } from '../CarePlanStampModal.jsx';
import { tokenKeyOf, withStableTokenKeys, TOKEN_OMIT, groupEvidenceMenus, isMenuChecked } from '../segmentTokens.js';

/**
 * FocusCard — right-pane detail view of a single proposed/composed focus.
 *
 * Extracted verbatim from the body of CarePlanStampModal.jsx (was `FocusDetail`)
 * so it can be reused by the Comprehensive-Review mode (Task 6+) panes
 * (AddBucketPane, VerifyBucketPane). Behavior is identical to the previous
 * inline component — only the location and name changed.
 *
 * Props:
 *   - composed: the composed (post-substitution) focus { description, goals, interventions, … }
 *   - state: local edit state { skipped, tokenValues, removedFactors, focusText, … }
 *   - rawFocus: the original raw focus (with ruleId, descriptionSegments, _isLibrary, _meta, alreadyOnPlan, …)
 *   - onUpdate(patch): patch the edit state
 *   - onToggleSkip(): optional — toggle skipped (omitted in audit panes which manage skip externally)
 *   - readOnly: disable all editors (during stamping/done)
 *   - dropdowns: org dropdowns { kardexLabels, kardexOptions, positionLabels, positionOptions }
 */
export const FocusCard = ({ composed, state, rawFocus, onUpdate, onToggleSkip, readOnly, dropdowns, isStamped, stampOneDisabled, onStampOne, variant = 'v1', areaBadge, positionLabel }) => {
  const isV2 = variant === 'v2';
  const sectionRef = useRef(null);
  // Snap back to top whenever the active focus changes — otherwise scroll
  // position from the previous focus leaks over and looks broken.
  const focusKey = rawFocus?.ruleId || rawFocus?.stdNeedId || composed?.description;
  useEffect(() => {
    if (sectionRef.current) sectionRef.current.scrollTop = 0;
  }, [focusKey]);
  if (!composed) return null;
  const hasUnsubstituted = composed.description.includes('___');
  const hasSegments = _hasSegments(rawFocus?.descriptionSegments);
  const onTokenCommit = (key, value) => onUpdate({
    tokenValues: { ...(state.tokenValues || {}), [key]: value },
    // Clear any manual free-text edit so segment substitution is canonical.
    focusText: null,
  });
  const onToggleFactor = (idx, remove) => {
    const next = new Set(state.removedFactors || []);
    if (remove) next.add(idx); else next.delete(idx);
    onUpdate({ removedFactors: next, focusText: null });
  };
  const kardexLabels = dropdowns?.kardexLabels || {};
  const positionLabels = dropdowns?.positionLabels || {};
  const kardexOptions = dropdowns?.kardexOptions || [];
  const positionOptions = dropdowns?.positionOptions || [];

  // Helpers for goal/intervention list edits
  const goals = composed.goals || [];
  const interventions = composed.interventions || [];

  const editGoal = (i, description) => {
    const next = goals.map((g, j) => (j === i ? { ...g, description } : g));
    onUpdate({ goals: next });
  };
  const deleteGoal = (i) => {
    const next = goals.filter((_, j) => j !== i);
    onUpdate({ goals: next });
  };
  const addGoal = () => {
    onUpdate({ goals: [...goals, { description: '' }] });
  };

  const editIntervention = (i, patch) => {
    const next = interventions.map((iv, j) => (j === i ? { ...iv, ...patch } : iv));
    onUpdate({ interventions: next });
  };
  const deleteIntervention = (i) => {
    const next = interventions.filter((_, j) => j !== i);
    onUpdate({ interventions: next });
  };
  const addIntervention = () => {
    // Inherit positions from the first existing intervention if any (default
    // to RN). Kardex is left unset — nurses opt in deliberately rather than
    // having "Safety" stamped on every Kardex item.
    const seed = interventions[0] || (rawFocus.interventions || [])[0];
    const seedPositions = _normalizePositions(seed || {});
    onUpdate({
      interventions: [
        ...interventions,
        {
          description: '',
          instruction: '',
          kardexCategory: null,
          _recKardex: null,
          positions: seedPositions.length > 0 ? seedPositions : [9897],
        },
      ],
    });
  };

  return (
    <section className="cpas-detail" ref={sectionRef}>
      {isV2 ? (
        <header className="cpas-detail__header cpas-detail__header--v2">
          <span className="cpas-detail__badge-sec">{areaBadge}</span>
          {positionLabel && <span className="cpas-detail__pos">{positionLabel}</span>}
          {isStamped && (
            <div className="cpas-detail__actions">
              <span className="cpas-state-chip is-added" title="Already added to the care plan">
                <span className="cpas-state-chip__state">
                  <span className="cpas-state-chip__icon">✓</span> Added to care plan
                </span>
              </span>
            </div>
          )}
        </header>
      ) : (
      <header className="cpas-detail__header">
        <div>
          <span className={`cpas-detail__rule ${rawFocus._isLibrary ? 'is-library' : ''}`}>
            {rawFocus._isLibrary ? 'PCC Library' : _ruleIdToLabel(rawFocus.ruleId)}
          </span>
        </div>
        <div className="cpas-detail__actions">
          {/* Once single-added via "Add this one", the focus is locked: show a
              static "Added" pill instead of the skip chip + add button. */}
          {isStamped ? (
            <span className="cpas-state-chip is-added" title="Already added to the care plan">
              <span className="cpas-state-chip__state">
                <span className="cpas-state-chip__icon">✓</span> Added to care plan
              </span>
            </span>
          ) : (
            <>
              {!readOnly && onToggleSkip && (
                // Outlined toggle chip. Shows the current state clearly + the
                // action verb. Outlined (not filled) so it reads as secondary
                // to the primary "Add all" CTA in the sidebar.
                <button
                  className={`cpas-state-chip ${state.skipped ? 'is-skipped' : 'is-included'}`}
                  onClick={() => onToggleSkip()}
                  title={state.skipped ? 'Click to include this focus' : 'Click to skip this focus'}
                >
                  {state.skipped ? (
                    <>
                      <span className="cpas-state-chip__state">
                        <span className="cpas-state-chip__icon">−</span> Skipped
                      </span>
                      <span className="cpas-state-chip__sep">·</span>
                      <span className="cpas-state-chip__action">Include</span>
                    </>
                  ) : (
                    <>
                      <span className="cpas-state-chip__state">
                        <span className="cpas-state-chip__icon">✓</span> Will be added
                      </span>
                      <span className="cpas-state-chip__sep">·</span>
                      <span className="cpas-state-chip__action">Skip</span>
                    </>
                  )}
                </button>
              )}
              {/* Add just this one focus — sits next to "Add all" in the
                  sidebar but lets the nurse commit only the focus they're
                  looking at (e.g. the one relevant to the PCC page they're on).
                  Hidden when the focus is skipped; disabled while it still
                  needs nurse input. */}
              {!readOnly && onStampOne && !state.skipped && (
                <button
                  className="cpas-btn cpas-btn--primary cpas-detail__add-one"
                  onClick={onStampOne}
                  disabled={stampOneDisabled}
                  title={stampOneDisabled
                    ? 'Fill in the required input before adding'
                    : 'Add only this focus to the care plan'}
                >
                  ✓ Add to Careplan
                </button>
              )}
            </>
          )}
        </div>
      </header>
      )}

      {/* Library trim callout — explains we imported a subset of PCC's full library */}
      {rawFocus._isLibrary && rawFocus._meta && (
        (rawFocus._meta.goalsAvailable > rawFocus._meta.goalsIncluded ||
         rawFocus._meta.interventionsAvailable > rawFocus._meta.interventionsIncluded) && (
          <div className="cpas-detail__libtrim-banner">
            <span className="cpas-detail__libtrim-text">
              From <b>{rawFocus._meta.library}</b> — {rawFocus._meta.category}.
              Imported {rawFocus._meta.goalsIncluded} of {rawFocus._meta.goalsAvailable} std goals
              and {rawFocus._meta.interventionsIncluded} of {rawFocus._meta.interventionsAvailable} std interventions.
            </span>
            <span className="cpas-detail__libtrim-hint">Edit below to remove or add more.</span>
          </div>
        )
      )}

      {/* Already-on-plan banner — transparent about WHY this focus is pre-skipped */}
      {rawFocus.alreadyOnPlan && (
        <div className="cpas-detail__on-plan-banner">
          <div className="cpas-detail__on-plan-title">Already on this resident's care plan</div>
          <div className="cpas-detail__on-plan-body">
            We detected an existing focus that overlaps:
            <blockquote className="cpas-detail__on-plan-match">
              "{_decodeHtmlText(rawFocus.matchedExistingText) || '(no text returned)'}"
            </blockquote>
            Matched via keyword check on this rule. Pre-skipped to avoid duplicates — click <b>+ Include</b> above to add anyway.
          </div>
        </div>
      )}

      {/* Focus statement.
          Default mode: segment renderer (sparkles, picker chips, free-text
          inputs) — pulled from descriptionSegments.
          Manual mode: plain textarea — used when the nurse wants to edit the
          static preamble or add wording the segments can't express. Entered
          by clicking the ✎ button; left by clicking "Use suggested wording".
          Auto-enters manual mode when there are no segments at all (library
          picks / older proposals). */}
      {(() => {
        const manualMode = state.focusText != null || !hasSegments;
        if (!manualMode) {
          return (
            <div
              key={focusKey}
              className={`cpas-detail__statement ${hasUnsubstituted ? 'has-blank' : ''}`}
            >
              <DescriptionSegments
                // Stamped (_ukey'd) segments so same-tokenKey slots don't
                // collide — MUST match _composeFocus, which stamps the same way.
                segments={withStableTokenKeys(rawFocus).descriptionSegments}
                tokenValues={state.tokenValues}
                removedFactors={state.removedFactors}
                onTokenCommit={onTokenCommit}
                onToggleFactor={onToggleFactor}
                readOnly={readOnly}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="cpas-detail__edit-toggle"
                  onClick={() => onUpdate({ focusText: composed.description })}
                  title="Edit the full focus statement as text"
                >
                  <IconPencil /> Edit text
                </button>
              )}
            </div>
          );
        }
        return (
          <div className="cpas-detail__statement-manual">
            <textarea
              className={`cpas-iv-row__text cpas-iv-row__text--focus ${hasUnsubstituted ? 'has-blank' : ''}`}
              value={composed.description}
              onInput={(e) => onUpdate({ focusText: e.target.value })}
              rows={1}
              disabled={readOnly}
              placeholder="Focus statement…"
            />
            {!readOnly && hasSegments && (
              <button
                type="button"
                className="cpas-detail__edit-toggle"
                onClick={() => onUpdate({ focusText: null, removedFactors: new Set() })}
                title="Discard manual edits and use the suggested wording"
              >
                ↺ Use suggested wording
              </button>
            )}
          </div>
        );
      })()}

      {/* "Why this is proposed" — the backend's rationale for this focus.
          basisLabel is an honest tag (universals say "Standard admission focus"
          even when a positive screen exists); evidence[] lists the supporting
          screens / firing dx-orders. Empty evidence → tag only, no empty box.
          Renders only when rawFocus.rationale is present (Initial wizard). */}
      <FocusRationale rationale={rawFocus?.rationale} causes={rawFocus?.causes} />

      {/* Goals — always inline-editable */}
      <h3 className="cpas-detail__section">Goals ({goals.length})</h3>
          <ul className="cpas-detail__list cpas-detail__list--editable">
            {goals.map((g, i) => {
              const blank = _detectPlaceholder(g.description);
              // Token-bearing goals render the interactive segment view (picker
              // chips / free-text inputs / filled-value sparkles) — same as the
              // focus statement — so "[select]"/blanks become real controls.
              const gHasTokens = _segmentsHaveTokens(g.descriptionSegments);
              return (
                <li key={i} className="cpas-iv-row cpas-iv-row--goal">
                  <div className="cpas-iv-row__body">
                    <div className="cpas-iv-row__text-wrap">
                      {gHasTokens ? (
                        <div className="cpas-iv-row__text cpas-iv-row__text--segments">
                          <DescriptionSegments
                            segments={g.descriptionSegments}
                            tokenValues={state.tokenValues}
                            removedFactors={null}
                            onTokenCommit={onTokenCommit}
                            onToggleFactor={null}
                            readOnly={readOnly}
                          />
                        </div>
                      ) : (
                        <textarea
                          className="cpas-iv-row__text"
                          value={g.description}
                          onInput={(e) => editGoal(i, e.target.value)}
                          rows={1}
                          disabled={readOnly}
                          placeholder="Goal text…"
                        />
                      )}
                      {blank && !gHasTokens && (
                        <span className="cpas-detail__inline-blank-tag" title={`Needs input: ${blank}`}>needs input</span>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    // NO_TRACK: per-row delete, not analytics-worthy
                    <button className="cpas-iv-row__delete" onClick={() => deleteGoal(i)} title="Delete goal">×</button>
                  )}
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            // NO_TRACK: per-row add, not analytics-worthy
            <button className="cpas-iv-row__chip-add cpas-iv-row__chip-add--full" onClick={addGoal}>+ Add goal</button>
          )}

          <h3 className="cpas-detail__section">Interventions ({goals.length === 0 ? 0 : interventions.length})</h3>
          {goals.length === 0 && (
            <p className="cpas-detail__interventions-locked">
              Add at least one goal first — interventions support reaching a goal.
            </p>
          )}
          {goals.length > 0 && (
          <>
          <ul className="cpas-detail__list cpas-detail__list--editable">
            {interventions.map((iv, i) => {
              const posList = _normalizePositions(iv);
              const setPositions = (next) => {
                const cleaned = next.filter((p, j, arr) => p != null && arr.indexOf(p) === j).slice(0, 5);
                editIntervention(i, { positions: cleaned, positionOne: cleaned[0] ?? iv.positionOne });
              };
              const blank = _detectPlaceholder(iv.description);
              // Token-bearing interventions render the interactive segment view so
              // inline "[select]" slots become dropdowns (e.g. Bathing's assist-level
              // + person-count pickers) and evidence-filled slots show their value +
              // "why" receipt — instead of dead "[select]" text.
              const ivHasTokens = _segmentsHaveTokens(iv.descriptionSegments);
              // Kardex is opt-in in every variant: the engine's pick is surfaced
              // as "✨ Recommended" inside the dropdown (the value stays None until
              // the nurse opts in) — we never auto-stamp the Kardex. Positions
              // stay auto-locked in v2 (handled below).
              const kardexRecommended = iv._recKardex;
              return (
                <li key={i} className="cpas-iv-row">
                  <div className="cpas-iv-row__body">
                    <div className="cpas-iv-row__text-wrap">
                      {ivHasTokens ? (
                        <div className="cpas-iv-row__text cpas-iv-row__text--segments">
                          <DescriptionSegments
                            segments={iv.descriptionSegments}
                            tokenValues={state.tokenValues}
                            removedFactors={null}
                            onTokenCommit={onTokenCommit}
                            onToggleFactor={null}
                            readOnly={readOnly}
                          />
                        </div>
                      ) : (
                        <textarea
                          className="cpas-iv-row__text"
                          value={iv.description}
                          onInput={(e) => editIntervention(i, { description: e.target.value })}
                          rows={1}
                          disabled={readOnly}
                          placeholder="Intervention text…"
                        />
                      )}
                      {blank && !ivHasTokens && (
                        <span className="cpas-detail__inline-blank-tag" title={`Needs input: ${blank}`}>needs input</span>
                      )}
                    </div>
                    <div className="cpas-iv-row__chips">
                      <ChipSelect
                        value={iv.kardexCategory}
                        labels={kardexLabels}
                        options={kardexOptions}
                        onChange={(v) => editIntervention(i, { kardexCategory: v })}
                        disabled={readOnly}
                        variant="kardex"
                        recommendedId={kardexRecommended}
                        kindBadge="K"
                        allowClear
                        placeholder="Select Kardex (none)"
                      />
                      {/* Positions are editable in BOTH v1 and v2. In v2 the engine's
                          auto-assigned position seeds the first chip, but the nurse can
                          change it, remove it, or add more (CNA + RN, …) — matching v1. */}
                      {posList.map((p, j) => (
                        <PositionChip
                          key={j}
                          value={p}
                          labels={positionLabels}
                          options={positionOptions}
                          onChange={(v) => {
                            const next = [...posList];
                            next[j] = v;
                            setPositions(next);
                          }}
                          onRemove={posList.length > 1 ? () => setPositions(posList.filter((_, k) => k !== j)) : null}
                          disabled={readOnly}
                        />
                      ))}
                      {!readOnly && posList.length < 5 && (
                        // NO_TRACK: pure-UI position add
                        <button
                          className="cpas-iv-row__chip-add"
                          onClick={() => {
                            const existing = new Set(posList);
                            const next = positionOptions.find((o) => !existing.has(o.id));
                            if (next) setPositions([...posList, next.id]);
                          }}
                          title="Add another position"
                        >+ position</button>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    // NO_TRACK: per-row delete, not analytics-worthy
                    <button className="cpas-iv-row__delete" onClick={() => deleteIntervention(i)} title="Delete intervention">×</button>
                  )}
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            // NO_TRACK: per-row add, not analytics-worthy
            <button className="cpas-iv-row__chip-add cpas-iv-row__chip-add--full" onClick={addIntervention}>+ Add intervention</button>
          )}
          </>
          )}
    </section>
  );
};

// ---------- Segment renderer ----------
//
// Renders a focus/goal/intervention `descriptionSegments[]` inline:
//   - kind:text    → plain span
//   - kind:factor  → indigo-underlined w/ sparkle + source tooltip
//   - kind:token   → filled spans, picker chips, or free-text inputs
// Mirrors web/components/patients/care-plan-segment-renderer.tsx. Filled-token
// rendering is driven by `tokenValues` (client-side state) rather than mutating
// the segment array, so re-renders stay declarative.
// "Why this is proposed" block for the Initial wizard. Mirrors the
// Comprehensive add pane's evidence box. Renders nothing when there's no
// rationale (older proposals / library picks). A `basisLabel` always shows as a
// tag; `evidence[]` lines show only when present.
const RATIONALE_BASIS_CLASS = {
  standard: 'is-standard',
  diagnosis: 'is-diagnosis',
  order: 'is-order',
  assessment: 'is-assessment',
};
// A cause receipt ("dx F03.90", "MDS C0500=09", order text) → pill tint class,
// matching the rationale-tag palette so dx/MDS/order read consistently.
const _causeTint = (receipt) => {
  const r = String(receipt || '').toLowerCase();
  if (r.startsWith('dx')) return 'is-diagnosis';
  if (r.startsWith('mds') || r.startsWith('uda')) return 'is-assessment';
  return 'is-order';
};

export const FocusRationale = ({ rationale, causes }) => {
  const causeList = (causes || []).filter((c) => c && c.label);
  if (
    (!rationale ||
      (!rationale.basisLabel && !(rationale.evidence || []).length && !rationale.whyClause)) &&
    !causeList.length
  )
    return null;
  const evidence = rationale?.evidence || [];
  return (
    <div className="cpas-detail__rationale">
      <div className="cpas-detail__rationale-head">
        <span className="cpas-detail__rationale-title">Why this is proposed</span>
        {rationale?.basisLabel && (
          <span className={`cpas-detail__rationale-tag ${RATIONALE_BASIS_CLASS[rationale.basis] || ''}`}>
            {rationale.basisLabel}
          </span>
        )}
      </div>
      {evidence.length > 0 && (
        <ul className="cpas-detail__rationale-list">
          {evidence.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {/* Authored bridge (trigger → focus): "diuretic therapy increases
          dehydration risk" — the connective tissue after the raw trigger. */}
      {rationale?.whyClause && (
        <div className="cpas-detail__rationale-bridge">— {rationale.whyClause}</div>
      )}
      {/* Auto-filled r/t etiologies with their chart receipts. Each pill's label
          appears in the focus statement's "r/t …" clause; hovering shows WHAT on
          the chart put it there (the dx code / MDS item+value). Data ships on
          every proposal as `causes[{label, receipt}]` — display-only here; the
          nurse edits the text itself to remove one. */}
      {causeList.length > 0 && (
        <div className="cpas-detail__causes">
          <span className="cpas-detail__causes-label">r/t linked to chart:</span>
          {causeList.map((c, i) => (
            <span
              key={i}
              className={`cpas-detail__cause-pill ${_causeTint(c.receipt)}`}
              title={c.receipt ? `From chart: ${c.receipt}` : 'Derived from chart'}
            >
              {c.label}
              {c.receipt ? <span className="cpas-detail__cause-receipt">{c.receipt}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const DescriptionSegments = ({ segments, tokenValues, removedFactors, onTokenCommit, onToggleFactor, readOnly }) => {
  // Per-segment-index "editing" set — lets a filled token sparkle revert to
  // its editor on click. Keyed by index, not tokenKey, since a key can appear
  // in multiple segment positions and we only want the clicked one to flip.
  const [editing, setEditing] = useState(() => new Set());
  const startEdit = (idx) => setEditing((s) => { const n = new Set(s); n.add(idx); return n; });
  const stopEdit = (idx) => setEditing((s) => { const n = new Set(s); n.delete(idx); return n; });
  if (!_hasSegments(segments)) return null;
  const tv = tokenValues || {};
  // Consecutive evidence-menu bullets render as ONE "check what applies"
  // control instead of N inline boxes (the Gomez/Morales psychosocial wall).
  const plan = groupEvidenceMenus(segments);
  return (
    <span className="cpas-seg">
      {plan.map((p) => {
        if (p.kind === 'msgroup') {
          return (
            <EvidenceMenuGroup
              key={`msg-${p.tokens[0].idx}`}
              tokens={p.tokens}
              tokenValues={tv}
              readOnly={readOnly}
              onToggle={(seg, checked) =>
                onTokenCommit(tokenKeyOf(seg), checked ? seg.value : TOKEN_OMIT)
              }
            />
          );
        }
        const s = p.seg;
        const i = p.idx;
        if (!s) return null;
        if (s.kind === 'text') return <span key={i}>{s.value}</span>;
        if (s.kind === 'factor') {
          const isRemoved = removedFactors instanceof Set && removedFactors.has(i);
          if (readOnly) {
            return isRemoved ? null : <FactorSpan key={i} segment={s} />;
          }
          return (
            <FactorSpan
              key={i}
              segment={s}
              removed={isRemoved}
              onRemove={() => onToggleFactor?.(i, true)}
              onRestore={() => onToggleFactor?.(i, false)}
            />
          );
        }
        if (s.kind === 'token') {
          // Value is keyed by the token's UNIQUE key (_ukey for goal/intervention
          // tokens, tokenKey for focus tokens) so same-tokenKey slots don't collide;
          // the human label still comes from tokenKey.
          const tkey = tokenKeyOf(s);
          const typed = tv[tkey];
          const typedVal = (typed && String(typed).trim()) || '';
          const backendFilled = !s.needsFilling && s.value;
          const currentValue = typedVal || (backendFilled ? s.value : '');
          const isFilled = !!currentValue;

          if (readOnly) {
            return isFilled
              ? <FilledTokenSpan key={i} value={currentValue} tokenKey={s.tokenKey} editable={false} />
              : <span key={i}>{s.value}</span>;
          }

          // Filled + not actively re-editing: render the sparkle span, clickable
          // to drop back into the editor.
          if (isFilled && !editing.has(i)) {
            return (
              <FilledTokenSpan
                key={i}
                value={currentValue}
                tokenKey={s.tokenKey}
                editable={true}
                onEdit={() => startEdit(i)}
              />
            );
          }

          // Editor — either unfilled-from-start, or user clicked to re-edit.
          // autoOpen / autoFocus make the click-to-edit feel single-step.
          const reEditing = editing.has(i);
          if (Array.isArray(s.options) && s.options.length) {
            return (
              <TokenPickerChip
                key={i}
                segment={s}
                currentValue={isFilled ? currentValue : null}
                autoOpen={reEditing}
                onCommit={(v) => { onTokenCommit(tkey, v); stopEdit(i); }}
                onDismiss={() => stopEdit(i)}
              />
            );
          }
          return (
            <TokenFreeTextInline
              key={i}
              segment={s}
              initialValue={isFilled ? currentValue : ''}
              autoFocus={reEditing}
              onCommit={(v) => { onTokenCommit(s.tokenKey, v); stopEdit(i); }}
              onDismiss={() => stopEdit(i)}
            />
          );
        }
        return null;
      })}
    </span>
  );
};

const FactorSpan = ({ segment, removed, onRemove, onRestore }) => {
  const tip = removed
    ? <span>Removed — click to restore</span>
    : _factorTooltipContent(segment);
  const handleX = (e) => {
    e.stopPropagation();
    if (removed) onRestore?.(); else onRemove?.();
  };
  return (
    <HoverTooltip content={tip}>
      <span className={`cpas-seg-factor ${removed ? 'is-removed' : ''}`}>
        {segment.value}
        <span className="cpas-seg-sparkle" aria-hidden="true">✨</span>
        {(onRemove || onRestore) && (
          <button
            type="button"
            className="cpas-seg-factor__x"
            onClick={handleX}
            aria-label={removed ? 'Restore factor' : 'Remove factor'}
            title={removed ? 'Restore' : 'Remove'}
          >
            {removed ? '↺' : '×'}
          </button>
        )}
      </span>
    </HoverTooltip>
  );
};

const FilledTokenSpan = ({ value, tokenKey, editable, onEdit }) => {
  const tokenLabel = _tokenLabelFromKey(tokenKey);
  const tip = editable
    ? <span>Click to edit <strong>{tokenLabel}</strong></span>
    : <span>Your selection for <strong>{tokenLabel}</strong></span>;
  const handleClick = editable ? () => onEdit?.() : undefined;
  const handleKey = editable
    ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit?.(); } }
    : undefined;
  return (
    <HoverTooltip content={tip}>
      <span
        className={`cpas-seg-factor ${editable ? 'is-editable' : ''}`}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKey}
      >
        {value}
        <span className="cpas-seg-sparkle" aria-hidden="true">✨</span>
      </span>
    </HoverTooltip>
  );
};

// Evidence-menu group: N consecutive "AEB --(...)" bullets as ONE checklist
// control. The chip summarizes ("2 of 5 apply ⌄"); the popover lists every
// clause with a checkbox. Checked = composes into the stamped text. Defaults
// are evidence-driven (isMenuChecked): a clause the chart already answers
// (PHQ-9/UDA match, receipt attached) starts checked; the rest start unchecked
// — the nurse's assertion, never the engine's. Zero checked is valid: compose
// drops the dangling connector.
const EvidenceMenuGroup = ({ tokens, tokenValues, readOnly, onToggle }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const checked = tokens.filter((t) => isMenuChecked(t.seg, tokenValues));
  if (readOnly) {
    // Mirror compose: only checked clauses appear, connector handling upstream.
    if (!checked.length) return null;
    return <span>{checked.map((t) => t.seg.value).join('; ')}</span>;
  }
  const summary = checked.length
    ? `${checked.length} of ${tokens.length} apply`
    : 'select what applies';
  return (
    <span className={`cpas-seg-msg ${checked.length ? 'has-checked' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="cpas-seg-msg__chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Check the statements that apply to this resident"
      >
        {summary}
        <IconChevronDown />
      </button>
      {open && (
        <span className="cpas-seg-msg__pop">
          {tokens.map((t) => {
            const isOn = isMenuChecked(t.seg, tokenValues);
            return (
              <label key={tokenKeyOf(t.seg)} className="cpas-seg-msg__item">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => onToggle(t.seg, !isOn)}
                />
                <span className="cpas-seg-msg__label">
                  {t.seg.value}
                  {t.seg.receipt && (
                    <span className="cpas-seg-msg__receipt" title={t.seg.receipt}>
                      ✓ {t.seg.receipt}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </span>
      )}
    </span>
  );
};

// Picker token: dashed amber chip with chevron → click → popover of options.
// Trigger label is the action ("Select discharge destination") rather than the
// round-trip placeholder ("[select discharge destination]") so the affordance
// reads as a CTA, not a literal. Tooltip explains the click for nurses who
// haven't seen this control before.
const TokenPickerChip = ({ segment, currentValue, autoOpen, onCommit, onDismiss }) => {
  const [open, setOpen] = useState(!!autoOpen);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        // Outside-click while re-editing a filled token = cancel the edit.
        onDismiss?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onDismiss]);
  const tokenLabel = _tokenLabelFromKey(segment.tokenKey);
  // Re-edit shows the current selection as the trigger; initial unfilled
  // state shows the "Select X" CTA. Either way, the chevron signals click.
  const triggerLabel = currentValue
    ? currentValue
    : (_isTokenPlaceholderValue(segment.value) ? `Select ${tokenLabel}` : segment.value);
  const tipContent = currentValue
    ? <span>Click to change <strong>{tokenLabel}</strong></span>
    : <span>Click to choose <strong>{tokenLabel}</strong></span>;
  return (
    <HoverTooltip content={tipContent}>
      <span className="cpas-seg-picker" ref={wrapRef}>
        <button
          type="button"
          className="cpas-seg-chip"
          onClick={() => setOpen((o) => !o)}
          aria-label={currentValue ? `Change ${tokenLabel}` : `Select ${tokenLabel}`}
        >
          <span className="cpas-seg-chip__label">{triggerLabel}</span>
          <IconChevronDown />
        </button>
        {open && (
          <span className="cpas-seg-picker__pop" role="menu">
            {segment.options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`cpas-seg-picker__opt ${opt === currentValue ? 'is-current' : ''}`}
                onClick={() => { onCommit(opt); setOpen(false); }}
              >
                {opt}
              </button>
            ))}
          </span>
        )}
      </span>
    </HoverTooltip>
  );
};

// Free-text token: pencil-iconed dashed amber field. Commits on blur or
// Enter, non-empty only (per round-3 §5.4). The icon prefix + tooltip make
// the affordance unambiguous — a bare input was mistaken for a label.
const TokenFreeTextInline = ({ segment, initialValue, autoFocus, onCommit, onDismiss }) => {
  const inputRef = useRef(null);
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      // Place caret at end so the existing value isn't selected for accidental
      // overwrite — re-editors usually tweak, not retype.
      const el = inputRef.current;
      const v = el.value || '';
      try { el.setSelectionRange(v.length, v.length); } catch (_) {}
    }
  }, [autoFocus]);
  const handleBlur = (e) => {
    const v = (e.target.value || '').trim();
    // Commit only when changed and non-empty. Empty / unchanged blur exits
    // edit mode without losing the prior value (handled by onDismiss).
    if (v && v !== (initialValue || '')) onCommit(v);
    else onDismiss?.();
  };
  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); onDismiss?.(); }
  };
  const tokenLabel = _tokenLabelFromKey(segment.tokenKey);
  return (
    <HoverTooltip
      content={<span>Type to fill in <strong>{tokenLabel}</strong>; press Enter or click out to confirm.</span>}
    >
      <span className="cpas-seg-input-wrap">
        <IconPencil />
        <input
          ref={inputRef}
          type="text"
          className="cpas-seg-input"
          defaultValue={initialValue || ''}
          placeholder={`Type ${tokenLabel} here`}
          aria-label={`Type ${tokenLabel}`}
          onBlur={handleBlur}
          onKeyDown={handleKey}
        />
      </span>
    </HoverTooltip>
  );
};

const HoverTooltip = ({ content, children, side = 'top', delay = 200 }) => {
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const onEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), delay);
  };
  const onLeave = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setOpen(false);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (
    <span className="cpas-tt" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocusCapture={onEnter} onBlurCapture={onLeave}>
      {children}
      {open && content && (
        <span className={`cpas-tt__pop cpas-tt__pop--${side}`} role="tooltip">{content}</span>
      )}
    </span>
  );
};

// Inline SVG icons (no external icon lib in this extension).
const IconChevronDown = () => (
  <svg className="cpas-icon" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
    <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconPencil = () => (
  <svg className="cpas-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <path d="M8.5 1.5L10.5 3.5L4 10L1.5 10.5L2 8L8.5 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

// ---------- Kardex / Position chips ----------

const ChipSelect = ({ value, labels, options, onChange, disabled, variant, recommendedId, kindBadge, allowClear, placeholder }) => (
  <Combobox
    value={value}
    labels={labels}
    options={options}
    onChange={onChange}
    disabled={disabled}
    variant={variant === 'kardex' ? 'kardex' : variant}
    ariaLabel={variant === 'kardex' ? 'Kardex category' : 'Select'}
    triggerClass={`cpas-chip cpas-chip--${variant || 'default'} ${value == null ? 'is-empty' : ''}`}
    recommendedId={recommendedId}
    kindBadge={kindBadge}
    allowClear={allowClear}
    placeholder={placeholder}
  />
);

/**
 * Position chip — combobox styled as a green pill with × to remove.
 */
const PositionChip = ({ value, labels, options, onChange, onRemove, disabled }) => (
  <span className="cpas-chip-wrap">
    <Combobox
      value={value}
      labels={labels}
      options={options}
      onChange={onChange}
      disabled={disabled}
      variant="pos"
      ariaLabel="Position"
      triggerClass="cpas-chip cpas-chip--pos"
    />
    {onRemove && !disabled && (
      // NO_TRACK: pure-UI remove of one position
      <button
        className="cpas-chip__remove cpas-chip__remove--external"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remove this position"
        title="Remove this position"
      >×</button>
    )}
  </span>
);

// ---------- Local helpers (small, pure) ----------

function _hasSegments(segments) {
  return Array.isArray(segments) && segments.length > 0;
}

// True when a goal/intervention carries at least one fillable token segment — the
// signal to render the interactive segment view (dropdowns / inputs) instead of a
// plain textarea.
function _segmentsHaveTokens(segments) {
  return Array.isArray(segments) && segments.some((s) => s && s.kind === 'token');
}

function _isTokenPlaceholderValue(v) {
  if (!v) return true;
  if (v === '___' || /_{3,}/.test(v)) return true;
  if (/^\[.*\]$/.test(v.trim())) return true;
  return false;
}

// Internal slot-type token keys → nurse-facing words. Without this, backend
// type names leak into the UI ("Select inline", "Type multiselect here").
const TOKEN_TYPE_LABELS = {
  inline: 'an option',
  multiselect: 'what applies',
  bare: 'a value',
  other: 'details',
  freq: 'frequency',
  count: 'a number',
  med: 'medication',
  o2: 'oxygen flow',
  painlevel: 'pain level',
  skinrisk: 'skin risk level',
};

function _tokenLabelFromKey(key) {
  const k = String(key || '');
  return TOKEN_TYPE_LABELS[k] || k.replace(/_/g, ' ');
}

function _factorTooltipContent(s) {
  if (!s) return null;
  if (s.source === 'diagnosis' && s.dxCode) {
    return <span>From diagnosis <strong>{s.dxCode}</strong></span>;
  }
  if (s.source === 'order' && s.orderPattern) {
    return <span>From an active order matching <strong>{s.orderPattern}</strong></span>;
  }
  if (s.source === 'derived' && Array.isArray(s.derivedFrom) && s.derivedFrom.length) {
    return <span>Derived from <strong>{s.derivedFrom.join(', ')}</strong></span>;
  }
  return <span>From clinical data</span>;
}

/**
 * Read positions[] from an intervention, falling back to legacy positionOne.
 * Always returns an array (possibly empty).
 */
function _normalizePositions(iv) {
  if (Array.isArray(iv.positions) && iv.positions.length > 0) return iv.positions;
  if (iv.positionOne != null) return [iv.positionOne];
  return [];
}

function _detectPlaceholder(text) {
  if (!text) return null;
  if (/_{3,}/.test(text)) return 'underscore blank';
  if (/\(SPECIFY[^)]*\)/i.test(text)) return '(SPECIFY) blank';
  if (/\[(fill in|insert|describe|specify)[^\]]*\]/i.test(text)) return 'bracketed blank';
  // Trailing connector hints (r/t, due to:, as evidenced by:, exhibited by:)
  if (/(r\/t|due to:|as evidenced by:|exhibited by:|related to:)\s*$/i.test(text.trim())) return 'trailing connector';
  // Ends with a colon (e.g. "Communication impaired due to:")
  if (/:\s*$/.test(text.trim()) && !/\?$/.test(text.trim())) return 'trailing colon';
  return null;
}

// Decode HTML entities in scraped PCC strings before render. PCC's care-plan
// rows come back from the backend with raw HTML entities (e.g. "&ndash;",
// "&#8211;") that JSX doesn't decode, so users saw mojibake like
// "Discharge planning â?? anticipated disposition". Browser parser handles
// every entity correctly with one round-trip through a textarea.
function _decodeHtmlText(s) {
  if (!s) return s;
  // Cheap, browser-correct entity decode. textarea.innerHTML is parsed as
  // text-content (not HTML), so no XSS risk — tags would render as text.
  const ta = document.createElement('textarea');
  ta.innerHTML = String(s);
  return ta.value;
}

function _ruleIdToLabel(ruleId) {
  if (!ruleId) return 'Focus';
  const labels = {
    'universal.fall_risk': 'Falls',
    'universal.skin_integrity': 'Skin',
    'universal.adl': 'ADLs',
    'universal.nutrition': 'Nutrition',
    'universal.hydration': 'Hydration',
    'universal.pain': 'Pain',
    'universal.code_status': 'Code Status',
    'universal.cognition': 'Cognition',
    'universal.mood': 'Mood',
    'universal.communication': 'Communication',
    'universal.trauma_informed': 'Trauma',
    'universal.discharge_planning': 'Discharge',
  };
  if (labels[ruleId]) return labels[ruleId];
  const tail = ruleId.split('.').pop() || ruleId;
  return tail.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
