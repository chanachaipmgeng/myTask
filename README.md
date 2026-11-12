# Man-day Scorecard

Angular + Syncfusion scoreboard for closed tickets in man-days, with separate Implement / R&D indexes.

**Phase 0–1 is live:** NestJS API, PostgreSQL, GitLab/dev login, and OpenProject (myProject) sync. Domain scoring lives in `shared/` so web and server reuse the same rules.

Full Thai guide: [docs/คู่มือ.md](docs/คู่มือ.md)

## Quick start (Docker)

Put the Syncfusion license in `.env` (see `.env.example`), then build and run the full stack:

```powershell
Copy-Item .env.example .env
# set SYNCFUSION_LICENSE=... in .env
docker compose up --build
```

Open **http://localhost:8080**

- Web (nginx) serves the Angular app and proxies `/api` to Nest
- API listens on port 3000 inside the network (also published for debugging)
- Postgres is on host port **5433**

On **หลังบ้าน** click **Dev login · ปวีณา**, then open **Integrations** to set OpenProject URL/token and **Sync now**.

`OPENPROJECT_WRITEBACK` defaults to `false` so assignee is never patched back during early testing.

## Local development (without Docker web/API)

```powershell
npm install
npm --prefix server install
Copy-Item .env.example .env
docker compose up -d db
npm --prefix server run seed
```

Two terminals:

```powershell
npm --prefix server run start   # API http://127.0.0.1:3000
npm start                       # Web  http://127.0.0.1:4200  (proxies /api)
```

## Checks

```powershell
npm run verify                  # scoring rules (IMP-100 / RD-SPIKE = 100)
npm --prefix server run test    # OpenProject mapper unit tests
npm run build
npm --prefix server run build
```

## Layout

| Path | Role |
|---|---|
| `shared/domain/` | Pure scoring, capacity, workflow |
| `server/` | NestJS + PostgreSQL + OpenProject sync |
| `src/app/` | Angular UI (Syncfusion Fluent 2 Dark) |
| `docker/` | Dockerfiles and nginx for the full stack |
| `docs/คู่มือ.md` | Setup, login, sync, troubleshooting |

Put `SYNCFUSION_LICENSE` in the gitignored `.env` (see `.env.example`). Without it the Syncfusion trial banner stays.
