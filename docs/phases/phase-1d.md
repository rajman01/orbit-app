# Phase 1D — Habits, levels and reminders

| | |
|---|---|
| **Status** | ✅ Deployed — 2026-11-12 (commit `381d712`); push set up and confirmed on a real device |
| **Depends on** | 1C |
| **PRD** | §7.10, §8.3, §9, §12 |
| **Design** | [DESIGN.md](../DESIGN.md) §9, §11.14 |

## Goal

Close the Phase 1 loop with the motivation and nudging layer: light habit tracking, XP and levels that reward meaningful progress, an accountability score and weekly report, and push notifications that reach the phone.

**Exit criterion (end of Phase 1):** Orbit has been used for two full cycles — daily plans, focus sessions, rituals reminded by push notifications, habits checked in, XP earned — including offline on the phone.

## Scope

| PRD ID | Feature |
|---|---|
| HAB-1 – HAB-3 | Habits (daily / days of week / X per week, boolean or count), check-ins from Today, "never miss twice" streaks |
| §9 | XP sources, anti-gaming rules, global level + area levels, level-up moment |
| §8.3 | Accountability score (rolling 14 days) |
| §8.1 | Weekly accountability report (in-app; email later) |
| NOT-1, NOT-2, NOT-4, NOT-6 | Web Push to installed PWA (iOS 16.4+, Android, desktop), reminders for rituals/tasks/habits/focus end, quiet hours, ≤ 1 minute accuracy |
| SET-3 | Notification settings: per-type toggles, ritual times, quiet hours |

**Not in 1D:** relationship and coach notifications (Phase 2) · notification centre and actions (Phase 2) · habit heatmap (Phase 2).

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `habits` | areaId, goalId, name, schedule, targetType, targetCount, unit, reminderTime, archivedAt, order | Streaks computed, not stored |
| `habitLogs` | habitId, date, value, note | One per habit per local date (deterministic id) |
| `xpEvents` | source, sourceId, areaId, amount, reason, at | One entry per source (deterministic id); undoing sets it to 0 rather than deleting (a deleted entry could never come back, since deletes win in sync); totals and levels derived |
| `reminders` | kind (`focus_end` / `custom`), title, body, url, fireAt, status | Only one-off reminders the device schedules (a focus session ending). Recurring ones (rituals, habits) are worked out on the server each minute from settings, rituals, cycles and habits, so they arrive even if the app hasn't been opened |
| `pushSubscriptions` | endpoint, keys, userAgent | Server-only (not synced to IndexedDB) |
| `sentNotifications` | userId + key | Server-only; each reminder is sent once (kept 3 days) |
| `settings` (extend) | quietHours, notify { plan, shutdown, review, habits, focus } | Defaults 22:00–07:00, all on |

**Decisions**

1. **XP is computed on the client** when the action happens (works offline) and written as `xpEvents` with deterministic ids per source (`task` + id), so completing the same task on two devices never double-awards.
2. **Reminder delivery: cron-job.org** (owner decision, 2026-11-12). Vercel's Hobby plan only runs cron jobs once a day, so a free external scheduler calls `/api/cron/dispatch-reminders` every minute with `Authorization: Bearer <CRON_SECRET>`.
4. **Level titles are space-themed** (owner decision, 2026-11-12): Spark → Drift → Orbit → Ascent → Momentum → Gravity → Constellation → Nebula → Pulsar → Quasar → Supernova → Galaxy → Cosmos.
3. **iOS push only works once Orbit is added to the Home Screen.** The settings page explains this and offers an install guide.

## Screens and components

| Screen / component | Notes |
|---|---|
| Habits list + habit detail | Check-in, streak with "at risk" state, schedule editor |
| Habits on Today | "Habits due" section from 1B becomes live |
| Level badge + XP bar | Sidebar footer / profile; "+30 XP" rise on completion; level-up card (deferred during focus) |
| Profile / levels page | Global level, area levels, XP history |
| Weekly report | Committed vs done, skips and reasons, stale items, rituals, XP |
| Notification settings | Permission prompt at the right moment, per-type toggles, quiet hours |
| Service worker | `push` and `notificationclick` handlers |

## Implementation steps

- [x] Habits + habit logs + streak rules
- [x] XP rules engine (pure functions) + `xpEvents` + levels + level-up UI
- [x] Accountability score + weekly report
- [x] Choose the scheduler (decision 2): cron-job.org
- [x] VAPID keys, push subscription API, service worker push handlers
- [x] Reminders entity + dispatch job + quiet hours
- [x] Notification settings + iOS install guidance
- [x] Tests
- [x] Owner setup: Vercel environment variables and cron-job.org (below)
- [x] Deploy (`381d712`); test notification and a real reminder confirmed on the owner's phone
- [ ] Two-cycle trial (Phase 1 exit criterion), in progress

