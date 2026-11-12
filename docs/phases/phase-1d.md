# Phase 1D — Habits, levels and reminders

| | |
|---|---|
| **Status** | Planned |
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
| `xpEvents` | source, sourceId, areaId, amount, reason, at | Append-only ledger; totals and levels derived |
| `reminders` | kind, entityType, entityId, title, body, fireAt, recurrence, status | Created by the client, delivered by the server |
| `pushSubscriptions` | endpoint, keys, userAgent | Server-only (not synced to IndexedDB) |

**Decisions**

1. **XP is computed on the client** when the action happens (works offline) and written as `xpEvents` with deterministic ids per source (`task` + id), so completing the same task on two devices never double-awards.
2. **Reminder delivery needs a minute-level scheduler.** Vercel's Hobby plan only runs cron jobs once a day. Options: Vercel Pro (per-minute cron), or a free external scheduler such as Upstash QStash calling `/api/cron/dispatch-reminders` every minute. **To decide before this part starts.**
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

- [ ] Habits + habit logs + streak rules
- [ ] XP rules engine (pure functions) + `xpEvents` + levels + level-up UI
- [ ] Accountability score + weekly report
- [ ] Choose the scheduler (decision 2)
- [ ] VAPID keys, push subscription API, service worker push handlers
- [ ] Reminders entity + dispatch job + quiet hours
- [ ] Notification settings + iOS install guidance
- [ ] Tests, deploy, start the two-cycle trial

## Tests

- **Unit:** streaks (never miss twice, X per week), XP rules incl. anti-gaming, level curve, accountability score, quiet hours, reminder scheduling across timezones.
- **E2E:** check in a habit offline → streak correct after sync; complete a task on two devices → XP awarded once; reminder fires (dispatch job called directly in tests).

## Build log

| Date | What |
|---|---|
| | |
