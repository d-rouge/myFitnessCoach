# AGENT.md

Operational guide for an agent working on **health-trainer**. Read this file before modifying anything.

**Updated:** November 4, 2026 (realignment after the coach interview and LLM methodology).

---

## 0. Rule zero — documentation always up to date

**Every step forward updates the documentation in the same commit/PR.** Don't postpone it to "later".

| If you change... | Update... |
|---|---|
| Code or the state of a phase | `docs/FASI.md` (checkbox and status) + `README.md` (status) |
| Architecture, stack or a decision | `docs/PIANO.md` + this file |
| Who generates the plan, LLM roles, envelope, memory | `docs/ARCHITETTURA-LLM.md` + `docs/FASI.md` |
| Methodology, interview, periodization | `docs/METODOLOGIA-LLM.md` + `docs/FASI.md` |
| An endpoint | §5.1 of this file |
| An integration, endpoint, token or limit | `docs/INTEGRAZIONI.md` + fixture/test |
| A command, a path or an invariant | `AGENT.md` |
| An unverified hypothesis | the spike document, marked **unverified** |

Practical rules:

- If something hasn't been tested, write it down: **don't pass off a hypothesis as fact**.
- If a test is removed or not run, explain why.
- If a decision changes, also update the "Open decisions" table in `PIANO.md`.
- A task isn't "Done" if the documentation is out of sync.

---

## 0.1 Git repository

- Remote: `origin` → GitHub `d-rouge/myFitnessCoach`. Default branch: **`main`**.
- Work on a branch and merge through a pull request; don't commit directly on `main`.
- CI (`.github/workflows/ci.yml`) runs `build`, `test`, `typecheck` and `lint` on every push and PR. The e2e suite needs a real MongoDB and is **not** in CI: run it locally when you touch API behaviour.
- Push only when the user asks. Never `reset --hard`, `rebase` a shared branch, or force-push without explicit confirmation.
- Don't commit `.env`, `node_modules`, `dist`, photos, `.FIT` files or backups.

---

## 1. What the project is

A multi-sport AI personal trainer, initially for **personal use**, then in testing with a few users.

The loop:

> data → interpretation → plan → execution → feedback → updated plan

The app isn't a tracker. The value is the coaching cycle, the consistency of the plan and the explanation of the choices.

