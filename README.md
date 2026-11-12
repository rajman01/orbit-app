# Orbit

A life management app — Linear for your life, built to beat procrastination.
See [docs/PRD.md](docs/PRD.md) for the product and [docs/DESIGN.md](docs/DESIGN.md) for the design system.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · MongoDB · Better Auth ·
Dexie (IndexedDB) local-first sync · Serwist (service worker) · Motion · Vitest · Playwright

## Getting started

Requirements: Node 22+, pnpm, and MongoDB (local `mongod` or an Atlas connection string).

```bash
cp .env.example .env.local   # then fill in BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm dev                     # http://localhost:3000
```

Google sign-in turns on automatically when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
(authorised redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (service worker disabled) |
| `pnpm build && pnpm start` | Production build — use this to test the PWA and offline mode |
| `pnpm test` | Unit tests (sync engine + server merge logic, in-memory MongoDB) |
| `pnpm test:e2e` | Browser tests incl. offline → online sync (desktop + phone) |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm icons` | Regenerate PWA icons |

Component gallery (all components in their states): `/dev/components`.

## How offline sync works

1. Every write goes to IndexedDB first and into an **outbox**, so the UI updates instantly — online or not.
2. The `SyncEngine` (`src/lib/sync/engine.ts`) pushes the outbox to `POST /api/sync/push`, then pulls
   changes from `GET /api/sync/pull?since=<cursor>`. It runs on load, on reconnect, when the tab becomes
   visible, every 60s, and shortly after each change.
3. The server (`src/lib/sync/server.ts`) merges with **field-level last-writer-wins**, ignores repeated
   mutations, treats deletes as tombstones that win, and gives every change a per-user version number.
4. The service worker precaches the app shell pages, so the installed app opens without a connection.

To add a synced entity: add its Zod schema to `src/lib/sync/entities.ts` and a table to
`src/lib/local-db/db.ts` (bump the Dexie version).
