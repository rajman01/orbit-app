# Phase 2D — Reflection and capture

| | |
|---|---|
| **Status** | 2D.1–2D.4 built 2026-11-15; 2D.5 to do |
| **Depends on** | 1C (cycles, rituals, strictness), 1D (push), 2A (coach), 2C (people) |
| **PRD** | §7.1 (VIS-1/2), §7.3 (GOAL-7/8), §7.6 (CYC-6/7, QTR-1–6), §7.9 (RIT-7), §7.10 (HAB-4/6), §7.13 (CAR-1), §7.14 (JRN-1/2), §7.4 (TASK-7), §7.15 (CMD-4), §7.16 (SET-5–8), §12 (NOT-3/5), §13 (quick capture) |
| **Design** | [DESIGN.md](../DESIGN.md): ritual flows, list rows, empty states, destructive dialogs ("Delete account") |

## Goal

Give Orbit the long view and a memory. You set a vision and values, plan each quarter around 3–5 goals and look back on it at the end. A journal, a wins log and goal updates record what happened. You can capture into Orbit from anywhere, and your data is yours to take or delete.

**Exit criterion (2D):**
- A Quarterly Plan for the rest of Q4 commits goals that then lead cycle planning.
- The year view shows them on a timeline.
- The evening Shutdown fills in the day's journal entry, and a completed task can be logged as a win.
- On the iPhone, "Add to Orbit" (iOS Shortcut) puts a task in the Inbox. On Android and desktop, sharing a link to Orbit does the same.
- Export downloads everything; Delete account removes it.

## Owner answers (2026-11-14)

1. **Order: the long view first.** Vision and quarters, then reflection, then capture and your data, then power tools.
2. **Plan Q4 now.** As soon as quarters exist, Orbit offers a short Quarterly Plan for the rest of the current quarter (about 7 weeks), so the late-December review has something to look back on. Q1 2027 then gets a full plan.
3. **One journal entry per day.** The Shutdown's mood, energy and one line fill in that day's entry. You can write more on the Journal page at any time, with optional prompts.
4. **Self-serve account deletion.** Settings → Delete account, confirmed by typing DELETE. Everything is removed from the server at once, and backups expire within 30 days. The privacy policy is updated to match.

## Already done in earlier phases

- **HAB-6:** habits link to a goal (1D).
- **CYC-7:** a cycle theme and 1–3 focus goals (1C). 2D makes the focus goals default to the quarter's goals.
- **SET-6:** autonomy setting, check-ins and memory management (2A).
- The Cycle page lists past cycles (1C). CYC-6 adds their stats.

## Scope

