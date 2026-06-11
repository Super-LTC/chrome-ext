// content/modules/managed-care/components/Wizard.jsx
// 3-step clinical-update wizard, driven entirely by recertifications/form-data.
// Step 1: payer & auth window. Step 2: documents + MDS sections. Step 3: review.
import { useState, useEffect } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { resolveRelativeDate } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

const EMPTY_CONFIG = {
  payerName: '',
  payerType: '',
  authorizationType: '',
  daysRequested: '',
  documentStartDate: '',
  documentEndDate: '',
  requestedDocumentTypes: [],
  documentTypeRangeOverrides: {},
  mdsSections: [],
  includeAdmissionDocs: false,
};

export const Wizard = ({ orgSlug, patientId, facilityName, prefillConfig, retryTarget, onCreated, onCancel }) => {
  const [fd, setFd] = useState(null);          // form-data payload
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [usedPreset, setUsedPreset] = useState(false);
  const [stepError, setStepError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [openRanges, setOpenRanges] = useState({});  // docType → bool (custom-range expander)
  const [savingPreset, setSavingPreset] = useState(false);

  // Retry path targets the failed run's patient/location, not the page we're on.
  const targetPatientId = retryTarget?.externalPatientId || patientId;

  useEffect(() => {
    RecertAPI.formData({ orgSlug, patientId: targetPatientId })
      .then((data) => {
        setFd(data);
        track('mc_wizard_opened', { prefilled: !!data?.managedCareStay });
        if (prefillConfig) {
          // Retry path: the failed run's stored config wins wholesale.
          setConfig({ ...EMPTY_CONFIG, ...prefillConfig });
        } else if (data?.managedCareStay) {
          const stay = data.managedCareStay;
          setConfig((c) => ({
            ...c,
            payerName: stay.payerName || '',
            daysRequested: stay.requestedDays ?? '',
            documentStartDate: stay.authStartDate || '',
            documentEndDate: stay.authEndDate || '',
          }));
        }
      })
      .catch((e) => setLoadError(e.message || 'Failed to load form data'));
  }, []);

  const set = (patch) => { setConfig((c) => ({ ...c, ...patch })); setStepError(null); };

  const applyPreset = (preset) => {
    if (!preset) { setUsedPreset(false); return; }
    const win = preset.relativeDateWindow || {};
    set({
      payerType: preset.payerType ?? config.payerType,
      daysRequested: preset.daysRequested ?? config.daysRequested,
      authorizationType: preset.authorizationType ?? config.authorizationType,
      documentStartDate: win.start ? (resolveRelativeDate(win.start) || config.documentStartDate) : config.documentStartDate,
      documentEndDate: win.end ? (resolveRelativeDate(win.end) || config.documentEndDate) : config.documentEndDate,
      requestedDocumentTypes: preset.documentTypes || [],
      documentTypeRangeOverrides: preset.documentTypeRangeOverrides || {},
      mdsSections: preset.mdsSections || [],
    });
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

  const toggleDocType = (type, on) => {
    const cur = new Set(config.requestedDocumentTypes);
    if (on) cur.add(type); else cur.delete(type);
    set({ requestedDocumentTypes: [...cur] });
  };

  const toggleGroup = (types, on) => {
    const cur = new Set(config.requestedDocumentTypes);
    for (const t of types) { if (on) cur.add(t); else cur.delete(t); }
    set({ requestedDocumentTypes: [...cur] });
  };

  const setRangeOverride = (type, field, value) => {
    const overrides = { ...config.documentTypeRangeOverrides };
    overrides[type] = { ...(overrides[type] || {}), [field]: value };
    if (!overrides[type].start && !overrides[type].end) delete overrides[type];
    set({ documentTypeRangeOverrides: overrides });
  };

  const toggleMdsSection = (section, on) => {
    const cur = new Set(config.mdsSections);
    if (on) cur.add(section); else cur.delete(section);
    set({ mdsSections: [...cur] });
  };

  const savePreset = async () => {
    const name = window.prompt('Preset name:');
    if (!name) return;
    setSavingPreset(true);
    try {
      await RecertAPI.savePreset({ orgSlug, name, ...cleanConfig(config) });
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
      const rec = await RecertAPI.create({
        orgSlug,
        externalPatientId: targetPatientId,   // PCC client id
        // Retry from the central panel: the failed run's location is
        // authoritative, not the facility PCC is parked on.
        ...(retryTarget?.locationId
          ? { locationId: retryTarget.locationId }
          : { facilityName }),                // server resolves to locationId
        ...cleanConfig(config),
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
      setError(e.message); // surface backend 'required' messages inline
    } finally { setSubmitting(false); }
  };

  if (loadError) return <div className="mc-wizard"><div className="mc-wizard__error">{loadError}</div></div>;
  if (!fd) return <div className="mc-list-loading">Loading…</div>;

  const presets = fd.presets || [];
  const groups = fd.documentTypeGroups || {};
  const displayNames = fd.documentTypeDisplayNames || {};
  const selected = new Set(config.requestedDocumentTypes);

  return (
    <div className="mc-wizard">
      <div className="mc-wizard__steps">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`mc-wizard__step-dot ${step === n ? 'mc-wizard__step-dot--active' : ''}`}>
            {n}. {['Payer & auth', 'Documents', 'Review'][n - 1]}{n < 3 ? ' ›' : ''}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="mc-wizard__step">
          {presets.length > 0 && (
            <div className="mc-wizard__field">
              <label>Preset</label>
              <select onChange={(e) => applyPreset(presets.find((p) => p.id === e.target.value))}>
                <option value="">— None —</option>
                {['org', 'personal'].map((scope) => {
                  const scoped = presets.filter((p) => p.scope === scope);
                  return scoped.length ? (
                    <optgroup key={scope} label={scope === 'org' ? 'Organization' : 'Personal'}>
                      {scoped.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </div>
          )}
          <div className="mc-wizard__field">
            <label>Payer name</label>
            <input type="text" value={config.payerName} onInput={(e) => set({ payerName: e.target.value })} />
          </div>
          <div className="mc-wizard__row">
            <div className="mc-wizard__field">
              <label>Payer type</label>
              <select value={config.payerType} onChange={(e) => set({ payerType: e.target.value })}>
                <option value="">—</option>
                {(fd.payerTypeOptions || []).map((o) => (
                  <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>
                ))}
              </select>
            </div>
            <div className="mc-wizard__field">
              <label>Authorization type</label>
              <select value={config.authorizationType} onChange={(e) => set({ authorizationType: e.target.value })}>
                <option value="">—</option>
                {(fd.authorizationTypeOptions || []).map((o) => (
                  <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>
                ))}
              </select>
            </div>
            <div className="mc-wizard__field">
              <label>Days requested</label>
              <input type="number" min="0" value={config.daysRequested}
                onInput={(e) => set({ daysRequested: e.target.value })} />
            </div>
          </div>
          <div className="mc-wizard__row">
            <div className="mc-wizard__field">
              <label>Document start date</label>
              <input type="date" value={config.documentStartDate} onInput={(e) => set({ documentStartDate: e.target.value })} />
            </div>
            <div className="mc-wizard__field">
              <label>Document end date</label>
              <input type="date" value={config.documentEndDate} onInput={(e) => set({ documentEndDate: e.target.value })} />
            </div>
          </div>
          {stepError && <div className="mc-wizard__field-hint">{stepError}</div>}
        </div>
      )}

      {step === 2 && (
        <div className="mc-wizard__step">
          {Object.entries(groups).map(([key, group]) => {
            const allOn = group.types.every((t) => selected.has(t));
            return (
              <div className="mc-wizard__doc-group" key={key}>
                <label className="mc-wizard__doc-group-header">
                  <input type="checkbox" checked={allOn}
                    onChange={(e) => toggleGroup(group.types, e.target.checked)} />
                  {group.label}
                </label>
                {group.types.map((type) => (
                  <div key={type}>
                    <div className="mc-wizard__doc-type">
                      <label>
                        <input type="checkbox" checked={selected.has(type)}
                          onChange={(e) => toggleDocType(type, e.target.checked)} />
                        {' '}{displayNames[type] || type}
                      </label>
                      {selected.has(type) && (
                        // NO_TRACK — form micro-interaction
                        <button type="button" className="mc-wizard__range-toggle"
                          onClick={() => setOpenRanges((r) => ({ ...r, [type]: !r[type] }))}>
                          {openRanges[type] ? 'use default range' : 'custom range'}
                        </button>
                      )}
                    </div>
                    {selected.has(type) && openRanges[type] && (
                      <div className="mc-wizard__doc-range">
                        <input type="date" value={config.documentTypeRangeOverrides[type]?.start || ''}
                          onInput={(e) => setRangeOverride(type, 'start', e.target.value)} />
                        →
                        <input type="date" value={config.documentTypeRangeOverrides[type]?.end || ''}
                          onInput={(e) => setRangeOverride(type, 'end', e.target.value)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {(fd.mdsSectionOptions || []).length > 0 && (
            <div className="mc-wizard__doc-group">
              <div className="mc-wizard__doc-group-header">MDS sections</div>
              {(fd.mdsSectionOptions || []).map((o) => (
                <div className="mc-wizard__doc-type" key={optVal(o)}>
                  <label>
                    <input type="checkbox" checked={config.mdsSections.includes(optVal(o))}
                      onChange={(e) => toggleMdsSection(optVal(o), e.target.checked)} />
                    {' '}{optLabel(o)}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="mc-wizard__step">
          <div className="mc-wizard__review">
            <div><span className="mc-wizard__review-label">Payer:</span>{config.payerName} {config.payerType && `(${config.payerType})`}</div>
            {config.authorizationType && <div><span className="mc-wizard__review-label">Authorization:</span>{config.authorizationType}</div>}
            {config.daysRequested !== '' && <div><span className="mc-wizard__review-label">Days requested:</span>{config.daysRequested}</div>}
            <div><span className="mc-wizard__review-label">Document window:</span>{config.documentStartDate} → {config.documentEndDate}</div>
            <div>
              <span className="mc-wizard__review-label">Documents:</span>
              {config.requestedDocumentTypes.length
                ? config.requestedDocumentTypes.map((t) => displayNames[t] || t).join(', ')
                : 'All types'}
            </div>
            {Object.keys(config.documentTypeRangeOverrides).length > 0 && (
              <div>
                <span className="mc-wizard__review-label">Custom ranges:</span>
                {Object.entries(config.documentTypeRangeOverrides)
                  .map(([t, r]) => `${displayNames[t] || t} (${r.start || '…'} → ${r.end || '…'})`).join(', ')}
              </div>
            )}
            {config.mdsSections.length > 0 && (
              <div><span className="mc-wizard__review-label">MDS sections:</span>{config.mdsSections.join(', ')}</div>
            )}
          </div>
          {/* NO_TRACK — handler emits mc_preset_saved */}
          <button type="button" className="mc-wizard__range-toggle" disabled={savingPreset} onClick={savePreset}>
            {savingPreset ? 'Saving…' : 'Save as preset'}
          </button>
          {error && <div className="mc-wizard__error">{error}</div>}
        </div>
      )}

      <div className="mc-wizard__nav">
        {/* NO_TRACK — wizard navigation */}
        <button type="button" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}>
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          // NO_TRACK — wizard navigation
          <button type="button" className="mc-wizard__nav-primary"
            onClick={() => { if (step !== 1 || validateStep1()) setStep(step + 1); }}>
            Next
          </button>
        ) : (
          // NO_TRACK — handler emits mc_run_created
          <button type="button" className="mc-wizard__nav-primary" disabled={submitting} onClick={generate}>
            {submitting ? 'Starting…' : 'Generate'}
          </button>
        )}
      </div>
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
