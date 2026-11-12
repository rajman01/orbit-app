# Phase 1A — Plan the work

| | |
|---|---|
| **Status** | ✅ Built — 2026-11-12 (not yet deployed) |
| **Depends on** | Phase 0 |
| **PRD** | §6, §7.1–7.5, §7.15–7.17, §15, §16 |
| **Design** | [DESIGN.md](../DESIGN.md) §11.2, §11.7, §11.10, §11.12 |

## Goal

Turn Orbit from a task list into a planning system: areas, goals with key results and milestones, a full task model, an inbox for quick capture, and Linear-style speed (⌘K, keyboard shortcuts, list and board views). Everything works offline and syncs.

**Exit criterion:** set up your real areas and at least three real goals, each broken into milestones and tasks; capture ideas into the inbox from phone and desktop and triage them — all usable offline.

## Scope

| PRD ID | Feature |
|---|---|
| ONB-2, ONB-3 (manual) | Onboarding: pick areas, week start, cycle length, timezone, working hours; create a first goal and task |
| AREA-1, AREA-2 | Areas CRUD (name, icon, colour, order, archive) and area overview page |
| GOAL-1 – GOAL-6, GOAL-9 | Goals: CRUD, status, health, key results with check-ins, milestones, progress, "needs a next step" rule, drop with reason |
| TASK-1 – TASK-3, TASK-5, TASK-6, TASK-10 | Full task model, status workflow, subtasks, recurring tasks, task history, short IDs (`ORB-142`) |
| TASK-4 (field only) | "Next step" field on tasks (the Today prompt comes in 1B) |
| INB-1 – INB-4 | Quick Add anywhere with natural-language parsing, inbox triage |
| CMD-1 – CMD-3 | ⌘K command palette, local search, keyboard shortcuts with a `?` cheat sheet |
| VIEW-1, VIEW-2 | List view (group/sort/filter) and board view (drag between statuses) |
| SET-1 | Settings: timezone, week start, cycle length, capacities, working hours |

**Not in 1A:** Today/Must-dos, skip flow, focus mode (1B) · cycles and rituals (1C) · habits, XP, notifications (1D) · goal timeline, saved views, bulk edit (Phase 2).

## Step 0 — Fix the flaky offline sync test

Before building on the sync engine, find out why the second device sometimes doesn't show a task completed offline (see [phase-0.md](./phase-0.md#known-issues-carried-into-phase-1)). Add logging to the e2e run (outbox contents before/after the online push, the server's version of the task when the second device pulls) and fix the root cause, then run the test 20× clean.

## Data model

New synced entities go into `src/lib/sync/entities.ts` (Zod) and `src/lib/local-db/db.ts` (Dexie, bump to version 2). Server-managed fields (`id`, `createdAt`, `updatedAt`, `deletedAt`, `serverVersion`) are added automatically.

| Entity | Client-writable fields (summary) | Notes |
|---|---|---|
| `settings` | timezone, weekStartDay, cycleLengthDays, dailyCapacityPts, cycleCapacityPts, workingHours, theme, strictness, ritualTimes, onboardingCompletedAt | One per user; id derived from the user id so two devices never create two |
| `areas` | name, icon, color, description, order, archivedAt | Default areas get deterministic ids (`<userId>` + slug) so onboarding on two devices doesn't duplicate them |
| `goals` | areaId, title, description, status, health, priority, startDate, targetDate, valueIds, droppedReason, completedAt, order | `progress` is computed on the client, not stored |
| `keyResults` | goalId, title, type, start, target, current, unit, order | |
| `krCheckins` | keyResultId, value, note, at | Append-only |
| `milestones` | goalId, title, dueDate, doneAt, order | |
| `tasks` (extend) | + description, priority, effort, areaId, goalId, milestoneId, parentTaskId, dueDate, scheduledDate, nextStep, tags, recurrence, recurrenceParentId, cancelledAt, createdBy | Phase 0 fields stay; status gains `inbox`/`backlog` usage |
| `taskEvents` | taskId, type, from, to, reason, reasonText, actor, at | Append-only history (also feeds skip analytics in 1B) |

**Decisions to settle in this part**

1. **Task numbers (`ORB-142`) offline.** Two offline devices can't safely pick the next number. Plan: the server assigns `number` on first push (server-managed, monotonic per user via the counters collection); until then the UI shows the task without a number. Pull returns the number.
2. **References across entities.** The server checks that a referenced id (goalId, areaId…) belongs to the same user *if it exists*; it allows ids it hasn't seen yet (they may arrive later in the same push). The UI treats unknown references as "Unassigned".
3. **Recurring tasks** are generated on the client when an instance is completed (works offline). The next instance gets a deterministic id (`parentId` + due date) so two devices completing the same instance create one successor, not two.
4. **Progress** = key results if any (average % of start→target), else effort-weighted share of done tasks. Pure function shared by UI and tests.

## Screens and components

