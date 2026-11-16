# Landing page — next round

| | |
|---|---|
| **Status** | ✅ Built 2026-11-16 (items 3–7) |
| **Depends on** | Phase 1 complete, so the screens and flows shown on the page stop changing |
| **Design** | [DESIGN.md](../DESIGN.md) §7 (motion), §8 (gestures) |

## Goal

Make the landing page memorable and make it sell the product by showing it, not describing it. This is a side track, not a product phase: it doesn't block any phase and can be done in pieces.

## Already shipped (2026-11-12, commit `1dab607`)

- Always-dark, starry hero with shooting stars and drifting planets; the nav goes dark while over it
- Hero mock-up rebuilt as the real Today screen
- "The product" section: live focus timer and a goal planet that grows
- Sections slide in on scroll; every illustration plays a looping story

## Scope

| # | Item | What it is | Size |
|---|---|---|---|
| 3 | **Scroll story for "How it works"** | Replace the four step cards with a pinned phone frame whose screen changes as you scroll through Capture → Plan → Do → Review. The copy for each step scrolls past beside it | Large |
| 4 | **Something to play with** | A working mini Today on the page: tick a task, swipe one away and get asked "why?", start the 5-minute timer. Nothing is saved | Large |
| 5 | **Varied feature layout** | Replace the six equal cards with two large cards (accountability, starting) and four small ones, so the page has rhythm and shows what matters most | Small |
| 7 | **Content refresh** (added 2026-11-16) | The page was written after Phase 1: add the coach acting and listening, calendar sync, insights, skills and courses, and the job assistant | Medium |
| 6 | **A personal line** | A short "built by someone who procrastinates, for people who do" note, in the owner's own words | Small |

Order when the time comes: 5 and 6 first (small, no dependencies), then 3, then 4.

## Why wait

- **3 and 4 copy real flows.** The scroll story shows the inbox, cycle planning, Today and the review; cycles and rituals arrive in 1C, and levels in 1D. Building it now means rebuilding it twice.
- **4 should reuse real components.** The skip flow, swipe row and focus timer are only days old. Once they've had real use, the demo can import them instead of copying them.
- **5 and 6 could be done any time.** They're grouped here so the page is reworked in one pass.

## Notes for each item

**3. Scroll story**
- Pin with `position: sticky`; drive the screen change from scroll position (one `IntersectionObserver` per step, or CSS scroll-driven animations where supported).
- Cross-fade between screens; never tie content to scroll speed in a way that can make someone feel sick. With reduced motion on, show the four screens stacked, with no pinning.
- On phones, the frame pins at the top and the step text scrolls beneath it.
- The screens should be the real components fed with sample data, so they can't drift from the app.

**4. Interactive demo**
- Runs on sample data held in memory. No account, no network, nothing stored.
- Reuse `SwipeRow`, the skip flow and the focus timer logic (`src/features/focus/model.ts`). They currently depend on the sync engine and signed-in user, so they need a thin "demo" data source first.
- Keep it small: three tasks, one of them stale. The aim is one moment of "oh, it asks me why".
- Must work with keyboard and screen reader, not only touch.

**5. Feature layout**
- Two large cards and four small on desktop; a single column on phones.
- The large cards can hold a bigger version of their illustration or a small live piece (the skip sheet, the 5-minute timer).

**6. Personal line**
- Needs the owner's words. Draft options to choose from, then place it near the final call to action.

## Open questions

- Should the interactive demo replace the hero mock-up, or sit in its own section lower down?
- ~~Does the page need real screenshots as well (for sharing and link previews)?~~ Link previews done 2026-11-16 with a generated image (see the build log); the drawn screens stay for now.
- When Orbit opens to other people (Phase 4), the page will also need pricing, privacy and terms links. Fold that in then.

## Tests

- Landing e2e: no sideways scrolling at phone width, all sections visible after scrolling, call to action works.
- Scroll story: each step's screen appears as its text scrolls in; reduced-motion layout shows all four.
- Demo: tick, skip with a reason and start a timer, by mouse, touch and keyboard.

## Build log

