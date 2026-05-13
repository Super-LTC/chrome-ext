// Rounding Reports tab — list / detail / QR popover.
// Mounted inside MDS Command Center as a peer tab to Compliance.
//
// Sub-view state lives here (no router). After "Start round" we jump straight
// to the detail screen and auto-open the QR popover, matching the web flow.

import { useEffect, useState } from 'preact/hooks';
import { SessionList } from './components/SessionList.jsx';
import { SessionDetail } from './components/SessionDetail.jsx';
import { QRPopover } from './components/QRPopover.jsx';
import { useRoundingReports } from './hooks/useRoundingReports.js';
import { useRoundingSession } from './hooks/useRoundingSession.js';

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, 3000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div class={`rr-toast rr-toast--${toast.type || 'info'}`}>{toast.message}</div>
  );
}

export function RoundingReports({ facilityName, orgSlug }) {
  const [view, setView] = useState({ kind: 'list' });
  const [qrOpen, setQrOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const list = useRoundingReports({ facilityName, orgSlug, enabled: view.kind === 'list' });

  const sessionId = view.kind === 'detail' ? view.sessionId : null;
  const session = useRoundingSession({
    sessionId,
    facilityName,
    orgSlug,
  });

  // Auto-open QR when we land on detail from a fresh "Start round".
  useEffect(() => {
    if (view.kind === 'detail' && view.autoQr) {
      setQrOpen(true);
    }
  }, [view]);

  async function handleStart() {
    const id = await list.start();
    if (!id) throw new Error('Server did not return a session id');
    setView({ kind: 'detail', sessionId: id, autoQr: true });
  }

  function handleOpen(id) {
    setView({ kind: 'detail', sessionId: id, autoQr: false });
  }

  function handleBack() {
    setView({ kind: 'list' });
    setQrOpen(false);
    list.refresh();
  }

  async function handleDelete(id) {
    try {
      await list.remove(id);
      setToast({ type: 'success', message: 'Session deleted' });
    } catch (err) {
      console.error('[RoundingReports] delete failed:', err);
      setToast({ type: 'error', message: 'Failed to delete session' });
    }
  }

  return (
    <div class="rr-root">
      {view.kind === 'list' && (
        <SessionList
          sessions={list.sessions}
          loading={list.loading}
          error={list.error}
          moduleDisabled={list.moduleDisabled}
          onOpen={handleOpen}
          onStart={handleStart}
          onDelete={handleDelete}
          onToast={setToast}
          facilityName={facilityName}
          orgSlug={orgSlug}
        />
      )}

      {view.kind === 'detail' && (
        <SessionDetail
          detail={session.detail}
          loading={session.loading}
          error={session.error}
          onBack={handleBack}
          onShowQR={() => setQrOpen(true)}
          onToast={setToast}
        />
      )}

      {qrOpen && sessionId && (
        <QRPopover
          mintQr={session.mintQr}
          onClose={() => setQrOpen(false)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