| PRD ID | Feature |
|---|---|
| VIS-1 | Vision page: core values (name and a line each); 1-, 5- and 10-year vision (markdown); a theme phrase for each year |
| VIS-2 | Goals link to values; the goal page shows "Why this matters" |
| QTR-1 | Calendar quarters (Q1 = January–March), generated on the device like cycles. The Quarter page shows the theme, the committed goals with progress and health, progress against time elapsed ("on pace" / "behind"), the cycles inside the quarter and days left |
| QTR-2 / RIT-7 | Quarterly Plan ritual: year theme and vision → goals carried over → choose 3–5 goals (existing or new), each with a target date in the quarter and at least one key result → monthly milestones → capacity check (warns above 5 goals, or when the goals' open work exceeds the quarter's cycle capacity) → commit. Mid-quarter it is shortened: 1–3 goals for the weeks left |
| QTR-3 | Cycle planning shows the quarter's goals first and suggests their open tasks. A quarterly goal with nothing in the coming cycle is flagged. Focus goals default to the quarter's goals |
| QTR-4 / RIT-7 | Quarterly Review on the quarter's last day, next to the last Cycle Review: results per goal and key result → a decision per unfinished goal (completed / carry over / drop with a reason) → wins → reflection → plan the next quarter. Strictness as for cycles: an unreviewed quarter blocks the next Quarterly Plan (Firm: override with a reason) |
| QTR-5 | Year view: the year's theme and the four quarters with their goals and outcomes |
| QTR-6 | Pace: a quarterly goal whose progress trails elapsed time by more than 20 points is "behind", shown on the Quarter page and in the Cycle Review's goal check-in |
| GOAL-8 | Goals timeline: a Gantt-style roadmap of goals (start → target) and milestones across the year, grouped by area, with quarter bands. It's part of the year view |
| GOAL-7 | Goal updates feed on the goal page: status and health changes, key result check-ins, completions, the coach's changes and your own notes, newest first |
| CYC-6 | Cycle history: each past cycle's completion rate, points, focus hours and XP |
| CAR-1 | Wins log: date, title, description, impact, area, goal, links. "Log as win" on completed tasks. Wins from Shutdowns and reviews become entries. Export to markdown |
| JRN-1/2 | Journal: one entry per day (markdown text, mood 1–5, energy 1–5, prompts). The Shutdown writes mood, energy and its line into it. A prompt library (gratitude, what went well, what got in the way…) |
| HAB-4 | Habit heatmap (GitHub-style) and consistency over 30 and 90 days, on each habit |
| SET-8 + §13 | Personal API tokens (create, name, revoke; only a hash is stored). Capture API: `POST /api/capture` with a token puts text in the Inbox, parsed like Quick Add. iOS Shortcut "Add to Orbit" with step-by-step setup. Web Share Target (Android, desktop Chromium): share text or a link → Inbox |
| SET-7 | Export: JSON of everything, plus markdown for goals, journal and wins. Delete account (self-serve) |
| SET-5 | Settings → Connected accounts: Google sign-in, Google Calendar, iCloud, with status and disconnect |
| TASK-7 | Bulk actions: select several tasks (checkbox mode, Shift-click, ⌘A) → status, priority, cycle, date, area, goal, delete |
| CMD-4 | Saved views: save the Tasks page's filters under a name; they show in the sidebar and the palette |
| NOT-5 | Notification centre: a history of what Orbit sent (bell in the sidebar and on Today on phones), with unread marks |
| NOT-3 | Notification actions where supported: habits get "Done"; reminders get "Snooze 15 min" |

**Not in 2D:** journal search and calendar view (JRN-3, Phase 3); email capture (Phase 3); insights (Phase 3).

## Decisions

1. **Quarters work like cycles.** They have deterministic ids made on the device (`q2026Q4`), so every device agrees without asking the server. The rituals reuse the 1C ritual framework, and the strictness gate is shared.
2. **A quarter commits goals, not tasks.** Its goals are a list on the quarter. A goal's pace is its progress (the same as everywhere: key results, else tasks) against the share of the quarter that has passed.
3. **The vision is one document per user**, like settings, with a theme per year. Values have ids so goals can link to them.
4. **Goal updates come from what's already recorded** (key result check-ins, the coach's actions), plus new `goalEvents` for status and health changes and your notes. Nothing is copied twice.
5. **One journal entry per day** with a deterministic id (`j20261114`), so the Shutdown and the Journal page edit the same entry from any device.
6. **API tokens are server-only.** Only a SHA-256 hash is stored, the token is shown once, and each has a name and a last-used time. The capture API writes through the same server sync path as devices (`applyMutations`), so captures sync like anything else.
7. **The notification centre is synced data written by the server** (`notifications`, read-only to devices except `readAt`), recorded as each push is sent.
8. **Delete account** removes every collection's documents for the user, their sessions, push subscriptions, calendar accounts (revoking Google), API tokens and the user. It's confirmed by typing DELETE.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `vision` | values[] (`{ id, name, description }`), oneYear, fiveYear, tenYear, themes[] (`{ year, theme }`) | Synced, one per user (deterministic id) |
| `goals` (extend) | valueIds[] | VIS-2 (a goal's quarter is the quarter's `goalIds`, kept in one place) |
| `quarters` | year, q, startDate, endDate, theme, goalIds[], committedAt, reviewCompletedAt, reflection, planningOverride | Synced, deterministic ids |
| `rituals` (extend) | type adds `quarterly_plan`, `quarterly_review`; quarterId | |
| `goalEvents` | goalId, type (`status` / `health` / `note`), from, to, text, actor, at | Synced |
| `wins` | date, title, description, impact, areaId, goalId, taskId, links[], source | Synced |
| `journalEntries` | date, text, mood, energy, prompts[] | Synced, one per day |
| `savedViews` | name, filters, order | Synced |
| `notifications` | title, body, url, tag, sentAt, readAt | Synced, written by the server |
| `apiTokens` | userId, name, hash, createdAt, lastUsedAt | **Server-only** |

