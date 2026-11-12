# Phase 1B — Do the work, stop drifting

| | |
|---|---|
| **Status** | Planned |
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
| `tasks` (extend) | isMustDo, mustDoDate, postponeCount, staleSince, lastTouchedAt | `postponeCount` increments through the skip flow only |
| `taskEvents` | type `skip` with reason / reasonText / from / to | Already created in 1A |
| `focusSessions` | taskId, mode, plannedMinutes, startedAt, endedAt, actualMinutes, outcome, interruptions | Timer state also kept in local storage so it survives reloads |

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

- [ ] Today data queries (local date, Must-dos, overdue, capacity)
- [ ] Today screen + reorder + Must-do cap
- [ ] Next-step prompt
- [ ] Skip flow + `taskEvents` recording + `postponeCount`
- [ ] Stale detection + resolution actions; "goal needs a next step" surfacing
- [ ] Focus mode + `focusSessions` + timer persistence + notification at end (in-app; push in 1D)
- [ ] Swipe gestures on mobile rows
- [ ] Upcoming view
- [ ] Tests, deploy

## Tests

- **Unit:** local-date boundaries (timezone, DST), stale rules, capacity maths, skip → postponeCount, timer persistence.
- **E2E:** plan 3 Must-dos and try a 4th (forced swap); postpone a task → reason required → recorded; postpone 3× → stale prompt; start focus → reload mid-session → timer continues; offline focus session syncs.

## Build log

| Date | What |
|---|---|
| | |
