import { useState } from 'preact/hooks';
import { resolveItemName } from '../../pdpm-analyzer/lib/mds-item-labels.js';
import { postDetectionDecision } from '../lib/verify-api.js';
import { openItemInPcc } from '../lib/view-item.js';

// Reason quick-picks differ by card kind (missed opportunity vs over-code risk).
const REASONS = {
  opportunity: ['Not supported by chart', 'Already addressed', 'Clinically inaccurate', 'Will code manually'],
  risk: ['Coded in error', 'Order discontinued', 'Not supported by chart'],
};

const COPY = {
  opportunity: {
    accept: 'Accept & code',
    acceptedText: (code) => `Accepted — will code ${code}`,
    dismiss: 'Dismiss…',
    dismissTitle: 'Why dismiss this?',
    confirm: 'Confirm dismiss',
    dismissedVerb: 'Dismissed',
  },
  risk: {
    accept: 'Confirm correct',
    acceptedText: () => 'Confirmed correct — evidence on file',
    dismiss: 'Remove…',
    dismissTitle: 'Why remove this code?',
    confirm: 'Confirm removal',
    dismissedVerb: 'Removed',
  },
};

function ImpactChips({ chips }) {
  if (!chips?.length) return null;
  return (
    <div className="sv-impact">
      {chips.map((c, i) => (
        <span key={i} className="sv-impact__chip">
          <span className="sv-impact__k">{c.label}</span>
          <span className="sv-impact__v">{c.text}</span>
        </span>
      ))}
    </div>
  );
}

