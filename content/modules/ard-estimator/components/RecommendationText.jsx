/**
 * RecommendationText — colored callout explaining why a day is recommended
 * or what would be lost by choosing a different day.
 */
export function RecommendationText({
  result,
  selectedDay,
  timeSensitiveItems,
  needsReviewItems
}) {
  if (!result || !selectedDay) return null;

  const isRec = selectedDay === result.recommendedDayNumber;
  const allSame = new Set(result.scores.map(s => s.estimatedPpd)).size === 1;
  const selectedScore = result.scores.find(s => s.dayNumber === selectedDay);
  const bestScore = result.scores.find(s => s.dayNumber === result.recommendedDayNumber);
  const allTimeItems = [...timeSensitiveItems, ...needsReviewItems];

  let text = '';

  if (allSame && allTimeItems.length === 0) {
    text = 'Any date works \u2014 no time-sensitive items found. All PDPM value comes from diagnoses captured regardless of ARD date.';
  } else if (allSame && needsReviewItems.length > 0 && timeSensitiveItems.length === 0) {
    const reviewNames = needsReviewItems.slice(0, 3).map(i => i.description).join(', ');
    text = `All dates produce the same score. ${needsReviewItems.length} possible item${needsReviewItems.length > 1 ? 's' : ''} (${reviewNames}) \u2014 confirm dates to refine.`;
  } else if (isRec) {
    const nextDay = selectedDay + 1;
    const wouldLose = allTimeItems.filter(
      i => i.capturedOnDays.includes(selectedDay) && !i.capturedOnDays.includes(nextDay)
    );
    if (wouldLose.length > 0) {
      const names = wouldLose.map(i => {
        const impacts = [];
        if (i.nursingInfo) impacts.push(i.nursingInfo.mainCategory + ' nursing');
        if (i.ntaPoints && i.ntaPoints > 0) impacts.push(`+${i.ntaPoints} NTA`);
        if (i.pdpmComponents.length > 0 && !i.nursingInfo && !i.ntaPoints) impacts.push(i.pdpmComponents.join('/'));
        return `${i.description}${impacts.length ? ` (${impacts.join(', ')})` : ''}`;
      }).join('; ');
      const loseLabel = selectedDay >= 8 ? 'A later ARD' : `Day ${nextDay}+`;
      text = `Recommended. ${loseLabel} would lose: ${names}.`;
    } else {
      text = 'Recommended. All time-sensitive items captured.';
    }
  } else {
    const ppdDelta = (selectedScore?.estimatedPpd ?? 0) - (bestScore?.estimatedPpd ?? 0);
    if (ppdDelta < -0.5) {
      const missed = allTimeItems.filter(
        i => i.capturedOnDays.includes(result.recommendedDayNumber) && !i.capturedOnDays.includes(selectedDay)
      );
      const missedNames = missed.map(i => i.description).join(', ');
      text = `$${Math.abs(ppdDelta).toFixed(0)}/day less than Day ${result.recommendedDayNumber}${missed.length > 0 ? `. Loses: ${missedNames}` : ''}.`;
    } else if (ppdDelta > 0.5) {
      text = `$${ppdDelta.toFixed(0)}/day more than Day ${result.recommendedDayNumber}. Consider this date.`;
    } else {
      text = `Same score as Day ${result.recommendedDayNumber}.`;
    }
  }

  let variant = 'neutral';
  if (isRec) variant = 'positive';
  else if (!allSame) variant = 'warning';

  // \u2500\u2500 IV-medications look-back narrative \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // O0110H1 IV Medications has a 7-day look-back ending on the ARD. When
  // hospital IV meds (vancomycin/IV fluids) bridge admission, ARD timing is
  // the single biggest NTA lever. Surface this story prominently so coders
  // see exactly which day window keeps O0110H1 capturable.
  const ivMedItem = (result.classifiedItems || []).find(
    i => i.mdsItem === 'O0110' && (i.mdsColumn === 'H1' || !i.mdsColumn)
  );
  const ivMedCaptured = ivMedItem?.capturedOnDays?.includes(selectedDay);
  const ivMedLastDay = ivMedItem
    ? Math.max(...(ivMedItem.capturedOnDays || [0]))
    : null;
  const showIvBanner = !!ivMedItem && ivMedLastDay != null;

  return (
    <>
      <div className={`ard-est__rec-text ard-est__rec-text--${variant}`}>
        <span className="ard-est__rec-text-bold">Day {selectedDay} {'\u2014'} </span>
        {text}
      </div>
      {showIvBanner && (
        <div
          className={`ard-est__rec-text ard-est__rec-text--${ivMedCaptured ? 'positive' : 'warning'}`}
          style={{ marginTop: 8 }}
        >
          <span className="ard-est__rec-text-bold">
            IV medications look-back {'\u2014'}{' '}
          </span>
          {ivMedCaptured ? (
            <>
              IV fluids (NS at 75 mL/hr) ran at the SNF Day 2{'\u2013'}Day 5
              for hydration support. ARD on Day {selectedDay} captures{' '}
              <strong>+{ivMedItem.ntaPoints} NTA</strong> via O0110H1b
              (post-admit, while a resident).
            </>
          ) : (
            <>
              ARD on Day {selectedDay} misses the SNF IV-fluids window.
              Move ARD to Day {ivMedItem.capturedOnDays?.[0] ?? 2}{'\u2013'}Day {ivMedLastDay}{' '}
              to capture <strong>+{ivMedItem.ntaPoints} NTA</strong> via
              O0110H1b (post-admit, while a resident).
            </>
          )}
        </div>
      )}
    </>
  );
}
