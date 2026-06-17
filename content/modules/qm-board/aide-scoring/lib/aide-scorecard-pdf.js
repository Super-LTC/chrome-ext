/**
 * Per-aide CNA scoring scorecard PDF (jsPDF + jspdf-autotable), one aide per
 * page. Mirrors the download plumbing in rounding-reports/lib/rounding-report.js:
 * route the data-URL through the DOWNLOAD_FILE background message so the filename
 * survives PCC's CSP.
 */
import { signed, statusOf, coachingLine, SHIFT_LABELS } from './aide-scoring.js';

const MARGIN = 40;
const SLATE = 90;
const SKY = [14, 165, 233];   // scoring high
const ROSE = [225, 29, 72];   // scoring low
const SLATE_FILL = [37, 99, 235];

function toneRgb(deviation, significant = true) {
  if (!significant) return [100, 116, 139];
  return deviation > 0 ? ROSE : SKY; // >0 below baseline = low = rose
}

function safe(s) {
  return String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

/** Render one aide's scorecard onto the current page, starting at `y`. */
function renderAidePage(doc, autoTable, detail, facilityName, dateRangeLabel) {
  const summary = detail.summary;
  const status = statusOf(summary);
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

  // Aide name + headline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text(detail.aideName || '—', MARGIN, y);

  const headline = summary ? signed(summary.overallAverageDeviation) : '—';
  const grade = summary?.grade || '—';
  const [hr, hg, hb] = toneRgb(summary?.overallAverageDeviation ?? 0, summary?.isSignificant ?? false);
  doc.setFontSize(15);
  doc.setTextColor(hr, hg, hb);
  doc.text(`${headline}  ·  ${status.label}  ·  Grade ${grade}`, MARGIN, y + 16);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(SLATE);
  doc.text(
    `${summary?.assessmentCount ?? 0} scores · ${summary?.uniquePatients ?? 0} patients`,
    MARGIN, y + 14
  );
  y += 28;

  // Coaching line (wrapped)
  doc.setTextColor(40);
  doc.setFontSize(10);
  const coach = doc.splitTextToSize(coachingLine(detail), 515);
  doc.text(coach, MARGIN, y);
  y += coach.length * 13 + 8;

  // Category deviations table
  const cats = [...(detail.categoryDeviations || [])].sort(
    (a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation)
  );
  if (cats.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Avg vs baseline', 'Direction']],
      body: cats.map((c) => [
        c.name,
        signed(c.averageDeviation),
        !c.isSignificant ? 'on track' : c.direction === 'above' ? 'high' : 'low',
      ]),
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: SLATE_FILL, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 220 }, 1: { cellWidth: 110, halign: 'center' }, 2: { cellWidth: 'auto' } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Score examples
  const examples = [...(detail.scores || [])]
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, 12);
  if (examples.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Score Examples', MARGIN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Patient', 'Category', 'Aide', 'Baseline', 'Shift', 'Date']],
      body: examples.map((s) => [
        s.patientName,
        s.categoryName,
        String(s.aideScore),
        String(s.baselineScore),
        SHIFT_LABELS[s.shiftIndex] || String(s.shiftIndex),
        s.recordedDate,
      ]),
      styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: SLATE_FILL, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 120 },
        2: { cellWidth: 45, halign: 'center' },
        3: { cellWidth: 55, halign: 'center' },
        4: { cellWidth: 45, halign: 'center' },
        5: { cellWidth: 'auto', halign: 'right' },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
  }
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
