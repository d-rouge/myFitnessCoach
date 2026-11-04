# health-trainer

Multi-sport AI personal trainer: collects medical history, goals, availability, equipment and data from device/app, then builds and adapts the macrocycle, microcycle and daily plan.

**Status (November 4, 2026):** Phase 1 is **functionally complete** (WS-0, Wave 1, Wave 2). On top of it, the **coach interview and LLM-chosen methodology** landed on October 30, 2026: the LLM picks methodology, weekly structure, periodization and phases inside a code-computed envelope; the deterministic generator still writes every session. Still open: F1-19 (scheduler, encrypted credentials), the 14-day real-use validation, and the sport bias of the generator (running-shaped week skeleton, see [`docs/FASI.md`](docs/FASI.md) Phase 2).

Components present:
- **L0 Onboarding & Baseline:** 6-step wizard (`OnboardingWizard.tsx`) with goals, red flags/injuries and Mongo persistence (`athlete_baselines`).
- **L1–L3 Plans & Execution:** Deterministic goal/sport/duration generator (`generateMacroPlan`, `generateMicroPlan`), safety gate that blocks generation on red flags/PAR-Q, weekly board and "Today" card with dates in the athlete's timezone.
- **Feedback & Adaptation:** Morning check-in (`MorningCheckinCard.tsx`), `computeDailyAdjustment` engine with persisted adapted session (duration, RPE, blocks, notes), manual activity and FIT upload with signature/size validation.
- **L4 Weekly Review:** `computeWeeklyReview`, adherence, load, pain, verdict and progression (`WeeklyReviewCard.tsx`).
- **AI Coach:** `coach-advice-v2`, `ai_runs` audit. **Native DeepSeek** connection (`deepseek-v4-pro` for planning, `deepseek-flash` for the coach) can be enabled with `LLM_PROVIDER=deepseek` + `LLM_API_KEY`; without a key, the coach falls back to the deterministic provider.
- **Coach interview & methodology:** "Talk to the coach" opens a chat (`PlanInterviewChat.tsx`, max 6 replies) that collects missing context, then the LLM chooses the methodology (`methodology_decisions`), validated against the envelope with one correction retry, and the plan is generated from it. The weekly review re-evaluates the methodology. Without an LLM key the interview and methodology endpoints answer `503` and plan generation stays rule-based. Details in [`docs/METODOLOGIA-LLM.md`](docs/METODOLOGIA-LLM.md); the full Proposer/Critic/Referee design in [`docs/ARCHITETTURA-LLM.md`](docs/ARCHITETTURA-LLM.md) is not implemented yet.
- **i18n:** Italian and English UI (`apps/web/src/i18n`).
- **Export & Portability:** FIT for run/bike/swim with structured targets (strength/mobility rejected), Hevy with derived exercises and mandatory key, full backup with idempotent restore and total wipe.
- **Auth:** registration and login with email + password (scrypt) or Google, opt-in dev login, explicit logout, Hevy key saved in the browser and forwarded for export.

308 unit tests and 14 e2e checks (`npm run test:e2e` on a temporary real MongoDB), all green on November 4, 2026, with clean typecheck, lint and build. **Not verified:** Google login with real credentials, Hevy export with a real key, `.FIT` import into Garmin Connect, automatic sync, 14-day real use.

## Documents

