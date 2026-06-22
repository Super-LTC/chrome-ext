import { resolveItemName } from '../../pdpm-analyzer/lib/mds-item-labels.js';
import { openItemInPcc } from '../lib/view-item.js';

const OPEN = new Set(['pending', 'sent', 'awaiting_response']);

function age(sentAt) {
  if (!sentAt) return null;
  const days = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86400000);
  if (Number.isNaN(days)) return null;
  return days <= 0 ? 'today' : `${days}d ago`;
}

export function QueriesSection({ queries, assessId, dismissed, onDismiss, onToast }) {
  const open = (queries || []).filter((q) => OPEN.has(q.status) && !dismissed.has(q.id));
  if (!(queries || []).some((q) => OPEN.has(q.status))) return null; // section absent when no queries

  return (
    <>
      <div className="sv-sec" data-anchor="query">
        <h3>Physician queries</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">{open.length ? `${open.length} open` : 'done'}</span>
      </div>
      <div className="sv-wrap">
        {open.length === 0 && <div className="sv-empty"><span className="sv-empty__c">✓</span> No open queries.</div>}
        {open.map((q) => {
          const sent = q.status === 'sent' || q.status === 'awaiting_response';
          const rel = age(q.sentAt);
          return (
            <div key={q.id} className="sv-card">
              <div className="sv-arow">
                <div className="sv-arow__ic sv-ic--warn">⧖</div>
                <div className="sv-arow__main">
                  <div className="sv-arow__t">
                    {q.mdsItem ? <span className="sv-code">{q.mdsItem}</span> : null} {resolveItemName(q.mdsItemName, q.mdsItem)}
                    <span className={`sv-b ${sent ? 'sv-b--warn' : 'sv-b--mut'}`}>
                      {sent ? `Sent${rel ? ` · ${rel}` : ''}` : 'Draft'}
                    </span>
                  </div>
                  <div className="sv-arow__d">Open physician query awaiting signature.</div>
                </div>
              </div>
              <div className="sv-acts">
                {q.mdsItem && (
                  // NO_TRACK — opens the related MDS item in PCC
                  <button className="sv-btn" onClick={() => openItemInPcc(assessId, q.mdsItem)}>View</button>
                )}
                {/* NO_TRACK — awareness dismiss (local) */}
                <button className="sv-btn sv-btn--ghost" onClick={() => { onDismiss(q.id); onToast('Dismissed', { undo: () => onDismiss(q.id, true) }); }}>Dismiss</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
