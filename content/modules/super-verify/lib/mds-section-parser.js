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

export function parseSectionListing(input) {
  const doc = toDoc(input);
  let boxes = doc.querySelectorAll('#mdssectionlist .section_box');
  if (!boxes.length) boxes = doc.querySelectorAll('.section_box');

  const out = [];
  for (const box of boxes) {
    const label = box.querySelector('.section_label');
    if (!label) continue;
    const code = collapse(label.textContent).replace(/^Section\s+/i, '').trim();
    if (!code) continue;
    const status = collapse(box.querySelector('.section_status')?.textContent);
    out.push({ code, status, disabled: /not applicable/i.test(status) });
  }
  return out;
}