function CodingCard({ item, assessId, onDecided, onToast }) {
  const copy = COPY[item.kind];
  const [decided, setDecided] = useState(item.decided); // 'accept' | 'dismiss' | null
  const [note, setNote] = useState(item.note || '');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [otherSel, setOtherSel] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [saving, setSaving] = useState(false);

  const label = resolveItemName(item.raw?.itemName, item.mdsItem);
  const confirmDisabled = saving || !reason || (otherSel && otherNote.trim().length === 0);

  async function save(decision, dismissReason) {
    setSaving(true);
    try {
      await postDetectionDecision({
        mdsItem: item.mdsItem,
        mdsColumn: item.raw?.mdsColumn || '',
        decision,
        note: dismissReason || '',
        assessId,
      });
      const next = decision === 'agree' ? 'accept' : 'dismiss';
      setDecided(next);
      setNote(dismissReason || '');
      setReasonOpen(false);
      onDecided(item.index, next);
      onToast(
        decision === 'agree'
          ? `✓ ${copy.acceptedText(item.displayCode)}`
          : `Logged: ${copy.dismissedVerb.toLowerCase()} — ${dismissReason}`,
        { good: decision === 'agree' },
      );
    } catch (err) {
      onToast(err?.message || 'Could not save decision', { good: false });
    } finally {
      setSaving(false);
    }
  }

  function undo() {
    setDecided(null);
    setNote('');
    setReason('');
    setOtherSel(false);
    setOtherNote('');
    onDecided(item.index, null);
  }

  function pickReason(r, isOther) {
    setReason(r);
    setOtherSel(isOther);
  }

  function confirmDismiss() {
    const finalReason = otherSel ? otherNote.trim() || 'Other' : reason;
    save('disagree', finalReason);
  }

  const kindCls = item.kind === 'risk' ? 'is-risk' : 'is-opportunity';
  const decidedCls = decided === 'accept' ? 'is-accepted' : decided === 'dismiss' ? 'is-dismissed' : '';

  return (
    <div className={`sv-card sv-coding ${kindCls} ${decidedCls}`}>
      {!decided && <div className="sv-needbar"><span className="sv-needbar__dot" /> Needs a decision</div>}

      <div className="sv-arow">
        <div className={`sv-arow__ic ${item.kind === 'risk' ? 'sv-ic--risk' : 'sv-ic--money'}`}>
          {item.kind === 'risk' ? '!' : '+$'}
        </div>
        <div className="sv-arow__main">
          <div className="sv-arow__t">
            <span className="sv-code">{item.displayCode}</span> {label}
          </div>
          {item.rationale ? <div className="sv-arow__d">{item.rationale}</div> : null}
          <ImpactChips chips={item.impact} />
        </div>
      </div>

      {!decided && !reasonOpen && (
        <div className="sv-decide">
          <button className="sv-btn sv-btn--ok" disabled={saving} onClick={() => save('agree', '')} data-track="super_verify_decision_saved">
            {copy.accept}
          </button>
          {/* NO_TRACK — opens the live MDS item in PCC */}
          <button className="sv-btn" onClick={() => openItemInPcc(assessId, item.mdsItem)}>{item.kind === 'risk' ? 'Review' : 'View'}</button>
          {/* NO_TRACK — opens the reason panel; the decision is tracked on confirm */}
          <button className="sv-btn" onClick={() => setReasonOpen(true)}>{copy.dismiss}</button>
        </div>
      )}

      {!decided && reasonOpen && (
        <div className="sv-reasonbox">
          <div className="sv-reasonbox__l">{copy.dismissTitle} <span>— logged to the coding audit trail</span></div>
          <div className="sv-reasons">
            {REASONS[item.kind].map((r) => (
              // NO_TRACK — reason chip selection; decision tracked on confirm
              <button key={r} className={`sv-rchip${reason === r && !otherSel ? ' is-sel' : ''}`} onClick={() => pickReason(r, false)}>{r}</button>
            ))}
            {/* NO_TRACK — "Other" reason chip */}
            <button className={`sv-rchip${otherSel ? ' is-sel' : ''}`} onClick={() => pickReason('Other', true)}>Other…</button>
          </div>
          {otherSel && (
            <textarea
              className="sv-rnote"
              placeholder="Add a note (required for “Other”)"
              value={otherNote}
              onInput={(e) => setOtherNote(e.target.value)}
            />
          )}
          <div className="sv-racts">
            <button className="sv-btn sv-btn--pri" disabled={confirmDisabled} onClick={confirmDismiss} data-track="super_verify_decision_saved">
              {saving ? 'Saving…' : copy.confirm}
            </button>
            {/* NO_TRACK — cancels the reason panel */}
            <button className="sv-btn" onClick={() => { setReasonOpen(false); setReason(''); setOtherSel(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {decided && (
        <div className={`sv-decided ${decided === 'accept' ? 'is-acc' : 'is-dis'}`}>
          <span className="sv-decided__mk">{decided === 'accept' ? '✓' : '✕'}</span>
          <span className="sv-decided__txt">
            {decided === 'accept' ? (
              <b>{copy.acceptedText(item.displayCode)}</b>
            ) : (
              <span><b>{copy.dismissedVerb}</b>{note ? ` · ${note}` : ''}</span>
            )}
          </span>
          {/* NO_TRACK — reverts a logged disposition */}
          <span className="sv-decided__undo" onClick={undo}>Undo</span>
        </div>
      )}
    </div>
  );
}

export function CodingSection({ items, pendingCount, assessId, onDecided, onToast }) {
  if (!items.length) return null;
  return (
    <>
      <div className="sv-sec" data-anchor="coding">
        <h3>Coding opportunities</h3>
        <span className="sv-sec__ln" />
        <span className={`sv-sec__ct${pendingCount > 0 ? ' is-alert' : ''}`}>
          {pendingCount > 0 ? `${pendingCount} need a decision` : 'all decided'}
        </span>
      </div>
      <div className="sv-wrap">
        {pendingCount === 0 && <div className="sv-empty"><span className="sv-empty__c">✓</span> All coding decisions logged.</div>}
        {items.map((item) => (
          <CodingCard key={item.index} item={item} assessId={assessId} onDecided={onDecided} onToast={onToast} />
        ))}
      </div>
    </>
  );
}
