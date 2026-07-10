import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { normalizeSearchResults } from '../../../queries/lib/icd10-picker-util.js';

const DEBOUNCE_MS = 250;

/**
 * Preact ICD-10 code picker for the batch review cards.
 *
 * Nothing is pre-selected — the nurse deliberately attaches (or omits) a
 * suggested code for the physician. On mount it auto-runs a library search
 * seeded with the diagnosis (name or the source code) so the top relevant
 * codes are one click away. Every code shown comes from the sanctioned
 * /api/extension/icd10-search endpoint (A-codes scrubbed server-side).
 *
 * Shares the `super-icd10-picker` CSS with the vanilla widget.
 *
 * @param {Object} props
 * @param {string} props.seedQuery - Diagnosis name / code to seed suggestions
 * @param {{code, description}|null} props.selected - Current selection
 * @param {Function} props.onChange - (selected|null) => void
 * @param {boolean} [props.disabled]
 */
export const Icd10CodePicker = ({ seedQuery = '', selected, onChange, disabled = false }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [heading, setHeading] = useState('');
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(0);
  const timerRef = useRef(null);

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
  useEffect(() => {
    if (!selected && seedQuery && seedQuery.trim().length >= 2) {
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
      // Fall back to seeded suggestions when the box is cleared.
      if (seedQuery && seedQuery.trim().length >= 2) {
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
    if (seedQuery && seedQuery.trim().length >= 2) {
      runSearch(seedQuery, 'Suggested for this diagnosis');
    }
  };

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

      <div className="super-icd10-picker__results" aria-live="polite">
        {loading && <div className="super-icd10-picker__loading">Searching…</div>}
        {!loading && heading && results.length > 0 && (
          <div className="super-icd10-picker__results-heading">{heading}</div>
        )}
        {!loading && results.map(r => (
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