## Steps

- [x] **2D.1 Vision and quarters:**
  - Vision page and values; goals ↔ values with "Why this matters".
  - Quarters entity, Quarter page, pace (QTR-6).
  - Quarters lead cycle planning (QTR-3).
  - The coach knows the quarter and the vision.
- [x] **2D.2 Quarterly rituals and the year:**
  - Quarterly Plan (including the shortened mid-quarter version for Q4) and Quarterly Review, with reminders, pinning and strictness.
  - Year view with the goals timeline (QTR-5, GOAL-8).
- [x] **2D.3 Reflection:**
  - Journal with prompts, fed by the Shutdown.
  - Wins log with "Log as win" and export to markdown.
  - Goal updates feed.
  - Cycle history stats.
  - Habit heatmap.
  - Coach tools for journal and wins.
- [x] **2D.4 Capture and your data:**
  - API tokens and the capture API; iOS Shortcut setup page.
  - Share target.
  - Connected accounts.
  - Export (JSON and markdown) and Delete account; privacy policy update.
- [ ] **2D.5 Power tools:**
  - Bulk actions.
  - Saved views.
  - Notification centre and notification actions.
- [ ] Tests, owner setup (the iOS Shortcut on your phone), deploy

## Tests

- **Unit:**
  - Quarter ids and dates, and which quarter a cycle belongs to.
  - Pace (on pace / behind at 20 points).
  - Quarterly capacity check; the strictness gate for quarters.
  - Journal entry ids and the Shutdown merge.
  - Wins from tasks.
  - Goal events on status and health changes.
  - Heatmap and consistency.
  - Token hashing, capture parsing and revoke.
  - Export completeness: every entity is included.
  - Account deletion: nothing left for the user, others untouched.
  - Notification records.
  - Bulk updates.
- **Browser:**
  - Vision page.
  - Quarterly Plan mid-quarter → Quarter page → cycle planning shows the quarter's goals.
  - Year view.
  - Shutdown → journal entry.
  - Log as win → wins page.
  - Capture with a token → Inbox on another device.
  - Share target page.
  - Export download.
  - Delete a throwaway account.
  - Bulk-select three tasks and move them.
  - Save a view.
  - Notification centre shows a sent reminder.
- **Manual (owner):**
  - The iOS Shortcut via Siri.
  - Sharing from an Android app (if you have one).

## Risks

- **Size:** this is the largest part of Phase 2, so each step is deployed on its own.
- **iOS Shortcut distribution:** a ready-made shortcut needs an iCloud link made on an Apple device. Orbit gives step-by-step instructions (about 6 actions) and you can share your own link afterwards.
- **Delete account is irreversible:** it needs typed confirmation, and export is offered first.

## Build log

