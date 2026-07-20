# CLAUDE.md

Context for AI agents working in this repo. Single-maintainer hobby project for a
Roblox mall Discord community — no external deployers, so skip deployment docs.

## What the app is

Verified Discord members browse mall stores. Store owners upload `.rbxl` files;
a game owner (admin) reviews and publishes them. Vacant stores run elections
where members apply and vote. Every notification is a Discord DM sent through a
separate bot repo (`mylebot`).

## Stack & layout

```
frontend/  React 18 + Vite + Mantine 7 + React Query + axios (SPA)
backend/   Fastify 5 + Prisma 7 + PostgreSQL, Zod validation, JWT cookie session
compose.yml  web (Caddy) + api + db
```

| Path | What |
| --- | --- |
| `backend/src/routes/` | `auth`, `stores`, `admin`, `elections`, `applications`, `settings`, `debug` |
| `backend/src/services/` | `store-service`, `election-service`, `file-storage`, `notifier`, `room`, `roblox-identity` |
| `backend/src/config.ts` | All env vars, parsed and validated in one place |
| `backend/prisma/schema.prisma` | Data model |
| `backend/prisma/migrations/` | Versioned SQL, applied on deploy |
| `frontend/src/pages/` | Landing, Stores, StoreDetail, Applications, Admin, Settings |
| `frontend/src/components/` | Cards, upload dropzone, tables, modals, RoomDiagram |

## Commands

```powershell
cd backend;  npm run dev; npm run typecheck; npm run db:migrate; npm run seed
cd frontend; npm run dev; npm run typecheck
```

There is no test suite. `npm run typecheck` in both packages is the check to run
after changes.

## Domain rules worth knowing before editing

**Submission lifecycle.** Upload → `PENDING` → admin `approves` / `declines`
(with reason) / `publishes`. Publishing replaces the prior live version and
updates the store identifier to that version. Owner-facing status is *derived*
from the latest submission, not stored separately: `Waiting for review` →
`Approved — waiting to be published` → `Live in game` (or `Declined` / `Closed`).

**Store identifier** is generated at store creation from code + version +
creation date, e.g. `A1.001.230425`; uploaded versions increment automatically.

**Roles.**
- *Game owner* — Discord ID listed in `ADMIN_DISCORD_IDS`. Full access.
- *Store owner* — verified member assigned to ≥1 store. Manages own stores,
  downloads own live/template files.
- *Member* — verified, no store. Browses layouts and live-file details only; no
  downloads, no templates, no version history.

**Elections.**
- Only stores with status `ELECTION` accept applications.
- One application *total* per member while the record exists. Cancelling or
  losing does not free it up — only a game owner deleting the record does.
- One vote per member per election, undoable. An active applicant cannot vote in
  their own store's election, including for themselves.
- Selecting a candidate assigns the store and opens it automatically.

**Debug role preview.** Game owners can act as another role via a signed session
override (`routes/debug.ts`). Registered only when `PUBLIC_BASE_URL` is
localhost — must never be reachable on the deployed site. Keep it that way.

## Conventions and gotchas

- **Migrations, never `db push`.** Edit `schema.prisma`, run `npm run db:migrate`
  against a *dev* database (it needs a shadow DB), commit
  `prisma/migrations/`. The API container runs `migrate deploy` at startup, so
  what ships is exactly the reviewed SQL. Production was baselined at `0_init`
  on 2026-07-20; don't regenerate or rewrite that migration.
- **Notifications are best-effort.** A failed DM is logged to the
  `NotificationLog` table and must never block or fail the store action. Adding
  one = a method in `services/notifier.ts` plus a call site.
- **Uploads** live on the `store_files` volume (`STORE_FILES_DIR`); the DB stores
  metadata only. Accepted: `.rbxl`, `.rbxlx`, up to `MAX_UPLOAD_BYTES` (250 MB).
- **Permission checks belong in the backend.** Hiding UI is not access control —
  every owner/admin route re-checks the role server-side.
- **Owner picker** comes from the bot (`BOT_NOTIFY_URL`): only Bloxlink-verified
  members sharing the bot's Discord server. Empty URL disables DMs *and* the
  picker — handle that path gracefully.
- Frontend server state goes through React Query; invalidate the relevant keys
  after mutations rather than refetching manually.
- The 11 initial stores (A1–A5 floor 1, B1–B6 floor 2; A4 closed, B4–B6
  elections) are seeded on first startup; after that stores are managed from the
  admin panel.
