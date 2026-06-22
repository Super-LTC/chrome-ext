import { useState, useCallback } from 'preact/hooks';

let _id = 0;

/**
 * Lightweight toast host + controller. Returns `[toast, ToastHost]`.
 * toast(message, { good?, undo? }) — undo keeps it up longer and shows an Undo.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, { good = false, undo = null } = {}) => {
    const id = ++_id;
    setToasts((ts) => [...ts, { id, message, good, undo }]);
    setTimeout(() => remove(id), undo ? 4200 : 2400);
    return id;
  }, [remove]);

  const ToastHost = useCallback(
    () => (
      <div className="sv-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`sv-toast${t.good ? ' is-good' : ''}`}>
            <span className="sv-toast__msg" dangerouslySetInnerHTML={{ __html: t.message }} />
            {t.undo ? (
              <span
                className="sv-toast__undo"
                onClick={() => {
                  t.undo();
                  remove(t.id);
                }}
              >
                Undo
              </span>
            ) : null}
          </div>
        ))}
      </div>
    ),
    [toasts, remove],
  );

  return [toast, ToastHost];
}
