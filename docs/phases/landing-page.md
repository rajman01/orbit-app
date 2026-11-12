# Landing page — next round

| | |
|---|---|
| **Status** | Planned — starts after the app's own flows have settled (after Phase 1D) |
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
- Does the page need real screenshots as well (for sharing and link previews), or are the live components enough?
- When Orbit opens to other people (Phase 4), the page will also need pricing, privacy and terms links. Fold that in then.

## Tests

- Landing e2e: no sideways scrolling at phone width, all sections visible after scrolling, call to action works.
- Scroll story: each step's screen appears as its text scrolls in; reduced-motion layout shows all four.
- Demo: tick, skip with a reason and start a timer, by mouse, touch and keyboard.

## Build log

| Date | What |
|---|---|
| | |
