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
  entryIsActionable, statusBucketForEntry, statusRank,
} from '../lib/qm-view-model.js';
import { STATUS_BUCKET, CROSSING, isCrossingEntry, fullName, prettyDate, stayDayLabel } from '../lib/qm-tones.js';
import { X } from './icons.jsx';

function toast(msg) {
  try { if (window.SuperToast?.show) window.SuperToast.show({ message: msg, type: 'info' }); else console.info('[QM]', msg); }
  catch { /* noop */ }
}

export function ResidentDrillIn({ patient, entry, onClose }) {
  if (!patient) return null;
  const triggering = patient.measures.filter((m) => m.triggers);
  const measures = (triggering.length ? triggering : [entry])
    .slice()
    .sort((a, b) => statusRank(statusBucketForEntry(a)) - statusRank(statusBucketForEntry(b)));
  const anyDxQuery = measures.some((m) => m.clearGuidance?.actionType === 'dx_query');

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
            <div className="qmc-modal__eyebrow">{measures.length} measure{measures.length === 1 ? '' : 's'} triggering</div>
          </div>
          <button type="button" className="qmc-modal__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
        </div>

        <div className="qmc-modal__body">
          {measures.map((m, i) => <MeasureSection key={`${m.id}-${i}`} patient={patient} entry={m} />)}

          <div className="qmc-modal__actions">
            <button type="button" data-track="qm_evidence_opened" data-track-prop-measure-code={measures[0]?.id || '—'} className="qmc-btn qmc-btn--primary" onClick={() => toast('Open the full MDS from the MDS tab')}>
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

function MeasureSection({ patient, entry }) {
  const crossing = isCrossingEntry(entry);
  const bucket = statusBucketForEntry(entry);
  const tone = STATUS_BUCKET[bucket];
  const code = measureCode(entry.id);
  const fiveStar = isFiveStarMds(entry.id);
  const g = entry.clearGuidance;
  const cliff = entry.cliffInfo;
  const hasClearPath = !crossing && bucket !== 'will_hit' && entryIsActionable(entry);

  // Beat 2
  const countingTitle = crossing ? 'Not counting yet' : 'Counting now';
  const countingDetail = crossing
    ? (cliff?.cliffLabel ?? 'starts when CDIF reaches 101')
    : (cliff?.cliffLabel ?? 'in the current measure window');

  // Beat 3 — transcribed precisely from the parity spec.
  const clearsOnObra = hasClearPath && (g?.clearsOnNextObra || patient.nextObraPreview?.wouldClear?.includes(entry.id));
  let clearsTitle, clearsDetail;
  if (crossing) {
    const preventable = !!cliff?.clearableBeforeCliff;
    clearsTitle = preventable ? 'Preventable before day-101' : 'Carries over at day-101';
    clearsDetail = preventable
      ? (g?.actions?.[0]?.label ?? 'clear the coding before they cross')
      : 'already coded — it appears the moment CDIF reaches 101';
  } else if (hasClearPath) {
    if (clearsOnObra) {
      clearsTitle = 'Clears on the next OBRA';
      clearsDetail = cliff?.earliestClearDate
        ? `any Quarterly/Annual coded clean · earliest ARD ${prettyDate(cliff.earliestClearDate)}`
        : 'any Quarterly/Annual coded clean replaces the target';
    } else {
      clearsTitle = 'Clears at the next clean assessment';
      clearsDetail = cliff?.actionDeadline
        ? `code clean, then ARD by ${prettyDate(cliff.actionDeadline)}`
        : g?.clearDate ? `on ${prettyDate(g.clearDate)}` : 'when the target is re-coded clean';
    }
  } else if (g?.actionType === 'stay_locked' || cliff?.urgency === 'stay-locked') {
    clearsTitle = 'Locked to this stay';
    clearsDetail = 'clears at discharge or a new stay — nothing this stay removes it';
  } else {
    clearsTitle = 'Ages out of the window';
    clearsDetail = g?.clearDate
      ? `${prettyDate(g.clearDate)} — counts until then; no action speeds it up`
      : 'rolls off once the lookback window passes';
  }

  const headTone = crossing ? CROSSING.tone : tone.tone;
  const headLabel = crossing ? 'Crossing day-101' : tone.label;
  const beat3Tone = hasClearPath ? 'emerald' : crossing ? CROSSING.tone : 'slate';
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
        <Beat tone={beat3Tone} label={clearsTitle}><div className="qmc-beat__body">{clearsDetail}</div></Beat>
      </ol>
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
