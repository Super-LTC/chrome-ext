/**
 * Per-aide CNA scoring scorecard PDF (jsPDF + jspdf-autotable), one aide per
 * page — the "print" equivalent of the on-screen scorecard, kept in sync with
 * the plain-English clarity redesign (web PR #808): a one-line verdict, category
 * DEPENDENCE labels ("less dep." / "more dep."), a trend verdict (chart skipped
 * under ~3 weeks of history), and dated newest-first recent scores.
 *
 * Mirrors the download plumbing in rounding-reports/lib/rounding-report.js:
 * route the data-URL through the DOWNLOAD_FILE background message so the filename
 * survives PCC's CSP.
 */
import { verdictOf, categoryLabel, trendVerdict, fmtDate, SHIFT_LABELS, MIN_TREND_WEEKS } from './aide-scoring.js';

const MARGIN = 40;
const SLATE = 90;
const SLATE_FILL = [37, 99, 235];

/** New-tone → RGB (matches the screen palette: sky=less dep, rose=more dep). */
const TONE_RGB = {
  sky: [14, 165, 233],
  rose: [225, 29, 72],
  emerald: [16, 185, 129],
  amber: [217, 119, 6],
  slate: [100, 116, 139],
};
function toneRgb(tone) {
  return TONE_RGB[tone] ?? TONE_RGB.slate;
}

function safe(s) {
  return String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

/** Render one aide's scorecard onto the current page, starting at `y`. */
function renderAidePage(doc, autoTable, detail, facilityName, dateRangeLabel) {
  const summary = detail.summary;
  const verdict = verdictOf(summary);
  let y = MARGIN;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text('CNA Scoring Scorecard', MARGIN, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(SLATE);
  doc.text(`${facilityName}  •  ${dateRangeLabel}`, MARGIN, y);
  y += 22;

  // Aide name + grade
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text(detail.aideName || '—', MARGIN, y);
  const grade = summary?.grade || '—';
  doc.text(`Grade ${grade}`, 555, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(SLATE);
  doc.text(
    `${summary?.assessmentCount ?? 0} scores · ${summary?.uniquePatients ?? 0} residents`,
    MARGIN, y + 14
  );
  y += 28;

  // Plain verdict (wrapped, in its tone color)
  const [vr, vg, vb] = toneRgb(verdict.tone);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(vr, vg, vb);
  const vLines = doc.splitTextToSize(verdict.line, 515);
  doc.text(vLines, MARGIN, y);
  y += vLines.length * 14 + 6;

  // Trend verdict — one plain line; skip entirely under ~3 weeks of history.
  const pts = detail.trend || [];
  if (pts.length >= MIN_TREND_WEEKS) {
    const tv = trendVerdict(pts);
    const [tr, tg, tb] = toneRgb(tv.tone);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(SLATE);
    doc.text('Getting more accurate?', MARGIN, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(tr, tg, tb);
    doc.text(tv.word, MARGIN + 128, y);
    y += 18;
  }

  // Category dependence table — "vs. the team", framed in dependence not high/low.
  const cats = [...(detail.categoryDeviations || [])].sort(
    (a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation)
  );
  if (cats.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Category', 'vs. the team']],
      body: cats.map((c) => {
        const { word, tone } = categoryLabel(c.averageDeviation, c.isSignificant);
        return [{ content: c.name }, { content: word, _tone: tone }];
      }),
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: SLATE_FILL, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 300 }, 1: { cellWidth: 'auto', fontStyle: 'bold' } },
      margin: { left: MARGIN, right: MARGIN },
      // Colour the dependence word by tone (sky=less dep, rose=more dep, emerald=on track).
      didParseCell: (data) => {
        const t = data.cell.raw?._tone;
        if (data.section === 'body' && t) data.cell.styles.textColor = toneRgb(t);
      },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(SLATE);
    doc.text('more dependent  ·  matches the team  ·  less dependent', MARGIN, y + 8);
    y += 20;
  }

  // Recent scores — dependence-flagged, newest first (mirrors the screen list).
  const notable = (detail.scores || []).filter((s) => Math.abs(s.deviation) >= 1);
  const pool = notable.length > 0 ? notable : (detail.scores || []);
  const examples = [...pool]
    .sort((a, b) => String(b.recordedDate).localeCompare(String(a.recordedDate)))
    .slice(0, 12);
  if (examples.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Recent scores to review', MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['When', 'Resident', 'Category', 'Her', 'Team avg', 'vs. team']],
      body: examples.map((s) => {
        const lessDep = s.deviation < 0;
        return [
          `${fmtDate(s.recordedDate)} · ${SHIFT_LABELS[s.shiftIndex] || s.shiftIndex}`,
          s.patientName,
          s.categoryName,
          String(s.aideScore),
          s.peerAverage != null ? s.peerAverage.toFixed(1) : '—',
          { content: lessDep ? 'less dep.' : 'more dep.', _tone: lessDep ? 'sky' : 'rose' },
        ];
      }),
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: SLATE_FILL, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 120 },
        2: { cellWidth: 105 },
        3: { cellWidth: 35, halign: 'center' },
        4: { cellWidth: 55, halign: 'center' },
        5: { cellWidth: 'auto' },
      },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: (data) => {
        const t = data.cell.raw?._tone;
        if (data.section === 'body' && t) {
          data.cell.styles.textColor = toneRgb(t);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // Footnote — what "Team avg" means + the GG scale.
  const footY = (doc.lastAutoTable?.finalY ?? y) + 16;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(SLATE);
  doc.text(
    doc.splitTextToSize(
      '"Team" = other CNAs\' avg for that resident that week (same shift when available). Scores run 1 (fully dependent) to 6 (independent).',
      515
    ),
    MARGIN,
    footY
  );
}

/**
 * Build a one-aide-per-page PDF for the given detail responses and trigger a
 * download. `details` is an array of AideDeviationDetailResponse.
 */
export async function generateAideScorecardsPdf({ details, facilityName, dateRangeLabel }) {
  const valid = (details || []).filter(Boolean);
  if (valid.length === 0) return { pageCount: 0 };

  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default;

  const facility = facilityName || 'Facility';
  const range = dateRangeLabel || '';
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  valid.forEach((detail, i) => {
    if (i > 0) doc.addPage();
    renderAidePage(doc, autoTable, detail, facility, range);
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename =
    valid.length === 1
      ? `aide-scorecard-${safe(facility)}-${safe(valid[0].aideName)}-${date}.pdf`
      : `aide-scorecards-${safe(facility)}-${date}.pdf`;

  // Route via the background worker so PCC's CSP doesn't strip the filename.
  const dataUrl = doc.output('datauristring');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', dataUrl, filename });
    if (!result?.success) throw new Error(result?.error || 'Download failed');
  } catch (err) {
    console.warn('[AideScoring] background download failed, falling back:', err);
    doc.save(filename);
  }

  return { pageCount: valid.length };
}
