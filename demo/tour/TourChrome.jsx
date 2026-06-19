// demo/tour/TourChrome.jsx
// Tour "chrome": the pre-start invitation card + the persistent progress bar
// shown while a guided tour is running. Mounted once per page into
// #super-tour-chrome by each demo entry. It talks to the tour engine purely
// through window events (tour:offer / tour:step / tour:finished / tour:exited).
import { useState, useEffect } from 'preact/hooks';
import { startTour, exitTour } from './tour-runner.jsx';
import { getTourState } from './tour-state.js';
import { STEPS } from './tour-script.js';
import { ValueHud } from './ValueHud.jsx';

const SMark = () => (
  <span className="super-tour-mark" aria-hidden="true">S</span>
);

const EndCard = ({ hud, onRestart }) => {
  const nta = hud?.ntaPoints || 0;
  const dollars = hud?.dollarsPerDay || 0;
  return (
    <div className="super-tour-end-backdrop">
      <div className="super-tour-end">
        <div className="super-tour-end-mark"><SMark /></div>
        <h2 className="super-tour-end-title">That's Super.</h2>
        <p className="super-tour-end-tally">
          Super found <strong>{nta} NTA point{nta === 1 ? '' : 's'}</strong> and
          {' '}<strong>~${dollars}/day</strong> in supported acuity for one resident.
        </p>
        <ul className="super-tour-end-bullets">
          <li><span className="super-tour-end-check">✓</span> Smarter, defensible diagnosis coding</li>
          <li><span className="super-tour-end-check">✓</span> Physician queries answered in seconds</li>
          <li><span className="super-tour-end-check">✓</span> Facility-wide quality measures, in real time</li>
        </ul>
        <div className="super-tour-end-actions">
          <a
            className="super-tour-btn super-tour-btn-primary"
            href="https://superltc.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Book a demo
          </a>
          <button
            type="button"
            className="super-tour-btn super-tour-btn-ghost"
            onClick={onRestart}
          >
            Restart tour
          </button>
        </div>
      </div>
    </div>
  );
};

export const TourChrome = () => {
  // active = a tour is running on this page; offer = show the start card.
  const initial = getTourState();
  const [active, setActive] = useState(!!initial.active);
  const [offered, setOffered] = useState(false);
  const [step, setStep] = useState({ index: initial.index || 0, total: STEPS.length });
  const [ended, setEnded] = useState(null); // null | { hud }

  useEffect(() => {
    const onOffer = () => { setOffered(true); };
    const onStep = (e) => {
      setActive(true);
      setOffered(false);
      setEnded(null);
      setStep({ index: e.detail?.index ?? 0, total: e.detail?.total ?? 0 });
    };
    const onFinished = (e) => { setActive(false); setOffered(false); setEnded({ hud: e.detail?.hud }); };
    const onExited = () => { setActive(false); setOffered(false); setEnded(null); };

    window.addEventListener('tour:offer', onOffer);
    window.addEventListener('tour:step', onStep);
    window.addEventListener('tour:finished', onFinished);
    window.addEventListener('tour:exited', onExited);
    return () => {
      window.removeEventListener('tour:offer', onOffer);
      window.removeEventListener('tour:step', onStep);
      window.removeEventListener('tour:finished', onFinished);
      window.removeEventListener('tour:exited', onExited);
    };
  }, []);

  const showStart = offered && !active;

  // Progress bar: "Step N of M". Fall back to the known step count so the bar
  // reads correctly the instant the tour starts (no "Starting…" flash).
  const total = step.total || STEPS.length;
  const current = Math.min(step.index + 1, total);
  const pct = total ? Math.round((current / total) * 100) : 0;

  return (
    <div className="super-tour-chrome">
      {active && (
        <div className="super-tour-bar" role="status">
          <div className="super-tour-bar-fill" style={{ width: `${pct}%` }} />
          <div className="super-tour-bar-row">
            <div className="super-tour-bar-brand"><SMark /><span>Super tour</span></div>
            <div className="super-tour-bar-label">
              {`Step ${current} of ${total}`}
            </div>
            <button
              type="button"
              className="super-tour-exit super-tour-exit--ghost"
              onClick={() => startTour()}
            >
              Restart
            </button>
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

      <ValueHud />

      {ended && (
        <EndCard
          hud={ended.hud}
          onRestart={() => { setEnded(null); startTour(); }}
        />
      )}
    </div>
  );
};