| Document | Content |
|---|---|
| [`AGENT.md`](AGENT.md) | Guide for an agent: invariants, repo map, commands, what not to do |
| [`docs/PIANO.md`](docs/PIANO.md) | Product, data model, architecture, AI pipeline, security |
| [`docs/FASI.md`](docs/FASI.md) | Phases, tasks, acceptance criteria, current status |
| [`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md) | Open Phase 1 issues, evidence and parallel fix plan |
| [`docs/INTEGRAZIONI.md`](docs/INTEGRAZIONI.md) | Garmin, Yazio, Zepp, Hevy, Health Connect, Drive, LLM |
| [`docs/FIT.md`](docs/FIT.md) | Binary parsing, normalization, ActivityAnalysis and compact brief for the LLM |
| [`docs/MODELLO-ATLETA.md`](docs/MODELLO-ATLETA.md) | History, measured capacity, recent context: who decides the load |
| [`docs/METODOLOGIA-LLM.md`](docs/METODOLOGIA-LLM.md) | Methodology chosen by the LLM, coach interview, periodization (implemented) |
| [`docs/ARCHITETTURA-LLM.md`](docs/ARCHITETTURA-LLM.md) | Who generates the plan: dossier, Proposer, Critic, Referee, memory, steps (target design) |
| [`docs/spikes/`](docs/spikes/) | Templates and real spike results (Garmin, Yazio, FIT export, Zepp, Hevy) |

> Project rule: **documentation is updated with every advance**, in the same commit.

## Requirements

- Node.js >= 22
- npm (included with Node)
- Local MongoDB on `127.0.0.1:27017`, managed by you

The app does not start or stop system services. If Mongo is not listening, start it as you prefer. Docker is not needed.

## Quick start

```bash
cp .env.example .env
# Obbligatorio: genera un JWT_SECRET (min 32 caratteri)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Incollalo in .env come JWT_SECRET=...
npm install
npm run dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/api/health>
- Integrations: <http://localhost:3000/api/integrations/status>
- Current user: `GET /api/me` with `Authorization: Bearer <token>`

If Mongo is unreachable, the API still starts and `/api/health` responds `degraded`. With Mongo active it responds `ok`.

The `curl` examples below for protected endpoints require the bearer token. Locally, with `ENABLE_DEV_ENDPOINTS=true`:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/me
```

The web app does this automatically via `apiFetch` (`apps/web/src/lib/api.ts`).

## Commands

```bash
npm run dev              # build pacchetti + API + web
npm run dev:api          # solo NestJS (watch)
npm run dev:web          # solo Vite
npm run build            # build completo
npm test                 # unit + contract test (308 test)
npm run test:e2e         # e2e multi-utente su MongoDB reale (`*_e2e`, poi pulito)
npm run lint             # Biome
npm run typecheck        # TypeScript strict
npm run spike:garmin     # spike Garmin Personal API
npm run spike:yazio      # spike Yazio API v22
npm run analyze:fit      # scarica FIT Garmin, normalizza e stampa brief LLM
npm run export:workout   # genera file dist/workouts/5x800m-intervals.fit
```
## Garmin Spike

1. Create a personal key at <https://connect.garmin.com/app/settings/personalApiToken>.
2. Add it to `.env` or save it in `secrets/garmin-key.txt` (git-ignored). In development, the API also reads that file; in production use env/secret manager:

```bash
GARMIN_PERSONAL_API_KEY=...
```

3. Run:

```bash
npm run spike:garmin
npm run spike:garmin -- --write   # salva docs/spikes/garmin.local.json (ignorato da git)
```

The report is redacted: no tokens, no complete clinical values. After the spike, fill in `docs/spikes/garmin.md` with the verdict go / go with workaround / no-go.

## Garmin Sync

With the API and Mongo running, the UI has the **Sync now** button. From the terminal:

```bash
curl -X POST 'http://localhost:3000/api/integrations/garmin/sync?days=7'
curl 'http://localhost:3000/api/integrations/garmin/overview?days=7'
```

The sync saves activities and daily metrics in MongoDB (`activities`, `metrics_daily`) and records the outcome in `sync_runs` / `sync_state`. It is idempotent: running it again does not duplicate data.

## FIT Analysis

The `.FIT` is not given to the LLM: it is parsed, normalized, and summarized into a compact brief.

```bash
npm run analyze:fit
curl -X POST 'http://localhost:3000/api/integrations/garmin/activities/<id>/analyze'
```

In the UI, each Garmin activity has the **Analyze FIT** button: it shows the brief with summary, splits, HR zones, and observations (negative split, HR drift, variability). Details in [`docs/FIT.md`](docs/FIT.md).

## Yazio Sync

Yazio uses the unofficial **v22** API and requires a valid app User-Agent. If you sign in with **Google** (without a password), import a refresh token captured from the official app:

```json
{ "refreshToken": "il-refresh-token" }
```

If instead you have set a Yazio password:

```json
{ "email": "la-tua-email", "password": "la-tua-password" }
```

Save it in `secrets/yazio.json` (git-ignored). Then, with the API and Mongo running:

```bash
npm run spike:yazio
curl -X POST 'http://localhost:3000/api/integrations/yazio/sync?days=7'
curl 'http://localhost:3000/api/integrations/yazio/overview?days=7'
```

The sync saves daily macros in `nutrition_daily` and weight in `metrics_daily` (source `yazio`). The UI has the **Yazio Nutrition** card. Tested with a real account: 7 days, 0 errors, idempotent sync.

## Garmin Workout Export (.FIT)

The Garmin Personal API is read-only. To upload structured workouts without a corporate account, health-trainer generates binary `.FIT` files compliant with the Garmin specifications:

```bash
npm run export:workout
curl -O 'http://localhost:3000/api/export/workouts/sample-5x800m.fit'
```

The generated file (`dist/workouts/5x800m-intervals.fit`) can be:
1. Imported via the web on [Garmin Connect Workouts](https://connect.garmin.com/modern/workouts) using the **Import** button.
2. Or copied via USB into the device's `GARMIN/NewFiles/` folder.

## Auth and User Profile

The API includes the `auth` module with:
- Global `AuthGuard`: all endpoints require `Authorization: Bearer <token>`,
  except `/api/health` and auth's `@Public()` routes. `x-user-id` is ignored.
- `GET /api/me` for the authenticated user's profile.
- Local accounts: `POST /api/auth/register` and `POST /api/auth/login` with email and password
  (minimum 8 characters). Passwords are hashed with scrypt and a random salt in the
  `auth_credentials` collection; the `users` document does not contain password material.
  Duplicate email → 409, wrong credentials → generic 401. `ENABLE_LOCAL_AUTH=true`
  (default) enables the two endpoints.
- Google OAuth token exchange (`POST /api/auth/google`) with verification of `iss`, `aud`,
  `email_verified`, `exp`, and email allowlist (`GOOGLE_ALLOWED_EMAILS`, required if
  `GOOGLE_CLIENT_ID` is set). The first verified Google login creates the account; if
  a local account with the same email already exists, the two methods share the same
  `userId`. The current GIS flow uses only the public client ID; `GOOGLE_CLIENT_SECRET`
  is optional and remains supported for future server-side exchanges.
- Dev login (`POST /api/auth/dev-login`) **opt-in** with `ENABLE_DEV_ENDPOINTS=true`
  (default `false`); when disabled it responds 403.
- `JWT_SECRET` required and at least 32 characters outside `NODE_ENV=test`: without
  it the API does not start.
- Automatic profile persistence in MongoDB (`users`).
- `GET /api/auth/status` exposes `localAuthEnabled`, `googleClientId` (if configured), and
  `devLoginEnabled`: the web app shows the email/password forms, the Google Identity
  Services button, and hides dev login when disabled. Logout is explicit and prevents
  dev auto-login.
- The Hevy API key can be entered from the strength session board: it stays in the
  browser's `localStorage` and is sent only with the export (server fallback
  `HEVY_API_KEY`).

### Configuring Google (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an
   **OAuth client ID** of type *Web application*.
2. Add `http://localhost:5173` among the **Authorized JavaScript origins** (and the same
   host/port if you change the web app port).
