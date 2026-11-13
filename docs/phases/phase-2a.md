# Phase 2A — AI coach

| | |
|---|---|
| **Status** | In progress — 2A.1 built 2026-11-14 |
| **Depends on** | Phase 1 (deployed; two-cycle trial still running alongside) |
| **PRD** | §10 (AI-1 – AI-9), §8.4, §10.5, ONB-3 |
| **Design** | [DESIGN.md](../DESIGN.md) §11.5 (parallel panel), Sparkles badge for AI-made things |

## Goal

A coach that knows your goals, tasks, habits and history and can act on them: turn an ambition into a plan, break work down, set reminders, help plan a cycle and run your rituals — every change visible, attributed and undoable.

**Exit criterion (2A):** ask the coach to build a plan for a real ambition; the goal, milestones and tasks appear in Orbit on every device, the summary card shows what changed, and Undo takes it all back. (The Phase 2 exit adds the calendar, after 2B.)

## Scope

| PRD ID | Feature | In 2A |
|---|---|---|
| AI-1 | Chat with app context | ✅ |
| AI-2 | Plan creation (goal → KRs → milestones → tasks) | ✅ |
| AI-3 | Task breakdown + 2-minute next step | ✅ |
| AI-4 | Reminders by request ("remind me to call mum Saturday at 5") | ✅ reminders · time blocks wait for the calendar (2B) |
| AI-5 | Cycle planning assistant | ✅ proposes from goals and capacity · calendar availability after 2B |
| AI-6 | Ritual facilitator (Daily Plan, Shutdown, Cycle Review) | ✅ |
| AI-7, §8.4 | Proactive check-ins and weekly summary | ✅ last step |
| AI-8 | Quick-capture parser (messy text → tasks) | ✅ |
| AI-9 | Memory the user can see and edit | ✅ |
| §10.5 | Autonomy setting, activity log, 30-day undo, confirmation for destructive/bulk changes | ✅ |
| ONB-3 | AI onboarding | ✅ |
| AI-10 | Voice input | ❌ P2, later |

**Not in 2A:** people, journal and wins tools (their entities arrive in 2C/2D; tools are added then) · time blocks and availability (2B).

## Decisions

1. **Owner answers (2026-11-13):** 2A first; default autonomy **Act and tell me**; quarters will be calendar quarters (PRD §23 Q10, for 2D).
2. **The coach's tools run on the device, through the same actions the UI uses.** The server route makes one Claude call per request and streams it; when Claude asks for a tool, the device runs it against its local database with `useActions()` (the service layer), then sends the result back for the next call. Why:
   - one code path for UI and AI (PRD §10.2), including XP, validation and task numbering;
   - changes are local-first, so they show instantly and sync to other devices like any edit;
   - each request is one model call, well within Vercel's function time limit (no long tool loops on the server);
   - reads (search, today, cycle) come from the local database: fast, and only what the tool returns is sent to the API (data minimisation, §10.5).
   The chat itself needs a connection; the coach says so when offline.
3. **Proactive check-ins run on the server** (they must work when the app is closed). They are limited by §10.5 to reminders, flags and suggestions, written with the same mutation path the sync server already applies.
4. **Models (PRD §10.4):** `claude-sonnet-5-5` for chat and planning, `claude-haiku-5-5` for quick-capture parsing, titles and summaries. Model ids live in config. Adaptive thinking; prompt caching on the stable system prompt and tool list; refusal fallback enabled.
5. **Undo:** every AI change is recorded as an `aiActions` entry with before/after snapshots of each document it touched. Undo writes the "before" back (or deletes what was created). Kept 30 days.
6. **Guardrails, whatever the autonomy:** deleting, dropping a goal, or touching more than 10 things in one go shows a confirm card in chat first. In `Suggest only`, every change is a card with Accept / Edit / Dismiss.
7. **Cost control:** the API key is server-side only. Usage (tokens, estimated cost) is logged per user in a server-only `aiUsage` collection, with a daily limit from an environment variable. Set a monthly spend limit in the Anthropic Console as a backstop.

## Data model

| Entity | Fields | Notes |
|---|---|---|
| `aiThreads` | title, lastMessageAt, archivedAt | Synced; title by Haiku after the first exchange |
| `aiMessages` | threadId, role, content (API content blocks), createdAt, actionIds | Synced; content size-capped. Long threads are summarised before sending |
| `aiActions` | threadId, tool, summary, changes [{entity, id, before, after}], at, undoneAt | Synced; the activity feed and undo source |
| `aiMemories` | text, source (`user` / `coach`), archivedAt | Synced; shown and editable in Settings → Coach |
| `settings` (extend) | aiAutonomy (`suggest` / `act_tell` / `act_silent`), aiCheckins (on/off) | Optional fields, older clients unaffected |
| `aiUsage` | userId, day, inputTokens, outputTokens, cacheReadTokens, costUsd | Server-only |
| Existing entities | `createdBy: "ai"` already on tasks; add optional `createdBy` where missing | Drives the Sparkles badge |

