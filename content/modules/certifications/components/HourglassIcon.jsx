/**
 * Hourglass — the scheduled-send mark.
 *
 * One glyph, two states, because the nurse needs to tell "can be scheduled"
 * from "is scheduled" at a glance without reading anything: ghost/outline when
 * nothing is queued, filled amber when a send is waiting to go out.
 */
export function HourglassIcon({ size = 13, filled = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 2h7M4.5 14h7" />
      <path d="M5.5 2v2.2c0 1 .7 1.9 1.6 2.4l.9.5-.9.5c-.9.5-1.6 1.4-1.6 2.4V14" />
      <path d="M10.5 2v2.2c0 1-.7 1.9-1.6 2.4L8 7.1l.9.5c.9.5 1.6 1.4 1.6 2.4V14" />
      {/* The sand: only drawn when something is actually queued. */}
      {filled && <path d="M6.6 11.6h2.8" stroke-width="2.2" />}
    </svg>
  );
}
