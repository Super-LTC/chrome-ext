// demo/tour/ValueHud.jsx
// A small corner HUD shown while the guided tour is active. It reads the running
// "value Super found" tally from getTourState().hud and animates the numbers
// counting up whenever the engine dispatches `tour:hud`. Positioned bottom-LEFT
// so it never collides with the PhoneMock (which lives bottom-right).
import { useState, useEffect, useRef } from 'preact/hooks';
import { getTourState } from './tour-state.js';

const SMark = () => (
  <span className="super-tour-mark" aria-hidden="true">S</span>
);

// Simple incremental tween: count `from`→`to` over ~600ms with rAF.
function useCountUp(target) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const dur = 650;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = to; setValue(to); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return value;
}

export const ValueHud = () => {
  const initial = getTourState();
  const [active, setActive] = useState(!!initial.active);
  const [hud, setHud] = useState(initial.hud || { ntaPoints: 0, dollarsPerDay: 0 });

  useEffect(() => {
    const onHud = (e) => {
      setActive(true);
      if (e.detail?.hud) setHud(e.detail.hud);
    };
    const onStep = () => setActive(true);
    const onEnd = () => setActive(false);

    window.addEventListener('tour:hud', onHud);
    window.addEventListener('tour:step', onStep);
    window.addEventListener('tour:finished', onEnd);
    window.addEventListener('tour:exited', onEnd);
    return () => {
      window.removeEventListener('tour:hud', onHud);
      window.removeEventListener('tour:step', onStep);
      window.removeEventListener('tour:finished', onEnd);
      window.removeEventListener('tour:exited', onEnd);
    };
  }, []);

  const nta = useCountUp(hud.ntaPoints || 0);
  const dollars = useCountUp(hud.dollarsPerDay || 0);

  // Only show once Super has actually found something — keeps it out of the way
  // for the opening steps and hidden on the start card / after the tour ends.
  if (!active) return null;
  const hasValue = (hud.ntaPoints || 0) > 0 || (hud.dollarsPerDay || 0) > 0;
  if (!hasValue) return null;

  return (
    <div className="super-tour-hud" role="status" aria-live="polite">
      <div className="super-tour-hud-head">
        <SMark />
        <span className="super-tour-hud-title">Value Super found</span>
      </div>
      <div className="super-tour-hud-metrics">
        <div className="super-tour-hud-metric">
          <span className="super-tour-hud-num">{Math.round(nta)}</span>
          <span className="super-tour-hud-lbl">NTA points</span>
        </div>
        <div className="super-tour-hud-sep" />
        <div className="super-tour-hud-metric">
          <span className="super-tour-hud-num">${Math.round(dollars)}<small>/day</small></span>
          <span className="super-tour-hud-lbl">Est. revenue</span>
        </div>
      </div>
    </div>
  );
};
