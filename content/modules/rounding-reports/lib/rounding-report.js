// Ported verbatim from web/lib/rounding-report.ts on the SuperLTC backend.
// Pure functions, no external deps. Do not re-implement — months of
// facility-by-facility parsing fixes are baked in.

// Best-effort parse of PCC's `Location` string into hall + room. The format
// varies wildly across facilities — common patterns:
//   "LTC_1 1 100-2 Private"                       → hall="LTC_1",     room="100-2"
//   "Wing 2 First Floor 100-A Private"            → hall="Wing 2",    room="100-A"
//   "Hall 100 First Floor 101-A Semi Private"     → hall="Hall 100",  room="101-A"
//   "100 Hall 1st Floor 102-A Private"            → hall="100 Hall",  room="102-A"
//   "Country Meadow Left Country Meadow 118-A"    → hall="Country Meadow Left",
//                                                    room="118-A"
//   "100/215/A"                                   → hall="100",       room="215"
//   "North 1st Floor 10-A Ward"                   → hall="North",     room="10-A"
const FLOOR_WORD_RE =
  /^(floor|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|13th|14th|15th|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)$/i;
const ROOM_TOKEN_RE = /^(\d{1,5})[A-Za-z]?(?:-[A-Za-z0-9-]+)?$/;
const LETTER_ROOM_TOKEN_RE = /^[A-Za-z]\d{1,4}[A-Za-z]?(?:-[A-Za-z0-9-]+)?$/;

export function parsePccLocation(loc) {
  if (!loc) return { hall: null, room: null };
  const trimmed = String(loc).trim();
  if (!trimmed || trimmed === '-') return { hall: null, room: null };

  const cleaned = trimmed
    .replace(
      /\s+(Semi[\s-]?Private|Private|Ward|\d+\s+Bed(\s+Room)?)\s*$/i,
      ''
    )
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { hall: null, room: null };
  if (tokens.length === 1) {
    const m = tokens[0].match(/(\d{2,})/);
    return { hall: null, room: m ? m[1] : tokens[0] };
  }

  let roomIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (ROOM_TOKEN_RE.test(tokens[i]) || LETTER_ROOM_TOKEN_RE.test(tokens[i])) {
      roomIdx = i;
      break;
    }
  }
  if (roomIdx === -1) return { hall: null, room: null };
  const room = tokens[roomIdx];

  let hallEnd = roomIdx;
  while (hallEnd > 0) {
    const tok = tokens[hallEnd - 1];
    const isFloorWord = FLOOR_WORD_RE.test(tok);
    const isShortDigits = /^\d{1,3}$/.test(tok);
    if (isFloorWord || isShortDigits) {
      hallEnd--;
      continue;
    }
    break;
  }
  if (hallEnd === 0) return { hall: null, room };

  const hallTokens = tokens.slice(0, hallEnd);
  const dedup = [];
  for (const t of hallTokens) {
    if (dedup.length > 0 && dedup[dedup.length - 1].toLowerCase() === t.toLowerCase()) continue;
    dedup.push(t);
  }
  // Collapse a repeated multi-token sequence at the end of the prefix
  // (e.g. "Country Meadow Left Country Meadow" → "Country Meadow Left")
  for (let len = Math.floor(dedup.length / 2); len >= 1; len--) {
    const tail = dedup.slice(-len).map((s) => s.toLowerCase()).join(' ');
    const head = dedup.slice(-len * 2, -len).map((s) => s.toLowerCase()).join(' ');
    if (tail && head && tail === head) {
      dedup.splice(-len);
      break;
    }
  }

  return { hall: dedup.join(' '), room };
}

function roomLeadingNumber(room) {
  if (!room) return null;
  const m = String(room).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function deriveWing(parsed) {
  if (parsed.hall) return parsed.hall;
  const num = roomLeadingNumber(parsed.room);
  if (num === null) return null;
  if (num < 100) return null;
  return `${Math.floor(num / 100)}xx`;
}

/** Returns [wing, roomNum, name]. Patients with no parseable wing fall to the end. */
export function locationSortKey(loc, name) {
  const parsed = parsePccLocation(loc);
  const wing = deriveWing(parsed) ?? '￿';
  const roomNum = roomLeadingNumber(parsed.room) ?? Number.MAX_SAFE_INTEGER;
  return [wing, roomNum, name];
}

/** Count not_present checks. Useful to avoid generating an empty PDF. */
export function countMissingItems(detail, liveOverrides) {
  let n = 0;
  for (const p of detail.patients) {
    for (const c of p.checks) {
      const override = liveOverrides?.[c.id];
      const status = override?.status ?? c.status;
      if (status === 'not_present') n++;
    }
  }
  return n;
}

/**
 * Generate and trigger download of a PDF listing every check marked
 * "not_present" in the session, grouped by hall and room.
 * Uses jspdf + jspdf-autotable (dynamically imported).
 */
export async function generateMissingItemsPdf(detail, liveOverrides) {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default;

  const facilityName = detail.locationName || 'Facility';
  const sessionDate = new Date(detail.session.startedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const rows = [];
  for (const p of detail.patients) {
    const parsed = parsePccLocation(p.currentLocation);
    for (const c of p.checks) {
      const override = liveOverrides?.[c.id];
      const status = override?.status ?? c.status;
      if (status === 'not_present') {
        rows.push({
          patientName: p.patientName.split('(')[0].trim(),
          hall: parsed.hall ?? '',
          room: parsed.room ?? '',
          rawLocation: p.currentLocation ?? '',
          interventionText: c.interventionText,
          notes: override?.notes ?? c.notes ?? '',
        });
      }
    }
  }

  rows.sort((a, b) => {
    const h = a.hall.localeCompare(b.hall, undefined, { numeric: true });
    if (h !== 0) return h;
    const r = a.room.localeCompare(b.room, undefined, { numeric: true });
    if (r !== 0) return r;
    return a.patientName.localeCompare(b.patientName);
  });

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Physical Rounding — Missing Items', margin, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${facilityName}  •  ${sessionDate}`, margin, y);
  y += 14;
  doc.text(`${rows.length} missing item${rows.length === 1 ? '' : 's'}`, margin, y);
  y += 18;
  doc.setTextColor(0);

  if (rows.length === 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(22, 163, 74);
    doc.text('No missing items — every check came back present or N/A.', margin, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Hall', 'Room', 'Patient', 'Missing Item', 'Notes']],
      body: rows.map((r) => [
        r.hall || '—',
        r.room || r.rawLocation || '—',
        r.patientName,
        r.interventionText,
        r.notes,
      ]),
      styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 50 },
        2: { cellWidth: 100 },
        3: { cellWidth: 180 },
        4: { cellWidth: 'auto' },
      },
      margin: { left: margin, right: margin },
    });
  }

  const safeFacility = facilityName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const safeDate = new Date(detail.session.startedAt).toISOString().slice(0, 10);
  const filename = `missing-items-${safeFacility}-${safeDate}.pdf`;

  // PCC's page strips the filename when a content script triggers a blob
  // download (Chrome blocks third-party-origin downloads from naming files).
  // Route via the background service worker + chrome.downloads.download so
  // the filename + .pdf extension survive.
  const dataUrl = doc.output('datauristring'); // "data:application/pdf;filename=...;base64,..."
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      dataUrl,
      filename,
    });
    if (!result?.success) throw new Error(result?.error || 'Download failed');
  } catch (err) {
    // Last-resort fallback — direct blob save. Filename may be mangled but
    // the file is still a valid PDF.
    console.warn('[Rounding] background download failed, falling back:', err);
    doc.save(filename);
  }

  return { rowCount: rows.length };
}
