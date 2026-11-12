# Phase 1C — Cycles and rituals

| | |
|---|---|
| **Status** | ✅ Built — 2026-11-12 (not yet deployed) |
| **Depends on** | 1B |
| **PRD** | §7.6, §7.9, §8.1, §8.5 |
| **Design** | [DESIGN.md](../DESIGN.md) §11.16, §13 |

## Goal

Give the work a rhythm: two-week cycles you explicitly commit to, and three short guided rituals — plan the morning, shut down the evening, review the cycle on Sunday — that keep the system honest.

**Exit criterion:** complete one full cycle end to end: plan and commit, daily plans and shutdowns, and a cycle review that decides every unfinished task and plans the next cycle.

## Scope

| PRD ID | Feature |
|---|---|
| CYC-1 – CYC-5 | Auto-generated cycles (default 14 days from Sunday, editable 7–28), planning with capacity, active cycle with burn-up, per-task rollover decisions, cycle review |
| RIT-1 – RIT-5 | Daily Plan, Daily Shutdown (with mood + energy), Cycle Review; pinned when incomplete; ritual streaks |
| §8.1 (rituals) | Missed shutdown carried into the next plan; missed review blocks planning (override with reason); explicit commitments tracked |
| SET-4 / §8.5 | Strictness: Gentle / Firm (default) / Strict |

**Not in 1C:** push reminders for rituals (1D) · XP for rituals (1D) · AI-run rituals (Phase 2) · cycle history and themes (Phase 2).

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `cycles` | number, startDate, endDate, theme, focusGoalIds, committedTaskIds, committedPts, committedAt, planningOverride, reviewCompletedAt, reflection | Deterministic id per cycle number. Built without a stored `status`: it's derived from the dates and `reviewCompletedAt`, so devices can't disagree about it |
| `rituals` | type (`daily_plan` / `daily_shutdown` / `cycle_review`), date, cycleId, startedAt, completedAt, data | Deterministic id per type and day. `data` holds the current step, answers, mood, energy and wins (max 20 KB) |
| `tasks` (extend) | cycleId (new, optional) | Adding to and removing from a cycle, and rollover decisions, are recorded as `taskEvents` |
| `settings` (extend) | ritualTimes { plan, shutdown, review } | Defaults 07:30 / 21:00 / 18:00 (PRD §23 proposal) |

**Decisions**

1. **Cycles are generated on the client** from settings (offline-friendly) with deterministic ids; the server only stores them.
2. **Changing cycle length or week start** applies from the next cycle, never mid-cycle.
3. **Capacity starts at 30 points per cycle** and is later suggested from the average completed in the last three cycles.

## Screens and components

| Screen / component | Notes |
|---|---|
| Cycle page | Active cycle: progress, burn-up chart, committed vs added scope; tabs for Planning and Review |
| Planning | Backlog → cycle, capacity meter, over-capacity confirmation, "I commit" step |
| Ritual flow | One question per screen, progress dots, swipeable steps; full-screen sheet on mobile, 640px dialog on desktop |
| Rollover decision list | Per unfinished task: roll over / back to backlog / cancel, optional reason |
| Pinned ritual card | Top of Today until done |
| Strictness setting | Settings → Accountability |

## Implementation steps

- [x] Cycle generation + `cycles` entity
- [x] Cycle page (active) + burn-up chart
- [x] Cycle planning + commitment
- [x] Ritual framework (steps, persistence, resume after reload/offline)
- [x] Daily Plan ritual
- [x] Daily Shutdown ritual (mood, energy, reflection)
- [x] Cycle Review ritual + rollover decisions + plan next cycle
- [x] Ritual rules (carry-over, blocking, overrides) + strictness setting
- [x] Tests
- [ ] Deploy and run one full cycle (exit criterion)

## Tests

- **Unit:** cycle date maths (week start, length changes, DST), capacity, strictness rules.
- **E2E:** plan and commit a cycle; complete a daily plan offline; skip a shutdown → it appears in the next morning's plan; run a cycle review → every unfinished task decided → next cycle created.

## What shipped

