# Phase 1C — Cycles and rituals

| | |
|---|---|
| **Status** | Planned |
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
| `cycles` | number, startDate, endDate, theme, focusGoalIds, committedTaskIds, committedPts, status, reviewCompletedAt, reflection | Deterministic id per cycle number so two devices don't create two copies of the same cycle |
| `rituals` | type (`daily_plan` / `daily_shutdown` / `cycle_review`), date, cycleId, startedAt, completedAt, data | `data` holds answers, mood, energy, decisions |
| `tasks` (extend) | cycleId already exists; rollover decisions recorded as `taskEvents` | |

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

- [ ] Cycle generation + `cycles` entity
- [ ] Cycle page (active) + burn-up chart
- [ ] Cycle planning + commitment
- [ ] Ritual framework (steps, persistence, resume after reload/offline)
- [ ] Daily Plan ritual
- [ ] Daily Shutdown ritual (mood, energy, reflection)
- [ ] Cycle Review ritual + rollover decisions + plan next cycle
- [ ] Ritual rules (carry-over, blocking, overrides) + strictness setting
- [ ] Tests, deploy

## Tests

- **Unit:** cycle date maths (week start, length changes, DST), capacity, strictness rules.
- **E2E:** plan and commit a cycle; complete a daily plan offline; skip a shutdown → it appears in the next morning's plan; run a cycle review → every unfinished task decided → next cycle created.

## Build log

| Date | What |
|---|---|
| | |
