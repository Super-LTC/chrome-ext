import { useState } from 'preact/hooks';
import { openItemInPcc } from '../lib/view-item.js';

function evidenceItems(measure) {
  return (measure.evidence || []).map((e) => e.mdsItem).filter(Boolean);
}

function MeasureCard({ measure, tone, assessId, onDismiss, onToast }) {
  const fc = measure.facilityCount;
  const items = evidenceItems(measure);
  const firstItem = items[0];

  let caption;
  if (tone === 'clear') {
    caption = <span>In the numerator <b>today</b> — coding clean <b>removes this resident</b> on lock.</span>;
  } else if (fc?.isNewTrigger) {
    caption = <span><b>+1 resident</b> — this resident becomes #{fc.ifLocked} in the facility numerator.</span>;
  } else {
    caption = <span>Already triggering — this lock keeps the resident in the numerator.</span>;
  }

  function dismiss() {
    onDismiss(measure.id);
    onToast('Dismissed', { undo: () => onDismiss(measure.id, true) });
  }

  return (
    <div className={`sv-card svq-card ${tone === 'clear' ? 'is-clear' : 'is-trig'}`}>
      <div className="svq-head">
        <div>
          <div className="svq-title">{measure.label}</div>
          <div className="svq-mid">{[measure.id, items.join(' / ')].filter(Boolean).join(' · ')}</div>
        </div>
        <span className={`sv-b ${tone === 'clear' ? 'sv-b--ok' : 'sv-b--warn'}`}>
          {tone === 'clear' ? 'Will clear' : 'Triggers'}
        </span>
      </div>

      {fc ? (
        <div className="svq-delta">
          <div className="svq-nums">
            <span className="svq-c">{fc.current}</span>
            <span className="svq-a">→</span>
            <span className="svq-x">{tone === 'clear' ? fc.current : fc.ifLocked}</span>
          </div>
          <div className="svq-cap">{caption}</div>
        </div>
      ) : (
        <div className="svq-delta"><div className="svq-cap">{caption}</div></div>
      )}

      {items.length > 0 && (
        <div className="svq-evid">
          {(measure.evidence || []).map((e, i) => (
            <span key={i} className="svq-ev" title={e.note || ''}>
              <span className="svq-ev__i">{e.mdsItem}</span>={e.value}
            </span>
          ))}
        </div>
      )}

      <div className="svq-acts">
        {firstItem && (
          // NO_TRACK — opens the live MDS item in PCC
          <button className="sv-btn" onClick={() => openItemInPcc(assessId, firstItem)}>View {firstItem}</button>
        )}
        {/* NO_TRACK — QM is awareness-only; dismiss just hides the card */}
        <button className="sv-btn sv-btn--ghost" onClick={dismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function ExcludedDisclosure({ excluded }) {
  const [open, setOpen] = useState(false);
  if (!excluded.length) return null;
  return (
    <div className="svq-excluded">
      {/* NO_TRACK — expands the excluded-measures list */}
      <button className="sv-disclosure" onClick={() => setOpen((o) => !o)}>
        Excluded ({excluded.length}) <span className="sv-disclosure__ar">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="svq-excluded__list">
          {excluded.map((m) => (
            <li key={m.id}><b>{m.label}</b>{m.exclusionReason ? ` — ${m.exclusionReason}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QmSection({ partition, totalMeasures, assessId, dismissed, onDismiss, onToast }) {
  const [showMore, setShowMore] = useState(false);

  const triggering = partition.triggering.filter((m) => !dismissed.has(m.id));
  const willClear = partition.willClear.filter((m) => !dismissed.has(m.id));
  const firing = triggering.length;

  const visibleTrig = triggering.slice(0, 2);
  const hiddenTrig = triggering.slice(2);

  return (
    <>
      <div className="sv-sec sv-sec--hero" data-anchor="qm">
        <h3>Quality measures — if this locks</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">{firing} of {totalMeasures} firing</span>
      </div>
      <div className="sv-wrap">
        {firing === 0 && willClear.length === 0 ? (
          <div className="sv-empty"><span className="sv-empty__c">✓</span> No quality measures trigger from this MDS as coded.</div>
        ) : null}

        {visibleTrig.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="trig" assessId={assessId} onDismiss={onDismiss} onToast={onToast} />
        ))}

        {showMore && hiddenTrig.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="trig" assessId={assessId} onDismiss={onDismiss} onToast={onToast} />
        ))}

        {willClear.map((m) => (
          <MeasureCard key={m.id} measure={m} tone="clear" assessId={assessId} onDismiss={onDismiss} onToast={onToast} />
        ))}

        {hiddenTrig.length > 0 && (
          // NO_TRACK — expands the collapsed QM tail
          <button className="svq-more" onClick={() => setShowMore((s) => !s)}>
            <span className="svq-more__n">+{hiddenTrig.length}</span> more triggering · <span className="svq-more__n">{partition.cleanCount}</span> clean
            <span className="svq-more__ar">{showMore ? '▴ hide' : '▾ show'}</span>
          </button>
        )}

        <ExcludedDisclosure excluded={partition.excluded} />
      </div>
    </>
  );
}
