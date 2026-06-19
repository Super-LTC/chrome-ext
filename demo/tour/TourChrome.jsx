// demo/tour/TourChrome.jsx
// Tour "chrome": the pre-start invitation card + the persistent progress bar
// shown while a guided tour is running. Mounted once per page into
// #super-tour-chrome by each demo entry. It talks to the tour engine purely
// through window events (tour:offer / tour:step / tour:finished / tour:exited).
import { useState, useEffect } from 'preact/hooks';
import { startTour, exitTour } from './tour-runner.jsx';
import { getTourState } from './tour-state.js';

const SMark = () => (
  <span className="super-tour-mark" aria-hidden="true">S</span>
);

export const TourChrome = () => {
  // active = a tour is running on this page; offer = show the start card.
  const initial = getTourState();
  const [active, setActive] = useState(!!initial.active);
  const [offered, setOffered] = useState(false);
  const [step, setStep] = useState({ index: initial.index || 0, total: 0 });

  useEffect(() => {
    const onOffer = () => { setOffered(true); };
    const onStep = (e) => {
      setActive(true);
      setOffered(false);
      setStep({ index: e.detail?.index ?? 0, total: e.detail?.total ?? 0 });
    };
    const onEnd = () => { setActive(false); setOffered(false); };

    window.addEventListener('tour:offer', onOffer);
    window.addEventListener('tour:step', onStep);
    window.addEventListener('tour:finished', onEnd);
    window.addEventListener('tour:exited', onEnd);
    return () => {
      window.removeEventListener('tour:offer', onOffer);
      window.removeEventListener('tour:step', onStep);
      window.removeEventListener('tour:finished', onEnd);
      window.removeEventListener('tour:exited', onEnd);
    };
  }, []);

  const showStart = offered && !active;

  // Progress bar: "Step N of M". total may be 0 until the first tour:step lands.
  const total = step.total || 0;
  const current = Math.min(step.index + 1, total || step.index + 1);
  const pct = total ? Math.round((current / total) * 100) : 0;

  return (
    <div className="super-tour-chrome">
      {active && (
        <div className="super-tour-bar" role="status">
          <div className="super-tour-bar-fill" style={{ width: `${pct}%` }} />
          <div className="super-tour-bar-row">
            <div className="super-tour-bar-brand"><SMark /><span>Super tour</span></div>
            <div className="super-tour-bar-label">
              {total ? `Step ${current} of ${total}` : 'Starting…'}
            </div>
            <button
              type="button"
              className="super-tour-exit"
              onClick={() => exitTour()}
            >
              Exit tour
            </button>
          </div>
        </div>
      )}

      {showStart && (
        <div className="super-tour-start-backdrop" onClick={() => setOffered(false)}>
          <div className="super-tour-start" onClick={(e) => e.stopPropagation()}>
            <div className="super-tour-start-mark"><SMark /></div>
            <h2 className="super-tour-start-title">See Super in 2 minutes</h2>
            <p className="super-tour-start-sub">
              A quick guided walk through Jane Doe's MDS — coding, queries, and the
              Command Center. No setup, nothing to break.
            </p>
            <div className="super-tour-start-actions">
              <button
                type="button"
                className="super-tour-btn super-tour-btn-primary"
                onClick={() => { setOffered(false); startTour(); }}
              >
                Take the guided tour
              </button>
              <button
                type="button"
                className="super-tour-btn super-tour-btn-ghost"
                onClick={() => setOffered(false)}
              >
                Explore on your own
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
