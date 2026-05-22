import { render, h } from 'preact';
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import './super-mds-mode.css';

const CONTAINER_ID = 'super-mds-mode-root';

const SECTION_NAMES = {
  A: 'Identification Information',
  B: 'Hearing, Speech & Vision',
  C: 'Cognitive Patterns',
  D: 'Mood',
  E: 'Behavior',
  F: 'Preferences for Routine & Activities',
  G: 'Functional Status',
  GG: 'Functional Abilities',
  H: 'Bladder and Bowel',
  I: 'Active Diagnoses',
  J: 'Health Conditions',
  K: 'Swallowing / Nutritional Status',
  L: 'Oral / Dental Status',
  M: 'Skin Conditions',
  N: 'Medications',
  O: 'Special Treatments, Procedures & Programs',
  P: 'Restraints and Alarms',
  Q: 'Participation in Assessment & Goal Setting',
  S: 'State Specific',
  V: 'Care Area Assessment Summary',
  X: 'Correction Request',
};

// =============================================================================
// Queue construction
// =============================================================================
function collectDocs() {
  const docs = [document];
  const visit = (win) => {
    let frames;
    try { frames = win.frames; } catch { return; }
    for (let i = 0; i < frames.length; i++) {
      try {
        const d = frames[i].document;
        if (d) docs.push(d);
        visit(frames[i]);
      } catch { /* cross-origin frame — skip */ }
    }
  };
  visit(window);
  try {
    if (window !== window.top) {
      docs.push(window.top.document);
      visit(window.top);
    }
  } catch {}
  return Array.from(new Set(docs));
}

