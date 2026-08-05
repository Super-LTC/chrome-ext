/**
 * Demo stand-in for content/modules/qm-board/components/qip/QipDestination.jsx
 * (aliased in vite.demo.config.js).
 *
 * The real QIP destination is rollup → building → measure, all driven by
 * /api/extension/qm/qip* endpoints the demo does not mock yet. Until the demo
 * grows QIP fixtures, the tab shows a deliberate "coming soon" card instead of
 * an error state — the tab still exists so prospects see the surface is there.
 *
 * demo-qm-overrides.css relabels the top-bar tab itself to "QIP/QIPP".
 */
export function QipDestination() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '72px 24px',
        gap: '10px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: '#4f46e5',
          background: '#eef2ff',
          border: '1px solid #c7d2fe',
          borderRadius: '999px',
          padding: '4px 12px',
        }}
      >
        Coming soon
      </div>
      <h2 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
        QIP/QIPP
      </h2>
      <p style={{ margin: 0, maxWidth: '440px', fontSize: '14px', lineHeight: 1.55, color: '#64748b' }}>
        State quality-incentive program tracking — rollup across your buildings,
        per-building scorecards, and measure drill-ins — is on its way to this demo.
      </p>
    </div>
  );
}
