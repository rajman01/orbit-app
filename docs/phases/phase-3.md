# Phase 3 — Insight and growth

| | |
|---|---|
| **Status** | 3A and 3B built 2026-11-15; 3C next |
| **Depends on** | Phase 2 (built; 2B/2C real-account checks and 2D phone checks still with the owner) |
| **PRD** | §7.2 (AREA-3/4), §7.4 (TASK-8), §7.10 (HAB-5), §7.12 (CAR-2–4), §7.13 (JRN-3), §7.14 (INS-1–4), §12 (NOT-7), §13 (email capture), §14 (PWA-6) |
| **Design** | [DESIGN.md](../DESIGN.md): charts follow the dataviz guidance (one accent, muted comparisons, direct labels, readable in both themes); list rows, boards, empty states |

## Goal

Show you what's actually happening — where your time goes, why things get skipped, which areas are neglected — and add the tools for growing a career: skills, learning and (if you want it) a job search.

**Exit criterion:**
- The Insights page and procrastination insights show at least four cycles of real data (Orbit's first cycle started 12 November, so about mid-January 2027).
- A Wheel of Life rating has been done at least twice and Insights compares focus time with what you rated important.
- Skills and the learning queue are in use, with learning items linked to skills.

## Scope

| PRD ID | Feature |
|---|---|
| INS-1 | Insights page: cycle completion trend, focus hours per week, tasks done per area, ritual consistency, XP and level over time |
| INS-2 | Procrastination: skip reasons, most-skipped areas and goals, day-of-week pattern, average postponements before completion, stale-task trend |
| INS-3 | Time vs values: focus time by area against how important you rated each area |
| INS-4 | Mood and energy (from the journal) against tasks done and focus time |
| AREA-3 | Area health (green / amber / red) from goal health, overdue and stale tasks, and recent activity; on the Areas page, each area page and Insights |
| AREA-4 | Wheel of Life: rate each area 1–10 (and how important it is), radar chart with history |
| CAR-2 | Skills: name, category, level 1–5, target level and date, evidence; linked learning items, tasks and goals |
| CAR-3 | Learning queue: books, courses, articles, videos; queued / in progress / done, progress %, notes, linked skill |
| CAR-4 | Job search pipeline: company and role through researching → applied → interviewing → offer → closed, as a board |
| HAB-5 | Routines: ordered checklists (morning, evening) run step by step; steps can be habits |
| TASK-8 | Task links: "blocked by" / "blocks"; blocked tasks dimmed and kept out of Today's suggestions |
| JRN-3 | Journal search and a calendar view of entries |
| §13 | Email to Inbox: forward an email to a private address and it becomes an Inbox task |
| NOT-7 | Email fallback: the weekly report (and critical reminders) by email when push isn't on |
| PWA-6 | App badge: unread notifications or tasks due today on the installed app's icon, where supported |
| Coach | Read tools for insights, skills and learning; write tools for skills, learning items and routines (same autonomy, cards and undo) |

**Not in Phase 3:** opening Orbit to other users, sharing and integrations (Phase 4).

## Decisions (proposed; owner questions below)

1. **Charts are hand-drawn SVG, no chart library.** The burn-up, heatmap and goals timeline already are; a few line, bar and radar charts don't justify Recharts or Visx (bundle size, theming). Each chart has a text summary and a table fallback for screen readers.
2. **Insights are computed on the device** from data it already has (tasks, task events, focus sessions, rituals, XP, journal), so they work offline and nothing new is sent to the server. Ranges: last 4, 8 or 13 cycles. A section with too little data says how much more it needs instead of drawing a misleading chart.
3. **Area health is derived, never stored:** red when an area has an off-track goal, or more than 3 overdue or stale tasks, or nothing done in 3 weeks while it has active goals; amber for at-risk goals, any overdue or stale tasks, or nothing done in 2 weeks; green otherwise. The reasons are shown on hover/tap.
4. **Wheel of Life ratings are dated snapshots** (one per day at most), so history and the radar's "last time" outline come for free. Importance is part of the snapshot, carried over from the last one so you only change what changed.
5. **Task links live on the blocked task** (`blockedBy: [taskIds]`); "blocks" is the reverse lookup. A task stops being blocked once its blockers are done or cancelled. Cycles of links are refused.
6. **Routines are their own entity** (not habits): a routine is an ordered list of steps; a step can point at a habit, and finishing it logs the habit. A routine run is one document per routine per day (deterministic id), like habit logs.
7. **Email goes through Postmark for now, behind a small provider interface** (`sendEmail`, `parseInbound`), so moving to Resend on a custom domain later changes one module and the forwarding address, nothing else. Postmark's inbound address (`…@inbound.postmarkapp.com`) needs no domain; Orbit gives each user a private plus-address on it (`<hash>+<secret>@…`) and drops mail to any other. Outbound uses one confirmed sender address; until a domain is added some mail may land in spam.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `areaRatings` | date, scores[] (`{ areaId, score 1–10, importance 1–10 }`), note | Synced; deterministic id per day |
| `skills` | name, category, level 1–5, targetLevel, targetDate, evidence (markdown), areaId, goalId, order, archivedAt | Synced |
| `learningItems` | title, kind (book / course / article / video / other), url, author, status (queued / in_progress / done / dropped), progress 0–100, notes, skillId, order, startedAt, finishedAt | Synced |
| `jobLeads` | company, role, url, stage (researching / applied / interviewing / offer / closed), outcome (accepted / declined / rejected / withdrawn), nextStep, nextDate, salary, notes, order, appliedAt, closedAt | Synced |
| `routines` | name, kind (morning / evening / other), steps[] (`{ id, text, minutes, habitId }`), reminderTime, order, archivedAt | Synced |
| `routineRuns` | routineId, date, doneStepIds[], startedAt, completedAt | Synced; one per routine per day |
| `tasks` (extend) | blockedBy[] | TASK-8; ids checked by the server |
| `skills` ↔ `tasks` | tasks gain `skillId` | So "practise X" tasks count towards a skill |
| `emailAddresses` | userId, address, createdAt, revokedAt | **Server-only**; the private forwarding address |
| `settings` (extend) | emailReports (weekly report by email), emailFallback (critical reminders when no device has push), badge (`unread` / `due` / `off`) | |

## Steps

- [x] **3A Insights and balance** — INS-1/2/3/4, AREA-3, AREA-4:
  - Insights page (`/insights`, `G N`): range picker; cycle completion trend; focus hours per week; tasks done per area; ritual consistency; XP and level.
  - Procrastination section: skip reasons, most-skipped areas and goals, day of week, postponements before done, stale trend.
  - Area health on the Areas page, area pages and Insights.
  - Wheel of Life: a step in the Quarterly Review, and "Rate now" on Insights and the Areas page; radar with last time, history; time vs values.
  - Mood and energy against completion and focus.
  - Coach: `get_insights`.
- [x] **3B Career** — CAR-2/3/4:
  - Skills page (`/skills`): list by category, level dots and target, linked learning, tasks and goals, evidence.
  - Learning queue (`/learning`): queued / in progress / done, progress, skill links; "Next up" on Today when nothing's in progress (optional).
  - Job pipeline (`/jobs`, in the sidebar): a board like the Tasks board, with next step and date per lead, and a reminder on that date.
  - Coach: read and write tools for skills and learning.
- [ ] **3C Routines, task links, journal search** — HAB-5, TASK-8, JRN-3:
  - Routines page and a step-by-step runner (one step at a time, timer per step, habits ticked as you go); due routines on Today; reminders.
  - "Blocked by" in the task panel (search to add); dimmed rows with a lock; Today and cycle suggestions skip blocked tasks; finishing a blocker says what it unblocked.
  - Journal search (text, mood, date) and a month calendar of entries.
- [ ] **3D Email and badge** — §13, NOT-7, PWA-6:
  - Private forwarding address in Settings → Capture (show, copy, regenerate); inbound webhook → Inbox task (subject as title, sender and a trimmed body in the notes, links kept).
  - Weekly report email (Sunday evening, if turned on) and critical reminders by email when no device has push.
  - App badge (unread notifications or due today), set by the app and by the service worker on push.
- [ ] Tests, owner setup (email provider, DNS if a domain is used), deploy

## Tests

- **Unit:**
  - Insight maths: completion per cycle, focus per week (sessions crossing midnight), ritual consistency, skip reasons and days, postponements before done, stale trend, "not enough data".
  - Area health rules and reasons.
  - Wheel ids, carried-over importance, time vs values shares.
  - Mood/energy buckets.
  - Skills, learning and job lead transitions (started/finished times).
  - Routine runs: ids, step order, habit logging.
  - Task links: blocked state, reverse lookup, cycle refusal, server ownership of ids.
  - Inbound email parsing (subject, sender, quoted replies stripped, links), unknown address ignored, rate limit.
  - Badge count.
- **Browser:**
  - Insights page with seeded history; range change; empty state.
  - Wheel of Life rating → radar → second rating shows last time.
  - Area health badge changes when a task goes overdue.
  - Skill with a learning item → progress → done.
  - Job lead dragged across the board.
  - Routine run with a habit step → habit logged.
  - Blocked task dimmed, unblocked when its blocker is done.
  - Journal search and calendar.
  - Inbound email webhook (signed test payload) → Inbox.
- **Manual (owner):** forward a real email; receive the weekly report email; app badge on the installed app.

## Risks

- **Data volume on the device:** insights over 13 cycles read thousands of task events; compute once per visit in a worker-free, memoised pass and keep it under 100 ms on a phone.
- **Email deliverability:** sending without a verified domain often lands in spam; inbound needs either a provider address or DNS on a domain.
- **Badging API** works on installed apps in Chromium and on iOS 16.4+ home-screen apps only; elsewhere it's silently skipped.

## Owner answers (2026-11-15)

1. **Order: insights first** — 3A → 3B → 3C → 3D.
2. **Email: Postmark now, without a domain; a custom domain with Resend later** (see "Later" below).
3. **Job search pipeline: yes, and shown in the sidebar from the start** (the owner is job searching).
4. **Wheel of Life: a step in each Quarterly Review**, plus "Rate now" any time from Insights and the Areas page.

## Later: custom domain and Resend

Not in Phase 3's exit criterion; done when the owner buys a domain (PRD §23 question 8):
- Buy the domain and point it at Vercel; update `BETTER_AUTH_URL`, the Google OAuth client's origins and redirect URIs (sign-in, Calendar, Contacts) and the ICS feed links.
- Resend: verify the domain (SPF, DKIM, DMARC records); swap the email module's provider; set the sender to `orbit@<domain>`.
- Inbound on the domain (Resend inbound or MX to the provider): new forwarding addresses `inbox+<secret>@<domain>`; the Postmark address keeps working for a month, then is retired.
- Check the PWA install, push subscriptions and saved sessions survive the move (they're tied to the origin, so users sign in again and re-enable notifications).

## Build log

| Date | What |
|---|---|
| 2026-11-15 | Plan detailed from the outline |
| 2026-11-15 | 3A Insights and balance:<br>• **Data:** synced `areaRatings` (one per day, `r20261115…`; scores 1–10 for how each area is going and how much it matters, and a note), Dexie v14. The server checks ids inside list items (`scores.areaId`), so a rating can't point at another user's areas.<br>• **Insights page** (`/insights`, `G N`, sidebar under "looking back", More, palette): range of the last 4, 8 or 13 cycles (remembered); a banner with plain-language headlines (plan finished vs the cycle before, top skip reason, most-skipped area, the weekday most skips happen) and how many cycles are in so far. Cycles: plan finished per cycle (current one lighter), focus hours and XP per week (with level). Where it goes: tasks done by area in area colours; ritual rings (daily plan and shutdown by day, today counted once done; cycle reviews of ended cycles). Putting things off: skip reasons, most-skipped areas and goals, skips by weekday, stale tasks at each week's end (open tasks skipped 3+ times by then), average postponements before done and the share done without moving. Balance: area health, the Wheel of Life radar with last time dashed and "Rate now", focus share against importance share per area ("12 pts less time than it matters"). Mood and energy: tasks done and focus on days with each journal mood and energy level, after 7 rated days. Everything is computed on the device from synced data (`features/insights/model.ts`), so it works offline.<br>• **Charts:** hand-made (`components/insights/charts.tsx`): HTML bar charts (text stays its real size on any width), horizontal bars, rings and an SVG radar; each has an accessible summary and a screen-reader table; "Nothing yet" when all zero.<br>• **Area health** (AREA-3): green / amber / red with reasons, on the Areas page (dot and first reason), each area page (pill) and Insights. Goals with no health set use the suggested health, as goal cards do. "Quiet" counts from the last task done, or from when the area's oldest active goal began, so a new goal doesn't make its area look neglected.<br>• **Wheel of Life** (AREA-4): a step in the Quarterly Review (before "On to Q…"), and "Rate now" on Insights and the Areas page ("Wheel of Life" with 3+ areas). Starts from the last rating; rating again the same day replaces it; explains when there are no areas yet.<br>• **Coach:** `get_insights` (all of the above for the last N cycles, in words and numbers); the prompt says to name one or two patterns and suggest one small change.<br>• **Also fixed:** the area dialog closed before saving, so leaving the page at once could lose a new area; offline precache now includes the pages added since Phase 1 (calendar, coach, people, quarter, vision, year, journal, wins, insights, notifications, capture).<br>• **Tests:** 11 unit (`insights.test.ts`: range, cycle trend, focus and XP by week, done by area, ritual consistency, skip reasons/areas/goals/weekdays and headlines, postponements, stale trend, area health rules and the new-goal case, rating ids and carried-over scores, time vs values, mood and energy, server reference check, coach `get_insights` and same-day re-rating) and 3 browser (`insights.spec.ts`: sections and range kept after reload; rate the Wheel and reopen with the saved values; an overdue task makes its area "Needs attention" on the area page and Insights).<br>• **Fixed: signed out by a rate limit.** In full test runs the auth server sometimes answered the session check with 429, and a browser with no remembered user was sent to sign-in (the flaky "create a goal" and palette tests). Now only an explicit "no session" signs you out; a rate limit, server error or being offline retries for about 30 seconds first. The Quarterly Review test steps past the new Wheel step.<br>• **Full suite:** 214 unit; 117 browser passed, 31 skipped, none failed. |
| 2026-11-15 | 3B Career:<br>• **Data:** synced `skills` (name, category, level and target 1–5, target date, evidence, area, goal, archived), `learningItems` (title, kind, link, author, status, progress, notes, skill, started/finished) and `jobLeads` (company, role, link, location, stage, outcome, next step and date, salary, notes, applied/interviewed/closed times); tasks gain `skillId`; XP sources `learning` and `skill`; Dexie v15. The server checks skill links on tasks and learning items.<br>• **Skills** (`/skills`, sidebar "career" group): grouped by category, five dots for level now and aimed for, "→ Skilled by …", how many things to learn from and practice tasks. **Skill page** (`/skill?id=`): set the level by tapping a dot (each level gained earns 50 XP; lowering takes it back; the target follows a level above it), target and goal, what you're learning from (add from here, linked), practice tasks (Quick Add pre-linked), evidence. Archive or delete (links are cleared, nothing else goes). Levels are named: Aware, Beginner, Practising, Skilled, Expert.<br>• **Learning** (`/learning`): add by title and kind in one line (or with details), In progress (with a progress bar) / Up next / Done ("N finished this year"); Start and Done are one tap; the dialog edits everything including progress. Status and progress move together (reaching 100% finishes it; going back reopens it). Finishing earns XP: 30 for a book or course, 10 otherwise.<br>• **Job search** (`/jobs`, `G B`): a board (Researching → Applied → Interviewing → Offer → Closed) with drag on desktop, long-press on phones, keyboard, or the stage in the lead's dialog; dropping on Closed asks how it ended. Cards show role, location, next step and date (red when late). "Next steps due" lists today's and overdue steps. The header shows applied count, interview rate and offer rate (applied, interviewed and closed times are kept as a lead moves, so rates survive closing).<br>• **Reminders:** a lead's next step is pushed at Daily Plan time on its day (Settings → Notifications → Job search next steps; tapping opens the board).<br>• **Tasks:** a Skill picker in the task panel (once you have skills).<br>• **Coach:** `get_career` and the write tools `save_skill`, `save_learning_item` and `save_job_lead` (add or update; cards with View and undo); the prompt asks it to keep a dated next step on open leads and only raise a skill when they describe real growth.<br>• **Tests:** 8 unit (`career.test.ts`: skill defaults and groups, level XP up and down, deleting a skill unlinks; learning status/progress rules and XP; lead stage times, outcomes and reopening; rates and next steps due; job reminders and the setting; coach tools with undo) and 2 browser (`career.spec.ts`: skill with levels → learning item from the skill page → start and finish in the queue → listed with its level; lead with a next step due → dragged (desktop) or moved (phone) to Applied → closed as rejected).<br>• **Also:** the job board's drag wrapper has its own "Drag …" name, so each card is a single "Open …" button for screen readers; on phones the Learning page has one Add (the add row).<br>• **Full suite:** 222 unit; 121 browser passed, 31 skipped, none failed. |