| Date | What |
|---|---|
| 2026-11-14 | Plan written. Owner chose: long view first; plan Q4 now; one journal entry per day fed by the Shutdown; self-serve account deletion |
| 2026-11-14 | 2D.1 Vision and quarters:<br>• **Data:** synced `vision` (one per user: values with ids, 1/5/10-year text, a theme per year) and `quarters` (deterministic id per user and quarter, made on the first save in a single write; theme, `goalIds`, and fields for the 2D.2 rituals), Dexie v11. Goals gain `valueIds`. The server now checks every id in a list reference (`quarters.goalIds`).<br>• **Vision page** (`/vision`, `G V`): the year's theme, values (add, edit, remove; each lists the goals that serve it), 1-, 5- and 10-year vision.<br>• **Goal page:** "Why this matters" links values.<br>• **Quarter page** (`/quarter?q=2026-Q4`, `G Q`, previous/next): the year and its theme, the quarter's dates and days left, an editable theme, time gone against average progress with on pace / behind (20 points), and its goals with progress and pace or health, "Add a goal" and remove. More than 5 goals warns. Lists the cycles that start in the quarter.<br>• **Cycle planning (QTR-3):** focus goals default to the quarter's goals (marked Q4); backlog tasks for quarterly goals come first; a quarterly goal with nothing in the cycle is flagged with "Add" for its next open task.<br>• **Cycle Review (QTR-6):** behind quarterly goals are called out in the goal check-in.<br>• **Coach:** the year's theme and values go in each turn's context; `get_overview` includes the quarter (goals, progress, pace, days left); `get_cycle_plan` includes the quarter's goals and their tasks in the cycle; the prompt explains the long view.<br>• **Fixed while testing:** the Vision page briefly showed empty fields after loading (it re-read the vision instead of using what the page had).<br>• **Tests:** 5 unit (`quarters.test.ts`: dates, ids, keys, time gone, pace, cycles in a quarter, vision and theme saving, quarter goals and the coach's view, server ownership) and 2 browser (`long-view.spec.ts`: vision → value → goal serving it → quarter → flagged and added in cycle planning; moving between quarters).<br>• **Full suite:** 179 unit; 96 browser passed, 25 skipped. One unrelated task-panel test was flaky on the full run and passes on its own. |
| 2026-11-14 | 2D.2 Quarterly rituals and the year:<br>• **Ritual types:** `quarterly_plan` and `quarterly_review` (rituals gain `quarterId`; one per quarter, dated on its first and last day; XP 100 and 150).<br>• **When they're due** (`dueQuarterRituals`): the plan for the current quarter while it isn't committed and has at least 14 days left (a short plan once a third has gone); the next quarter's plan in the last week; the review on the last day from the review time, and every day after while undone, for a planned quarter. The cards are pinned on Today ("Plan Q4 2026 · A short plan for the weeks left").<br>• **Quarterly Plan:** the year's theme, 1-year vision and values → choose goals (3–5, or 1–3 when short), with goals already in the quarter marked "Carried over", and new goals added inline → a target date in the quarter and at least one key result each (required) → optional milestones for each month left → capacity check (the goals' open points against the cycles left × capacity, warning above the limit) → theme and an explicit "I commit to these N goals". Finishing sets missing or out-of-range target dates to the quarter's end and makes the goals active.<br>• **Strictness gate:** a planned quarter that ended without a review blocks planning the next (Firm: plan anyway with a reason; Strict: no; Gentle: never; review day itself never blocks).<br>• **Quarterly Review:** results per goal and key result → a decision on each unfinished goal (Done / Carry into the next quarter / Drop with a reason, applied at once and reversible while reviewing) → up to 3 wins (XP like the cycle review) → reflection (kept on the quarter) → "Finish and plan Q1 2027" opens the next quarter's plan with the carried goals chosen.<br>• **Quarter page:** Plan / Review buttons, "Committed 14 Nov · reviewed", and "Plan again".<br>• **Push** (with the cycle-review switch): "Plan Q1 2027" on a quarter's first day, "Q1 2027 starts in a week" six days before the end, "Review Q4 2026" on the last day.<br>• **Year view** (`/year?y=2026`, `G Y`, from the Vision page and the Quarter page's year link): the theme; four quarter cards (theme, goals with progress, done or dropped marks, Now and Reviewed tags); a goals timeline grouped by area, with bars from start to target filled to progress (dashed when there's no target date), milestones as diamonds, quarter lines and a today line. It scrolls sideways on phones.<br>• **Fixed while testing:** the key-result fields on the plan's grey cards were invisible (the shared input's background won), and inputs and Add buttons now have labels naming their goal.<br>• **Tests:** 4 more unit (due rules, short plan and plan-ahead, gate by strictness, months left, push timing) and 1 browser (short plan from Today with a new goal, key result and milestone → committed on the Quarter page and in the year view → clock moved to the last evening → review carries the goal → the next plan opens with it chosen).<br>• **Full suite:** 183 unit; 97 browser passed, 26 skipped. One focus test was flaky on the full run and passes on its own. |
| 2026-11-14 | 2D.3 Reflection:<br>• **Data:** synced `journalEntries` (one per day, `j20261114…`), `wins` and `goalEvents`, Dexie v12.<br>• **Journal** (`/journal`, `G J`, previous/next day): mood and energy chips, the day's page saved as you type (and when you leave), a prompt library (11 prompts in 5 groups) that adds the prompt as a heading, and earlier entries with an excerpt, mood and energy. The Shutdown writes mood and energy as you pick them, and adds its line to the day's page when it closes (once). The labels are shared.<br>• **Wins** (`/wins`, `G W`, palette "Log a win"): grouped by month; title, date, what happened, impact, links, area and goal; edit and delete; export to markdown (`wins-YYYY-MM-DD.md`). "Log as win" in a finished task's panel (once per task, then "In your wins"). Cycle and Quarterly Review wins become entries (one per line and ritual, updated rather than duplicated).<br>• **Goal updates** (on the goal page): post an update; status changes (complete, drop with reason, reopen, pause) and health changes are recorded by the goal actions. The feed merges these with key result check-ins, milestones reached and the coach's changes to the goal, newest first, marked "coach" where it acted.<br>• **Cycle history:** each past cycle shows completion, points done of total, focus hours and XP earned.<br>• **Habit history** (Habits page): an 18-week heatmap per habit (done, partly done, scheduled and missed; days before it started stay blank) with consistency over 30 and 90 days (weekly habits counted by finished weeks).<br>• **Coach:** `get_reflection` (journal and wins for up to 90 days), `log_win` and `add_goal_update` (write tools with cards and undo; "View" opens the goal); the prompt explains the journal, wins and updates.<br>• **Sidebar:** grouped into the day (Inbox to Tasks), planning (Goals, Cycle, Quarter, Vision, Habits, People) and looking back (Journal, Wins, Report, Levels).<br>• **Tests:** 6 unit (`reflection.test.ts`: journal ids and the Shutdown merge, wins from tasks and reviews without duplicates, markdown export, goal events, cycle stats, consistency and heatmap, coach tools with undo) and 3 browser (`reflection.spec.ts`: journal with a prompt → evening Shutdown → mood, energy and line in the entry; Log as win → wins page → export; goal update and health in the feed; habit history). The Shutdown test runs with Gentle strictness (restored afterwards) and a fixed evening clock. The Reach out test now runs at a fixed midday, so it doesn't break near midnight.<br>• **Full suite:** 189 unit; 100 browser passed, 27 skipped. The failures were those midnight-boundary tests (fixed) and one habit test timing out once waiting for sync (passes on its own). |
| 2026-11-15 | 2D.4 Capture and your data:<br>• **API tokens** (`src/lib/account/tokens.ts`, server-only `apiTokens`): `orb_` plus 32 random bytes, shown once; only the SHA-256 hash is stored, with name, prefix, created and last-used time; at most 10 per user; revoking works at once. Routes: `GET/POST /api/tokens`, `DELETE /api/tokens/[id]`.<br>• **Capture API:** `POST /api/capture` with `Authorization: Bearer orb_…`, taking JSON `{text, note}`, a form or plain text, at most 30 a minute (`captureRate`, TTL). The text is parsed like Quick Add (dates, `!1`–`!4`, `#area`, `+goal`) and lands in the Inbox unless it got a place or date (`createdBy: capture`). It's written with `applyMutations` with a `created` task event, so it syncs and is numbered like any task. The reply has a `message` for the Shortcut's notification.<br>• **Capture page** (`/capture`, from Settings → Connected and the palette): make, list and revoke tokens; step-by-step iOS Shortcut setup with the URL and header filled in and copy buttons; Android and desktop sharing; a curl example.<br>• **Share target:** the manifest's `share_target` (GET `/share` with title, text, url) opens a prefilled "Add to Orbit" form (the link goes in the notes) that adds to the Inbox.<br>• **Settings → Connected** (SET-5): sign-in methods (Google or email and password), connected calendars, and capture tokens.<br>• **Settings → Your data** (SET-7): Export everything (`/api/export?format=json`: every synced entity without deleted items or internal fields, plus the account's name and email) and a markdown export of vision, goals with key results, milestones and updates, journal and wins (`?format=md`).<br>• **Delete account…:** typed DELETE, with export offered first. On the server: calendar connections are disconnected (Google revoked), then every collection's documents for the user, and per-user ids (counters, usage) are removed, followed by sessions, sign-in methods and the user. The device's local database and cached user are cleared, then it goes to the landing page.<br>• **Privacy policy:** covers API tokens (hash only) and the self-serve export and deletion.<br>• **Tests:** 4 unit (`account.test.ts`: tokens shown once, hashed, used, revoked and limited; capture parsing, status, number and event; export contents and markdown; deletion removes all of one user and nothing of another) and 4 browser (`data.spec.ts`: token → capture by API with no cookies, as JSON and plain text → in the Inbox → revoked → 401; share target; JSON and markdown export downloads; a throwaway account deleted can't sign in again).<br>• **Full suite:** 193 unit; 108 browser passed, 30 skipped, none failed. |
