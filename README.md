# My Lifts Mall — Store Owners Portal

A website where verified Roblox mall members browse stores, vote in vacant-store
elections, and manage their assigned stores. Store owners upload new `.rbxl`
files, download their current and template files, and track the review status
(waiting for review → approved → published to the game). The game owner reviews
submissions, runs elections, and publishes files. Everyone logs in with
**Discord**, and all notifications are delivered as **Discord DMs** through the companion bot
([`mylebot`](../mylebot)).

Built with **React + Mantine** (frontend), **Fastify + Prisma + PostgreSQL**
(backend), and **Docker**.

## How it works

1. A store owner logs in with Discord and opens their store.
2. They upload a new `.rbxl`. It becomes a **PENDING** version and:
   - the owner gets a "received" DM,
   - every game owner (admin) gets a "review needed" DM.
3. An admin downloads the file, then **approves**, **declines** (with a reason),
   or **publishes** it. Publishing replaces the prior live version and updates the
   store identifier to that live version. Each action DMs the owner.
4. **Published** becomes the store's current live file. Owners can always
   download their current file and any **template** you upload for rebuilding.
5. A store with **ELECTION** status accepts one application from each verified
   member (one application total across all election stores). Every verified
   member can vote once per election store. A game owner selects, marks not
   selected, or deletes applications from the dashboard. Selecting a candidate
   assigns the store and opens it automatically.

Store status shown to the owner is derived from their latest submission:
`Waiting for review` → `Approved — waiting to be published` → `Live in game`
(or `Declined`, or `Closed`).

## Architecture

```
frontend/  React + Vite + Mantine SPA         -> served by its container, proxies /api -> api
backend/   Fastify + Prisma + PostgreSQL API   -> Discord OAuth, stores, file upload/download
compose.yml  web (Caddy) + api + db (postgres) -> volumes: postgres_data, store_files
mylebot/   (separate repo) POST /internal/notify -> sends the Discord DMs
```

The 11 initial stores (A1, A2, A3, A4 *closed*, A5 on floor 1; B1, B2, B3 on floor 2;
B4, B5, B6 as *elections*)
are seeded on first startup. After that you create / edit / delete stores from the
admin panel. Uploaded files live on the `store_files` volume; the database stores
only metadata.

## Prerequisites

- Docker Engine with Docker Compose (for deployment), **or** Node.js 24 + a local
  PostgreSQL (for development).
- Your existing Discord application (the same one the bot uses).
- The bot (`mylebot`) running and reachable, for DM notifications and the verified
  store-owner picker.

## 1. Configure Discord OAuth

