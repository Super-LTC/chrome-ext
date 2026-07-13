import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { normalizeSearchResults, buildSuggestedList } from '../../../queries/lib/icd10-picker-util.js';

const DEBOUNCE_MS = 250;

/**
 * Preact ICD-10 code picker for the batch review cards.
 *
 * Nothing is pre-selected — the nurse deliberately attaches (or omits) a
 * suggested code for the physician. In legacy mode it auto-runs a library
 * search seeded with the diagnosis (name or the source code) so the top
 * relevant codes are one click away. Every searched code comes from the
 * sanctioned /api/extension/icd10-search endpoint (A-codes scrubbed
 * server-side).
 *
 * Curated mode: when the caller supplies backend-vetted `preferred`/`options`,
 * render them recommended-first with no network call, and demote free-text
 * search behind a disclosure toggle. Mirrors the vanilla `Icd10CodePicker`.
 *
 * Shares the `super-icd10-picker` CSS with the vanilla widget.
 *
 * @param {Object} props
 * @param {string} props.seedQuery - Diagnosis name / code to seed suggestions
 * @param {{code, description}|null} props.selected - Current selection
 * @param {Function} props.onChange - (selected|null) => void
 * @param {boolean} [props.disabled]
 * @param {{code, description}|null} [props.preferred] - Curated recommended code
 * @param {Array<{code, description}>} [props.options] - Curated alternative codes
 */
export const Icd10CodePicker = ({ seedQuery = '', selected, onChange, disabled = false, preferred = null, options = [] }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [heading, setHeading] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const tokenRef = useRef(0);
  const timerRef = useRef(null);

  // Curated mode: caller supplied backend-vetted codes. Render them recommended-first
  // with no network call, and demote free-text search behind a disclosure toggle.
  const curated = buildSuggestedList({ preferred, options });
  const isCurated = curated.length > 0;

  const runSearch = useCallback(async (q, headingText) => {
    const token = ++tokenRef.current;
    const text = (q || '').trim();
    if (text.length < 2) {
      if (token === tokenRef.current) { setResults([]); setHeading(''); }
      return;
    }
    setLoading(true);
    try {
      const { results: raw } = await window.QueryAPI.searchIcd10(text);
      if (token !== tokenRef.current) return;
      setResults(normalizeSearchResults({ results: raw }));
      setHeading(headingText || '');
    } catch (err) {
      if (token !== tokenRef.current) return;
      console.error('[Icd10CodePicker] search failed', err);
      setResults([]);
      setHeading('');
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  }, []);

  // Seed suggestions on mount (and when the seed changes) while nothing is picked.
  // Curated mode never runs a seed search — the curated list is the default.
  useEffect(() => {
    if (!isCurated && !selected && seedQuery && seedQuery.trim().length >= 2) {
      runSearch(seedQuery, 'Suggested for this diagnosis');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuery]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) {
      // Empty/short query — fall back. Curated mode's fallback is the curated
      // list itself, never a seed search (that's the junk list it exists to avoid).
      if (isCurated) {
        tokenRef.current++;
        setResults([]);
        setHeading('');
      } else if (seedQuery && seedQuery.trim().length >= 2) {
        runSearch(seedQuery, 'Suggested for this diagnosis');
      } else {
        tokenRef.current++;
        setResults([]);
        setHeading('');
      }
      return;
    }
    timerRef.current = setTimeout(() => runSearch(val, ''), DEBOUNCE_MS);
  };

  const pick = (r) => {
    tokenRef.current++;
    setResults([]);
    setHeading('');
    setQuery('');
    onChange({ code: r.code, description: r.description || '' });
  };

  const remove = () => {
    onChange(null);
    if (isCurated) {
      // Curated list shows again because nothing is selected. Collapse search.
      setSearchOpen(false);
    } else if (seedQuery && seedQuery.trim().length >= 2) {
      runSearch(seedQuery, 'Suggested for this diagnosis');
    }
  };

  // An "active" free-text search is one with a runnable query (≥2 chars). This
  // distinguishes "the nurse is searching and got nothing" (→ no-results) from
  // "no query typed" (→ curated list default).
  const hasActiveQuery = query.trim().length >= 2;

  // In curated mode the live search results override the curated list once the
  // nurse runs a real query. With no active query the curated list is the default
  // body. A ≥2-char curated search that returns empty shows a no-results message.
  const showNoResults = isCurated && hasActiveQuery && !loading && results.length === 0;
  const showCuratedList = isCurated && !hasActiveQuery && results.length === 0 && !loading;

  return (
    <div className="super-icd10-picker">
      <div className="super-icd10-picker__label-row">
        <span className="super-icd10-picker__label">Suggested code for physician</span>
        <span className="super-icd10-picker__optional">Optional</span>
      </div>

      <div className="super-icd10-picker__selection">
        {selected ? (
          <div className="super-icd10-picker__chip">
            <span className="super-icd10-picker__chip-code">{selected.code}</span>
            <span className="super-icd10-picker__chip-desc">{selected.description || ''}</span>
            {!disabled && (
              /* NO_TRACK: intra-widget code-picker control; business event fires at query send */
              <button type="button" className="super-icd10-picker__chip-remove" onClick={remove} aria-label="Remove code">
                &times;
              </button>
            )}
          </div>
        ) : (
          <div className="super-icd10-picker__empty">
            <span className="super-icd10-picker__empty-icon">&#9432;</span>
            <span>No code attached — the physician will choose. Attaching one helps them; search below to add it.</span>
          </div>
        )}
      </div>

      {isCurated && !searchOpen && (
        /* NO_TRACK: intra-widget code-picker control; business event fires at query send */
        <button
          type="button"
          className="super-icd10-picker__toggle-search"
          onClick={() => setSearchOpen(true)}
          disabled={disabled}
        >
          Search for a different code
        </button>
      )}

      {(!isCurated || searchOpen) && (
        <div className="super-icd10-picker__search">
          <input
            type="text"
            className="super-icd10-picker__input"
            placeholder="Search ICD-10 by code or description…"
            value={query}
            onInput={onInput}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      )}

      <div className="super-icd10-picker__results" aria-live="polite">
        {loading && <div className="super-icd10-picker__loading">Searching…</div>}
        {showCuratedList && curated.map(r => (
          <button
            key={r.code}
            type="button"
            className={`super-icd10-picker__result${r.recommended ? ' super-icd10-picker__result--recommended' : ''}`}
            onClick={() => pick(r)}
            disabled={disabled}
          >
            {r.recommended && <span className="super-icd10-picker__result-badge">★ Recommended</span>}
            <span className="super-icd10-picker__result-code">{r.code}</span>
            <span className="super-icd10-picker__result-desc">{r.description || ''}</span>
            {r.recommended && <span className="super-icd10-picker__result-attach">+ Attach</span>}
          </button>
        ))}
        {showNoResults && (
          <div className="super-icd10-picker__no-results">No matching codes</div>
        )}
        {!loading && !showCuratedList && !showNoResults && heading && results.length > 0 && (
          <div className="super-icd10-picker__results-heading">{heading}</div>
        )}
        {!loading && !showCuratedList && !showNoResults && results.map(r => (
          <button
            key={r.code}
            type="button"
            className="super-icd10-picker__result"
            onClick={() => pick(r)}
            disabled={disabled}
          >
            <span className="super-icd10-picker__result-code">{r.code}</span>
            <span className="super-icd10-picker__result-desc">{r.description || ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
