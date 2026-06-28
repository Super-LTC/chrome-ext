/**
 * In-house Calendar — the same triggers plotted by their actionable date (clear
 * date for triggering-now, prevent-by / crossing date for crossers). A month
 * grid the MDS coordinator can scan: "what's due when." Chips click into the
 * resident drill-in. Empty days stay quiet so the loaded days pop.
 *
 * Ported from qm-inhouse-calendar.reference.tsx → Preact + the qmi- tone system.
 */
import { useMemo, useState } from 'preact/hooks';
import { buildInhouseCalendar } from '../lib/qm-inhouse-view.js';
import { ChevronLeft, ChevronRight } from './icons.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function QmInhouseCalendar({ board, lens, facilityState, onOpenResident }) {
  const today = (board.currentlyTriggering.facilityDate ?? '').slice(0, 10);
  const { items } = useMemo(() => buildInhouseCalendar(board, lens, facilityState), [board, lens, facilityState]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const bucket = m.get(it.date) ?? [];
      bucket.push(it);
      m.set(it.date, bucket);
    }
    return m;
  }, [items]);

  // Anchor the visible month on facility today (or the earliest dated item).
  const initial = (today || items[0]?.date || '2026-01-01').slice(0, 7);
  const [anchor, setAnchor] = useState({
    y: Number(initial.slice(0, 4)),
    m: Number(initial.slice(5, 7)) - 1,
  });

  const firstWeekday = new Date(Date.UTC(anchor.y, anchor.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(anchor.y, anchor.m + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (dir) =>
    setAnchor(({ y, m }) => {
      const nm = m + dir;
      if (nm < 0) return { y: y - 1, m: 11 };
      if (nm > 11) return { y: y + 1, m: 0 };
      return { y, m: nm };
    });
  const goToday = () => today && setAnchor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });

  return (
    <div className="qmi-cal">
      {/* month nav */}
      <div className="qmi-cal__nav">
        <div className="qmi-cal__month">{MONTHS[anchor.m]} {anchor.y}</div>
        <div className="qmi-cal__navbtns">
          <button type="button" className="qmi-cal__today" onClick={goToday}>Today</button> {/* NO_TRACK */}
          <button type="button" className="qmi-cal__arrow" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft /></button> {/* NO_TRACK */}
          <button type="button" className="qmi-cal__arrow" onClick={() => step(1)} aria-label="Next month"><ChevronRight /></button> {/* NO_TRACK */}
        </div>
      </div>

      {/* weekday header */}
      <div className="qmi-cal__dow">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* day grid */}
      <div className="qmi-cal__grid">
        {cells.map((day, i) => {
          if (day == null) return <div key={`b${i}`} className="qmi-cal__cell qmi-cal__cell--blank" />;
          const dateIso = iso(anchor.y, anchor.m, day);
          const dayItems = byDate.get(dateIso) ?? [];
          const isToday = dateIso === today;
          return (
            <div key={dateIso} className={`qmi-cal__cell ${isToday ? 'qmi-cal__cell--today' : ''}`}>
              <div className={`qmi-cal__daynum ${isToday ? 'qmc-text--emerald' : 'qmc-text--slate'}`}>{day}</div>
              <div className="qmi-cal__items">
                {dayItems.slice(0, 3).map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    data-track="qm_drill_in"
                    data-track-prop-measure-code={it.drill.entry?.id}
                    data-track-prop-view="inhouse_calendar"
                    title={`${it.patientName} · ${it.measureLabel} · ${it.note}`}
                    onClick={() => onOpenResident(it.drill.patient, it.drill.entry)}
                    className={`qmi-cal__chip qmi-cal__chip--${it.kind}`}
                  >
                    {it.patientName.split(',')[0]} · {it.measureLabel}
                  </button>
                ))}
                {dayItems.length > 3 && <div className="qmi-cal__more">+{dayItems.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="qmi-cal__legend">
        <span><span className="qmi-cal__swatch qmi-cal__swatch--clear" /> Clears / act</span>
        <span><span className="qmi-cal__swatch qmi-cal__swatch--cross" /> Crosses day-101</span>
      </div>
    </div>
  );
}
