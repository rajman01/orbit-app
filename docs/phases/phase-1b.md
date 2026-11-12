# Phase 1B — Do the work, stop drifting

| | |
|---|---|
| **Status** | ✅ Built — 2026-11-12 (not yet deployed) |
| **Depends on** | 1A |
| **PRD** | §7.7, §7.8, §8.1, §8.2 |
| **Design** | [DESIGN.md](../DESIGN.md) §8 (gestures), §11.2, §11.15, §13 |

## Goal

Make starting easy and drifting visible. Today becomes the home screen: three Must-dos, a prioritised list, overdue items that demand a decision, and a one-tap Start into focus mode. Postponing anything asks why.

**Exit criterion:** for one week, every day is run from Today; every postponed task has a recorded reason; at least one stale task has been resolved through the stale-task prompt.

## Scope

| PRD ID | Feature |
|---|---|
| TODAY-1 – TODAY-6 | Today: Must-dos (hard cap 3), "Also today", overdue section, daily capacity warning, drag to reorder, Start button |
| TASK-4 | Prompt for a 2-minute next step when a task with effort ≥ 3 is planned for today |
| §8.1 | No silent skipping · stale-task intervention (postponed ≥ 3× or untouched ≥ 14 days) · goals without a next step surfaced · overdue requires action |
| §8.2 | Skip flow: reason (one tap) + suggested follow-up per reason; every skip recorded |
| FOC-1 – FOC-6 | Focus mode: full-screen task, Pomodoro / fixed / open timer, "just 5 minutes" start, session log, end-of-session outcome, survives reload and offline |
| — | Upcoming view (next 14 days) |
| — | Mobile swipe gestures: right = complete, left = reschedule (opens the skip flow) |

**Not in 1B:** ritual-driven planning (1C) · XP for completions (1D) · AI breakdown of stuck tasks (Phase 2).

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `tasks` (extend) | mustDoDate, postponeCount | Built: `mustDoDate` alone marks a Must-do (per day). Stale "untouched" uses `updatedAt`, so `staleSince` / `lastTouchedAt` weren't needed. Both fields are optional so older clients stay valid |
| `taskEvents` | type `skip` with reason / reasonText / from / to | Already created in 1A |
| `focusSessions` | taskId, mode, plannedMinutes, startedAt, endedAt, actualMinutes, outcome, interruptions | Timer state also kept in local storage so it survives reloads |
| `settings` (extend) | focusMinutes, breakMinutes | Pomodoro lengths (FOC-2 "configurable"), default 25 / 5 |

**Decisions**

1. **Stale detection runs on the client** (on load and when Today renders) — works offline, no background job needed yet. A server job comes with notifications in 1D.
2. **"Today" is the user's local date** from `settings.timezone`, never UTC.
3. **Must-dos are per day.** A Must-do left unfinished doesn't stay a Must-do tomorrow without a decision.

## Screens and components

| Screen / component | Notes |
|---|---|
| Today | Order: Must-dos → Also today → Habits due (placeholder until 1D) → Overdue; capacity bar |
| Skip flow sheet | Reasons as large buttons; follow-up actions per reason (break down, set next step, pick date, 5-minute start, cancel) |
| Stale banner/row | Pinned, amber, with the five resolution actions |
| Focus mode | DESIGN §11.15: materialise in, timer ring, next step, subtasks, scratchpad, end-of-session prompt |
| Swipe row | Pointer-events tracking, momentum projection, rubber-band, haptic on commit (Android) |
| Upcoming | 14-day list grouped by day |

## Implementation steps

- [x] Today data queries (local date, Must-dos, overdue, capacity)
- [x] Today screen + reorder + Must-do cap
- [x] Next-step prompt
- [x] Skip flow + `taskEvents` recording + `postponeCount`
- [x] Stale detection + resolution actions; "goal needs a next step" surfacing
- [x] Focus mode + `focusSessions` + timer persistence + notification at end (in-app; push in 1D)
- [x] Swipe gestures on mobile rows
- [x] Upcoming view
- [x] Tests
- [ ] Deploy and run a week from Today (exit criterion)

