import { useMemo } from 'preact/hooks';

/**
 * Inline review page shown after queries are generated.
 * Form-like card design with editable notes, ICD-10 selector,
 * and practitioner selection.
 */
export const BatchReviewPage = ({
  generatedQueries,
  practitioners,
  selectedPractitionerId,
  onSelectPractitioner,
  onUpdateNote,
  onUpdateIcd10,
  onSend,
  onPrint,
  onBack,
  isSending,
  progress
}) => {
  const canSend = selectedPractitionerId && generatedQueries.length > 0 && !isSending;
  const canPrint = generatedQueries.length > 0 && !isSending;

  return (
    <div className="qr">
      {/* Header */}
      <div className="qr__header">
        <button className="qr__back-btn" onClick={onBack} disabled={isSending} data-track="query_modal_closed" data-track-prop-reason="cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="qr__header-center">
          <h2 className="qr__title">Review & Send</h2>
          <span className="qr__badge">{generatedQueries.length} {generatedQueries.length === 1 ? 'Query' : 'Queries'}</span>
        </div>
        <div className="qr__header-right">
          {isSending && (
            <div className="qr__sending-status">
              <div className="qr__sending-spinner" />
              {progress.label === 'printing'
                ? `Printing ${progress.current + 1}/${progress.total}`
                : `Sending ${progress.current + 1}/${progress.total}`}
            </div>
          )}
          <button
            className="qr__print-btn"
            disabled={!canPrint}
            onClick={onPrint}
            data-track="query_print_started"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {isSending ? 'Printing...' : 'Print All'}
          </button>
          <button
            className="qr__send-btn"
            disabled={!canSend}
            onClick={onSend}
            data-track="query_modal_closed"
            data-track-prop-reason="submit"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            {isSending ? 'Sending...' : 'Send All'}
          </button>
        </div>
      </div>

      {/* Practitioner bar */}
      <div className="qr__physician-bar">
        <div className="qr__field-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Physician
        </div>
        <select
          className="qr__physician-select"
          value={selectedPractitionerId ? String(selectedPractitionerId) : ''}
          onChange={(e) => onSelectPractitioner(e.target.value)}
          disabled={isSending || practitioners.length === 0}
        >
          <option value="" disabled>
            Select a practitioner...
          </option>
          {practitioners.map(p => {
            const id = getPractitionerId(p);
            const label = formatPractitionerName(p);
            const subtitle = p.title || p.specialty || '';
            return (
              <option key={id} value={id}>
                {label}{subtitle ? ` — ${subtitle}` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Form body */}
      <div className="qr__body">
        {generatedQueries.map((gq, idx) => (
          <ReviewCard
            key={gq.item.mdsItem}
            gq={gq}
            index={idx}
            total={generatedQueries.length}
            onUpdateNote={onUpdateNote}
            onUpdateIcd10={onUpdateIcd10}
            disabled={isSending}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Single review card — form block for one query item
 */
const ReviewCard = ({ gq, index, total, onUpdateNote, onUpdateIcd10, disabled }) => {
  const itemName = gq.item.pdpmCategoryName || gq.item.mdsItemName || gq.item.mdsItem;

  // Merge ICD-10 options: AI preferred + AI options + item recommended, deduplicated
  const icd10Options = useMemo(() => {
    const seen = new Set();
    const options = [];

    const addOption = (code, description, source) => {
      if (!code || seen.has(code)) return;
      seen.add(code);
      options.push({ code, description: description || '', source });
    };

    // AI preferred first
    if (gq.preferredIcd10) {
      addOption(gq.preferredIcd10.code, gq.preferredIcd10.description, 'recommended');
    }

    // AI options
    if (gq.icd10Options) {
      for (const opt of gq.icd10Options) {
        addOption(opt.code, opt.description, 'ai');
      }
    }

    // Item's recommended codes
    if (gq.item.recommendedIcd10) {
      for (const opt of gq.item.recommendedIcd10) {
        addOption(opt.code, opt.description, 'item');
      }
    }

    return options;
  }, [gq]);

  const selectedCode = gq.selectedIcd10 || gq.preferredIcd10?.code || '';

  return (
    <div className="qr__card">
      {/* Card header strip */}
      <div className="qr__card-header">
        <span className="qr__card-number">{index + 1}</span>
        <h3 className="qr__card-name">{itemName}</h3>
        <span className="qr__card-mds">{gq.item.mdsItem}</span>
      </div>

      {/* Card body — form fields */}
      <div className="qr__card-body">
        {/* ICD-10 field */}
        {icd10Options.length > 0 && (
          <div className="qr__field">
            <div className="qr__field-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              ICD-10 Code
            </div>
            <select
              className="qr__icd10-select"
              value={selectedCode}
              onChange={(e) => onUpdateIcd10(gq.item.mdsItem, e.target.value)}
              disabled={disabled}
            >
              {icd10Options.map(opt => (
                <option key={opt.code} value={opt.code}>
                  {opt.code}{opt.description ? ` — ${opt.description}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Note field */}
        <div className="qr__field">
          <div className="qr__field-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Query Note
          </div>
          <textarea
            className="qr__note-textarea"
            value={gq.noteText}
            onInput={(e) => onUpdateNote(gq.item.mdsItem, e.target.value)}
            disabled={disabled}
            rows={5}
          />
        </div>
      </div>

      {gq.error && (
        <div className="qr__card-error">{gq.error}</div>
      )}
    </div>
  );
};

function getPractitionerId(p) {
  return p.id ?? p.practitionerId ?? p.personId ?? '';
}

function formatPractitionerName(p) {
  if (p.firstName && p.lastName) {
    return `${p.firstName} ${p.lastName}${p.title ? `, ${p.title}` : ''}`;
  }
  return p.name || 'Unknown';
}
