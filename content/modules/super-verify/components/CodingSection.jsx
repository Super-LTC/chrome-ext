import { useState } from 'preact/hooks';
import { resolveItemName } from '../../pdpm-analyzer/lib/mds-item-labels.js';
import { postDetectionDecision } from '../lib/verify-api.js';
import { openItemInPcc } from '../lib/view-item.js';
import { track } from '../../../utils/analytics.js';
import { useItemDetail } from '../../pdpm-analyzer/hooks/useItemDetail.js';
import { ItemDetail } from '../../../components/ItemDetail.jsx';
import { openEvidence } from '../../../utils/evidence-helpers.js';

// Fetches the real per-item evidence on expand — the same endpoint + render the
// PDPM Analyzer uses (useItemDetail → ItemDetail compact). The verify response's
// inline rationale is often empty, which is why the old drawer said "no evidence".
function EvidenceDrawer({ item, assessId }) {
  const { data, loading, error } = useItemDetail(item.mdsItem, item.raw?.categoryKey, { assessmentId: assessId });
  return (
    <div className="sv-evidence">
      {loading && <div className="sv-evidence__loading"><span className="sv-spinner sv-spinner--sm" /> Loading evidence…</div>}
      {error && <p className="sv-evidence__body">{error}</p>}
      {!loading && !error && (data
        ? <ItemDetail variant="compact" data={data} detectionItem={item.raw} mdsItem={item.mdsItem} onViewSource={openEvidence} />
        : <p className="sv-evidence__body">{item.raw?.rationale || 'No evidence on file for this item.'}</p>)}
      {/* NO_TRACK — opens the item in PCC for the full chart */}
      <button className="sv-btn sv-btn--ghost sv-evidence__open" onClick={() => openItemInPcc(assessId, item.mdsItem)}>
        Open {item.displayCode} in PointClickCare ↗
      </button>
    </div>
  );
}

// Reason quick-picks differ by card kind (missed opportunity vs over-code risk).
const REASONS = {
  opportunity: ['Not supported by chart', 'Already addressed', 'Clinically inaccurate', 'Will code manually'],
  risk: ['Coded in error', 'Order discontinued', 'Not supported by chart'],
};

const COPY = {
  opportunity: {
    // A missed code — not on the MDS yet.
    verdict: 'Not coded yet — the chart supports adding this.',
    acceptedText: () => 'Accepted — will code',
    dismiss: 'Dismiss…',
    dismissTitle: 'Why dismiss this?',
    confirm: 'Confirm dismiss',
    dismissedVerb: 'Dismissed',
  },
  risk: {
    // Already coded on the MDS, but documentation may not support it.
    verdict: 'Coded on this MDS — documentation may not support it.',
    accept: 'Looks right',
    acceptedText: () => 'Confirmed — coding looks correct',
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

// The documentation gap, in plain language — answers "is there a diagnosis / a
// treatment?" Only meaningful for over-code (risk) items.
function DxTxStatus({ item }) {
  const dx = item.diagnosisPassed;
  const tx = item.activeStatusPassed;
  if (typeof dx !== 'boolean' && typeof tx !== 'boolean') return null;
  return (
    <div className="sv-dxtx">
      {typeof dx === 'boolean' && (
        <span className={`sv-dxtx__chip ${dx ? 'is-ok' : 'is-no'}`}>{dx ? '✓ Diagnosis documented' : '✗ No diagnosis documented'}</span>
      )}
      {typeof tx === 'boolean' && (
        <span className={`sv-dxtx__chip ${tx ? 'is-ok' : 'is-no'}`}>{tx ? '✓ Active treatment' : '✗ No active treatment'}</span>
      )}
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
  const [evidOpen, setEvidOpen] = useState(false);

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
      track('super_verify_decision_saved', {
        item_code: item.displayCode,
        decision,
        has_reason: !!dismissReason,
      });
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
      <div className="sv-arow">
        <div className={`sv-arow__ic ${item.kind === 'risk' ? 'sv-ic--risk' : 'sv-ic--money'}`}>
          {item.kind === 'risk' ? '!' : '+$'}
        </div>
        <div className="sv-arow__main">
          <div className="sv-arow__t">
            <span className="sv-code">{item.displayCode}</span> {label}
          </div>
          <div className="sv-verdict">{copy.verdict}</div>
          {item.kind === 'risk' && <DxTxStatus item={item} />}
          <ImpactChips chips={item.impact} />
          {/* Risk has no evidence drawer — show the solver's reasoning inline. */}
          {item.kind === 'risk' && item.rationale ? <div className="sv-arow__d">{item.rationale}</div> : null}
        </div>
      </div>

      {item.kind === 'opportunity' && evidOpen && <EvidenceDrawer item={item} assessId={assessId} />}

      {!decided && !reasonOpen && (
        <div className="sv-decide">
          {item.kind === 'opportunity' ? (
            // NO_TRACK — toggles the inline evidence drawer
            <button className="sv-btn sv-btn--pri" onClick={() => setEvidOpen((o) => !o)}>{evidOpen ? 'Hide evidence' : 'View evidence'}</button>
          ) : (
            // NO_TRACK — confirms the code is correct (tracked in save())
            <button className="sv-btn sv-btn--ok" disabled={saving} onClick={() => save('agree', '')}>{copy.accept}</button>
          )}
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
            {/* NO_TRACK — fires super_verify_decision_saved (with props) on success in save() */}
            <button className="sv-btn sv-btn--pri" disabled={confirmDisabled} onClick={confirmDismiss}>
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

export function CodingSection({ items, reviewCount, assessId, onDecided, onToast }) {
  if (!items.length) return null;
  return (
    <>
      <div className="sv-sec" data-anchor="coding">
        <h3>Coding opportunities</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">{reviewCount > 0 ? `${reviewCount} found` : 'all dismissed'}</span>
      </div>
      <div className="sv-wrap">
        {reviewCount === 0 && <div className="sv-empty"><span className="sv-empty__c">✓</span> No open coding opportunities.</div>}
        {items.map((item) => (
          <CodingCard key={item.index} item={item} assessId={assessId} onDecided={onDecided} onToast={onToast} />
        ))}
      </div>
    </>
  );
}
