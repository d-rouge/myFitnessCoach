File: docs/PIANO.md (part 1)

# AI Personal Trainer — Product plan and architecture

**Version:** 0.3.0  
**Date:** October 26, 2026  
**Status:** v0.3 — Phase 0 completed (scaffold, Garmin/Yazio sync, FIT brief, workout .FIT export, basic auth and spikes ready)  
**Related documents:** [`FASI.md`](FASI.md) · [`INTEGRAZIONI.md`](INTEGRAZIONI.md) · [`../AGENT.md`](../AGENT.md)

---

## 0. v0.2 decisions (compared with v0.1)

| Theme | v0.1 | **v0.2 (decided)** |
|---|---|---|
| Scope | SaaS-ready | **Personal use**, then a testing phase with a few users |
| Web | Next.js full-stack | **NestJS + React (Vite)**, two separate processes |
| Tooling | pnpm + Turborepo | **npm workspaces**, no pnpm/Turbo |
| NestJS | 11 (CJS) temporary | **12 (ESM)**, `type: module` + import `.js` |
| Web DB | MongoDB | **MongoDB** for web data; Android **local** |
| Mobile | iOS + Android | **Android only**; local data, Mongo only for the account |
| Sport | running-first | **gym, running, cycling, swimming** to test feedback |
| Sources | Garmin Startup, Strava excluded | **Garmin Personal**, **Yazio (unofficial API)**, **Zepp (weight)**, **Hevy**; Strava **out** |
| Export | not a priority | **gym workout plans → Hevy**; **running/cycling/swimming workouts → Garmin** |
| LLM | BYOK + managed | unchanged: **BYOK + managed free + optional local** |
| Strava | excluded | **definitively excluded**: it is not a source for the product |

### Implementation status (October 26, 2026)

| Area | Status |
|---|---|
| npm workspaces monorepo | done |
| Zod domain + rules (readiness, load, feasibility, progression, safety, validator, date/timezone) | done, 99 tests |
| Garmin Personal client + mapper + contract tests | done, 40 tests in the integrations package |
| Garmin spike with real key | done (6 activities, daily metrics, Body Battery, RHR, SpO₂, `.FIT`); weight 0 |
| Persistent Garmin sync (activities + metrics) | done (3 activities, 7 days, idempotent) |
| Yazio client v22 + mapper + sync + UI | done; **real test OK** (7 days, weight); refresh token support for Google |
| FIT parser + ActivityAnalysis + LLM brief | done (real FIT: 17,492 records → brief ~2 KB) |
| Garmin workout `.FIT` export | done (encoder with `@garmin/fitsdk`, tests validated with official Decoder, script and download endpoint) |
| Local / Google / Dev Auth module and `/api/me` | done (NestJS `AuthModule`, email + password account with scrypt, Google allowlist, linking by email, JWT session, Mongo `users` collection, Google/local/dev login/registration and logout in the UI) |
| Spikes documented with verdict | done (`garmin.md`, `garmin-export.md`, `yazio.md`, `zepp.md`, `hevy.md`) |
| NestJS API `health` + Garmin/Yazio `sync`/`overview` + `export` + `auth` | done |
| React/Vite web app with Garmin data + Yazio nutrition + FIT export + athlete profile | done |
| Total tests | 239 unit + 14 e2e checks on real MongoDB |
| Local MongoDB `127.0.0.1:27017` | configured (managed by the user) |
| Local git repository (`main`, no remote) | done |
| Next steps | Phase 1 functionally complete; 14-day usage validation, then F1-18/F1-19 or Phase 2 |

**What remains valid from v0.1** (it is the heart of the project):

1. Deterministic engine + LLM, not "a prompt that does everything".
2. Versioned 5-layer knowledge: baseline → macro → micro → day → review.
3. Stateless and explicit context: stable base + trends + recent days + constraints.
4. Validator and safety gate before publishing a plan.
5. Serious privacy and security, even in personal use.

---

## 1. Product

### 1.1 Promise

> "Tell me who you are, what you want to achieve and how much time you have. I build the plan, adapt it every day to your data and explain every choice."

The app is not a tracker: it is a coaching cycle. The value is the loop

> data → interpretation → plan → execution → feedback → updated plan

### 1.2 Personal use, then testing

The first version is for you. This changes the priorities:

- less multi-tenant abstraction, more speed;
- Garmin Personal API is sufficient (it is designed for personal use);
- unofficial APIs (Yazio, Zepp) are acceptable with isolation and awareness of the risks;
- Android can be local-first, without bringing health data to the server;
- the testing phase with other users is a separate project (multi-user auth, consents, DPIA, Garmin Startup).

### 1.3 Non-goals

- It is not a medical device: no diagnosis, treatment or rehabilitation.
- It is not a complete food diary: it reads/aggregates data and sets targets.
- It is not a social fitness app.
- It is not a substitute for a doctor, physiotherapist, nutritionist or certified coach.
- It does not promise aesthetic transformations within defined times.

### 1.4 The loop

```
L0 BASELINE  profilo · anamnesi · obiettivi · disponibilità · attrezzatura
      │
      ▼
L1 MACROCICLO  8–16 settimane · fasi · test · volumi
      │
      ▼
L2 MICROCICLO  1 settimana · sessioni · target · luogo · attrezzatura
      │
      ▼
L3 GIORNO      conferma / riduzione / swap / riposo · spiegazione
      │
      ▼
L4 REVIEW      settimanale / mensile / fine blocco → nuovo micro / macro
```

