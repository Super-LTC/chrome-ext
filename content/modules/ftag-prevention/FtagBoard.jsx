/**
 * FtagBoard — root of the F-Tag Prevention (Survey Readiness) overlay.
 *
 * Facility-scoped: shows the building the nurse is in (passed as facilityName).
 * No facility switcher — cross-building lives in the web app; server enforces access.
 *
 *   ┌ header ───────────────────────────────────────────────┐
 *   │  Survey Readiness · Newark Rehabilitation          ✕  │
 *   ├ summary strip ────────────────────────────────────────┤
 *   │  110 open · 0 acute · 4 critical                      │
 *   ├ status tabs:  [Open 110] [Snoozed N] [Resolved N] ────┤
 *   ├ (Open only) compact cards = tag filter ───────────────┤
 *   │  list — actions inline; Snoozed/Resolved get reverse  │
 *   └───────────────────────────────────────────────────────┘
 */
import { useState, useMemo, useEffect } from 'preact/hooks';
import { track } from '../../utils/analytics.js';
import { useFtagFindings } from './hooks/useFtagFindings.js';
import { useFtagActions } from './hooks/useFtagActions.js';
import { tagFilters, severityRank, dateBucket } from './utils/derive.js';
import { CardsStrip } from './components/CardsStrip.jsx';
import { FindingListRow } from './components/FindingListRow.jsx';
import { HandledList } from './components/HandledList.jsx';
import { SourceModal } from './components/SourceModal.jsx';