| Date | What |
|---|---|
| 2026-11-16 | Items 3–7 built (owner: "start the landing page"):<br>• **Features (5, 7):** two large cards, "Built for starting" and "A coach that acts" (typed or spoken; plans, books time, reminders, undo), each with three points; then four small ones: goals in two-week cycles, calendar both ways (new illustration), people, and "See why you stall" (insights; new illustration). **Change from the plan:** the second large card is the coach, not accountability, because the accountability spotlight section straight after already covers skipping in depth.<br>• **Career section (7):** "Grow on purpose": skills, courses planned to a date, and the job assistant (roles ranked by fit with reasons, a tailored CV and letter you check and send), beside a mock-up of a found role and a course on pace.<br>• **Try it (4):** a working Today in its own section after the accountability spotlight (owner answer): three sample must-dos (one put off three times), the app's own checkbox, swipe row (touch) and skip reasons; "Not today" asks why, and each reason answers as in the app (a first step, moved to Thursday, or five minutes); a five-minute timer with pause and Done; XP with the bonus for a task you'd put off; Start over. Held in memory, nothing saved or sent; keyboard and screen reader friendly. **Change:** the tasks aren't the real `TaskRow`, which needs the sync engine; the shared pieces are.<br>• **How it works (3):** a phone frame pinned beside the steps on wide screens; the screen cross-fades to the step crossing the middle of the window (Capture with a brain dump being sorted, Plan the cycle with capacity, Today with must-dos and a focus timer, the cycle Review with reasons and XP), and the step being read is highlighted. On phones, and with reduced motion, each step shows its own screen, stacked. **Changes:** phones stack rather than pin (a pinned 600px phone leaves no room to read); the screens are faithful copies, not the real components, for the same sync reason.<br>• **Personal line (6):** the owner's chosen words, as a quote under the final call to action, signed "The maker of Orbit".<br>• **Tests:** 2 new browser tests (`landing.spec.ts`: the playable Today — tick, put off with "Too big", start the timer, finish with the bonus XP, move one with "No time", start over; how it works has its four steps, the screen follows the step on desktop, and the personal line is there), plus the existing no-sideways-scrolling check.<br>• **Full suite:** 254 unit; 143 browser passed, 32 skipped, 1 failed — the offline test's "second device" check, which also failed on the previous full run: on a full run the shared test account is large, so a fresh device's first download took longer than the 5-second wait. It now waits up to 20 seconds, and passes. |
| 2026-11-16 | Link previews (owner request): a generated preview image (`src/app/opengraph-image.tsx`, 1200×630) for every Orbit link: the night-sky hero, "Stop planning to start. Start.", the one-line pitch and a Today card, in Geist (OFL; the three weights and the licence live in `assets/fonts/`, read once at build, so the headline is bold). **Fix after the first deploy:** reading the fonts from `node_modules` made the image dynamic and it failed on Vercel (500); it now reads from `assets/fonts/` at module scope as Next's docs recommend, is built once at deploy (static), and `next.config.ts` lists the fonts in `outputFileTracingIncludes` as a safeguard. Root layout sets the site address (`metadataBase`, from `BETTER_AUTH_URL`), Open Graph type and site name, and a large X card; the landing page sets its own title and description for previews. X uses the same image. Test: `landing.spec.ts` checks the tags and that the image is a PNG. Full suite: run together with the guide below. |
| 2026-11-16 | The guide (owner request: "a page that extensively explains how to use the app, easy to understand"): a public page at `/guide`, linked from the landing page's nav, footer and the end of "How it works", from Settings ("How to use Orbit") and from the command palette. 23 numbered sections in plain language: the idea (vision → areas → goals → quarter → cycle → today), a first-week checklist, the rhythm with the default times, then each part of the app (capture and quick-add shorthand, goals, tasks, Today, focus, accountability and the skip reasons, cycles, quarters and the Wheel of Life, habits and routines, the coach with things to ask and how to stay in control, calendar, people, career, journal, insights and XP, notifications, phone and offline, keyboard shortcuts, settings, questions). Steps, "Get the most out of it" tips and tables; a contents list that follows you on wide screens and folds away on phones. Written from the code, not the PRD, where they differ (for example the real shortcut list, Settings paths, and that installing uses the browser's own option). Precached for offline. Test: `landing.spec.ts` follows the link, counts the sections, jumps via the contents (both sizes) and checks for sideways scrolling. Full suite (with link previews): 254 unit; 148 browser passed, 32 skipped, 0 failed (the offline test passes with its longer first-sync wait). |