Rule: **level N does not rewrite N−1**. It supersedes it with a new version and leaves a trace of why.

### 1.5 Personal metrics (first 8 weeks)

| Area | What to measure | Target |
|---|---|---|
| Adherence | completed / planned sessions | > 75% |
| Data | days with at least one device data point or check-in | > 85% |
| Coaching | weekly reviews read | > 80% |
| Quality | plans that pass the validator on the first attempt | > 95% |
| Cost | LLM cost/month | < €3 (BYOK: €0) |
| Safety | pain/red flags handled and tracked | 100% |

---

## 2. Data sources and API reality

Operational details, endpoints and mapping: [`INTEGRAZIONI.md`](INTEGRAZIONI.md).

### 2.1 Matrix

| Source | What it provides | Access | Limits | Use in the project |
|---|---|---|---|---|
| **Garmin Personal API** | activities JSON + `.FIT`, sleep, HRV, RHR, stress, Body Battery, steps, weight, food log | Personal key from Garmin Connect, 24h token, **pull** | Personal use only; key valid for 30/90/180/365 days; **read-only**; no workout push; no refresh token (the key is reused) | **Passive web sync yes**: server-side polling. Main source for running/cycling/swimming |
| **Garmin Training API** | structured workout push | Startup/Enterprise program | Requires organization; no history; free up to ~1,000 users | Next phase, only if you want automatic push |
| **Yazio** | diary, nutrients-daily, summary, macros, weight | **Unofficial API v22** (JSON token, User-Agent gate, refresh token import) | No public API; ToS; 2FA; Google login without password; possible breakages; UA to update | **Personal use**: isolated adapter, encrypted credentials/tokens, feature flag |
| **Zepp** | weight, body composition, HR, sleep, activity | **Unofficial API** (token from proxy capture, ~30 days) **or Health Connect on Android** | Fragile; expiring token; region-specific; ToS | **Weight**: optional adapter; on Android prefer Health Connect |
| **Hevy** | routines, completed workouts, exercise templates, body measurements | **Public API**, Hevy Pro only, API key | Beta, no stability guarantee; requires Pro | **Gym routine export** and import of completed workouts |
| **Android Health Connect** | steps, sleep, HR, weight, exercise, nutrition (if apps write) | Native Android app | Android 14+ for some integrations; granular permissions; Play policy | **Primary Android source**; Garmin/Zepp can arrive via HC |
| **Strava** | activities | API with AI ban | **Prohibited for use in AI Application** (API Policy 2026 §5.3) | **Excluded** |
| **Apple Health** | — | iOS only | Not relevant: Android-only | Out of scope |

### 2.2 Direct answers

**Garmin: is passive sync on the web with a personal key possible?**  
**Yes.** The Personal API is designed exactly for this: you create a key, give it to your backend, the backend exchanges it for a 24-hour token and periodically polls activities, sleep, HRV, RHR, weight, steps, stress. There are no webhooks: it is **pull**. The key expires (30/90/180/365 days) and must be rotated; the token is regenerated from the key. It is **read-only**: you cannot send workouts to Garmin with this API.

**Yazio: can it be used?**  
Yes, via unofficial API. The current community spec is **v22** (no longer v15), with `nutrients-daily`, summary, goals and latest weight. It requires a **valid app User-Agent** (`YAZIO_USER_AGENT`) and, for Google/social accounts, an **imported refresh token**: password grant works only if the account has a Yazio password. It is not official: it must be isolated, with encrypted tokens and manual fallback.

**Zepp: can weight be retrieved?**  
Yes, via unofficial endpoint `GET /users/{id}/members/-1/weightRecords`, but it requires an `app_token` obtained from a proxy capture and expires in ~30 days. On Android the clean alternative is **Health Connect** (if the Zepp app writes weight). For the web: optional adapter, not a critical dependency.

**Hevy: can plans be exported?**  
Yes. The public API (Hevy Pro) allows creating routines, reading workouts, creating exercise templates and managing body measurements. It is the right channel for gym export.

**Garmin: can running workouts be sent?**  
Not with the Personal API. Options:
1. **Manual (recommended now):** you generate a workout `.FIT` file and import it into Garmin Connect (Training > Workouts > Import) or copy it into the device's `NewFiles` folder.
2. **Automatic (later):** Garmin Training API, available with Startup/Enterprise.
3. **Not recommended:** unofficial libraries that use Garmin username/password; they work but violate the ToS and break with MFA.

---

## 3. Scope

### 3.1 Personal MVP — "the loop works"

**Must have**

- Google login (your email allowlisted in personal mode).
- Onboarding: profile, medical history, goals, availability, equipment, preferences, optional photos.
- Editable baseline summary ("here is what I understood").
- 8–16-week macrocycle + weekly microcycle.
- Multisport board: gym, running, cycling, swimming.
- "Today" card with session, alternatives and "why".
- Morning check-in (20 sec) and post-session check-in (RPE, sensations, pain).
- Garmin Personal sync (activities, sleep, HRV, RHR, weight).
- Yazio sync (summary, macros, weight).
- Manual entry and `.FIT`/`.TCX` upload.
- Weekly review + next microcycle.
- Gym routine export → Hevy.
- Running/cycling/swimming workout export → `.FIT` for Garmin (download + manual import).
- BYOK LLM + managed fallback.
- Data export/backup.

