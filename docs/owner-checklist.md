# Owner checklist — what's left from Phases 1–3 and 5

Every planned build step in Phases 1–3 and 5 is done (as of 2026-11-18). What's left is setup only you can do, using Orbit for real so each phase's goal is met, and one feature that now has its domain. Tick items off here as you go; each links to the phase doc with the details.

## Do first: connect startorbit.app (about 30 minutes) — D53

- [ ] **Vercel → Settings → Domains:** add `startorbit.app` as the main domain and `www.startorbit.app` as a redirect to it.
- [ ] **At your domain provider (keep its nameservers):** add the A record for `startorbit.app` and the CNAME for `www` exactly as Vercel shows them. On Cloudflare, set both to *DNS only* (grey cloud). Wait for *Valid Configuration* in Vercel.
- [ ] **Vercel → Environment Variables:** set `BETTER_AUTH_URL` to `https://startorbit.app` (no `www`, no trailing slash), then redeploy.
- [ ] **Google Auth Platform → Branding:** add `startorbit.app` to Authorized domains; change the home page, privacy and terms links to `https://startorbit.app`, `/privacy` and `/terms`.
- [ ] **Google Auth Platform → Clients → your web client → Authorised redirect URIs:** add `https://startorbit.app/api/auth/callback/google`, `https://startorbit.app/api/calendar/google/callback` and `https://startorbit.app/api/people/google/callback`. Keep the old `vercel.app` ones until everything works.
- [ ] **cron-job.org:** change the reminders job's URL to `https://startorbit.app/api/cron/dispatch-reminders` and use *Test run* (expects `200`).
- [ ] **Check:** sign in with Google at `https://startorbit.app`, reconnect Google Calendar in Settings, then on the phone open `startorbit.app` in Safari, sign in and *Add to Home Screen*; delete the old icon once the new one works.

## Then: setup (about an hour in all)

- [ ] **Postmark (emails)** — [3E](./phases/phase-3.md)
  - [ ] Create a free Postmark account.
  - [ ] Add a Sender Signature for the address emails come from, and confirm it from your inbox.
  - [ ] Copy the server's API token.
  - [ ] In Vercel, add `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM` (e.g. `Orbit <you@example.com>`), then redeploy.
  - [ ] Check: the weekly report arrives on the last evening of your week.
- [ ] **Google Contacts** — [2C](./phases/phase-2c.md) (same Google Cloud project as sign-in and Calendar)
  - [ ] APIs & Services → Library → **People API** → Enable.
  - [ ] Google Auth Platform → Data access → add the `contacts.readonly` scope.
  - [ ] Google Auth Platform → Clients → your web client → add the redirect URI `https://startorbit.app/api/people/google/callback`.
  - [ ] Check: import a few real people, then get a birthday reminder on your phone.
- [ ] **iOS Shortcut "Add to Orbit"** — [2D](./phases/phase-2d.md): create an API token in Settings, then follow the Shortcut setup page in Orbit.
- [ ] **Finnhub (stock and ETF prices, optional)** — [5E](./phases/phase-5.md): create a free account at finnhub.io, copy the API key, add it in Vercel as `FINNHUB_API_KEY`, then redeploy. Crypto prices work without it.
- [ ] **Adzuna job source (optional)** — [3D](./phases/phase-3.md): add the `ADZUNA_*` keys in Vercel if you want more job listings.

## Phone checks (about 15 minutes)

- [ ] Notification buttons (Done, Snooze and the like) work from the phone's notification — [2D](./phases/phase-2d.md).
- [ ] The iOS Shortcut puts a task in the Inbox, including through Siri — [2D](./phases/phase-2d.md).
- [ ] After the next deploy, the installed app shows "A new version of Orbit is ready" with Reload while it's open (PWA-7) — [Phase 3 build log](./phases/phase-3.md).
- [ ] The app icon badge shows on the installed app — [3E](./phases/phase-3.md).
- [ ] **Voice input:** the mic works in the coach chat and the brain dump in the installed iPhone app. If it's unreliable there, ask for the fallback (transcribe on the server) — [3G](./phases/phase-3.md), D43.

## Real-account checks

- [ ] **Coach plan (2A):** ask the coach to plan a real ambition; the goal, milestones and tasks appear on every device; Undo takes it all back — [2A](./phases/phase-2a.md).
- [ ] **Calendars (2B):** connect Google and iCloud; today's events show on Today; block time for a task, drag it in Google Calendar and see it move in Orbit — [2B](./phases/phase-2b.md).
- [ ] **People (2C):** someone overdue shows on Today; log a call with a follow-up and the task appears — [2C](./phases/phase-2c.md).
- [ ] **Focused coach conversations (3H):** press Coach on a real goal, task, job lead and course; check the answers use that item's details, that what it creates lands on the item, and that the conversation is still there on your phone — [3H](./phases/phase-3.md).
- [ ] **Goal roadmap (3I):** give a real goal a target date and dated milestones (or ask the coach to plan it); check the roadmap on your phone and computer, and drag a stop to a new date — [3I](./phases/phase-3.md).
- [ ] **Phase 2 goal:** the coach builds a plan that shows in Orbit and your calendar, and relationship reminders arrive on your phone — [Phase 2](./phases/phase-2.md).

## Using it for real (the trial)

- [ ] **1A:** your real areas and at least three real goals, with milestones and tasks — [1A](./phases/phase-1a.md).
- [ ] **1B:** one week run from Today: reasons recorded for postponed tasks, at least one stale task cleared — [1B](./phases/phase-1b.md).
- [ ] **1C:** one full cycle end to end: plan and commit, daily plans and shutdowns, then a cycle review that decides every unfinished task — [1C](./phases/phase-1c.md).
- [ ] **1D — Phase 1 goal:** two full cycles with reminders on your phone, habits, focus sessions and XP, including offline — [1D](./phases/phase-1d.md).
- [ ] **Job assistant:** fill in your career profile, then send five real applications from the prepared packs; check the PDFs upload cleanly to employers' application forms — [3D](./phases/phase-3.md).
- [ ] **A real course:** plan a course or book to a finish date and follow it for a couple of weeks — [3F](./phases/phase-3.md).
- [ ] **Money (Phase 5):** check the currency in Settings, then a month of real use: add your expected income on the Plan tab, log spending as it happens (Log, Quick Add, the Shortcut), set two or three budgets, a savings pot tied to a real goal, your real debts with their rates and due days, and what you hold; ask the coach "where did my money go this month?" — [Phase 5](./phases/phase-5.md).
- [ ] **Phase 3 goal:** Insights reflect four cycles of real data (follows from the trial above) — [Phase 3](./phases/phase-3.md).

## Now possible with the domain

- [x] Buy a domain — `startorbit.app`, 2026-11-23 (D53).
- [ ] Move email from Postmark to Resend on `startorbit.app` and build **Email to Inbox** (forward an email to make a task) — [Phase 3, "Later"](./phases/phase-3.md), D42. Ask for it when you're ready; it needs a few DNS records added at your provider.

## Optional, not started

- [x] Landing page, next round — built 2026-11-16 ([landing-page.md](./phases/landing-page.md)).
- [ ] Phase 4, opening up — [phase-4.md](./phases/phase-4.md).
