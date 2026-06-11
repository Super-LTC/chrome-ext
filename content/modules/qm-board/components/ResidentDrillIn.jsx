/**
 * Surface C — resident drill-in (centered modal).
 *
 * Ported from web/components/quality-measures/qm-drill-in.tsx (PR #626).
 * Shows EVERY triggering measure for the resident at once; each is a three-beat
 * timeline (Triggered by → Counting now → Clears/ages-out). Beat-3 is computed
 * exactly per the parity spec — the clinical heart of the surface.
 */
import { useState } from 'preact/hooks';
import {
  isFiveStarMds, shortLabel, measureCode, displayMdsValue,
  statusBucketForEntry, statusRank, measureInLens,
} from '../lib/qm-view-model.js';
import { STATUS_BUCKET, CROSSING, isCrossingEntry, fullName, prettyDate, stayDayLabel, clearTiming, CLEAR_TONE } from '../lib/qm-tones.js';
import { X, ChevronDown, ChevronRight } from './icons.jsx';

function toast(msg) {
  try { if (window.SuperToast?.show) window.SuperToast.show({ message: msg, type: 'info' }); else console.info('[QM]', msg); }
  catch { /* noop */ }
}

export function ResidentDrillIn({ patient, entry, scopeMeasureId, lens, facilityState, facilityDate, onClose }) {
  if (!patient) return null;
  // Lens-scope the modal: a resident opened in Five-Star mode must never reveal
  // their state-survey-only measures. When no lens is supplied, show all.
  const triggering = patient.measures.filter(
    (m) => m.triggers && (!lens || measureInLens(m.id, lens, facilityState))
  );
  const all = (triggering.length ? triggering : [entry])
    .filter(Boolean)
    .slice()
    .sort((a, b) => statusRank(statusBucketForEntry(a)) - statusRank(statusBucketForEntry(b)));

  // Scope-aware (superapp PR #652): opened FROM a measure → lead with it, tuck the
  // rest under an accordion. Opened from a patient row (no scope) → show all.
  // Fall back to "show all" if the scoped measure isn't in the lensed set.
  const scoped = scopeMeasureId ? all.filter((m) => m.id === scopeMeasureId) : [];
  const primary = scoped.length ? scoped : all;
  const others = scoped.length ? all.filter((m) => m.id !== scopeMeasureId) : [];
  const anyDxQuery = all.some((m) => m.clearGuidance?.actionType === 'dx_query');

  return (
    <div className="qmc qmc-modal-overlay" onClick={onClose}>
      <div className="qmc-modal qmc-modal-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="qmc-modal__head">
          <div style={{ minWidth: 0 }}>
            <div className="qmc-modal__name">{fullName(patient)}</div>
            <div className="qmc-modal__meta">
              {stayDayLabel(patient)}
              {patient.payerClassification && ` · ${patient.payerClassification}`}
              {patient.externalPatientId && ` · ${patient.externalPatientId}`}
            </div>
            <div className="qmc-modal__eyebrow">
              {scoped.length
                ? <>{shortLabel(primary[0].id, primary[0].label)}{others.length > 0 && ` · ${others.length} other${others.length === 1 ? '' : 's'} triggering`}</>
                : <>{primary.length} measure{primary.length === 1 ? '' : 's'} triggering</>}
            </div>
          </div>
          <button type="button" className="qmc-modal__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
        </div>

        <div className="qmc-modal__body">
          {primary.map((m, i) => <MeasureSection key={`${m.id}-${i}`} patient={patient} entry={m} facilityDate={facilityDate} />)}

          {others.length > 0 && <OtherMeasures patient={patient} others={others} facilityDate={facilityDate} />}

          <div className="qmc-modal__actions">
            <button type="button" data-track="qm_evidence_opened" data-track-prop-measure-code={primary[0]?.id || '—'} className="qmc-btn qmc-btn--primary" onClick={() => toast('Open the full MDS from the MDS tab')}>
              View full MDS
            </button>
            {anyDxQuery && (
              <button type="button" className="qmc-btn qmc-btn--ghost" onClick={() => toast('Diagnosis query — coming soon')}> {/* NO_TRACK */}
                Send Dx query
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MeasureSection({ patient, entry, facilityDate }) {
  const crossing = isCrossingEntry(entry);
  const bucket = statusBucketForEntry(entry);
  const tone = STATUS_BUCKET[bucket];
  const code = measureCode(entry.id);
  const fiveStar = isFiveStarMds(entry.id);
  const cliff = entry.cliffInfo;

  // Beat 2 — keep the small "Counting now · {cliffLabel}" line.
  const countingTitle = crossing ? 'Not counting yet' : 'Counting now';
  const countingDetail = crossing
    ? (cliff?.cliffLabel ?? 'starts when CDIF reaches 101')
    : (cliff?.cliffLabel ?? 'in the current measure window');

  // Clear-timing banner (web §5C) — loud, color-coded "can I clear this / when",
  // right under the measure name. Same `clearTiming` decision as the row chip
  // (no drift); it carries its own louder `big`/`sub` copy, keyed off the
  // backend `clearability` field (never off dates — see §6A).
  const timing = clearTiming(entry, patient, facilityDate);
  const bannerTone = CLEAR_TONE[timing.kind].badge;
  const bannerTitle = timing.big;
  const bannerSub = timing.sub;

  const headTone = crossing ? CROSSING.tone : tone.tone;
  const headLabel = crossing ? 'Crossing day-101' : tone.label;
  const beat2Tone = crossing ? CROSSING.tone : tone.tone;

  return (
    <div className="qmc-msec">
      <div className="qmc-msec__head">
        <span className={`qmc-chip qmc-chip--${headTone}`}>
          <span className={`qmc-dot qmc-dot--${headTone}`} style={{ width: '6px', height: '6px' }} />
          {headLabel}
        </span>
        <span className="qmc-msec__title">{shortLabel(entry.id, entry.label)}</span>
        {code && <span className="qmc-tile__code">{code}</span>}
        {fiveStar
          ? <span className="qmc-tag qmc-tag--star">5★</span>
          : <span className="qmc-tag qmc-tag--state">state</span>}
      </div>

      <div className={`qmc-clearbanner qmc-clearbanner--${bannerTone}`}>
        <span className={`qmc-dot qmc-dot--${bannerTone}`} />
        <div className="qmc-clearbanner__text">
          <div className="qmc-clearbanner__title">{bannerTitle}</div>
          <div className="qmc-clearbanner__sub">{bannerSub}</div>
        </div>
      </div>

      <ol className="qmc-timeline">
        <Beat tone="slate900" label="Triggered by">
          {entry.evidence.length === 0 ? (
            <div className="qmc-beat__muted">No evidence emitted by the evaluator.</div>
          ) : (
            <div className="qmc-evlist">
              {entry.evidence.map((ev, i) => (
                <div key={`${ev.mdsItem}-${ev.assessmentId}-${i}`} className="qmc-ev">
                  <div className="qmc-ev__left">
                    <div className="qmc-ev__row">
                      <span className="qmc-ev__item">{ev.mdsItem}</span>
                      <span className="qmc-ev__eq">=</span>
                      <span className="qmc-ev__val">{displayMdsValue(ev.mdsItem, ev.value) || '—'}</span>
                    </div>
                    {(ev.assessmentType || ev.note) && (
                      <div className="qmc-ev__sub">{ev.assessmentType}{ev.note ? ` · ${ev.note}` : ''}</div>
                    )}
                  </div>
                  {ev.assessmentArdDate && (
                    <div className="qmc-ev__coded">
                      <span className="qmc-ev__coded-lbl">Coded on MDS</span>
                      <span className="qmc-ev__coded-date">{prettyDate(ev.assessmentArdDate)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Beat>
        <Beat tone={beat2Tone} label={countingTitle}><div className="qmc-beat__body">{countingDetail}</div></Beat>
      </ol>
    </div>
  );
}

// Collapsed accordion of the resident's other triggering measures, shown when the
// modal was opened scoped to one measure (§5C). Starts closed so the scoped
// measure leads; the nurse can expand to see the rest in context.
function OtherMeasures({ patient, others, facilityDate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="qmc-othermeas">
      <button type="button" className="qmc-othermeas__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}> {/* NO_TRACK */}
        {open ? <ChevronDown /> : <ChevronRight />}
        <span>{others.length} other measure{others.length === 1 ? '' : 's'} triggering for this resident</span>
      </button>
      {open && (
        <div className="qmc-othermeas__body">
          {others.map((m, i) => <MeasureSection key={`${m.id}-${i}`} patient={patient} entry={m} facilityDate={facilityDate} />)}
        </div>
      )}
    </div>
  );
}

function Beat({ tone, label, children }) {
  return (
    <li className="qmc-beat">
      <span className={`qmc-beat__dot qmc-beat__dot--${tone}`} />
      <div className="qmc-beat__label">{label}</div>
      <div style={{ marginTop: '4px' }}>{children}</div>
    </li>
  );
}
