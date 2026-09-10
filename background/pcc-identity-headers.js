/**
 * Which PointClickCare account is driving this request?
 *
 * The backend refuses extension traffic from PCC survey logins (see
 * core/utils/surveyor-login.ts in superltc). It can only do that if we tell it
 * who is logged into PCC, so every API call carries the live PCC username.
 *
 * Pure and separated from the service worker so the staleness rule below can
 * be tested without a browser.
 *
 * ## Backwards / forwards compatible on purpose
 *
 * The header is purely additive. An older backend ignores an unknown header,
 * and a newer backend treats a missing header as "no opinion" and allows the
 * request. So either side can be rolled back independently without darkening
 * anyone — reverting the extension disables the check, reverting the backend
 * makes the header inert.
 */

/** Live PCC login. Absent means "we don't know", never "allow" or "deny". */
export const PCC_USERNAME_HEADER = 'X-PCC-Username';

/**
 * Set when we hold a binding but cannot prove it describes the PCC session on
 * screen. The backend does NOT refuse on this — it exists so the window is
 * measurable instead of invisible. See the staleness note below.
 */
export const PCC_PENDING_HEADER = 'X-PCC-Identity-Pending';

/**
 * Build the identity headers from the two cached records.
 *
 * @param identity `superPccIdentity` — {pccUsername, esolUserId, ...}, refreshed
 *   weekly or when the PCC account changes. Costs a profile fetch to produce.
 * @param current  `superPccCurrent` — {esolUserId}, rewritten from the DOM on
 *   every page boot. Free.
 *
 * ## Why the two are compared
 *
 * `chrome.storage.local` is per browser profile, so the cached username belongs
 * to whoever logged into PCC last — not necessarily whoever is logged in now.
 * If a surveyor signs into PCC on a nurse's workstation, the cached binding
 * still says the nurse until the weekly re-capture notices. Sending that name
 * would label the surveyor's session as the nurse's, which is precisely the
 * misattribution the block exists to catch. So a mismatch sends no username at
 * all: "unknown" is a safe answer, "the wrong person" is not.
 *
 * ## The window this leaves
 *
 * On the first page load after an account switch the records disagree, so no
 * username goes out and the block cannot fire. `shouldCapture` sees the changed
 * `esolUserId` on that same boot and re-captures, so the window is one page
 * load — and building-level survey mode covers it, which is why that, not this,
 * is the primary control. The pending header makes the window countable.
 */
export function pccIdentityHeaders(identity, current) {
  const username = identity?.pccUsername;
  if (!username) return {};

  // No DOM reading happened (chrome-less PCC iframe, or the capture module
  // never ran). We cannot judge freshness, so we say nothing.
  if (!current?.esolUserId) return {};

  if (identity.esolUserId !== current.esolUserId) {
    return { [PCC_PENDING_HEADER]: '1' };
  }

  return { [PCC_USERNAME_HEADER]: username };
}
