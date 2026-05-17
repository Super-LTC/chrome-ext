import { h } from 'preact';
import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks';
import { ScopeToggle } from './components/ScopeToggle.jsx';
import { FocusCard } from './components/FocusCard.jsx';
import { AuditFocusList } from './components/AuditFocusList.jsx';
import { AddBucketPane } from './components/AddBucketPane.jsx';
import { RemoveBucketPane } from './components/RemoveBucketPane.jsx';
import { VerifyBucketPane } from './components/VerifyBucketPane.jsx';

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
 *     focusText: string | null,           // null = use original.description (legacy textarea fallback)
 *     goals: ProposedGoal[] | null,       // null = use original.goals
 *     interventions: ProposedIntervention[] | null,
 *     tokenValues: { [tokenKey]: string },// inline picker/free-text selections
 *   }
 * `null` means "no edits, use original". This keeps originals immutable.
 * Token substitution flows generically through `tokenValues` keyed by the
 * backend's `tokenKey` (e.g. `code_status`, `discharge_destination`).
 */

export const CarePlanStampModal = ({ patientId, patientName, facilityName, orgSlug, defaultMode, onClose }) => {
  const [stage, setStage] = useState('loading'); // loading | ready | drift | stamping | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [driftMissing, setDriftMissing] = useState([]);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [mode, setMode] = useState(defaultMode === 'comprehensive' ? 'comprehensive' : 'initial');
  const [audit, setAudit] = useState(null);
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

  // Persistent skips from prior sessions — backend filters these out of
  // `focuses` and returns them here. Rendered in the "Previously skipped"
  // fold; nurse can un-skip to pull them back into the active list.
  const [skippedFocuses, setSkippedFocuses] = useState([]);

  // -------- Comprehensive-mode interaction state --------
  // Keyed off the canonical (unfiltered) audit indices so filtered re-orderings
  // don't lose per-item edits.
  const [auditSelected, setAuditSelected] = useState({ bucket: 'add', idx: 0 });
  const [auditFocusStates, setAuditFocusStates] = useState({});     // { [`add:${idx}`]: focusState }
  const [resolveStatus, setResolveStatus] = useState({});           // { [focusId]: 'pending'|'done'|'error' }
  const [resolveError, setResolveError] = useState({});             // { [focusId]: string }
  const [verifyLocal, setVerifyLocal] = useState({});               // { [idx]: 'verified'|'kept' }
  const [stampedAddIds, setStampedAddIds] = useState(new Set());    // ruleIds already stamped
  const [skippedAddIds, setSkippedAddIds] = useState(new Set());    // ruleIds locally skipped

  // -------- Load proposal + PCC context in parallel --------
  useEffect(() => {
    let cancelled = false;
    // Reset on mode flip so the UI doesn't show stale data from the other scope.
    setStage('loading');
    setAudit(null);
    setProposal(null);
    setErrorMsg('');
    setAuditSelected({ bucket: 'add', idx: 0 });
    setAuditFocusStates({});
    setResolveStatus({});
    setResolveError({});
    setVerifyLocal({});
    setStampedAddIds(new Set());
    setSkippedAddIds(new Set());
    (async () => {
      try {
        const D = window.CarePlanStampDiscover;
        const A = window.CarePlanStampAPI;

        // Walk EVERY page of the patient's care plan first so the backend's
        // idempotency match sees the full picture, not just the page the user
        // happened to be looking at when they hit Auto-Pop. Without this we
        // mis-flag focuses as "missing" whenever they live on page 2+.
        const fullPlan = await D.scrapeFullCarePlan(patientId);
        if (cancelled) return;
        const cpId = fullPlan.careplanId;
        if (!cpId) throw new Error('Could not find ESOLcareplanid on careplandetail page');

        // Scrape this facility's dropdown labels BEFORE firing the proposal so
        // the backend can resolve canonical role/category names against the
        // org's actual PCC IDs. Without this, customized facilities trip the
        // drift validator with 50+ unknown-ID errors.
        const [dd, token] = await Promise.all([
          D.scrapeOrgDropdowns(patientId, cpId),
          D.discoverMiniToken(patientId, cpId),
        ]);
        if (cancelled) return;
        setDropdowns(dd);

        const orgDropdowns = {
          positions: dd.positionLabels || {},
          kardex: dd.kardexLabels || {},
          reviewDepts: dd.reviewDeptLabels || {},
        };

        // One-shot diagnostic dump — lets backend agent verify the canonical
        // resolver's synonyms match real facility labels. No PHI: just role
        // names ("RN", "Activities"), category names ("Safety", "Skin").
        // Copy from DevTools console and paste back. Safe to leave in;
        // single log per modal-open is cheap.
        console.log('[CarePlanAutoPop] Org dropdowns (facility=' + (facilityName || '?') + '):', {
          positions: Object.values(orgDropdowns.positions),
          kardex: Object.values(orgDropdowns.kardex),
          reviewDepts: Object.values(orgDropdowns.reviewDepts),
          counts: {
            positions: Object.keys(orgDropdowns.positions).length,
            kardex: Object.keys(orgDropdowns.kardex).length,
            reviewDepts: Object.keys(orgDropdowns.reviewDepts).length,
          },
        });

        if (mode === 'comprehensive') {
          // Comprehensive Review path — full audit of the existing plan.
          const auditResp = await window.CarePlanAuditAPI.fetchAudit({
            patientId,
            facilityName,
            orgSlug,
            patientName,
            orgDropdowns,
          });
          if (cancelled) return;
          setCareplanId(cpId);
          setMiniToken(token);
          setAudit(auditResp.audit);
          const a = auditResp.audit;
          const firstBucket = (a.toAdd?.length ? 'add' : a.toCheck?.length ? 'verify' : a.toRemove?.length ? 'remove' : 'add');
          setAuditSelected({ bucket: firstBucket, idx: 0 });
          setStage('ready');
          return;
        }

        // -------- Initial Admit path (unchanged below) --------
        const prop = await A.fetchProposal({
          patientId,
          facilityName,
          orgSlug,
          scope: 'initial',
          existingFocusTexts: fullPlan.focusTexts,
          orgDropdowns,
        });
        if (cancelled) return;

        const validation = D.validateProposalIds(prop, dd);
        if (!validation.ok) {
          setDriftMissing(validation.missing);
          setStage('drift');
          return;
        }

        // Surface any canonicals the backend couldn't resolve against this
        // facility's dropdowns. Affected interventions stamp without the
        // missing field (per backend contract) — log so we can spot the
        // pattern at new facilities, future-PR a nurse-facing warning.
        const unresolved = prop?._diagnostics?.unresolvedCanonicals;
        if (Array.isArray(unresolved) && unresolved.length > 0) {
          console.warn('[CarePlanAutoPop] Unresolved canonicals (some fields will stamp without them):', unresolved);
        }

        setProposal(prop);
        setSkippedFocuses(Array.isArray(prop.skippedFocuses) ? prop.skippedFocuses : []);
        setCareplanId(cpId);
        setMiniToken(token);
        setFocusStates((prop.focuses || []).map((f) => ({
          // Pre-skip if backend marked this focus as already-on-plan.
          // Nurse can override by clicking Include.
          skipped: !!f.alreadyOnPlan,
          focusText: null,
          goals: null,
          interventions: null,
          // tokenKey → string. Empty until nurse picks/types. Drives the
          // inline picker chips + free-text inputs in the segment renderer.
          // Unfilled tokens leave their placeholder visible ("___" /
          // "[select …]") so the sidebar "needs input" badge surfaces them.
          tokenValues: {},
          // Segment indices the nurse has dismissed via the × on a factor
          // sparkle. Stored as a Set; _renderSegmentsWithTokens skips these
          // and cleans up the adjacent comma so the stamped text is clean.
          removedFactors: new Set(),
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
  }, [patientId, facilityName, orgSlug, mode]);

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
      { skipped: false, focusText: null, goals: null, interventions: null, tokenValues: {}, removedFactors: new Set(), expanded: false },
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

  // Toggle a focus's skip flag AND persist the decision so it survives a
  // wizard close + re-open. Library picks aren't rule-driven, so skip
  // persistence is a no-op for them (the backend keys on ruleId).
  const toggleFocusSkip = useCallback((idx) => {
    const focus = allRawFocuses[idx];
    const cur = focusStates[idx];
    if (!focus || !cur) return;
    const nextSkipped = !cur.skipped;
    patchFocus(idx, { skipped: nextSkipped });
    if (!focus._isLibrary && focus.ruleId) {
      // Fire-and-forget: local state already reflects intent.
      window.CarePlanStampAPI?.persistSkip?.({
        patientId,
        orgSlug,
        facilityName,
        ruleId: focus.ruleId,
        isSkipping: nextSkipped,
      });
    }
  }, [allRawFocuses, focusStates, patchFocus, patientId, orgSlug, facilityName]);

  // Un-skip a focus from the "Previously skipped" fold: move it back into
  // the active proposal list with a fresh state, and DELETE the persisted
  // skip row. Inserts at the end of the auto-picks block so library picks
  // stay last (matches allRawFocuses ordering).
  const unSkipFocus = useCallback((focus) => {
    if (!focus?.ruleId) return;
    const insertAt = proposal?.focuses?.length || 0;
    setProposal((prev) => ({
      ...prev,
      focuses: [...(prev?.focuses || []), focus],
    }));
    setFocusStates((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, {
        skipped: false,
        focusText: null,
        goals: null,
        interventions: null,
        tokenValues: {},
        removedFactors: new Set(),
        expanded: false,
      });
      return next;
    });
    setSkippedFocuses((prev) => prev.filter((f) => f.ruleId !== focus.ruleId));
    window.CarePlanStampAPI?.persistSkip?.({
      patientId,
      orgSlug,
      facilityName,
      ruleId: focus.ruleId,
      isSkipping: false,
    });
  }, [proposal, patientId, orgSlug, facilityName]);

  const includedCount = focusStates.filter((s) => !s.skipped).length;

  // Count of included focuses still missing required input. Disables the
  // sidebar Add-all button so the nurse can't submit an unfilled slot.
  // For segment-bearing focuses, "unfilled" = any token segment with
  // needsFilling=true that lacks a tokenValues entry. For older proposals
  // without descriptionSegments (and for library picks), fall back to the
  // flat-string `___` heuristic.
  const needsInputCount = allRawFocuses.reduce((n, f, i) => {
    const st = focusStates[i];
    if (!st || st.skipped) return n;
    const hasUnfilledToken = _focusUnfilledTokenKeys(f, st.tokenValues).length > 0;
    const desc = composedFocuses?.[i]?.description || f.description || '';
    const flatHasBlank = !_hasSegments(f.descriptionSegments) && _detectPlaceholder(desc);
    return (hasUnfilledToken || flatHasBlank) ? n + 1 : n;
  }, 0);

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

    // Sanity: if any focus still has '___' (any unfilled slot), bail.
    const unsubbed = toStamp.focuses.find((f) => f.description.includes('___'));
    if (unsubbed) {
      setErrorMsg('Please fill in any blank slots before adding.');
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

  // -------- Comprehensive-mode derived data + handlers --------
  const displayAudit = useMemo(() => {
    if (!audit) return null;
    return {
      ...audit,
      toAdd: (audit.toAdd || []).filter((it) => !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)),
      toRemove: (audit.toRemove || []).filter((it) => resolveStatus[it.focusId] !== 'done'),
      toCheck: audit.toCheck || [],
    };
  }, [audit, stampedAddIds, skippedAddIds, resolveStatus]);

  const _patchAuditFocusState = useCallback((bucket, idx, patch) => {
    const key = `${bucket}:${idx}`;
    setAuditFocusStates((prev) => ({
      ...prev,
      [key]: { ..._emptyFocusState(), ...(prev[key] || {}), ...patch },
    }));
  }, []);

  const _advanceAuditSelection = useCallback((nextAudit, fromBucket, fromIdx) => {
    const order = ['add', 'verify', 'remove'];
    const sameBucketList = (
      fromBucket === 'add' ? nextAudit.toAdd :
      fromBucket === 'verify' ? nextAudit.toCheck :
      nextAudit.toRemove
    ) || [];
    if (fromIdx < sameBucketList.length) {
      setAuditSelected({ bucket: fromBucket, idx: Math.min(fromIdx, sameBucketList.length - 1) });
      return;
    }
    for (const b of order) {
      const list = b === 'add' ? nextAudit.toAdd : b === 'verify' ? nextAudit.toCheck : nextAudit.toRemove;
      if ((list || []).length > 0) {
        setAuditSelected({ bucket: b, idx: 0 });
        return;
      }
    }
    setAuditSelected({ bucket: fromBucket, idx: 0 });
  }, []);

  const _stampAuditAddItem = useCallback(async (idx) => {
    if (!audit || !careplanId || !miniToken) return;
    const item = audit.toAdd?.[idx];
    if (!item?.focus) return;

    const key = `add:${idx}`;
    const state = auditFocusStates[key] || _emptyFocusState();
    const composed = _composeFocus(item.focus, state);

    if (composed.description.includes('___')) {
      setErrorMsg('Please fill in any blank slots before stamping.');
      return;
    }

    setStage('stamping');
    setProgress({ phase: 'starting', focusIndex: 0, focusTotal: 1 });
    try {
      const result = await window.CarePlanStampClient.orchestrateStamp({
        proposal: { patientId, focuses: [composed] },
        careplanId,
        miniToken,
        onProgress: (p) => setProgress(p),
      });
      setStampedAddIds((prev) => {
        const next = new Set(prev);
        next.add(item.ruleId);
        return next;
      });
      setStage('ready');
      window.SuperAnalytics?.track?.('care_plan_audit_item_stamped', {
        patient_id: patientId,
        rule_id: item.ruleId,
        n_goals: result?.goalsStamped ?? 0,
        n_interventions: result?.interventionsStamped ?? 0,
      });
      const nextAudit = {
        ...audit,
        toAdd: (audit.toAdd || []).filter((it, i) => i !== idx && !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)),
        toCheck: audit.toCheck || [],
        toRemove: (audit.toRemove || []).filter((it) => resolveStatus[it.focusId] !== 'done'),
      };
      _advanceAuditSelection(nextAudit, 'add', idx);
    } catch (e) {
      setErrorMsg(e.message || 'Stamp failed');
      setStage('ready');
    }
  }, [audit, careplanId, miniToken, patientId, auditFocusStates, stampedAddIds, skippedAddIds, resolveStatus, _advanceAuditSelection]);

  const _skipAuditAddItem = useCallback(async (idx) => {
    const item = audit?.toAdd?.[idx];
    if (!item) return;
    setSkippedAddIds((prev) => {
      const next = new Set(prev);
      next.add(item.ruleId);
      return next;
    });
    try {
      await window.CarePlanStampAPI.persistSkip({
        patientId, orgSlug, facilityName,
        ruleId: item.ruleId,
        isSkipping: true,
      });
    } catch (_) { /* persistSkip already logs */ }
    window.SuperAnalytics?.track?.('care_plan_audit_item_skipped', {
      patient_id: patientId,
      rule_id: item.ruleId,
    });
    const nextAudit = {
      ...audit,
      toAdd: (audit.toAdd || []).filter((it, i) => i !== idx && !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)),
      toCheck: audit.toCheck || [],
      toRemove: (audit.toRemove || []).filter((it) => resolveStatus[it.focusId] !== 'done'),
    };
    _advanceAuditSelection(nextAudit, 'add', idx);
  }, [audit, patientId, orgSlug, facilityName, stampedAddIds, skippedAddIds, resolveStatus, _advanceAuditSelection]);

  const _resolveAuditItem = useCallback(async (item, fromBucket, fromIdx) => {
    if (!item?.pccFocusId || !careplanId) {
      setResolveStatus((prev) => ({ ...prev, [item.focusId]: 'error' }));
      setResolveError((prev) => ({ ...prev, [item.focusId]: 'Missing PCC focus ID' }));
      return;
    }
    setResolveStatus((prev) => ({ ...prev, [item.focusId]: 'pending' }));
    try {
      await window.CarePlanResolveAPI.resolveFocus({
        patientId, careplanId,
        pccFocusId: item.pccFocusId,
        pccFocusStdItemId: item.pccFocusStdItemId,
        miniToken,
      });
      setResolveStatus((prev) => ({ ...prev, [item.focusId]: 'done' }));
      window.SuperAnalytics?.track?.('care_plan_audit_item_resolved', {
        patient_id: patientId,
        focus_id: item.focusId,
        from_bucket: fromBucket,
      });
      if (fromBucket === 'remove') {
        const nextAudit = {
          ...audit,
          toRemove: (audit.toRemove || []).filter((it) => it.focusId !== item.focusId),
          toAdd: (audit.toAdd || []).filter((it) => !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)),
          toCheck: audit.toCheck || [],
        };
        _advanceAuditSelection(nextAudit, 'remove', fromIdx);
      }
    } catch (e) {
      setResolveStatus((prev) => ({ ...prev, [item.focusId]: 'error' }));
      setResolveError((prev) => ({ ...prev, [item.focusId]: e.message || 'Resolve failed' }));
    }
  }, [audit, patientId, careplanId, miniToken, stampedAddIds, skippedAddIds, _advanceAuditSelection]);

  const _verifyAuditItem = useCallback((idx, decision) => {
    setVerifyLocal((prev) => ({ ...prev, [idx]: decision }));
    const item = audit?.toCheck?.[idx];
    if (!item) return;
    window.SuperAnalytics?.track?.('care_plan_audit_item_verified', {
      patient_id: patientId,
      focus_id: item.focusId,
      kind: item.kind,
      decision,
    });
  }, [audit, patientId]);

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
            <ScopeToggle
              mode={mode}
              onChange={setMode}
              disabled={stage === 'stamping'}
            />
            {stage === 'ready' && mode === 'initial' && (
              // NO_TRACK: pure-UI open of library overlay
              <button
                className="cpas-modal__library-btn"
                onClick={() => setLibraryPanelOpen(true)}
                title="Browse focuses from your facility's PCC library"
              >
                + Add from PCC Library
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
          {mode === 'initial' && (stage === 'ready' || stage === 'stamping' || stage === 'done') && proposal && (
            <div className="cpas-modal__columns">
              <FocusList
                rawFocuses={allRawFocuses}
                composedFocuses={composedFocuses}
                focusStates={focusStates}
                activeIdx={activeIdx}
                onSelect={setActiveIdx}
                progress={progress}
                onRemoveLibraryPick={removeLibraryPick}
                onStamp={stage === 'ready' ? handleStamp : null}
                stampDisabled={includedCount === 0 || needsInputCount > 0}
                needsInputCount={needsInputCount}
                skippedFocuses={skippedFocuses}
                onUnSkip={stage === 'ready' ? unSkipFocus : null}
              />
              <FocusCard
                composed={composedFocuses[activeIdx]}
                state={focusStates[activeIdx]}
                rawFocus={allRawFocuses[activeIdx]}
                onUpdate={(patch) => patchFocus(activeIdx, patch)}
                onToggleSkip={() => toggleFocusSkip(activeIdx)}
                readOnly={stage !== 'ready'}
                dropdowns={dropdowns}
              />
            </div>
          )}
          {mode === 'comprehensive' && (stage === 'ready' || stage === 'stamping') && audit && displayAudit && (
            <div className="cpas-modal__columns">
              <AuditFocusList
                audit={displayAudit}
                selected={auditSelected}
                onSelect={setAuditSelected}
                stamping={stage === 'stamping'}
                resolveStatus={resolveStatus}
              />
              {auditSelected.bucket === 'add' && displayAudit.toAdd[auditSelected.idx] && (() => {
                const item = displayAudit.toAdd[auditSelected.idx];
                const realIdx = audit.toAdd.findIndex((it) => it.ruleId === item.ruleId);
                const key = `add:${realIdx}`;
                const focusState = auditFocusStates[key] || _emptyFocusState();
                return (
                  <AddBucketPane
                    item={item}
                    focusState={focusState}
                    onPatch={(patch) => _patchAuditFocusState('add', realIdx, patch)}
                    onStamp={() => _stampAuditAddItem(realIdx)}
                    onSkip={() => _skipAuditAddItem(realIdx)}
                    stamping={stage === 'stamping'}
                    dropdowns={dropdowns}
                  />
                );
              })()}
              {auditSelected.bucket === 'remove' && displayAudit.toRemove[auditSelected.idx] && (() => {
                const item = displayAudit.toRemove[auditSelected.idx];
                return (
                  <RemoveBucketPane
                    item={item}
                    onResolve={() => _resolveAuditItem(item, 'remove', auditSelected.idx)}
                    status={resolveStatus[item.focusId]}
                    errorMessage={resolveError[item.focusId]}
                  />
                );
              })()}
              {auditSelected.bucket === 'verify' && displayAudit.toCheck[auditSelected.idx] && (() => {
                const item = displayAudit.toCheck[auditSelected.idx];
                const idx = auditSelected.idx;
                return (
                  <VerifyBucketPane
                    item={item}
                    localState={verifyLocal[idx]}
                    onMarkVerified={() => _verifyAuditItem(idx, 'verified')}
                    onKeep={() => _verifyAuditItem(idx, 'kept')}
                    onResolve={() => _resolveAuditItem(item, 'verify', idx)}
                    resolveStatus={resolveStatus[item.focusId]}
                  />
                );
              })()}
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
          <footer className="cpas-modal__footer cpas-modal__footer--minimal">
            {/* Primary commit lives in the sidebar (spatially bound to the
                focus list). Footer keeps just a quiet cancel. */}
            {/* NO_TRACK: pure-UI cancel */}
            <button className="cpas-btn cpas-btn--ghost" onClick={onClose}>Cancel</button>
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
 *
 * Substitution model (round-4): when `descriptionSegments` is present, tokens
 * (picker or free-text, identified by tokenKey) are filled from
 * `state.tokenValues` and the flat string is rebuilt segment-keyed. The old
 * ruleId-specific special-casing for code_status / discharge_planning is gone —
 * those keys flow through the generic path via tokenKeys `code_status` and
 * `discharge_destination` as the backend emits them.
 *
 * `state.focusText` (manual edit of the focus statement) still wins when set,
 * but the round-4 UI no longer exposes a textarea for it — kept here only for
 * BC with proposals that lack `descriptionSegments`.
 */
function _emptyFocusState() {
  return {
    skipped: false,
    focusText: null,
    goals: null,
    interventions: null,
    tokenValues: {},
    removedFactors: new Set(),
    expanded: false,
  };
}

function _composeFocus(original, state) {
  const tokenValues = state.tokenValues || {};
  const removedFactors = state.removedFactors || null;

  let baseDesc;
  if (state.focusText != null) {
    baseDesc = state.focusText;
  } else if (_hasSegments(original.descriptionSegments)) {
    baseDesc = _renderSegmentsWithTokens(original.descriptionSegments, tokenValues, removedFactors);
  } else {
    baseDesc = original.description;
  }

  // Goals: substitute when nurse hasn't done a full replace.
  let goals;
  if (state.goals != null) {
    goals = state.goals;
  } else {
    goals = (original.goals || []).map((g) =>
      _segmentsHaveAnyToken(g.descriptionSegments)
        ? { ...g, description: _renderSegmentsWithTokens(g.descriptionSegments, tokenValues) }
        : g
    );
  }

  // Interventions: same pattern.
  let interventions;
  if (state.interventions != null) {
    interventions = state.interventions;
  } else {
    interventions = (original.interventions || []).map((iv) =>
      _segmentsHaveAnyToken(iv.descriptionSegments)
        ? { ...iv, description: _renderSegmentsWithTokens(iv.descriptionSegments, tokenValues) }
        : iv
    );
  }

  // Defense in depth: a focus with 0 goals has no business carrying interventions.
  const safeInterventions = (Array.isArray(goals) && goals.length === 0) ? [] : interventions;
  return {
    ...original,
    description: baseDesc,
    goals,
    interventions: safeInterventions,
  };
}

function _hasSegments(segments) {
  return Array.isArray(segments) && segments.length > 0;
}
function _segmentsHaveAnyToken(segments) {
  return Array.isArray(segments) && segments.some((s) => s && s.kind === 'token');
}
// Segment-keyed reassembly: a token's slot is replaced by the typed/picked
// value when one exists. Unfilled tokens render their segment.value (typically
// `___` for free-text or `[select …]` for picker), preserving the visible
// "needs input" state in the flat description string used at stamp time.
//
// `removedFactors` is a Set of segment indices the nurse has dismissed. We
// skip the factor AND clean up the adjacent comma/conjunction so the stamped
// text reads naturally (e.g. removing "weakness" from "r/t weakness, gait
// problems" yields "r/t gait problems", not "r/t , gait problems").
function _renderSegmentsWithTokens(segments, tokenValues, removedFactors) {
  const arr = segments || [];
  const removed = removedFactors instanceof Set
    ? removedFactors
    : new Set(removedFactors || []);
  const pieces = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (!s) continue;
    if (s.kind === 'factor' && removed.has(i)) {
      // Prefer consuming a leading ", " / " and " from the *next* text segment
      // (typical mid-list removal). If no leading separator, strip a trailing
      // one from the last emitted piece (end-of-list removal).
      const next = arr[i + 1];
      if (next && next.kind === 'text') {
        const stripped = (next.value || '').replace(/^(\s*,\s*|\s+and\s+)/, '');
        if (stripped !== (next.value || '')) {
          pieces.push(stripped);
          i++; // consumed next
          continue;
        }
      }
      const lastIdx = pieces.length - 1;
      if (lastIdx >= 0) {
        pieces[lastIdx] = pieces[lastIdx].replace(/(\s*,\s*|\s+and\s+)$/, '');
      }
      continue;
    }
    if (s.kind === 'token') {
      const v = tokenValues?.[s.tokenKey];
      if (v && String(v).trim()) { pieces.push(String(v).trim()); continue; }
      if (!s.needsFilling) { pieces.push(s.value || ''); continue; }
      pieces.push(s.value || '___');
      continue;
    }
    pieces.push(s.value || '');
  }
  return pieces.join('');
}
// Unique tokenKeys still needing input across focus/goals/interventions.
function _focusUnfilledTokenKeys(focus, tokenValues) {
  if (!focus) return [];
  const tv = tokenValues || {};
  const keys = new Set();
  const walk = (segs) => {
    for (const s of segs || []) {
      if (s && s.kind === 'token' && s.needsFilling) {
        const v = tv[s.tokenKey];
        if (!v || !String(v).trim()) keys.add(s.tokenKey);
      }
    }
  };
  walk(focus.descriptionSegments);
  (focus.goals || []).forEach((g) => walk(g.descriptionSegments));
  (focus.interventions || []).forEach((iv) => walk(iv.descriptionSegments));
  return [...keys];
}
// JSX tooltip content for a factor segment. Bolds the dxCode / orderPattern /
// derivedFrom values so the relevant signal pops in a quick hover.
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

const FocusList = ({ rawFocuses, composedFocuses, focusStates, activeIdx, onSelect, progress, onRemoveLibraryPick, onStamp, stampDisabled, needsInputCount, skippedFocuses, onUnSkip }) => {
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
        {rawFocuses
          // Stable sort into three buckets:
          //   0. To-add, needs input (act first)
          //   1. To-add, ready
          //   2. Skipped / already on plan
          // Indices are preserved so focusStates[i], composedFocuses[i], and
          // activeIdx still address the original arrays correctly.
          .map((f, i) => ({ f, i }))
          .sort((a, b) => {
            const rank = (e) => {
              const st = focusStates[e.i] || {};
              if (st.skipped) return 2;
              const desc = composedFocuses?.[e.i]?.description || e.f.description || '';
              const flatBlank = !_hasSegments(e.f.descriptionSegments) && _detectPlaceholder(desc);
              const tokenBlank = _focusUnfilledTokenKeys(e.f, st.tokenValues).length > 0;
              return (flatBlank || tokenBlank) ? 0 : 1;
            };
            const ra = rank(a);
            const rb = rank(b);
            if (ra !== rb) return ra - rb;
            return a.i - b.i; // stable within bucket
          })
          .map(({ f, i }) => {
          const state = focusStates[i] || {};
          // Compute display state up-front (composedDesc + needsInput) so the
          // class-name chain below can reference it.
          const composedDesc = composedFocuses?.[i]?.description || f.description || '';
          const preview = composedDesc.replace(/\s+/g, ' ').trim();
          const flatHasBlank = !_hasSegments(f.descriptionSegments) && _detectPlaceholder(composedDesc);
          const tokenBlank = _focusUnfilledTokenKeys(f, state.tokenValues).length > 0;
          const needsInput = !state.skipped && (flatHasBlank || tokenBlank);

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
          if (needsInput) cls += ' is-needs-input';
          if (i === activeIdx) cls += ' is-active';
          const isStamping = progress && progress.focusIndex === i && !state.skipped;
          if (isStamping) { cls += ' is-stamping'; badge = '…'; badgeTitle = 'Adding now…'; }

          const label = f._isLibrary ? (f._libraryLabel || 'From PCC library') : _ruleIdToLabel(f.ruleId);

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
                  {needsInput && (
                    <span className="cpas-list__tag cpas-list__tag--blank" title="This focus needs input before stamping">
                      ⚠ needs input
                    </span>
                  )}
                  {!needsInput && (f.ruleId === 'universal.code_status' || f.ruleId === 'universal.discharge_planning') && !state.skipped && (
                    <span className="cpas-list__tag cpas-list__tag--ready" title="Input provided">
                      ✓ ready
                    </span>
                  )}
                </div>
                {preview && <div className="cpas-list__preview">{preview}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {onStamp && (
        <div className="cpas-list__commit">
          <button
            className="cpas-btn cpas-btn--primary cpas-list__commit-btn"
            disabled={stampDisabled}
            onClick={onStamp}
            title={needsInputCount > 0
              ? `${needsInputCount} focus${needsInputCount === 1 ? '' : 'es'} still need input`
              : ''}
            data-track="care_plan_stamp_submitted"
            data-track-prop-source="sidebar"
          >
            ✓ Add all {stampCount} to care plan
          </button>
          {needsInputCount > 0 && (
            <div className="cpas-list__commit-warn">
              ⚠ {needsInputCount} {needsInputCount === 1 ? 'focus needs' : 'focuses need'} input first
            </div>
          )}
        </div>
      )}
      {/* Previously skipped fold — focuses the nurse dismissed in a prior
          session. Backend filters these out of the active list and returns
          them on `skippedFocuses`. Un-skip pulls one back into the active
          list and DELETEs the persisted skip row. */}
      {Array.isArray(skippedFocuses) && skippedFocuses.length > 0 && (
        <details className="cpas-list__skipped-fold">
          <summary className="cpas-list__skipped-fold-summary">
            Previously skipped ({skippedFocuses.length})
          </summary>
          <ul className="cpas-list__skipped-fold-items">
            {skippedFocuses.map((f) => (
              <li key={f.ruleId} className="cpas-list__skipped-fold-item">
                <span className="cpas-list__skipped-fold-text" title={f.description}>
                  {_ruleIdToLabel(f.ruleId)}
                </span>
                {onUnSkip && (
                  // NO_TRACK: pure-UI un-skip; persistence is fire-and-forget.
                  <button
                    type="button"
                    className="cpas-list__skipped-fold-unskip"
                    onClick={(e) => { e.stopPropagation(); onUnSkip(f); }}
                    title="Move back into the active list"
                  >
                    Un-skip
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
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

/**
 * Searchable combobox — replaces native <select> for long lists.
 * Trigger: a chip-style button showing the current value.
 * Popover: search input + filtered list. ESC closes, arrows navigate, enter picks.
 */
export const Combobox = ({ value, labels, options, onChange, disabled, variant, ariaLabel, triggerClass, placeholder, fullWidth }) => {
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
