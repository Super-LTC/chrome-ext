// Reusable vanilla ICD-10 code picker for diagnosis-query send surfaces.
//
// The nurse deliberately attaches (or doesn't attach) a suggested code for the
// physician. Nothing is pre-selected — but the picker auto-runs a library
// search seeded with the diagnosis name the moment it opens, so the top
// relevant codes are one click away. "No code" is the default state and is
// always one click back (remove the chip). Every code shown comes from the
// sanctioned /api/extension/icd10-search endpoint (A-codes already scrubbed
// server-side), never an AI guess.
//
// Usage:
//   const picker = Icd10CodePicker.create(containerEl, {
//     seedQuery: 'malnutrition',
//     initialSelected: null,
//     onChange: (selected) => { ... }   // selected = {code, description} | null
//   });
//   picker.getSelected();  // -> {code, description} | null
//   picker.destroy();

import { normalizeSearchResults, buildSuggestedList } from './lib/icd10-picker-util.js';

const DEBOUNCE_MS = 250;

function escapeHTML(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

const Icd10CodePicker = {
  /**
   * @param {HTMLElement} container
   * @param {{seedQuery?: string, initialSelected?: {code,description}|null, onChange?: Function, preferred?: {code,description}|null, options?: Array<{code,description}>}} opts
   * @returns {{getSelected: Function, destroy: Function}}
   */
  create(container, { seedQuery = '', initialSelected = null, onChange = () => {}, preferred = null, options = [] } = {}) {
    let selected = initialSelected && initialSelected.code ? { ...initialSelected } : null;
    let searchToken = 0;
    let debounceTimer = null;

    // Curated mode: caller supplied backend-vetted codes. Render them recommended-first
    // with no network call, and demote free-text search behind a disclosure toggle.
    const curated = buildSuggestedList({ preferred, options });
    const isCurated = curated.length > 0;

    container.classList.add('super-icd10-picker');
    container.innerHTML = `
      <div class="super-icd10-picker__label-row">
        <span class="super-icd10-picker__label">Suggested code for physician</span>
        <span class="super-icd10-picker__optional">Optional</span>
      </div>
      <div class="super-icd10-picker__selection" data-role="selection"></div>
      ${isCurated ? `
      <!-- NO_TRACK: intra-widget code-picker control; business event fires at query send -->
      <button type="button" class="super-icd10-picker__toggle-search" data-role="toggle-search">Search for a different code</button>
      ` : ''}
      <div class="super-icd10-picker__search"${isCurated ? ' hidden' : ''}>
        <input type="text" class="super-icd10-picker__input" data-role="input"
               placeholder="Search ICD-10 by code or description…" autocomplete="off" />
      </div>
      <div class="super-icd10-picker__results" data-role="results" aria-live="polite"></div>
    `;

    const selectionEl = container.querySelector('[data-role="selection"]');
    const inputEl = container.querySelector('[data-role="input"]');
    const resultsEl = container.querySelector('[data-role="results"]');
    const searchEl = container.querySelector('.super-icd10-picker__search');
    const toggleSearchEl = container.querySelector('[data-role="toggle-search"]');

    function renderSelection() {
      if (selected) {
        selectionEl.innerHTML = `
          <div class="super-icd10-picker__chip">
            <span class="super-icd10-picker__chip-code">${escapeHTML(selected.code)}</span>
            <span class="super-icd10-picker__chip-desc">${escapeHTML(selected.description || '')}</span>
            <!-- NO_TRACK: intra-widget code-picker control; business event fires at query send -->
            <button type="button" class="super-icd10-picker__chip-remove" data-role="remove" aria-label="Remove code">&times;</button>
          </div>
        `;
      } else {
        selectionEl.innerHTML = `
          <div class="super-icd10-picker__empty">
            <span class="super-icd10-picker__empty-icon">&#9432;</span>
            <span>No code attached — the physician will choose. Attaching one helps them; search below to add it.</span>
          </div>
        `;
      }
    }

    function setSelected(next) {
      selected = next && next.code ? { code: next.code, description: next.description || '' } : null;
      renderSelection();
      if (selected) {
        // Collapse the results once a pick is made; leave the box for changes.
        resultsEl.innerHTML = '';
        inputEl.value = '';
      }
      onChange(selected);
    }

    function renderResults(results, { heading } = {}) {
      if (!results.length) {
        resultsEl.innerHTML = `<div class="super-icd10-picker__no-results">No matching codes</div>`;
        return;
      }
      const headingHTML = heading
        ? `<div class="super-icd10-picker__results-heading">${escapeHTML(heading)}</div>`
        : '';
      const rows = results.map(r => `
        <!-- NO_TRACK: intra-widget code-picker result; business event fires at query send -->
        <button type="button" class="super-icd10-picker__result" data-code="${escapeHTML(r.code)}" data-desc="${escapeHTML(r.description || '')}">
          <span class="super-icd10-picker__result-code">${escapeHTML(r.code)}</span>
          <span class="super-icd10-picker__result-desc">${escapeHTML(r.description || '')}</span>
        </button>
      `).join('');
      resultsEl.innerHTML = headingHTML + rows;
    }

    function renderCuratedList() {
      const rows = curated.map(r => `
        <!-- NO_TRACK: intra-widget code-picker result; business event fires at query send -->
        <button type="button" class="super-icd10-picker__result${r.recommended ? ' super-icd10-picker__result--recommended' : ''}"
                data-code="${escapeHTML(r.code)}" data-desc="${escapeHTML(r.description || '')}">
          ${r.recommended ? '<span class="super-icd10-picker__result-badge">★ Recommended</span>' : ''}
          <span class="super-icd10-picker__result-code">${escapeHTML(r.code)}</span>
          <span class="super-icd10-picker__result-desc">${escapeHTML(r.description || '')}</span>
          ${r.recommended ? '<span class="super-icd10-picker__result-attach">+ Attach</span>' : ''}
        </button>
      `).join('');
      resultsEl.innerHTML = rows;
    }

    async function runSearch(q, { heading } = {}) {
      const token = ++searchToken;
      const query = (q || '').trim();
      if (query.length < 2) {
        if (token === searchToken) resultsEl.innerHTML = '';
        return;
      }
      resultsEl.innerHTML = `<div class="super-icd10-picker__loading">Searching…</div>`;
      try {
        const { results } = await window.QueryAPI.searchIcd10(query);
        if (token !== searchToken) return; // stale
        renderResults(normalizeSearchResults({ results }), { heading });
      } catch (err) {
        if (token !== searchToken) return;
        console.error('[Icd10CodePicker] search failed', err);
        resultsEl.innerHTML = `<div class="super-icd10-picker__no-results">Search unavailable</div>`;
      }
    }

    // ---- listeners ----
    const onInput = (e) => {
      const val = e.target.value;
      clearTimeout(debounceTimer);
      if (val.trim().length < 2) {
        // Empty/short query — fall back to seeded suggestions.
        clearTimeout(debounceTimer);
        if (seedQuery && seedQuery.trim().length >= 2) {
          runSearch(seedQuery, { heading: 'Suggested for this diagnosis' });
        } else {
          resultsEl.innerHTML = '';
        }
        return;
      }
      debounceTimer = setTimeout(() => runSearch(val), DEBOUNCE_MS);
    };
    inputEl.addEventListener('input', onInput);

    const onResultsClick = (e) => {
      const btn = e.target.closest('[data-code]');
      if (btn) {
        setSelected({ code: btn.getAttribute('data-code'), description: btn.getAttribute('data-desc') });
      }
    };
    resultsEl.addEventListener('click', onResultsClick);

    const onSelectionClick = (e) => {
      if (e.target.closest('[data-role="remove"]')) {
        setSelected(null);
        if (isCurated) {
          renderCuratedList();
        } else if (seedQuery && seedQuery.trim().length >= 2) {
          runSearch(seedQuery, { heading: 'Suggested for this diagnosis' });
        }
        inputEl.focus();
      }
    };
    selectionEl.addEventListener('click', onSelectionClick);

    const onToggleSearch = () => {
      if (searchEl) searchEl.hidden = false;
      if (toggleSearchEl) toggleSearchEl.hidden = true;
      inputEl.focus();
    };
    if (toggleSearchEl) toggleSearchEl.addEventListener('click', onToggleSearch);

    // ---- init ----
    renderSelection();
    if (isCurated) {
      renderCuratedList();
    } else if (!selected && seedQuery && seedQuery.trim().length >= 2) {
      runSearch(seedQuery, { heading: 'Suggested for this diagnosis' });
    }

    return {
      getSelected: () => (selected ? { ...selected } : null),
      destroy: () => {
        clearTimeout(debounceTimer);
        searchToken++; // invalidate in-flight
        inputEl.removeEventListener('input', onInput);
        resultsEl.removeEventListener('click', onResultsClick);
        selectionEl.removeEventListener('click', onSelectionClick);
        if (toggleSearchEl) toggleSearchEl.removeEventListener('click', onToggleSearch);
      }
    };
  }
};

window.Icd10CodePicker = Icd10CodePicker;

export { Icd10CodePicker };
