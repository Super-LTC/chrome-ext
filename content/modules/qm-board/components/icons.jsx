/**
 * Inline SVG icons for the QM Command Center (the web app used lucide-react).
 * Each accepts a className; sizing is via CSS. Stroke-based, 24x24 viewBox.
 */
// Default 16×16 so an icon used without a CSS size rule stays small instead of
// stretching to fill its flex container. CSS `width`/`height` (e.g.
// `.qmc-modal__close svg`) and inline styles still override these attributes.
const base = {
  width: 16, height: 16,
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
};

export const ShieldCheck = (p) => (
  <svg {...base} className={p.className}><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>
);
export const CalendarClock = (p) => (
  <svg {...base} className={p.className}><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="18" cy="18" r="4"/><path d="M18 16.5V18l1 1"/></svg>
);
export const Activity = (p) => (
  <svg {...base} className={p.className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
);
export const ChevronRight = (p) => (
  <svg {...base} className={p.className}><path d="m9 18 6-6-6-6"/></svg>
);
export const ChevronDown = (p) => (
  <svg {...base} className={p.className}><path d="m6 9 6 6 6-6"/></svg>
);
export const ChevronLeft = (p) => (
  <svg {...base} className={p.className}><path d="m15 18-6-6 6-6"/></svg>
);
export const CircleCheck = (p) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
);
export const Search = (p) => (
  <svg {...base} className={p.className}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
export const X = (p) => (
  <svg {...base} className={p.className}><path d="M18 6 6 18M6 6l12 12"/></svg>
);
export const Clock = (p) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
);
export const Undo2 = (p) => (
  <svg {...base} className={p.className}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
);
export const TrendingDown = (p) => (
  <svg {...base} className={p.className}><path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/></svg>
);
export const Info = (p) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
);
