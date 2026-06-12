/**
 * Pure parsers for PCC MDS DOM → the flat answers blob the backend expects.
 *
 * Two entry points, both accepting an HTML string OR a Document/Element:
 *   parseSectionHtml(input)    -> { answers: { [itemId]: { value, isLocked } } }
 *   parseSectionListing(input) -> [{ code, status, disabled }]
 *
 * Selectors validated against real saved PCC pages (demo/mds-section-{i,n}.html).
 * Live PCC structure, per question:
 *   <div class="question" id="{ITEM}_wrapper" data-questiontype="rad|chk|pop|num|dte">
 *     <div class="locked_response"> | <div class="signed_response">   (when signed)
 *     <input type="hidden" name="ack_{ITEM}" ...>                     (acknowledgement)
 *     <ul class="responses"><li><a data-value="X" class="selected">…  (single/multi choice)
 *     <div class="readonlyquestionvalue"><b>…</b></div>               (locked free value)
 *     <input>/<select>                                                (editable in-progress)
 */

// MDS item ids: A0500A, GG0130B1, I0020B, N0300, plus ack_-prefixed and
// underscore composites (A_SHORTA). Used to filter candidate element ids.
const MDS_ITEM_RE = /^(ack_)?[A-Z]{1,3}[0-9]{4}[A-Z0-9]*$|^[A-Z]+_[A-Z0-9]+$/;

function toDoc(input) {
  // A Document (nodeType 9) or any Element exposes querySelectorAll directly.
  if (input && typeof input.querySelectorAll === 'function') return input;
  return new DOMParser().parseFromString(String(input == null ? '' : input), 'text/html');
}

function collapse(text) {
  return String(text == null ? '' : text)
    .replace(/ /g, ' ') // &nbsp;
    .replace(/\s+/g, ' ')
    .trim();
}

// "1. Yes" -> "1", "12. Debility" -> "12", "No" -> "No"
function leadingCode(text) {
  const t = collapse(text);
  const m = t.match(/^([A-Za-z0-9-]+)[.\s]/);
  return m ? m[1] : t;
}

function fieldValue(el) {
  const type = (el.getAttribute && el.getAttribute('type')) || el.type || '';
  if (type === 'checkbox' || type === 'radio') {
    return el.checked ? (el.value || 'on') : '';
  }
  const v = el.value;
  return typeof v === 'string' ? v : '';
}

export function parseSectionHtml(input) {
  const doc = toDoc(input);
  const answers = {};

  // --- Primary pass: one authoritative value per question wrapper ----------
  for (const wrapper of doc.querySelectorAll('.question[id$="_wrapper"]')) {
    const itemId = (wrapper.id || '').replace(/_wrapper$/, '');
    if (!MDS_ITEM_RE.test(itemId)) continue;

    let isLocked = !!wrapper.querySelector('.locked_response, .signed_response');
    let value = '';

    const selected = wrapper.querySelector('ul.responses a.selected, .responses a.selected');
    const readonly = wrapper.querySelector('.readonlyquestionvalue');
    const field = wrapper.querySelector('input:not([type="hidden"]), select, textarea');

    if (selected) {
      const dv = selected.getAttribute('data-value');
      value = dv != null ? dv : leadingCode(selected.textContent);
    } else if (readonly) {
      value = collapse(readonly.textContent);
      isLocked = true; // a readonly value means PCC is showing it signed/locked
    } else if (field) {
      value = fieldValue(field);
    }

    answers[itemId] = { value, isLocked };
  }

  // --- Secondary pass: standalone named inputs/selects (ack_, composites) ---
  // Captures keys that aren't a question wrapper's primary value, e.g. the
  // hidden ack_{ITEM} acknowledgement inputs and A_SHORTA-style composites.
  for (const el of doc.querySelectorAll('input[id], input[name], select[id], select[name], textarea[id], textarea[name]')) {
    const key = el.id || el.getAttribute('name');
    if (!key || !MDS_ITEM_RE.test(key) || key in answers) continue;
    answers[key] = { value: fieldValue(el), isLocked: false };
  }

  return { answers };
}

/**
 * Parse the section-listing page (`/clinical/mds3/sectionlisting.xhtml`).
 *
 * Real PCC structure per box (validated against demo/mds-summary.html):
 *   <div class="section_box complete|notapplicable|disabled"
 *        onclick="location.href='section.xhtml?ESOLassessid=…&sectioncode=A';"
 *        title="Identification Information (Signed)">
 *     <div class="section_label">Identification Information</div>   ← NAME, not code
 *     <h2>A</h2>                                                    ← the section CODE
 *     <div class="section_status">Complete</div>
 *   </div>
 *
 * So: code comes from <h2> (fallback: the sectioncode= param in onclick),
 * the human status comes from the title parenthetical ("… (Signed)"), and a
 * section is skippable when its class is notapplicable/disabled.
 */
export function parseSectionListing(input) {
  const doc = toDoc(input);
  let boxes = doc.querySelectorAll('#mdssectionlist .section_box');
  if (!boxes.length) boxes = doc.querySelectorAll('.section_box');

  const out = [];
  for (const box of boxes) {
    let code = collapse(box.querySelector('h2')?.textContent);
    if (!code) {
      const m = /sectioncode=([A-Za-z0-9]+)/i.exec(box.getAttribute('onclick') || '');
      if (m) code = m[1].toUpperCase();
    }
    if (!code || !/^[A-Z]+[0-9]*$/.test(code)) continue;

    // Prefer the status word PCC puts in the title — "… (Signed)" / "…
    // (Not Applicable)" / "… (In Progress)" — else the section_status text.
    const title = box.getAttribute('title') || '';
    const paren = /\(([^)]+)\)\s*$/.exec(title);
    const status = paren
      ? collapse(paren[1])
      : collapse(box.querySelector('.section_status')?.textContent);

    const cls = box.getAttribute('class') || '';
    const disabled = /\b(notapplicable|disabled)\b/.test(cls) || /not applicable/i.test(status);

    out.push({ code, status, disabled });
  }
  return out;
}