## Tests

- **Unit:** local-date boundaries (timezone, DST), stale rules, capacity maths, skip → postponeCount, timer persistence.
- **E2E:** plan 3 Must-dos and try a 4th (forced swap); postpone a task → reason required → recorded; postpone 3× → stale prompt; start focus → reload mid-session → timer continues; offline focus session syncs.

## What shipped

| Area | Delivered | Where |
|---|---|---|
| Today | Stale tasks pinned under "Needs a decision" with the five ways out; Must-dos (cap 3, swap dialog for a 4th); Also today; goals without a next step (add one inline); Overdue with **Today** / **Move** per task; Done today; capacity bar with unestimated count and over-capacity warning | `src/app/(app)/today/`, `src/features/today/model.ts` |
| Reorder | Drag by the handle on desktop, long-press on phones, arrow keys from the handle; a drop writes only the moved task's `order` | `today/sortable-tasks.tsx` |
| Next step (TASK-4) | "Add a 2-minute next step" link on big tasks (effort ≥ 3) in Today; prompt when one becomes a Must-do | `today/today-dialogs.tsx` |
| Skip flow (§8.2) | Reason first (required at Firm), then per-reason follow-ups: smaller steps (too big), next step (unclear), 5-minute start (avoiding / low energy), follow-up date (waiting), cancel (not important), text (other); then a new date. Opened by swipe left, **Move**, the `S` key, or moving a planned task's date in the task panel | `src/components/skip/skip-flow.tsx` |
| Stale (§8.1) | Postponed 3×, or on the plan and untouched 14 days (a dated task counts from its day; an undated one while in progress); break it down, 5 minutes now, reschedule with an explicit commitment, ask for help (saved to notes), drop (with Undo); resolving resets the count | `today/today-dialogs.tsx` |
| Focus mode (FOC-1–6) | Start from Today, the task panel or `F`; opens on a 5-minute first session; 5 / 25 / 50 min / open; pause, +5 min, done, end; "Keep going?" and Pomodoro breaks; outcome on end (done / progress + next step / stuck + smaller steps); minimise to a pill; timer in the tab title; survives reload and offline; vibration and (if already allowed) a system notification when time's up | `src/components/focus/focus-mode.tsx`, `src/features/focus/model.ts` |
| Swipe | Right = complete (or undo), left = reschedule into the skip flow; touch only, 1:1 tracking, momentum projection, rubber-band, velocity handed to the settle spring, haptic on commit | `src/components/tasks/swipe-row.tsx` |
| Upcoming | Next 14 days grouped by day, with points per day; `G U`, sidebar and More | `src/app/(app)/upcoming/` |
| Settings | Focus session and break length | Settings → Planning |

## Changes from the plan

| Planned | Actual | Why |
|---|---|---|
| "Habits due" placeholder on Today | Left out | An empty section is noise; habits arrive in 1D |
| Waiting → status `blocked` with follow-up date | Waiting → follow-up date | No `blocked` status yet; adding one touches every status UI. Revisit with cycles (1C) |
| Notification at end of focus | In-app prompt + vibration; system notification only if permission was already granted | Asking for permission belongs with push reminders (1D) |
| `staleSince`, `lastTouchedAt`, `isMustDo` fields | Not added | Derived from `updatedAt` and `mustDoDate` |

## Known gaps

- ~~Long-press reorder and swipe gestures haven't been tried on a real phone.~~ Checked by the owner on a real phone on 2026-11-12: swipe and long-press reorder both work.
- In-progress tasks with no date show on Today; once dated they follow their date.
- Swiping and long-press reorder share the same row; a long-press followed by a sideways drag can start both.
- Found by the week simulation, waiting for a decision (behaviour unchanged):
  - A recurring task on a fixed schedule that is completed late gets a next task dated straight after the old one, so it can already be overdue (daily task done 2 days late → next one is 1 day late). Catch up one by one, or jump to the next date from today?
  - "No date" in the skip flow on a task whose due date is today or earlier clears only the planned day: the task stays on Today (or Overdue), the toast says "Moved off your plan", and it counts as a postponement.
  - The 14-day "untouched" rule looks at edits to the task only. Focus sessions and subtask changes don't count as touching it.
  - A timed focus session keeps counting work time after "Time's up" until someone answers, so one left overnight logs the whole night (now capped at 24 hours).
  - A recurring task set to "after completion" that is completed, un-completed, and completed again on a later day gets two next tasks.
