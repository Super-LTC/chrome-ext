import { useState } from 'preact/hooks';
import { openItemInPcc } from '../lib/view-item.js';
import { dedupeEvidence } from '../lib/verify-derive.js';

function evidenceItems(measure) {
  return [...new Set((measure.evidence || []).map((e) => e.mdsItem).filter(Boolean))];
}

function EvidenceChips({ measure }) {
  const ev = dedupeEvidence(measure.evidence);
  if (!ev.length) return null;
  return (
    <div className="svq-evid">
      {ev.map((e, i) => (
        <span key={i} className="svq-ev" title={e.note || ''}>
          <span className="svq-ev__i">{e.mdsItem}</span>={e.value}
        </span>
      ))}
    </div>
  );
}

function ViewAct({ measure, assessId }) {
  const first = evidenceItems(measure)[0];
  if (!first) return null;
  return (
    <div className="svq-acts">
      {/* NO_TRACK — opens the measure's MDS item in PCC */}
      <button className="sv-btn" onClick={() => openItemInPcc(assessId, first)}>View {first}</button>
    </div>
  );
}

// What THIS lock newly does — the actual news.
function NewTriggerCard({ measure, assessId }) {
  const fc = measure.facilityCount;
  const items = evidenceItems(measure);
  return (
    <div className="sv-card svq-card is-trig">
      <div className="svq-head">
        <div>
          <div className="svq-title">{measure.label}</div>
          <div className="svq-mid">{[measure.id, items.join(' / ')].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="sv-b sv-b--warn">New trigger</span>
      </div>
      {fc ? (
        <div className="svq-delta">
          <div className="svq-nums">
            <span className="svq-c">{fc.current}</span>
            <span className="svq-a">→</span>
            <span className="svq-x">{fc.ifLocked}</span>
          </div>
          <div className="svq-cap"><b>+1 resident</b> — this lock adds the resident to the facility numerator.</div>
        </div>
      ) : (
        <div className="svq-delta"><div className="svq-cap">This lock adds the resident to the numerator.</div></div>
      )}
      <EvidenceChips measure={measure} />
      <ViewAct measure={measure} assessId={assessId} />
    </div>
  );
}

// Good news — resident is in the numerator today, this codes clean. No misleading
// current→current arrow (the facility count flag isn't a −1).
function WillClearCard({ measure, assessId }) {
  const fc = measure.facilityCount;
  return (
    <div className="sv-card svq-card is-clear">
      <div className="svq-head">
        <div>
          <div className="svq-title">{measure.label}</div>
          <div className="svq-mid">{measure.id}</div>
        </div>
        <span className="sv-b sv-b--ok">Will clear</span>
      </div>
      <div className="svq-clear">
        In the numerator today{fc ? ` (${fc.current} residents facility-wide)` : ''} — coding clean <b>removes this resident</b> on lock.
      </div>
      <ViewAct measure={measure} assessId={assessId} />
    </div>
  );
}

function ExcludedGroup({ title, measures }) {
  const [open, setOpen] = useState(false);
  if (!measures.length) return null;
  return (
    <div className="svq-excluded">
      {/* NO_TRACK — expands an excluded-measures group */}
      <button className="sv-disclosure" onClick={() => setOpen((o) => !o)}>
        {title} ({measures.length}) <span className="sv-disclosure__ar">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="svq-excluded__list">
          {measures.map((m) => (
            <li key={m.id}>{m.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QmSection({ partition, totalMeasures, assessId }) {
  const { newTriggers, willClear, carries, firingCount } = partition;
  const nothing = newTriggers.length === 0 && willClear.length === 0 && carries.length === 0;

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

        {newTriggers.map((m) => (
          <NewTriggerCard key={m.id} measure={m} assessId={assessId} />
        ))}
        {willClear.map((m) => (
          <WillClearCard key={m.id} measure={m} assessId={assessId} />
        ))}

        {carries.length > 0 && (
          <div className="svq-carry">
            <span className="svq-carry__lbl">Already in the numerator (unchanged by this lock):</span>{' '}
            {carries.map((m) => m.label).join(', ')}
          </div>
        )}

        <ExcludedGroup title="Will evaluate once coded" measures={partition.excludedIncomplete} />
        <ExcludedGroup title="Excluded — clinical" measures={partition.excludedClinical} />
      </div>
    </>
  );
}