In the [Discord Developer Portal](https://discord.com/developers/applications) →
your application → **OAuth2**:

1. Under **Redirects**, add `http://localhost:8080/api/auth/callback`
   (and your production URL, e.g. `https://mall.example.com/api/auth/callback`).
2. Copy the **Client ID** and **Client Secret**.

The redirect URI, `PUBLIC_BASE_URL`, and the published `WEB_PORT` must all agree
on the same origin.

## 2. Configure the bot connection (optional but recommended)

In the `mylebot` repo, set `SITE_NOTIFY_SECRET` (≥ 16 chars) in its `.env` and
redeploy the bot. Then, in this repo's `.env`, set the **same** value as
`BOT_NOTIFY_SECRET` and point `BOT_NOTIFY_URL` at the bot's endpoint. If the bot
runs in Docker on the same host:

```
BOT_NOTIFY_URL=http://host.docker.internal:3000/internal/notify
BOT_NOTIFY_SECRET=<same as the bot's SITE_NOTIFY_SECRET>
```

Discord only allows DMs to users who **share a server with the bot** and have DMs
enabled. The bot connection also supplies the searchable owner list: it contains
only members with Bloxlink's **Verified** role who currently share the bot's Discord server. Leave
`BOT_NOTIFY_URL` empty to run without notifications or owner lookup.

## 3. Run with Docker

```powershell
Copy-Item .env.example .env      # then fill it in (see step 1 & 2)
docker compose up --build -d
docker compose ps
```

Open `http://localhost:8080`. Any Bloxlink-verified member of the bot's Discord
server can log in. Because your Discord ID is in `ADMIN_DISCORD_IDS`, you land on
the **Admin dashboard**. When creating or editing a store, choose its owner from
the searchable list of Bloxlink-verified members in the bot's Discord server. Use
the **Election** status for a vacant store; applications are managed from the
dashboard. The store identifier is generated when the store is
created from its code, version, and creation date (for example `A1.001.230425`);
uploaded versions continue counting up automatically.

Compose binds the site to `127.0.0.1:8080` by default; put a TLS-terminating
reverse proxy in front for public access and use `https://` URLs.

### Caddy path deployment

To serve the portal from `https://example.com/storeowners/`, set these stack
environment values in Portainer before the first build:

```
WEB_BIND_IP=127.0.0.1
WEB_PORT=8080
VITE_BASE_PATH=/storeowners/
PUBLIC_BASE_URL=https://example.com/storeowners
DISCORD_OAUTH_REDIRECT_URI=https://example.com/storeowners/api/auth/callback
```

Then proxy `/storeowners/*` through Caddy to `127.0.0.1:8080` while stripping
the `/storeowners` prefix. Add the exact OAuth callback URL in the Discord
Developer Portal as a redirect before attempting to sign in.

## 4. Local development (without Docker)

Backend:

```powershell
cd backend
npm install
Copy-Item .env.example .env      # point DATABASE_URL at a local Postgres, fill Discord vars
npm run db:migrate               # apply migrations (creates tables)
npm run seed                     # seed the 8 initial stores
npm run dev                      # http://localhost:3000
```

Frontend (in another terminal):

```powershell
cd frontend
npm install
npm run dev                      # http://localhost:8080, proxies /api -> :3000
```

Use `http://localhost:8080/api/auth/callback` as the Discord redirect URI so dev
and Docker share one configuration.

## Environment reference

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose PostgreSQL credentials. |
| `WEB_BIND_IP` / `WEB_PORT` | Host bind for the site (default `127.0.0.1:8080`). |
| `VITE_BASE_PATH` | Browser path prefix, `/` locally or `/storeowners/` behind Caddy. Set before building the frontend. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth2 credentials. |
| `DISCORD_OAUTH_REDIRECT_URI` | Must exactly match a redirect registered in Discord. |
| `PUBLIC_BASE_URL` | Browser-facing origin; used for post-login redirects and cookie security. |
| `ADMIN_DISCORD_IDS` | Comma-separated Discord user IDs with game-owner access. |
| `SESSION_SECRET` | Signing secret for the session cookie (≥ 16 chars). |
| `BOT_NOTIFY_URL` / `BOT_NOTIFY_SECRET` | Bot portal endpoint + shared secret. Empty URL disables DMs and owner lookup. |
| `MAX_UPLOAD_BYTES` | Max upload size (default 250 MB). Accepted types: `.rbxl`, `.rbxlx`. |
| `COOKIE_SECURE` | `auto` / `true` / `false`. `auto` = secure when `PUBLIC_BASE_URL` is https. |
| `STORE_FILES_DIR` | Where uploaded files are stored (Docker: `/data/store-files`). |

## Roles and election access

- **Game owner:** any Discord ID in `ADMIN_DISCORD_IDS`. Has all permissions:
  sees and manages all stores, files, templates, submissions, and applications.
- **Store owner:** a verified member assigned to one or more stores. They manage
  their own stores, can download their own live/template files, and can vote in
  every election other than one where they have an active application. Other
  stores use member-level access.
- **Member:** a Bloxlink-verified member with no assigned store. They can browse
  every store's layout and current-live-file details, but cannot download files,
  view templates, or view version history. They can vote in every election
  other than one where they have an active application.

Role-preview debug mode is available only when `PUBLIC_BASE_URL` uses
`localhost`, `127.0.0.1`, or IPv6 localhost. It is not registered or shown on
the deployed site.

### Election rules

- Only stores marked **ELECTION** accept applications.
- A verified member can submit one application total while its record exists.
  Cancelling or not being selected does not unlock another application; a game
  owner deleting the application record does. The member can still vote.
- Each verified member gets one vote per store election and can undo it to pick
  another candidate. An active applicant cannot vote for anyone in their own
  store's election, including themselves.
- Game owners can select a candidate (which opens and assigns the store), mark a
  candidate not selected, or delete an application and its votes. Deleting the
  record lets that user apply again. Applicants receive DMs when they apply, are
  selected, are not selected, or are removed.

### Debug role preview

A real game owner can open **Settings → Debug role preview** and temporarily act
as a Member, a Store owner for a selected store, or a Game owner. The signed
browser-session override changes both the UI and API permissions without changing
real store assignments. The picker remains available while previewing a lower
role, and **Stop debugging** restores normal Game owner access.

## Notifications

DMs are sent through the bot for: submission received (owner), review needed
(game owners), approved, declined (with reason), published (owner), application
received, selected, not selected, and removed. Adding a new notification is one
method in [`backend/src/services/notifier.ts`](backend/src/services/notifier.ts)
plus a call site. Delivery is best-effort — a failed DM is logged (see the
`NotificationLog` table) and never blocks the store action.

## Project layout

| Path | What |
| --- | --- |
| [`backend/src/routes/`](backend/src/routes/) | Auth, store/owner, and admin routes. |
| [`backend/src/services/`](backend/src/services/) | File storage, store logic, notifier. |
| [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) | Data model. |
| [`backend/prisma/migrations/`](backend/prisma/migrations/) | Versioned schema changes, applied on deploy. |
| [`frontend/src/pages/`](frontend/src/pages/) | Landing, Stores, Store detail, Admin. |
| [`frontend/src/components/`](frontend/src/components/) | Cards, upload dropzone, tables, modals. |
| [`compose.yml`](compose.yml) | The three-service stack. |

## Notes on schema management

The backend uses versioned migration files in
[`backend/prisma/migrations/`](backend/prisma/migrations/). The API container runs
`prisma migrate deploy` on startup, so a deploy applies exactly the SQL that was
reviewed and committed — never a schema diff computed at boot.

To change the data model:

```powershell
cd backend
# edit prisma/schema.prisma, then:
npm run db:migrate               # prompts for a name, writes prisma/migrations/<timestamp>_<name>/
```

Commit the generated `migration.sql` with the schema change. The next deploy
applies it.

A database created before migrations existed must be baselined once, so Prisma
does not try to recreate tables that are already there:

```powershell
docker compose run --rm --no-deps api sh -c "npx prisma migrate resolve --applied 0_init"
```
