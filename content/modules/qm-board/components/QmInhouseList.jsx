/**
 * In-house List — "Clear soon". The clearable worklist, time-bucketed (Today /
 * This week / This month / Later) so the nurse sees what to work and when. The
 * about-to-cross summary sits at the TOP (compact) so it's not buried under the
 * clear list. Discharge function is excluded upstream (nothing to clear).
 *
 * Ported from qm-inhouse-list.reference.tsx → Preact + the qmc-/qmi- tone system.
 */
import { CLEAR_TONE, prettyDate, crosserToDrill } from '../lib/qm-tones.js';
import { buildInhouseView, bucketClearable } from '../lib/qm-inhouse-view.js';
import { ChevronRight, ClipboardCheck, ArrowUpRight } from './icons.jsx';

export function QmInhouseList({ board, lens, facilityState, onOpenResident }) {
  const v = buildInhouseView(board, lens, facilityState);
  const buckets = bucketClearable(v.clearable);

  return (
    <div className="qmi-list">
      {/* ── about to cross — compact, at the top (not buried) ── */}
      {v.aboutToCross.length > 0 && (
        <section className="qmi-cross">
          <div className="qmi-cross__head">
            <ArrowUpRight className="qmi-cross__icon" />
            <h3 className="qmi-cross__title">About to cross (day-101)</h3>
            <span className="qmi-cross__count">{v.aboutToCross.length}</span>
            {v.crossLaterCount > 0 && <span className="qmi-cross__later">+{v.crossLaterCount} later</span>}
          </div>
          <div className="qmi-cross__chips">
            {v.aboutToCross.map((r) => (
              <button
                key={r.key}
                type="button"
                data-track="qm_drill_in"
                data-track-prop-measure-code={r.hit.id}
                data-track-prop-view="inhouse_cross"
                title={`${r.patientName} · ${r.measureLabel} · crosses ${prettyDate(r.crossingDate)}${r.preventable && r.preventDeadline ? ` · prevent by ${prettyDate(r.preventDeadline)}` : ''}`}
                className="qmi-crosschip"
                onClick={() => {
                  const { patient, entry } = crosserToDrill(r.patient, r.hit);
                  onOpenResident(patient, entry);
                }}
              >
                <span className="qmi-crosschip__name">{r.patientName.split(',')[0]}</span>
                <span className="qmi-crosschip__measure">{r.measureLabel}</span>
                <span className={`qmi-crosschip__date ${r.preventable ? 'qmc-text--emerald' : 'qmc-text--slate'}`}>
                  {prettyDate(r.crossingDate)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── clear soon — time buckets ── */}
      {v.clearable.length === 0 ? (
        <div className="qmc-empty">Nothing clearable in house right now.</div>
      ) : (
        buckets.map((b) =>
          b.rows.length === 0 ? null : (
            <section key={b.key} className="qmi-bucket">
              <div className="qmf-sec__head">
                <span className={`qmc-dot qmc-dot--${b.key === 'clinical' ? 'amber' : b.key === 'later' ? 'slate' : 'emerald'}`} />
                <span className="qmf-sec__label">{b.label}</span>
                <span className="qmf-sec__count">{b.rows.length}</span>
              </div>
              <div className="qmf-list">
                {b.rows.map((r) => {
                  const tone = CLEAR_TONE[r.clearKind] || CLEAR_TONE.wait;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      data-track="qm_drill_in"
                      data-track-prop-measure-code={r.entry.id}
                      data-track-prop-view="inhouse_list"
                      className="qmf-clearrow"
                      onClick={() => onOpenResident(r.patient, r.entry)}
                    >
                      <span className="qmf-clearrow__icon"><ClipboardCheck /></span>
                      <div className="qmf-clearrow__body">
                        <div className="qmf-clearrow__name">
                          {r.patientName}
                          <span className="qmc-chip qmc-chip--slate">{r.measureLabel}</span>
                        </div>
                        <div className="qmf-clearrow__action">
                          <span className="qmc-text--slate">{r.ardDate ? `MDS ${prettyDate(r.ardDate)}` : 'no target yet'}</span>
                        </div>
                      </div>
                      <span className={`qmc-clearchip qmc-clearchip--${tone.badge}`}>{r.clearShort}</span>
                      <ChevronRight className="qmf-clearrow__chev" />
                    </button>
                  );
                })}
              </div>
            </section>
          ),
        )
      )}
    </div>
  );
}