**Current status (November 4, 2026):** Phase 0 completed. Phase 1 is **functionally
complete** after WS-0, Wave 1 and Wave 2. F1-18 (coach with real context) was closed on
October 27, 2026. On October 30, 2026 the **coach interview and the LLM-chosen methodology**
landed (`docs/METODOLOGIA-LLM.md`). Still open: F1-19 (scheduler and encrypted credentials),
the 14-day real-usage validation, and the running-shaped generator (Phase 2 in
`docs/FASI.md`). Details in [`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

**Don't assume** that a path or a feature exists just because it's in the plan: check the repository.

---

## 2. Reading order

1. `AGENT.md` (this file)
2. `docs/PIANO.md` — product, architecture, domain, AI, security
3. `docs/FASI.md` — current phase, tasks, acceptance criteria
4. `docs/REVIEW-FASE-1.md` — open issues in Phase 1 and fix plan
5. `docs/INTEGRAZIONI.md` — Garmin, Yazio, Zepp, Hevy, Health Connect, Drive
6. `docs/MODELLO-ATLETA.md` — history, measured capacity, recent context
7. `docs/METODOLOGIA-LLM.md` — what is implemented today: LLM methodology, interview, periodization
8. `docs/ARCHITETTURA-LLM.md` — target design: dossier, Proposer, Critic, Referee, memory
9. `docs/spikes/` — real results of the spikes (Garmin, Yazio, FIT export, Zepp, Hevy)
10. `README.md` — quick start

If one document contradicts another, **`PIANO.md` wins** for architecture and `FASI.md` for priority. Flag the contradiction and update the documents.

---

## 3. Repository map

```
AGENT.md
README.md
package.json                npm workspaces (apps/*, packages/*)
package-lock.json           npm lockfile
.env.example                required variables
scripts/
  build-packages.sh         build packages in dependency order
  dev.sh                    API + web in parallel
  spike-garmin.ts           Garmin Personal API spike
  spike-yazio.ts            Yazio API v22 spike
  analyze-fit.ts            analyzes Garmin FIT and prints brief
  export-workout-fit.ts     generates FIT workout file
  e2e-api.ts                multi-user e2e on real MongoDB (`*_e2e`)
docs/
  PIANO.md
  FASI.md
  REVIEW-FASE-1.md          open issues Phase 1 + fix plan
  INTEGRAZIONI.md
  FIT.md
  MODELLO-ATLETA.md         history, measured capacity, recent context
  METODOLOGIA-LLM.md        LLM methodology, interview, periodization (implemented)
  ARCHITETTURA-LLM.md       dossier, Proposer, Critic, Referee, memory (target design)
  spikes/                   real results (template + registry)
.github/workflows/ci.yml    build, test, typecheck, lint on push/PR
apps/
  api/                      NestJS 12 ESM
    src/database/           MongoService (connection + indexes)
    src/common/             shared helpers (`getUserTimeZone`)
    src/auth/               AuthService (local/Google/dev), scrypt password, JWT util
    src/athlete/            AthleteService.getContext(): the single dossier path
    src/baseline/           baseline, versioning, measured capacity
    src/plan/               PlanService, MethodologyService, InterviewService
    src/review/             weekly review + methodology re-evaluation
    src/checkin/, activity/ check-in, manual activity, FIT upload
    src/ai/                 coach advice, LLM provider factory
    src/integrations/       GarminService, GarminSyncService, YazioService, YazioSyncService
    src/export/             FIT, Hevy, backup/restore/wipe
  web/                      React + Vite + Tailwind + TanStack Query; single page (`App.tsx`) + `components/`, i18n it/en in `src/i18n`
  mobile/                   Expo (phase 3, not yet created)
packages/
  domain/                   Zod schemas + pure rules (generator, methodology envelope, safety, load, readiness…)
  integrations/             Garmin + Yazio + FIT parser/analysis + FIT workout encoder
  db/                       Mongo client, repositories, collections and indexes
  ai/                       prompts as versioned TS constants (coach, interview, methodology) + DeepSeek provider
  ui/                       shared UI utilities (cn)
  config/                   env Zod, feature flag
```

> Some paths are planned and don't exist yet (`apps/mobile`, etc.). Check before creating or importing them.

---

## 4. Current phase

Read `docs/FASI.md`. **Phase 0 — Spikes and foundations** is completed.

**Phase 1 — Personal web MVP** is functionally complete: WS-0, Wave 1 and Wave 2
are closed (auth, baseline, review/check-in, export, backup, safety, generator,
timezone, UI auth/Hevy, e2e). F1-18 (coach with real context) is closed. F1-19
(scheduler, encrypted credentials, Yazio weight history) remains deferred. Details in
[`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

Beyond Phase 1, the LLM methodology and the coach interview are implemented
(`docs/METODOLOGIA-LLM.md`): an intermediate step towards `docs/ARCHITETTURA-LLM.md`.

**Next step:** see "Next steps" in `docs/FASI.md`: the 14-day real-world validation,
then Phase 2 starting from the sport-module refactor and real strength training.

---

## 5. Commands

```bash
npm install
cp .env.example .env          # poi compila le chiavi che servono
npm run dev                   # build pacchetti + API + web
npm run dev:api               # solo NestJS (watch)
npm run dev:web               # solo Vite
npm run build                 # build completo
npm test                      # unit/contract test (308 test)
npm run test:e2e              # e2e multi-utente su Mongo reale (`*_e2e`, poi pulito)
npm run lint                  # Biome
npm run typecheck             # TypeScript strict
npm run spike:garmin          # spike Garmin (aggiungi -- --write per salvare il report)
npm run spike:yazio           # spike Yazio (credenziali in secrets/yazio.json o .env)
npm run spike:deepseek        # verifica DeepSeek (--all per provare pro + flash)
npm run analyze:fit           # scarica l'ultima attività Garmin, parsa il FIT e stampa il brief
npm run export:workout        # genera file dist/workouts/5x800m-intervals.fit
```

MongoDB is local on `127.0.0.1:27017` and is **managed by the user**. Do not start or stop system services (MongoDB, Redis) without confirmation. Docker is not needed.

**Commands not yet present** (do not invent them): `db:migrate`, `eval`. They will be added when the corresponding code exists.

`npm run test:e2e` requires local MongoDB, `JWT_SECRET` (≥32 characters) in `.env`, and the
API build; it uses `E2E_MONGODB_URI` (default `mongodb://127.0.0.1:27017/health_trainer_e2e`),
rejects databases that do not end with `_e2e`, and deletes them at the end of the run.

If a command does not exist, check `package.json`, create the script only if it is part of the task, update this file.

### 5.1 Current API endpoints

All endpoints are protected by the global `AuthGuard` (`APP_GUARD`) and require
`Authorization: Bearer <token>`, except those marked `@Public()`:

```text
Pubblici
GET  /api/health
GET  /api/auth/status
POST /api/auth/register    (email + password, se ENABLE_LOCAL_AUTH=true)
POST /api/auth/login       (email + password, 200; 401 se credenziali errate)
POST /api/auth/google      (Google ID token + allowlist)
POST /api/auth/dev-login   (solo se ENABLE_DEV_ENDPOINTS=true, altrimenti 403)
POST /api/auth/logout

Protetti (JWT)
GET  /api/me
GET  /api/baseline               (404 se non esiste)
POST /api/baseline
GET  /api/baseline/history
GET  /api/athlete/dossier        (contesto completo; 404 senza baseline)
GET  /api/baseline/capacity      (capacità stimata dalle attività; 200 con available=false se non c'è nulla)
GET  /api/baseline/personas
POST /api/baseline/safety
POST /api/baseline/feasibility
GET  /api/plan/macro
POST /api/plan/macro/generate
POST /api/plan/methodology               (LLM; 503 without a configured model)
GET  /api/plan/methodology/latest
POST /api/plan/interview                 (starts the interview + first turn; 503 without a model)
GET  /api/plan/interview/latest
POST /api/plan/interview/:id/message
POST /api/plan/interview/:id/generate    (re-evaluates the methodology with the findings, then generates)
GET  /api/plan/micro?weekIndex=1
POST /api/plan/micro/generate
GET  /api/plan/today
PATCH /api/plan/sessions/:sessionId
POST /api/checkin
GET  /api/checkin/today
POST /api/review/weekly
GET  /api/review/latest          (404 se non esiste)
POST /api/review/advance-week
POST /api/activities/manual
POST /api/activities/upload-fit  (JSON base64, max 10 MB, firma .FIT)
GET  /api/activities/history?limit=10
POST /api/ai/coach-advice
GET  /api/integrations/status
POST /api/integrations/garmin/check
GET  /api/integrations/garmin/overview?days=7
GET  /api/integrations/garmin/activities/summary
POST /api/integrations/garmin/sync?days=7
POST /api/integrations/garmin/activities/:activityId/analyze
GET  /api/integrations/garmin/activities/:activityId/analysis
POST /api/integrations/yazio/check
GET  /api/integrations/yazio/overview?days=7
POST /api/integrations/yazio/sync?days=7
GET  /api/export/workouts/sample-5x800m/info
GET  /api/export/workouts/sample-5x800m.fit
GET  /api/export/workouts/session/:sessionId.fit
GET  /api/export/workouts/hevy/sample-fullbody.json
POST /api/export/workouts/hevy/export
GET  /api/export/backup
POST /api/export/restore
DELETE /api/export/me
```

**Authentication.** The user is resolved **only** from the bearer token: `x-user-id` is ignored.
Controllers receive the user with `@CurrentUser()`. `JWT_SECRET` is mandatory
(min 32 characters) outside `NODE_ENV=test`; without it, boot fails.
`ENABLE_DEV_ENDPOINTS` is `false` by default. Garmin/Yazio endpoints are also protected
by `DevOnlyGuard` (they require `ENABLE_DEV_ENDPOINTS=true`).

**Validation.** Every payload/query passes through `ZodValidationPipe` with a dedicated
schema; errors are `400` with `{ message, issues[] }`. The JSON body accepts up to
15 MB (`useBodyParser` in `main.ts`) for FIT uploads in base64.

**Semantics consolidated in Wave 1 (do not regress):**

- **Baseline/versioning.** The `id` is generated by the server with UUIDv7
  (`packages/db/src/ids.ts`), never by the client. `saveBaseline` supersedes by
  `{ userId, supersededAt: null }`, increments `version`, and sets `validFrom`.
  The partial unique index `uniq_active_baseline_per_user` guarantees a single active baseline
  per user; `getCurrentBaseline` sorts by `version`/`validFrom`.
- **Review.** Only sessions with `status === "completed"` count as completed; `adjusted`
  does not. Pain events come only from check-ins within
`microPlan.startDate..endDate`. `advanceWeek` uses the review of the current week (never an old review) and at the end of the macro responds with `400`, without restarting from 1.
- **Decisions.** `progress` applies +10% volume to the next microcycle; `deload` applies −30% and lowers RPE by 2. Mobility and recovery are not scaled.
- **Check-in.** An automatic adaptation persists the entire session (duration, RPE, blocks) plus the notes in `sessions[].notes`, via `replacePlannedSession`; changing the status alone is not enough.
- **FIT export.** Only `running`, `cycling`, `swimming`; strength/mobility/other → `400`. Textual targets are interpreted: `Z2`, `Passo 4:20-4:35/km`, `85-95 rpm`, `180-220 W`. Text that cannot be interpreted remains in the step notes.
- **Hevy export.** Requires `body.apiKey` or `HEVY_API_KEY`. The validation order is session → sport (`strength`) → key, so that a real error is not masked. The session is never invented; exercises derive from the blocks, with a declared full-body fallback.
- **Backup/restore.** The backup (`0.4.0`) includes `ai_runs`, `methodology_decisions` and `plan_interviews`; a `0.3.0` backup still restores (the missing collections come back empty, as in any snapshot restore). The signature is `restoreUserData(db, backup, userId)`: the `userId` in the body is ignored, the restore is idempotent (delete+insert per collection) and validates the keys before deleting. `deleteUserData` deletes every collection in `COLLECTIONS`, `users` included: `packages/db/src/backup.spec.ts` fails if a new collection is not added to the wipe.

**Semantics consolidated in Wave 2 (do not regress):**

- **Safety.** `assessSafety` is evaluated when the baseline is saved (log only, data is not lost) and **blocks generation** with `400` on absolute red flags or incomplete PAR-Q. A missing PAR-Q value is equivalent to `false` (Zod default) and blocks.
- **Generator.** Starts from today in the athlete's timezone (or from `startDate`), places sessions at the next occurrence of the configured days, respects `goals.primary.sport`/`profile.sports` and scales blocks based on `durationMin`. Steps derive from `goal.targetValue`/`targetUnit`, not from constants.
- **Timezone.** A single helper (`packages/domain/src/rules/dates.ts`): `localDate`, `todayLocalDate`, `resolveTimeZone`, `addDaysIso`. The API reads the timezone from the active baseline (`getUserTimeZone`, fallback `Europe/Rome`). Never `toISOString().slice(0, 10)` for the current day.
- **Missing resources.** `GET /api/baseline`, `GET /api/plan/macro` and `GET /api/plan/micro` respond with an explicit `404`; the UI treats the 404 as "no data". Never `200` with an empty body: Nest does not serialize `null` and the client would fail with a parsing error.
- **Local auth.** `POST /api/auth/register` and `POST /api/auth/login` handle email + password accounts (scrypt with random salt, hash in `auth_credentials`; the public `users` document never contains password material). Normalized email, validation messages in Italian, 409 on duplicate email, generic 401 on wrong credentials. `ENABLE_LOCAL_AUTH` (default `true`) enables or disables the two endpoints.
- **Google and linking.** The first verified and allowlisted Google login creates the account; if a local account already exists with the same email, Google logs into that same `userId` instead of duplicating it. `GOOGLE_CLIENT_ID` and `GOOGLE_ALLOWED_EMAILS` are required; the client secret is not used by the current GIS ID-token flow and is optional. In the UI the Google button is always visible and stays disabled until the client ID or allowlist are missing.
- **Auth UI.** `/api/auth/status` exposes `localAuthEnabled`, `googleClientId` and `devLoginEnabled`; the login screen offers local login/registration, Google Identity Services if configured, and dev login only if enabled. Logout sets `health-trainer.logged-out` and prevents dev auto-login until an explicit login is performed.
- **Hevy UI.** The key can be entered in the board: it stays in `localStorage`, is sent only with the export, and the server falls back to `HEVY_API_KEY` if absent.
- **Integrations.** The status in `/api/health` for Garmin uses `GarminService.isConfigured()` (env **or** `secrets/garmin-key.txt`), not the env alone. The overviews read `metrics_daily` filtering by `source`: Garmin must not show Yazio rows from the same date. Sync, analyze and overview use the token's `userId`, never a hardcoded `personal`: a new account does not see another's data.
- **E2E.** `scripts/e2e-api.ts` starts the API with dev endpoints disabled, signs two JWTs and verifies local registration/login, isolation, FIT export, check-in, backup and 404 for missing baseline/plans.

---

## 6. Non-negotiable invariants

1. **No Next.js.** NestJS API, React + Vite web.
2. **The domain is pure.** `packages/domain` does not import Mongo, HTTP, React, NestJS.
3. **Rules come before the LLM.** Numbers, loads, progression, contraindications and feasibility are calculated. The LLM chooses and explains.
4. **No LLM output is saved without validation** (Zod + rules + safety critic).
5. **Plans are immutable and versioned.** Do not modify a past version: create a new one with `supersedes`.
6. **Timezone:** the "day" is local (IANA), timestamps are UTC. Never do arithmetic with a bare `Date`.
7. **No Strava API.** The 2026 policy forbids its use in AI. Do not add it.
8. **No health data in logs.** No tokens, keys, photos, clinical texts.
9. **Encrypted secrets.** Provider keys and tokens never in plaintext in the DB, never to the client, never in logs. **Known gap:** encryption of `provider_credentials` is not implemented yet (F1-19); today dev credentials live in `secrets/` and env. Do not add new stored credentials before F1-19.
10. **Android local-first.** Health data stays on the device; the server is used for auth, backup metadata and managed LLM (with consent).
11. **Unofficial adapters isolated.** Yazio/Zepp behind feature flags, with manual fallback and documented risks.
12. **No autonomous agent writes the plan.** Typed roles and deterministic pipeline.
13. **UUID v7** for portable IDs between web and SQLite.
14. **SI units in storage**, display according to preferences.
15. **No unjustified `any`**; no `as` to bypass types.

---

## 6.1 Current technical notes

- **NestJS 12 (ESM)** with `"type": "module"` and relative imports with the `.js` extension. Do not reintroduce CommonJS or Nest 11.
- **TypeScript 6.0.3**, `module`/`moduleResolution: nodenext`. Avoid `moduleResolution: node10` and `baseUrl` (deprecated in TS 6).
- **Node >= 22**, **npm workspaces**. No pnpm, no Turborepo.
- `npm run dev` first runs `build:packages`: API and web import packages from `dist`, not from source.
- **Current tests (November 4, 2026):** 308 green unit tests (api 87, domain 141, integrations 40, ai 20, web 9, db 6, config 5) + 14 green e2e checks. Typecheck, `typecheck:scripts`, lint and build green. **Tests that depend on today** (recovery windows, plan horizon) must pin the clock with `vi.setSystemTime`, or compare against the generated plan instead of a literal: two such tests broke silently as the calendar moved.
- **Athlete model (v2):** `profile.experience` has been removed. It is replaced by `profile.history` (what you have done), `profile.capacity` (what you can do now) and `profile.experienceTier` **derived server-side** for the sport of the primary goal. Rules in `packages/domain/src/rules/experience.ts`. Details and boundary with the LLM in `docs/MODELLO-ATLETA.md`.
- **Measured capacity:** `profile.capacity.source` is `garmin | manual | calibration`. With `garmin` the numbers are recalculated by the server from imported activities (never by the client) on save, on read (`GET /baseline`) and on plan generation; without activities the baseline is rejected with 400. The rule is only one: `apps/api/src/baseline/measured-capacity.ts`. With `calibration` week 1 is an RPE 4-5 test and capacity is re-estimated as soon as data exists.
- **Athlete's day:** counters ("days ago", 28-day window, streak) use the baseline timezone, not UTC. With `toISOString()` after 10:00 PM Italian time you are off by a day. `buildRecentContext()` and `estimateCapacityFromActivities()` accept `timezone`.
- **Onboarding and data loss:** the wizard saves from any step when editing an existing baseline (sticky bar "Save changes"). On first onboarding it does not save halfway because the default values would be invented data: a draft is used in `sessionStorage` (never `localStorage`: it is health data) and restored on return, with a warning.
- **Security and medical history:** `assessSafety()` recognizes conditions with both the English ids and the Italian labels of the wizard (if the wizard saves "uncontrolled hypertension", the block must trigger). Common chronic conditions raise severity to `caution` without blocking; medications with an impact on exercise add a note (beta-blockers → use RPE, diuretics → hydration, anticoagulants → no contact/falls, glucose-lowering medications → hypoglycemia risk).
- **Athlete dossier (F1-25):** `buildAthleteDossier()` (`packages/domain/src/rules/athlete-dossier.ts`) compiles the single context object — identity and age, goals (including secondary ones), history, capacity, recent context, individual response (adherence, RPE gap, recurring pain), memory and plan history, constraints, preferences — with explicit `warnings` about what is missing. It is used by `PlanService` and `AiService` through `AthleteService.getContext()`: **a single context path**. A coverage test fails if a field is added to the baseline without passing it to the dossier.
- **Recent context:** `buildRecentContext()` (`packages/domain/src/rules/recent-context.ts`) produces structured facts (last race/long effort, remaining recovery days, acute/chronic ratio, gap). The recovery window ends up in `macroPlan.recoveryWindow` and forces recovery weeks deterministically: the LLM can explain it, not ignore it.
- **LLM: DeepSeek wired, partial provider.** `LLM_PROVIDER=deepseek` + `LLM_API_KEY` activate `DeepSeekProvider` (`packages/ai/src/providers/deepseek.ts`); without a key it stays on `DeterministicCoachProvider`. Two models: `LLM_MODEL=deepseek-v4-pro` for planning/critique, `LLM_MODEL_FAST=deepseek-flash` for the coach. `LLM_THINKING=auto` (default) turns on chain-of-thought for planning and for the coach only when the context is sensitive (pain, low readiness, post-race window, rising load); `on`/`off` force it. The other providers in the enum **do not** have a client: they remain deterministic. The coach **consumes** `RecentContext` (last race/long effort, recovery window, ACWR, gap) since October 27, 2026.
- **LLM methodology and interview (October 30, 2026).** `MethodologyService` asks the LLM for a `MethodologyDecision` (methodology, weekly structure, periodization, phases, alternatives, risks); it is validated against `buildMethodologyEnvelope()` (`packages/domain/src/rules/methodology.ts`) with **one** correction retry, then saved in `methodology_decisions`. `InterviewService` runs the "Talk to the coach" chat (`plan_interviews`, max 6 user replies, prompt `plan-interview-v1`), can update the target date, and on `generate` re-evaluates the methodology with the findings. `PlanService` uses the latest methodology only if it is ≤ 14 days old and refers to the same goal description; otherwise it falls back to the rule-based path. The weekly review re-evaluates the methodology but stays valid if the model is down. Without a model the interview/methodology endpoints answer `503`. **What to say:** the LLM chooses methodology and periodization; the **sessions** are still written by the rule-based generator. Do not describe the plan as fully LLM-generated.
- **`ai_runs` for every LLM call:** coach (`daily_coach`), interview (`plan_interview`) and methodology (`methodology`) log each attempt, failed ones included. Interview and methodology use `recordAiRun()` (`apps/api/src/ai/ai-runs.ts`); the coach still has its own copy. Payload and verdict are not stored yet (ARCHITETTURA-LLM Phase B).
- **Known gaps of the methodology layer:** `ai_runs` logging and backup/wipe coverage were fixed on November 4, 2026. Still open: (1) the envelope is computed by code (`buildMethodologyEnvelope`), which contradicts §9 rule 2: it is a transitional choice until the Critic/Referee exist; (2) prompts and the week skeleton (`qualitySessions`, `longSessionMin`) are running-shaped.
- **LLM errors:** `LlmProviderError` exposes `status` and `retryable` (401/402 non-retryable, 429/5xx/empty response retryable). The key never appears in messages or logs; failures end up in `ai_runs` with `success: false`.
- **Post-race deload: temporary constant, recognized as wrong.** `RECOVERY_RULES` uses 21 days for everyone and `sessionPolicy()` applies the same policy to all sports, so within the window even the gym is limited to RPE 6. It is correct for a beginner and too conservative for an advanced amateur; moreover, the deload is per modality (impact yes/no, upper body ok, heavy eccentrics no), not global. It must be replaced by the envelope proposed by the Proposer and verified by the Referee (`docs/ARCHITETTURA-LLM.md` §5).
- **Only one active macro-plan:** regenerating calls `supersedeMacroPlans()`, which deletes the previous plan and its micro-plans. Without it, two plans with the same `startDate` make `getCurrentMacroPlan` ambiguous.
- **MongoDB:** local on `127.0.0.1:27017`, managed by the user. If it is not listening, `/api/health` responds `degraded`; it is not an API bug. Do not start system services without confirmation.
- **User identity:** all collections are partitioned by `userId` = `users.id`, which is **not** Mongo's `_id`. For the Google account `users.id` is the Google subject (`sub`, e.g. `114007601918490478360`); for dev-login it is `personal`. When migrating or inspecting data always use `users.id`, otherwise the documents exist but the app does not see them.
- **Env:** `apps/api/src/main.ts` always loads the root `.env` (even with cwd
  `apps/api`); spikes use `dotenv/config`. The `config` package validates the variables with Zod. In development the API and spikes accept `secrets/garmin-key.txt` and `secrets/yazio.json` (ignored by git); in production the credentials must come from env/secret manager.
- **Yazio:** unofficial **v22** API with User-Agent gate (`YAZIO_USER_AGENT`). For Google accounts use the imported `refreshToken`; the password grant works only if the account has a Yazio password.

---

## 7. Where to intervene

### New provider integration

1. Read `docs/INTEGRAZIONI.md` and add the provider section.
2. Create `packages/integrations/src/<provider>/`:
   - `<provider>.adapter.ts` (implements `ProviderAdapter`);
   - `<provider>.schema.ts` (Zod for the responses);
   - `<provider>.mapper.ts` (raw → canonical);
   - `fixtures/` (redacted responses).
3. Add contract tests with fixtures, **without network**.
4. Add the provider to `provider_credentials` and to the integrations status UI.
5. Update `docs/INTEGRAZIONI.md` with auth, endpoints, errors, mapping.

### New sport

> **Today** sport logic lives in `packages/domain/src/rules/plan-generator.ts`
> (`build<Sport>Session`, `chooseSport`, `buildSportDraft`) plus the `SportSchema` enum in
> `schemas/common.ts`. Capacity (`rules/capacity.ts`) only knows running (5K projection).
> The target below (`packages/domain/src/sports/`) **does not exist yet**: it is the
> Phase 2 refactor in `docs/FASI.md`. Until then, add a sport by extending those files.

Target recipe (after the refactor):

1. Add the sport module to `packages/domain/src/sports/<sport>.ts`.
2. Define capacity metrics, key session types, intensity anchors, progression, contraindications.
3. Add the lane to the weekly board.
4. Add the export mapping (Garmin/Hevy) if applicable.
5. Add fixtures and tests.

### New plan layer

1. Zod schema in `packages/domain`.
2. Repository (Mongo; SQLite from Phase 3) and migration.
3. Context builder: what the LLM sees.
4. Versioned prompt + JSON schema.
5. Validator and safety.
6. UI with diff and "why".
7. Test + eval.

### New LLM task

1. New prompt in `packages/ai/src/<task>.ts`: system prompt, user instruction, response example and a `<TASK>_PROMPT_VERSION` constant (e.g. `methodology-v1`). Bump the version on every change.
2. Output schema + Zod.
3. Context builder with token budget.
4. `ai_runs` with model, version, hash, cost: call `recordAiRun()` for every attempt, failures included.
5. Eval with personas.
6. Deterministic fallback.

### New web screen

1. Today the web app is a single page: section in `apps/web/src/App.tsx`, component in `apps/web/src/components/`. There is no router or `routes/` folder yet.
2. Query/mutation with TanStack Query; every visible string in `apps/web/src/i18n` (`it.ts` + `en.ts`, covered by `i18n.spec.ts`).
3. Components in `packages/ui` if reusable.
4. States: loading, empty, error, offline.
5. e2e test of the flow.

### New domain rule

1. Pure function in `packages/domain/src/rules/`.
2. Unit tests with edge cases (missing data, outlier, pain, zero load).
3. If it changes the plan behavior, update `PIANO.md` and the eval.

### New export

1. Define the format and the mapping.
2. Implement in `packages/integrations` or `apps/api/src/export`.
3. Test with a real file (Garmin Connect / Hevy).
4. Document the limits and the manual fallback.

---

## 8. Code conventions

- TypeScript strict; `noUncheckedIndexedAccess` if possible.
- kebab-case files: `readiness.service.ts`, `garmin.adapter.ts`.
- PascalCase types, camelCase functions, UPPER_SNAKE constants.
- Zod for every boundary: HTTP, provider, LLM, form, backup.
- Typed errors, not strings; no generic `throw new Error("...")` in the domain.
- NestJS: small modules, thin services, repositories behind an interface.
- React: function components, no domain logic in the component.
- Dates: ISO 8601 + explicit timezone; shared utilities.
- Money/units: not applicable; SI units.
- Comments: only for the "why", not for the "what".

---

## 9. AI and prompts

Full design, roles and implementation steps: `docs/ARCHITETTURA-LLM.md`.

Three rules that come from there and are non-negotiable:

1. **The context is not improvised.** The model receives a dossier compiled by code (Garmin data, history, individual response, plan memory), not a chat history.
2. **The envelope is an output, not an input.** The method, the deload duration and the intensity distribution are proposed by the LLM, challenged by the Critic and verified by the Referee. They are not constants in the code. *Transitional exception:* until the Critic and Referee exist, the methodology layer validates the LLM against a code-computed envelope (`buildMethodologyEnvelope`). Do not grow that envelope with new training knowledge: move it to the Proposer when Phase C of `docs/ARCHITETTURA-LLM.md` lands.
3. **The Referee contains only arithmetic.** If it grows beyond consistency checking, it is a design error: that is knowledge, and it belongs in the Proposer.

- One prompt per file (`packages/ai/src/<task>.ts`), versioned through its `*_PROMPT_VERSION` constant (`v1`, `v2`); note the reason of each bump in the commit message.
- System prompt: role, methodology, constraints, style, medical prohibitions.
- User message: explicit context blocks, not chat history.
- Output: strict JSON schema + Zod.
- Temperature: 0.2–0.3 for planning, 0.5–0.7 for narrative.
- Cache by `contextHash`.
- `ai_runs` for each call: provider, model, promptVersion, contextHash, token, cost, validation.
- Evals before changing prompt/model.
- Do not send photos or clinical texts without consent.
- Do not use arbitrary free tiers for health data.

---

## 10. Testing

| Type | What | Command |
|---|---|---|
| Unit | rules, feasibility, validator | `npm test` |
| Contract | adapter with fixtures | `npm test` |
| E2E | onboarding → plan → check-in → review, multi-user isolation | `npm run test:e2e` |
| AI eval | 10 personas, schema/safety | planned (`npm run eval`) |
| Backup | export → wipe → import | dedicated test |
| Device | Health Connect, Hevy, Garmin `.FIT` | manual |

Rules:

- No network in CI tests: recorded fixtures.
- Every rule bug → regression test.
- Every new provider → fixture + 401/429 error test.
- Every backup change → compatibility test.

---

## 11. Security and privacy

- `.env` never committed; `.env.example` yes.
- Provider credentials encrypted with AES-256-GCM; master key in env/secret manager.
- Android: Android Keystore.
- Redacted logs: never tokens, keys, photos, clinical texts, unnecessary emails.
- Upload: limits, MIME sniffing, image re-encoding, short signed URLs.
- Rate limit on auth and plan generation.
- Multi-tenant: `userId` required in the repository; cross-tenant access test.
- Encrypted backups; restore test.
- Dependencies: justify every new library; prefer maintained ones.

---

## 12. What NOT to do

- Do not use Next.js.
- Do not integrate Strava.
- Do not use an autonomous agent to generate or modify the plan.
- Do not save unvalidated LLM output.
- Do not modify past versions of plans, profiles, reviews.
- Do not bypass the validator "to make the demo work".
- Do not invent API endpoints or fields: verify in `docs/INTEGRAZIONI.md` or in the official docs.
- Do not use Garmin username/password or scraping.
- Do not log health data or secrets.
- Do not commit `.env`, photos, `.FIT`, backups.
- Do not add `any` or casts to compile.
- Do not change a prompt without eval.
- Do not run `git push`, `reset --hard`, `rebase` of shared branches, or force-push without confirmation. Do not commit directly on `main`: use a branch and a PR.
- Do not start or stop MongoDB/Redis or other system services without confirmation.
- Do not delete user data without backup and confirmation.

---

## 13. Definition of Done

A task is done when:

- [ ] Complete and typed implementation.
- [ ] Unit/contract/e2e tests where applicable.
- [ ] No secrets or health data in logs.
- [ ] Compatible migration/backup.
- [ ] Phase acceptance criteria met.
- [ ] Documents updated (`PIANO`, `FASI`, `INTEGRAZIONI`, `AGENT`).
- [ ] Manual verification on real data, if the task touches an integration.
- [ ] No regression in existing tests.

---

## 14. Open decisions

Before implementing, check whether the task depends on one of these:

| Decision | Status | Default |
|---|---|---|
| Android Expo vs Kotlin | open | Expo/RN, native module if needed |
| Automatic Garmin push | open | manual `.FIT`; Startup later |
| Web deploy | open | Local for now; EU VPS when remote access is needed |
| Web DB Mongo vs SQLite | decided: Mongo | do not change without reason |
| Zepp | open | Health Connect on Android; unofficial API web only |
| LLM default | decided: BYOK | managed for tests |
| Autonomous agent vs role-based pipeline | **decided: pipeline** | no agent that chooses tools; deterministic data collection |
| Authority over the envelope | **decided: LLM proposes, Critic attacks, Referee verifies** | no training constants in the Referee |
| Provider/model for Proposer and Critic | open | two different providers, keys in `.env` |
| Methodology envelope: code vs LLM | **transitional: code** (`buildMethodologyEnvelope`) | moves to Proposer + Critic in ARCHITETTURA-LLM Phase C |
| Sport model: one generator vs per-sport modules | open (proposed in FASI Phase 2) | per-sport modules in `packages/domain/src/sports/`, strength first |

If a decision changes, update `PIANO.md` and this file **in the same commit**.

---

## 15. How to work (procedure)

1. Read `docs/FASI.md` and choose **one** task from the current phase.
2. Check the dependencies (API key, account, device).
3. Write the schema/test first, then the implementation.
4. Run typecheck, lint, test.
5. Manually verify the real flow, if applicable.
6. Update the documentation.
7. Report: what you did, what you could not verify, residual risks.

If an API does not work as documented:

- do not work around it with silent hacks;
- update `docs/INTEGRAZIONI.md` with the actual behavior;
- add a fixture/test;
- evaluate a fallback;
- report the risk.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Baseline (L0)** | Stable data: profile, medical history, goals, availability, equipment |
| **Macro (L1)** | 8–16 week block, phases and targets |
| **Micro (L2)** | Training week |
| **Day (L3)** | Adaptation of today's session |
| **Review (L4)** | Weekly/monthly check and decisions for the next cycle |
| **Readiness** | Readiness score from HRV, RHR, sleep, subjective input, load |
| **sRPE** | Load = RPE × minutes |
| **ACWR** | Acute/chronic load ratio (flag, not law) |
| **Validator** | Schema + rules + safety check before publishing |
| **Adapter** | Component that normalizes an external source into the canonical model |
| **Backup bundle** | Encrypted ZIP with data + assets for restore |

---

## 17. Useful links

- Garmin Personal API: <https://developer.garmin.com/gc-developer-program/personal/>
- Garmin Personal FAQ: <https://developer.garmin.com/gc-developer-program/personal/personal-faq/>
- Garmin FIT SDK JS: <https://github.com/garmin/fit-javascript-sdk>
- Unofficial Yazio API: <https://github.com/saganos/yazio_public_api>
- Zepp health CLI: <https://github.com/m4ary/zepp-health-cli>
- Hevy API: <https://api.hevyapp.com/docs/>
- Health Connect: <https://developer.android.com/health-and-fitness/guides/health-connect>
- Strava API Policy (why it is excluded): <https://www.strava.com/legal/api_policy>