export function FtagBoard({ facilityName, orgSlug, onClose }) {
  const [tab, setTab] = useState('open');           // open | snoozed | resolved
  const [tagFilter, setTagFilter] = useState(null); // null = All (open tab only)
  const [sevFilter, setSevFilter] = useState('all'); // all | critical | high — severity narrow
  const [collapsed, setCollapsed] = useState(() => new Set(['older'])); // date sections collapsed by key
  const [sourceFinding, setSourceFinding] = useState(null);

  const toggleSection = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  useEffect(() => { track('ftag_prevention_opened', { source: 'fab' }); }, []);

  const { findings, recentlyResolved, snoozed, loading, error, retry } =
    useFtagFindings({ facilityName, orgSlug });
  const { resolve, snooze, unsnooze, reopen, pending } = useFtagActions({ facilityName, orgSlug });

  const tiles = useMemo(() => tagFilters(findings), [findings]);

  const visible = useMemo(() => {
    const list = tagFilter ? findings.filter((f) => f.ftag === tagFilter) : findings;
    return [...list].sort((a, b) =>
      (severityRank(b.severity) - severityRank(a.severity)) ||
      (Date.parse(b.triggeredAt || 0) - Date.parse(a.triggeredAt || 0))
    );
  }, [findings, tagFilter]);

  // Group the (severity-sorted) visible findings into date sections so the feed
  // reads as "what's new today / yesterday / this week" instead of one wall.
  // Severity filter narrows within that. Sections keep visible's internal order.
  const sections = useMemo(() => {
    const narrowed = sevFilter === 'all' ? visible : visible.filter((f) => f.severity === sevFilter);
    const byKey = new Map();
    for (const f of narrowed) {
      const b = dateBucket(f.triggeredAt);
      if (!byKey.has(b.key)) byKey.set(b.key, { ...b, items: [] });
      byKey.get(b.key).items.push(f);
    }
    return [...byKey.values()].sort((a, b) => a.rank - b.rank);
  }, [visible, sevFilter]);

  const openCount = findings.length;
  const acuteCount = useMemo(() => findings.filter((f) => f.acute).length, [findings]);
  const criticalCount = useMemo(() => findings.filter((f) => f.severity === 'critical').length, [findings]);

  const actions = { resolve, snooze };

  const handleUnsnooze = async (f) => {
    try { await unsnooze(f.id); track('ftag_finding_unsnoozed', { ftag: f.ftag }); toast(`Unsnoozed — ${f.patientName} back in the list.`, 'success'); }
    catch (_) { toast('Could not unsnooze.', 'error'); }
  };
  const handleReopen = async (f) => {
    try { await reopen(f.id); track('ftag_finding_reopened', { ftag: f.ftag }); toast(`Reopened — ${f.patientName} back in the list.`, 'success'); }
    catch (_) { toast('Could not reopen finding.', 'error'); }
  };

  return (
    <div className="ftp__overlay" role="dialog" aria-modal="true" aria-labelledby="ftp-title">
      <div className="ftp__backdrop" onClick={onClose}></div>

      <div className="ftp__modal">
        <header className="ftp__header">
          <div className="ftp__title-row">
            <div className="ftp__title-group">
              <span className="ftp__eyebrow">F-Tag Prevention</span>
              <h2 className="ftp__title" id="ftp-title">Survey Readiness</h2>
              {facilityName && <span className="ftp__facility">{facilityName}</span>}
            </div>
            <div className="ftp__header-right">
              <div className="ftp__hstats">
                <Stat num={openCount} label="Open" />
                <Stat num={acuteCount} label="Acute" tone="urgent" />
                <Stat num={criticalCount} label="Critical" tone="alert" />
              </div>
              <button type="button" className="ftp__close" onClick={onClose} aria-label="Close"> {/* NO_TRACK */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="ftp-tabs" role="tablist">
          <Tab label="Open" count={openCount} active={tab === 'open'} onClick={() => setTab('open')} />
          <Tab label="Snoozed" count={snoozed.length} active={tab === 'snoozed'} onClick={() => setTab('snoozed')} />
          <Tab label="Resolved" count={recentlyResolved.length} active={tab === 'resolved'} onClick={() => setTab('resolved')} />
        </div>

        {tab === 'open' && !loading && !error && tiles.length > 0 && (
          <CardsStrip tiles={tiles} total={openCount} activeTag={tagFilter} onSelect={setTagFilter} />
        )}

        {loading ? (
          <div className="ftp__loading">Loading survey readiness…</div>
        ) : error ? (
          <div className="ftp__error">
            <div>Failed to load F-Tag findings</div>
            <div className="ftp__error-detail">{error}</div>
            <button type="button" className="ftp__retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
          </div>
        ) : (
          <div className="ftp__body">
            {tab === 'open' && (
              <>
                {visible.length > 0 && (
                  <div className="ftp-sevfilter" role="group" aria-label="Filter by severity">
                    {SEV_FILTERS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className={`ftp-sevfilter__btn${sevFilter === s.key ? ' is-active' : ''}`}
                        onClick={() => setSevFilter(s.key)}
                      > {/* NO_TRACK */}
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                {sections.length === 0 ? (
                  <Clean tagFilter={tagFilter} />
                ) : (
                  sections.map((sec) => {
                    const isCollapsed = collapsed.has(sec.key);
                    return (
                      <section className="ftp-dsec" key={sec.key}>
                        <button type="button" className="ftp-dsec__head" onClick={() => toggleSection(sec.key)} aria-expanded={!isCollapsed}> {/* NO_TRACK */}
                          <span className={`ftp-dsec__caret${isCollapsed ? ' is-collapsed' : ''}`} aria-hidden="true">▾</span>
                          <span className="ftp-dsec__label">{sec.label}</span>
                          <span className="ftp-dsec__count">{sec.items.length}</span>
                        </button>
                        {!isCollapsed && (
                          <div className="ftp-flist">
                            {sec.items.map((f) => (
                              <FindingListRow key={f.id} finding={f} actions={actions} pending={pending} onViewSource={setSourceFinding} />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })
                )}
              </>
            )}

            {tab === 'snoozed' && (
              <HandledList kind="snoozed" items={snoozed} onViewSource={setSourceFinding} onAction={handleUnsnooze} pending={pending} />
            )}
            {tab === 'resolved' && (
              <HandledList kind="resolved" items={recentlyResolved} onViewSource={setSourceFinding} onAction={handleReopen} pending={pending} />
            )}
          </div>
        )}
      </div>

      {sourceFinding && (
        <SourceModal finding={sourceFinding} facilityName={facilityName} orgSlug={orgSlug} onClose={() => setSourceFinding(null)} />
      )}
    </div>
  );
}

const SEV_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
];

function Stat({ num, label, tone }) {
  return (
    <div className="ftp-stat">
      <span className={`ftp-stat__num ${tone ? `ftp-stat__num--${tone}` : ''}`}>{num}</span>
      <span className="ftp-stat__label">{label}</span>
    </div>
  );
}

function Tab({ label, count, active, onClick }) {
  return (
    <button type="button" className={`ftp-tab ${active ? 'is-active' : ''}`} onClick={onClick} role="tab" aria-selected={active}> {/* NO_TRACK */}
      {label}<span className="ftp-tab__count">{count}</span>
    </button>
  );
}

function Clean({ tagFilter }) {
  return (
    <div className="ftp-clean">
      <div className="ftp-clean__check">✓</div>
      <div className="ftp-clean__title">{tagFilter ? 'No open findings for this tag' : 'No open findings'}</div>
      <div className="ftp-clean__sub">{tagFilter ? 'Try another card or clear the filter.' : 'This facility has no active deficiency risk in the current window.'}</div>
    </div>
  );
}

function toast(message, type) {
  if (typeof window.SuperToast?.show === 'function') window.SuperToast.show({ message, type });
}
