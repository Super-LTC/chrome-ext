/**
 * ManualBadge — marks a cert stay the nurse manages by hand. Sits next to
 * StayTypeBadge in the stay card header.
 */
export function ManualBadge() {
  return (
    <span
      class="cert__stay-type-badge cert__manual-badge"
      title="You manage this stay. The system won't start or end it from PCC."
    >
      Manual
    </span>
  );
}