| Screen / component | Notes |
|---|---|
| Onboarding wizard | 3–4 steps, shown once (`settings.onboardingCompletedAt`) |
| Areas list + area overview | Goals with progress, open tasks, quick actions |
| Goals list | Grouped by area, health pills, progress rings, "Needs a next step" state |
| Goal detail | Description, key results (check-in sheet), milestones, tasks list, drop/complete |
| Task detail | Desktop side panel (§11.5), mobile sheet (§11.4); all fields, subtasks, history |
| Inbox + triage | One-at-a-time keyboard triage: assign area/goal, schedule, convert, delete |
| Quick Add | `C` / `+` tab; inline tokens for dates (`chrono-node`), `!1–!4`, `#area`, `+goal` |
| Command palette | `cmdk`; navigate, search tasks/goals/areas, run actions, shortcut hints |
| Views | List (group by status/priority/area/goal) and board (drag between statuses) |
| Task row (full) | Status icon, priority icon, area dot, goal, effort, due date (DESIGN §11.2) |
| Pickers | Date, priority, effort, area, goal, status — keyboard-first menus |

## Implementation steps

- [x] Step 0: fix the flaky offline e2e test (see build log — three separate causes)
- [x] Generalise the sync registry and Dexie schema for multiple entities; migration from Dexie v1
- [x] Server: server-assigned task numbers; reference ownership checks
- [x] Settings entity + onboarding wizard + Settings page fields
- [x] Areas: CRUD, defaults, overview page
- [x] Goals: CRUD, key results + check-ins, milestones, progress, health suggestion, drop flow
- [x] Tasks: full fields, subtasks, task detail panel/sheet, history (`taskEvents`)
- [x] Recurring tasks
- [x] Quick Add with natural-language parsing; Inbox and triage
- [x] List and board views with filters
- [x] Command palette, search, keyboard shortcuts, `?` cheat sheet
- [x] Update the PWA precache list with the new pages
- [x] Tests (below)
- [ ] Deploy and use with real goals (exit criterion)

## Tests

- **Unit:** natural-language parser, progress calculation, recurrence next-date, task number assignment, reference checks, per-entity sync (create/update/delete/conflict).
- **E2E:** onboarding → create goal with KR and milestone → Quick Add a task into it → complete → progress updates; inbox triage; ⌘K navigation; create a goal and tasks offline → syncs to a second device.

## What shipped

| Area | Where |
|---|---|
| Data model (8 synced entities) and server rules | `src/lib/sync/entities.ts`, `src/lib/sync/server.ts`, `src/lib/local-db/db.ts` |
| Domain logic (dates, progress, health, recurrence, Quick Add parser) | `src/lib/dates.ts`, `src/features/*/model.ts`, `src/features/quick-add/parse.ts` |
| Data hooks and actions (every write records history) | `src/features/data.ts`, `src/features/actions.ts` |
| Task row, pickers, detail panel/sheet, list | `src/components/tasks/` |
| Quick Add, ⌘K palette, shortcuts, `?` sheet | `src/components/app/commands.tsx` |
| App shell (sidebar with areas, tab bar with + and More) | `src/components/app/app-shell.tsx` |
| Screens | `/welcome`, `/today`, `/inbox`, `/tasks`, `/goals`, `/goal?id=`, `/areas`, `/area?id=`, `/settings` |

Detail pages use `?id=` query strings (not dynamic routes) so one cached page shell serves every goal and area offline.

## Known gaps (carried forward)

| Gap | Plan |
|---|---|
| Tags exist in the data model but have no UI yet | Add with saved views (CMD-4, Phase 2) |
| A goal can't be set back to "Planned" from the UI (only active/paused/completed/dropped) | Add to the goal actions menu when cycles land (1C) |
| Tasks created in Phase 0 get a number (`ORB-n`) only on their next edit | Acceptable; no backfill planned |
| Board drag on touch (long-press) is implemented with dnd-kit but only tested by hand on desktop | Check on a real phone after deploy |
| Today is a simple 1A version (overdue / today / in progress) | Replaced in 1B |

## Build log

| Date | What |
|---|---|
| 2026-11-12 | **Flaky offline test fixed.** Debug logging (`localStorage["orbit:debug-sync"] = "1"`) showed three causes: (1) the service worker cached `GET /api/*` (Serwist default) — now never cached, which also stops one account's data being served to another from cache; (2) the sync indicator said "All changes synced" before any sync had run, and a page could end up with two sync engines — now one engine per user and "Not synced yet" until a sync completes; (3) a reload mid-upload sent the same new record twice at once and MongoDB rejected the second insert (E11000), failing the push for a minute — the server now retries as an update, and the client retries failed syncs with backoff (2s → 30s). 90/90 runs pass. |
| 2026-11-12 | Data model: settings, areas, goals, key results, check-ins, milestones, full tasks, task events; Dexie v2; server-assigned task numbers; reference ownership checks |
| 2026-11-12 | Onboarding, areas, goals (KRs, check-ins, milestones, health, drop/complete/delete), task detail, recurrence, inbox triage, Quick Add, ⌘K, shortcuts, list/board views, planning settings |
| 2026-11-12 | Offline fix: precache ignores query strings, so `/goal?id=…` opens offline |
| 2026-11-12 | Fixed: dialogs now close before saving (typing into a closing dialog had created a duplicate key result) |
| 2026-11-12 | Tests: 27 unit tests, 13 browser tests (desktop + phone); full suite passes repeatedly |
