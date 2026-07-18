# My Lifts Mall — Store Owners Portal

A website where store owners in the Roblox mall game manage their store: upload a
new `.rbxl` file, download their current and template files, and track its status
(waiting for review → approved → published to the game). The game owner reviews
submissions and publishes them. Everyone logs in with **Discord**, and all
notifications are delivered as **Discord DMs** through the companion bot
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

Store status shown to the owner is derived from their latest submission:
`Waiting for review` → `Approved — waiting to be published` → `Live in game`
(or `Declined`, or `Closed`).

## Architecture

```
frontend/  React + Vite + Mantine SPA         -> served by its container, proxies /api -> api
backend/   Fastify + Prisma + PostgreSQL API   -> Discord OAuth, stores, file upload/download
compose.yml  web (nginx) + api + db (postgres) -> volumes: postgres_data, store_files
mylebot/   (separate repo) POST /internal/notify -> sends the Discord DMs
```

The 8 initial stores (A1, A2, A3, A4 *closed*, A5 on floor 1; B1, B2, B3 on floor 2)
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

Open `http://localhost:8080`. Log in with Discord. Because your Discord ID is in
`ADMIN_DISCORD_IDS`, you land on the **Admin dashboard**. When creating or editing
a store, choose its owner from the searchable list of Bloxlink-verified members in
the bot's Discord server. The store identifier is generated when the store is
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
npm run db:push                  # create tables
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

## Roles

- **Game owner (admin):** any Discord ID in `ADMIN_DISCORD_IDS`. Sees all stores,
  reviews submissions, manages stores (create/edit/delete/status), uploads templates.
- **Store owner:** a Bloxlink-verified Discord member assigned to a store. Sees only their store(s),
  uploads new versions, downloads current + template files.
- Anyone else who logs in sees a friendly "no store assigned yet" screen.

## Notifications

DMs are sent through the bot for: submission received (owner), review needed
(admins), approved, declined (with reason), and published (owner). Adding a new
notification is one method in [`backend/src/services/notifier.ts`](backend/src/services/notifier.ts)
plus a call site. Delivery is best-effort — a failed DM is logged (see the
`NotificationLog` table) and never blocks the store action.

## Project layout

| Path | What |
| --- | --- |
| [`backend/src/routes/`](backend/src/routes/) | Auth, store/owner, and admin routes. |
| [`backend/src/services/`](backend/src/services/) | File storage, store logic, notifier. |
| [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) | Data model. |
| [`frontend/src/pages/`](frontend/src/pages/) | Landing, Stores, Store detail, Admin. |
| [`frontend/src/components/`](frontend/src/components/) | Cards, upload dropzone, tables, modals. |
| [`compose.yml`](compose.yml) | The three-service stack. |

## Notes on schema management

The backend uses `prisma db push` (not migration files) to sync the schema on
startup — simple and reliable for this app's scale. If you later want versioned
migrations, switch the Dockerfile's `db push` to `prisma migrate deploy` and add a
`prisma/migrations` directory.
