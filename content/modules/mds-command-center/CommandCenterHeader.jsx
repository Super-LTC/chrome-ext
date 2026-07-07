/**
 * CommandCenterHeader — sticky top bar for the MDS Command Center overlay.
 *
 * Layout:
 *   - Title + close button
 *   - Summary stats strip
 *   - View switcher (Overview | Assessments | Queries)
 *   - [Assessments only] Filter row: class + payer dropdowns
 *   - [Assessments only] Urgency filter pills
 */
import { Selector } from '../../components/Selector.jsx';

const URGENCY_PILLS = [
  { value: 'all',         label: 'All',         color: null },
  { value: 'overdue',     label: 'Overdue',     color: '#ef4444' },
  { value: 'urgent',      label: 'Urgent',      color: '#f97316' },
  { value: 'approaching', label: 'Approaching', color: '#eab308' },
  { value: 'on_track',    label: 'On Track',    color: '#22c55e' },
];

function StatPill({ value, label, highlight }) {
  return (
    <span class={`mds-cc__stat${highlight ? ' mds-cc__stat--highlight' : ''}`}>
      <strong>{value}</strong> {label}
    </span>
  );
}

export function CommandCenterHeader({
  summary,
  facilityName,
  onClose,
  activeView,
  onViewChange,
  viewMode,
  onViewModeChange,
  isFullscreen,
  onToggleFullscreen,
  queryCount,
  queryHasUnseen,
  certCount,
  certHasUnseen,
  certsEnabled,
  ipaEnabled,
  ipaCount,
  complianceGaps,
  payerFilter,
  onPayerFilterChange,
  classFilter,
  onClassFilterChange,
  focusFilter,
  onFocusFilterChange,
  urgencyFilter,
  onUrgencyFilterChange,
}) {
  const total             = summary?.total ?? 0;
  const urgentCount       = summary?.urgent ?? 0;
  const hippsCount        = summary?.hippsImprovements ?? summary?.withHippsImprovements ?? 0;
  const pendingQueryCount = summary?.pendingQueries ?? summary?.pendingQueriesCount ?? 0;
  const revenuePerDay     = summary?.totalRevenueOpportunityPerDay ?? 0;

  return (
    <div class="mds-cc__header">

      {/* ── Title row ── */}
      <div class="mds-cc__title-row">
        <div class="mds-cc__title-group">
          <span class="mds-cc__title">MDS Command Center</span>
          {facilityName && <span class="mds-cc__facility-name">{facilityName}</span>}
        </div>
        <div class="mds-cc__title-actions">
          {onToggleFullscreen && (
            <button
              class={`mds-cc__icon-btn${isFullscreen ? ' mds-cc__icon-btn--exit' : ''}`}
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                  <span>Exit fullscreen</span>
                </>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3h6" />
                  <path d="M3 3v6" />
                  <path d="M21 3h-6" />
                  <path d="M21 3v6" />
                  <path d="M3 21h6" />
                  <path d="M3 21v-6" />
                  <path d="M21 21h-6" />
                  <path d="M21 21v-6" />
                </svg>
              )}
            </button>
          )}
          {/* NO_TRACK: close-X */}
          <button class="mds-cc__close-btn" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6"  y1="6" x2="18" y2="18" />
          </svg>
        </button>
        </div>
      </div>

      {/* ── Stats strip (hidden on Planner/Rounding — they have their own summaries) ── */}
      {activeView !== 'planner' && activeView !== 'rounding' && (
        <div class="mds-cc__stats-strip">
          <StatPill value={total} label="assessments" />
          <span class="mds-cc__stats-sep">|</span>
          <StatPill value={urgentCount} label="urgent" highlight={urgentCount > 0} />
          {revenuePerDay > 0 && (
            <>
              <span class="mds-cc__stats-sep">|</span>
              <span class="mds-cc__stat mds-cc__stat--revenue">
                <strong>${Math.round(revenuePerDay)}/day available</strong>
                {hippsCount > 0 && <span class="mds-cc__stat-sub"> across {hippsCount} improvements</span>}
              </span>
            </>
          )}
          <span class="mds-cc__stats-sep">|</span>
          <StatPill value={pendingQueryCount} label="pending queries" highlight={pendingQueryCount > 0} />
        </div>
      )}

      {/* ── View switcher ── */}
      <div class="mds-cc__view-switcher">
        <button
          class={`mds-cc__view-tab${activeView === 'assessments' ? ' mds-cc__view-tab--active' : ''}`}
          onClick={() => onViewChange('assessments')}
        >
          Assessments
        </button>
        {ipaEnabled && (
          <button
            class={`mds-cc__view-tab${activeView === 'ipa' ? ' mds-cc__view-tab--active' : ''}`}
            onClick={() => onViewChange('ipa')}
            title="IPA (Medicare A) and new-quarterly (Medicaid case-mix) payment opportunities"
          >
            IPA
            {ipaCount > 0 && <span class="mds-cc__view-tab-badge">{ipaCount}</span>}
          </button>
        )}
        <button
          class={`mds-cc__view-tab${activeView === 'queries' ? ' mds-cc__view-tab--active' : ''}`}
          onClick={() => onViewChange('queries')}
        >
          Queries
          {queryCount > 0 && <span class="mds-cc__view-tab-badge">{queryCount}</span>}
          {queryHasUnseen && <span class="mds-cc__view-tab-dot" title="New recently-signed queries to review" />}
        </button>
        {certsEnabled && (
          <button
            class={`mds-cc__view-tab${activeView === 'certs' ? ' mds-cc__view-tab--active' : ''}`}
            onClick={() => onViewChange('certs')}
          >
            Certs
            {certCount > 0 && <span class="mds-cc__view-tab-badge">{certCount}</span>}
            {certHasUnseen && <span class="mds-cc__view-tab-dot" title="New recently-signed certs to review" />}
          </button>
        )}
        <button
          class={`mds-cc__view-tab${activeView === 'compliance' ? ' mds-cc__view-tab--active' : ''}`}
          onClick={() => onViewChange('compliance')}
        >
          Care Plan
          {complianceGaps > 0 && <span class="mds-cc__view-tab-badge mds-cc__view-tab-badge--amber">{complianceGaps}</span>}
        </button>
        <button
          class={`mds-cc__view-tab${activeView === 'rounding' ? ' mds-cc__view-tab--active' : ''}`}
          onClick={() => onViewChange('rounding')}
        >
          Rounding
        </button>
      </div>

      {/* ── Assessments filter row ── */}
      {activeView === 'assessments' && (
        <div class="mds-cc__filter-row">
          {viewMode !== 'calendar' && (
            <>
              <Selector
                size="compact"
                options={[
                  { value: 'all', label: 'All Classes' },
                  { value: 'pps_payment', label: 'PPS / Payment' },
                  { value: 'obra_cmi', label: 'OBRA / CMI' },
                  { value: 'end_of_stay', label: 'End of Stay' },
                ]}
                value={classFilter}
                onChange={onClassFilterChange}
                ariaLabel="Assessment class filter"
              />
              <Selector
                size="compact"
                options={[
                  { value: 'all', label: 'All Payers' },
                  { value: 'medicare_a', label: 'Medicare A' },
                  { value: 'medicaid', label: 'Medicaid' },
                  { value: 'managed_care', label: 'Managed Care' },
                ]}
                value={payerFilter}
                onChange={onPayerFilterChange}
                ariaLabel="Payer filter"
              />
              <Selector
                size="compact"
                options={[
                  { value: 'all', label: 'All Assessments' },
                  { value: 'revenue', label: 'Revenue Opportunities' },
                  { value: 'issues', label: 'Has Issues' },
                ]}
                value={focusFilter}
                onChange={onFocusFilterChange}
                ariaLabel="Focus filter"
              />
            </>
          )}
          {onViewModeChange && (
            <div class="mds-cc__viewmode-toggle">
              <button
                class={`mds-cc__viewmode-btn${viewMode === 'list' ? ' mds-cc__viewmode-btn--active' : ''}`}
                onClick={() => onViewModeChange('list')}
                title="List view"
                aria-label="List view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                List
              </button>
              <button
                class={`mds-cc__viewmode-btn${viewMode === 'calendar' ? ' mds-cc__viewmode-btn--active' : ''}`}
                onClick={() => onViewModeChange('calendar')}
                title="Calendar view"
                aria-label="Calendar view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Calendar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Urgency filter pills (assessments tab only) ── */}
      {activeView === 'assessments' && viewMode !== 'calendar' && onUrgencyFilterChange && (
        <div class="mds-cc__urgency-pills">
          {URGENCY_PILLS.map(pill => {
            const isActive = urgencyFilter === pill.value;
            return (
              <button
                key={pill.value}
                class={`mds-cc__urgency-pill${isActive ? ' mds-cc__urgency-pill--active' : ''}`}
                style={isActive && pill.color ? { background: pill.color, borderColor: pill.color, color: '#fff' } : undefined}
                onClick={() => onUrgencyFilterChange(pill.value)}
              >
                {pill.color && <span class="mds-cc__urgency-pill-dot" style={{ background: isActive ? '#fff' : pill.color }} />}
                {pill.label}
              </button>
            );
          })}
          {/* Revenue quick-filter toggle */}
          {onFocusFilterChange && (
            <button
              class={`mds-cc__urgency-pill mds-cc__revenue-pill${focusFilter === 'revenue' ? ' mds-cc__revenue-pill--active' : ''}`}
              onClick={() => onFocusFilterChange(focusFilter === 'revenue' ? 'all' : 'revenue')}
              title="Show only assessments with revenue opportunities"
            >
              <span class="mds-cc__revenue-pill-icon">$</span>
              Revenue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