3. In the root `.env` set:
   ```bash
   GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
   GOOGLE_ALLOWED_EMAILS=tua-email@gmail.com
   # opzionale, non usato dal flusso GIS attuale
   GOOGLE_CLIENT_SECRET=
   ```
4. Restart `npm run dev`. The **Continue with Google** button is enabled and the first
login verified by the allowlist creates the account. If the email already exists as a local
   account, Google logs into that same account.

## End-to-end tests

```bash
npm run test:e2e
```

Starts the API on a dedicated port with `ENABLE_DEV_ENDPOINTS=false`, signs two JWTs and
verifies against a real MongoDB: 401 without token, distinct identities, isolated baselines/plans,
cross-user PATCH and FIT export rejected with 404, separate check-ins and backups,
404 for missing baselines and plans (never 200 with an empty body). It uses `E2E_MONGODB_URI` (default
`mongodb://127.0.0.1:27017/health_trainer_e2e`), rejects databases that do not end with
`_e2e` and deletes them at the end of the run.

## Stack

- **API:** NestJS 12 (ESM) + TypeScript 6
- **Web:** React + Vite + Tailwind
- **DB:** local MongoDB `127.0.0.1:27017`
- **Android:** Expo/React Native + local SQLite (phase 3)
- **AI:** multi-provider adapter (BYOK / managed / Ollama) — currently only native DeepSeek wired

## Structure

```
apps/api        NestJS 12 ESM: auth, baseline, plan (+ interview, methodology), review, export, integrations
apps/web        React + Vite, i18n it/en
packages/domain Zod + pure rules (generator, methodology envelope, readiness, load, feasibility, safety)
packages/integrations  Garmin + Yazio clients, FIT parser/encoder
packages/db     Mongo client and repositories
packages/ai     prompts (coach, interview, methodology) + DeepSeek provider
packages/config env Zod
packages/ui     UI utilities
scripts         build/dev/spike
docs            plan, phases, integrations, spike
```

## Initial integrations

- Garmin Personal API (pull: activities, sleep, HRV, weight)
- Yazio (unofficial API v22: nutrition, weight)
- Zepp (weight, optional)
- Hevy (gym routine export)
- Garmin `.FIT` (running/cycling/swimming workout export)
- Health Connect (Android, phase 3)

Strava is excluded: the 2026 API Policy prohibits the use of data in AI applications.

## Repository

Hosted on GitHub (`origin` → `d-rouge/myFitnessCoach`), default branch `main`. Work happens on
branches merged through pull requests; GitHub Actions ([`ci.yml`](.github/workflows/ci.yml)) runs
build, unit tests, typecheck and lint on every push and PR. The e2e suite needs a real MongoDB
and is not part of CI.

## In one sentence

The code assembles the context and verifies consistency; the LLM proposes method, envelope and plan; a second LLM role challenges them before publication. Every level of the plan is versioned, tracked and verifiable. Today the LLM chooses the methodology and periodization inside a code-computed envelope, while sessions are still written by the rule-based generator; the Proposer/Critic/Referee pipeline is designed and not implemented (see [`docs/ARCHITETTURA-LLM.md`](docs/ARCHITETTURA-LLM.md)).
