import { useState } from 'preact/hooks';
import { openItemInPcc } from '../lib/view-item.js';
import { dedupeEvidence } from '../lib/verify-derive.js';
import { itemLabel, displayValue, pairEvidence, evidenceItemCodes } from '../lib/evidence-model.js';

/**
 * What changed, and against what. See lib/evidence-model.js — all of it was
 * already in the payload and merely unrendered.
 *
 * Preferred shape is one row per item ("Eating 6 → 5") with the baseline named
 * once. Falls back to per-assessment groups when there's no unambiguous single
 * prior to compare against.
 */
function Evidence({ measure, assessId, summariesHandled }) {
  const ev = dedupeEvidence(measure.evidence);
  if (!ev.length) return null;
  const { summaries, comparison, groups } = pairEvidence(ev, assessId);

  // `summariesHandled` = a callout above the panel already states this measure's
  // computed summary. Today that's DFS: the callout renders "35 · target 38 ·
  // 3 short" with a progress bar and the outcome drill-in, and this row would
  // repeat the same three numbers as "observed=35, expected=38.44, delta=-3.44"
  // a few hundred pixels below it. The callout is a strict superset, so the row
  // is dropped rather than the callout.
  const shown = summariesHandled ? [] : summaries;

  return (
    <div className="svq-evid">
      {shown.map((e, i) => (
        <div key={`sum-${i}`} className="svq-ev-sum">
          {e.note || `${e.mdsItem} = ${e.value}`}
        </div>
      ))}

      {comparison && (
        <div className="svq-cmp">
          <div className="svq-ev-grp__lbl">Compared with · {comparison.baselineLabel}</div>
          {comparison.rows.map((r) => (
            <div key={r.key} className="svq-cmp__row">
              <span className="svq-cmp__lbl">{r.label}</span>
              {/* Same rule as the chips: no code when it IS the label. */}
              <span className="svq-cmp__code">{r.label === r.code ? '' : r.code}</span>
              {r.from != null && r.to != null ? (
                <span className="svq-cmp__d">
                  <b>{r.from}</b> <span className="svq-cmp__ar">→</span> <b className="is-now">{r.to}</b>
                </span>
              ) : (
                <span className="svq-cmp__d">
                  <b className="is-now">{r.to ?? r.from}</b>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id} className="svq-ev-grp">
          <div className="svq-ev-grp__lbl">
            {g.isTarget ? 'This MDS' : 'Compared with'}
            {g.label ? ` · ${g.label}` : ''}
          </div>
          <div className="svq-ev-grp__rows">
            {/* The code only appears when there's a NAME to distinguish it from.
                itemLabel() falls back to the code itself for anything without a
                friendly name — which is most measures, since only GG items have
                one — and rendering both then printed "I2300 I2300 1". */}
            {g.rows.map((e, i) => {
              const label = itemLabel(e.mdsItem);
              return (
                <span key={i} className="svq-ev" title={e.note || ''}>
                  <span className="svq-ev__i">{label}</span>
                  {label !== e.mdsItem && <span className="svq-ev__c">{e.mdsItem}</span>}
                  <span className="svq-ev__v">{displayValue(e.value)}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ViewAct({ measure, assessId }) {
  const first = evidenceItemCodes(measure)[0];
  if (!first) return null;
  return (
    <div className="svq-acts">
      {/* NO_TRACK — opens the measure's MDS item in PCC */}
      <button className="sv-btn" onClick={() => openItemInPcc(assessId, first)}>
        View {itemLabel(first)}
      </button>
    </div>
  );
}

// One card; `headline` is rendered verbatim (backend-authored). `tone` drives
// the badge + accent.
function MeasureCard({ measure, tone, assessId, summariesHandled }) {
  const fc = measure.facilityCount;
  return (
    <div className={`sv-card svq-card ${tone === 'clear' ? 'is-clear' : 'is-trig'}`}>
      <div className="svq-head">
        <div>
          <div className="svq-title">{measure.label}</div>
          {/* Just the measure id. This used to join every evidence code, which
              on DFS (10 GG items) ran wider than the card — and now that each
              row below carries its own labelled code, it was saying it twice. */}
          <div className="svq-mid">{measure.id}</div>
        </div>
        <span className={`sv-b ${tone === 'clear' ? 'sv-b--ok' : 'sv-b--warn'}`}>
          {tone === 'clear' ? 'Clearing' : 'New trigger'}
        </span>
      </div>

      {/* Verdict, then the count as its own labelled line.
          `classifyQmVerify` used to bury the numbers mid-sentence — "…newly
          flags this resident — facility 12 → 13" — which reads as cryptic, and
          duplicated this line. The backend now states the verdict in words and
          leaves the numbers here, where they can carry a unit. */}
      {measure.headline ? (
        <div className={tone === 'new' ? 'svq-lede' : 'svq-clear'}>{measure.headline}</div>
      ) : null}
      {tone === 'new' && fc && (
        <div className="svq-fac">
          <span className="svq-c">{fc.current}</span>
          <span className="svq-a">→</span>
          <span className="svq-x">{fc.ifLocked}</span>
          <span className="svq-unit">
            resident{fc.ifLocked === 1 ? '' : 's'} facility-wide in this measure
          </span>
        </div>
      )}

      <Evidence measure={measure} assessId={assessId} summariesHandled={summariesHandled} />
      <ViewAct measure={measure} assessId={assessId} />
    </div>
  );
}

function Disclosure({ title, measures }) {
  const [open, setOpen] = useState(false);
  if (!measures.length) return null;
  return (
    <div className="svq-excluded">
      {/* NO_TRACK — expands a collapsed measure group */}
      <button className="sv-disclosure" onClick={() => setOpen((o) => !o)}>
        {title} ({measures.length}) <span className="sv-disclosure__ar">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="svq-excluded__list">
          {measures.map((m) => {
            const sub = m.headline || m.exclusionReason;
            const fc = m.facilityCount;
            return (
              <li key={m.id}>
                <div className="svq-exl-label">{m.label}</div>
                {sub ? <div className="svq-exl-sub">{sub}</div> : null}
                {fc?.current != null ? (
                  <div className="svq-exl-sub">Currently {fc.current} resident{fc.current === 1 ? '' : 's'} facility-wide in this measure.</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function QmSection({ groups, totalMeasures, assessId, summariesHandled }) {
  const { newTrigger, clearing, locked, incomplete, clinical, firingCount } = groups;
  const nothing = newTrigger.length === 0 && clearing.length === 0 && locked.length === 0;

  return (
    <>
      <div className="sv-sec sv-sec--hero" data-anchor="qm">
        <h3>Quality measures — if this locks</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">{firingCount} of {totalMeasures} firing</span>
      </div>
      <div className="sv-wrap">
        {nothing && (
          <div className="sv-empty"><span className="sv-empty__c">✓</span> No quality measures change from this MDS as coded.</div>
        )}

        {newTrigger.length > 0 && <div className="svq-grouplbl svq-grouplbl--alert">New triggers — preventable</div>}
        {newTrigger.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="new" assessId={assessId} summariesHandled={summariesHandled} />
        ))}

        {clearing.length > 0 && <div className="svq-grouplbl svq-grouplbl--good">Clearing from last time</div>}
        {clearing.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="clear" assessId={assessId} summariesHandled={summariesHandled} />
        ))}

        <Disclosure title="Already triggering · can't clear" measures={locked} />
        <Disclosure title="Will evaluate once coded" measures={incomplete} />
        <Disclosure title="Excluded — clinical" measures={clinical} />
      </div>
    </>
  );
}
