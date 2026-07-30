/**
 * Comment box with @-mention autocomplete.
 *
 * The textarea holds what she TYPED ("@Joanna Lucius"), not the storage format
 * ("@[user:abc123]") — you cannot render one string and submit another from a
 * plain textarea, and swapping to a contenteditable to fake it costs more than
 * it buys. So we keep the display text in the box, remember which people were
 * actually picked, and convert on submit.
 *
 * Only PICKED people become tokens. Typing "@joanna" by hand and never
 * choosing her from the list tags nobody — the alternative is fuzzy-matching
 * names at submit time, which would eventually tag the wrong Joanna.
 */

import { useState, useRef, useEffect, useCallback } from 'preact/hooks';

/** Caret-anchored "@word" being typed, or null. */
function activeQuery(value, caret) {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  // Must start a word: beginning of input or preceded by whitespace.
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const term = upto.slice(at + 1);
  // A space ends it — mention terms are one or two words at most, and letting
  // it run would match the whole rest of the sentence.
  if (/[\n]/.test(term) || term.split(' ').length > 2) return null;
  return { at, term };
}

function displayName(t) {
  return t.name || t.email?.split('@')[0] || 'user';
}

/** "@Joanna Lucius" -> "@[user:abc]" for every person actually picked. */
export function toMentionTokens(text, picked) {
  let out = text;
  // Longest names first: "@Ann Marie" must not be half-replaced by "@Ann".
  const byLength = [...picked].sort(
    (a, b) => displayName(b).length - displayName(a).length
  );
  for (const p of byLength) {
    const name = displayName(p);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`@${escaped}\\b`, 'g'), `@[user:${p.id}]`);
  }
  return out;
}

export function MentionInput({
  value,
  onInput,
  onSubmit,
  onPickedChange,
  teammates,
  disabled,
  placeholder,
}) {
  const [query, setQuery] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const [picked, setPicked] = useState([]);
  const areaRef = useRef(null);

  useEffect(() => onPickedChange?.(picked), [picked, onPickedChange]);

  // Clearing the box clears who was tagged — otherwise a name picked for a
  // discarded draft would silently tag them on the next comment.
  useEffect(() => {
    if (value === '') setPicked([]);
  }, [value]);

  const matches = query
    ? (teammates || [])
        .filter((t) => {
          const q = query.term.toLowerCase();
          if (!q) return true;
          return (
            displayName(t).toLowerCase().includes(q) ||
            (t.email || '').toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
    : [];

  const open = Boolean(query) && matches.length > 0;

  const sync = (e) => {
    const el = e.target;
    onInput(el.value);
    setQuery(activeQuery(el.value, el.selectionStart ?? el.value.length));
    setHighlight(0);
  };

  const choose = useCallback(
    (t) => {
      const el = areaRef.current;
      if (!el || !query) return;
      const name = displayName(t);
      const before = value.slice(0, query.at);
      const after = value.slice((el.selectionStart ?? value.length));
      const next = `${before}@${name} ${after}`;
      onInput(next);
      setPicked((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
      setQuery(null);
      // Put the caret after the inserted name rather than at the end, so she
      // can keep typing mid-sentence.
      const caret = before.length + name.length + 2;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [query, value, onInput]
  );

  const onKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(matches[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div class="thr__mention">
      <textarea
        ref={areaRef}
        class="thr__composer-input"
        rows="1"
        value={value}
        placeholder={placeholder}
        onInput={sync}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        disabled={disabled}
      />
      {open && (
        <ul class="thr__mention-list" role="listbox">
          {matches.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                class={`thr__mention-item${i === highlight ? ' thr__mention-item--on' : ''}`}
                // Mouse-down, not click: blur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(t);
                }}
                onMouseEnter={() => setHighlight(i)}
                // NO_TRACK
              >
                <span class="thr__mention-name">{displayName(t)}</span>
                <span class="thr__mention-email">{t.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
