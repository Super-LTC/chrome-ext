// demo/tour/PhoneMock.jsx
// A CSS iPhone-style frame that slides up from the bottom-right during the
// physician-query chapter of the guided tour. It illustrates what the doctor
// receives — an SMS query — and how they respond, all without leaving the demo.
//
// Props:
//   state       — 'incoming' | 'typing' | 'signed'
//   doctorName  — chosen practitioner (defaults to 'Dr. Patel')
//   message     — optional override for the SuperLTC bubble text
//   confirmText — optional override for the doctor's signed-confirmation bubble
//
// Rendered by the tour engine (tour-runner.jsx) into #super-tour-phone when a
// step declares a `phone` field. Styles live under `.super-tour-phone` in
// tour.css.

const DEFAULT_DOCTOR = 'Dr. Patel';

export const PhoneMock = ({ state = 'incoming', doctorName = DEFAULT_DOCTOR, message, confirmText }) => {
  const name = doctorName || DEFAULT_DOCTOR;
  const incomingText = message
    || `${name}, you have a diagnosis query for Jane Doe (malnutrition). Tap to review →`;

  return (
    <div className="super-tour-phone" data-state={state}>
      <div className="super-tour-phone-frame">
        {/* Status bar */}
        <div className="super-tour-phone-statusbar">
          <span className="super-tour-phone-time">9:41</span>
          <span className="super-tour-phone-status-icons">
            <span className="stp-bars" aria-hidden="true" />
            <span className="stp-wifi" aria-hidden="true" />
            <span className="stp-batt" aria-hidden="true" />
          </span>
        </div>
        <div className="super-tour-phone-notch" aria-hidden="true" />

        {/* Conversation header */}
        <div className="super-tour-phone-convo-head">
          <div className="super-tour-phone-avatar">S</div>
          <div className="super-tour-phone-convo-meta">
            <div className="super-tour-phone-convo-name">SuperLTC</div>
            <div className="super-tour-phone-convo-sub">Text Message</div>
          </div>
        </div>

        {/* Messages */}
        <div className="super-tour-phone-messages">
          <div className="super-tour-phone-bubble super-tour-phone-bubble--in">
            {incomingText}
          </div>

          {state === 'typing' && (
            <div className="super-tour-phone-bubble super-tour-phone-bubble--typing">
              <span className="stp-dot" />
              <span className="stp-dot" />
              <span className="stp-dot" />
            </div>
          )}

          {state === 'signed' && (
            <>
              <div className="super-tour-phone-bubble super-tour-phone-bubble--out">
                {confirmText || '✓ Confirmed — malnutrition active'}
              </div>
              <div className="super-tour-phone-stamp">
                <span className="stp-check" aria-hidden="true">✓</span> Signed
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