## Tools (first set)

Read: `search` (tasks, goals, habits), `get_overview` (today, current cycle, goal health, score), `get_goal`, `get_task`.
Write: `create_goal`, `update_goal`, `add_key_result`, `checkin_key_result`, `add_milestone`, `create_task`, `update_task`, `complete_task`, `reschedule_task`, `break_down_task`, `create_habit`, `update_habit`, `create_reminder`, `cancel_reminder`, `plan_cycle` (propose / apply), `remember`, `forget`.
Plan proposals (AI-2) use one `propose_plan` tool whose input is the whole goal → milestones → tasks tree, so the card can show it for editing before it's applied.

## Screens and components

| Screen / component | Notes |
|---|---|
| Coach panel | ⌘J; parallel panel on desktop (no scrim), full screen on phones; streaming replies |
| `/coach` page | Thread list, new thread, search |
| Action cards | "Created 1 goal, 3 milestones, 8 tasks — View · Undo"; plan preview with edit before apply; confirm cards |
| AI Activity | Settings → Coach: every AI change with Undo (30 days) |
| Memory | Settings → Coach: what the coach remembers, edit / delete |
| Entry points | "Break down" in the task panel, "Plan with coach" in Daily Plan, Shutdown, Cycle Review and the cycle planner, "Ask the coach" in quick add for messy text |
| Sparkles badge | On anything AI-made, for 24 h |

## Implementation steps

- [x] **2A.1 Chat foundation:** SDK, `/api/coach` streaming route (auth, usage log, daily limit), threads and messages, coach panel and `/coach`, system prompt with context and caching, read tools
- [ ] **2A.2 Acting safely:** write tools through `useActions()`, `aiActions` with snapshots, Undo, autonomy setting, confirm cards, activity feed, Sparkles badge
- [ ] **2A.3 Planning:** `propose_plan` with editable preview, break down a task, reminders by request, cycle planning assistant
- [ ] **2A.4 Rituals and capture:** coach-led Daily Plan / Shutdown / Review, quick-capture parsing (Haiku), memory screen, AI onboarding
- [ ] **2A.5 Proactive:** check-ins and weekly summary from the reminder job (§8.4), delivered by push into a "Check-ins" thread
- [ ] Tests, owner setup, deploy

## Tests

- **Unit:** tool input validation; snapshot and undo for each write tool; autonomy and guardrail rules (bulk > 10, deletes); context builder stays within budget; usage and daily limit.
- **E2E:** the Anthropic API is replaced by a scripted fake in tests (no real calls, no cost): chat streams a reply; a scripted plan creates goal + milestones + tasks that appear on a second device; Undo removes them; `Suggest only` shows a card and changes nothing until Accept; the offline message.
- **Manual (owner):** a few real conversations against the live model before calling 2A done.

## One-time setup (owner)

1. Create an API key at console.anthropic.com (add billing; set a monthly spend limit, e.g. $20).
2. Add `ANTHROPIC_API_KEY` to `.env.local` (local) and Vercel → Settings → Environment Variables, then redeploy.
3. Optional: `AI_DAILY_LIMIT_USD` (default 2).

## Build log

| Date | What |
|---|---|
| 2026-11-13 | Plan written; owner chose 2A first, Act and tell me, calendar quarters |
| 2026-11-14 | 2A.1 chat foundation: `@anthropic-ai/sdk`; `/api/coach` makes one streamed model call per request (newline-delimited events), with auth, a request size cap, per-user daily usage in server-only `aiUsage` and a daily limit (`AI_DAILY_LIMIT_USD`, default $2); Sonnet 5.5 with adaptive thinking (medium effort), prompt caching, refusal fallback and old thinking blocks dropped rather than failing. Synced `aiThreads`, `aiMessages` (kept verbatim, append-only) and `aiMemories`; settings `aiAutonomy`, `aiCheckins` (Dexie v6). Per-turn context (date, time, settings, memories) is a system message after each user message, so the system prompt and tools stay cached. Read tools run on the device: `get_overview`, `search`, `get_task`, `get_goal`, plus `remember` / `forget`. Coach panel (⌘J, parallel panel on desktop, full screen on phones), `/coach` page with conversations, Coach in the sidebar and More. Tests: 8 unit (`tests/unit/coach.test.ts`) and 3 browser (`tests/e2e/coach.spec.ts`) against a scripted fake model (`COACH_FAKE=1`), no API calls |
| 2026-11-14 | Full suite clean (61 passed, 13 skipped; 121 unit). Found while testing: (1) for a moment after a reply finished it showed twice (streamed draft + saved message); the draft now gives way to the saved reply. (2) Older date-based browser tests failed between midnight and 01:00 local time, because the test account is on UTC and the browser was on the machine's timezone; the test browser is now pinned to UTC |
