// demo/tour/tour-state.js
// Cross-page tour state. The demo is several separate documents, so progress
// must persist in sessionStorage and resume on each page load.
const KEY = 'superTour';

const DEFAULT = { active: false, index: 0, hud: { ntaPoints: 0, dollarsPerDay: 0 }, doctorName: 'Dr. Patel' };

export function getTourState() {
  try { return { ...DEFAULT, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT }; }
}

export function setTourState(patch) {
  const next = { ...getTourState(), ...patch };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function resetTour() { sessionStorage.removeItem(KEY); }

// Stable page id from the current document filename.
export function currentPageId() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace('.html', '');
}
