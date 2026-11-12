# Orbit — Product Requirements Document

| | |
|---|---|
| **Product** | Orbit — a life management system |
| **Version** | PRD v1.1 |
| **Date** | 2026-11-12 |
| **Owner** | Alameen (product owner, sole user for v1) |
| **Status** | Approved — Phase 1 built and deployed; two-cycle trial running ([phase plans](./phases/README.md)) |
| **Platforms** | Web app + installable PWA (iOS, Android, desktop) |
| **Repo** | Single Next.js repo at `orbit/orbit-app/` (the `orbit/` root folder is not a repo) |

---

## Table of contents

1. [Overview](#1-overview)
2. [Problem statement](#2-problem-statement)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Users](#4-users)
5. [Product principles](#5-product-principles)
6. [Core concepts and glossary](#6-core-concepts-and-glossary)
7. [Feature requirements](#7-feature-requirements)
8. [Accountability system](#8-accountability-system)
9. [Levels and XP](#9-levels-and-xp)
10. [AI coach](#10-ai-coach)
11. [Calendar integration](#11-calendar-integration)
12. [Notifications and reminders](#12-notifications-and-reminders)
13. [Quick capture](#13-quick-capture)
14. [PWA and offline](#14-pwa-and-offline)
15. [Information architecture and screens](#15-information-architecture-and-screens)
16. [Data model](#16-data-model)
17. [Technical architecture](#17-technical-architecture)
18. [Security and privacy](#18-security-and-privacy)
19. [Non-functional requirements](#19-non-functional-requirements)
20. [Success metrics](#20-success-metrics)
21. [Roadmap and phases](#21-roadmap-and-phases)
22. [Risks and mitigations](#22-risks-and-mitigations)
23. [Open questions](#23-open-questions)
24. [Decision log](#24-decision-log)

---

## 1. Overview

Orbit is to your life what Linear and Jira are to software projects: a fast, structured system for turning ambitions into plans and plans into done work. It organises everything around becoming the best version of yourself — career, relationships, finances, learning, health and anything else you choose — into **Areas**, **Goals**, **Milestones**, **Tasks** and two-week **Cycles**.

What makes Orbit different from a to-do app is that it is built specifically against **procrastination**: it makes starting easy (smallest next step, focus mode), makes finishing visible (cycles, levels, reviews), and holds you to account (no silent skipping, stale-task interventions, an AI coach that checks in and can act on your behalf).

**One-line pitch:** *Linear for your life, with a coach that won't let you drift.*

---

## 2. Problem statement

The owner has many things they want to do across multiple parts of life, but:

1. **No plan.** Ambitions live in their head as vague intentions ("get a better role", "be better with money") with no breakdown into concrete steps.
2. **Trouble starting.** Tasks feel too big, unclear, or uncomfortable, so they get postponed.
3. **Trouble finishing.** Work gets started and abandoned; nothing marks progress or closure.
4. **No accountability.** Nothing notices when a goal is quietly dropped, and nothing asks why.
5. **Fragmentation.** Calendar, notes, reminders and goals live in different tools that don't talk to each other.

Existing tools fall short: project tools (Linear/Jira) aren't designed for personal life; to-do apps (Todoist, Things) don't connect daily tasks to long-term goals; habit trackers are isolated; none actively fight procrastination.

---

## 3. Goals and non-goals

### 3.1 Product goals

| # | Goal | Measured by (see §20) |
|---|---|---|
| G1 | Every important ambition exists as a structured goal with a next action | % of active goals with ≥1 open task |
| G2 | Reduce procrastination on starting tasks | Median time from "planned for today" to "started" |
| G3 | Increase completion of committed work | Cycle completion rate |
| G4 | Make neglect visible and force a decision | Stale tasks resolved within 48h of flag |
| G5 | One place for life planning (tasks + calendar + people + reflection) | Weekly active days, review completion |
| G6 | An AI coach that removes planning friction | % of goals/plans created or refined via AI |

### 3.2 Non-goals (for now)

- Team/collaborative features (shared goals, assigning tasks to others).
- Full budgeting/expense tracking (Finance is an Area for goals and tasks, not a ledger).
- Native iOS/Android apps (PWA only).
- Health device integrations (Apple Health, wearables).
- Public profiles or social features.
- Monetisation/billing (but the data model is multi-user from day one — see §4.2).

---

## 4. Users

### 4.1 Primary user (v1): the owner

- Ambitious, many parallel interests, procrastinates on **starting** and **finishing**.
- Prefers a **prioritised list** over a rigid hour-by-hour schedule, but wants tasks placed into calendar time blocks.
- Wants **real accountability**, not gentle nudges.
- Motivated by **levels** (progression), not childish gamification.
- Has a **close circle** of relationships (~10–25 people) worth nurturing deliberately.
- Career focus: **grow skills and land a better role**.
- Uses Google Calendar and Apple Calendar.
- Uses the app on desktop browser and phone (installed PWA).

### 4.2 Future users

The app may open to others later. Therefore from v1:

- Every document is scoped by `userId`; no global/shared state.
- Auth supports multiple accounts (email/password + Google).
- No hard-coded owner assumptions in UI copy or logic.
- Onboarding flow exists (even if the owner is the only one who sees it).

---

## 5. Product principles

1. **Speed is a feature.** Every common action ≤ 2 interactions; ⌘K reaches everything; optimistic UI; works offline.
2. **Always a next step.** No goal without a task; no task too big to start in 2 minutes.
3. **Decide, don't drift.** The app never lets work silently rot — it forces a conscious choice (do, shrink, reschedule with reason, or drop).
4. **Less on the plate.** Today has at most 3 Must-dos. Cycles have a capacity. Saying no is a first-class action.
5. **Connect the small to the big.** Every task traces up to a goal, area and the life vision — you always see *why*.
6. **Honest, not punishing.** Accountability is firm but kind: "never miss twice", reasons not shame.
7. **AI as a teammate.** The coach can plan and act, but everything it does is visible, attributable and undoable.
8. **Calm, Apple-grade design.** Clean, restrained, legible, great in light and dark mode. (Design system to be defined using the Apple design skill — see §15.6.)

---

## 6. Core concepts and glossary

```
Vision (values, 1/5/10-year vision, yearly theme)
 └── Area            e.g. Career, Relationships, Finance, Learning
      └── Goal        an outcome with a target date + key results
           ├── Key Result   measurable indicator (number/percent/boolean)
           ├── Milestone    a checkpoint on the way
           └── Task         a concrete action (can have subtasks)
                 └── Subtask

Quarter    a 3-month horizon that goals are committed into (Q1–Q4)
Cycle      a 2-week (configurable) time box that tasks are committed into
Inbox      unprocessed captures
Habit      recurring behaviour tracked by streak/consistency
Person     someone in your close circle (relationships CRM)
Time block a calendar event that reserves time for a task
Journal    daily reflection with mood/energy
```

| Term | Definition |
|---|---|
| **Area** | A domain of life. Default: Career, Relationships, Finance, Learning. User can add, rename, reorder, recolour, archive. |
| **Goal** | A desired outcome with a target date, status and optional key results. Analogous to a Linear *Project*. |
| **Key Result (KR)** | A measurable indicator of goal progress (e.g. "Applications sent: 0 → 20"). |
| **Milestone** | A dated checkpoint within a goal (e.g. "CV rewritten"). |
| **Task** | The unit of work. Analogous to a Linear *Issue*. |
| **Next step** | A ≤2-minute starter action attached to a task, to beat starting friction. |
| **Quarter** | A 3-month horizon (calendar quarters, e.g. Q1 = January–March) into which 3–5 goals are committed. Sits between the yearly vision and cycles: vision → quarter → cycle → today. |
| **Cycle** | A time box (default 14 days, starting Sunday) into which tasks are committed. Analogous to a Linear *Cycle*. |
| **Must-do** | One of max 3 tasks flagged as non-negotiable for today. |
| **Skip** | Moving a planned task out of today/cycle. Always requires a reason. |
| **Stale task** | A task postponed ≥3 times or untouched for ≥14 days while planned. |
| **XP / Level** | Progression earned through meaningful completion (see §9). |
| **Ritual** | Guided routines: Daily Plan, Daily Shutdown, Cycle Review; later Quarterly Plan and Quarterly Review. |

---

## 7. Feature requirements

Priority key: **P0** = required for MVP (Phase 1), **P1** = Phase 2, **P2** = Phase 3+. Feature IDs are referenced in the roadmap.

### 7.1 Onboarding & Vision

| ID | Requirement | Priority |
|---|---|---|
| ONB-1 | Sign up / sign in with email + password or Google. | P0 |
| ONB-2 | Onboarding wizard: choose areas (defaults pre-selected: Career, Relationships, Finance, Learning), set week start (default Sunday), cycle length (default 14 days), timezone, working hours. | P0 |
| ONB-3 | Prompt to create the first goal in at least one area, with AI-assisted breakdown when AI is enabled. | P0 (manual) / P1 (AI) |
| VIS-1 | Vision page: core values (list), 1-year / 5-year / 10-year vision (rich text), yearly theme (one phrase). | P1 |
| VIS-2 | Goals can link to values; the goal page shows "why this matters". | P1 |

**Acceptance:** A new user reaches a usable Today view in under 3 minutes with areas configured and at least one goal + task.

### 7.2 Areas

| ID | Requirement | Priority |
|---|---|---|
| AREA-1 | CRUD areas with name, icon, colour, description, order; archive (not hard delete) when it has content. | P0 |
| AREA-2 | Area overview page: active goals with progress, open tasks, habits, people (for Relationships), area level (§9). | P0 |
| AREA-3 | Area health indicator: derived from goal statuses, overdue/stale tasks and recent activity (Green / Amber / Red). | P1 |
| AREA-4 | Wheel of Life: periodic self-rating (1–10) per area, shown as a radar chart with history. | P2 |

### 7.3 Goals

| ID | Requirement | Priority |
|---|---|---|
| GOAL-1 | CRUD goals: title, description (rich text), area, target date, priority, status (`planned`, `active`, `paused`, `completed`, `dropped`). | P0 |
| GOAL-2 | Health: `on_track` / `at_risk` / `off_track` — set manually or suggested automatically from progress vs elapsed time. | P0 |
| GOAL-3 | Key results: type (`number`, `percent`, `boolean`), start, target, current, unit; manual check-in updates with optional note; history chart. | P0 |
| GOAL-4 | Milestones: title, due date, done flag, ordered; tasks can be attached to a milestone. | P0 |
| GOAL-5 | Progress = weighted from KRs if present, else task completion ratio (by effort points). | P0 |
| GOAL-6 | **Rule: an active goal must have ≥1 open task.** If not, it appears in the "Needs a next step" list and in the Daily Plan ritual. | P0 |
| GOAL-7 | Goal updates feed: status changes, KR check-ins, completions, AI actions, user notes (like a Linear project update). | P1 |
| GOAL-8 | Goals timeline view: Gantt-style roadmap of goals and milestones across the year, grouped by area. | P1 |
| GOAL-9 | Dropping a goal requires a short reason; dropped goals are archived and viewable. | P0 |

### 7.4 Tasks

| ID | Requirement | Priority |
|---|---|---|
| TASK-1 | CRUD tasks: title, description (markdown), area, goal (optional), milestone (optional), status, priority (`urgent`, `high`, `medium`, `low`, `none`), effort (points: 1, 2, 3, 5, 8), due date, scheduled date, cycle, tags/labels. | P0 |
| TASK-2 | Status workflow: `inbox` → `backlog` → `todo` → `in_progress` → `done` / `cancelled`. | P0 |
| TASK-3 | Subtasks (one level deep), checklist-style, with progress shown on parent. | P0 |
| TASK-4 | **Next step** field: a ≤2-minute starter action. Prompted when a task with effort ≥3 is planned for today. | P0 |
| TASK-5 | Recurring tasks (daily, weekdays, weekly on days, monthly, every N days; "after completion" or "fixed schedule"). | P0 |
| TASK-6 | Task history: every status change, reschedule (with reason), AI edits. | P0 |
| TASK-7 | Bulk actions: multi-select → set status/priority/cycle/date/area/goal, delete. | P1 |
| TASK-8 | Task links: "blocked by" / "blocks"; blocked tasks visually dimmed. | P2 |
| TASK-9 | Estimated vs actual focus time (from focus sessions). | P1 |
| TASK-10 | Unique short IDs per user for keyboard/search use (e.g. `ORB-142`). | P0 |

### 7.5 Inbox

| ID | Requirement | Priority |
|---|---|---|
| INB-1 | Quick-add anywhere (`C` shortcut / floating button on mobile) creates an inbox item with just a title. | P0 |
| INB-2 | Natural-language parsing in quick add: dates ("tomorrow 3pm", "next fri"), priority (`!1`–`!4`), area (`#career`), goal (`+goal-name`). | P0 |
| INB-3 | Inbox triage view: process items one by one → assign area/goal, convert to task/habit/journal note, schedule, or delete. Keyboard-driven. | P0 |
| INB-4 | Inbox badge count; Daily Plan ritual requires inbox zero or explicit "leave for later". | P0 |
| INB-5 | Captures from external sources (share sheet, email, iOS Shortcut, AI chat) land here — see §13. | P1 |

### 7.6 Cycles and quarters

| ID | Requirement | Priority |
|---|---|---|
| CYC-1 | Cycles auto-generate based on settings: length (default 14 days, editable 7–28) and start day (default Sunday). | P0 |
| CYC-2 | Cycle planning: pull tasks from backlog into the upcoming cycle; shows capacity (sum of effort points vs user's configured capacity, default 30 pts/cycle, learned over time). Over-capacity shows a warning and requires confirmation. | P0 |
| CYC-3 | Active cycle view: progress bar (points done / committed), burn-up chart, scope added mid-cycle shown distinctly. | P0 |
| CYC-4 | Cycle end: unfinished tasks roll over to the next cycle **only after** a per-task decision (roll over / back to backlog / cancel) with optional reason. | P0 |
| CYC-5 | Cycle Review ritual on the cycle's final Sunday (see RIT-3). | P0 |
| CYC-6 | Cycle history: past cycles with completion rate, points, focus hours, XP earned. | P1 |
| CYC-7 | Cycle themes/focus: optional "what this cycle is about" + 1–3 focus goals highlighted all cycle. | P1 |

**Quarters** (added 2026-11-12 at the owner's request): "these are the things I want to achieve in the next three months — let's plan it." A quarter is the layer between the yearly vision (VIS-1) and two-week cycles; it holds a few goals, and cycles carry out the work.

| ID | Requirement | Priority |
|---|---|---|
| QTR-1 | Quarters auto-generate as calendar quarters (Q1 = January–March). A Quarter page shows the quarter's theme, its committed goals with progress and health, overall progress against time elapsed ("on pace" / "behind"), the cycles inside it, and days left. | P1 |
| QTR-2 | **Quarterly Plan** ritual (~30 min, guided like RIT-3): look at the yearly theme and vision → review goals carried over → choose **3–5 quarterly goals** (existing or new), each with a target date inside the quarter and at least one key result → break each into monthly milestones → a capacity check (warns past 5 goals, or when the goals' estimated work exceeds the quarter's cycle capacity) → explicit commitment ("I commit to these N goals this quarter"). | P1 |
| QTR-3 | Quarters drive cycles: cycle planning shows the quarter's goals first and suggests their open tasks; a quarterly goal with no task in the upcoming cycle is flagged (like GOAL-6), and the cycle's focus goals (CYC-7) default to quarterly goals. | P1 |
| QTR-4 | **Quarterly Review** ritual at quarter end, alongside the last cycle review of the quarter: results per goal and key result → a decision per unfinished goal (completed / carry into next quarter / drop with a reason) → wins → reflection → plan the next quarter (QTR-2). Strictness applies as for cycles (§8.5): an unreviewed quarter blocks planning the next one (Firm: override with a reason). | P1 |
| QTR-5 | Year view: the yearly theme (VIS-1) and the four quarters with their goals and outcomes, linked to the goals timeline (GOAL-8). | P1 |
| QTR-6 | Pace checks: a quarterly goal whose progress trails elapsed time by more than 20 points is marked "behind" and surfaced in the Cycle Review's goal check-in. | P1 |

### 7.7 Today (daily execution)

| ID | Requirement | Priority |
|---|---|---|
| TODAY-1 | Today view shows: **Must-dos (max 3)**, then **Also today** (prioritised list), then **Habits due**, then **Calendar** (today's events + time blocks), then **Overdue** (requires action). | P0 |
| TODAY-2 | Hard cap: max 3 Must-dos; adding a 4th forces swapping one out. | P0 |
| TODAY-3 | Soft cap: total planned effort vs daily capacity (default 8 pts); warning when exceeded. | P0 |
| TODAY-4 | Each task row shows its next step, goal, area colour, effort, and a one-tap **Start** (enters focus mode). | P0 |
| TODAY-5 | Drag to reorder; order = priority. | P0 |
| TODAY-6 | Moving a task off Today triggers the **Skip flow** (§8.2). | P0 |
| TODAY-7 | "Tomorrow" and "This week" tabs for lookahead. | P1 |

### 7.8 Focus mode

| ID | Requirement | Priority |
|---|---|---|
| FOC-1 | Full-screen single-task view: title, next step, subtasks checklist, notes scratchpad, timer. | P0 |
| FOC-2 | Timer modes: Pomodoro (25/5, configurable), fixed duration, or open-ended stopwatch. | P0 |
| FOC-3 | **"Just 5 minutes" start**: default first session is 5 minutes, then prompts "keep going?" — designed for starting resistance. | P0 |
| FOC-4 | Sessions are logged (task, start, end, duration, completed/abandoned, interruption count). | P0 |
| FOC-5 | Ending a session asks: Done / Made progress (update next step) / Stuck (→ break down, optionally with AI). | P0 |
| FOC-6 | Timer survives page reload and works offline; shows in tab title; notification at end. | P0 |
| FOC-7 | Optional ambient sound / do-not-disturb reminder. | P2 |

### 7.9 Rituals

| ID | Requirement | Priority |
|---|---|---|
| RIT-1 | **Daily Plan** (morning, ~5 min, guided steps): review yesterday's unfinished → process inbox → review calendar → choose ≤3 Must-dos → confirm next steps → optional time-blocking → commit. | P0 |
| RIT-2 | **Daily Shutdown** (evening, ~3 min): mark what got done → decide on each unfinished task (Skip flow) → mood/energy rating → 1-line reflection → preview tomorrow. | P0 |
| RIT-3 | **Cycle Review** (Sunday at cycle end, ~20 min): cycle stats → per-task decisions on unfinished work → goal health check-in + KR updates → stale task cleanup → wins log → reflection prompts → plan next cycle. | P0 |
| RIT-4 | Rituals are reminded via push notification at configured times; incomplete rituals stay pinned at top of Today. | P0 |
| RIT-5 | Ritual streak tracked and XP-rewarded. | P0 |
| RIT-6 | AI can run rituals conversationally ("plan my day with me"). | P1 |
| RIT-7 | **Quarterly Plan** and **Quarterly Review** rituals (see QTR-2, QTR-4), with reminders and pinning like the other rituals. | P1 |

### 7.10 Habits & routines (light in v1)

| ID | Requirement | Priority |
|---|---|---|
| HAB-1 | CRUD habits: name, area, schedule (daily, specific days, X times per week), target (boolean or count, e.g. "read 20 pages"), reminder time. | P0 |
| HAB-2 | Check-in from Today view and habit list (tap to complete; long-press for count/note). | P0 |
| HAB-3 | Streaks with **"never miss twice"** rule: one miss keeps streak "at risk", two consecutive misses breaks it. | P0 |
| HAB-4 | Habit heatmap (GitHub-style) and consistency % over 30/90 days. | P1 |
| HAB-5 | Routines: ordered checklists (morning/evening) that can be run as a sequence. | P2 |
| HAB-6 | Habits can link to a goal (e.g. "apply to 2 jobs/week" → "Land a senior role"). | P1 |

### 7.11 Relationships (personal CRM)

| ID | Requirement | Priority |
|---|---|---|
| REL-1 | People: name, photo (optional), relationship type (family, friend, partner, mentor, colleague), how we met, notes, interests, important dates (birthday, anniversary, custom), contact links (phone, WhatsApp, email). | P1 |
| REL-2 | Contact cadence per person (weekly, every 2 weeks, monthly, quarterly, custom). | P1 |
| REL-3 | "Reach out" list: people overdue against cadence, sorted by overdue-ness; surfaces in Today (max 1–2 per day) and Daily Plan. | P1 |
| REL-4 | Interaction log: date, type (call, text, in-person, other), notes, follow-ups (→ creates task). | P1 |
| REL-5 | Gift ideas and "things to remember" lists per person. | P1 |
| REL-6 | Upcoming important dates reminders (7 days and 1 day before). | P1 |
| REL-7 | Relationship goals can link to people. | P1 |

### 7.12 Career & growth

| ID | Requirement | Priority |
|---|---|---|
| CAR-1 | **Wins log (brag doc)**: date, title, description, impact, area, links; quick-add from completed tasks ("log as win"). Exportable to markdown. | P1 |
| CAR-2 | **Skills tracker**: skill, category, current level (1–5), target level, target date, evidence notes; linked learning items and tasks. | P2 |
| CAR-3 | **Learning queue**: books, courses, articles, videos with status (queued, in progress, done), progress %, notes, linked skill. | P2 |
| CAR-4 | **Job search pipeline** (optional view): companies/roles with stages (researching → applied → interviewing → offer → closed), board view. | P2 |

### 7.13 Journal & reflection

| ID | Requirement | Priority |
|---|---|---|
| JRN-1 | Daily journal entry: free text (markdown), mood (1–5), energy (1–5), optional prompts. Mood/energy collected in Daily Shutdown. | P1 |
| JRN-2 | Prompt library (gratitude, what went well, what blocked me, etc.). | P1 |
| JRN-3 | Journal search and calendar view. | P2 |

### 7.14 Insights & analytics

| ID | Requirement | Priority |
|---|---|---|
| INS-1 | Dashboard: cycle completion rate trend, focus hours per week, tasks completed per area, ritual consistency, XP/level progress. | P1 |
| INS-2 | **Procrastination insights**: skip reasons breakdown, most-skipped areas/goals, day-of-week patterns, average postponements before completion, stale task count trend. | P1 |
| INS-3 | **Time vs values**: focus time by area vs areas the user rated most important. | P2 |
| INS-4 | Mood/energy correlations with completion. | P2 |

### 7.15 Search, command palette & keyboard

| ID | Requirement | Priority |
|---|---|---|
| CMD-1 | ⌘K / Ctrl+K command palette: navigate, search all entities, run actions (create task, start focus, open ritual, ask AI). | P0 |
| CMD-2 | Global search across tasks, goals, people, journal, wins (full text). | P0 |
| CMD-3 | Keyboard shortcuts (Linear-style), discoverable via `?`. See §15.4. | P0 |
| CMD-4 | Saved filters / custom views (e.g. "Career, high priority, not in cycle"). | P1 |

### 7.16 Views

| ID | Requirement | Priority |
|---|---|---|
| VIEW-1 | List view (grouped by status/priority/area/goal, sortable, filterable). | P0 |
| VIEW-2 | Board view (Kanban by status; drag to change status). | P0 |
| VIEW-3 | Calendar view (day/week/month) showing scheduled tasks, time blocks and external calendar events. | P1 |
| VIEW-4 | Timeline view for goals/milestones. | P1 |

### 7.17 Settings

| ID | Requirement | Priority |
|---|---|---|
| SET-1 | Profile, timezone, week start, cycle length, daily/cycle capacity, working hours. | P0 |
| SET-2 | Theme: system / light / dark. | P0 |
| SET-3 | Notifications: per-type toggles, ritual times, quiet hours. | P0 |
| SET-4 | Accountability strictness level (§8.5). | P0 |
| SET-5 | Connected accounts: Google, Google Calendar, Apple Calendar (CalDAV). | P1 |
| SET-6 | AI settings: enable/disable, autonomy level (§10.5), memory management. | P1 |
| SET-7 | Data export (JSON + markdown) and account deletion. | P1 |
| SET-8 | Personal API tokens (for iOS Shortcuts / integrations). | P1 |

---

## 8. Accountability system

Accountability is Orbit's core differentiator. The owner asked for **real accountability**, so the default strictness is **Firm**.

### 8.1 Rules

| Rule | Behaviour |
|---|---|
| **No silent skipping** | Any planned task moved off Today, out of a cycle, or past its due date requires a skip reason. |
| **Stale task intervention** | A task postponed ≥3 times, or planned but untouched ≥14 days, is flagged **Stale**. Stale tasks are pinned in Today and the next ritual until resolved via one of: *Break it down* · *Do 5 minutes now* · *Reschedule with commitment* · *Delegate/ask for help (note)* · *Drop it*. |
| **Goals need a next step** | Active goals with no open task are surfaced daily until one is added or the goal is paused/dropped. |
| **Overdue requires action** | Overdue tasks cannot just sit there; the Overdue section asks for a decision per task. |
| **Rituals stay pending** | A missed Daily Shutdown appears at the start of the next Daily Plan; a missed Cycle Review blocks starting the next cycle's planning (can be overridden with a reason). |
| **Commitments** | When planning a cycle, the user commits explicitly ("I commit to these 9 tasks"). Commitment rate is tracked. |
| **Never miss twice** | Habits and rituals: one miss is a warning, two consecutive misses triggers an AI/coach check-in. |
| **Weekly accountability report** | Sunday summary: committed vs done, skips and reasons, stale items, rituals done, XP earned. |

### 8.2 Skip flow

When a planned task is moved, the user picks a reason (one tap) and an action:

**Reasons:** `Too big` · `Unclear what to do` · `No time` · `Low energy` · `Waiting on something` · `Avoiding it` · `Not important anymore` · `Other (text)`

**Smart follow-ups by reason:**

| Reason | Orbit suggests |
|---|---|
| Too big | Break into subtasks / reduce scope (AI can do it) |
| Unclear | Write the next step / ask AI to clarify |
| No time | Pick a new date with a time block |
| Low energy | Move to a high-energy slot, or do the 5-minute version |
| Waiting | Set status `blocked` with follow-up date |
| Avoiding it | Start a 5-minute focus session now, or talk it through with the coach |
| Not important | Cancel the task (and, if it's the last task of a goal, ask about the goal) |

Every skip is stored (`taskId`, `reason`, `fromDate`, `toDate`, `timestamp`) and feeds Insights (INS-2) and the AI coach.

### 8.3 Accountability score

A rolling 14-day score (0–100) combining: commitment completion rate (40%), rituals completed (25%), stale items resolved promptly (15%), habit consistency (20%). Shown on the dashboard and in the weekly report. Not punitive — it is a mirror.

### 8.4 Coach check-ins

When the AI is enabled, it performs proactive check-ins triggered by: two consecutive missed rituals, a task skipped for "avoiding it" ≥2 times, a goal going `off_track`, or a cycle under 50% complete at its midpoint. Check-ins arrive as a push notification that opens a chat thread with context.

### 8.5 Strictness levels (setting)

| Level | Behaviour |
|---|---|
| Gentle | Reasons optional, no pinning, no blocking. |
| **Firm (default)** | Reasons required, stale/overdue pinned, missed rituals carried forward, coach check-ins on. |
| Strict | Firm + XP penalty for unresolved stale items, cycle planning blocked until review done (no override), daily shutdown required before seeing tomorrow. |

---

## 9. Levels and XP

The owner chose **levels** as the motivation layer. The system rewards *meaningful* progress, not busywork.

### 9.1 XP sources

| Action | XP |
|---|---|
| Complete a task | `10 × effort points` (1→10, 8→80) |
| Complete a Must-do | +50% bonus |
| Complete a task that was Stale | +100% bonus ("beat procrastination") |
| Focus session completed (per 25 min) | 15 |
| Daily Plan / Daily Shutdown completed | 20 each |
| Cycle Review completed | 100 |
| Habit check-in | 5 (+ streak multiplier up to 2× at 30 days) |
| Milestone completed | 100 |
| Goal completed | 500 (scaled by goal duration) |
| Key result check-in | 10 |
| Relationship interaction logged (when due) | 20 |
| Win logged | 15 |

**Anti-gaming:** XP for tasks is granted on completion only once (uncomplete → XP removed); tasks created and completed within 2 minutes earn 0 XP unless they are habits/recurring; daily XP from tasks is soft-capped at 3× the user's average.

### 9.2 Levels

- **Global level** with a gentle curve: XP required for level *n* = `100 × n^1.5` (rounded). Level 1→2 = 100 XP, 10→11 ≈ 3,160 XP.
- **Area levels**: each area accrues XP from activity in it, showing which parts of life are getting attention.
- Level titles (optional flavour): Spark → Drift → Orbit → Ascent → Momentum → Gravity → Constellation → …
- Level-up moment: a tasteful, brief celebration (haptic on mobile, subtle animation), never blocking.

### 9.3 Penalties

Only in **Strict** mode: unresolved stale tasks cost 5 XP/day (cannot drop below the current level's floor).

---

## 10. AI coach

The AI coach is a conversational assistant built on Claude that knows the user's goals, tasks, habits, people and history, and **can take actions in the app**.

### 10.1 Capabilities

| ID | Capability | Priority |
|---|---|---|
| AI-1 | **Chat** about life/progress with full app context ("How am I doing on my career goals?", "Why do I keep skipping finance tasks?"). | P1 |
| AI-2 | **Plan creation**: turn a vague ambition into a goal with KRs, milestones and tasks ("I want to become a senior engineer within a year"). | P1 |
| AI-3 | **Task breakdown**: split a task into subtasks + a 2-minute next step. | P1 |
| AI-4 | **Set reminders and schedule**: "remind me to call mum on Saturday at 5", "block 2 hours tomorrow morning for the CV". | P1 |
| AI-5 | **Cycle planning assistant**: proposes a cycle plan from goals, capacity and calendar availability. | P1 |
| AI-6 | **Ritual facilitator**: run Daily Plan / Shutdown / Cycle Review conversationally. | P1 |
| AI-7 | **Proactive check-ins** (§8.4) and weekly summaries with patterns. | P1 |
| AI-8 | **Quick capture parser**: messy text/voice → structured tasks into inbox. | P1 |
| AI-9 | **Memory**: persistent notes about the user (preferences, context, what works for them), viewable and editable by the user. | P1 |
| AI-10 | Voice input in chat (browser speech-to-text). | P2 |

### 10.2 Tools (actions the AI can take)

Implemented as Claude tool-use functions that call the same server-side service layer as the UI (no separate code path):

- `search` (tasks, goals, people, journal, wins), `get_overview` (today, cycle, goal health)
- `create_goal`, `update_goal`, `add_key_result`, `checkin_key_result`, `add_milestone`
- `create_task`, `update_task`, `complete_task`, `reschedule_task`, `break_down_task`
- `create_habit`, `update_habit`
- `create_reminder`, `cancel_reminder`
- `create_time_block`, `get_calendar_availability`
- `plan_cycle` (proposes and/or applies)
- `log_interaction`, `create_person`, `update_person`
- `log_win`, `create_journal_entry`
- `remember` / `forget` (AI memory)

### 10.3 Context strategy

- System prompt contains: user profile, values/vision, settings, current date/time/timezone, active cycle summary, today's plan, area health, and AI memory.
- Details are fetched on demand via tools (not dumped into context).
- Conversation history persisted per thread; long threads summarised.
- Prompt caching for the stable portion of the system prompt.

### 10.4 Models

- Default chat/planning model: **Claude Sonnet 5.5** (`claude-sonnet-5-5`).
- Lightweight tasks (quick-capture parsing, titles, summaries): **Claude Haiku 5.5** (`claude-haiku-5-5`).
- Model IDs live in config, not code, so they can be upgraded.
- API key stored server-side as an environment variable (owner's key). Usage tracked per user (tokens, cost estimate) for when the app opens to others.

### 10.5 Autonomy and safety

The owner chose to let the AI **act on its own**. To keep that safe:

| Requirement | Detail |
|---|---|
| **Autonomy setting** | `Suggest only` · `Act and tell me` (default) · `Act silently for low-risk actions`. |
| **Action log** | Every AI action is recorded in an AI Activity feed (what, when, why, which thread) and on the affected entity's history with an "AI" badge. |
| **Undo** | Every AI action is undoable for 30 days from the activity feed (stores before/after snapshots). |
| **Destructive actions** | Deleting anything, dropping goals, or bulk changes (>10 entities) always require explicit confirmation in chat, regardless of autonomy level. |
| **Proactive limits** | Background/proactive actions (outside a chat) are limited to: creating reminders, flagging, suggesting. They never delete or reschedule committed work without confirmation. |
| **Transparency** | The AI explains changes in plain language at the end of a turn ("I created 1 goal, 3 milestones and 8 tasks — view"). |
| **Data minimisation** | Only data needed for the request is sent to the API; journal content is sent only when relevant to the question or the user enables "AI can read journal". |

### 10.6 UX

- **Chat panel**: slides in from the right on desktop (⌘J), full screen on mobile; also standalone `/coach` page with thread list.
- Messages can render **action cards** (created task, proposed plan) with Accept / Edit / Undo buttons.
- Plan proposals render as a structured preview (goal → milestones → tasks) the user can edit before applying when in `Suggest only` mode.
- Streaming responses.

---

## 11. Calendar integration

### 11.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| CAL-1 | Connect **Google Calendar** via OAuth: read events from selected calendars; write time blocks to a dedicated "Orbit" calendar. Two-way: moving/deleting the block in Google updates Orbit. | P1 |
| CAL-2 | Connect **Apple (iCloud) Calendar** via CalDAV using the user's Apple ID email + an **app-specific password** (entered by the user on the settings page; stored encrypted). Read selected calendars; write time blocks to an "Orbit" calendar. | P1 |
| CAL-3 | **ICS subscription feed** (fallback / extra): a private, secret-token URL that any calendar app can subscribe to, showing time blocks and dated tasks (read-only, refreshes per the client's schedule). | P1 |
| CAL-4 | **Time blocking**: drag a task onto the calendar view or pick "Block time" → creates a time block (start, end, task link) synced to the chosen external calendar. | P1 |
| CAL-5 | **Availability-aware planning**: Daily Plan and AI use free/busy data to suggest when to do Must-dos and warn when the plan exceeds available hours. | P1 |
| CAL-6 | External events appear in Today's agenda and in the calendar view (read-only, colour-coded by source). | P1 |
| CAL-7 | Sync: Google via push notifications (watch channels) + periodic incremental sync (sync tokens); CalDAV via periodic polling (every 10–15 min) + on-demand refresh. | P1 |

### 11.2 Notes

- Apple does not offer a public OAuth calendar API; CalDAV with an app-specific password is the supported route. The setup screen will include step-by-step instructions for generating the app-specific password at appleid.apple.com.
- Conflicts: external calendar is the source of truth for event times; Orbit is the source of truth for task data.

---

## 12. Notifications and reminders

| ID | Requirement | Priority |
|---|---|---|
| NOT-1 | **Web Push** (VAPID) to installed PWA on iOS (16.4+, home-screen installed), Android and desktop browsers. | P0 |
| NOT-2 | Reminder types: task reminder (at time / X min before), due-date reminder, ritual reminders (Daily Plan, Shutdown, Cycle Review), habit reminders, focus session end, relationship reach-outs, important dates, coach check-ins, custom reminders (created manually or by AI). | P0 (core) / P1 (relationships, coach) |
| NOT-3 | Notification actions where supported: "Done", "Snooze 15 min", "Start focus". | P1 |
| NOT-4 | Quiet hours (default 22:00–07:00) and per-type toggles. | P0 |
| NOT-5 | In-app notification centre with history. | P1 |
| NOT-6 | Reminder delivery accuracy: within 1 minute of the scheduled time. | P0 |
| NOT-7 | Email fallback for the weekly report and critical reminders if push isn't enabled. | P2 |

**Scheduler:** a durable job scheduler (see §17.4) stores reminders as jobs with `fireAt`; a worker runs every minute and dispatches due notifications.

---

## 13. Quick capture

The owner asked whether outside-the-app capture is possible for a web app. **Yes, with some platform limits:**

| Method | Platforms | How | Priority |
|---|---|---|---|
| In-app quick add (`C`, floating `+`) | All | NL parsing (INB-2) | P0 |
| **PWA app shortcuts** (long-press icon → "New task", "Start focus", "Coach") | Android, desktop Chrome/Edge (iOS doesn't support manifest shortcuts) | Web App Manifest `shortcuts` | P0 |
| **Share target** (share a link/text from any app into Orbit's inbox) | Android, desktop Chromium (not iOS) | Web Share Target API | P1 |
| **iOS Shortcut** ("Add to Orbit" via Siri, share sheet, Back Tap, Action Button) | iOS / macOS | Shortcut calls Orbit's capture API with a personal API token (SET-8); we ship a downloadable shortcut + instructions | P1 |
| **Email to inbox** (forward emails to a private address) | All | Inbound email webhook (e.g. Postmark/Resend inbound) → inbox item | P2 |
| **AI chat capture** ("add these: …") | All | AI-8 | P1 |
| Home-screen widgets | — | **Not possible** for PWAs; iOS Shortcut widget is the closest substitute | — |

---

## 14. PWA and offline

The owner wants **full offline support**: create, edit and complete things without a connection, then sync.

### 14.1 PWA requirements

| ID | Requirement | Priority |
|---|---|---|
| PWA-1 | Web App Manifest: name, icons (all sizes incl. maskable + Apple touch icons), theme colours for light/dark, `display: standalone`, shortcuts. | P0 |
| PWA-2 | Service worker: precache the app shell and static assets; runtime caching for fonts/images; offline fallback page. | P0 |
| PWA-3 | Install prompts: custom "Install Orbit" UI on Android/desktop (`beforeinstallprompt`) and an instructional sheet on iOS ("Share → Add to Home Screen"). | P0 |
| PWA-4 | iOS polish: safe-area insets, status bar style, splash screens, no rubber-band glitches, standalone navigation (no browser chrome). | P0 |
| PWA-5 | Update flow: "New version available — Reload" toast. | P0 |
| PWA-6 | App badge (unread notifications / due count) via Badging API where supported. | P2 |

### 14.2 Offline architecture (local-first)

- **Local store**: IndexedDB (via Dexie) holds the user's working set — all non-archived areas, goals, milestones, KRs, tasks, habits, habit logs (90 days), people, cycles, settings, and recent journal entries.
- **Reads** come from the local store (instant UI); the server is the sync authority.
- **Writes** apply locally immediately and are appended to an **outbox** (mutation queue) with client-generated IDs (ULID), operation type, entity, changed fields and a client timestamp.
- **Sync engine**:
  - *Push*: outbox drained to `POST /api/sync/push` when online (batching, retries with backoff, idempotent by mutation ID).
  - *Pull*: `GET /api/sync/pull?since=<cursor>` returns changed documents since the last server cursor (based on a monotonically increasing `serverVersion` per user).
  - Triggers: app open, regain connectivity, visibility change, every 60s while active, after push.
- **Conflict resolution**: field-level last-writer-wins using per-field timestamps (`fieldUpdatedAt`); deletes are soft (tombstones) and win over edits. Rare conflicts are logged in a "sync conflicts" debug list.
- **Online-only features** (graceful degradation with clear UI): AI coach, calendar sync, push subscription changes, search over archived data, auth. Offline focus timers and habit check-ins work fully.
- **Multiple devices**: the same sync protocol keeps phone and desktop consistent.

**Acceptance:** In airplane mode the user can open the installed PWA, view Today, add/complete/reschedule tasks (with skip reasons), check in habits, and run a focus session; on reconnect all changes appear on another device within 10 seconds of syncing.

---

## 15. Information architecture and screens

### 15.1 Navigation

**Desktop:** left sidebar (collapsible) + main content + optional right panel (detail / AI chat).

```
Sidebar
├── Inbox (badge)
├── Today
├── Upcoming
├── Cycle (current)
├── ─────────
├── Goals
├── Habits
├── People
├── Calendar
├── ─────────
├── Areas
│   ├── Career
│   ├── Relationships
│   ├── Finance
│   └── Learning
├── ─────────
├── Insights
├── Coach
└── Settings / Profile (level badge)
```

**Mobile (PWA):** bottom tab bar — **Today · Cycle · + (capture) · Goals · More** — with Coach accessible from a header button and More containing Inbox, Habits, People, Calendar, Areas, Insights, Settings.

### 15.2 Screen inventory

| Screen | Purpose | Phase |
|---|---|---|
| Auth (sign in / sign up / reset) | Access | 1 |
| Onboarding wizard | First-run setup | 1 |
| Today | Daily execution | 1 |
| Inbox / Triage | Process captures | 1 |
| Upcoming | Next 14 days list | 1 |
| Cycle (active, planning, history) | Sprint management | 1 |
| Goals list + Goal detail | Goal management, KRs, milestones, tasks | 1 |
| Task detail (panel/sheet) | Edit task, subtasks, history | 1 |
| Focus mode | Single-task execution | 1 |
| Rituals (Plan, Shutdown, Review) | Guided flows | 1 |
| Habits list + Habit detail | Habit tracking | 1 |
| Areas list + Area overview | Domain overview | 1 |
| Command palette | Navigation/actions | 1 |
| Settings | Preferences | 1 |
| Profile / Levels | XP, level, area levels | 1 |
| Coach (chat + threads + AI activity) | AI | 2 |
| Calendar (day/week/month) | Time blocking | 2 |
| People list + Person detail | Relationships | 2 |
| Wins log | Career | 2 |
| Journal | Reflection | 2 |
| Insights dashboard | Analytics | 3 |
| Vision | Values and long-term vision | 2 |
| Goals timeline | Roadmap | 2 |
| Skills, Learning, Job pipeline | Career | 3 |
| Wheel of Life | Balance | 3 |

### 15.3 Key flows

1. **Capture → triage → plan → do:** quick add → inbox → assign goal/area → into cycle → onto Today as Must-do → Start → focus → done → XP.
2. **Ambition → plan (AI):** "I want X" in Coach → AI proposes goal + KRs + milestones + tasks → user accepts → tasks land in backlog → next cycle planning pulls them in.
3. **Avoidance loop break:** task skipped "avoiding it" twice → stale flag → pinned → user taps "Do 5 minutes now" → focus mode with 5-minute timer → progress → XP bonus.
4. **Cycle close:** Sunday reminder → Cycle Review → decide on leftovers → KR check-ins → reflection → plan next cycle with capacity → commit.

### 15.4 Keyboard shortcuts (desktop)

| Key | Action |
|---|---|
| `⌘K` | Command palette |
| `C` | Quick add task |
| `⌘J` | Toggle AI coach |
| `G` then `T` / `I` / `C` / `G` / `H` / `P` | Go to Today / Inbox / Cycle / Goals / Habits / People |
| `J` / `K` | Next / previous item |
| `Enter` | Open item |
| `X` | Select item |
| `S` | Change status |
| `P` | Change priority |
| `D` | Set date |
| `M` | Toggle Must-do |
| `F` | Start focus on selected task |
| `E` | Set effort |
| `⌘Enter` | Mark done |
| `?` | Shortcut cheat sheet |

### 15.5 Mobile interactions

- Swipe right on a task: complete. Swipe left: reschedule (→ skip flow).
- Long-press: context menu.
- Pull to refresh triggers sync.
- Haptics on completion and level-up (where supported).

### 15.6 Design direction

- The full design system lives in **[DESIGN.md](./DESIGN.md)** (based on the `apple-design` skill). Summary of the direction: calm, restrained, generous whitespace, system-like typography, clear hierarchy, subtle depth, purposeful motion, and first-class **light and dark mode** (following system by default).
- Each area has an accent colour used sparingly (dots, progress rings), never full backgrounds.
- Accessibility: WCAG 2.2 AA contrast, full keyboard support, visible focus states, respects `prefers-reduced-motion`, dynamic type-friendly layouts, 44pt minimum touch targets.

---

## 16. Data model

MongoDB (Atlas). All collections include: `_id` (ULID string generated client-side for offline creation), `userId`, `createdAt`, `updatedAt`, `deletedAt` (soft delete / tombstone), `serverVersion` (sync cursor), `fieldUpdatedAt` (map of field → timestamp, for conflict resolution) on synced collections.

### 16.1 Collections

```ts
// Auth (managed by the auth library)
users            { _id, email, name, image, emailVerified, createdAt }
accounts         { userId, provider, providerAccountId, ... }   // Google etc.
sessions         { userId, token, expiresAt, ... }

// Profile & settings
profiles         { userId, timezone, weekStartDay /*0=Sun*/, cycleLengthDays /*14*/,
                   dailyCapacityPts /*8*/, cycleCapacityPts /*30*/, workingHours,
                   theme, strictness /*'gentle'|'firm'|'strict'*/, ritualTimes,
                   quietHours, aiEnabled, aiAutonomy, onboardingCompletedAt,
                   xpTotal, level, nextTaskNumber }

vision           { userId, values: [{ id, name, description }], vision1y, vision5y,
                   vision10y, yearlyTheme, year }

areas            { userId, name, icon, color, description, order, archivedAt, xp, level }

goals            { userId, areaId, quarterId, title, description, status, health, priority,
                   startDate, targetDate, valueIds[], progress, completedAt,
                   droppedReason, order }

quarters         { userId, year, quarter /*1–4*/, startDate, endDate, theme,
                   committedGoalIds[], committedAt, planningOverride,
                   reviewCompletedAt, reflection }  /* deterministic id per year+quarter */

keyResults       { userId, goalId, title, type /*'number'|'percent'|'boolean'*/,
                   start, target, current, unit, order }
krCheckins       { userId, keyResultId, value, note, at }

milestones       { userId, goalId, title, dueDate, doneAt, order }

tasks            { userId, number /*ORB-142*/, title, description, status, priority,
                   effort, areaId, goalId, milestoneId, parentTaskId, cycleId,
                   dueDate, scheduledDate, isMustDo, mustDoDate, nextStep, tags[],
                   recurrence /*RRULE-like*/, recurrenceParentId, postponeCount,
                   staleSince, lastTouchedAt, completedAt, cancelledAt,
                   createdBy /*'user'|'ai'|'capture'*/, order }

taskEvents       { userId, taskId, type /*'status'|'reschedule'|'skip'|'edit'|'ai_edit'*/,
                   from, to, reason, reasonText, actor /*'user'|'ai'|'system'*/, at }

cycles           { userId, number, startDate, endDate, theme, focusGoalIds[],
                   committedTaskIds[], committedPts, completedPts, status
                   /*'upcoming'|'active'|'review'|'closed'*/, reviewCompletedAt,
                   reflection }

habits           { userId, areaId, goalId, name, schedule /*{type, days[], timesPerWeek}*/,
                   targetType /*'boolean'|'count'*/, targetCount, unit, reminderTime,
                   archivedAt, currentStreak, bestStreak, order }
habitLogs        { userId, habitId, date /*YYYY-MM-DD local*/, value, note }

focusSessions    { userId, taskId, mode, plannedMinutes, startedAt, endedAt,
                   actualMinutes, outcome /*'done'|'progress'|'stuck'|'abandoned'*/,
                   interruptions }

rituals          { userId, type /*'daily_plan'|'daily_shutdown'|'cycle_review'
                   |'quarterly_plan'|'quarterly_review'*/,
                   date, cycleId, quarterId, startedAt, completedAt, data /*answers, mood, energy*/ }

people           { userId, name, photoUrl, relationshipType, howWeMet, notes,
                   interests[], importantDates: [{label, date, remind}],
                   contact: {phone, email, whatsapp}, cadenceDays, lastInteractionAt,
                   nextDueAt, giftIdeas[], thingsToRemember[], archivedAt }
interactions     { userId, personId, type, date, notes, followUpTaskId }

wins             { userId, areaId, goalId, taskId, title, description, impact, date, links[] }
journalEntries   { userId, date, content, mood, energy, prompts[] }

// Phase 3
skills           { userId, name, category, currentLevel, targetLevel, targetDate, evidence }
learningItems    { userId, type, title, url, status, progress, skillId, notes }
jobApplications  { userId, company, role, stage, url, notes, appliedAt, nextStepAt }
wheelRatings     { userId, date, ratings: [{areaId, score}] }

// XP
xpEvents         { userId, source /*'task'|'focus'|'ritual'|...*/, sourceId, areaId,
                   amount, reason, at }   // ledger; totals derived + cached

// Notifications
pushSubscriptions{ userId, endpoint, keys, userAgent, createdAt }
reminders        { userId, kind, entityType, entityId, title, body, fireAt,
                   recurrence, status /*'scheduled'|'sent'|'cancelled'*/, createdBy }
notifications    { userId, kind, title, body, link, readAt, at }

// Calendar
calendarConnections { userId, provider /*'google'|'caldav'*/, credentialsEnc,
                      selectedCalendarIds[], orbitCalendarId, syncToken, lastSyncedAt,
                      status }
calendarEvents   { userId, connectionId, externalId, calendarId, title, start, end,
                   allDay, isOrbitBlock, taskId, etag }   // cache of external events
timeBlocks       { userId, taskId, start, end, connectionId, externalEventId, status }

// AI
aiThreads        { userId, title, summary, lastMessageAt }
aiMessages       { userId, threadId, role, content /*blocks incl. tool use*/, tokens, at }
aiActions        { userId, threadId, messageId, tool, input, entityType, entityId,
                   before, after, undoneAt, at }
aiMemories       { userId, content, source, createdAt }
aiUsage          { userId, date, model, inputTokens, outputTokens, cachedTokens }

// Integrations
apiTokens        { userId, name, tokenHash, scopes[], lastUsedAt, revokedAt }
syncMutations    { userId, mutationId, appliedAt }  // idempotency for offline push
```

### 16.2 Key indexes

- Every synced collection: `{ userId: 1, serverVersion: 1 }`, `{ userId: 1, deletedAt: 1 }`.
- `tasks`: `{ userId, status, scheduledDate }`, `{ userId, cycleId }`, `{ userId, goalId }`, `{ userId, number }` (unique), text index on `title`/`description`.
- `reminders`: `{ status: 1, fireAt: 1 }`.
- `habitLogs`: `{ userId, habitId, date }` (unique).
- `people`: `{ userId, nextDueAt }`.
- `aiMessages`: `{ threadId, at }`.

### 16.3 Data rules

- All dates for "day" semantics (Today, habit days, cycle days) are computed in the **user's timezone** and stored as `YYYY-MM-DD` strings; instants are UTC `Date`.
- Hard deletes only via account deletion or a 30-day tombstone purge job.

---

## 17. Technical architecture

### 17.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (latest stable, App Router) + **TypeScript** (strict) | Single repo, server components for shells, client components for interactive views |
| UI | Tailwind CSS + headless primitives (Radix UI) + custom components per the Apple design skill | `next-themes` for light/dark |
| Icons | SF Symbols-like set (e.g. Lucide) | Final choice with design system |
| Animation | Motion (Framer Motion) | Respect reduced motion |
| Database | **MongoDB Atlas** (hosted) | |
| Data access / validation | Official **MongoDB Node driver** + **Zod** schemas shared by client/server | Zod is the single source of truth for shapes; a generic sync layer is simpler without an ODM (see D14) |
| Auth | **Better Auth** (MongoDB adapter) — email/password + Google OAuth | Multi-user ready; email verification + password reset |
| Client data | **Dexie** (IndexedDB) local store + custom sync engine; **TanStack Query** for online-only data (AI, calendar) | Local-first |
| Service worker / PWA | **Serwist** (`@serwist/turbopack`) | Precache app shells, runtime caching, push handler, share target |
| Push | `web-push` with VAPID keys | |
| Jobs / scheduler | Vercel Cron (every minute) → `/api/cron/*` route handlers, with jobs stored in MongoDB (`reminders` etc.). Upgrade path: Inngest or QStash if needed | |
| AI | **Anthropic TypeScript SDK**, Claude Sonnet 5.5 + Haiku 5.5, tool use, streaming, prompt caching | Server-side only |
| Calendar | `googleapis` (Calendar v3) + `tsdav` (CalDAV for iCloud) + `ical-generator` (ICS feed) | |
| NL date parsing | `chrono-node` | |
| Charts | Recharts or Visx | Decide in design phase |
| Email | Resend (verification, password reset, weekly report) | |
| Testing | Vitest (unit), Playwright (E2E incl. offline + PWA), MongoDB Memory Server (integration) | |
| Lint/format | ESLint + Prettier | |
| Hosting | **Vercel** (app + cron) + **MongoDB Atlas** | |
| Monitoring | Sentry (errors) + Vercel Analytics | |

### 17.2 Repository structure (single repo)

```
orbit-app/
├── docs/                    # PRD, design system, ADRs
├── public/                  # icons, manifest assets, splash screens
├── src/
│   ├── app/
│   │   ├── (auth)/          # sign-in, sign-up, reset
│   │   ├── (app)/           # authenticated app: today, inbox, cycle, goals, ...
│   │   ├── api/
│   │   │   ├── auth/[...all]/
│   │   │   ├── sync/        # push, pull
│   │   │   ├── ai/          # chat (streaming), actions/undo
│   │   │   ├── calendar/    # oauth callbacks, webhooks, ics feed
│   │   │   ├── capture/     # external capture (API token)
│   │   │   ├── push/        # subscribe/unsubscribe
│   │   │   └── cron/        # reminders, stale detection, cycles, calendar sync
│   │   ├── manifest.ts
│   │   └── sw.ts            # service worker (Serwist)
│   ├── components/          # ui primitives + feature components
│   ├── features/            # per-domain: tasks, goals, cycles, habits, people, ai, ...
│   │   └── <domain>/        # schema.ts (zod), service.ts (server), hooks.ts (client), ui/
│   ├── lib/
│   │   ├── db/              # MongoDB client
│   │   ├── auth/
│   │   ├── sync/            # client sync engine + server sync handlers
│   │   ├── local-db/        # dexie schema
│   │   ├── ai/              # tools, prompts, context builder
│   │   ├── calendar/
│   │   ├── xp/              # XP rules engine
│   │   ├── accountability/  # stale detection, skip logic, score
│   │   └── dates/           # timezone-aware helpers
│   └── styles/
├── tests/                   # e2e (playwright)
└── package.json
```

### 17.3 Service layer rule

All business logic lives in `features/<domain>/service.ts` and is called by: (a) the sync push handler (applying client mutations), (b) route handlers / server actions, (c) AI tools, (d) cron jobs. This guarantees that UI, AI and background jobs behave identically and enforce the same rules (e.g. XP, accountability, validation). Shared rules (XP calc, stale detection, NL parsing) are pure functions usable on the client too, so offline behaviour matches the server.

### 17.4 Background jobs

| Job | Frequency | Purpose |
|---|---|---|
| `dispatch-reminders` | every 1 min | Send due push notifications |
| `detect-stale` | hourly | Flag stale tasks per user (in their timezone) |
| `cycle-rollover` | hourly | Activate/close cycles at the user's local midnight; create next cycle |
| `recurring-tasks` | hourly | Generate next instances of recurring tasks |
| `relationship-due` | daily (per user morning) | Compute reach-out list; birthday reminders |
| `calendar-sync` | every 10 min + webhooks | Sync Google/CalDAV |
| `coach-checkins` | hourly | Evaluate triggers (§8.4) and send check-ins |
| `weekly-report` | Sunday per user | Accountability report |
| `purge-tombstones` | daily | Hard delete >30-day tombstones |

---

## 18. Security and privacy

- All data scoped by `userId`, enforced in the service layer (every query includes `userId` from the session — never from client input).
- Passwords hashed (scrypt/argon2 via the auth library); rate limiting on auth endpoints.
- Google OAuth scopes requested incrementally: sign-in scopes at login; Calendar scopes only when connecting the calendar.
- Calendar credentials (Google refresh tokens, Apple app-specific passwords) **encrypted at rest** (AES-256-GCM with a key from environment variables).
- Personal API tokens stored as hashes; scoped (e.g. `capture:write`); revocable.
- ICS feed URLs use long random secrets; regenerable.
- HTTPS only; secure, HttpOnly, SameSite cookies; CSRF protection on mutations; strict CSP.
- AI: data sent to Anthropic only on user-initiated chat or enabled proactive features; journal access opt-in; AI memory fully viewable/deletable.
- Data export (JSON/markdown) and full account deletion (including external tokens revoked).
- Secrets only in environment variables; never committed.

---

## 19. Non-functional requirements

| Category | Requirement |
|---|---|
| Performance | Today view interactive < 1s on a mid-range phone from a warm start (local-first); task create/complete UI update < 50 ms; Lighthouse PWA + performance ≥ 90 |
| Offline | All P0 execution features work offline (§14.2) |
| Sync | Changes visible on a second online device ≤ 10 s after sync |
| Reliability | Reminders delivered within 1 min of `fireAt`; no data loss on sync failure (outbox persists) |
| Accessibility | WCAG 2.2 AA; keyboard-complete on desktop |
| Responsiveness | 320px → 2560px; mobile-first layouts for PWA |
| Browser support | Latest Safari (iOS/macOS), Chrome, Edge, Firefox (Firefox: no install prompt, otherwise full) |
| Timezones | Correct day boundaries in user's timezone, including DST changes and travel (timezone change prompt) |
| Observability | Errors to Sentry; structured logs for sync, cron and AI tool calls |
| Cost | Fits free/low tiers for one user: Vercel Hobby/Pro, Atlas free/M0→Flex, AI usage tracked |

---

## 20. Success metrics

Since Orbit exists to fight the owner's procrastination, success is measured by behaviour change, tracked in-app (Insights):

| Metric | Baseline | Target (after 8 weeks) |
|---|---|---|
| Cycle completion rate (committed pts done) | establish in cycles 1–2 | ≥ 70% |
| Must-do completion rate | establish | ≥ 80% |
| Median days from "planned" to "started" | establish | ↓ 50% |
| Tasks skipped for "avoiding it" per cycle | establish | ↓ 50% |
| Stale tasks resolved within 48h of flag | — | ≥ 80% |
| Daily Plan completed (days/week) | — | ≥ 5 |
| Cycle Reviews completed | — | 100% |
| Active goals with a next step | — | 100% |
| Focus hours per week | establish | ↑ 30% |
| Close-circle people contacted on cadence | — | ≥ 80% |
| Weekly active days | — | ≥ 6 |

---

## 21. Roadmap and phases

No fixed deadline; phases are ordered by value. Each phase (and each part of Phase 1) ends with a usable, deployed app.

The detailed plan for each phase — scope, data model changes, decisions, steps, tests and a build log — lives in its own document under [`docs/phases/`](./phases/README.md). This section only tracks scope and status.

| Phase | Scope (PRD IDs) | Exit criterion | Status |
|---|---|---|---|
| [0 — Foundation](./phases/phase-0.md) | Project, design system, auth, MongoDB, PWA, local-first sync, tests, deploy | Sign in on desktop and phone, install the PWA, offline changes sync | ✅ Complete (2026-11-12) |
| [1A — Plan the work](./phases/phase-1a.md) | ONB-2/3, AREA-1/2, GOAL-1–6, GOAL-9, TASK-1–6, TASK-10, INB-1–4, CMD-1–3, VIEW-1/2, SET-1 | Real areas, goals, milestones and tasks set up; inbox capture and triage, all offline | ✅ Deployed (2026-11-12) |
| [1B — Do the work, stop drifting](./phases/phase-1b.md) | TODAY-1–6, TASK-4, FOC-1–6, §8.1, §8.2, Upcoming, swipe gestures | A week run from Today; every postponement has a reason | ✅ Deployed (2026-11-12) |
| [1C — Cycles and rituals](./phases/phase-1c.md) | CYC-1–5, RIT-1–5, §8.1 (rituals), §8.5, SET-4 | One full cycle planned, run and reviewed | ✅ Deployed (2026-11-12) |
| [1D — Habits, levels and reminders](./phases/phase-1d.md) | HAB-1–3, §9, §8.3, weekly report, NOT-1/2/4/6, SET-3 | **Phase 1 exit:** two full cycles run in Orbit, with push reminders, habits and XP, offline on the phone | ✅ Deployed (2026-11-12) — trial running |
| [2 — Coach, calendar, people](./phases/phase-2.md) | AI-1–9, CAL-1–7, VIEW-3, REL-1–7, VIS-1/2, QTR-1–6, RIT-7, GOAL-7/8, CYC-6/7, CAR-1, JRN-1/2, quick capture, HAB-4/6, TASK-7, CMD-4, SET-5–8 | The coach builds a plan that lands in Orbit and the calendar; relationship reminders work | Planned |
| [3 — Insight and growth](./phases/phase-3.md) | INS-1–4, CAR-2–4, AREA-3/4, HAB-5, TASK-8, NOT-7, PWA-6, JRN-3, email capture | Insights reflect four cycles of real data | Planned |
| [4 — Opening up](./phases/phase-4.md) | Multi-user hardening, AI limits, billing, legal, admin | — | Optional |

PWA app shortcuts (Phase 1 in the original plan) shipped in Phase 0.

---

## 22. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Offline sync complexity (conflicts, bugs) | High | Build sync in Phase 0 before features; field-level LWW; idempotent mutations; extensive Playwright offline tests; keep the model simple (soft deletes, no cross-entity transactions offline) |
| iOS PWA limitations (push only when installed, no share target, storage eviction) | Medium | Install onboarding on iOS; iOS Shortcut for capture; request persistent storage (`navigator.storage.persist()`); server is source of truth |
| App becomes another thing to procrastinate on (too much setup) | High | Fast onboarding, sensible defaults, AI does setup, rituals capped in time |
| Accountability feels nagging → app abandonment | Medium | Strictness setting, kind copy, "never miss twice", quiet hours |
| AI acting wrongly with autonomy | Medium | Action log, undo, confirmation for destructive/bulk actions, proactive limits |
| Apple CalDAV fragility | Medium | ICS feed fallback; clear error states; polling with backoff |
| Vercel cron granularity / cold starts for reminders | Medium | The Hobby plan runs cron jobs at most once a day; reminders need a per-minute job. Decide in Phase 1D: Vercel Pro, or an external scheduler (e.g. Upstash QStash) calling the dispatch route |
| AI cost | Low | Haiku for light tasks, prompt caching, usage tracking/limits |
| MongoDB + sync cursor ordering | Medium | Per-user monotonically increasing `serverVersion` counter via atomic `$inc` on a counters doc |

---

## 23. Open questions

1. **Finance area scope** — goals/tasks only for now; any finance-specific features (savings goals with amounts, net-worth tracking)? *(Owner to add if remembered.)*
2. **Other life areas** — Health, Mind, Home etc. can be added anytime; should any be pre-created but hidden?
3. **Habit ideas** — no existing habits to import; do you want a starter habit library during onboarding?
4. **AI autonomy default** — PRD assumes `Act and tell me`; confirm.
5. ~~**Strictness default**~~ — built with `Firm` as the default (D26); changeable in Settings → Accountability.
6. ~~**Level titles**~~ — space-themed (D30).
7. ~~**Notifications**~~ — built with the proposed times (D26); editable in Settings.
8. **Domain** — will Orbit have a custom domain? Currently `orbit-app-three-beta.vercel.app`; a change means updating `BETTER_AUTH_URL` and the Google OAuth client.
9. ~~**Reminder scheduler**~~ — cron-job.org, free (D29).
10. **Quarter boundaries** — calendar quarters (Q1 = January–March), or 12-week blocks of 6 cycles so quarters and cycles line up exactly? *(Proposed: calendar quarters; the last cycle of a quarter can run a few days past its end. Needed by Phase 2.)*

---

## 24. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Web app + PWA, no native apps | Single codebase; owner preference |
| D2 | Next.js single repo | Owner preference |
| D3 | MongoDB Atlas | Owner preference |
| D4 | Email/password + Google login, multi-user-ready data model | May open to others later |
| D5 | Two-week cycles starting Sunday, configurable | Owner preference; Sunday is review day |
| D6 | Prioritised list for Today (not rigid schedule) + optional time blocks | Owner preference |
| D7 | Accountability default = Firm | Owner wants real accountability |
| D8 | Levels/XP as motivation layer | Owner preference |
| D9 | AI can act autonomously, with log + undo + confirmation for destructive ops | Owner wants AI to set things up; safety |
| D10 | Full offline via local-first IndexedDB + custom sync | Owner requires offline; Atlas Device Sync is deprecated, so a custom sync layer is used |
| D11 | Google Calendar via OAuth; Apple via CalDAV + app-specific password; ICS feed fallback | Apple has no public OAuth calendar API |
| D12 | Phase order: core + accountability → AI/calendar/people → insights/career | Owner accepted suggested v1 scope |
| D13 | Design system defined from the owner's Apple design skill → [DESIGN.md](./DESIGN.md) | Owner preference |
| D14 | MongoDB native driver + Zod instead of Mongoose | The sync layer writes every entity through one generic code path; an ODM adds a second schema to keep in step |
| D15 | App pages are static shells; the session is checked in the browser (`AuthGate`) and every API route re-checks it on the server | Lets the service worker cache whole pages so the installed app opens offline |
| D16 | Pull cursor re-reads the last 20 versions on every sync | A write that commits out of order can never be skipped; applying a doc twice is harmless |
| D17 | Phase 1 split into four deployable parts (1A–1D); each phase has its own plan in `docs/phases/` | Smaller, shippable steps; keeps the PRD as the product spec rather than a build diary |
| D18 | Accent colour: deepened teal (`#0E7C8F`) | Chosen over indigo and Apple blue in a side-by-side comparison; deepened for contrast (DESIGN.md §2.3) |
| D19 | Production on Vercel at `orbit-app-three-beta.vercel.app` with MongoDB Atlas | First deploy, 2026-11-12 |
| D20 | The service worker never caches `/api/*` responses | Offline data lives in IndexedDB; cached API responses were stale and could leak across accounts on a shared device |
| D21 | Task numbers are assigned by the server on first sync | Two offline devices can't safely pick the next number |
| D22 | Must-dos are stored per day (`mustDoDate`); an unfinished Must-do lands in Overdue the next day | Keeps the cap of 3 meaningful and forces a decision instead of silent carry-over (PRD §8.1) |
| D23 | Stale detection and the focus timer run on the device | Both work offline; the timer is derived from timestamps in local storage, so reloads don't stop it |
| D24 | A move counts as a skip (reason required at Firm strictness) only when the task was planned for today or earlier | Scheduling future or unplanned work stays friction-free |
| D25 | Cycles and rituals are generated on the device with deterministic ids; a cycle's state is derived from its dates and review, not stored | Works offline; two devices can't create duplicates or disagree on status |
| D26 | Strictness defaults to Firm (open question 5); ritual times default to 07:30 / 21:00 / 18:00 (part of open question 7) | The owner asked for real accountability; times are editable in Settings |
| D27 | Planning the next cycle is allowed on the review day itself; after that, an unreviewed cycle blocks it (Firm: override with a reason) | Planning the next cycle is the last step of the review |
| D28 | Add quarters (QTR-1–6, RIT-7) between the yearly vision and cycles, built in Phase 2 alongside the Vision page and goals timeline | Owner request: plan "the things I want to achieve in the next three months"; all three are about the long view |
| D29 | Reminders are dispatched by a free external scheduler (cron-job.org) calling a secret-protected route every minute; ritual and habit reminders are computed on the server each minute, one-off ones (focus ending) are scheduled by the device | Vercel Hobby crons run once a day; reminders must arrive even when the app hasn't been opened |
| D30 | Space-themed level titles (Spark → … → Cosmos) | Owner choice; fits Orbit's identity |
| D31 | XP entries are one per source and are zeroed, not deleted, on undo | Deletes win in sync, so a deleted entry could never be re-awarded |
