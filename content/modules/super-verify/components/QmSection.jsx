import { useState } from 'preact/hooks';
import { openItemInPcc } from '../lib/view-item.js';
import { dedupeEvidence } from '../lib/verify-derive.js';
import { itemLabel, groupEvidence, evidenceItemCodes } from '../lib/evidence-model.js';

/**
 * Evidence, grouped by the assessment each value was read from — the
 * "compared against what?" answer. See lib/evidence-model.js for why this was
 * already in the payload and merely unrendered.
 */
function Evidence({ measure, assessId }) {
  const ev = dedupeEvidence(measure.evidence);
  if (!ev.length) return null;
  const { summaries, groups } = groupEvidence(ev, assessId);

  return (
    <div className="svq-evid">
      {summaries.map((e, i) => (
        <div key={`sum-${i}`} className="svq-ev-sum">
          {e.note || `${e.mdsItem} = ${e.value}`}
        </div>
      ))}
      {groups.map((g) => (
        <div key={g.id} className="svq-ev-grp">
          <div className="svq-ev-grp__lbl">
            {g.isTarget ? 'This MDS' : 'Compared with'}
            {g.label ? ` · ${g.label}` : ''}
          </div>
          <div className="svq-ev-grp__rows">
            {g.rows.map((e, i) => (
              <span key={i} className="svq-ev" title={e.note || ''}>
                <span className="svq-ev__i">{itemLabel(e.mdsItem)}</span>
                <span className="svq-ev__c">{e.mdsItem}</span>
                <span className="svq-ev__v">{e.value}</span>
              </span>
            ))}
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
// the badge + accent. New triggers additionally show the facility count delta.
function MeasureCard({ measure, tone, assessId }) {
  const fc = measure.facilityCount;
  const items = evidenceItemCodes(measure);
  return (
    <div className={`sv-card svq-card ${tone === 'clear' ? 'is-clear' : 'is-trig'}`}>
      <div className="svq-head">
        <div>
          <div className="svq-title">{measure.label}</div>
          {/* Codes only, and capped: DFS scores 10 GG items, so joining them all
              produced a line of raw codes wider than the card. The full set is
              in the evidence groups below, labelled. */}
          <div className="svq-mid">
            {[measure.id, items.slice(0, 3).join(' / ') + (items.length > 3 ? ` +${items.length - 3}` : '')]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <span className={`sv-b ${tone === 'clear' ? 'sv-b--ok' : 'sv-b--warn'}`}>
          {tone === 'clear' ? 'Clearing' : 'New trigger'}
        </span>
      </div>

      {tone === 'new' && fc && (
        <div className="svq-delta">
          <div className="svq-nums">
            <span className="svq-c">{fc.current}</span>
            <span className="svq-a">→</span>
            <span className="svq-x">{fc.ifLocked}</span>
          </div>
          {measure.headline ? <div className="svq-cap">{measure.headline}</div> : null}
        </div>
      )}
      {tone !== 'new' && measure.headline ? <div className="svq-clear">{measure.headline}</div> : null}

      <Evidence measure={measure} assessId={assessId} />
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

export function QmSection({ groups, totalMeasures, assessId }) {
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
          <MeasureCard key={m.id} measure={m} tone="new" assessId={assessId} />
        ))}

        {clearing.length > 0 && <div className="svq-grouplbl svq-grouplbl--good">Clearing from last time</div>}
        {clearing.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="clear" assessId={assessId} />
        ))}

        <Disclosure title="Already triggering · can't clear" measures={locked} />
        <Disclosure title="Will evaluate once coded" measures={incomplete} />
        <Disclosure title="Excluded — clinical" measures={clinical} />
      </div>
    </>
  );
}
