import { useState, useRef, useCallback } from 'preact/hooks';
import {
  summaryTiles,
  captureTile,
  categorizeDetections,
  partitionMeasures,
  countOpenQueries,
  componentBreakdown,
} from '../lib/verify-derive.js';
import {
  formatPaymentRates,
  formatPaymentDelta,
  getPaymentModeLabel,
  isPaymentApplicable,
} from '../../../utils/payment.js';
import { useToasts } from './Toasts.jsx';
import { QmSection } from './QmSection.jsx';
import { CodingSection } from './CodingSection.jsx';
import { QueriesSection } from './QueriesSection.jsx';
import { InterviewsSection } from './InterviewsSection.jsx';
import { CertSection } from './CertSection.jsx';

function currentRateLabel(payment) {
  if (!isPaymentApplicable(payment)) return null;
  if (payment.mode === 'state_rate') {
    const r = payment.current?.rate;
    return r != null ? `$${Math.round(r).toLocaleString()}/day` : null;
  }
  const t = payment.current?.total;
  if (t == null) return null;
  return payment.mode === 'cmi' ? `${t.toFixed(3)} CMI` : `$${Math.round(t).toLocaleString()}/day`;
}

function Tile({ cls, n, label, muted, onClick }) {
  return (
    // NO_TRACK — summary tile only scrolls to its section
    <button className={`sv-stat ${cls}${muted ? ' is-muted' : ''}`} onClick={onClick}>
      <div className="sv-stat__n">{n}</div>
      <div className="sv-stat__l">{label}</div>
    </button>
  );
}

function ComponentRow({ row, maxDelta }) {
  const pct = maxDelta > 0 ? Math.max(8, Math.round((row.delta / maxDelta) * 100)) : 0;
  return (
    <div className={`sv-comp${row.changed ? '' : ' is-flat'}`}>
      <span className="sv-comp__label">{row.label}</span>
      <span className="sv-comp__cmg">
        {row.changed && row.currentCmg && row.potentialCmg ? (
          <>
            <b>{row.currentCmg}</b> <span className="sv-comp__arr">→</span> <b>{row.potentialCmg}</b>
          </>
        ) : (
          <span className="sv-comp__nochange">no change</span>
        )}
      </span>
      <span className="sv-comp__bar"><span className="sv-comp__barf" style={{ width: `${pct}%` }} /></span>
      <span className="sv-comp__delta">{row.delta > 0 ? `+$${Math.round(row.delta)}` : ''}</span>
    </div>
  );
}

