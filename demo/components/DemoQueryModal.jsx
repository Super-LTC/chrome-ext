/**
 * DemoQueryModal — Preact replacement for the vanilla QuerySendModal.
 *
 * Two-step flow that mirrors the production modal:
 *   Step 1: Review diagnosis, ICD-10, and AI-generated note
 *   Step 2: Select practitioner and send
 *
 * Mounted by PCCDemoApp; triggered via window.QuerySendModal.show().
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { setTourState } from '../tour/tour-state.js';

export function DemoQueryModal({ queryData, onClose }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [icd10Options, setIcd10Options] = useState([]);
  const [selectedIcd10, setSelectedIcd10] = useState('');
  const [practitioners, setPractitioners] = useState([]);
  const [selectedPractitioner, setSelectedPractitioner] = useState(null);
  const [practSearch, setPractSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [context, setContext] = useState(null);
  const backdropRef = useRef(null);

  const mdsItem = queryData?.mdsItem || '';
  const description = queryData?.description || queryData?.aiAnswer?.itemName || 'Unknown';

  // Load data on mount
  useEffect(() => {
    (async () => {
      try {
        // Get context
        const ctx = await window.getCurrentParams?.() || {
          facilityName: 'SUNNY MEADOWS DEMO FACILITY',
          orgSlug: 'demo-org',
          assessmentId: '4860265'
        };
        ctx.patientName = window.getPatientNameFromPage?.() || 'Doe, Jane';
        ctx.patientId = window.getChatPatientId?.() || '2657226';
        setContext(ctx);

        // Fetch practitioners
        const practs = await window.QueryAPI?.fetchPractitioners?.(ctx.facilityName, ctx.orgSlug) || [];
        setPractitioners(practs);

        // Generate AI note
        const noteData = await window.QueryAPI?.generateNote?.(mdsItem, queryData?.aiAnswer || queryData) || {};
        setNoteText(noteData.note || `Please review the clinical evidence for potential ${description}. See supporting documentation below.`);
        setIcd10Options(noteData.icd10Options || []);
        setSelectedIcd10(noteData.preferredIcd10?.code || noteData.icd10Options?.[0]?.code || '');
      } catch (e) {
        console.error('[DemoQueryModal] Load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSend = async () => {
    if (!selectedPractitioner) return;
    setSending(true);
    try {
      const { query } = await window.QueryAPI.createQuery({
        patientId: context?.patientId,
        facilityName: context?.facilityName,
        orgSlug: context?.orgSlug,
        mdsAssessmentId: context?.assessmentId,
        mdsItem,
        mdsItemName: description,
        aiGeneratedNote: noteText
      });
      await window.QueryAPI.sendQuery(query.id, [selectedPractitioner.id], noteText);
      // Guided tour: surface the chosen doctor on the phone mockup, then signal
      // the c3-send step to advance. Additive — no effect outside the tour.
      try {
        const doctorName = selectedPractitioner.name
          || `${selectedPractitioner.firstName || ''} ${selectedPractitioner.lastName || ''}`.trim();
        if (doctorName) setTourState({ doctorName });
      } catch {}
      window.dispatchEvent(new CustomEvent('tour:query-sent'));
      setSuccess(true);
      setTimeout(() => {
        onClose();
        window.SuperToast?.success?.('Query sent successfully');
      }, 1200);
    } catch (e) {
      console.error('[DemoQueryModal] Send failed:', e);
      window.SuperToast?.error?.(`Failed to send: ${e.message}`);
      setSending(false);
    }
  };

  const filteredPractitioners = practitioners.filter(p => {
    if (!practSearch) return true;
    const name = (p.name || `${p.firstName} ${p.lastName}`).toLowerCase();
    return name.includes(practSearch.toLowerCase());
  });

  // Success state
  if (success) {
    return (
      <div class="dqm__backdrop" ref={backdropRef}>
        <div class="dqm__modal dqm__modal--success">
          <div class="dqm__success">
            <div class="dqm__success-icon">&#10003;</div>
            <div class="dqm__success-text">Query Sent!</div>
            <div class="dqm__success-sub">
              Sent to {selectedPractitioner?.name || `${selectedPractitioner?.firstName} ${selectedPractitioner?.lastName}`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="dqm__backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div class="dqm__modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="dqm__header">
          <div class="dqm__header-left">
            <span class="dqm__header-icon">?</span>
            <span class="dqm__header-title">Send Diagnosis Query</span>
            {mdsItem && <span class="dqm__header-badge">{mdsItem}</span>}
          </div>
          <button class="dqm__close" onClick={onClose} type="button">&times;</button>
        </div>

        {/* Progress */}
        <div class="dqm__progress">
          <div class={`dqm__step ${step >= 1 ? 'dqm__step--active' : ''} ${step > 1 ? 'dqm__step--done' : ''}`}>
            <span class="dqm__step-num">{step > 1 ? '\u2713' : '1'}</span>
            <span class="dqm__step-label">Review</span>
          </div>
          <div class={`dqm__step-line ${step > 1 ? 'dqm__step-line--active' : ''}`} />
          <div class={`dqm__step ${step >= 2 ? 'dqm__step--active' : ''}`}>
            <span class="dqm__step-num">2</span>
            <span class="dqm__step-label">Send</span>
          </div>
        </div>

        {/* Body */}
        <div class="dqm__body">
          {loading ? (
            <div class="dqm__loading">
              <div class="mds-cc__spinner mds-cc__spinner--sm" />
              <span>Loading query details...</span>
            </div>
          ) : step === 1 ? (
            /* ── Step 1: Review ── */
            <div class="dqm__step-content">
              {/* Patient & Diagnosis card */}
              <div class="dqm__info-card">
                <div class="dqm__info-row">
                  <span class="dqm__patient-name">{context?.patientName || 'Patient'}</span>
                  <span class="dqm__facility">{context?.facilityName || ''}</span>
                </div>
                <div class="dqm__diagnosis-row">
                  <span class="dqm__diag-code">{mdsItem}</span>
                  <span class="dqm__diag-name">{description}</span>
                </div>
              </div>

              {/* ICD-10 */}
              {icd10Options.length > 0 && (
                <div class="dqm__field">
                  <label class="dqm__label">ICD-10 Code</label>
                  <select class="dqm__select" value={selectedIcd10} onChange={(e) => setSelectedIcd10(e.target.value)}>
                    {icd10Options.map(opt => (
                      <option key={opt.code} value={opt.code}>
                        {opt.code}{opt.description ? ` — ${opt.description}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Note */}
              <div class="dqm__field">
                <label class="dqm__label">Note for Physician</label>
                <textarea
                  class="dqm__textarea"
                  rows="5"
                  value={noteText}
                  onInput={(e) => setNoteText(e.target.value)}
                  placeholder="Enter note for physician..."
                />
              </div>
            </div>
          ) : (
            /* ── Step 2: Send ── */
            <div class="dqm__step-content">
              {/* Patient & Diagnosis card */}
              <div class="dqm__info-card">
                <div class="dqm__info-row">
                  <span class="dqm__patient-name">{context?.patientName || 'Patient'}</span>
                  <span class="dqm__facility">{context?.facilityName || ''}</span>
                </div>
                <div class="dqm__diagnosis-row">
                  <span class="dqm__diag-code">{mdsItem}</span>
                  <span class="dqm__diag-name">{description}</span>
                </div>
              </div>

              {/* Practitioner selection */}
              <div class="dqm__field">
                <label class="dqm__label">Send to Physician</label>
                <input
                  type="text"
                  class="dqm__search"
                  placeholder="Search practitioners..."
                  value={practSearch}
                  onInput={(e) => setPractSearch(e.target.value)}
                />
                <div class="dqm__pract-list">
                  {filteredPractitioners.map(p => {
                    const name = p.name || `${p.firstName} ${p.lastName}`;
                    const isSelected = selectedPractitioner?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        class={`dqm__pract-item ${isSelected ? 'dqm__pract-item--selected' : ''}`}
                        onClick={() => setSelectedPractitioner(p)}
                      >
                        <div class="dqm__pract-avatar">{(p.firstName?.[0] || name[0]).toUpperCase()}</div>
                        <div class="dqm__pract-info">
                          <div class="dqm__pract-name">{name}</div>
                          {p.title && <div class="dqm__pract-title">{p.title}</div>}
                        </div>
                        {isSelected && <span class="dqm__pract-check">&#10003;</span>}
                      </div>
                    );
                  })}
                </div>
                <div class="dqm__hint">They will be notified via SMS</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div class="dqm__footer">
          {step === 1 ? (
            <>
              <button class="dqm__btn dqm__btn--secondary" onClick={onClose} type="button">Cancel</button>
              <button class="dqm__btn dqm__btn--primary" onClick={() => setStep(2)} disabled={loading} type="button">Next</button>
            </>
          ) : (
            <>
              <button class="dqm__btn dqm__btn--secondary" onClick={() => setStep(1)} disabled={sending} type="button">Back</button>
              <button class="dqm__btn dqm__btn--primary" onClick={handleSend} disabled={!selectedPractitioner || sending} type="button">
                {sending ? 'Sending...' : 'Send Query'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
