import { h } from 'preact';
import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks';

/**
 * Full-screen wizard for Care Plan Auto-Pop (v0: Initial scope only).
 *
 * Flow:
 *   1. Mount → fetch proposal (with existingFocusTexts for idempotency) +
 *      discover careplanId/miniToken/dropdowns in parallel
 *   2. Validate org dropdown IDs — fail loudly if mismatch
 *   3. Nurse reviews each focus, edits text/goals/interventions inline,
 *      picks code_status, skips already-on-plan focuses (pre-skipped by default)
 *   4. Click Stamp → sequential POSTs of the *composed* (edits applied) shape
 *   5. Done → reload PCC's careplandetail page so new focuses appear
 */

/**
 * Per-focus state shape:
 *   {
 *     skipped: boolean,
 *     codeStatus: string | null,        // for universal.code_status only
 *     focusText: string | null,          // null = use original.description
 *     goals: ProposedGoal[] | null,      // null = use original.goals
 *     interventions: ProposedIntervention[] | null,
 *   }
 * `null` means "no edits, use original". This keeps originals immutable.
 */

export const CarePlanStampModal = ({ patientId, patientName, facilityName, orgSlug, existingFocusTexts, onClose }) => {
  const [stage, setStage] = useState('loading'); // loading | ready | drift | stamping | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [driftMissing, setDriftMissing] = useState([]);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [careplanId, setCareplanId] = useState(null);
  const [miniToken, setMiniToken] = useState(null);
  const [dropdowns, setDropdowns] = useState(null); // org-specific Kardex/Position/Review labels + options
  const [focusStates, setFocusStates] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(null);
  const [stampResult, setStampResult] = useState(null);

  // Library browser — nurse picks additional focuses from PCC's actual library.
  // Stamped via the same custom-text path (we use PCC's wording, not stdNeedId linking).
  // Tracked separately from auto-picks so the UI can label them and the nurse can pull them.
  const [libraryPicks, setLibraryPicks] = useState([]); // [{ stdNeedId, label, focusText, reviewDepartments, goals, interventions }]

  // -------- Load proposal + PCC context in parallel --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const D = window.CarePlanStampDiscover;
        const A = window.CarePlanStampAPI;

        const [prop, cpId] = await Promise.all([
          A.fetchProposal({ patientId, facilityName, orgSlug, scope: 'initial', existingFocusTexts }),
          D.discoverCarePlanId(patientId),
        ]);
        if (cancelled) return;

        const [token, dd] = await Promise.all([
          D.discoverMiniToken(patientId, cpId),
          D.scrapeOrgDropdowns(patientId, cpId),
        ]);
        if (cancelled) return;
        setDropdowns(dd);

        const validation = D.validateProposalIds(prop, dd);
        if (!validation.ok) {
          setDriftMissing(validation.missing);
          setStage('drift');
          return;
        }

        setProposal(prop);
        setCareplanId(cpId);
        setMiniToken(token);
        setFocusStates((prop.focuses || []).map((f) => ({
          // Pre-skip if backend marked this focus as already-on-plan.
          // Nurse can override by clicking Include.
          skipped: !!f.alreadyOnPlan,
          codeStatus: f.ruleId === 'universal.code_status' ? 'Full Code' : null,
          dischargeDestination: f.ruleId === 'universal.discharge_planning' ? 'Undetermined' : null,
          focusText: null,
          goals: null,
          interventions: null,
          // Default to compact preview; nurse clicks "Customize" to reveal textareas.
          expanded: false,
        })));

        // Auto-jump active to first non-skipped focus so user lands on the meaningful work
        const firstActive = (prop.focuses || []).findIndex((f) => !f.alreadyOnPlan);
        if (firstActive > 0) setActiveIdx(firstActive);

        setStage('ready');

        window.SuperAnalytics?.track?.('care_plan_autopop_modal_opened', {
          patient_id: patientId,
          n_proposed: prop.focuses?.length ?? 0,
          n_already_on_plan: (prop.focuses || []).filter((f) => f.alreadyOnPlan).length,
        });
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e.message || 'Failed to load proposal');
        setStage('error');
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, facilityName, orgSlug]); // existingFocusTexts intentionally omitted — captured once at modal-open

  // -------- Combined raw focuses: auto-picks + library picks --------
  const allRawFocuses = useMemo(() => {
    const auto = proposal?.focuses || [];
    const lib = libraryPicks.map((p) => ({
      ruleId: `library.${p.stdNeedId}`,
      description: p.focusText,
      reviewDepartments: p.reviewDepartments || [9042], // default Nursing
      goals: p.goals,
      interventions: p.interventions,
      alreadyOnPlan: false,
      matchedExistingText: null,
      _isLibrary: true,
      _libraryStdNeedId: p.stdNeedId,
      _libraryLabel: p.label,
    }));
    return [...auto, ...lib];
  }, [proposal, libraryPicks]);

  // -------- Effective focus list: applies edits + code_status substitution --------
  const composedFocuses = useMemo(() => {
    return allRawFocuses.map((f, i) => _composeFocus(f, focusStates[i] || {}));
  }, [allRawFocuses, focusStates]);

  // -------- Helpers --------
  const patchFocus = useCallback((idx, patch) => {
    setFocusStates((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const addLibraryPick = useCallback((pick) => {
    setLibraryPicks((prev) => [...prev, pick]);
    setFocusStates((prev) => [
      ...prev,
      { skipped: false, codeStatus: null, focusText: null, goals: null, interventions: null, expanded: false },
    ]);
  }, []);

  const removeLibraryPick = useCallback((stdNeedId) => {
    setLibraryPicks((prev) => {
      const idx = prev.findIndex((p) => p.stdNeedId === stdNeedId);
      if (idx === -1) return prev;
      const autoCount = proposal?.focuses?.length || 0;
      setFocusStates((states) => states.filter((_, i) => i !== autoCount + idx));
      return prev.filter((_, i) => i !== idx);
    });
  }, [proposal]);

  const includedCount = focusStates.filter((s) => !s.skipped).length;

  // -------- Stamp action --------
  const handleStamp = useCallback(async () => {
    if (!proposal || !careplanId || !miniToken) return;

    const toStamp = {
      // CRITICAL: use the PCC clientid (from URL), not proposal.patientId
      // which is our internal UUID. PCC's stamp endpoints reject internal UUIDs.
      patientId: patientId,
      focuses: allRawFocuses
        .map((f, i) => focusStates[i]?.skipped ? null : _composeFocus(f, focusStates[i] || {}))
        .filter(Boolean),
    };

    if (toStamp.focuses.length === 0) return;

    // Sanity: if any focus still has '___' (no code-status selection somehow), bail.
    const unsubbed = toStamp.focuses.find((f) => f.description.includes('___'));
    if (unsubbed) {
      setErrorMsg('Please pick a code status before adding.');
      setStage('error');
      return;
    }

    setStage('stamping');
    setProgress({ phase: 'starting', focusIndex: 0, focusTotal: toStamp.focuses.length });

    window.SuperAnalytics?.track?.('care_plan_autopop_stamp_clicked', {
      patient_id: patientId,
      n_focuses_to_stamp: toStamp.focuses.length,
      n_focuses_skipped: proposal.focuses.length - toStamp.focuses.length,
    });

    try {
      const result = await window.CarePlanStampClient.orchestrateStamp({
        proposal: toStamp,
        careplanId,
        miniToken,
        onProgress: (p) => setProgress(p),
      });
      setStampResult(result);
      setStage('done');

      window.SuperAnalytics?.track?.('care_plan_autopop_stamped', {
        patient_id: patientId,
        scope: 'initial',
        n_proposed: proposal.focuses?.length ?? 0,
        n_stamped: result.focusesStamped,
        n_goals: result.goalsStamped,
        n_interventions: result.interventionsStamped,
        n_failed: result.errors.length,
        duration_ms: result.durationMs,
      });
    } catch (e) {
      setErrorMsg(e.message || 'Add failed');
      setStage('error');
    }
  }, [proposal, careplanId, miniToken, focusStates, patientId]);

  // -------- Render --------
  return (
    <div className="cpas-modal" role="dialog" aria-modal="true">
      <div className="cpas-modal__backdrop" onClick={stage === 'stamping' ? null : onClose} />
      <div className="cpas-modal__container">
        <header className="cpas-modal__header">
          <div>
            <h1 className="cpas-modal__title">Auto-Populate Care Plan</h1>
            <p className="cpas-modal__subtitle">
              {patientName || 'Resident'} · Initial care plan
            </p>
          </div>
          <div className="cpas-modal__header-actions">
            {stage === 'ready' && (
              // NO_TRACK: pure-UI open of library overlay
              <button
                className="cpas-modal__library-btn"
                onClick={() => setLibraryPanelOpen(true)}
                title="Browse focuses from your facility's PCC library"
              >
                + Browse PCC Library
              </button>
            )}
            {stage !== 'stamping' && (
              // NO_TRACK: pure-UI dismiss of the modal
              <button className="cpas-modal__close" onClick={onClose} aria-label="Close">×</button>
            )}
          </div>
        </header>

        <div className="cpas-modal__body">
          {stage === 'loading' && <LoadingState />}
          {stage === 'error' && <ErrorState message={errorMsg} onClose={onClose} />}
          {stage === 'drift' && <DriftState missing={driftMissing} onClose={onClose} />}
          {(stage === 'ready' || stage === 'stamping' || stage === 'done') && proposal && (
            <div className="cpas-modal__columns">
              <FocusList
                rawFocuses={allRawFocuses}
                composedFocuses={composedFocuses}
                focusStates={focusStates}
                activeIdx={activeIdx}
                onSelect={setActiveIdx}
                progress={progress}
                onRemoveLibraryPick={removeLibraryPick}
              />
              <FocusDetail
                composed={composedFocuses[activeIdx]}
                state={focusStates[activeIdx]}
                rawFocus={allRawFocuses[activeIdx]}
                onUpdate={(patch) => patchFocus(activeIdx, patch)}
                readOnly={stage !== 'ready'}
                dropdowns={dropdowns}
              />
            </div>
          )}
          {stage === 'ready' && libraryPanelOpen && (
            <LibraryBrowser
              patientId={patientId}
              careplanId={careplanId}
              miniToken={miniToken}
              onAddPick={addLibraryPick}
              pickedIds={new Set(libraryPicks.map((p) => p.stdNeedId))}
              onClose={() => setLibraryPanelOpen(false)}
            />
          )}
        </div>

        {stage === 'ready' && (
          <footer className="cpas-modal__footer">
            <span className="cpas-modal__footer-summary">
              {includedCount} of {focusStates.length} focuses selected to add
            </span>
            <div className="cpas-modal__footer-actions">
              {/* NO_TRACK: pure-UI cancel */}
              <button className="cpas-btn cpas-btn--ghost" onClick={onClose}>Cancel</button>
              <button
                className="cpas-btn cpas-btn--primary"
                disabled={includedCount === 0}
                onClick={handleStamp}
              >
                Add {includedCount} {includedCount === 1 ? 'focus' : 'focuses'} to care plan
              </button>
            </div>
          </footer>
        )}

        {stage === 'stamping' && (
          <footer className="cpas-modal__footer">
            <ProgressBar progress={progress} total={includedCount} />
          </footer>
        )}

        {stage === 'done' && stampResult && (
          <DoneFooter result={stampResult} onClose={() => {
            try { chrome.runtime.sendMessage({ type: 'RELOAD_CURRENT_TAB' }); }
            catch (_) { window.location.reload(); }
            onClose();
          }} />
        )}
      </div>
    </div>
  );
};

// -------- Compose helper --------

/**
 * Apply edit state to an original focus to produce the shape that will be stamped.
 * Substitutes code_status `___` (using state.codeStatus). Uses state.focusText if set.
 * Uses state.goals/interventions if set (these are full replacements, not patches).
 */
function _composeFocus(original, state) {
  const baseDesc = state.focusText != null
    ? state.focusText
    : (original.ruleId === 'universal.code_status' && state.codeStatus)
      ? original.description.replace('___', state.codeStatus)
      : (original.ruleId === 'universal.discharge_planning' && state.dischargeDestination)
        ? original.description.replace('___', state.dischargeDestination)
        : original.description;
  const goals = state.goals != null ? state.goals : original.goals;
  const interventions = state.interventions != null ? state.interventions : original.interventions;
  // Defense in depth: a focus with 0 goals has no business carrying interventions.
  const safeInterventions = (Array.isArray(goals) && goals.length === 0) ? [] : interventions;
  return {
    ...original,
    description: baseDesc,
    goals,
    interventions: safeInterventions,
  };
}

// -------- Subcomponents --------

const LoadingState = () => (
  <div className="cpas-empty">
    <div className="cpas-spinner" />
    <p>Reading patient context from PCC…</p>
  </div>
);

const ErrorState = ({ message, onClose }) => (
  <div className="cpas-empty cpas-empty--error">
    <h3>Something went wrong</h3>
    <p>{message}</p>
    {/* NO_TRACK: pure-UI close on error */}
    <button className="cpas-btn cpas-btn--ghost" onClick={onClose}>Close</button>
  </div>
);

const DriftState = ({ missing, onClose }) => (
  <div className="cpas-empty cpas-empty--error">
    <h3>This facility uses different PCC dropdown IDs</h3>
    <p>
      The proposed care plan references PCC option IDs that don't exist in your facility's form.
      This usually means your org's Kardex/Position/Review Department lists have been customized.
      Contact support so we can map them.
    </p>
    <details>
      <summary>{missing.length} missing {missing.length === 1 ? 'ID' : 'IDs'}</summary>
      <ul className="cpas-drift-list">
        {missing.slice(0, 12).map((m, i) => (
          <li key={i}>
            <code>{m.kind}: {m.id}</code> — needed by {m.where}
          </li>
        ))}
        {missing.length > 12 && <li>…and {missing.length - 12} more</li>}
      </ul>
    </details>
    {/* NO_TRACK: pure-UI close on drift error */}
    <button className="cpas-btn cpas-btn--ghost" onClick={onClose}>Close</button>
  </div>
);

const FocusList = ({ rawFocuses, composedFocuses, focusStates, activeIdx, onSelect, progress, onRemoveLibraryPick }) => {
  const stampCount = focusStates.filter((s) => !s.skipped).length;
  const onPlanCount = rawFocuses.filter((f) => f.alreadyOnPlan).length;
  const libCount = rawFocuses.filter((f) => f._isLibrary).length;

  return (
    <aside className="cpas-list">
      <div className="cpas-list__header">
        <div className="cpas-list__header-title">To add</div>
        <div className="cpas-list__header-count">
          {stampCount} of {focusStates.length} {stampCount === 1 ? 'focus' : 'focuses'}
        </div>
      </div>
      {(onPlanCount > 0 || libCount > 0) && (
        <div className="cpas-list__legend">
          {onPlanCount > 0 && <span><b>{onPlanCount}</b> already on plan (skipped)</span>}
          {libCount > 0 && <span><b>{libCount}</b> from PCC library</span>}
        </div>
      )}
      <ol className="cpas-list__items">
        {rawFocuses.map((f, i) => {
          const state = focusStates[i] || {};
          let cls = 'cpas-list__item';
          let badge = '+';
          let badgeTitle = 'Will be added to the care plan';
          if (state.skipped) {
            cls += ' is-skipped';
            badge = '−';
            badgeTitle = f.alreadyOnPlan ? 'Pre-skipped — already on plan' : 'Skipped';
          }
          if (f.alreadyOnPlan) cls += ' is-on-plan';
          if (f._isLibrary) cls += ' is-library';
          if (i === activeIdx) cls += ' is-active';
          const isStamping = progress && progress.focusIndex === i && !state.skipped;
          if (isStamping) { cls += ' is-stamping'; badge = '…'; badgeTitle = 'Adding now…'; }

          const label = f._isLibrary ? (f._libraryLabel || 'From PCC library') : _ruleIdToLabel(f.ruleId);

          // Single-line preview of the focus text — uses composed (code_status
          // substituted) version so the sidebar reflects what'll be stamped.
          const composedDesc = composedFocuses?.[i]?.description || f.description || '';
          const preview = composedDesc.replace(/\s+/g, ' ').trim();
          const hasBlank = _detectPlaceholder(composedDesc);

          return (
            <li key={f.ruleId} className={cls} onClick={() => onSelect(i)}>
              <span className="cpas-list__badge" title={badgeTitle}>{badge}</span>
              <div className="cpas-list__body">
                <div className="cpas-list__row-top">
                  <span className="cpas-list__text">{label}</span>
                  {f.alreadyOnPlan && <span className="cpas-list__tag" title="Already on this resident's plan">on plan</span>}
                  {f._isLibrary && (
                    <>
                      <span className="cpas-list__tag cpas-list__tag--lib">lib</span>
                      {/* NO_TRACK: pure-UI remove of library-picked focus */}
                      <button
                        className="cpas-list__remove"
                        onClick={(e) => { e.stopPropagation(); onRemoveLibraryPick?.(f._libraryStdNeedId); }}
                        title="Remove from queue"
                      >×</button>
                    </>
                  )}
                  {hasBlank && <span className="cpas-list__tag cpas-list__tag--blank" title="Has a placeholder needing input">needs input</span>}
                </div>
                {preview && <div className="cpas-list__preview">{preview}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
};

// -------- Library browser (browse this facility's actual PCC library) --------

const LibraryBrowser = ({ patientId, careplanId, miniToken, onAddPick, pickedIds, onClose }) => {
  const [libraries, setLibraries] = useState(null);
  const [libraryId, setLibraryId] = useState('');
  const [categories, setCategories] = useState(null);
  const [diagcatId, setDiagcatId] = useState('');
  const [focuses, setFocuses] = useState(null);
  const [loadingState, setLoadingState] = useState('idle'); // idle | libs | cats | focuses | contents
  const [addingId, setAddingId] = useState(null);
  const [error, setError] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  // Configure-this-focus wizard state. When `configuring` is set, the panel
  // hides the focus list and shows a goal+intervention checklist for that focus.
  // User picks which to include, then "Add to queue."
  const [configuring, setConfiguring] = useState(null);
  // configuring shape: { focus, goals: [{ stdGoalId, text }], interventions: [{ stdInterId, text }], selectedGoalIds: Set, selectedInterIds: Set, loading: bool }

  const D = window.CarePlanStampDiscover;

  // Load libraries on mount (panel is always visible now)
  useEffect(() => {
    if (libraries !== null) return;
    setLoadingState('libs');
    setError('');
    D.discoverLibraries(patientId, careplanId)
      .then((libs) => setLibraries(libs))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingState('idle'));
  }, []);

  // Load categories when a library is selected
  useEffect(() => {
    if (!libraryId) { setCategories(null); setDiagcatId(''); return; }
    setLoadingState('cats');
    setError('');
    setCategories(null);
    setDiagcatId('');
    setFocuses(null);
    D.discoverCategoriesForLibrary(libraryId, patientId, careplanId, miniToken)
      .then((cats) => setCategories(cats))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingState('idle'));
  }, [libraryId]);

  // Load focuses when a diagcat is selected
  useEffect(() => {
    if (!diagcatId) { setFocuses(null); return; }
    setLoadingState('focuses');
    setError('');
    setFocuses(null);
    D.discoverFocusesForCategory(libraryId, diagcatId, patientId, careplanId, miniToken)
      .then((fs) => setFocuses(fs))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingState('idle'));
  }, [diagcatId]);

  // Enter the configure-this-focus wizard. Fetch goals + interventions, default-select
  // the same subset our quick-add path uses (3 goals, 8 interventions).
  const startConfigure = async (focus) => {
    if (pickedIds.has(focus.stdNeedId)) return;
    setError('');
    setConfiguring({ focus, loading: true, goals: [], interventions: [], selectedGoalIds: new Set(), selectedInterIds: new Set(), fills: {}, focusFills: {} });
    try {
      const contents = await D.discoverFocusContents(focus.stdNeedId, patientId, careplanId);
      const defaultGoals = new Set(contents.goals.slice(0, 3).map((g) => g.stdId));
      const defaultInters = new Set(contents.interventions.slice(0, 8).map((iv) => iv.stdId));
      setConfiguring({
        focus,
        loading: false,
        goals: contents.goals,
        interventions: contents.interventions,
        selectedGoalIds: defaultGoals,
        selectedInterIds: defaultInters,
        // fills: { [stdId]: { [slotIdx]: value } } — per-item placeholder fills
        fills: {},
        // Free-edit copy of the focus text (starts as the PCC library text).
        // Nurse can rewrite freely (e.g. type after "r/t dx:" trailing colons).
        focusText: focus.text,
      });
    } catch (e) {
      setError(e.message);
      setConfiguring(null);
    }
  };

  const setItemFills = (stdId, newFills) => {
    setConfiguring((c) => c ? { ...c, fills: { ...c.fills, [stdId]: newFills } } : c);
  };
  const setFocusText = (text) => {
    setConfiguring((c) => c ? { ...c, focusText: text } : c);
  };

  const cancelConfigure = () => setConfiguring(null);

  const toggleGoalSelected = (stdId) => {
    setConfiguring((c) => {
      if (!c) return c;
      const next = new Set(c.selectedGoalIds);
      next.has(stdId) ? next.delete(stdId) : next.add(stdId);
      return { ...c, selectedGoalIds: next };
    });
  };
  const toggleInterSelected = (stdId) => {
    setConfiguring((c) => {
      if (!c) return c;
      const next = new Set(c.selectedInterIds);
      next.has(stdId) ? next.delete(stdId) : next.add(stdId);
      return { ...c, selectedInterIds: next };
    });
  };

  // Commit the configured focus to the queue.
  // Applies any placeholder fills to the goal + intervention text before
  // pushing to the queue. Focus text uses the nurse's free-edited copy.
  const commitConfigure = () => {
    if (!configuring) return;
    const { focus, goals: allGoals, interventions: allInters, selectedGoalIds, selectedInterIds, fills, focusText } = configuring;
    const labelLib = libraries?.find((l) => Number(l.id) === Number(libraryId))?.label || 'Library';
    const labelCat = categories?.find((c) => Number(c.id) === Number(diagcatId))?.label || '';
    // No interventions without a goal — defense in depth; UI also blocks this.
    const goalSet = selectedGoalIds.size > 0 ? selectedGoalIds : new Set();
    const interSet = goalSet.size > 0 ? selectedInterIds : new Set();
    const pickedGoals = allGoals.filter((g) => goalSet.has(g.stdId));
    const pickedInters = allInters.filter((iv) => interSet.has(iv.stdId));

    // Focus text is whatever the nurse left in the textarea (free-edited).
    const filledFocus = (focusText || focus.text || '').trim();
    const filledGoals = pickedGoals.map((g) => ({
      description: _renderFilledText(_parsePlaceholderSegments(g.text), fills?.[g.stdId]),
    }));
    const filledInters = pickedInters.map((iv) => ({
      description: _renderFilledText(_parsePlaceholderSegments(iv.text), fills?.[iv.stdId]),
      instruction: '',
      kardexCategory: 66,
      positions: [9897],
    }));

    onAddPick({
      stdNeedId: focus.stdNeedId,
      label: filledFocus.length > 50 ? filledFocus.slice(0, 47) + '…' : filledFocus,
      focusText: filledFocus,
      reviewDepartments: [9042],
      goals: filledGoals,
      interventions: filledInters,
      _meta: {
        library: labelLib,
        category: labelCat,
        goalsAvailable: allGoals.length,
        interventionsAvailable: allInters.length,
        goalsIncluded: pickedGoals.length,
        interventionsIncluded: pickedInters.length,
      },
    });
    setConfiguring(null);
  };

  // Legacy quick-add — kept for backward compat but no longer wired to the +Add buttons.
  const handlePick = async (focus) => {
    if (pickedIds.has(focus.stdNeedId)) return;
    setAddingId(focus.stdNeedId);
    setError('');
    try {
      const contents = await D.discoverFocusContents(focus.stdNeedId, patientId, careplanId);
      const labelLib = libraries?.find((l) => l.id === libraryId)?.label || 'Library';
      const labelCat = categories?.find((c) => c.id === diagcatId)?.label || '';
      // Trim library imports to a sane subset by default — PCC focuses often
      // ship with 4+ goals and 20+ interventions. Nurse can expand "Customize"
      // to remove/add. We keep the full list available via `_allGoals`/`_allInterventions`
      // so a future "see all" affordance can resurface them.
      const GOAL_DEFAULT_LIMIT = 3;
      const INTER_DEFAULT_LIMIT = 8;

      onAddPick({
        stdNeedId: focus.stdNeedId,
        label: focus.text.length > 50 ? focus.text.slice(0, 47) + '…' : focus.text,
        focusText: focus.text,
        reviewDepartments: [9042], // default Nursing — nurse can edit before stamp
        goals: contents.goals.slice(0, GOAL_DEFAULT_LIMIT).map((g) => ({ description: g.text })),
        interventions: contents.interventions.slice(0, INTER_DEFAULT_LIMIT).map((iv) => ({
          description: iv.text,
          instruction: '',
          // PCC's std interventions don't have Kardex/Position bound until save —
          // use safe defaults; nurse can adjust on expand.
          kardexCategory: 66,  // Safety
          positions: [9897],   // RN
        })),
        _meta: {
          library: labelLib,
          category: labelCat,
          goalsAvailable: contents.goals.length,
          interventionsAvailable: contents.interventions.length,
          goalsIncluded: Math.min(GOAL_DEFAULT_LIMIT, contents.goals.length),
          interventionsIncluded: Math.min(INTER_DEFAULT_LIMIT, contents.interventions.length),
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingId(null);
    }
  };

  // Apply search filter to focuses list (case-insensitive)
  const filteredFocuses = useMemo(() => {
    if (!focuses) return null;
    const q = filterQuery.trim().toLowerCase();
    if (!q) return focuses;
    return focuses.filter((f) => f.text.toLowerCase().includes(q));
  }, [focuses, filterQuery]);

  return (
    <div className="cpas-libbrowser-overlay" onClick={(e) => { if (e.target.classList.contains('cpas-libbrowser-overlay') && !configuring) onClose(); }}>
      <aside className="cpas-libbrowser" role="dialog" aria-modal="true">
      <div className="cpas-libbrowser__header">
        <div className="cpas-libbrowser__header-text">
          Browse PCC Library
          <span className="cpas-libbrowser__subtitle">Add focuses from your facility's library, beyond our auto-picks</span>
        </div>
        {/* NO_TRACK: pure-UI close of library overlay */}
        <button className="cpas-libbrowser__collapse" onClick={onClose} title="Close library" aria-label="Close library">×</button>
      </div>
      {/* Wizard renders as a centered overlay (portal-like) so it gets full breathing room
          instead of being cramped inside the 340px library column. */}
      {configuring && (
        <LibraryConfigure
          state={configuring}
          onToggleGoal={toggleGoalSelected}
          onToggleInter={toggleInterSelected}
          onSetItemFills={setItemFills}
          onSetFocusText={setFocusText}
          onCancel={cancelConfigure}
          onCommit={commitConfigure}
        />
      )}
      <div className="cpas-libbrowser__body">
        {(<>
        <div className="cpas-libbrowser__field">
          <span className="cpas-libbrowser__label">Library</span>
          <Combobox
            value={libraryId ? Number(libraryId) : null}
            labels={Object.fromEntries((libraries || []).map((l) => [l.id, l.label]))}
            options={libraries || []}
            onChange={(v) => setLibraryId(String(v))}
            disabled={loadingState === 'libs' || !libraries}
            ariaLabel="Library"
            placeholder={loadingState === 'libs' ? 'Loading…' : 'Select a library…'}
            triggerClass="cpas-libbrowser__combo"
            fullWidth
          />
        </div>

        {libraryId && (
          <div className="cpas-libbrowser__field">
            <span className="cpas-libbrowser__label">Category</span>
            <Combobox
              value={diagcatId ? Number(diagcatId) : null}
              labels={Object.fromEntries((categories || []).map((c) => [c.id, c.label]))}
              options={categories || []}
              onChange={(v) => setDiagcatId(String(v))}
              disabled={loadingState === 'cats' || !categories}
              ariaLabel="Category"
              placeholder={loadingState === 'cats' ? 'Loading…' : 'Select a category…'}
              triggerClass="cpas-libbrowser__combo"
              fullWidth
            />
          </div>
        )}

        {focuses && (
          <input
            type="search"
            className="cpas-libbrowser__filter"
            placeholder="Filter focuses…"
            value={filterQuery}
            onInput={(e) => setFilterQuery(e.target.value)}
          />
        )}

        {error && <div className="cpas-libbrowser__error">{error}</div>}

        {diagcatId && (
          <ul className="cpas-libbrowser__focuses">
            {loadingState === 'focuses' && <li className="cpas-libbrowser__loading">Loading focuses…</li>}
            {filteredFocuses && filteredFocuses.length === 0 && (
              <li className="cpas-libbrowser__empty">
                {filterQuery ? 'No matches for that filter.' : 'No focuses in this category.'}
              </li>
            )}
            {filteredFocuses?.map((f) => {
              const picked = pickedIds.has(f.stdNeedId);
              const adding = addingId === f.stdNeedId;
              const blank = _detectPlaceholder(f.text);
              return (
                <li key={f.stdNeedId} className={`cpas-libbrowser__focus ${picked ? 'is-picked' : ''} ${blank ? 'has-blank' : ''}`}>
                  <div className="cpas-libbrowser__focus-main">
                    <span className="cpas-libbrowser__focus-text">{f.text}</span>
                    {blank && (
                      <span className="cpas-libbrowser__blank-tag" title={`Needs input: ${blank}`}>needs input</span>
                    )}
                  </div>
                  {/* NO_TRACK: opens the configure-this-focus wizard inline */}
                  <button
                    className="cpas-libbrowser__pick"
                    onClick={() => startConfigure(f)}
                    disabled={picked}
                    title={picked ? 'Already in queue' : 'Configure goals + interventions, then add to queue'}
                  >
                    {picked ? '✓ In queue' : 'Configure →'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!libraryId && !error && (
          <div className="cpas-libbrowser__hint">
            Pick a library, then a category, to see all focuses your facility has authored. Add any to add them alongside the auto-picks.
          </div>
        )}
        </>)}
      </div>
      </aside>
    </div>
  );
};

/**
 * Configure-this-focus wizard — shown inline in the library panel when the
 * nurse clicks "Configure" on a focus. Mirrors PCC's native flow: pick which
 * standard goals + standard interventions to include.
 */
/**
 * Render PCC library text with inline editable fields wherever the text
 * contains a placeholder. fills is { slotIdx → value }; onChange(newFills).
 */
const FillableText = ({ text, fills, onChange, compact }) => {
  const segments = useMemo(() => _parsePlaceholderSegments(text), [text]);
  const setSlot = (slot, value) => onChange({ ...(fills || {}), [slot]: value });

  return (
    <span className="cpas-fill" onClick={(e) => e.stopPropagation()}>
      {segments.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.value}</span>;

        if (s.kind === 'select') {
          const val = fills?.[s.slot] ?? '';
          return (
            <span key={i} className="cpas-fill__select-wrap">
              {s.wrapWithParens && '('}
              {s.prefix && <span className="cpas-fill__prefix">{s.prefix}: </span>}
              <select
                className="cpas-fill__select"
                value={val}
                onChange={(e) => setSlot(s.slot, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">— pick —</option>
                {s.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {s.wrapWithParens && ')'}
            </span>
          );
        }

        // input
        const val = fills?.[s.slot] ?? '';
        return (
          <span key={i} className="cpas-fill__input-wrap">
            {s.wrapWithParens && '('}
            {s.prefix && <span className="cpas-fill__prefix">{s.prefix}: </span>}
            <input
              type="text"
              className={`cpas-fill__input ${val ? 'is-filled' : 'is-empty'}`}
              value={val}
              onInput={(e) => setSlot(s.slot, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={s.placeholder}
              size={Math.max(s.placeholder?.length || 8, val.length + 2, 8)}
              style={{ width: `${Math.max((val.length || s.placeholder?.length || 8) + 2, 6)}ch` }}
            />
            {s.wrapWithParens && ')'}
          </span>
        );
      })}
    </span>
  );
};

const LibraryConfigure = ({ state, onToggleGoal, onToggleInter, onSetItemFills, onSetFocusText, onCancel, onCommit }) => {
  const { focus, loading, goals, interventions, selectedGoalIds, selectedInterIds, fills, focusText } = state;
  const hasGoals = selectedGoalIds.size > 0;
  const effectiveInterCount = hasGoals ? selectedInterIds.size : 0;
  const totalSelected = selectedGoalIds.size + effectiveInterCount;
  const focusBlank = _detectPlaceholder(focusText || '');

  // Select all / none helpers — handy when the nurse wants the full library set
  // or wants to start from a blank slate.
  const setAllGoals = (all) => {
    // We can't reach setConfiguring directly here; we just toggle each delta-row.
    // Caller's onToggleGoal flips one at a time, so we call it for each item whose
    // state needs to change.
    goals.forEach((g) => {
      const has = selectedGoalIds.has(g.stdId);
      if (has !== all) onToggleGoal(g.stdId);
    });
  };
  const setAllInters = (all) => {
    interventions.forEach((iv) => {
      const has = selectedInterIds.has(iv.stdId);
      if (has !== all) onToggleInter(iv.stdId);
    });
  };

  return (
    <div className="cpas-libcfg-overlay" onClick={(e) => { if (e.target.classList.contains('cpas-libcfg-overlay')) onCancel(); }}>
      <div className="cpas-libcfg" role="dialog" aria-modal="true">
        <header className="cpas-libcfg__header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="cpas-libcfg__title">Configure focus from PCC library</p>
            <textarea
              className={`cpas-libcfg__focus-text cpas-libcfg__focus-textarea ${focusBlank ? 'has-blank' : ''}`}
              value={focusText || ''}
              onInput={(e) => onSetFocusText(e.target.value)}
              rows={2}
              placeholder="Focus statement…"
            />
            {focusBlank && (
              <span className="cpas-libcfg__focus-hint">Tip: fill in the blank or trailing colon before adding.</span>
            )}
          </div>
          {/* NO_TRACK: pure-UI close of wizard */}
          <button className="cpas-libcfg__close" onClick={onCancel} aria-label="Close">×</button>
        </header>

        <div className="cpas-libcfg__body">
          {loading && <div className="cpas-libbrowser__loading">Loading standard goals + interventions…</div>}

          {!loading && (
            <>
              <section className="cpas-libcfg__section">
                <div className="cpas-libcfg__section-head">
                  <span className="cpas-libcfg__section-label">Goals · {selectedGoalIds.size} of {goals.length} selected</span>
                  <div className="cpas-libcfg__section-actions">
                    {/* NO_TRACK: pure-UI bulk select */}
                    {/* NO_TRACK: bulk select all/clear, pure UI */}
                    {goals.length > 0 && <button className="cpas-libcfg__bulk" onClick={() => setAllGoals(true)}>Select all</button>}
                    {/* NO_TRACK: bulk clear */}
                    {selectedGoalIds.size > 0 && <button className="cpas-libcfg__bulk" onClick={() => setAllGoals(false)}>Clear</button>}
                  </div>
                </div>
                <ul className="cpas-libcfg__list">
                  {goals.length === 0 && <li className="cpas-libcfg__empty">PCC ships no standard goals for this focus.</li>}
                  {goals.map((g) => {
                    const checked = selectedGoalIds.has(g.stdId);
                    return (
                      <li key={g.stdId} className={`cpas-libcfg__item ${checked ? 'is-on' : ''}`} onClick={() => onToggleGoal(g.stdId)}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleGoal(g.stdId)} onClick={(e) => e.stopPropagation()} />
                        <span className="cpas-libcfg__item-text">
                          <FillableText text={g.text} fills={fills?.[g.stdId]} onChange={(f) => onSetItemFills(g.stdId, f)} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className={`cpas-libcfg__section ${!hasGoals ? 'is-disabled' : ''}`} aria-disabled={!hasGoals}>
                <div className="cpas-libcfg__section-head">
                  <span className="cpas-libcfg__section-label">Interventions · {effectiveInterCount} of {interventions.length} selected</span>
                  <div className="cpas-libcfg__section-actions">
                    {/* NO_TRACK: bulk select all/clear, pure UI */}
                    {hasGoals && interventions.length > 0 && <button className="cpas-libcfg__bulk" onClick={() => setAllInters(true)}>Select all</button>}
                    {/* NO_TRACK: bulk clear */}
                    {hasGoals && selectedInterIds.size > 0 && <button className="cpas-libcfg__bulk" onClick={() => setAllInters(false)}>Clear</button>}
                  </div>
                </div>
                {!hasGoals && (
                  <p className="cpas-libcfg__empty">Pick at least one goal first — interventions support reaching a goal.</p>
                )}
                <ul className="cpas-libcfg__list" style={!hasGoals ? { display: 'none' } : null}>
                  {interventions.length === 0 && <li className="cpas-libcfg__empty">PCC ships no standard interventions for this focus.</li>}
                  {interventions.map((iv) => {
                    const checked = selectedInterIds.has(iv.stdId);
                    return (
                      <li key={iv.stdId} className={`cpas-libcfg__item ${checked ? 'is-on' : ''}`} onClick={() => onToggleInter(iv.stdId)}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleInter(iv.stdId)} onClick={(e) => e.stopPropagation()} />
                        <span className="cpas-libcfg__item-text">
                          <FillableText text={iv.text} fills={fills?.[iv.stdId]} onChange={(f) => onSetItemFills(iv.stdId, f)} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>

        <footer className="cpas-libcfg__footer">
          <span className="cpas-libcfg__footer-summary">
            <b>{totalSelected}</b> {totalSelected === 1 ? 'item' : 'items'} selected
          </span>
          <div className="cpas-libcfg__footer-actions">
            {/* NO_TRACK: pure-UI cancel */}
            <button className="cpas-btn cpas-btn--ghost" onClick={onCancel}>Cancel</button>
            <button
              className="cpas-btn cpas-btn--primary"
              onClick={onCommit}
              disabled={totalSelected === 0}
              data-track="care_plan_autopop_library_focus_added"
            >
              Add to queue
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const FocusDetail = ({ composed, state, rawFocus, onUpdate, readOnly, dropdowns }) => {
  if (!composed) return null;
  const isCodeStatus = rawFocus?.ruleId === 'universal.code_status';
  const isDischargePlanning = rawFocus?.ruleId === 'universal.discharge_planning';
  const hasUnsubstituted = composed.description.includes('___');
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
    // Inherit kardex + positions from the first existing intervention if any,
    // else fall back to Safety (66) + RN (9897) — common nursing defaults.
    const seed = interventions[0] || (rawFocus.interventions || [])[0];
    const seedPositions = _normalizePositions(seed || {});
    onUpdate({
      interventions: [
        ...interventions,
        {
          description: '',
          instruction: '',
          kardexCategory: seed?.kardexCategory ?? 66,
          positions: seedPositions.length > 0 ? seedPositions : [9897],
        },
      ],
    });
  };

  return (
    <section className="cpas-detail">
      <header className="cpas-detail__header">
        <div>
          <span className={`cpas-detail__rule ${rawFocus._isLibrary ? 'is-library' : ''}`}>
            {rawFocus._isLibrary ? 'PCC Library' : _ruleIdToLabel(rawFocus.ruleId)}
          </span>
        </div>
        <div className="cpas-detail__actions">
          {!readOnly && (
            <>
              <button
                className={`cpas-pill ${!state.skipped ? 'is-active' : ''}`}
                onClick={() => onUpdate({ skipped: false })}
              >
                + Include
              </button>
              <button
                className={`cpas-pill ${state.skipped ? 'is-active is-skip' : ''}`}
                onClick={() => onUpdate({ skipped: true })}
              >
                − Skip
              </button>
            </>
          )}
        </div>
      </header>

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
              "{rawFocus.matchedExistingText || '(no text returned)'}"
            </blockquote>
            Matched via keyword check on this rule. Pre-skipped to avoid duplicates — click <b>+ Include</b> above to add anyway.
          </div>
        </div>
      )}

      {/* Focus statement — always inline-editable. Looks like text by default,
          shows edit affordance on hover/focus. Locked when code_status is picked
          since the substitution drives it. */}
      <textarea
        className={`cpas-iv-row__text cpas-iv-row__text--focus ${hasUnsubstituted ? 'has-blank' : ''}`}
        value={composed.description}
        onInput={(e) => onUpdate({ focusText: e.target.value })}
        rows={1}
        disabled={readOnly || (isCodeStatus && !!state.codeStatus) || (isDischargePlanning && !!state.dischargeDestination)}
      />

      {/* Code-status picker always visible (it's required, not optional editing) */}
      {isCodeStatus && !readOnly && (
        <div className="cpas-code-status">
          <label className="cpas-detail__label">Code status</label>
          <div className="cpas-code-status__options">
            {['Full Code', 'DNR-CC', 'DNR-CCA'].map((opt) => (
              <label key={opt} className={`cpas-radio ${state.codeStatus === opt ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="code-status"
                  checked={state.codeStatus === opt}
                  onChange={() => onUpdate({ codeStatus: opt, focusText: null })}
                />
                {opt}
              </label>
            ))}
          </div>
          <p className="cpas-code-status__hint">
            This documents the advance directive on the care plan only. To change the
            resident's actual code status, update their chart separately.
          </p>
        </div>
      )}

      {/* Discharge-destination picker — same shape as code status */}
      {isDischargePlanning && !readOnly && (
        <div className="cpas-code-status">
          <label className="cpas-detail__label">Anticipated discharge destination</label>
          <div className="cpas-code-status__options">
            {['Undetermined', 'Home', 'Home with home health', 'Assisted living', 'Long-term care', 'Hospice', 'SNF transfer'].map((opt) => (
              <label key={opt} className={`cpas-radio ${state.dischargeDestination === opt ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="discharge-destination"
                  checked={state.dischargeDestination === opt}
                  onChange={() => onUpdate({ dischargeDestination: opt, focusText: null })}
                />
                {opt}
              </label>
            ))}
          </div>
          <p className="cpas-code-status__hint">
            Best current estimate. Update during stay as the plan firms up.
          </p>
        </div>
      )}

      {/* Goals — always inline-editable */}
      <h3 className="cpas-detail__section">Goals ({goals.length})</h3>
          <ul className="cpas-detail__list cpas-detail__list--editable">
            {goals.map((g, i) => {
              const blank = _detectPlaceholder(g.description);
              return (
                <li key={i} className="cpas-iv-row cpas-iv-row--goal">
                  <div className="cpas-iv-row__body">
                    <div className="cpas-iv-row__text-wrap">
                      <textarea
                        className="cpas-iv-row__text"
                        value={g.description}
                        onInput={(e) => editGoal(i, e.target.value)}
                        rows={1}
                        disabled={readOnly}
                        placeholder="Goal text…"
                      />
                      {blank && (
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
              return (
                <li key={i} className="cpas-iv-row">
                  <div className="cpas-iv-row__body">
                    <div className="cpas-iv-row__text-wrap">
                      <textarea
                        className="cpas-iv-row__text"
                        value={iv.description}
                        onInput={(e) => editIntervention(i, { description: e.target.value })}
                        rows={1}
                        disabled={readOnly}
                        placeholder="Intervention text…"
                      />
                      {blank && (
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
                      />
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

/**
 * Searchable combobox — replaces native <select> for long lists.
 * Trigger: a chip-style button showing the current value.
 * Popover: search input + filtered list. ESC closes, arrows navigate, enter picks.
 */
const Combobox = ({ value, labels, options, onChange, disabled, variant, ariaLabel, triggerClass, placeholder, fullWidth }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const label = (value != null && labels[value]) ? labels[value] : (value != null ? `(${value})` : (placeholder || 'Select…'));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options || [];
    if (!q) return list;
    return list.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    // Focus the search input next tick
    requestAnimationFrame(() => inputRef.current?.focus());
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const choose = (opt) => {
    onChange(Number(opt.id));
    setOpen(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) choose(filtered[activeIdx]); return; }
  };

  return (
    <span className={`cpas-combobox ${variant ? `cpas-combobox--${variant}` : ''} ${fullWidth ? 'is-full' : ''}`} ref={rootRef}>
      {/* NO_TRACK: pure-UI open of combobox popover */}
      <button
        type="button"
        className={triggerClass || 'cpas-combobox__trigger'}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {variant === 'pos' && <span className="cpas-chip__icon" aria-hidden="true">●</span>}
        <span className="cpas-combobox__label">{label}</span>
        <span className="cpas-combobox__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cpas-combobox__popover" role="listbox">
          <input
            ref={inputRef}
            type="text"
            className="cpas-combobox__search"
            placeholder="Search…"
            value={query}
            onInput={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKey}
          />
          <ul className="cpas-combobox__list">
            {filtered.length === 0 && <li className="cpas-combobox__empty">No matches.</li>}
            {filtered.map((o, i) => (
              <li
                key={o.id}
                className={`cpas-combobox__option ${i === activeIdx ? 'is-active' : ''} ${Number(o.id) === Number(value) ? 'is-selected' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => choose(o)}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
};

/**
 * Kardex chip — combobox styled as an indigo pill.
 */
const ChipSelect = ({ value, labels, options, onChange, disabled, variant }) => (
  <Combobox
    value={value}
    labels={labels}
    options={options}
    onChange={onChange}
    disabled={disabled}
    variant={variant === 'kardex' ? 'kardex' : variant}
    ariaLabel={variant === 'kardex' ? 'Kardex category' : 'Select'}
    triggerClass={`cpas-chip cpas-chip--${variant || 'default'}`}
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

const ProgressBar = ({ progress, total }) => {
  const pct = progress ? Math.round(((progress.focusIndex ?? 0) / Math.max(total, 1)) * 100) : 0;
  let label = 'Starting…';
  if (progress?.phase === 'focus') label = `Adding focus ${progress.focusIndex + 1} of ${progress.focusTotal}…`;
  else if (progress?.phase === 'goal') label = `Adding goal ${(progress.subIndex ?? 0) + 1}/${progress.subTotal}…`;
  else if (progress?.phase === 'intervention') label = `Adding intervention ${(progress.subIndex ?? 0) + 1}/${progress.subTotal}…`;

  return (
    <div className="cpas-progress">
      <div className="cpas-progress__bar">
        <div className="cpas-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="cpas-progress__label">{label}</div>
    </div>
  );
};

const DoneFooter = ({ result, onClose }) => (
  <div className="cpas-done">
    <div className="cpas-done__summary">
      {result.ok ? '✓ Added' : '⚠ Partial'} · {result.focusesStamped} focuses, {result.goalsStamped} goals, {result.interventionsStamped} interventions
      {result.errors.length > 0 && ` (${result.errors.length} ${result.errors.length === 1 ? 'error' : 'errors'})`}
    </div>
    <button
      className="cpas-btn cpas-btn--primary"
      onClick={onClose}
      data-track="care_plan_autopop_view_care_plan_clicked"
    >
      View care plan
    </button>
  </div>
);

/**
 * Read positions[] from an intervention, falling back to legacy positionOne.
 * Always returns an array (possibly empty).
 */
function _normalizePositions(iv) {
  if (Array.isArray(iv.positions) && iv.positions.length > 0) return iv.positions;
  if (iv.positionOne != null) return [iv.positionOne];
  return [];
}

/**
 * Parse PCC library text into segments — interleaved string text and
 * placeholder slots that the nurse needs to fill. Supported patterns:
 *   (SPECIFY: choice1, choice2, choice3)  → select dropdown
 *   (Specify: free description)           → text input
 *   (Specify #)                           → number input
 *   ___ (3+ underscores)                  → text input
 *   trailing r/t | due to: | as evidenced by: | exhibited by: → trailing input
 *
 * Returns: [{ kind: 'text', value }, { kind: 'input'|'select'|'number', ...meta }, ...]
 */
function _parsePlaceholderSegments(text) {
  if (!text) return [{ kind: 'text', value: '' }];
  const segments = [];
  // Combined regex — order matters; longer patterns first.
  const re = /\((?:SPECIFY|Specify)\s*[:#]?\s*([^)]*)\)|_{3,}|(r\/t|due to:|as evidenced by:|exhibited by:|related to:)\s*$/g;
  let last = 0;
  let m;
  let slotIdx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) });

    const matched = m[0];
    if (matched.startsWith('_')) {
      segments.push({ kind: 'input', slot: slotIdx++, placeholder: 'fill in', original: matched });
    } else if (matched.startsWith('(')) {
      const content = (m[1] || '').trim();
      if (content === '#' || /^#/.test(content)) {
        segments.push({ kind: 'input', slot: slotIdx++, placeholder: '#', original: matched, wrapWithParens: true, prefix: '#' });
      } else if (content.includes(',')) {
        const opts = content.split(',').map((s) => s.trim()).filter(Boolean);
        segments.push({ kind: 'select', slot: slotIdx++, options: opts, original: matched, wrapWithParens: true, prefix: matched.match(/SPECIFY/i)?.[0] || 'Specify' });
      } else {
        segments.push({ kind: 'input', slot: slotIdx++, placeholder: content || 'specify', original: matched, wrapWithParens: true, prefix: matched.match(/SPECIFY/i)?.[0] || 'Specify' });
      }
    } else {
      // Trailing connector — keep the marker as text, then add an input after
      segments.push({ kind: 'text', value: matched.trim() + ' ' });
      segments.push({ kind: 'input', slot: slotIdx++, placeholder: 'fill in', trailing: true });
    }
    last = m.index + matched.length;
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
  if (segments.length === 0) segments.push({ kind: 'text', value: text });
  return segments;
}

/**
 * Reassemble text from segments using a fills map (slot → value).
 * If a slot has no fill, render its original placeholder text back in.
 */
function _renderFilledText(segments, fills) {
  return segments.map((s) => {
    if (s.kind === 'text') return s.value;
    const v = fills?.[s.slot];
    if (v != null && v !== '') {
      if (s.wrapWithParens && s.prefix) return `(${s.prefix}: ${v})`;
      return v;
    }
    // Empty — fall back to the original token (e.g. "(SPECIFY: ...)") or '___'
    return s.original || '___';
  }).join('');
}

/**
 * Detect "needs nurse input" patterns common in PCC's library text.
 * Returns the matched pattern label for tooltip use, or null if none.
 */
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