**Should have (phase 2)**

- Zepp weight (unofficial adapter or Health Connect).
- Import of completed workouts from Hevy.
- Automatic adaptation to new data.
- Notifications.
- Backup to Google Drive.

**Could have**

- Photo analysis.
- Coach chat.
- Automatic Garmin push via Training API.
- Apple Health.

**Won't have (for now)**

- Strava.
- Payments.
File: docs/PIANO.md (part 3)

- Multi-coach.
- Rehabilitation/clinical nutrition.

### 3.2 MVP exit criterion

You use it for **2 consecutive weeks**: at least 80% of sessions are tracked, the plan adapts to Garmin/Yazio data, Hevy export works, backup restores, no plan violates safety constraints.

---

## 4. 5-layer knowledge

| Layer | Content | Lifespan | Who produces it | When it changes |
|---|---|---|---|---|
| **L0 Baseline** | profile, medical history, conditions, injuries, goals, availability, equipment, preferences, photos | permanent, versioned | user + AI intake | user edit or relevant event |
| **L1 Macrocycle** | 8–16 weeks, phases (base/build/peak/taper), tests, volumes, intensity distribution | 8–16 weeks | AI planner + engine | end of block or review that disproves assumptions |
| **L2 Microcycle** | 1 week, sessions, targets, location, equipment, alternatives | 1 week | AI planner + engine | every week or on request |
| **L3 Day** | confirmation/reduction/swap/rest, motivation, alternative | 1 day | AI adjuster + engine | every morning or on new data |
| **L4 Review** | metrics, adherence, progress, flags, decisions, input to next cycle | 1 week / 1 month / 1 block | AI reviewer + engine | Sunday, end of block, end of macro |

### 4.1 Versioning

- Append-only: new version, not an edit.
- Fields: `version`, `validFrom`, `supersededAt`, `contentHash`, `createdBy`, `engineVersion`, `promptVersion`, `model`, `contextHash`.
- Partial unique index: `(userId, kind)` with `supersededAt: null`.
- Each plan retains the reference to the baseline used. If the baseline changes, the plan becomes `needsReview`, it is not rewritten.
- Each regeneration shows a **diff**: what changes, why, which data.

### 4.2 Cascading invalidation

| Event | Effect |
|---|---|
| Injury/acute pain | immediate L3; L2/L1 `needsReview`; contraindicated exercises blocked |
| Goal/race date change | L1 `needsReview` + new feasibility check |
| Reduced availability | L2 regenerated; L1 verified |
| New weight/photo | L4 updated; L1 unchanged unless deviation exceeds threshold |
| Device disconnected | no invalidation; data confidence lowered |

---

## 5. Architecture

### 5.1 Overview (personal web)

```
┌──────────────────┐        ┌───────────────────────────┐        ┌───────────────────┐
│ React + Vite     │───────▶│ NestJS API                │───────▶│ MongoDB           │
│ PWA              │        │ auth · CRUD · OpenAPI     │        │ dati + versioni   │
└──────────────────┘        └──────────────┬────────────┘        └───────────────────┘
                                           │ BullMQ
                                           ▼
                             ┌───────────────────────────┐        ┌───────────────────┐
                             │ Worker NestJS             │───────▶│ LLM providers     │
                             │ sync · regole · pipeline AI│        │ BYOK / managed    │
                             └──────────────┬────────────┘        └───────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
          │ Garmin Personal │     │ Yazio / Zepp    │     │ Hevy / R2       │
          │ pull API        │     │ API non ufficiali│    │ export / file   │
          └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 5.2 Android local-first

```
┌──────────────────────────────┐
│ App Android (Expo/RN)        │
│  SQLite locale               │──▶ Health Connect
│  dominio + regole condivisi  │──▶ Garmin Personal / Yazio / Hevy (diretto)
│  coda di sync / outbox       │──▶ LLM (BYOK o API managed)
└──────────────┬───────────────┘
               │ backup cifrato (ZIP)
               ▼
      Google Drive personale
               │
               └── (solo account) ──▶ NestJS + MongoDB