- A device whose clock is 14 or more days ahead of the server shows undated in-progress tasks as stale after a sync (synced copies carry server time). Dated tasks are not affected.
- Day changes are covered for a full week at the logic level (`tests/unit/week.test.ts`); the browser tests cover two day changes (`tests/e2e/week.spec.ts`). They move only the browser's date: fast-forwarding Playwright's whole clock leaves desktop dialogs stuck mid-close (a test-only effect of the animation clock jumping), and the roll-over test waits up to a minute for the app's own tick.

## Build log

| Date | What |
|---|---|
| 2026-11-12 | Data model: `mustDoDate`, `postponeCount`, `focusSessions`, focus settings; Dexie v3; older clients' task creates still accepted |
| 2026-11-12 | Today rebuilt; skip flow; stale resolution; next-step prompt; goals without a next step; focus mode; swipe rows; Upcoming |
| 2026-11-12 | Fixed during testing: an in-progress task moved to tomorrow still showed on Today |
| 2026-11-12 | Tests: 20 new unit tests (sections, stale rules, skip rules, timezone, timer maths, sync of the new fields) and 4 browser tests (Must-do cap, skip → stale, focus reload, offline focus) |
| 2026-11-12 | Visual pass (on request): Today header as a small solar system (tasks are moons, next task with Start), illustrated empty states (Today, Inbox, Upcoming, Goals, Areas), completion burst on checkboxes, stars and a moon on the focus timer, logo moon orbits on sync. All still when reduced motion is on |
| 2026-11-12 | Visual pass, part 2: shooting star and burst when the last Must-do is done; goal pages show the goal as a planet that grows with progress, with milestones as moons; pages rise in on navigation; the sidebar highlight glides between items |
| 2026-11-12 | Test: the offline goal test on phone size failed in 2 full runs (offline navigation took over 5s); its wait is now 15s and 3 full runs pass. Worth watching |
| 2026-11-12 | Landing page: sections slide in on scroll (`Reveal`); every illustration now plays a small looping story (`il-*` animations in `globals.css`), the hero mock-up ticks a Must-do on a loop, and the hero planets drift around it |
| 2026-11-12 | Landing page: always-dark starry hero with shooting stars (nav goes dark while over it), hero mock-up rebuilt as the real Today screen, new "The product" section with a live focus timer and a goal planet that grows |
| 2026-11-12 | Week simulation: `tests/unit/week.test.ts` runs the real actions against a local database with a controlled clock, Monday to Sunday (Must-dos, skips, overdue, stale and its five ways out, recurring tasks, timezones either side of UTC, capacity, focus across midnight, the 14-day rule, a device clock ahead of the server); `tests/e2e/week.spec.ts` crosses midnight in the browser. 21 unit tests and 2 browser tests; shared browser helpers moved to `tests/e2e/helpers.ts` |
| 2026-11-12 | Fixed (simulation): completing a recurring Must-do put tomorrow's copy in today's Must-dos, and the next task inherited the postpone count (after a task was moved 3×, every next one started out stale). The next task now starts clean |
| 2026-11-12 | Fixed (simulation): a task planned 14 or more days ahead showed as stale ("Untouched for 14 days") on the day it came up instead of in Also today. A dated task now counts 14 days from its day |
| 2026-11-12 | Fixed (simulation): a focus session left running for more than 24 hours could not be saved to the server (its length was rejected, so other devices saw it as never ended). Logged length is capped at 24 hours |
| 2026-11-12 | Fixed (simulation): after a laptop slept or a phone had the app in the background past midnight, Today could show yesterday for up to a minute, and tasks added then were planned for yesterday. The date is now checked as soon as the app is back in view |
