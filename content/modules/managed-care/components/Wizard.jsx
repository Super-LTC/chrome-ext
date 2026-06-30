// content/modules/managed-care/components/Wizard.jsx
// 3-step clinical-update wizard mirroring the dashboard's recert wizard:
// Step 1 Details (payer name + days-requested pills + date-range pills),
// Step 2 Document Types (card grid, all selected by default, presets),
// Step 3 Review. Driven by recertifications/form-data (handoff §3.2).
import { useState, useEffect } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { resolveRelativeDate } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

const EMPTY_CONFIG = {
  payerName: '',
  payerType: '',            // no UI (dashboard has none) — flows from presets/retry only
  authorizationType: '',    // same
  daysRequested: 7,
  documentStartDate: '',
  documentEndDate: '',
  requestedDocumentTypes: [],
  documentTypeRangeOverrides: {},
  mdsSections: [],
  includeAdmissionDocs: false,
  udaIncludeKeywords: [],   // exact assessment (UDA) form names to pull; [] = pull all
};

const DAYS_PILLS = ['3', '5', '7'];
const RANGE_PILLS = [
  { key: '3days', label: 'Last 3 days', days: 3 },
  { key: '7days', label: 'Last 7 days', days: 7 },
  { key: 'stay', label: 'Entire stay' },
  { key: 'custom', label: 'Custom' },
];
const GROUP_RANGE_PILLS = [
  { key: 'all', label: 'All' },
  { key: '1', label: 'Last 1 day' },
  { key: '2', label: 'Last 2 days' },
  { key: '3', label: 'Last 3 days' },
  { key: '7', label: 'Last 7 days' },
  { key: 'custom', label: 'Custom' },
];

const DEFAULT_MDS_SECTIONS = ['B', 'C', 'GG']; // dashboard's default selection