```

Health data **does not** travel from the phone to MongoDB. The server is used for:
- Google authentication and account profile;
- backup metadata (optional);
- managed LLM (only if the user agrees to send the context);
- optional future synchronization (not now).

### 5.3 Stack

| Level | Choice | Why |
|---|---|---|
| API | **NestJS 12 (ESM) + TypeScript 6** | Modules, DI, scheduler, BullMQ, validation, Swagger/OpenAPI; suitable for many integrations |
| Web | **React + Vite + React Router + TanStack Query** | Fast SPA, PWA, no SSR needed; less magic than Next |
| UI | **Tailwind + shadcn/ui** | Controllable components, accessibility, speed |
| Auth | **Google OAuth**; for personal use, email allowlist | Simple; multi-user in test phase |
| Web DB | **local MongoDB** (`127.0.0.1:27017`) | Plan as a versioned document; flexible; Atlas free if remote is needed |
| Android DB | **SQLite** (expo-sqlite or Room) | Offline, local, backup as file |
| Validation | **Zod** | Single source for DTOs, forms, LLM output |
| Jobs | **BullMQ + Redis** (next phase) | Sync, parsing, AI, retry, cron |
| Storage | **R2 / S3 / local filesystem** | Photos, `.FIT`, backups |
| Hevy export | **Hevy Public API** (Pro) | Routines and workouts |
| Garmin export | **`.FIT` workout** + manual import | Works without partner program |
| LLM | **Multi-provider adapter** | BYOK, managed, locale; JSON schema |
| Test | **Vitest + Playwright + eval suite** | Rules, e2e, AI quality |

**Why NestJS and not Express:** with 5 integrations, scheduled jobs, AI pipelines, validation and an Android client, Express would require reinventing modules, DI, scheduler, queues and Swagger. NestJS costs a bit of boilerplate but gives structure. If the project really stays tiny, a modular Fastify is the alternative; we're not starting from there.

**NestJS 12 is ESM-only:** `apps/api` has `"type": "module"`, `module`/`moduleResolution: nodenext` and relative imports with `.js`. It's not a migration to do: it's the initial configuration.

### 5.4 Monorepo

```
apps/
  api/              NestJS 12 (ESM): health, integrations; auth/profile/plans/metrics/ai/export da creare
  web/              React + Vite + Tailwind
  mobile/           Expo (fase 3, non ancora creata)
packages/
  domain/           Zod, tipi, motore regole, feasibility, safety (puro, no I/O)
  db/               client Mongo e ping (repository da creare)
  integrations/     Garmin client; yazio/zepp/hevy/fit da creare
  ai/               interfacce provider/prompt (stub)
  ui/               utility UI condivise (cn)
  config/           env Zod, feature flag
```

Tooling: npm workspaces, TypeScript strict, Biome, Vitest. Playwright/eval suite will be added with the e2e/AI flows.

### 5.5 Why the domain is shared

`packages/domain` doesn't know about Mongo, HTTP or React. It contains:
- Zod schemas (profile, plan, session, check-in);
- rules (readiness, load, progression, safety, feasibility);
- date/timezone types and utilities.

The same package runs in NestJS and in Expo. If in the future Android becomes Kotlin, the domain must be ported or exposed via API; that's why keeping it pure and tested is important.

### 5.6 Abstract repositories and storage

```ts
interface TrainingRepository {
  getCurrentProfile(userId: string): Promise<Profile>;
  saveProfileVersion(userId: string, data: Profile): Promise<ProfileVersion>;
  getCurrentPlan(userId: string): Promise<Plan | null>;
  savePlanVersion(userId: string, plan: Plan): Promise<PlanVersion>;
  // ... sessions, checkins, metrics, activities, reviews
}

