# Phase 2 — Coach, calendar, people

| | |
|---|---|
| **Status** | In progress — 2A built and deployed 2026-11-14 ([plan](./phase-2a.md)); 2B built 2026-11-14 ([plan](./phase-2b.md)), real-account check pending; 2C.1–2C.2 built 2026-11-14 ([plan](./phase-2c.md)), 2C.3 to do |
| **Depends on** | Phase 1 |
| **PRD** | §7.1 (VIS), §7.3 (GOAL-7/8), §7.6 (CYC-6/7, QTR-1–6), §7.9 (RIT-7), §7.11, §7.12 (CAR-1), §7.13, §10, §11, §13 |

## Goal

Remove the friction of planning and connect Orbit to the rest of your life: an AI coach that can build plans and act on them, your Google and Apple calendars, your close circle, and reflection.

**Exit criterion:** ask the coach to build a plan and it appears in Orbit and in your calendar; relationship reminders arrive on your phone.

## Parts

| Part | Scope (PRD IDs) |
|---|---|
| **[2A — AI coach](./phase-2a.md)** | AI-1 – AI-9: chat with app context, plan creation, task breakdown, reminders and scheduling by request, cycle planning assistant, ritual facilitation, proactive check-ins (§8.4), quick-capture parsing, memory; autonomy setting, action log and undo (§10.5); AI onboarding (ONB-3) |
| **[2B — Calendar](./phase-2b.md)** | CAL-1 – CAL-7: Google Calendar (OAuth, two-way), Apple via CalDAV with an app-specific password, private ICS feed, time blocking, availability-aware planning; calendar view (VIEW-3) |
| **[2C — People](./phase-2c.md)** | REL-1 – REL-7: people, contact cadence, reach-out list, interaction log, gift ideas, important dates |
| **2D — Reflection and capture** | VIS-1/2 vision and values, **QTR-1–6 and RIT-7 quarters** (quarterly goals, Quarterly Plan and Review rituals, year view, pace checks), GOAL-7/8 goal updates and timeline, CYC-6/7 cycle history and themes, CAR-1 wins log, JRN-1/2 journal; quick capture via share target, iOS Shortcut and personal API tokens (SET-8); HAB-4/6, TASK-7, CMD-4, notification centre and actions, SET-5 – SET-7 |

## Known decisions and risks to work through

- **Quarters (added 2026-11-12):** build them with the Vision page and goals timeline — they share the year view. Settle PRD §23 question 10 first (calendar quarters vs 12-week blocks). Reuse the cycle machinery from 1C: deterministic ids generated on the device, the planner's capacity and commitment step, the ritual framework, and the strictness gate.

- **AI cost and model choice:** Sonnet for chat/planning, Haiku for parsing; prompt caching; per-user usage tracking.
- **AI on Vercel:** streaming responses and tool loops must fit Vercel function time limits.
- **Google Calendar scopes need Google's app verification** before anyone other than test users can connect; plan time for it.
- **Apple Calendar via CalDAV** is fragile; the ICS feed is the fallback.
- **Every AI action goes through the same service layer as the UI**, with before/after snapshots for undo.

## Build log

| Date | What |
|---|---|
| | |
