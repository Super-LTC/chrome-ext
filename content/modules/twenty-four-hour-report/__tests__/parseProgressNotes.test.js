import { describe, it, expect } from 'vitest';
import { parseProgressNotes, pickNewestNewNote } from '../utils/parseProgressNotes.js';

/**
 * Structure copied verbatim from a real PCC progressnotesviewall.xhtml response
 * (evergreen skin) — the markup shape is real, the clinical content is invented.
 * Never paste live note text into this repo.
 */
const ROW = (pnid, date, type, note, dept = 'Nursing') => `
  <tr class="evergreen-table-row">
    <td><a href="javascript:openSizedLookup2('/care/chart/ipn/newipn.jsp?ESOLpnid=${pnid}&amp;ESOLclientid=EID_abc123', '', 970, 600, 'scrollbars');">view</a></td>
    <td>${date}</td>
    <td>${type}</td>
    <td>${note}</td>
    <td>&mdash;</td>
    <td>${dept}</td>
    <td>Y</td>
    <td>Y</td>
  </tr>`;

const PAGE = (rows) => `
<html><body>
  <table class="evergreen-table buffer-row">
    <thead><tr><th>Actions</th><th>Effective Date</th><th>Type</th><th>Note</th>
      <th>Care Plan</th><th>Dept</th><th>Shift</th><th>24 Hour</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</body></html>`;

describe('parseProgressNotes', () => {
  it('pulls id, date, type and text out of a note row', () => {
    const html = PAGE([
      ROW('7604501', '7/29/2026 08:43', 'Nursing Note', 'Resident resting comfortably.'),
    ]);
    const [n] = parseProgressNotes(html);
    expect(n.pnid).toBe('7604501');
    expect(n.type).toBe('Nursing Note');
    expect(n.text).toBe('Resident resting comfortably.');
    expect(n.department).toBe('Nursing');
    expect(n.effectiveDate.getFullYear()).toBe(2026);
    expect(n.effectiveDate.getHours()).toBe(8);
  });

  it('turns <br> into newlines and decodes entities', () => {
    const html = PAGE([
      ROW('1', '7/29/2026 08:00', 'Nursing Note', 'Line one<br/>Line two &amp; three'),
    ]);
    expect(parseProgressNotes(html)[0].text).toBe('Line one\nLine two & three');
  });

  it('returns newest first', () => {
    const html = PAGE([
      ROW('1', '7/29/2026 06:00', 'Nursing Note', 'early'),
      ROW('2', '7/29/2026 18:00', 'Nursing Note', 'late'),
      ROW('3', '7/29/2026 12:00', 'Nursing Note', 'middle'),
    ]);
    expect(parseProgressNotes(html).map((n) => n.pnid)).toEqual(['2', '3', '1']);
  });

  it('skips header rows and anything without a note id', () => {
    const html = PAGE([
      ROW('7604501', '7/29/2026 08:43', 'Nursing Note', 'real'),
      '<tr><td class="data" colspan="8">No records found</td></tr>',
      '<tr><td>spacer</td><td></td><td></td><td></td></tr>',
    ]);
    expect(parseProgressNotes(html)).toHaveLength(1);
  });

  it('reads the legacy .pnlist skin too', () => {
    const html = `<html><body><table class="pnlist">${ROW('99', '7/29/2026 09:00', 'Nursing Note', 'legacy')}</table></body></html>`;
    expect(parseProgressNotes(html)[0].pnid).toBe('99');
  });

  it('returns [] rather than throwing on junk', () => {
    // A bad parse has to look like "found nothing". Looking like a WRONG note
    // would attach the wrong evidence to a clinical finding.
    expect(parseProgressNotes('')).toEqual([]);
    expect(parseProgressNotes(null)).toEqual([]);
    expect(parseProgressNotes('<html><body>nope</body></html>')).toEqual([]);
  });
});

describe('pickNewestNewNote', () => {
  const notes = [
    { pnid: 'new', effectiveDate: new Date('2026-07-29T18:00:00'), text: 'just written' },
    { pnid: 'old', effectiveDate: new Date('2026-07-29T06:00:00'), text: 'was there' },
  ];

  it('picks the note that was not on the page before', () => {
    expect(pickNewestNewNote(notes, ['old'])?.pnid).toBe('new');
  });

  it('returns null when nothing is new — never guesses', () => {
    expect(pickNewestNewNote(notes, ['new', 'old'])).toBeNull();
    expect(pickNewestNewNote([], [])).toBeNull();
  });

  it('ignores eMAR rows that landed while she typed, if we already saw them', () => {
    const withEmar = [
      { pnid: 'emar', type: 'Nursing Note', effectiveDate: new Date('2026-07-29T18:05:00'), text: 'seen already' },
      ...notes,
    ];
    expect(pickNewestNewNote(withEmar, ['emar', 'old'])?.pnid).toBe('new');
  });

  it('never picks a machine-written eMAR row over her note', () => {
    // Measured on a real page: 9 of 10 rows in the 24h window were
    // "Orders - Administration Note", and they land while she is still typing —
    // so the most likely wrong answer is an eMAR row stamped after her note.
    const withEmar = [
      {
        pnid: 'emar',
        type: 'Orders - Administration Note',
        effectiveDate: new Date('2026-07-29T18:30:00'),
        text: 'Insulin lispro 16 unit',
      },
      { pnid: 'hers', type: 'Nursing Note', effectiveDate: new Date('2026-07-29T18:10:00'), text: 'MD notified' },
    ];
    expect(pickNewestNewNote(withEmar, [])?.pnid).toBe('hers');
  });

  it('returns null when the only new row is eMAR', () => {
    const onlyEmar = [
      { pnid: 'emar', type: 'Orders - Administration Note', effectiveDate: new Date(), text: 'x' },
    ];
    expect(pickNewestNewNote(onlyEmar, [])).toBeNull();
  });

  it('allows a few minutes of slack before the click', () => {
    // PCC stamps the effective time when the FORM opened, which can precede
    // our click.
    const since = new Date('2026-07-29T18:02:00');
    expect(pickNewestNewNote(notes, ['old'], since)?.pnid).toBe('new');
  });

  it('rejects a note clearly older than the click', () => {
    const since = new Date('2026-07-29T17:00:00');
    expect(pickNewestNewNote([notes[1]], [], since)).toBeNull();
  });
});