function Reimbursement({ data, nItems }) {
  const rates = formatPaymentRates(data?.payment);
  const current = rates?.current || currentRateLabel(data?.payment);
  const modeLabel = rates?.label || getPaymentModeLabel(data?.payment) || 'PDPM';
  const delta = rates?.delta || formatPaymentDelta(data?.payment, 'long');

  const { rows, maxDelta, hippsCurrent, hippsPotential } = componentBreakdown(data);
  const hipps = hippsCurrent || '—';
  const changedRows = rows.filter((r) => r.changed);
  const hippsLifts = hippsPotential && hippsPotential !== hippsCurrent;

  return (
    <>
      <div className="sv-sec" data-anchor="reimb"><h3>Reimbursement</h3><span className="sv-sec__ln" /></div>
      <div className="sv-wrap">
        <div className="sv-card sv-reimb">
          <div className="sv-reimb__top">
            <div className="sv-hipps">{hipps}</div>
            <div className="sv-reimb__rate">
              {current ? <b>{current}</b> : <b>—</b>}
              <span>{modeLabel}</span>
            </div>
            {delta && (
              <div className="sv-reimb__opp">
                <b>▲ {delta}</b>
                <small>if items below coded</small>
              </div>
            )}
          </div>

          {changedRows.length > 0 && (
            <div className="sv-reimb__bd">
              <div className="sv-reimb__bdhead">Where the lift is</div>
              {changedRows.map((r) => (
                <ComponentRow key={r.key} row={r} maxDelta={maxDelta} />
              ))}
              {hippsLifts && (
                <div className="sv-reimb__lift">
                  Coding the {nItems} item{nItems === 1 ? '' : 's'} below lifts the HIPPS{' '}
                  <b>{hippsCurrent}</b> → <b>{hippsPotential}</b>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function VerifyResults({ data, assessId, onRescan, onClose }) {
  const [toast, ToastHost] = useToasts();
  const scrollRef = useRef(null);

  // Local UI state for live recompute of tiles + section counts.
  const [decisions, setDecisions] = useState({}); // detection index → 'dismiss'|null
  const [queriesDismissed, setQueriesDismissed] = useState(() => new Set());

  const onDecided = useCallback((index, decided) => {
    setDecisions((d) => ({ ...d, [index]: decided }));
  }, []);

  const onQueryDismiss = useCallback((id, restore) =>
    setQueriesDismissed((s) => {
      const next = new Set(s);
      if (restore) next.delete(id);
      else next.add(id);
      return next;
    }), []);

  // --- derive ---
  const baseTiles = summaryTiles(data);
  const cap = captureTile(data?.payment);
  const partition = partitionMeasures(data?.qm);
  const { items } = categorizeDetections(data);
  const effItems = items.map((i) => ({
    ...i,
    decided: i.index in decisions ? decisions[i.index] : i.decided,
  }));
  const reviewCount = effItems.filter((i) => i.decided !== 'dismiss').length;

  const totalMeasures = data?.qm?.measures?.length || 0;
  const qmTriggers = partition.firingCount;
  const queriesOpen = countOpenQueries(
    (data?.outstandingQueries || []).filter((q) => !queriesDismissed.has(q.id)),
  );

  const scrollTo = (anchor) =>
    scrollRef.current?.querySelector(`[data-anchor="${anchor}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="sv-results">
      <div className="sv-scroll" ref={scrollRef}>
        <div className="sv-summary">
          <Tile cls="sv-stat--qm" n={qmTriggers} label="QM triggers" muted={qmTriggers === 0} onClick={() => scrollTo('qm')} />
          <Tile cls="sv-stat--money" n={cap.display} label={cap.label} muted={cap.muted} onClick={() => scrollTo('reimb')} />
          <Tile cls="sv-stat--warn" n={queriesOpen} label="queries open" muted={queriesOpen === 0} onClick={() => scrollTo('query')} />
          <Tile cls="sv-stat--warn" n={baseTiles.interviewsMissing} label="interview missing" muted={baseTiles.interviewsMissing === 0} onClick={() => scrollTo('uda')} />
        </div>

        <Reimbursement data={data} nItems={effItems.length} />

        {data?.qm && (
          <QmSection partition={partition} totalMeasures={totalMeasures} assessId={assessId} />
        )}

        <CodingSection
          items={effItems}
          reviewCount={reviewCount}
          assessId={assessId}
          onDecided={onDecided}
          onToast={toast}
        />

        <QueriesSection
          queries={data?.outstandingQueries}
          assessId={assessId}
          dismissed={queriesDismissed}
          onDismiss={onQueryDismiss}
          onToast={toast}
        />

        <InterviewsSection
          compliance={data?.compliance}
          linkedUdas={data?.linkedUdas}
          assessId={assessId}
          assessmentType={data?.assessment?.description}
        />

        <CertSection medACert={data?.medACert} onToast={toast} />

        <div style={{ height: '14px' }} />
      </div>

      <footer className="sv-footer">
        <div className="sv-prov"><b>Evidence-backed.</b> Every item cites the chart — not a guess.</div>
        <div className="sv-footer__sp" />
        {/* NO_TRACK — re-runs the scrape + verify */}
        <button className="sv-btn" onClick={onRescan}>Re-scan</button>
        {/* NO_TRACK — acknowledges + closes the panel */}
        <button className="sv-btn sv-btn--pri" onClick={onClose}>Acknowledge</button>
      </footer>

      <ToastHost />
    </div>
  );
}
