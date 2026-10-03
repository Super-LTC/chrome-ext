/**
 * PDPM drawer — the top of the PDPM Analyzer when the backend sends a `drawer`
 * block: what it pays now vs. with what we found, one bar per candidate ARD day,
 * and the findings grouped by what they change (Nursing / NTA / SLP).
 *
 * Every number comes from the backend, priced for this resident's payer
 * (Medicare $/day, Texas Medicaid $/day, another state's case-mix weight, or
 * nothing). Review items are always counted, drawn as their own striped layer.
 * Dismissed items stay listed, struck through, and count nowhere.
 */
import { useState, useEffect, useMemo } from 'preact/hooks';
import { track } from '../../../utils/analytics.js';
import {
  DISMISS_REASONS,
  ardBars,
  ardHint,
  capturedOn,
  dayByDate,
  defaultDay,
  displayCode,
  formatAmount,
  formatDelta,
  ntaMeter,
  ntaRows,
  nursingGroups,
  NURSING_LABELS,
  openCount,
  reasonLabel,
  shortDate,
  slpGroups,
  visibleTabs,
  withOverrides,
} from '../lib/drawer-model.js';
import { dismissItem, goToMds, undoDismiss } from '../lib/drawer-decisions.js';

// ─── Summary: HIPPS + revenue card ───────────────────────────────────────────

function DrawerSummary({ drawer, day }) {
  const { pricing, current } = drawer;
  const target = day?.withReview || current;
  const from = displayCode(current);
  const to = displayCode(target);
  const changed = to && to !== from;
  const delta = (target.amount ?? 0) - (current.amount ?? 0);
  const reviewPart = (day?.withReview?.amount ?? 0) - (day?.supported?.amount ?? 0);
  const priced = pricing.unit != null && current.amount != null;

  return (
    <>
      <div class="pdpm-dr__summary">
        <div class="pdpm-dr__summary-labels">
          <span>{pricing.mode === 'texas' ? 'Current group' : 'Current HIPPS'}</span>
          {changed && <span>Potential</span>}
        </div>
        <div class="pdpm-dr__summary-codes">
          <span class="pdpm-dr__code">{from}</span>
          {changed && (
            <>
              <span class="pdpm-dr__code-arrow">{'→'}</span>
              <span class="pdpm-dr__code pdpm-dr__code--up">{to}</span>
            </>
          )}
        </div>
      </div>

      {priced ? (
        <div class="pdpm-dr__rev">
          <div>
            <div class="pdpm-dr__rev-k">
              {pricing.unit === 'cmi' ? `${pricing.label} case mix` : `${pricing.label} per day`}
              {pricing.estimate && <span class="pdpm-dr__est"> estimate</span>}
            </div>
            <div class="pdpm-dr__rev-v">
              {formatAmount(pricing, current.amount)}
              {delta !== 0 && <> {'→'} <b>{formatAmount(pricing, target.amount)}</b></>}
            </div>
            {reviewPart > 0 && (
              <div class="pdpm-dr__rev-r">{formatDelta(pricing, reviewPart).replace('/day', '')} of that needs review</div>
            )}
          </div>
          {formatDelta(pricing, delta) && <span class="pdpm-dr__rev-d">{formatDelta(pricing, delta)}</span>}
        </div>
      ) : (
        pricing.note && <div class="pdpm-dr__note">{pricing.note}</div>
      )}
      {priced && pricing.note && <div class="pdpm-dr__note pdpm-dr__note--quiet">{pricing.note}</div>}
    </>
  );
}

// ─── ARD bars ────────────────────────────────────────────────────────────────