const today = () => resolveRelativeDate('today');
const daysAgo = (n) => resolveRelativeDate(`-${n}d`);
const fmtDate = (iso) => {
  if (!iso) return '…';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const Wizard = ({ orgSlug, patientId, facilityName, prefillConfig, retryTarget, onCreated, onCancel }) => {
  const [fd, setFd] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [usedPreset, setUsedPreset] = useState(false);
  const [stepError, setStepError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [daysMode, setDaysMode] = useState('7');
  const [rangeMode, setRangeMode] = useState('7days');
  const [groupRanges, setGroupRanges] = useState({});   // groupKey → pill key
  const [openRanges, setOpenRanges] = useState({});     // groupKey → expander open?
  const [includeMds, setIncludeMds] = useState(false);
  const [customizeMds, setCustomizeMds] = useState(false);
  // Per-recert "Assessment filter" (UDA forms). One eager fetch on open seeds
  // the org-default selection AND fills the modal list, so the modal is instant.
  const [udaModalOpen, setUdaModalOpen] = useState(false);
  const [udaForms, setUdaForms] = useState([]);
  const [udaLoading, setUdaLoading] = useState(false);

  // Retry path targets the failed run's patient/location, not the page we're on.
  const targetPatientId = retryTarget?.externalPatientId || patientId;

  useEffect(() => {
    RecertAPI.formData({ orgSlug, patientId: targetPatientId })
      .then((data) => {
        setFd(data);
        track('mc_wizard_opened', { prefilled: !!data?.prefill });
        const allTypes = data?.allDocumentTypes
          || Object.values(data?.documentTypeGroups || {}).flatMap((g) => g.types);
        if (prefillConfig) {
          // Retry path: the failed run's stored config wins wholesale.
          setConfig({ ...EMPTY_CONFIG, ...prefillConfig });
          setDaysMode(DAYS_PILLS.includes(String(prefillConfig.daysRequested)) ? String(prefillConfig.daysRequested) : 'custom');
          setRangeMode('custom');
          setIncludeMds(!!prefillConfig.mdsSections?.length);
        } else {
          // Server-computed Step-1 autofill (handoff §3.2) + dashboard's
          // default of every document type selected.
          const p = data?.prefill;
          const days = p?.daysRequested ?? 7;
          setConfig((c) => ({
            ...c,
            payerName: p?.payerName || '',
            payerType: p?.payerType || '',
            daysRequested: days,
            documentStartDate: p?.documentStartDate || daysAgo(7),
            documentEndDate: p?.documentEndDate || today(),
            requestedDocumentTypes: allTypes,
          }));
          setDaysMode(DAYS_PILLS.includes(String(days)) ? String(days) : 'custom');
          setRangeMode(p?.dateRangeOption === '7days' || !p ? '7days' : 'custom');
        }
      })
      .catch((e) => setLoadError(e.message || 'Failed to load form data'));
  }, []);

  const set = (patch) => { setConfig((c) => ({ ...c, ...patch })); setStepError(null); };

  // Load the facility's synced assessments once, up front. The same payload
  // seeds the per-recert filter from the org default (UI transparency only —
  // the ext reads the default, never writes it) and fills the picker modal.
  // Skip the seed on the retry path: the failed run's stored config wins.
  useEffect(() => {
    setUdaLoading(true);
    RecertAPI.udaPreview({ orgSlug, facilityName })
      .then((d) => {
        setUdaForms(d?.forms || []);
        if (!prefillConfig && Array.isArray(d?.orgDefaultKeywords) && d.orgDefaultKeywords.length) {
          set({ udaIncludeKeywords: d.orgDefaultKeywords });
        }
      })
      .catch(() => {})   // non-fatal: leave empty = pull all
      .finally(() => setUdaLoading(false));
  }, []);

  // Forms are already loaded (or loading) from the eager fetch above.
  const openUdaModal = () => setUdaModalOpen(true);
  const toggleUdaForm = (description) => {
    const has = config.udaIncludeKeywords.some((k) => k.toLowerCase() === description.toLowerCase());
    set({
      udaIncludeKeywords: has
        ? config.udaIncludeKeywords.filter((k) => k.toLowerCase() !== description.toLowerCase())
        : [...config.udaIncludeKeywords, description],
    });
  };

  const pickDays = (mode) => {
    setDaysMode(mode);
    if (mode !== 'custom') set({ daysRequested: Number(mode) });
  };

  const pickRange = (mode) => {
    setRangeMode(mode);
    const pill = RANGE_PILLS.find((p) => p.key === mode);
    if (pill?.days) {
      set({ documentStartDate: daysAgo(pill.days), documentEndDate: today(), includeAdmissionDocs: false });
    } else if (mode === 'stay') {
      set({
        documentStartDate: fd?.prefill?.admissionDate || fd?.managedCareStay?.admissionDate || '',
        documentEndDate: today(),
        includeAdmissionDocs: true,
      });
    }
    // 'custom' keeps current dates; inputs below edit them directly.
  };

  const applyPreset = (preset) => {
    if (!preset) { setUsedPreset(false); return; }
    const win = preset.relativeDateWindow || {};
    const start = win.start ? resolveRelativeDate(win.start) : null;
    const end = win.end ? resolveRelativeDate(win.end) : null;
    set({
      payerType: preset.payerType ?? config.payerType,
      daysRequested: preset.daysRequested ?? config.daysRequested,
      authorizationType: preset.authorizationType ?? config.authorizationType,
      documentStartDate: start || config.documentStartDate,
      documentEndDate: end || config.documentEndDate,
      requestedDocumentTypes: preset.documentTypes || [],
      documentTypeRangeOverrides: preset.documentTypeRangeOverrides || {},
      mdsSections: preset.mdsSections || [],
    });
    if (preset.daysRequested != null) {
      setDaysMode(DAYS_PILLS.includes(String(preset.daysRequested)) ? String(preset.daysRequested) : 'custom');
    }
    if (start || end) setRangeMode('custom');
    setIncludeMds(!!preset.mdsSections?.length);
    setGroupRanges({});
    setUsedPreset(true);
  };

  const validateStep1 = () => {
    const missing = [];
    if (!config.payerName) missing.push('Payer name');
    if (!config.documentStartDate) missing.push('Start date');
    if (!config.documentEndDate) missing.push('End date');
    if (missing.length) { setStepError(`Required: ${missing.join(', ')}`); return false; }
    return true;
  };

  const toggleTypes = (types, on) => {
    const cur = new Set(config.requestedDocumentTypes);
    for (const t of types) { if (on) cur.add(t); else cur.delete(t); }
    set({ requestedDocumentTypes: [...cur] });
  };

  const setGroupRange = (groupKey, types, mode) => {
    setGroupRanges((r) => ({ ...r, [groupKey]: mode }));
    const overrides = { ...config.documentTypeRangeOverrides };
    if (mode === 'all') {
      for (const t of types) delete overrides[t];
    } else if (mode !== 'custom') {
      const range = { start: daysAgo(Number(mode)), end: today() };
      for (const t of types) overrides[t] = range;
    }
    set({ documentTypeRangeOverrides: overrides });
  };

  const setGroupCustomRange = (types, field, value) => {
    const overrides = { ...config.documentTypeRangeOverrides };
    for (const t of types) overrides[t] = { ...(overrides[t] || {}), [field]: value };
    set({ documentTypeRangeOverrides: overrides });
  };

  const toggleMdsSection = (section, on) => {
    const cur = new Set(config.mdsSections);
    if (on) cur.add(section); else cur.delete(section);
    set({ mdsSections: [...cur] });
  };

  const savePreset = async () => {
    // Preset save requires non-empty documentTypes (handoff §3.7); preset
    // shape uses `documentTypes`, not the create body's `requestedDocumentTypes`.
    if (!config.requestedDocumentTypes.length) {
      window.SuperToast?.error('Pick at least one document type before saving a preset');
      return;
    }
    const name = window.prompt('Preset name:');
    if (!name) return;
    setSavingPreset(true);
    try {
      const body = { orgSlug, name, documentTypes: config.requestedDocumentTypes };
      if (config.payerType) body.payerType = config.payerType;
      if (config.daysRequested !== '') body.daysRequested = Number(config.daysRequested);
      if (config.authorizationType) body.authorizationType = config.authorizationType;
      if (Object.keys(config.documentTypeRangeOverrides).length) body.documentTypeRangeOverrides = config.documentTypeRangeOverrides;
      if (config.mdsSections.length) body.mdsSections = config.mdsSections;
      await RecertAPI.savePreset(body);
      track('mc_preset_saved');
      window.SuperToast?.success('Preset saved');
    } catch (e) {
      window.SuperToast?.error(e.message || 'Failed to save preset');
    } finally { setSavingPreset(false); }
  };

  const generate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = cleanConfig(config);
      if (!includeMds) delete body.mdsSections;
      const rec = await RecertAPI.create({
        orgSlug,
        externalPatientId: targetPatientId,   // PCC client id
        // Retry from the central panel: the failed run's location is
        // authoritative, not the facility PCC is parked on.
        ...(retryTarget?.locationId
          ? { locationId: retryTarget.locationId }
          : { facilityName }),                // server resolves to locationId
        ...body,
      });
      await RecertAPI.generate(rec.id);
      window.McRunTracker?.track({ id: rec.id, status: 'fetching_documents' });
      track('mc_run_created', {
        payer_type: config.payerType || 'unspecified',
        doc_type_count: (config.requestedDocumentTypes || []).length,
        used_preset: usedPreset,
      });
      onCreated(rec);
    } catch (e) {
      // Field-level hints from the backend's 400 `required` list; clear state
      // for a 403 (gate can flip between page load and submit).
      if (e.status === 403) {
        setError("Clinical Updates aren't enabled for this facility.");
      } else if (e.required?.length) {
        setError(`Missing required fields: ${e.required.join(', ')}`);
      } else {
        setError(e.message);
      }
    } finally { setSubmitting(false); }
  };

  if (loadError) return <div className="mc-wizard"><div className="mc-wizard__error">{loadError}</div></div>;
  if (!fd) {
    // Field-shaped shimmer so the wizard frame doesn't jump when form-data lands.
    return (
      <div className="mc-wizard" aria-hidden="true">
        <div className="mc-skel mc-skel--label" />
        <div className="mc-skel mc-skel--field" />
        <div className="mc-wizard__row">
          <div className="mc-skel mc-skel--field" style={{ flex: 1 }} />
          <div className="mc-skel mc-skel--field" style={{ flex: 1 }} />
        </div>
        <div className="mc-wizard__row">
          <div className="mc-skel mc-skel--field" style={{ flex: 1 }} />
          <div className="mc-skel mc-skel--field" style={{ flex: 1 }} />
        </div>
      </div>
    );
  }

  const presets = fd.presets || [];
  const groups = fd.documentTypeGroups || {};
  const displayNames = fd.documentTypeDisplayNames || {};
  const selected = new Set(config.requestedDocumentTypes);
  const allTypes = fd.allDocumentTypes || Object.values(groups).flatMap((g) => g.types);
  const hasStayDate = !!(fd.prefill?.admissionDate || fd.managedCareStay?.admissionDate);

  return (
    <div className="mc-wizard">
      <div className="mc-wizard__steps">
        {['Details', 'Documents', 'Review'].map((label, i) => {
          const n = i + 1;
          const state = step === n ? 'is-active' : step > n ? 'is-done' : '';
          return (
            <div key={n} className={`mc-wizard__step-pill ${state}`}>
              <span className="mc-wizard__step-num">{step > n ? '✓' : n}</span>
              {label}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="mc-wizard__step">
          <div className="mc-wizard__section">
            <div className="mc-wizard__section-title">Authorization Details</div>
            <div className="mc-wizard__section-hint">Enter the payer information and select dates.</div>
            <div className="mc-wizard__field">
              <label>Payer Name <span className="mc-wizard__req">*</span></label>
              <input type="text" placeholder="e.g., United Healthcare, Humana, AmeriHealth"
                value={config.payerName} onInput={(e) => set({ payerName: e.target.value })} />
            </div>
            <div className="mc-wizard__field">
              <label>Days Requested</label>
              <div className="mc-pills">
                {DAYS_PILLS.map((d) => (
                  // NO_TRACK — form micro-interaction
                  <button key={d} type="button"
                    className={`mc-pill ${daysMode === d ? 'mc-pill--active' : ''}`}
                    onClick={() => pickDays(d)}>{d} days</button>
                ))}
                {/* NO_TRACK — form micro-interaction */}
                <button type="button"
                  className={`mc-pill ${daysMode === 'custom' ? 'mc-pill--active' : ''}`}
                  onClick={() => pickDays('custom')}>Custom</button>
                {daysMode === 'custom' && (
                  <input className="mc-pills__custom-input" type="number" min="0"
                    value={config.daysRequested}
                    onInput={(e) => set({ daysRequested: e.target.value })} />
                )}
              </div>
            </div>
            <div className="mc-wizard__field">
              <label>Document Date Range</label>
              <div className="mc-wizard__section-hint">Select which time period's documents to include.</div>
              <div className="mc-pills">
                {RANGE_PILLS.map((p) => (
                  // NO_TRACK — form micro-interaction
                  <button key={p.key} type="button"
                    className={`mc-pill ${rangeMode === p.key ? 'mc-pill--active' : ''}`}
                    disabled={p.key === 'stay' && !hasStayDate}
                    onClick={() => pickRange(p.key)}>{p.label}</button>
                ))}
              </div>
              {rangeMode === 'custom' && (
                <div className="mc-wizard__row" style={{ marginTop: '8px' }}>
                  <div className="mc-wizard__field">
                    <label>Start date <span className="mc-wizard__req">*</span></label>
                    <input type="date" value={config.documentStartDate} onInput={(e) => set({ documentStartDate: e.target.value })} />
                  </div>
                  <div className="mc-wizard__field">
                    <label>End date <span className="mc-wizard__req">*</span></label>
                    <input type="date" value={config.documentEndDate} onInput={(e) => set({ documentEndDate: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="mc-wizard__range-summary">
                Documents from <b>{fmtDate(config.documentStartDate)}</b> to <b>{fmtDate(config.documentEndDate)}</b>
                {config.documentEndDate === today() ? ' (today)' : ''}
              </div>
            </div>
          </div>
          {stepError && <div className="mc-wizard__field-hint">{stepError}</div>}
        </div>
      )}

      {step === 2 && (
        <div className="mc-wizard__step">
          <div className="mc-wizard__section">
            <div className="mc-wizard__doc-header">
              <div>
                <div className="mc-wizard__section-title">Document Types</div>
                <div className="mc-wizard__section-hint" style={{ marginTop: 0 }}>Select the documents to include in the packet.</div>
              </div>
              <span className="mc-wizard__selected-chip">Selected: <b>{config.requestedDocumentTypes.length}</b></span>
            </div>

            <div className="mc-wizard__quick-row">
              <span className="mc-wizard__quick-label">Quick select:</span>
              <select onChange={(e) => {
                if (e.target.value === '__all__') { toggleTypes(allTypes, true); setUsedPreset(false); }
                else if (e.target.value === '__none__') { toggleTypes(allTypes, false); setUsedPreset(false); }
                else applyPreset(presets.find((p) => p.id === e.target.value));
              }}>
                <option value="__all__">All Types</option>
                <option value="__none__">None</option>
                {['org', 'user'].map((scope) => {
                  const scoped = presets.filter((p) => p.scope === scope);
                  return scoped.length ? (
                    <optgroup key={scope} label={scope === 'org' ? 'Organization presets' : 'My presets'}>
                      {scoped.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
              {/* NO_TRACK — handler emits mc_preset_saved */}
              <button type="button" className="mc-wizard__save-preset" disabled={savingPreset} onClick={savePreset}>
                {savingPreset ? 'Saving…' : '+ Save as preset'}
              </button>
            </div>

            {(fd.mdsSectionOptions || []).length > 0 && (
              <div className={`mc-mds-row ${includeMds ? 'mc-mds-row--on' : ''}`}>
                <label className="mc-doc-card__head">
                  <input type="checkbox" checked={includeMds}
                    onChange={(e) => {
                      setIncludeMds(e.target.checked);
                      set({ mdsSections: e.target.checked ? DEFAULT_MDS_SECTIONS : [] });
                      setCustomizeMds(false);
                    }} />
                  <span className="mc-doc-card__label">Include MDS Assessment</span>
                  {includeMds && (
                    <span className="mc-mds-row__summary">
                      Sections: {config.mdsSections.length ? config.mdsSections.join(', ') : 'none'}
                    </span>
                  )}
                  {includeMds && (
                    // NO_TRACK — form micro-interaction
                    <button type="button" className="mc-link-btn"
                      onClick={(e) => { e.preventDefault(); setCustomizeMds(!customizeMds); }}>
                      {customizeMds ? 'Done' : 'Customize sections'}
                    </button>
                  )}
                </label>
                {includeMds && customizeMds && (
                  <div className="mc-wizard__mds-grid">
                    {(fd.mdsSectionOptions || []).map((o) => (
                      <label className="mc-wizard__doc-type" key={optVal(o)}>
                        <input type="checkbox" checked={config.mdsSections.includes(optVal(o))}
                          onChange={(e) => toggleMdsSection(optVal(o), e.target.checked)} />
                        {' '}{optLabel(o)}
                      </label>
                    ))}
                  </div>
                )}
                {includeMds && (
                  <div className="mc-mds-row__hint">
                    The system will find the most recent qualifying MDS assessment and include only the selected sections.
                  </div>
                )}
              </div>
            )}

            <div className="mc-doc-grid">
              {Object.entries(groups).map(([key, group]) => {
                const multi = group.types.length > 1;
                const onCount = group.types.filter((t) => selected.has(t)).length;
                const allOn = onCount === group.types.length;
                const groupSelected = onCount > 0;
                const rMode = groupRanges[key] || 'all';
                const rangeOpen = !!openRanges[key];
                const rangeLabel = GROUP_RANGE_PILLS.find((p) => p.key === rMode)?.label || 'All';
                const firstOverride = config.documentTypeRangeOverrides[group.types[0]] || {};
                // Only Progress Note exposes a per-type date range; all others use the global range.
                const allowsRange = key === 'progress-note' || /progress note/i.test(group.label || '');
                // The Assessments card carries an inline UDA-filter gear ("All" / "N selected").
                const isAssessments = key === 'assessments' || /^assessments$/i.test(group.label || '');
                const udaCount = config.udaIncludeKeywords.length;
                return (
                  <div key={key}
                    className={`mc-doc-card ${groupSelected ? 'mc-doc-card--on' : ''} ${multi ? 'mc-doc-card--multi' : ''}`}>
                    <label className="mc-doc-card__head">
                      <input type="checkbox" checked={allOn}
                        onChange={(e) => toggleTypes(group.types, e.target.checked)} />
                      <span className="mc-doc-card__label">{group.label}</span>
                      {multi && <span className="mc-doc-card__count">{onCount}/{group.types.length}</span>}
                      {isAssessments && groupSelected && (
                        // NO_TRACK — form micro-interaction
                        <button type="button" className="mc-link-btn mc-uda-gear"
                          title="Choose which synced assessments to pull"
                          onClick={(e) => { e.preventDefault(); openUdaModal(); }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                          {udaCount === 0 ? 'All' : `${udaCount} selected`}
                        </button>
                      )}
                      {groupSelected && allowsRange && (
                        // NO_TRACK — form micro-interaction
                        <button type="button" className="mc-link-btn"
                          onClick={(e) => { e.preventDefault(); setOpenRanges((r) => ({ ...r, [key]: !rangeOpen })); }}>
                          {rMode === 'all' && !rangeOpen ? 'Date range' : rangeLabel} {rangeOpen ? '▴' : '▾'}
                        </button>
                      )}
                    </label>
                    {multi && groupSelected && (
                      <div className="mc-doc-card__subtypes">
                        {group.types.map((type) => (
                          <label key={type} className={`mc-doc-subcard ${selected.has(type) ? 'mc-doc-subcard--on' : ''}`}>
                            <input type="checkbox" checked={selected.has(type)}
                              onChange={(e) => toggleTypes([type], e.target.checked)} />
                            {displayNames[type] || type}
                          </label>
                        ))}
                      </div>
                    )}
                    {groupSelected && allowsRange && rangeOpen && (
                      <div className="mc-doc-card__range">
                        <div className="mc-pills mc-pills--small">
                          {GROUP_RANGE_PILLS.map((p) => (
                            // NO_TRACK — form micro-interaction
                            <button key={p.key} type="button"
                              className={`mc-pill ${rMode === p.key ? 'mc-pill--active' : ''}`}
                              onClick={() => setGroupRange(key, group.types, p.key)}>{p.label}</button>
                          ))}
                        </div>
                        {rMode === 'custom' && (
                          <div className="mc-wizard__doc-range">
                            <input type="date" value={firstOverride.start || ''}
                              onInput={(e) => setGroupCustomRange(group.types, 'start', e.target.value)} />
                            →
                            <input type="date" value={firstOverride.end || ''}
                              onInput={(e) => setGroupCustomRange(group.types, 'end', e.target.value)} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mc-wizard__step">
          <div className="mc-wizard__section">
            <div className="mc-wizard__section-title">Review & Generate</div>
            <div className="mc-wizard__section-hint">Double-check the request, then generate the clinical update.</div>
            <div className="mc-review-grid">
              <div className="mc-review-item">
                <div className="mc-review-item__label">Payer</div>
                <div className="mc-review-item__value">{config.payerName}</div>
              </div>
              <div className="mc-review-item">
                <div className="mc-review-item__label">Days requested</div>
                <div className="mc-review-item__value">{config.daysRequested} days</div>
              </div>
              <div className="mc-review-item mc-review-item--wide">
                <div className="mc-review-item__label">Document window</div>
                <div className="mc-review-item__value">{fmtDate(config.documentStartDate)} → {fmtDate(config.documentEndDate)}</div>
              </div>
              <div className="mc-review-item">
                <div className="mc-review-item__label">Documents</div>
                <div className="mc-review-item__value">
                  {config.requestedDocumentTypes.length === allTypes.length
                    ? `All types (${allTypes.length})`
                    : `${config.requestedDocumentTypes.length} of ${allTypes.length} types`}
                </div>
              </div>
              <div className="mc-review-item">
                <div className="mc-review-item__label">MDS assessment</div>
                <div className="mc-review-item__value">
                  {includeMds && config.mdsSections.length ? `Sections ${config.mdsSections.join(', ')}` : 'Not included'}
                </div>
              </div>
              <div className="mc-review-item">
                <div className="mc-review-item__label">Assessments</div>
                <div className="mc-review-item__value">
                  {config.udaIncludeKeywords.length === 0
                    ? 'All assessments'
                    : `${config.udaIncludeKeywords.length} selected`}
                </div>
              </div>
              {Object.keys(config.documentTypeRangeOverrides).length > 0 && (
                <div className="mc-review-item mc-review-item--wide">
                  <div className="mc-review-item__label">Custom date ranges</div>
                  <div className="mc-review-item__value">
                    {Object.entries(config.documentTypeRangeOverrides)
                      .map(([t, r]) => `${displayNames[t] || t}: ${fmtDate(r.start)} → ${fmtDate(r.end)}`).join(' · ')}
                  </div>
                </div>
              )}
            </div>
            {error && <div className="mc-wizard__error">{error}</div>}
          </div>
        </div>
      )}

      <div className="mc-wizard__nav">
        {/* NO_TRACK — wizard navigation */}
        <button type="button" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}>
          {step === 1 ? 'Cancel' : '‹ Back'}
        </button>
        {step < 3 ? (
          // NO_TRACK — wizard navigation
          <button type="button" className="mc-wizard__nav-primary"
            onClick={() => { if (step !== 1 || validateStep1()) setStep(step + 1); }}>
            Next ›
          </button>
        ) : (
          // NO_TRACK — handler emits mc_run_created
          <button type="button" className="mc-wizard__nav-primary" disabled={submitting} onClick={generate}>
            {submitting ? 'Starting…' : 'Generate'}
          </button>
        )}
      </div>

      {udaModalOpen && (
        <div className="mc-modal__overlay" onClick={() => setUdaModalOpen(false)}>
          <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mc-modal__head">
              <h3>Assessment filter</h3>
              <p>Pick the assessments to pull for this clinical update. Pick none to pull every assessment.</p>
            </div>

            {config.udaIncludeKeywords.length > 0 && (
              <div className="mc-uda__chips">
                {config.udaIncludeKeywords.map((name) => (
                  <span className="mc-chip" key={name}>
                    {name}
                    {/* NO_TRACK — form micro-interaction */}
                    <button type="button" aria-label={`Remove ${name}`} onClick={() => set({
                      udaIncludeKeywords: config.udaIncludeKeywords.filter((k) => k !== name),
                    })}>×</button>
                  </span>
                ))}
                {/* NO_TRACK — form micro-interaction */}
                <button type="button" className="mc-link-btn" onClick={() => set({ udaIncludeKeywords: [] })}>
                  Clear all
                </button>
              </div>
            )}

            <div className="mc-uda__list">
              {udaLoading ? (
                <div className="mc-uda__skeleton">
                  <div className="mc-skel mc-uda__skel-row" />
                  <div className="mc-skel mc-uda__skel-row" />
                  <div className="mc-skel mc-uda__skel-row" />
                </div>
              ) : udaForms.length === 0 ? (
                <div className="mc-uda__empty">No synced assessments for this facility yet.</div>
              ) : (
                udaForms.map((f) => {
                  const selected = config.udaIncludeKeywords.some(
                    (k) => k.toLowerCase() === f.description.toLowerCase()
                  );
                  return (
                    // NO_TRACK — form micro-interaction
                    <button
                      type="button"
                      key={f.description}
                      className={`mc-uda__row ${selected ? 'is-selected' : ''}`}
                      onClick={() => toggleUdaForm(f.description)}
                    >
                      <span className="mc-uda__check">{selected ? '✓' : ''}</span>
                      <span className="mc-uda__name">{f.description}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mc-modal__foot">
              <span className="mc-uda__summary">
                {config.udaIncludeKeywords.length === 0
                  ? `All ${udaForms.length} assessments`
                  : `${config.udaIncludeKeywords.length} selected`}
              </span>
              {/* NO_TRACK — form micro-interaction */}
              <button type="button" className="mc-btn mc-btn--primary" onClick={() => setUdaModalOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Strip empty-string fields so the backend's `required` validation speaks for
// itself, and coerce daysRequested to a number.
function cleanConfig(config) {
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (k === 'documentTypeRangeOverrides' && Object.keys(v).length === 0) continue;
    out[k] = k === 'daysRequested' ? Number(v) : v;
  }
  return out;
}

// Options may arrive as plain strings or {value, label} objects.
const optVal = (o) => (typeof o === 'string' ? o : o.value);
const optLabel = (o) => (typeof o === 'string' ? o : o.label || o.value);