| Area | Delivered | Where |
|---|---|---|
| Cycles | Generated on the device from settings: the current cycle and the next one always exist. The first starts on the week-start day on or before today; a length change applies from the next cycle; after a long break, empty periods are skipped. Ids are deterministic, and a new device waits for its first sync before generating | `src/features/cycles/model.ts`, `CycleKeeper` in `app-shell.tsx` |
| Cycle page | This cycle: theme, focus goals, % done, committed vs added mid-cycle, days left, burn-up chart, committed and added task lists. Plan: the planner. Review: start the review, past cycles with completion and reflection | `src/app/(app)/cycle/`, `src/components/cycles/` |
| Planning | Pull tasks in from the backlog (search), estimate inline, capacity meter with an over-capacity warning and extra confirmation, theme and up to 3 focus goals, an explicit "I commit to these N tasks" step. Plans the current cycle until it's committed, then the next | `src/components/cycles/planner.tsx` |
| Task panel | New "Cycle" property: put a task in this cycle or the next | `task-detail.tsx` |
| Ritual framework | One question per screen, progress dots, Continue at the bottom, slides between steps (swipeable on phones), full screen on phones and a 640px dialog on desktop. Progress and answers are saved as you go, so a ritual resumes after a reload, offline, or on another device | `src/components/rituals/ritual-flow.tsx` |
| Daily Plan | Yesterday's leftovers (each needs a decision at Firm) → inbox → up to 3 Must-dos → a first step for each → commit, or commit and start the first one for 5 minutes | `daily-plan.tsx` |
| Daily Shutdown | Tick off what got done → decide on what's left through the skip flow → mood and energy → one line about today → a look at tomorrow | `daily-shutdown.tsx` |
| Cycle Review | Stats (points, tasks, added scope, focus time, skips) → a decision on every unfinished task (roll over / backlog / cancel, optional reason) → goal health → stale cleanup → wins → reflection → plan and commit the next cycle | `cycle-review.tsx` |
| Ritual rules | Due rituals are pinned at the top of Today with streaks; a skipped shutdown is picked up by the next morning's plan; an unreviewed cycle blocks planning the next one (Firm: override with a reason; Strict: no override; Gentle: never) | `ritual-cards.tsx`, `planningGate` |
| Strictness | Settings → Accountability: Gentle / Firm / Strict with what each does, plus ritual times. Gentle: reasons optional, stale tasks not pinned, nothing blocks. Strict: tomorrow is hidden on Upcoming until today's shutdown is done | `settings-view.tsx` |

## Changes from the plan

| Planned | Actual | Why |
|---|---|---|
| `status` field on cycles | Derived from dates and `reviewCompletedAt` | A stored status could disagree between devices |
| Daily Plan includes calendar review and optional time-blocking (RIT-1) | Left out | Calendars arrive in Phase 2 |
| Capacity "later suggested from the last three cycles" | Fixed setting (default 30 pts) | Needs a few completed cycles first; revisit in Phase 3 insights |
| Ritual streaks with XP (RIT-5) | Streaks shown on the ritual cards; no XP yet | XP arrives in 1D |

## Known gaps

- The review is due from 18:00 on the cycle's last day, and that day is also day N of the cycle: planning the next cycle is allowed on that day without a review.
- Tasks rolled over keep their old scheduled date, so they can show as overdue on Today until rescheduled.
- Strict mode's XP penalty for unresolved stale items comes with XP in 1D.
- The offline goal test (`planning.spec.ts`) failed again in 1 of 2 full runs during this phase (opening a page offline took over 15 seconds). It's the same flake seen in 1B; worth a proper look.
- On the dev server, opening and closing any dialog on Today blocks the page for about a second (closing a ritual for about three). A production build doesn't: a ritual opens in about 60 ms and closes in about 400 ms.

## Build log

| Date | What |
|---|---|
| 2026-11-12 | Data model: `cycles`, `rituals`, `tasks.cycleId`, `settings.ritualTimes`; Dexie v4; deterministic ids for both |
| 2026-11-12 | Cycle generation, Cycle page with burn-up, planner and commitment, cycle picker on tasks |
| 2026-11-12 | Ritual framework; Daily Plan, Daily Shutdown and Cycle Review; ritual cards on Today with streaks; strictness and ritual times in Settings; Gentle and Strict behaviours |
| 2026-11-12 | Tests: 19 new unit tests (`tests/unit/cycles.test.ts`: dates, DST, ids, planning gate by strictness, points, burn-up, due rituals, carry-over, streaks, actions on a local database) and 3 browser tests (`tests/e2e/cycle.spec.ts`: plan and commit; Daily Plan offline with close and resume, then a skipped shutdown picked up next morning; full cycle review on desktop). 90 unit tests and 32 browser tests pass |
