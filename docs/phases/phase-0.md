# Phase 0 — Foundation

| | |
|---|---|
| **Status** | ✅ Complete — 2026-11-12 |
| **Commit** | `d441e86` |
| **Live** | https://orbit-app-three-beta.vercel.app |
| **PRD** | [§21 Roadmap](../PRD.md#21-roadmap-and-phases) |

## Goal

A deployed, installable app with the foundations every later phase builds on: design system, sign-in, database, offline-first data sync and tests. No product features beyond a basic task list to prove the sync loop.

**Exit criterion (met):** sign in on desktop and phone, install the PWA, and data created offline syncs once back online.

## What was built

| Area | Delivered | Where |
|---|---|---|
| App | Next.js 16 (App Router, Turbopack, Cache Components), TypeScript strict, pnpm | `next.config.ts` |
| Design system | Tokens (colour, type, spacing, radius, shadows, materials), light/dark, motion springs and helpers | `src/styles/tokens.css`, `src/app/globals.css`, `src/lib/motion/` |
| Components | Button, IconButton, Input/Field, Checkbox, ProgressRing, Pill, Kbd, Sheet (Vaul), Dialog/ConfirmDialog, Menu, Toast (with Undo), Segmented | `src/components/ui/`, gallery at `/dev/components` |
| App shell | Desktop sidebar + mobile tab bar, page header, sync indicator, empty states | `src/components/app/` |
| Auth | Better Auth with email/password and Google; client-side `AuthGate` with the last user cached for offline | `src/lib/auth/`, `src/components/app/auth-gate.tsx` |
| Database | MongoDB (Atlas in production) via the official driver, Zod validation | `src/lib/db/mongo.ts`, `src/lib/env.ts` |
| Offline sync | IndexedDB (Dexie) + outbox on the client; push/pull API with field-level last-writer-wins, idempotent mutations, tombstone deletes, per-user version cursor | `src/lib/sync/`, `src/lib/local-db/`, `src/app/api/sync/` |
| PWA | Manifest, icons, Serwist service worker, app shells precached, offline fallback page | `src/app/manifest.ts`, `src/app/sw.ts`, `src/app/serwist/` |
| Screens | Landing page (with illustrations), sign-in/up, Today (basic task list), Settings, placeholder Inbox/Cycle/Goals | `src/app/` |
| Tests | Vitest unit tests (sync server + client engine, in-memory MongoDB); Playwright e2e (auth redirect, landing, offline → online on desktop and phone) | `tests/` |
| Docs | PRD, design system, README | `docs/`, `README.md` |
| Deploy | Vercel + MongoDB Atlas + Google OAuth | — |

## Changes from the original plan

| Planned | Actual | Why |
|---|---|---|
| Mongoose + Zod | Official MongoDB driver + Zod | Sync writes every entity through one generic path; an ODM would be a second schema (PRD D14) |
| Server-checked sessions on pages | Static page shells + client `AuthGate`; API routes re-check | Lets the service worker cache whole pages for offline (D15) |
| Command palette and Quick Add in Phase 0 | Moved to Phase 1A | They need real screens around them |
| Indigo accent | Deepened teal `#0E7C8F` | Chosen after a side-by-side comparison (DESIGN.md §2.3) |
| — | Landing page at `/` | Added on request |

## Known issues (carried into Phase 1)

| Issue | Impact | Plan |
|---|---|---|
| ~~The offline e2e test occasionally fails~~ | — | **Fixed in Phase 1A** (three causes; see [phase-1a.md](./phase-1a.md#build-log)) |
| `next dev` sometimes misses edits to `globals.css` and keeps serving old styles | Dev only | Stop `pnpm dev`, delete `.next`, restart |
| Preview deployments can't sign in (only `BETTER_AUTH_URL` is trusted) | Previews only | Add trusted preview origins if previews are needed |
| Dev server on the LAN (`192.168.x.x:3000`) blocks dev assets and sign-in | Phone testing in dev only | Use the deployed site, or add `allowedDevOrigins` + trusted origins |

## Environment

| Variable | Where |
|---|---|
| `MONGODB_URI`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `.env.local` locally; Vercel project settings in production |
| `E2E_EMAIL`, `E2E_PASSWORD` | `.env.local` only (local test account) |

## Build log

| Date | What |
|---|---|
| 2026-11-12 | Scaffold, design tokens, components, auth, MongoDB, sync engine, PWA, tests |
| 2026-11-12 | Fixed: list didn't refresh after the first sync (local DB was being closed); sync reported "synced" before the last change uploaded |
| 2026-11-12 | Landing page, teal accent, illustrations; grain texture tried and removed |
| 2026-11-12 | First commit `d441e86` pushed; deployed to Vercel and verified (pages, manifest, service worker, 35 precached files, Google redirect URI) |
