# Phase 2B — Calendar

| | |
|---|---|
| **Status** | In progress — 2B.1 and 2B.2 built 2026-11-14 |
| **Depends on** | 2A (the coach's time-block and availability tools land here) |
| **PRD** | §11 (CAL-1 – CAL-7), VIEW-3, AI-4/AI-5 (time blocks, availability) |
| **Design** | [DESIGN.md](../DESIGN.md) §11 (panels, sheets) |

## Goal

Orbit sees your real day and can put work into it: your Google and iCloud events show up in Orbit, blocking time for a task puts it on your calendar (and moving it there moves it here), and planning — yours and the coach's — knows how much free time you actually have.

**Exit criterion (2B):** connect Google and iCloud; today's events appear on Today and in the week view on every device; block time for a task, see it in Google Calendar, drag it there, and see it move in Orbit; the coach blocks time when asked and warns when a day's Must-dos don't fit.

## Owner answers (2026-11-14)

1. **Both Google Calendar and Apple / iCloud.**
2. Time blocks go to a **new "Orbit" calendar** (created by Orbit), in the account chosen in Settings (default: Google).
3. **Week view + Today agenda.**

## Scope

| PRD ID | Feature |
|---|---|
| CAL-1 | Connect Google Calendar (OAuth); choose which calendars to show; time blocks written to an "Orbit" calendar; moving or deleting a block in Google updates Orbit |
| CAL-2 | Connect iCloud via CalDAV with an Apple ID and an app-specific password (stored encrypted); same as Google, polled |
| CAL-3 | Private subscription feed (ICS) of time blocks and dated tasks, with a secret link that can be reset |
| CAL-4 | Time blocking: "Block time" from a task, or drag a task onto the week view |
| CAL-5 | Free time within working hours: Daily Plan shows it and warns when Must-dos don't fit; the coach uses it |
| CAL-6 | External events on Today and in the calendar view, read-only, coloured by calendar |
| CAL-7 | Sync: Google push notifications (watch channels) + incremental sync tokens; CalDAV polling every ~10 minutes; "Refresh" on demand |
| VIEW-3 | Calendar page: week and day views with events, time blocks and dated tasks |
| AI-4/5 (rest) | Coach tools `get_calendar_availability`, `create_time_block`, `move_time_block` |

**Not in 2B:** month view (later); inviting people or editing other people's events; Outlook.

## Decisions

1. **Calendars sync on the server, not the device.** Tokens and passwords never reach the browser. The server pulls events into Orbit's own synced tables, so events work offline and on every device like everything else; time blocks you make on any device (even offline) are synced up and the server writes them to Google/iCloud.
2. **Google is connected separately from sign-in**, with its own consent ("Connect Google Calendar"), offline access and the minimum scopes: `calendar.calendarlist.readonly`, `calendar.events`, `calendar.app.created` (to create and use the "Orbit" calendar). Sign-in keeps asking for nothing extra.
3. **Secrets are encrypted at rest** (AES-256-GCM, key in `CALENDAR_ENCRYPTION_KEY`), in a server-only collection.
4. **Events are read-only in Orbit** (the calendar is the source of truth for event times, PRD §11.2). Only time blocks are edited in Orbit; a change in either place wins by last-write, and a block deleted in the calendar is deleted in Orbit.
5. **Window:** events from 14 days back to 90 days ahead are kept; recurring events are expanded into instances.
6. **Scheduling the sync** rides on the existing per-minute job (cron-job.org): Google accounts with a pending push notification are synced right away, every account at least every 10 minutes; Google watch channels are renewed before they expire.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `calendarAccounts` | userId, provider (`google` / `caldav`), email, encrypted secrets, orbitCalendarId, watch channel, last sync, error | **Server-only** |
| `calendarSync` | per calendar: Google sync token / CalDAV ctag and etags | **Server-only** |
| `calendars` | accountId, provider, name, color, selected, isOrbit, readOnly | Synced; written by the server, `selected` by the user |
| `calendarEvents` | calendarId, externalId, title, start, end, allDay, location, status | Synced; server-written, read-only for devices |
| `timeBlocks` | taskId, title, start, end, accountId, externalId, status | Synced; made on any device, written to the calendar by the server |
| `settings` (extend) | blocksAccountId, icsToken (server-side) | |

## Steps

- [x] **2B.1 Google, read:** encryption, server-only accounts, Connect Google Calendar (OAuth), calendar list and choosing calendars, incremental event sync into `calendarEvents`, watch channels + webhook, Settings → Calendars, Today agenda
- [x] **2B.2 Time blocks:** `timeBlocks` entity, "Block time" from a task, write to the "Orbit" calendar, changes in Google come back, week/day Calendar page with drag to block
- [ ] **2B.3 iCloud:** CalDAV connect with app-specific password (with step-by-step help), read events, write time blocks, polling
- [ ] **2B.4 Feed, free time and coach:** ICS feed, free time in Daily Plan with the "doesn't fit" warning, coach tools for availability and time blocks
- [ ] Tests, owner setup, deploy

## Tests

- **Unit:** encryption round trip; event mapping (all-day, time zones, recurring instances, cancelled); incremental sync applying adds/changes/deletes; free-time calculation within working hours; ICS output.
- **Server:** Google and CalDAV calls replaced by recorded fakes (no real accounts in tests); webhook marks the account for sync; token refresh; a block made offline reaches the calendar once.
- **Browser:** connect flow with a fake provider; events on Today and in the week view on two devices; block time → it appears; moved remotely → moves in Orbit.
- **Manual (owner):** real Google and iCloud accounts.

## One-time setup (owner), needed from 2B.1

**Google Cloud (same project as Google sign-in):**
1. APIs & Services → Library → enable **Google Calendar API**.
2. OAuth consent screen → Data access → add the three scopes above.
3. Credentials → your OAuth client → Authorized redirect URIs → add `https://orbit-app-three-beta.vercel.app/api/calendar/google/callback` (and `http://localhost:3000/api/calendar/google/callback` for local).
4. Publishing status: **In production** (unverified is fine for personal use; you'll click through a "Google hasn't verified this app" screen once). In **Testing** status Google expires the calendar connection every 7 days.

**Vercel:** add `CALENDAR_ENCRYPTION_KEY` (I'll give you the command to generate it).

**iCloud (2B.3):** appleid.apple.com → Sign-In and Security → App-Specific Passwords → generate one named "Orbit".

## Risks

- **Google verification:** fine unverified for one user; opening Orbit to others later needs Google's review of the calendar scopes (weeks).
- **iCloud CalDAV is fragile** (Apple changes things, rate limits); the ICS feed is the fallback.
- **Vercel time limits:** a first full sync of a busy calendar is paged across job runs, never one long request.

## Build log

| Date | What |
|---|---|
| 2026-11-14 | Plan written; owner chose Google + iCloud, an "Orbit" calendar for blocks, week view + Today agenda |
| 2026-11-14 | 2B.1 Google, read: AES-256-GCM secrets (`CALENDAR_ENCRYPTION_KEY`); server-only `calendarAccounts`; Connect Google Calendar (own OAuth flow with offline access, `state` signed with the user's id plus an httpOnly nonce cookie); calendar list (primary and owned calendars shown by default) and incremental event sync with Google sync tokens (full resync on 410; a full sync removes what Google no longer returns), window 14 days back / 90 ahead, recurring events expanded; Google push channels (HTTPS deployments only) renewed a day before expiry, webhook marks the account and syncs after replying (`after()`); every account re-synced at least every 10 minutes by the per-minute job. Synced `calendars` and `calendarEvents` (Dexie v8) written by the server through `applyMutations(…, { trusted: true })`; devices may only change a calendar's `selected` (`DEVICE_WRITABLE`), anything else is rejected. Settings → Calendars (connect, choose calendars, refresh, disconnect with revoke) and a Calendar section on Today. Tests: 6 unit (`tests/unit/calendar.test.ts`: encryption, event mapping, days across timezones, full sync/changes/hiding on an in-memory MongoDB with a fake Google, device writes refused, webhook and disconnect) and 1 browser (`calendar.spec.ts`: connect → Today on two devices → hide a calendar), all against the fake Google (`CALENDAR_FAKE=1`) |
| 2026-11-14 | Full suite clean: 78 passed, 18 skipped; 146 unit |
| 2026-11-14 | 2B.2 Time blocks: synced `timeBlocks` (taskId, title, start, end; Dexie v9) with Block time / move / rename / delete actions (deleting a task removes its blocks). Server: blocks go to one account (Settings → "Time blocks go to" when there are several; default the first connected); an "Orbit" calendar is created there on the first block; links kept server-side (`calendarBlockLinks`); each sync pulls the Orbit calendar's changes (Google's `updated` as the write time, so last write wins per field; deleted there → deleted here; events made there → blocks without a task), then pushes blocks changed since a version cursor that differ from what Google has; switching accounts moves every block; one sync per account at a time (lock). A push containing time blocks syncs right after replying (`after()`); otherwise the per-minute job. UI: "Time blocks" in a task's details; the Calendar page (`/calendar`, in the nav): week (desktop) and day (phone) time grid with events, blocks and dated tasks, overlaps side by side, working hours shaded, a now line; drag a block to move it (across days in week view) or its bottom edge to resize, tap it to change/delete, tap empty time to block it, and on desktop drag a task from "To block" or the all-day row onto a time; the page checks for changes every 15 s while open. Today's Calendar section lists blocks too. Tests: unit round trip (create → Orbit calendar, moves both ways, made in Google, deletes both ways) and 2 browser (block from a task → in Google → drag → moved in Google comes back → delete; phone day view tap-to-block), with a test-only fake route (`/api/calendar/fake`, only with `CALENDAR_FAKE=1`) |
