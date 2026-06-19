# Guided Demo Tour — Design

**Date:** 2026-06-19
**Goal:** A self-serve, click-through guided product tour layered on the existing demo. A prospect opens a hosted link and is walked through Super's value — told where to click, with narration — across the multi-page demo, ending on a value summary + CTA.

## Decisions (locked)

- **Audience / delivery:** self-serve prospects via a hosted link (Netlify, via `demo:deploy`). Must be foolproof and polished. No salesperson present.
- **Guidance style:** interactive — the prospect performs the meaningful clicks (badges, query send); the tour auto-handles tedious transitions (page changes, opening FAB overlays, scrolling).
- **Build approach:** a proven spotlight library (**driver.js**) for the spotlight/tooltip visuals, wrapped in our own Preact **step-runner** that handles app-specific logic (cross-page resume, auto-opening overlays, waiting for specific clicks/events).
- **Scope:** comprehensive — ICD-10 coding, Section I, physician query (+ phone mockup), MDS Command Center, QM Board / 24hr / Care Plan. Section N is out of v1 (not yet 1:1).

## Architecture

A new layer, not a new app. A `GuidedTour` Preact component mounts alongside the demo and is driven by a declarative **tour script** (ordered steps).

**Step shape (declarative):**
```
{
  id, chapter,                 // grouping for chapter title cards + progress
  page,                        // which captured page this step lives on
  selector,                    // element to spotlight (or null for centered card)
  title, body,                 // narration (Super avatar "speaks" it)
  placement,                   // tooltip side
  before,                      // optional action the runner runs first (open overlay, scroll, navigate)
  advance: 'next' | 'click' | 'event',  // next-button | wait for real click on target | wait for app event
  event,                       // event name when advance === 'event' (e.g. 'query-sent')
  hud,                         // optional value-HUD update (+1 NTA point, +$X/day)
}
```

**Cross-page persistence/resume.** The demo spans separate captured documents (`medical-diagnosis.html`, `mds-section-i.html`, …). Progress (current step index + value-HUD state) lives in `sessionStorage` (`superTour`). On every page load the tour boots, reads the saved index, and resumes. When a step's `page` differs from the current page, the runner persists state and navigates (`location.href`); the new page resumes at that step. driver.js is re-instantiated per page.

**Interaction model.**
- `advance: 'click'` — spotlight the target and attach a one-time listener; the prospect's real click advances the tour (the "aha" moments).
- `advance: 'auto'/'next'` — the runner opens the overlay / scrolls / shows a Next button.
- `advance: 'event'` — wait for an app event (e.g. query sent, popover Agree) dispatched on `window`.
- The runner can call existing demo hooks (badge click events, `window.QuerySendModal`, FAB openers in `PCCDemoApp`/`DemoApp`) to drive transitions.

## Look & feel

- Branded driver.js theme: Super indigo gradient tooltips, rounded, soft shadow, **Super "S" narrator avatar** in each tooltip.
- Motion: spotlight glides between targets; target shows a **pulse ring**; steps fade in.
- **Chapter title cards**: brief full-screen interstitials between chapters.
- **Value-found HUD**: corner counter that ticks up across the tour (+NTA points, +$/day) and lands on a total on the end card.
- **Phone mockup**: realistic CSS iPhone frame slides up showing the doctor's incoming SMS for the query → typing indicator → doctor taps Confirm → "✓ Signed"; back in-app the badge resolves. Caption explains text + email delivery.
- Progress: slim top bar + "Chapter N of 6" with dots; persistent **Skip / Restart / Exit**.
- End card: value tally + CTA.

## Storyline (chapters)

0. **Hook / start screen** — "Jane Doe's MDS is signed and ready to submit. Watch Super double-check it — 2 minutes." Start / Explore-on-your-own.
1. **ICD-10 coding** (`medical-diagnosis.html`) — care-plan coverage shields (🟢/🟡/🔴) + query-status chips on the diagnosis table; open the **ICD-10 Viewer** → AI-suggested codes → evidence → PDPM estimate → push to PCC.
2. **Section I detection** (`mds-section-i.html`) — explain the badge legend; spotlight the red **Anemia** badge → click → evidence popover (Hgb 9.8, ferrous sulfate) → **Agree** → badge resolves. HUD +1 NTA point.
3. **Physician query + phone** — spotlight a yellow badge (**UTI**) → popover → Query Physician → pick doctor → Send → **phone mockup** SMS → doctor Confirms → "Query signed" toast + badge resolves.
4. **Command Center (PDPM/HIPPS)** — auto-open FAB → MDS Command Center → spotlight HIPPS/dollar impact. HUD lands the $/day figure.
5. **Facility view** — short stops: QM Board (Five-Star), 24-hour Report, Care Plan auto-pop/audit.
6. **Wrap** — summary card with running value tally + CTA.

## Entry & coexistence

- Start screen offers "Take the guided tour" vs "Explore on your own"; hosted link auto-starts the tour (e.g. `?tour=1`).
- Tour never blocks free exploration; Exit returns to normal demo. Restart re-seeds `sessionStorage`.

## Files (anticipated)

- `demo/tour/tour-runner.jsx` — the Preact `GuidedTour` step-runner (driver.js wrapper, resume, interaction model).
- `demo/tour/tour-script.js` — the declarative chapter/step data.
- `demo/tour/PhoneMock.jsx` — the SMS phone mockup component.
- `demo/tour/value-hud.jsx` + chapter cards + start/end cards.
- `demo/tour/tour.css` — branded theme, motion, phone, HUD.
- Mount hook in `demo/pcc-demo-entry.jsx` and `demo/demo-entry.jsx` (boot the tour on each page, resume from storage).
- Add driver.js dependency.

## Out of scope (v1)

- Section N chapter (page not yet 1:1).
- Real analytics on tour progress (could add later).
- Authoring UI for steps (script is hand-authored).