function ArdCard({ drawer, selected, onSelect }) {
  const { pricing, window: win } = drawer;
  if (pricing.unit == null || (drawer.days || []).length < 2) return null;
  const bars = ardBars(drawer);
  const hint = ardHint(drawer);
  const cols = { gridTemplateColumns: `repeat(${bars.length}, 1fr)` };

  return (
    <div class="pdpm-an__card">
      <div class="pdpm-an__card-header">
        <span class="pdpm-an__card-title">ARD</span>
        {win.dueDate && <span class="pdpm-an__card-badge">Due {shortDate(win.dueDate)}</span>}
      </div>
      <div class="pdpm-dr__ard">
        {hint && (
          <div class="pdpm-dr__ard-hint">
            <b>{shortDate(hint.date)}</b> pays {hint.delta} over the current ARD
          </div>
        )}
        <div class="pdpm-dr__bars" style={cols}>
          {bars.map((b) => (
            /* NO_TRACK: day selection fires pdpm_drawer_day_selected in onSelect */
            <button
              key={b.date}
              type="button"
              class={`pdpm-dr__day${b.date === selected ? ' pdpm-dr__day--sel' : ''}${b.isCurrentArd ? ' pdpm-dr__day--cur' : ''}`}
              onClick={() => onSelect(b.date)}
              aria-pressed={b.date === selected}
              aria-label={`ARD ${shortDate(b.date)}: ${formatAmount(pricing, b.total)}`}
            >
              <span class="pdpm-dr__amt">{formatAmount(pricing, b.total, { compact: true })}</span>
              <span class="pdpm-dr__stack" style={{ height: `${b.supportedPct + b.reviewPct}%` }}>
                {b.reviewPct > 0 && <span class="pdpm-dr__seg-rev" style={{ flexBasis: `${(b.reviewPct / (b.supportedPct + b.reviewPct)) * 100}%` }} />}
                <span class="pdpm-dr__seg-sup" />
              </span>
            </button>
          ))}
        </div>
        <div class="pdpm-dr__labels" style={cols}>
          {bars.map((b) => (
            <span key={b.date} class={`${b.isBest ? 'pdpm-dr__lbl--best' : ''}${b.date === selected ? ' pdpm-dr__lbl--sel' : ''}`}>
              {shortDate(b.date)}
            </span>
          ))}
        </div>
        <div class="pdpm-dr__ard-foot">
          <span>{'★'} best</span>
          <span><span class="pdpm-dr__key pdpm-dr__key--cur" /> current</span>
          <span><span class="pdpm-dr__key pdpm-dr__key--rev" /> needs review</span>
        </div>
      </div>
    </div>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function DismissBox({ onCancel, onSubmit, busy }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const needsNote = reason === 'other' && !note.trim();
  return (
    <div class="pdpm-dr__dismiss" onClick={(e) => e.stopPropagation()}>
      <div class="pdpm-dr__dismiss-q">Why dismiss?</div>
      <div class="pdpm-dr__pills">
        {DISMISS_REASONS.map((r) => (
          /* NO_TRACK: reason pick inside the dismiss form; the submit fires mds_item_decision */
          <button
            key={r.value}
            type="button"
            class={`pdpm-dr__pill${reason === r.value ? ' pdpm-dr__pill--on' : ''}`}
            onClick={() => setReason(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        class="pdpm-dr__dismiss-note"
        placeholder={reason === 'other' ? 'What is the reason?' : 'Add a note (optional)'}
        value={note}
        onInput={(e) => setNote(e.target.value)}
      />
      <div class="pdpm-dr__dismiss-row">
        {/* NO_TRACK: cancel closes the form */}
        <button type="button" class="pdpm-dr__ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        {/* NO_TRACK: dismissItem fires mds_item_decision with surface pdpm_drawer */}
        <button type="button" class="pdpm-dr__primary" disabled={!reason || needsNote || busy} onClick={() => onSubmit(reason, note.trim())}>
          {busy ? 'Saving…' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}

function ItemRow({ item, value, selectedDate, ctx }) {
  const { dismissingKey, setDismissingKey, busyKey, onDismiss, onUndo, onOpen, onGo } = ctx;
  const inWindow = capturedOn(item, selectedDate);

  if (item.dismissed) {
    const why = [reasonLabel(item.dismissed.reason), item.dismissed.note].filter(Boolean).join(' — ');
    return (
      <div class="pdpm-dr__it pdpm-dr__it--off">
        <div class="pdpm-dr__tx">
          <div class="pdpm-dr__nm">{item.name}</div>
          <div class="pdpm-dr__sr">Dismissed{why ? ` — ${why}` : ''}</div>
        </div>
        {/* NO_TRACK: undoDismiss fires mds_item_decision_undone */}
        <button type="button" class="pdpm-dr__undo" disabled={busyKey === item.key} onClick={() => onUndo(item)}>Undo</button>
      </div>
    );
  }

  return (
    <>
      <div
        class={`pdpm-dr__it${inWindow ? '' : ' pdpm-dr__it--dim'}`}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } }}
      >
        <div class="pdpm-dr__tx">
          <div class="pdpm-dr__nm">
            {item.name}
            {item.review && <span class="pdpm-dr__rw">Review</span>}
          </div>
          <div class="pdpm-dr__sr">
            {inWindow ? (item.source || ' ') : `Not in the look-back for ${shortDate(selectedDate)}`}
          </div>
        </div>
        {value && <span class="pdpm-dr__val">{value}</span>}
        <span class="pdpm-dr__icons" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            class="pdpm-dr__ib"
            title="Go to MDS"
            aria-label={`Go to ${item.mdsItem} on the MDS`}
            data-track="pdpm_drawer_go_to_mds"
            data-track-prop-item-code={item.mdsItem}
            onClick={() => onGo(item)}
          >
            {'↗'}
          </button>
          {/* NO_TRACK: opens the dismiss form; the submit fires mds_item_decision */}
          <button type="button" class="pdpm-dr__ib pdpm-dr__ib--x" title="Dismiss" aria-label={`Dismiss ${item.name}`} onClick={() => setDismissingKey(dismissingKey === item.key ? null : item.key)}>
            {'✕'}
          </button>
        </span>
      </div>
      {dismissingKey === item.key && (
        <DismissBox
          busy={busyKey === item.key}
          onCancel={() => setDismissingKey(null)}
          onSubmit={(reason, note) => onDismiss(item, reason, note)}
        />
      )}
    </>
  );
}

function Accordion({ group, open, onToggle, children }) {
  return (
    <div class={`pdpm-dr__acc${open ? ' pdpm-dr__acc--open' : ''}${group.isLanding ? ' pdpm-dr__acc--land' : ''}`}>
      {/* NO_TRACK: pure-UI expand/collapse of a category inside the drawer */}
      <button type="button" class="pdpm-dr__acc-h" onClick={onToggle} aria-expanded={open}>
        <span class="pdpm-dr__car">{'›'}</span>
        <span class="pdpm-dr__an">{group.label}</span>
        <span class="pdpm-dr__ac">{group.open}</span>
      </button>
      {open && <div class="pdpm-dr__acc-b">{children}</div>}
    </div>
  );
}

// ─── Opportunities card ──────────────────────────────────────────────────────

function NtaMeter({ drawer, day }) {
  const m = ntaMeter(drawer, day);
  const pc = (p) => `${Math.min(100, (p / m.max) * 100)}%`;
  const add = Math.max(0, m.supported - m.coded);
  const rev = Math.max(0, m.withReview - m.supported);
  return (
    <div class="pdpm-dr__ntam">
      <div class="pdpm-dr__ntam-lbl">
        <span>NTA points</span>
        <span>
          <b>{m.coded}</b> now{m.withReview !== m.coded && <> {'→'} <b>{m.withReview}</b></>}
          {m.fromBand && <> · {m.fromBand}{m.toBand && m.toBand !== m.fromBand && <> {'→'} <b>{m.toBand}</b></>}</>}
        </span>
      </div>
      <div class="pdpm-dr__ntam-trk">
        <span class="pdpm-dr__ntam-a" style={{ width: pc(m.coded) }} />
        <span class="pdpm-dr__ntam-b" style={{ width: pc(add) }} />
        <span class="pdpm-dr__ntam-c" style={{ width: pc(rev) }} />
      </div>
      <div class="pdpm-dr__ntam-ticks">
        {m.bands.filter((b) => b.minPoints > 0).map((b) => (
          <span key={b.label} style={{ left: pc(b.minPoints) }}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function Opportunities({ drawer, items, day, ctx }) {
  const tabs = visibleTabs(drawer, items);
  const [tab, setTab] = useState(tabs[0]?.key || null);
  const [openGroups, setOpenGroups] = useState({});
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key || null);
  }, [tabs.map((t) => t.key).join(',')]);

  if (tabs.length === 0) return null;
  const selectedDate = day?.date;
  const isOpen = (g) => openGroups[g.key] ?? g.defaultOpen;
  const toggle = (g) => setOpenGroups((prev) => ({ ...prev, [g.key]: !isOpen(g) }));

  let body = null;
  if (tab === 'nta') {
    body = (
      <>
        <NtaMeter drawer={drawer} day={day} />
        {ntaRows(items).map((it) => (
          <ItemRow key={it.key} item={it} value={it.ntaPoints ? `+${it.ntaPoints} pt${it.ntaPoints === 1 ? '' : 's'}` : ''} selectedDate={selectedDate} ctx={ctx} />
        ))}
      </>
    );
  } else if (tab === 'nursing') {
    const groups = nursingGroups(items, day);
    body = (
      <>
        <div class="pdpm-dr__now">Now {NURSING_LABELS[drawer.current.nursingCategory] || drawer.current.nursingCategory}</div>
        {groups.map((g) => (
          <Accordion key={g.key} group={g} open={isOpen(g)} onToggle={() => toggle(g)}>
            {g.items.map((it) => <ItemRow key={it.key} item={it} selectedDate={selectedDate} ctx={ctx} />)}
          </Accordion>
        ))}
      </>
    );
  } else if (tab === 'slp') {
    const groups = slpGroups(items);
    body = (
      <>
        <div class="pdpm-dr__now">Now {drawer.current.slpGroup}</div>
        {groups.map((g) => (
          <Accordion key={g.key} group={g} open={isOpen(g)} onToggle={() => toggle(g)}>
            {g.items.map((it) => <ItemRow key={it.key} item={it} selectedDate={selectedDate} ctx={ctx} />)}
          </Accordion>
        ))}
      </>
    );
  }

  return (
    <div class="pdpm-an__card">
      <div class="pdpm-an__card-header">
        <span class="pdpm-an__card-title">Opportunities</span>
        <span class="pdpm-an__card-badge">{openCount(items)}</span>
      </div>
      {tabs.length > 1 && (
        <div class="pdpm-dr__tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              class={`pdpm-dr__tab${t.key === tab ? ' pdpm-dr__tab--on' : ''}`}
              data-track="pdpm_drawer_tab_changed"
              data-track-prop-tab={t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}<span class="pdpm-dr__tab-n">{t.open}</span>
            </button>
          ))}
        </div>
      )}
      <div class="pdpm-dr__rows">{body}</div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {object}   drawer        payload.drawer
 * @param {string}   assessmentId  PCC assessment id (for Go to MDS + decisions)
 * @param {function} onOpenItem    open the evidence view for an item
 */
export function PdpmDrawer({ drawer, assessmentId, onOpenItem }) {
  const [selected, setSelected] = useState(() => defaultDay(drawer));
  const [overrides, setOverrides] = useState({});
  const [dismissingKey, setDismissingKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  // A fresh payload (after a decision re-fetch) is the truth again.
  useEffect(() => {
    setOverrides({});
    if (!drawer?.days?.some((d) => d.date === selected)) setSelected(defaultDay(drawer));
  }, [drawer]);

  const items = useMemo(() => withOverrides(drawer.items, overrides), [drawer.items, overrides]);
  const day = dayByDate(drawer, selected);

  async function onDismiss(item, reason, note) {
    setBusyKey(item.key);
    try {
      await dismissItem({ item, assessmentId, reason, note });
      setOverrides((o) => ({ ...o, [item.key]: { reason, note } }));
      setDismissingKey(null);
    } catch (err) {
      window.SuperToast?.error?.(err.message || 'Could not dismiss');
    } finally {
      setBusyKey(null);
    }
  }

  async function onUndo(item) {
    setBusyKey(item.key);
    try {
      await undoDismiss({ item, assessmentId });
      setOverrides((o) => ({ ...o, [item.key]: null }));
    } catch (err) {
      window.SuperToast?.error?.(err.message || 'Could not undo');
    } finally {
      setBusyKey(null);
    }
  }

  function onSelect(date) {
    setSelected(date);
    const d = dayByDate(drawer, date);
    track('pdpm_drawer_day_selected', {
      window_kind: drawer.window.kind,
      is_best: date === drawer.window.bestDate,
      is_current: !!d?.isCurrentArd,
    });
  }

  const ctx = {
    dismissingKey,
    setDismissingKey,
    busyKey,
    onDismiss,
    onUndo,
    onOpen: (item) => onOpenItem?.(item),
    onGo: (item) => goToMds(item, assessmentId),
  };

  return (
    <>
      <DrawerSummary drawer={drawer} day={day} />
      <ArdCard drawer={drawer} selected={day?.date} onSelect={onSelect} />
      <Opportunities drawer={drawer} items={items} day={day} ctx={ctx} />
    </>
  );
}