// Strip cruft the extension may append to a label (badge text, "Tools ▼", etc.)
function cleanLabel(s) {
  return (s || '')
    .replace(/\s*Tools\s*▼.*$/i, '')
    .replace(/\s*✓\s*Super:\s*(YES|NO).*$/i, '')
    .replace(/\s*✗\s*Super:\s*(YES|NO).*$/i, '')
    .replace(/\s*Super:\s*(YES|NO).*$/i, '')
    .replace(/\s*Response Locked.*$/i, '')
    .replace(/\s*Signed by:.*$/i, '')
    .replace(/\s+\(Col\s+[A-Z0-9]+\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDescription(doc, code, wrap) {
  const re = new RegExp(`^${code}\\.?\\s+(.+)$`);

  // 1) Look inside the wrapper for .question_label (PCC's class)
  if (wrap) {
    const inside = wrap.querySelector?.('.question_label');
    if (inside) {
      const m = (inside.textContent || '').replace(/\s+/g, ' ').trim().match(re);
      if (m && m[1]) return cleanLabel(m[1]);
    }
    // 2) Walk up a few parents looking for a related .question_label
    let p = wrap.parentElement;
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      const found = p.querySelector('.question_label');
      if (found && (found.textContent || '').includes(code)) {
        const m = (found.textContent || '').replace(/\s+/g, ' ').trim().match(re);
        if (m && m[1]) return cleanLabel(m[1]);
      }
    }
  }

  // 3) Fallback: scan the doc. Reject captures that are just another code.
  const labels = doc.querySelectorAll('.question_label, b, div, td, th, label, p, h1, h2, h3, h4, h5, h6');
  for (const el of labels) {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt.length === 0 || txt.length > 300) continue;
    const m = txt.match(re);
    if (!m || !m[1]) continue;
    const captured = cleanLabel(m[1]);
    if (/^[A-Z]\d{3,4}[A-Z0-9]*\.?$/.test(captured)) continue;
    if (/^[\d\s.-]+$/.test(captured)) continue;
    if (captured.length < 2) continue;
    return captured;
  }
  return '';
}

function extractSuperVerdict(wrap) {
  // PCC badges have child spans (checkmark + text), so search the full
  // textContent instead of just leaf nodes.
  const txt = wrap.textContent || '';
  const m = txt.match(/SUPER:\s*(YES|NO)/i);
  if (!m) return null;
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
}

function extractPCCAnswer(wrap) {
  const anchors = Array.from(wrap.querySelectorAll('a'))
    .filter(a => /^(Yes|No|-)$/.test((a.textContent || '').trim()));
  const selected = anchors.find(a => /(^|\s)selected(\s|$)/.test(a.className || ''));
  if (selected) return selected.textContent.trim();
  return null;
}

function readQueue() {
  // Index SuperOverlay.results by elementId for enrichment
  const overlayResults = window.SuperOverlay?.results || [];
  const byElementId = new Map();
  overlayResults.forEach(r => byElementId.set(r.elementId, r));

  const out = [];
  const docs = collectDocs();
  docs.forEach(doc => {
    let wrappers;
    try { wrappers = doc.querySelectorAll('[id$="_wrapper"]'); } catch { return; }
    wrappers.forEach(wrap => {
      const id = wrap.id;
      const codeMatch = id.match(/^([A-Z]\d{3,4})([A-Z0-9]*)_wrapper$/);
      if (!codeMatch) return;
      const mdsItem = codeMatch[1];
      const column = codeMatch[2] || 'A';

      const hasAnchors = Array.from(wrap.querySelectorAll('a'))
        .some(a => /^(Yes|No)$/.test((a.textContent || '').trim()));
      if (!hasAnchors) return;

      const enriched = byElementId.get(id);
      const ai = enriched?.aiAnswer || null;

      // Prefer DOM-derived values — they're verified accurate. SuperOverlay.results
      // sometimes stores codes/numerics in description/pccAnswer. Only borrow the
      // rich AI synopsis (Dx/Tx/rationale/confidence) from enrichment.
      const domDescription = findDescription(doc, id.replace(/_wrapper$/, ''), wrap);
      const domPccAnswer = extractPCCAnswer(wrap);
      const domSuperAnswer = extractSuperVerdict(wrap);

      out.push({
        elementId: id,
        mdsItem,
        column,
        description: domDescription || enriched?.description || '',
        superAnswer: domSuperAnswer || ((ai?.answer === 'Yes' || ai?.answer === 'No') ? ai.answer : null),
        pccAnswer: domPccAnswer || (enriched?.pccAnswer === 'Yes' || enriched?.pccAnswer === 'No' ? enriched.pccAnswer : null),
        aiAnswer: ai,
      });
    });
  });
  console.log('[SuperMDSMode] queue size:', out.length, 'enriched:', out.filter(x => x.aiAnswer).length);
  return out;
}

// =============================================================================
// Evidence helpers
// =============================================================================
function evidenceKind(ev) {
  const t = (ev.sourceType || ev.type || '').toLowerCase();
  const id = (ev.evidenceId || ev.sourceId || '').toLowerCase();
  if (t === 'order' || t === 'mar' || id.startsWith('order-') || id.startsWith('admin-') || id.startsWith('mar-')) return 'order';
  if (t.includes('note') || id.startsWith('pcc-prognote-') || id.startsWith('pcc-practnote-') || id.startsWith('patient-practnote-')) return 'note';
  if (t === 'therapy' || t === 'therapy_doc' || t === 'therapy-doc' || id.startsWith('therapy-doc-')) return 'therapy';
  if (t === 'uda' || id.startsWith('uda-')) return 'uda';
  if (t === 'document' || t === 'pdf' || id.includes('-chunk-') || /\.pdf/i.test(ev.displayName || '')) return 'pdf';
  return 'other';
}

function formatAnswer(a) {
  if (a === 'Yes' || a === 'No') return a.toUpperCase();
  if (a == null || a === '') return '—';
  return String(a).toUpperCase();
}

// =============================================================================
// Component
// =============================================================================
function SuperMDSMode({ onClose }) {
  const queue = useMemo(readQueue, []);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(null);
  const [locked, setLocked] = useState(() => new Map());
  const [evidence, setEvidence] = useState([]);
  const [evIndex, setEvIndex] = useState(0);
  const [evLoading, setEvLoading] = useState(false);
  const [agrees, setAgrees] = useState(0);
  const [disagrees, setDisagrees] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [snap, setSnap] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceHostRef = useRef(null);

  const item = queue[index];
  const total = queue.length;
  const ev = evidence[evIndex] || null;

  // Load evidence when item changes
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setEvidence([]);
    setEvIndex(0);
    setEvLoading(true);
    const section = window.SuperOverlay?.section || item.mdsItem?.[0];
    const fetcher = window.fetchItemEvidence;
    if (!fetcher) { setEvLoading(false); return; }
    fetcher(section, item.mdsItem)
      .then(data => {
        if (cancelled) return;
        const list = (data?.evidenceByColumn?.[item.column] || data?.evidence || []);
        setEvidence(list);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEvLoading(false); });
    return () => { cancelled = true; };
  }, [item?.elementId]);

  const advance = useCallback(() => {
    setPending(null);
    setSnap(true);
    setTimeout(() => setSnap(false), 280);
    setIndex(i => {
      const next = i + 1;
      if (next >= queue.length) { setFinished(true); return i; }
      return next;
    });
  }, [queue.length]);

  const goBack = useCallback(() => {
    setPending(null);
    setIndex(i => Math.max(0, i - 1));
  }, []);

  const lockIn = useCallback(() => {
    if (!item || !pending) return;
    const superAns = item.superAnswer;
    setLocked(m => { const n = new Map(m); n.set(item.elementId, pending); return n; });
    if (superAns) {
      if (pending === superAns) setAgrees(a => a + 1);
      else setDisagrees(d => d + 1);
    }
    advance();
  }, [item, pending, advance]);

  const choose = useCallback((ans) => {
    setPending(p => (p === ans ? p : ans));
  }, []);

  const closeSource = useCallback(() => {
    const host = sourceHostRef.current;
    if (host) {
      while (host.firstChild) host.removeChild(host.firstChild);
    }
    setSourceOpen(false);
  }, []);

  const openPDF = useCallback(() => {
    if (!ev) return;
    if (sourceOpen) { closeSource(); return; }
    setSourceOpen(true);
    requestAnimationFrame(() => {
      const host = sourceHostRef.current;
      if (!host) return;
      const kind = evidenceKind(ev);
      if (kind === 'order') {
        // Orders don't have a viewer modal — render administrations directly into the host
        const orderId = ev.sourceId || ev.evidenceId || '';
        if (orderId && typeof window.renderSplitAdministrations === 'function') {
          try { window.renderSplitAdministrations(host, String(orderId).replace(/^order-/, '')); }
          catch (e) { console.warn('[SuperMDSMode] renderSplitAdministrations failed:', e); }
        }
        return;
      }
      // UDA: make sure patientId is plumbed through
      const augmentedEv = kind === 'uda'
        ? { ...ev, patientId: ev.patientId || window.SuperOverlay?.patientId || null }
        : ev;
      const opener = window.SuperDocViewer?.open;
      if (typeof opener === 'function') {
        try { opener(augmentedEv); } catch (e) { console.warn('[SuperMDSMode] SuperDocViewer.open failed:', e); }
      } else {
        console.warn('[SuperMDSMode] window.SuperDocViewer not available');
      }
    });
  }, [ev, sourceOpen, closeSource]);

  // Scroll the focused evidence card into view when evIndex changes
  useEffect(() => {
    if (!evidence.length) return;
    const host = document.getElementById(CONTAINER_ID);
    const focused = host?.querySelector('.smm-evcard--focused');
    focused?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [evIndex, evidence.length]);

  // Detect when the viewer modal removes itself (user clicked the modal's × button)
  useEffect(() => {
    if (!sourceOpen) return;
    const host = sourceHostRef.current;
    if (!host) return;
    const observer = new MutationObserver(() => {
      if (host.childElementCount === 0) setSourceOpen(false);
    });
    observer.observe(host, { childList: true });
    return () => observer.disconnect();
  }, [sourceOpen]);

  // Keyboard
  useEffect(() => {
    if (finished) {
      const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const onKey = (e) => {
      // Don't hijack keys while typing in a text input
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (sourceOpen) { closeSource(); return; }
        if (pending) { setPending(null); return; }
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        if (pending) { e.preventDefault(); lockIn(); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'y' || e.key === 'Y') {
        e.preventDefault(); choose('Yes'); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'n' || e.key === 'N') {
        e.preventDefault(); choose('No'); return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEvIndex(i => (evidence.length ? (i + 1) % evidence.length : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEvIndex(i => (evidence.length ? (i - 1 + evidence.length) % evidence.length : 0));
        return;
      }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); openPDF(); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); goBack(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, lockIn, choose, openPDF, goBack, closeSource, sourceOpen, evidence.length, finished, onClose]);

  if (!total) {
    return (
      <div className="smm-backdrop" onClick={onClose}>
        <div className="smm-card smm-card--empty" onClick={e => e.stopPropagation()}>
          <div className="smm-empty-icon">⚡</div>
          <h2>Nothing to review</h2>
          <p>No MDS items found on this page.</p>
          {/* NO_TRACK: prototype-only close button in empty-state card */}
          <button className="smm-btn smm-btn--ghost" onClick={onClose}>Close (Esc)</button>
        </div>
      </div>
    );
  }

  if (finished) {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return (
      <div className="smm-backdrop">
        <div className="smm-card smm-card--done">
          <div className="smm-done-check">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h2>Section complete</h2>
          <div className="smm-done-stats">
            <div><strong>{total}</strong><span>reviewed</span></div>
            <div className="smm-done-agree"><strong>{agrees}</strong><span>agreed</span></div>
            <div className="smm-done-dis"><strong>{disagrees}</strong><span>disagreed</span></div>
            <div><strong>{min}:{String(sec).padStart(2,'0')}</strong><span>elapsed</span></div>
          </div>
          {/* NO_TRACK: prototype-only done button in completion card */}
          <button className="smm-btn smm-btn--primary" onClick={onClose}>Close (Enter)</button>
        </div>
      </div>
    );
  }

  const superAns = item.superAnswer;
  const pccAns = item.pccAnswer;
  const ai = item.aiAnswer || null;
  const progress = ((index) / total) * 100;
  const pendingClass = pending === 'Yes' ? 'smm-backdrop--yes' : pending === 'No' ? 'smm-backdrop--no' : '';

  return (
    <div className={`smm-backdrop ${pendingClass}`}>
      <div className="smm-bg-mesh" aria-hidden="true" />

      <div className="smm-topbar">
        <div className="smm-topbar__left">
          <span className="smm-logo">S</span>
          <span className="smm-title">Super Review</span>
          <span className="smm-section-chip">
            <span className="smm-section-chip__letter">{window.SuperOverlay?.section || item.mdsItem?.[0] || '?'}</span>
            <span className="smm-section-chip__name">{SECTION_NAMES[window.SuperOverlay?.section || item.mdsItem?.[0]] || 'MDS Section'}</span>
          </span>
        </div>
        <div className="smm-topbar__right">
          <span className="smm-counter">{index + 1}<span className="smm-counter__sep"> / </span>{total}</span>
          {/* NO_TRACK: pure-UI close button in Super MDS Mode topbar */}
          <button className="smm-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="smm-progress"><div className="smm-progress__fill" style={{ width: `${progress}%` }} /></div>

      <div className={`smm-stage ${snap ? 'smm-stage--snap' : ''} ${sourceOpen ? 'smm-stage--source' : ''}`}>
        {/* LEFT: decision */}
        <div className="smm-decision">
          <div className="smm-rail" aria-hidden="true" />
          <div className="smm-itemcode">{item.mdsItem}{item.column && item.column !== 'A' ? ` · Col ${item.column}` : ''}</div>
          <h1 className="smm-question">{item.description || '(no description)'}</h1>

          <div className="smm-pills">
            <div className="smm-pill smm-pill--pcc">
              <span className="smm-pill__label">Currently coded</span>
              <span className={`smm-pill__value smm-pill__value--${(pccAns||'').toLowerCase()||'blank'}`}>{formatAnswer(pccAns)}</span>
            </div>
            <div className="smm-arrow" aria-hidden="true">→</div>
            <div className="smm-pill smm-pill--super">
              <span className="smm-pill__label">Super says</span>
              <span className={`smm-pill__value smm-pill__value--${(superAns||'').toLowerCase()||'blank'}`}>{formatAnswer(superAns)}</span>
            </div>
          </div>

          <div className="smm-actions">
            {/* NO_TRACK: prototype Super Review disagree (no PCC write yet) */}
            <button
              className={`smm-action smm-action--no ${pending === 'No' ? 'smm-action--pending' : ''}`}
              onClick={() => { if (pending === 'No') lockIn(); else choose('No'); }}
            >
              <span className="smm-action__key">N · ←</span>
              <span className="smm-action__label">✗ Disagree</span>
            </button>
            {/* NO_TRACK: prototype Super Review agree (no PCC write yet) */}
            <button
              className={`smm-action smm-action--yes ${pending === 'Yes' ? 'smm-action--pending' : ''}`}
              onClick={() => { if (pending === 'Yes') lockIn(); else choose('Yes'); }}
            >
              <span className="smm-action__key">Y · →</span>
              <span className="smm-action__label">✓ Agree</span>
            </button>
          </div>

          <div className="smm-confirm">
            {pending
              ? <span className="smm-confirm__active">Press <kbd>Enter</kbd> to lock in <strong>{pending.toUpperCase()}</strong></span>
              : <span className="smm-confirm__idle"><kbd>Y</kbd>/<kbd>N</kbd> to choose · <kbd>Esc</kbd> to exit</span>}
          </div>
        </div>

        {/* RIGHT: evidence stack */}
        <aside className="smm-evidence-panel">
          {/* Inline source viewer host — full-bleed when P is pressed */}
          {sourceOpen && (
            <div className="smm-source-wrap">
              <div className="smm-source-bar">
                <span className="smm-source-bar__label">{ev?.displayName || 'Source'} · <kbd>Esc</kbd> to close</span>
                {/* NO_TRACK: prototype source close */}
                <button className="smm-source-bar__close" onClick={closeSource} aria-label="Close source">×</button>
              </div>
              <div className="smm-source-host" ref={sourceHostRef} />
            </div>
          )}

          {/* Dx / Tx synopsis at the top — useful per-item context */}
          {(ai?.diagnosisSummary || ai?.treatmentSummary) && (
            <div className="smm-synopsis">
              {ai.diagnosisSummary && (
                <div className={`smm-synopsis__line smm-synopsis__line--${ai.diagnosisPassed ? 'pass' : 'fail'}`}>
                  <span className="smm-synopsis__icon">{ai.diagnosisPassed ? '✓' : '✗'}</span>
                  <span className="smm-synopsis__label">Dx</span>
                  <span className="smm-synopsis__text">{ai.diagnosisSummary}</span>
                </div>
              )}
              {ai.treatmentSummary && (
                <div className={`smm-synopsis__line smm-synopsis__line--${ai.activeStatusPassed ? 'pass' : 'fail'}`}>
                  <span className="smm-synopsis__icon">{ai.activeStatusPassed ? '✓' : '✗'}</span>
                  <span className="smm-synopsis__label">Tx</span>
                  <span className="smm-synopsis__text">{ai.treatmentSummary}</span>
                </div>
              )}
            </div>
          )}

          {/* Evidence stack — every piece visible, focused one outlined */}
          <div className="smm-stack">
            {evLoading && <div className="smm-stack__loading">Loading evidence…</div>}
            {!evLoading && evidence.length === 0 && (
              <div className="smm-stack__empty">No evidence available for this item.</div>
            )}
            {!evLoading && evidence.map((e, i) => {
              const quote = e.quoteText || e.orderDescription || e.quote || e.text || e.rationale || '';
              const date = e.date || e.signedDate || e.createdDate || e.orderDate || e.encounterDate || '';
              const kind = evidenceKind(e);
              const isFocused = i === evIndex;
              return (
                <div
                  key={e.evidenceId || e.sourceId || i}
                  className={`smm-evcard ${isFocused ? 'smm-evcard--focused' : ''}`}
                  onClick={() => setEvIndex(i)}
                >
                  <div className="smm-evcard__head">
                    <span className={`smm-evcard__source smm-evcard__source--${kind}`}>{e.displayName || e.sourceType || 'Source'}</span>
                    {date && <span className="smm-evcard__date">{String(date).slice(0, 10)}</span>}
                  </div>
                  <div className="smm-evcard__quote">{quote || '(no excerpt)'}</div>
                  {e.rationale && e.rationale !== quote && (
                    <div className="smm-evcard__rationale">{e.rationale}</div>
                  )}
                  {isFocused && (
                    <div className="smm-evcard__action">
                      {/* NO_TRACK: prototype open-source affordance (also via P key) */}
                      <button className="smm-open" onClick={(ev) => { ev.stopPropagation(); openPDF(); }}>
                        <span>Open {kind === 'order' ? 'administrations' : kind === 'uda' ? 'assessment' : 'source'}</span>
                        <span className="smm-open__key">P</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Slim keyboard hint strip */}
          {evidence.length > 0 && (
            <div className="smm-evfoot">
              <span className="smm-evfoot__hints">
                {evidence.length > 1 && <><kbd>↑</kbd><kbd>↓</kbd> focus · </>}
                <kbd>P</kbd> open · <kbd>Esc</kbd> exit
              </span>
              <span className="smm-evfoot__pos">{evIndex + 1}<span className="smm-evfoot__sep"> / </span>{evidence.length}</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function openSuperMDSMode() {
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    document.body.appendChild(host);
  }
  const close = () => {
    render(null, host);
    host.remove();
  };
  render(h(SuperMDSMode, { onClose: close }), host);
}

if (typeof window !== 'undefined') {
  window.openSuperMDSMode = openSuperMDSMode;
}