## Tests

- **Unit:** streaks (never miss twice, X per week), XP rules incl. anti-gaming, level curve, accountability score, quiet hours, reminder scheduling across timezones.
- **E2E:** check in a habit offline → streak correct after sync; complete a task on two devices → XP awarded once; reminder fires (dispatch job called directly in tests).

## One-time setup for reminders (owner)

The keys are already in `.env.local` (generated locally, never committed). Production needs the same values:

1. **Vercel → Project → Settings → Environment Variables** (Production): add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`, copying each value from `.env.local`. Then redeploy.
2. **cron-job.org**: create a free account → *Create cronjob* →
   - URL: `https://orbit-app-three-beta.vercel.app/api/cron/dispatch-reminders`
   - Schedule: every minute
   - Advanced → Headers: `Authorization` = `Bearer ` followed by the `CRON_SECRET` value
   - Save, then use *Test run*: it should answer `200` with `{"users":…,"notifications":…}`. A `401` means the header or secret doesn't match; `503` means the VAPID keys aren't set on Vercel yet.
3. **On each device**: Settings → Notifications → *Turn on*, then *Send a test*. On iPhone, add Orbit to the Home Screen first and turn it on from there.

## What shipped

| Area | Delivered | Where |
|---|---|---|
| Habits | Daily, certain days, or × a week; done/not done or a number with a unit; reminder time; area and goal. Check in from the Habits page or the "Habits" section on Today (tap, or set a count). "Never miss twice" streaks: one miss keeps the streak but marks it at risk; two in a row break it. Archive and restore | `src/features/habits/`, `src/components/habits/`, `src/app/(app)/habits/` |
| XP (§9.1) | Tasks (10 × points, +50% Must-do, +100% if it had gone stale), focus (15 per 25 min), Daily Plan / Shutdown (20), Cycle Review (100), habits (5, up to 10 with a 30-day streak), milestones (100), goals (500 scaled by length), key-result check-ins (10), wins (15). Anti-gaming: tasks done within 2 minutes of creation earn 0 unless they repeat; undo takes XP back; past 3× your usual daily task XP a task earns half. Strict mode: −5 XP a day per unresolved stale task, never below the level floor | `src/features/xp/model.ts`, `actions.ts` |
| Levels (§9.2) | 100 × n^1.5 curve, space titles, area levels. Level badge in the sidebar and on the Today header (phones), "+N XP" rising on every award, a level-up card (held back during focus mode, with a haptic) | `src/components/xp/xp-layer.tsx`, `src/app/(app)/levels/` |
| Accountability score (§8.3) | Rolling 14 days: Must-dos kept on their day (40%), plans and shutdowns done (25%), stale tasks resolved (15%), habit consistency (20%); parts with nothing to measure are left out and the rest re-weighted | `src/features/report/model.ts` |
| Weekly report (§8.1) | Score with its parts, Must-dos kept, tasks and points done, XP, plans, shutdowns, focus time, habits, stale now, the cycle, and skips by reason; previous weeks | `src/app/(app)/report/` |
| Push (NOT-1) | VAPID Web Push; subscribe / unsubscribe / test API; service worker shows the notification (not when Orbit is open in front) and opens the right page on tap; dead subscriptions removed | `src/lib/push/`, `src/app/api/push/`, `src/app/sw.ts` |
| Reminders (NOT-2, NOT-4, NOT-6) | Per-minute job: Plan your day (from its time, for 3 hours, until done; mentions tasks due today), Shut down (2 hours), Cycle review on the last day (4 hours), habits with a reminder time while still due, and a focus session ending or a break being over. Each sent once; quiet hours hold back everything except a focus session ending; per-type switches | `src/features/reminders/model.ts`, `src/lib/push/server.ts`, `src/app/api/cron/dispatch-reminders/` |
| Settings | Notifications: turn on for this device (with iPhone Home Screen guidance), send a test, per-type switches, quiet hours | `settings-view.tsx` |
| Asking at the right moment | A "Get reminded" card on Today, only after your first completed ritual; dismissible for good | `today/push-prompt.tsx` |

## Changes from the plan

| Planned | Actual | Why |
|---|---|---|
| `reminders` hold every reminder, created by the client | Only one-off ones (focus ending); ritual and habit reminders are computed on the server each minute | A reminder must arrive even if Orbit hasn't been opened that day |
| Task reminders "at a time" (NOT-2) | Tasks due today are mentioned in the morning plan reminder | Tasks have no time of day yet; time blocks come with calendars in Phase 2 |
| Habit check-in by long-press for count/note (HAB-2) | Count habits open a small stepper on tap; no notes yet | Simpler on every device |
| Relationship XP | Not yet | People arrive in Phase 2 |

