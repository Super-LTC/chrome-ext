import { useState, useRef, useCallback } from 'preact/hooks';
import {
  summaryTiles,
  captureTile,
  categorizeDetections,
  groupQmByBucket,
  countOpenQueries,
  componentBreakdown,
} from '../lib/verify-derive.js';
import { isPaymentApplicable, formatPaymentRates } from '../../../utils/payment.js';
import { PaymentCard } from '../../pdpm-analyzer/components/PaymentCard.jsx';
import { useToasts } from './Toasts.jsx';
import { QmSection } from './QmSection.jsx';
import { CodingSection } from './CodingSection.jsx';
import { QueriesSection } from './QueriesSection.jsx';
import { InterviewsSection } from './InterviewsSection.jsx';
import { CertSection } from './CertSection.jsx';

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

function Reimbursement({ data }) {
  // Single source of truth for the numbers: the analyzer's PaymentCard, driven by
  // `payment` (works in every mode). `hasLift` is computed the SAME way PaymentCard
  // decides to render — so the header never says "no capture" while the card shows a
  // lift (the old reimbursementHeadline-vs-payment contradiction).
  const payment = data?.payment;
  const hasLift = isPaymentApplicable(payment) && !!formatPaymentRates(payment);

  const { rows, maxDelta, hippsCurrent, hippsPotential } = componentBreakdown(data);
  const hipps = hippsCurrent || data?.calculation?.hippsCode || '—';
  const hippsChange =
    data?.reimbursementHeadline?.detail ||
    (hippsPotential && hippsPotential !== hippsCurrent ? `${hippsCurrent} → ${hippsPotential}` : null);
  // Only $-bearing rows (Medicare). For CMI/state-rate componentRevenue is null →
  // would render empty bars; PaymentCard carries that detail instead.
  const dollarRows = rows.filter((r) => r.changed && r.delta > 0);

  return (
    <>
      <div className="sv-sec" data-anchor="reimb"><h3>Reimbursement</h3><span className="sv-sec__ln" /></div>
      <div className="sv-wrap">
        <div className="sv-card sv-reimb">
          <div className="sv-reimb__top">
            <div className="sv-hipps">{hipps}</div>
            {hippsChange ? <div className="sv-reimb__hippschg">{hippsChange}</div> : null}
            {!hasLift ? <div className="sv-reimb__opp"><small>No additional capture as coded</small></div> : null}
          </div>

          {hasLift && <div className="sv-reimb__pay"><PaymentCard data={data} /></div>}

          {dollarRows.length > 0 && (
            <div className="sv-reimb__bd">
              <div className="sv-reimb__bdhead">Where the lift is</div>
              {dollarRows.map((r) => (
                <ComponentRow key={r.key} row={r} maxDelta={maxDelta} />
              ))}
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
  const cap = captureTile(data?.reimbursementHeadline, data?.payment);
  const qmGroups = groupQmByBucket(data?.qm);
  const { items } = categorizeDetections(data);
  const effItems = items.map((i) => ({
    ...i,
    decided: i.index in decisions ? decisions[i.index] : i.decided,
  }));
  const reviewCount = effItems.filter((i) => i.decided !== 'dismiss').length;

  const totalMeasures = data?.qm?.measures?.length || 0;
  const qmTriggers = qmGroups.firingCount;
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

        <Reimbursement data={data} />

        {data?.qm && (
          <QmSection groups={qmGroups} totalMeasures={totalMeasures} assessId={assessId} />
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
