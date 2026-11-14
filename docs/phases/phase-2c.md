# Phase 2C — People

| | |
|---|---|
| **Status** | 2C.1 and 2C.2 built 2026-11-14; 2C.3 to do |
| **Depends on** | 2A (the coach's people tools), 1D (push reminders) |
| **PRD** | §7.11 (REL-1 – REL-7), AREA-2 (people on the Relationships area), §13 (People list and person detail) |
| **Design** | [DESIGN.md](../DESIGN.md) — list rows (person: 52px on phones), long-press menus, `Users` icon, "Delete person" wording |

## Goal

Keep the people who matter close without having to remember everything: Orbit knows who you haven't been in touch with for a while, reminds you before birthdays and anniversaries, keeps what you know about each person in one place, and turns "I should follow up" into a task.

**Exit criterion (2C):** add people (by hand or from Google Contacts) with a cadence and a birthday; someone overdue shows up on Today; log a call with a follow-up and the task appears; a birthday reminder arrives on your phone a week and a day before; the coach can tell you who to reach out to and log a conversation you describe.

## Owner answers (2026-11-14)

1. **No photos:** each person gets a coloured circle with their initials, or an emoji. (No file storage needed.)
2. **Google Contacts import**, plus adding people by hand.
3. **The coach gets full help with people**: it can read them and log conversations, with the same autonomy setting, cards and undo as everything else. People's names and notes go to the AI with your messages (the privacy policy is updated to say so).

## Scope

| PRD ID | Feature |
|---|---|
| REL-1 | People: name, initials/emoji and colour, relationship (family, friend, partner, mentor, colleague, other), how you met, notes, interests, important dates (birthday, anniversary, custom), phone, WhatsApp, email |
| REL-2 | Keep-in-touch cadence: weekly, every 2 weeks, monthly, quarterly, custom number of days, or none |
| REL-3 | Reach out: people overdue against their cadence, most overdue first; on Today (at most 2 a day) and in the Daily Plan; log, snooze or open from there |
| REL-4 | Interaction log: date, type (call, text, in person, other), notes, and an optional follow-up that creates a task linked to the person |
| REL-5 | Gift ideas and things to remember, per person |
| REL-6 | Push reminders 7 days and 1 day before important dates |
| REL-7 | Goals can link to people (a relationship goal shows on their page) |
| AREA-2 | The Relationships area page lists its people |
| — | Import from Google Contacts (names, birthdays, phone, email), choosing who to bring in |
| — | Coach tools for people |

**Not in 2C:** photos; reading the phone's contacts (Android-only in browsers); syncing changes back to Google Contacts; shared people between accounts.

## Decisions

1. **People are ordinary synced data** (Dexie + MongoDB, last-writer-wins per field), so they work offline and on every device like tasks. Important dates live on the person (a short list); gift ideas, things to remember and interactions are their own entities, so edits on two devices don't overwrite each other.
2. **"Last in touch" is worked out from the interaction log**, not stored, so it can never disagree with it. Logging any interaction resets the clock; snoozing pushes someone out of Reach out until a chosen day without pretending you talked.
3. **Overdue-ness is days since last contact divided by the cadence**, so someone weekly who's 2 weeks late ranks above someone quarterly who's 2 weeks late. People with no cadence never appear in Reach out.
4. **Date reminders run on the server**, on the per-minute job like the other reminders: at the user's Daily Plan time, 7 days and 1 day before each date (once each). They use the reminders' existing sent log (one key per person, date, year and lead time) rather than a separate `peopleReminders` collection. Settings → Notifications → "Birthdays and dates" turns them off. Birthdays without a year still repeat every year; 29 February falls on 28 February in other years.
5. **Google Contacts is a one-off import, not a connection.** "Import from Google Contacts" asks Google for read-only access to contacts just for that import (`contacts.readonly`), lists them with birthdays, and you tick who to bring in. Orbit keeps no Google Contacts token afterwards; importing again skips people already imported (matched by Google's id).
6. **Follow-ups are tasks** with a `personId`, so they live in Today/Inbox like any task and show on the person's page.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `people` | name, emoji, color, relationship, howWeMet, notes, interests[], phone, whatsapp, email, cadenceDays, snoozedUntil, dates[] (`{ kind: birthday/anniversary/custom, label, month, day, year? }`), areaId, googleId, archivedAt | Synced |
| `interactions` | personId, date, type, notes | Synced; the newest one is "last in touch" |
| `personItems` | personId, kind (`gift` / `remember`), text, doneAt | Synced |
| `tasks` (extend) | personId | Follow-ups and tasks about someone |
| `goals` (extend) | personIds[] | REL-7 |

## Steps

- [x] **2C.1 People:** entities and sync; People page (search, sorted by name, relationship filter) and person page (details, dates, cadence, notes, gift ideas, things to remember, interaction log with follow-up → task, linked goals and tasks); add/edit person; Relationships area lists its people; nav, `G P`, command menu
- [x] **2C.2 Reach out and reminders:** overdue model; Reach out on Today (2 a day) with log/snooze/open; in the Daily Plan; upcoming dates on the People page; push reminders 7 days and 1 day before; goals linking to people
- [ ] **2C.3 Google Contacts and coach:** one-off import with a picker; coach tools (`get_people`, `get_person`, `add_person`, `update_person`, `log_interaction` with follow-up, `add_person_note`); privacy policy update
- [ ] Tests, owner setup, deploy

## Tests

- **Unit:** overdue ranking (cadence, no interactions yet, snooze); next occurrence of a date (no year, 29 February, timezones); reminder dispatch sends 7-day and 1-day reminders once; follow-up creates a linked task; Google Contacts mapping (names, birthdays with and without year); coach tools with undo.
- **Browser:** add a person with a birthday and cadence → appears in Reach out when overdue → log a call with a follow-up → task on Today, person leaves Reach out; on two devices; import from a fake Google Contacts.
- **Manual (owner):** a real Google Contacts import; a birthday reminder on your phone.

## One-time setup (owner), needed for 2C.3

**Google Cloud (same project):** APIs & Services → Library → enable **People API**; Google Auth Platform → Data access → add `.../auth/contacts.readonly`. No new redirect URI is needed beyond one for the import callback (`/api/people/google/callback`), which I'll list when it's built.

## Risks

- **Contacts scope verification:** fine unverified for personal use (same as Calendar).
- **Reminder noise:** at most 2 Reach out people a day, and date reminders only for people you've given dates.

## Build log

| Date | What |
|---|---|
| 2026-11-14 | Plan written; owner chose initials/emoji (no photos), Google Contacts import plus manual entry, full coach help |
| 2026-11-14 | 2C.1 People: synced `people` (name, emoji or initials on a colour, relationship, cadence, snooze, important dates with optional year, phone/WhatsApp/email, how you met, interests, area, Google id for 2C.3), `interactions` and `personItems` (Dexie v10), tasks gain `personId`. Actions: add (into the Relationships area when there is one), edit, archive, delete (log and items go; tasks stay, unlinked), log an interaction (ends a snooze; an optional follow-up becomes a `todo` task about the person, on a chosen day), gift ideas (tick when given) and things to remember. People page: search (names, interests, notes), relationship filter, "In touch … ago"; archived list with restore. Person page: cadence picker, last in touch, Log / Call / WhatsApp / Email, dates with next occurrence and age ("In 4 weeks · turns 37"; 29 February on the 28th in other years), notes, things to remember, gift ideas, tasks about them (add one with Quick Add), the log (edit/delete); on phones dates and details come first. Task details get a Person picker once you have people; area pages list their people. Nav (People, `Users`), `G P`, palette (People group, "New person"). Dialogs now scroll when taller than the window. Years from 1800. Tests: 7 unit (`people.test.ts`: initials, labels, next occurrence, log with follow-up, delete, server validation and ownership) and 2 browser (`people.spec.ts`: add → remember/gift → log with follow-up → Today and task's person → phone device → delete; `G P`); full suite 166 unit, 89 browser passed, 23 skipped |
| 2026-11-14 | 2C.2 Reach out and reminders: `reachOut()` (cadence, not archived or snoozed, days since the last interaction or since being added ≥ cadence; ranked by days ÷ cadence). Today: "Reach out" with the top 2 plus birthdays and dates today or tomorrow; each person has Log (opens the log dialog) and Snooze (tomorrow, 3 days, a week, 2 weeks; Undo in the toast). Daily Plan: "Reach out today" on "Your day". People page: "Coming up" (dates in the next 30 days, age) and "Due a catch-up" (everyone overdue). Push reminders a week and a day before each date at Daily Plan time ("Mum's birthday is in a week" — "Saturday, 21 November. They turn 60."), once each, with a Settings switch (`notify.people`). Goals link to people (`goals.personIds`; the server checks every id in a list belongs to the user): chips and "Link a person" on the goal, a Goals section on the person; deleting a person unlinks them. The log dialog now saves before closing. Tests: 4 more unit (ranking with snooze/archive/no log, dates coming up and titles, reminder timing/once/off, server job once; goal unlink) and 1 browser (overdue → People page and Today → snooze/undo → log from Today; birthday tomorrow; goal link). Full suite: 170 unit; 89 browser passed, 23 skipped (two unrelated tests flaky on the full run, pass alone) |
