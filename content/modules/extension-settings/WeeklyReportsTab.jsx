/**
 * Weekly Reports subtab — opt in/out, pick which reports, choose how multi-building
 * reports are delivered (one combined roll-up vs one email per building), and set
 * the delivery day + time. The report always covers every building the user can
 * access; delivery is the only building-related choice, and only when they have
 * more than one building. Reads/writes /api/extension/weekly-report via settings-api.
 */
import { useState, useEffect, useCallback } from 'preact/hooks';
import { getWeeklyReport, saveWeeklyReport } from './utils/settings-api.js';
import { Switch, Section, SaveBar } from './ui.jsx';
import { track } from '../../utils/analytics.js';

// Canonical report catalog (keys match the backend WeeklyReportCardKey set).
const REPORTS = [
  { key: 'reimbursement', title: 'Reimbursement Opportunities', desc: 'Revenue left on the table from under-coded assessments.' },
  { key: 'coding_match', title: 'Coding Match', desc: 'How closely final MDS coding matches the evidence.' },
  { key: 'cna_scorecard', title: 'CNA Scorecard', desc: 'Aide documentation quality and week-over-week trend.' },
  { key: 'late_and_overdue', title: 'Late & Overdue', desc: 'MDS, certifications, and UDAs slipping past due.' },
  { key: 'qm_opportunities', title: 'QM Opportunities', desc: 'Quality-measure fixes before the quarter locks.' },
  { key: 'compliance_ftag', title: 'Compliance / F-Tag', desc: 'Survey-readiness risks, ranked by severity.' },
];

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatHour(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export function WeeklyReportsTab({ facilityName }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [cards, setCards] = useState([]);
  const [deliveryMode, setDeliveryMode] = useState('rollup');
  const [buildingCount, setBuildingCount] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(9);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getWeeklyReport();
        if (!alive) return;
        setEnabled(cfg.enabled ?? true);
        setCards(Array.isArray(cfg.cards) ? cfg.cards : []);
        setDeliveryMode(cfg.deliveryMode === 'per_building' ? 'per_building' : 'rollup');
        setBuildingCount(typeof cfg.buildingCount === 'number' ? cfg.buildingCount : 1);
        setDayOfWeek(typeof cfg.dayOfWeek === 'number' ? cfg.dayOfWeek : 1);
        setHour(typeof cfg.hour === 'number' ? cfg.hour : 9);
      } catch (e) {
        if (alive) setLoadError(e.message || 'Could not load your settings.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const mark = () => { setDirty(true); setStatus(null); };
  // Toggle preserves existing order and appends newly-added reports at the end,
  // so a custom order set on the web isn't reshuffled by an extension edit.
  const toggleReport = (k) => {
    setCards((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
    mark();
  };

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveWeeklyReport({ enabled, cards, deliveryMode, dayOfWeek, hour });
      track('weekly_report_settings_saved', {
        source: 'extension',
        enabled,
        deliveryMode,
        buildingCount,
        cardCount: cards.length,
      });
      setDirty(false);
      setStatus({ kind: 'ok', text: 'Saved — your weekly report is updated.' });
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  }, [enabled, cards, deliveryMode, dayOfWeek, hour, buildingCount]);

  if (loading) {
    return (
      <div class="sset-body">
        <div class="sset-loading"><div class="sset-spinner" /><span>Loading your settings…</span></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div class="sset-body">
        <div class="sset-notice">
          <div class="sset-notice__title">Couldn't load settings</div>
          <div class="sset-notice__text">{loadError}</div>
        </div>
      </div>
    );
  }

  const multi = buildingCount > 1;

  return (
    <>
      <div class="sset-body">
        <div class="sset-master">
          <div class="sset-master__text">
            <div class="sset-master__title">Weekly report email</div>
            <div class="sset-master__sub">A clear summary of what needs attention, every week.</div>
          </div>
          <Switch checked={enabled} onChange={(v) => { setEnabled(v); mark(); }} />
        </div>

        <div class={`sset-collapsible${enabled ? '' : ' is-off'}`}>
          <Section label="What's included" hint={`${cards.length} selected`}>
            {REPORTS.map((r) => (
              <button
                key={r.key}
                type="button"
                class={`sset-report${cards.includes(r.key) ? ' is-on' : ''}`}
                onClick={() => toggleReport(r.key)}
                aria-pressed={cards.includes(r.key) ? 'true' : 'false'}
              >
                <span class="sset-check">{CHECK}</span>
                <span class="sset-report__text">
                  <span class="sset-report__title">{r.title}</span>
                  <span class="sset-report__desc">{r.desc}</span>
                </span>
              </button>
            ))}
          </Section>

          {multi ? (
            <Section label="Delivery" hint={`${buildingCount} buildings`}>
              <div class="sset-seg">
                <button
                  type="button"
                  class={`sset-seg__opt${deliveryMode === 'rollup' ? ' is-active' : ''}`}
                  onClick={() => { setDeliveryMode('rollup'); mark(); }}
                >
                  One combined email<small>All {buildingCount} buildings in a roll-up</small>
                </button>
                <button
                  type="button"
                  class={`sset-seg__opt${deliveryMode === 'per_building' ? ' is-active' : ''}`}
                  onClick={() => { setDeliveryMode('per_building'); mark(); }}
                >
                  One per building<small>A separate email for each</small>
                </button>
              </div>
            </Section>
          ) : (
            <Section label="Coverage">
              <div class="sset-coverage">
                Covers <strong>{facilityName || 'your building'}</strong>.
              </div>
            </Section>
          )}

          <Section label="When it arrives">
            <div class="sset-sched">
              <div class="sset-days">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    class={`sset-day${dayOfWeek === i ? ' is-active' : ''}`}
                    onClick={() => { setDayOfWeek(i); mark(); }}
                    aria-label={`Day ${d}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div class="sset-timerow">
                <span class="sset-timerow__label">at</span>
                <select
                  class="sset-select"
                  value={hour}
                  onChange={(e) => { setHour(Number(e.target.value)); mark(); }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div class="sset-tz">Sent in each building's local time.</div>
            </div>
          </Section>
        </div>
      </div>
      <SaveBar onSave={save} saving={saving} disabled={!dirty} dirty={dirty} status={status} />
    </>
  );
}