## Known gaps

- XP isn't backdated: things finished before this phase earn nothing.
- Reminders arrive only on devices that turned notifications on. Push can't be tested on the dev server (its service worker is off).
- The weekly report is in-app only; email comes later (NOT-7).

## Build log

| Date | What |
|---|---|
| 2026-11-12 | Decisions: cron-job.org for the per-minute job; space-themed level titles |
| 2026-11-12 | Data model: `habits`, `habitLogs`, `xpEvents`, `reminders`, settings `quietHours` and `notify` (Dexie v5); server-only `pushSubscriptions` and `sentNotifications` |
| 2026-11-12 | Habits with "never miss twice" streaks; XP engine and awards; levels with level-up; accountability score and weekly report; Web Push, reminder dispatch, notification settings and the Today prompt |
| 2026-11-12 | Tests: 19 unit tests (`tests/unit/phase1d.test.ts`: streaks, XP rules and anti-gaming, levels, score, quiet hours, due reminders, XP on a local database, dispatch on an in-memory MongoDB) and 4 browser tests (`tests/e2e/habits.spec.ts`: offline habit check-in, XP once across two devices, reminder job secret, report and levels pages) |
| 2026-11-12 | Full browser suite: 2 of 3 runs clean (39 passed, 5 skipped). In the other, the phone browser crashed once ("Target crashed") opening a task on Upcoming in `today.spec.ts`; that spec then passed 20 of 20 on its own. Treated as a test-browser crash, worth watching |
| 2026-11-12 | Owner set up the Vercel variables and cron-job.org; the live push key, the reminder job, a test notification and a real ritual reminder all confirmed working on the owner's phone |
| 2026-11-13 | Trial feedback (owner, desktop): deleting a task, closing the task panel and adding custom areas all worked but were hard to find. The panel header now stays visible while scrolling and has a visible Delete button (with a confirmation, since deletes can't be undone); the panel also closes on a click outside it; task rows get a right-click menu (Open, Start focus, Move, Mark done, Delete) and the ⌫ key. Areas: a + next to "Areas" in the sidebar, "New area" in the phone's More menu, a primary button on the Areas page, and "Add your own" in onboarding. Tests: `tests/e2e/trial-fixes.spec.ts` |
| 2026-11-13 | Trial feedback, round 2: the panel's delete and close buttons were invisible on desktop. Real bug, present since Phase 0: icon-only buttons got both `px-4` and `px-0`; `cn()` only joins classes, so `px-4` won and left no room for the icon (0 px wide on desktop, squeezed on phones). Fixed in `Button` (padding belongs to the size; new `icon` size). This affected every icon-only button on desktop. Also: board cards get the right-click menu and the Delete key; the right-click menu is off on touch screens, where a long press means drag. Tests: icon buttons must show their icons; board right-click delete |
| 2026-11-13 | Trial feedback, round 3 (desktop): (1) a dragged board card appeared well below the pointer. The page rise-in animation used `fill-mode: both`, so after it ended it kept a transform, which made the page the containing block for the fixed-position drag preview; now `backwards`, and the preview is portalled to `<body>`. (2) Clicking inside the task panel to close a picker (e.g. Priority) closed the whole panel: an open picker blocks pointer events, so the click landed on `<html>`, outside the panel. The panel now ignores outside clicks while a picker, menu or dialog is open. Both tests fail without their fix; full suite clean twice |
| 2026-11-13 | Trial feedback: long subtasks were cut off with "…". They now wrap in the task panel and in focus mode, with the checkbox aligned to the first line. Test: a long subtask isn't clipped and spans several lines, on desktop and phone |
| 2026-11-13 | Trial feedback: focus mode now syncs across devices. The live timer (plan, pause, break) lives on the synced `focusSessions` document (new optional fields), so any device shows the running session and can pause, extend or end it; while one runs, sync checks every 5 s (only with the page in front). A minimised session shows **Continue** instead of Start on its task (row, panel, Today). Starting a different task ends the running session (counted as progress) instead of refusing. "Time's up" pops up only on the device that started or last opened the session. Leaving the app shows a silent "Focusing on…" notification with the end time (Android and desktop; iPhone may not show it); the time's-up push replaces it. Tests: two-device focus test in `trial-fixes.spec.ts`, model round-trip unit tests |
| 2026-11-13 | Trial feedback: focus mode was cramped on phones with notes. Real bug: the overlay's opening animation left `filter: blur(0px)`, which made the scrolling overlay the containing block for the "fixed" controls, so they scrolled up over the notes; the filter is now cleared when the animation ends. Also on phones: a smaller ring and title, the four controls as a full-width toolbar (icon over label) so End is no longer cut off, and notes fade out under the controls. Test: controls fit the screen and stay pinned at the bottom with long notes |
