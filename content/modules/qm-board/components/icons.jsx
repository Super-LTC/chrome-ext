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
export const List = (p) => (
  <svg {...base} className={p.className}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
);
export const Grid = (p) => (
  <svg {...base} className={p.className}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
);
export const CalendarDays = (p) => (
  <svg {...base} className={p.className}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
);
export const Bell = (p) => (
  <svg {...base} className={p.className}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
);
export const ArrowUpRight = (p) => (
  <svg {...base} className={p.className}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
);
export const TrendingUp = (p) => (
  <svg {...base} className={p.className}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
);
export const Target = (p) => (
  <svg {...base} className={p.className}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);
export const ListChecks = (p) => (
  <svg {...base} className={p.className}><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>
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
export const ArrowRight = (p) => (
  <svg {...base} className={p.className}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
);
export const ClipboardCheck = (p) => (
  <svg {...base} className={p.className}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
);
// Star — `fill` controls filled vs hollow (pass fill="currentColor" for filled).
export const Star = (p) => (
  <svg {...base} className={p.className} fill={p.fill ?? 'none'}><path d="M11.5 2.3a.5.5 0 0 1 .9 0l2.6 5.3 5.8.8a.5.5 0 0 1 .3.9l-4.2 4.1 1 5.8a.5.5 0 0 1-.7.5L12 17l-5.2 2.7a.5.5 0 0 1-.7-.5l1-5.8L2.9 9.3a.5.5 0 0 1 .3-.9l5.8-.8 2.5-5.3Z"/></svg>
);
export const ArrowUp = (p) => (
  <svg {...base} className={p.className}><path d="M12 19V5M5 12l7-7 7 7"/></svg>
);
export const ArrowDown = (p) => (
  <svg {...base} className={p.className}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
);
export const ArrowLeft = (p) => (
  <svg {...base} className={p.className}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
);
export const Minus = (p) => (
  <svg {...base} className={p.className}><path d="M5 12h14"/></svg>
);
export const FlaskConical = (p) => (
  <svg {...base} className={p.className}><path d="M10 2v7.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V2"/><path d="M8.5 2h7M7 16h10"/></svg>
);
export const RotateCcw = (p) => (
  <svg {...base} className={p.className}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
);
export const Lock = (p) => (
  <svg {...base} className={p.className}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
export const Plus = (p) => (
  <svg {...base} className={p.className}><path d="M5 12h14M12 5v14"/></svg>
);
export const Users = (p) => (
  <svg {...base} className={p.className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
export const AlertTriangle = (p) => (
  <svg {...base} className={p.className}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>
);