interface BackupPort {
  exportAll(userId: string): Promise<BackupBundle>;
  importAll(userId: string, bundle: BackupBundle): Promise<void>;
}
```

- Web: `MongoTrainingRepository`.
- Android: `SqliteTrainingRepository`.
- Backup: `ZipBackupAdapter` + `GoogleDriveBackupAdapter`.

### 5.7 Backup and portability

Format `health-trainer-backup-v1.zip`:

```
manifest.json          schemaVersion, createdAt, appVersion, checksum
data/profile.json
data/anamnesis.json
data/goals.json
data/plans/*.json
data/sessions/*.json
data/checkins/*.json
data/metrics/*.json
data/activities/*.json
data/nutrition/*.json
data/reviews/*.json
assets/photos/*
assets/fit/*
```

- Client-side encryption with a passphrase (AES-GCM + Argon2id, or `age`).
- Upload to Google Drive with the `drive.file` scope, folder `HealthTrainer/Backups`.
- Retention: the last N backups + one monthly.
- Restore: validates the manifest, migrates the schema, rebuilds indexes.
- The web app can import the same ZIP for analysis/visualization.

---

## 6. Data model

### 6.1 Web collections (MongoDB)

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | account | email, name, locale, timezone, status |
| `consents` | consents | userId, type, version, grantedAt, revokedAt |
| `athlete_profiles` | L0 profile | version, validFrom, sex, birthDate, heightCm, weightKg, experienceTier (derived), history, capacity |
| `anamnesis` | L0 medical history | conditions[], medications[], injuries[], redFlags[], freeText |
| `goals` | L0 goals | primary{}, secondary[], targetDate |
| `availability` | L0 availability | weekly[], blackouts[] |
| `equipment` | L0 equipment | items[], memberships[] |
| `preferences` | L0 preferences | sports, dislikes, tone, units |
| `body_assessments` | photos/measurements | date, photos[], measurements |
| `plans` | L1 macro | version, status, phases[], rationale, hashes |
| `weeks` | L2 micro | planId, index, focus, targetLoad, sessionIds[] |
| `sessions` | sessions | date, sport, type, blocks[], equipment[], alternatives[], status |
| `daily_states` | computed state | readiness, flags, acwr, ctl, atl, sleepDebt |
| `daily_adjustments` | L3 | decision, changes[], rationale, contextHash |
| `checkins` | feedback | sleepQuality, soreness[], pain[], mood, energy, rpe |
| `session_logs` | execution | plannedSessionId, completed, actualDuration, rpe, feedback |
| `strength_sets` | gym sets | sessionLogId, exerciseKey, hevyTemplateId, setIndex, reps, weightKg, rpe |
| `metrics_daily` | daily series | source, restingHr, hrv, sleep, steps, weight, stress |
| `activities` | normalized activities | source, externalId, sport, start, duration, distance, avgHr, power |
| `nutrition_daily` | nutrition | kcal, protein, carbs, fat, source, confidence |
| `reviews` | L4 | period, metrics, adherence, decisions, nextCycleInputs |
| `provider_credentials` | credentials | provider, encryptedPayload, expiresAt, status |
| `sync_runs` | sync audit | provider, startedAt, status, stats, error |
| `sync_state` | last sync per provider | userId, provider, lastSyncAt, status, error |
| `export_jobs` | export | type (hevy/garmin/backup), status, fileKey |
| `hevy_mappings` | exercise mapping | exerciseKey, hevyTemplateId |
| `ai_runs` | AI audit | layer, model, promptVersion, contextHash, tokens, cost, validation |
| `prompt_versions` | prompt registry | key, version, body, schema |
| `audit_log` | security | actor, action, entity, ts |

### 6.2 Android Tables (SQLite)

Same entities, in relational tables:

```
profile, anamnesis, goals, availability, equipment, preferences
plans, weeks, sessions, daily_states, daily_adjustments
checkins, session_logs, metrics_daily, activities, nutrition_daily, reviews
provider_credentials (Keystore), sync_state, outbox, backup_state
```

- `outbox` for operations to send (export, backup, LLM).
- `sync_state` for cursor/last sync per provider.
- `provider_credentials` encrypted with Android Keystore.
- Versioned migrations; backup compatible across versions.

### 6.3 Versioning

```json
{
  "_id": "…",
  "userId": "u_123",
  "kind": "profile",
  "version": 3,
  "validFrom": "2026-10-26T00:00:00Z",
  "supersededAt": null,
  "data": { "heightCm": 178, "weightKg": 74.2 },
  "contentHash": "sha256:…",
  "createdBy": "user",
  "schemaVersion": 1
}
```

### 6.4 Activity Deduplication

1. Strong key: `(source, externalId)`.
2. Weak key: same sport, start ±2 min, duration ±5%, distance ±5%.
3. Priority: `.FIT` > Garmin API > Health Connect > manual.
4. Keep `sources[]` with provenance; do not add twice.

### 6.5 Units and Timezone

- SI storage: meters, seconds, kg, bpm.
- Display according to preferences.
- The "day" is local (IANA timezone); timestamps are UTC.
- Plan dates are local `YYYY-MM-DD`.

---

## 7. AI Pipeline

### 7.1 Principle

> **Updated on October 27, 2026.** The previous formulation ("the engine
> calculates the constraints, the LLM chooses within them") was rejected: deload
> duration, return to the gym, taper, and intensity distribution are
> contested knowledge and depend on the athlete. The current design is in
> [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md).

The code builds the context and checks coherence; the LLM proposes method,
envelope, and plan; a second LLM role challenges them before publication.

| Code (deterministic) | LLM (Proposer) | LLM (Critic) | Code (Referee) |
|---|---|---|---|
| data collection and calculation, dossier | method and rationale | verdict with violations | arithmetic and availability |
| derived values: load, readiness, adherence, capacity | envelope per modality | challenge to the envelope | plan vs declared envelope |
| persistence and provenance | macro and micro plan | method ↔ sessions coherence | no training knowledge |

Knowledge resides in the **methods library** read by the Proposer, not in
constants in the code. The current rule-based generator remains as a declared
fallback when Proposer and Critic do not converge.

### 7.2 Stages

```
[1] Ingest → [2] Compute → [3] Context → [4] Generate
→ [5] Validate (Zod + regole + safety critic) → [6] Persist + diff → [7] Explain
```

If validation fails: repair loop (max 2), then fallback to a deterministic template. Never publish an invalid plan.

### 7.3 Roles (specialized prompts, not autonomous agents)

| Role | Input | Output |
|---|---|---|
| Intake Structurer | free-form medical history + form | JSON + red flag |
| Macro Planner | baseline, goal, feasibility, methodology | phases, weeks, targets |
| Micro Planner | macro, review, availability | weekly sessions |
| Daily Adjuster | daily_state, session, last 3 days | decision + explanation |
| Reviewer | 7/28 days, adherence, goals | review + decisions |
| Safety Critic | plan + declared envelope + rubric | verdict: violations with evidence and requested correction |
| Referee (code, not LLM) | plan + envelope | arithmetic and availability inconsistencies |
| Chat Coach (phase 4) | question + context | answer + proposed change |

No agent writes directly to the plan. Proposals go through the validator and, for structural changes, through user confirmation.

### 7.4 Context Contract

| Block | Content | Token target |
|---|---|---|
| `athlete_brief` | profile, medical history, constraints, goal, availability, equipment, preferences | 800–1.200 |
| `constraints` | objective constraints: days and windows, equipment, injuries, red flags, PAR-Q | 150–250 |
| `individual_response` | prescribed vs reported RPE, actual adherence, recurrent pain | 200–300 |
| `method_memory` | current method, macrocycle phase, what has worked | 300–500 |
| `macro_summary` | phases, focus, targets | 300–500 |
| `current_week` | sessions, status, previous review | 500–800 |
| `trend` | 7/28-day aggregates | 500–800 |
| `recent` | last 3–7 days | 400–800 |
| `methodology` | excerpt by sport/goal/phase | 500–1.000 |
| `output_schema` | JSON schema + style rules | 300–600 |

Total: **3.500–6.000 tokens** for the day, **8.000–14.000** for macro/micro.

### 7.5 Coherence

1. Immutable base + hash in every call.
2. Explicit chain: macro → micro → day → review.
3. Numbers derived from data (load, readiness, adherence, capacity) calculated by the engine. The envelope is **proposed** by the LLM, challenged by the Critic, and checked by the Referee: it is not a calculated number, it is a justified and tracked choice.
4. Diff and confirmation on every regeneration.
5. Versioned prompts + eval.
6. Low temperatures for planning (0.2–0.3).
7. Cache for `contextHash`.

### 7.6 LLM Modes

| Mode | Who pays | Use |
|---|---|---|
| **BYOK** | user | default for personal use; quality and cost under control |
| **Managed free** | app | monthly quota with low-cost model |
| **Managed premium** | subscription | test / commercial phase |
| **Locale (Ollama)** | user | maximum privacy; variable quality |

Do not use arbitrary free tiers for health data: they often allow training on the data and have unstable quotas. The free mode must be paid for by the app or local.

### 7.7 Eval

- 10 personas: beginner 5k, sub-20, hypertrophy, postpartum, painful knee, asthma, shift worker, zero equipment, gym only, master 55+.
- Assertions: valid schema, no contraindicated exercises, volumes within caps, feasible or scaled-down goal, no diagnostic phrasing.
- Human review by a certified coach on 20 plans before testing with other users.

---

## 8. Deterministic engine

Modules in `packages/domain`:

| Module | Responsibility |
|---|---|
| `readiness` | score 0–100 + flags from HRV, RHR, sleep, subjective, load |
| `load` | sRPE, TRIMP, CTL/ATL, ACWR, monotony, strain |
| `progression` | weekly caps, deload, taper, intensity distribution |
| `feasibility` | realistic estimate of the goal (Riegel/VDOT + experience + volume) |
| `safety` | red flags, contraindications, pain, RED-S, nutritional limits |
| `scheduler` | session placement, recovery between hard sessions |
| `validator` | LLM output compliance |

### 8.1 Readiness

```ts
const zHrv = (hrvToday - mean(hrv28)) / sd(hrv28);
const zRhr = (rhrToday - mean(rhr28)) / sd(rhr28);
const readiness =
  0.35 * clamp(50 + 25 * zHrv, 0, 100) +
  0.15 * clamp(50 - 25 * zRhr, 0, 100) +
  0.25 * sleepScore +
  0.25 * subjectiveScore;
```

Without a wearable: subjective only + load, `confidence: "low"`.

### 8.2 Multisport load

- **sRPE** = `RPE × minuti`: universal metric for gym, running, cycling, swimming.
- **TRIMP** from HR when available.
- **CTL/ATL** = 42/7-day exponential averages.
- **ACWR** = acute 7d / chronic 28d (EWMA). It is a flag, not a law.
- Show load per sport + aggregate sRPE, stating the metric.
- Do not sum different units (bike TSS, run TRIMP, gym volume) without normalizing.

### 8.3 Progression (defaults, to be validated with a coach)

| Rule | Value |
|---|---|
| Weekly volume increase | ≤ 10% |
| Long run | ≤ 30–35% of weekly volume |
| Intense sessions | ≤ 2/week for 5k; ≥ 48h between them |
| Intensity distribution | ~80% easy / 20% intense |
| Deload | every 4th week, −30–40% volume |
| Taper | 2 weeks, −20% then −40%, intensity maintained |
| Strength | 2×/week, full body, RPE 6–8 |
| Strength + quality | not on the same day if possible |

### 8.4 Feasibility

For a 5k: estimate the current time, apply Riegel `t2 = t1 × (d2/d1)^1.06`, estimate realistic improvement based on experience, volume, adherence, and time. If the gap is too large, propose an intermediate goal. **The app must be able to say "no".**

### 8.5 Safety

Absolute blocks: chest pain, syncope, significant palpitations, uncontrolled hypertension, recent surgery, suspected stress fracture, pregnancy without clearance, active eating disorders, fever/infection.

Adaptations: asthma (warm-up, inhaler), beta-blockers (RPE instead of HR), tendon pain (less impact), anemia (less intensity), night shifts (protect sleep).

Nutrition: deficit ≤ 0.5–1% body weight/week; protein 1.6–2.2 g/kg; energy availability > 30 kcal/kg FFM; no extreme fasting.

### 8.6 Validator

```
schema ok?
sessioni complete (sport, durata, intensità)?
nessun esercizio controindicato?
volume ≤ cap?
progressione ≤ cap?
recupero ≥ 48h tra sessioni dure?
obiettivo fattibile o ridimensionato?
nessuna frase diagnostica/prescrittiva?
alternative presenti?
```

If it fails: repair prompt with the errors; then fallback template. Better a simple and safe plan than a brilliant and wrong one.

---

## 9. Integrations and export (summary)

Details: [`INTEGRAZIONI.md`](INTEGRAZIONI.md).

### 9.1 Flows

| Flow | Direction | Mechanism | Frequency |
|---|---|---|---|
| Garmin activities/health | Garmin → app | Personal API pull | 30–60 min (activities), 1×/day (health) |
| Yazio diary/macros/weight | Yazio → app | Unofficial API | 1–2×/day |
| Zepp weight | Zepp → app | Unofficial API or Health Connect | 1×/day |
| Hevy routine | app → Hevy | Public API `POST /v1/routines` | on demand |
| Hevy completed workouts | Hevy → app | Public API `GET /v1/workouts` | 1×/day |
| Garmin workout | app → Garmin | `.FIT` file, manual import | on demand |
| Health Connect | Android → app | Native API | background/app open |
| Backup | app → Drive | Encrypted ZIP | daily/weekly |

### 9.2 Garmin Personal — notes

- Key created at `connect.garmin.com/app/settings/personalApiToken`; expiry 30/90/180/365 days.
- Token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with header `Authorization: ApiKey <key>`; valid for 24h; no refresh token.
- Useful endpoints: activities, activity detail, `.FIT` download, sleep, HRV, RHR/daily summaries, weight, steps, stress, Body Battery, food log.
- Conservative polling; backoff on 429; 401 → new token; expired key → rotation prompt.
- **Personal use only.** For testing with other users: each tester with their own key (inconvenient) or Garmin Startup.

### 9.3 Garmin export
File: docs/PIANO.md (part 7)

- Generates a structured `.FIT` workout (run/bike/swim) with warm-up, blocks, recoveries, targets.
- Import: Garmin Connect web → Training & Planning → Workouts → Import; or copy to the device's `NewFiles`.
- Future automation: Garmin Training API (Startup/Enterprise).
- Do not use libraries that simulate Garmin login as the main path.

### 9.4 Hevy

- API key from `hevy.com/settings?developer`; requires Hevy Pro.
- Endpoints: `/v1/routines` (GET/POST), `/v1/routines/{id}`, `/v1/exercise_templates` (GET/POST), `/v1/workouts` (GET/POST), `/v1/workouts/{id}`, `/v1/body_measurements`.
- Export: map exercises → `exercise_template_id`; if missing, create a custom template; create routine with sets/reps/rest.
- Import: read completed workouts and link them to planned sessions.
- Respect the requirement not to hammer the APIs at `xx:00`.

### 9.5 Yazio

- Unofficial API v15; OAuth password/refresh; token ~48h.
- Endpoints: `/user`, `/user/consumed-items`, `/user/widgets/daily-summary`, `/user/bodyvalues/weight/last`, `/user/goals`, `/user/exercises`.
- Encrypted credentials; feature flag; manual fallback; no scraping.
- Possible 2FA/breakages: the adapter must degrade without blocking the plan.

### 9.6 Zepp

- Weight endpoint: `GET /users/{id}/members/-1/weightRecords` with `apptoken` header.
- Requires `app_token`, `user_id`, regional host from proxy capture; TTL ~30 days.
- Android alternative: Zepp → Health Connect → app.
- Not critical: if missing, weight comes from Garmin/Yazio/manual.

---

## 10. UX

### 10.1 Screens

1. **Login** with Google.
2. **Onboarding** (6 steps, saveable): profile, medical history, goal, availability, equipment, integrations/photos/preferences.
3. **Baseline summary**, editable.
4. **Feasibility** of the goal, with any intermediate proposal.
5. **Macro** phase timeline.
6. **Week** multisport board.
7. **Today** session, "why", alternatives.
8. **Check-in** 20 seconds.
9. **Post-session** RPE, sensations, pain.
10. **Progress** load, pace/HR, weight, photos, adherence, review.
11. **Export** Hevy / Garmin `.FIT` / backup.
12. **Settings** integrations, LLM, units, notifications, privacy.

### 10.2 Multisport board

- Lanes: gym, running, cycling, swimming, mobility.
- Card: sport, duration, intensity (color), equipment, location, status.
- Totals: time vs availability, load per sport, intensity distribution.
- Filters: "home only", "≤ 30 min", "low impact", "gym only".
- "Why" drawer: data used, rule, confidence.
- "Adapt" action: the user adds a constraint (time, travel, pain); the engine recalculates and shows the diff.

### 10.3 Feedback per sport

| Sport | Device data | User feedback | Comparison |
|---|---|---|---|
| Gym | Hevy workout (sets/reps/load) | RPE, pain, energy | volume/reps vs planned |
| Running | Garmin pace/HR/elevation | RPE, sensations, pain | pace/HR vs target |
| Cycling | Garmin power/HR/duration | RPE, sensations | power/HR vs target |
| Swimming | Garmin distance/pace/stroke | RPE, technique | pace/100m vs target |

### 10.4 Photos

- Guided wizard: front, side, back; same lighting/distance/pose.
- Private storage, EXIF removed.
- Side-by-side comparison, no aesthetic score.
- Optional AI analysis with consent; qualitative output, not body fat passed off as a measurement.

---

## 11. Security, privacy, compliance

### 11.1 Personal phase

- Health data is still special category data (GDPR art. 9), even if the user is you.
- Hosting: local machine or EU VPS; Mongo not exposed publicly.
- Provider credentials encrypted (AES-256-GCM; master key in env/secret manager).
- Encrypted backups with passphrase; restore tests.
- Logs without tokens, keys, photos, clinical text.
- Photos in private storage, short signed URLs, EXIF removed.
- 18+.

### 11.2 Test phase with other users

- Multi-user auth, strict isolation (`userId` in the repository, cross-access tests).
- Explicit art. 9 consent, privacy policy, DPIA, DPA with subprocessors.
- Rights: export, rectification, deletion, revocation.
- Garmin: Startup tier, not shared personal keys.
- Yazio/Zepp: evaluate whether to keep unofficial integrations in a multi-user product; probably not.
- Insurance/legal advice before launch.

### 11.3 Medical boundary

- Language: training, wellness, performance. Never diagnosis, therapy, rehabilitation.
- Red flag → stop and referral to a professional.
- If rehabilitation in the future → MDR/CE marking.

### 11.4 Legal risks of unofficial APIs

Yazio and Zepp have no public APIs. Using them means:
- possible ToS violations;
- risk of ban/rate limit;
- breakages without notice;
- user credentials on our server.

Mitigation: personal use, feature flag, isolated adapter, no data shared with third parties, manual fallback, clear documentation. For the multi-user test phase, reevaluate or remove.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Inconsistent/hallucinating LLM | high | rules, schema, validator, eval, low temperatures |
| Dangerous advice | very high | red flags, contraindications, safety critic, human review |
| Garmin Personal is not enough to push workouts | medium | manual `.FIT` export; Startup in test phase |
| Garmin key expires | medium | reminder, rotation, integration status |
| Yazio/Zepp break | medium | isolated adapter, manual fallback, feature flag |
| Hevy API beta/Pro | medium | CSV export/fallback; document Pro requirement |
| LLM costs | medium | routing, cache, quota, BYOK |
| Multisport scope | high | MVP 4 sports but different depth; feature flag |
| Low adherence | high | short check-ins, alternatives, explanations |
| Local data loss | high | encrypted backup + tested restore |
| Data breach | very high | encryption, least privilege, redacted logs |
| Medical classification | high | language, no rehabilitation, counseling |

---

## 13. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Android: Expo/RN or Kotlin | share TS vs native integration | **Expo/RN** for now; native module for Health Connect if needed; Kotlin only if background sync is unstable |
| 2 | Automatic Garmin push | manual `.FIT` / Startup Training API / unofficial library | **Manual `.FIT`** in MVP; Startup if testing with other users requires it |
| 3 | Web deploy | Local / EU VPS / PaaS | **Local** to start; EU VPS when remote access is needed |
| 4 | Web DB | Mongo / SQLite | **Mongo** as decided; SQLite remains a simple alternative for single-user |
| 5 | LLM default | BYOK / managed | **BYOK** for personal use; managed for testing |
| 6 | Zepp | unofficial API / Health Connect / manual | **Health Connect** on Android; unofficial API web-only and optional |

---

## 14. Next steps

1. ~~**Real Garmin spike:**~~ done on October 26, 2026 — see `docs/spikes/garmin.md` (Go with 406 workaround/raw token).
2. ~~**Real Yazio:**~~ done on October 26, 2026 — login, 7 days of macros and weight; see `docs/spikes/yazio.md`.
3. ~~**`.FIT` workout export:**~~ done on October 26, 2026 — generator and validator with FIT SDK, see `docs/spikes/garmin-export.md`.
4. ~~**Google Auth / Dev + `/api/me`:**~~ done on October 26, 2026 — `auth` module, JWT session, email allowlist, and `users` collection.
5. **Start Phase 1 (Personal Web MVP):** 6-step onboarding wizard, baseline summary, feasibility check, and first vertical slice (plan → check-in → review).
6. Use [`AGENT.md`](../AGENT.md) as a guide for every code change; update the documents with every advancement.

---

## Appendix A — Why not a single prompt

A single prompt that receives all the data and returns a plan looks like a plan, but:
- it does not perform reliable periodization arithmetic;
- it contradicts the previous week's data;
- it ignores contraindications;
- it is not reproducible;
- it cannot be tested.

The separation **rules → context → LLM → validation** is more initial work, but it is the only path to a correctable and explainable product.

## Appendix B — Why not Next.js

SSR is not needed: the app is authenticated, personal, and the client is a SPA. NestJS separates responsibilities better (API, jobs, integrations), and the Android client will consume the same APIs. Vite + React is simpler to reason about and to serve as a static build.

## Appendix C — Sources

- Garmin Connect Personal API: <https://developer.garmin.com/gc-developer-program/personal/>
- Garmin Personal API FAQ (24h token, 30/90/180/365 key, no refresh): <https://developer.garmin.com/gc-developer-program/personal/personal-faq/>
- Garmin Personal API Python client (endpoints and wrapper): <https://github.com/garmin/connect-personal-api-python>
- Garmin Connect Developer Program (tiers): <https://developer.garmin.com/gc-developer-program/overview/>
- Unofficial Yazio API v15: <https://github.com/saganos/yazio_public_api>
- Zepp health CLI (weight endpoint, token): <https://github.com/m4ary/zepp-health-cli>
- Hevy Public API (routines, workouts, exercise templates): <https://api.hevyapp.com/docs/>
- Garmin Connect → Health Connect: <https://support.garmin.com/en-US/?faq=JToBEy0jfe6pIygark2Ui5>
- Strava API Policy 2026 (why it is excluded): <https://www.strava.com/legal/api_policy>
