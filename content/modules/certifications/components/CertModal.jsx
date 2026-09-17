import { useEffect, useRef } from 'preact/hooks';

/**
 * CertModal — polished, content-sized modal for cert workflows.
 * Independent from shared Modal.jsx. Sizes to content, no viewport stretching.
 *
 * `actions` entries: { label, variant, onClick, disabled, icon?, title? }.
 * `icon` takes a rendered node and sits before the label — used by the schedule
 * toggle, where the hourglass carries the meaning and the text only labels it.
 */
export function CertModal({ isOpen, onClose, title, subtitle, children, actions = [] }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      class="cm-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div class="cm">
        <div class="cm__header">
          <div class="cm__header-text">
            <h2 class="cm__title">{title}</h2>
            {subtitle && <span class="cm__subtitle">{subtitle}</span>}
          </div>
          {/* NO_TRACK */}
          <button class="cm__close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div class="cm__body">
          {children}
        </div>
        {actions.length > 0 && (
          <div class="cm__footer">
            {actions.map((action, i) => (
              <button
                key={i}
                class={`cm__btn cm__btn--${action.variant || 'secondary'}${action.icon ? ' cm__btn--with-icon' : ''}`}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.title}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
