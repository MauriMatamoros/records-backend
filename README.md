# Records API

Backend for **Records**, PartnerHero's internal replacement for Airtable. People build tables with typed columns and edit records in the web app ([records-frontend](https://github.com/MauriMatamoros/records-frontend)); internal services read the same data through a read-only, token-authenticated API.

**Stack:** NestJS 12 · Prisma 7 + SQLite (better-sqlite3 driver adapter) · class-validator / class-transformer · Swagger · Helmet · Pino structured logging · Node 24 LTS · pnpm 12. Deployed with Docker Compose behind Caddy.

## Features

- **Tables, columns, records.** Column types: text, long text, number, checkbox, date, single select, multiple select, email, URL. Every write is validated against the column types.
- **Constraints.** One optional **primary key** per table (always required and unique), plus per-column **required** and **unique** flags. They're enforced on every write, including imports, and checked against existing data before being switched on.
- **Filtering, search, sort, pagination.** Airtable-style per-column operators (see [Querying rows](#querying-rows)). Every list endpoint is paginated.
- **Import / export.** CSV and Excel (`.xlsx`). Imports run as a dry run first with a per-row error report, can append or upsert by primary key, and can create a whole table with inferred column types.
- **Read-only public API** under `/api/v1`, authenticated with revocable API tokens. Tokens are stored as SHA-256 hashes and shown once.
- **Sign-in.** Google OAuth restricted to company domains *and* an invitation. There's a single role: anyone signed in can do everything, including inviting others. The Google part is scaffolded with placeholder secrets; see [Google sign-in](#google-sign-in).
- **Detailed logs.**
  - Structured request logs (JSON in production) with request ID, actor, status and duration; cookies and auth headers are redacted.
  - A persistent **audit log** of every change, sign-in attempt, import, export and public-API read, browsable in the app.

## Local development

Requirements: Node 24 LTS and pnpm 12 (`corepack enable`).

```bash
pnpm install                 # also generates the Prisma client
cp .env.example .env         # then set JWT_SECRET (openssl rand -base64 48)
pnpm db:migrate              # creates data/records.db
pnpm db:seed                 # optional demo table
pnpm start:dev               # http://localhost:4000
```

- Swagger UI: http://localhost:4000/api/docs (everything) and http://localhost:4000/api/v1/docs (public API only, for consumers).
- `INITIAL_USER_EMAIL` is created automatically on startup when there are no users.
- While Google OAuth is unconfigured, sign in locally with `POST /api/auth/dev-login {"email": "..."}`, or use the form on the frontend's login page. This only works when `NODE_ENV` isn't `production` and `AUTH_DEV_LOGIN=true`.

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | HTTP-level tests against the app |
| `pnpm lint` / `pnpm typecheck` | oxlint / `tsc --noEmit` |
| `pnpm db:migrate` | Create and apply a migration after editing `prisma/schema.prisma` |
| `pnpm db:studio` | Browse the database |

### Environment

See [`.env.example`](.env.example). Variables are validated at startup (`src/config/env.validation.ts`), and the app refuses to boot with a missing or weak `JWT_SECRET`.

## API overview

All routes are under `/api`. Admin routes use the `ph_session` HTTP-only cookie set at sign-in; the public API uses `Authorization: Bearer phr_…`.

| Area | Routes |
| --- | --- |
| Auth | `GET /auth/config`, `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/dev-login`, `GET /auth/me`, `POST /auth/logout` |
| People | `GET /users`, `POST /users/invite`, `DELETE /users/:id` |
| Tables | `GET/POST /tables`, `GET/PATCH/DELETE /tables/:id` |
| Columns | `POST /tables/:id/columns`, `PATCH/DELETE /tables/:id/columns/:columnId`, `PUT /tables/:id/columns/order` |
| Records | `GET/POST /tables/:id/rows`, `GET/PATCH/DELETE /tables/:id/rows/:rowId` |
| Import / export | `POST /tables/import` (new table from file), `POST /tables/:id/import`, `GET /tables/:id/export`, `GET /tables/:id/import-template` |
| API tokens | `GET/POST /tokens`, `DELETE /tokens/:id` (revoke) |
| Activity | `GET /audit` |
| Public (token) | `GET /v1/tables`, `GET /v1/tables/:slug`, `GET /v1/tables/:slug/rows`, `GET /v1/tables/:slug/rows/:rowId`, `GET /v1/tables/:slug/rows/by-key/:value`, `GET /v1/tables/:slug/export` |
| Health | `GET /health` |

Lists return `{ "items": [...], "meta": { "page", "pageSize", "total", "totalPages" } }` and accept `page` and `pageSize` (max 200).

### Querying rows

`GET /api/v1/tables/{slug}/rows` (and the admin equivalent) accepts:

- `q`: search across all cell values.
- `filter[<column key>][<operator>]=<value>`; `filter[key]=value` is shorthand for `eq`. Repeat a parameter to add conditions.
- `match=all|any`: combine conditions with AND (default) or OR.
- `sort=<column key>|createdAt|updatedAt`, prefixed with `-` for descending.

| Operator | Meaning | Column types |
| --- | --- | --- |
| `eq`, `neq` | equals / not equals (for multiple select: has / doesn't have) | all except long text |
| `contains`, `ncontains`, `startsWith` | case-insensitive text match | text, long text, email, URL |
| `gt`, `gte`, `lt`, `lte` | comparisons (dates: after / before) | number, date, `createdAt`, `updatedAt` |
| `in` | comma-separated list (for multiple select: has any of) | text, email, URL, number, select, multiple select |
| `empty` | `true` / `false` | all except checkbox |

```bash
curl -H "Authorization: Bearer $RECORDS_TOKEN" \
  'https://records.partnerhero.com/api/v1/tables/client-accounts/rows?filter[status][in]=Active,Paused&filter[seats][gte]=10&sort=-renewal_date'
```

Exports accept the same parameters plus `format=csv|xlsx`.

### Import rules

- The first row is headers, matched to columns by name or key (case-insensitive). Unmatched headers are reported and ignored.
- Cells are converted to the column type. Numbers may contain thousands separators; checkboxes accept true/false/yes/no/1/0/x; dates accept ISO or Excel dates; multiple-select values are split on `,` or `;`.
- `mode=append` adds rows. `mode=upsert` updates rows with a matching primary key (blank cells leave values unchanged) and adds the rest.
- Imports are all-or-nothing unless `skipInvalid=true`. Use `dryRun=true` to preview. Limits: 20 MB, 50,000 rows. Legacy `.xls` isn't supported.

## Logging

- **Request logs:** one line per request via `nestjs-pino`, with `req.id`, method, URL, status, response time and `actor` (user email or token name/prefix). Pretty-printed in development and JSON in production, so `docker compose logs backend` works and any log shipper can parse them. Rotation is configured in compose (10 MB × 5 files). Level: `LOG_LEVEL`.
- **Audit log:** the `AuditLog` table, browsable at `/logs` in the app or `GET /api/audit`. It records the actor, action, entity, a JSON detail (e.g. before/after diffs for record edits), client IP and request ID. The request ID matches the `X-Request-Id` response header and the request log line.
- **Access logs:** Caddy writes JSON access logs to `/data/logs/access.log` in the `caddy-data` volume.

## Deployment (GCP Compute Engine)

The `deploy/` folder runs the whole stack: Caddy (automatic HTTPS) → frontend + API, with SQLite on a named volume.

1. **Create the VM.** An `e2-small` running Debian 12 is plenty to start. Allow HTTP and HTTPS traffic in the firewall, and reserve a static external IP.
2. **Point DNS** (e.g. `records.partnerhero.com`) at that IP.
3. **Install Docker** (Engine + Compose plugin): https://docs.docker.com/engine/install/debian/
4. **Clone both repos side by side:**
   ```bash
   mkdir ~/records && cd ~/records
   git clone git@github.com:MauriMatamoros/records-backend.git
   git clone git@github.com:MauriMatamoros/records-frontend.git
   cd records-backend/deploy
   cp .env.example .env    # set DOMAIN, ACME_EMAIL, JWT_SECRET, INITIAL_USER_EMAIL, ALLOWED_EMAIL_DOMAINS
   docker compose up -d --build
   ```
5. Visit `https://<DOMAIN>`. Caddy obtains the certificate on the first request.

**Updating:** `git pull` in both repos, then `docker compose up -d --build` from `deploy/`. Migrations run automatically when the API container starts.

**Backups:** the database is the `records_records-data` volume. Take a consistent copy while running:

```bash
docker compose exec backend node scripts/backup.mjs /app/data/backup.db
docker compose cp backend:/app/data/backup.db ./records-$(date +%F).db
```

Locally: `pnpm db:backup`.

Copy it off the VM (for example to a Cloud Storage bucket on a cron schedule).

**Try it locally:** set `DOMAIN=localhost` in `deploy/.env` and open https://localhost. Caddy uses a local certificate authority, so the browser will warn about the certificate.

## Google sign-in

The OAuth flow is fully wired; only the credentials are missing.

1. In Google Cloud Console, go to **APIs & Services → Credentials → Create OAuth client ID** and choose **Web application**.
2. Add the authorized redirect URI `https://<DOMAIN>/api/auth/google/callback`. For local development use `http://localhost:3000/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `deploy/.env` (or `.env` locally) and restart.

Set the OAuth consent screen to **Internal** if your Google Workspace allows it. Sign-in additionally requires a verified email on an `ALLOWED_EMAIL_DOMAINS` domain *and* an existing invitation. Rejected attempts appear in the activity log with the reason.

## Project layout

```
src/
  auth/          Google OAuth (+ CSRF state cookie), session guard, dev login
  users/         invitations; initial-user bootstrap
  tables/        tables, columns, constraints, slug/key generation
  rows/          record CRUD, cell validation, JSON1 filter/sort engine
  transfer/      CSV/Excel import (planner + dry run) and export
  api-tokens/    token issuing/revocation and the bearer guard
  public-api/    read-only /api/v1 for internal services
  audit/         audit log service + endpoint
  common/        request context (AsyncLocalStorage), decorators, filters
prisma/          schema, migrations, demo seed
deploy/          docker-compose.yml, Caddyfile, env template
```
