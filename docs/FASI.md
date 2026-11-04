# Implementation phases

**Version:** 2.0  
**Date:** 4 November 2026  
**References:** [`PIANO.md`](PIANO.md) · [`INTEGRAZIONI.md`](INTEGRAZIONI.md) · [`../AGENT.md`](../AGENT.md)

---

## Principles

1. **Risk-first:** the fragile integrations are tested first (Garmin, Yazio, Zepp, Hevy, `.FIT` export), then the UI is built.
2. **Vertical slice:** each phase produces something you actually use, not just infrastructure.
3. **No assumptions about APIs:** every integration is closed out with real responses saved in `docs/spikes/`.
4. **The domain is tested before the AI:** rules are validated with unit tests; the LLM comes later.
5. **Local-first on Android:** the server is not required to train.
6. **Every phase has verifiable acceptance criteria.**

## Indicative timeline

| Phase | Duration | Outcome |
|---|---|---|
| 0 — Spikes and foundations | 1 week | Integrations tested + scaffold |
| 1 — Personal Web MVP | 4–5 weeks | Complete loop on the web, daily use |
| 2 — Multisport, export, automations | 3–5 weeks | Per-sport planning (strength first) + feedback for 4 sports + Hevy/Garmin + sync |
| 3 — Android local-first | 4–6 weeks | Usable Android app, local data, backup |
| 4 — Testing with other users | 3–4 weeks | 5–10 testers, multi-user, compliance |
| 5 — Consolidation | ongoing | Quality, sport depth, optional |

Total for a first usable Android product: **3–4 months** with one senior person, less if scope is cut.

---

## Phase 0 — Spikes and foundations (1 week)

### Status (26 October 2026)

**Done:** npm workspaces scaffold, domain, persistent Garmin sync, **FIT parser/analysis/brief**, Yazio v22 with real test, workout `.FIT` generator and export (`garmin-export.md`), `auth` module (Google OAuth allowlist, dev login, `/api/me`, `users` collection), `export` module, UI, CI, local MongoDB, `.env.example`, 5 documented spikes with verdict, git repo.
**Green:** `npm run build`, `npm test` (65 tests), `npm run typecheck`, `npm run lint`. `npm run dev` starts the API on :3000 and the web app on :5173; with Mongo running `/api/health` responds `ok`.
**Phase 0 completed.** Ready for **Phase 1 — Personal Web MVP**.

> Note: NestJS is at version **12 (ESM)**, with `type: module` and `.js` imports. Do not reintroduce CommonJS or Nest 11.

### Goal

Prove that the key integrations **actually** work and create the skeleton to build on. No elaborate UI.

### Tasks

#### 0.1 Scaffold

- [x] npm workspaces monorepo (no pnpm, no Turborepo).
- [x] `apps/api` NestJS with `EnvModule`, `HealthModule`, `IntegrationsModule`, `AuthModule`, `ExportModule`.
- [ ] Advanced domain modules: `profile`, `plans`, `metrics`, `ai` (in Phase 1).
- [x] `apps/web` React + Vite + Tailwind (shadcn/ui to be added).
- [x] `packages/domain` with Zod schemas (profile, medical history, goals, availability, equipment, check-in, session, plan, user).
- [x] Pure rules: `readiness`, `load`, `feasibility`, `progression`, `safety`, `validator` + 20 tests.
- [x] `packages/integrations` with `ProviderAdapter`, Garmin/Yazio clients, FIT parser/analyzer, workout FIT encoder + 32 tests.
- [x] `packages/config`, `packages/db`, `packages/ai`, `packages/ui`.
- [x] Local MongoDB configured on `127.0.0.1:27017` (no Docker).
- [x] CI: GitHub Actions workflow (typecheck, lint, test, build).
- [x] `.env.example` with all variables.
- [x] Local git repository: `main` branch, `d-rouge` identity, no remote.

#### 0.2 Garmin Personal

- [x] Garmin client: token exchange, 24h cache, retry on 401, 429 handling, activities/sleep/HRV/weight/steps/stress endpoints.
- [x] `npm run spike:garmin` script with redacted output, `--write` and `--download`.
- [x] Create a real personal key on Garmin Connect.
- [x] 14-day pull with the real key: 6 activities, sleep, HRV, steps, stress, daily summary, Body Battery, RHR, SpO₂, HR zones; weight 0 records.
- [x] Download a `.FIT` of a real activity (529 KB ZIP, valid).
- [x] Measure latency (~2.9 s total) and check errors/rate limit (no 429 in the single run).
- [x] Save real responses (redacted) in `docs/spikes/garmin.md`.
- [x] Handle the 406 workaround: no `Accept` header on token/download; raw JWT token.
- [x] Canonical mapper activities → `activities` and metrics → `metrics_daily`.
- [x] Mongo repository with idempotent upsert, indexes and `sync_state`.
- [x] `POST /api/integrations/garmin/sync?days=N` with audit in `sync_runs`.
- [x] `GET /api/integrations/garmin/overview?days=N` for status, activities and metrics.
- [x] UI: "Sync now" button, last sync, recent activities, metrics table.
- [x] Real end-to-end test: 3 activities and 7 days of metrics persisted; second sync idempotent.
- [ ] Verify rate limit over 24–48h of continuous polling (background monitoring).
- [x] `.FIT` parsing and `ActivityAnalysis`/brief generation.
- [ ] Saving the original `.FIT` to object storage (currently parsed on demand).

#### 0.3 FIT: reading, analysis, export

- [x] FIT/ZIP parser (`fit-file-parser` + `fflate`).
- [x] `ActivityAnalysis` normalization: summary, lap, split, HR zones, HR drift, negative split, pace variability.
- [x] Compact brief for the LLM (without 1 Hz records).
- [x] `activity_analyses` storage + `analyze`/`analysis` endpoints + "Analyze FIT" UI.
- [x] Real validation: ~1.3 MB FIT, 17,492 records, 44 laps, 42 splits, ~2 KB brief.
- [x] Generate a structured `.FIT` workout (5×800m with Z2 warm-up, interval @ 4:15-4:35/km, 200m recovery, repeat 5x, Z1 cooldown).
- [x] Validated with the official Decoder `@garmin/fitsdk` (0 errors, `.FIT` magic bytes, compliant messages).
- [x] Script `npm run export:workout` + endpoint `GET /api/export/workouts/sample-5x800m.fit` + UI card with download.
- [x] Document the export format and limits in `docs/spikes/garmin-export.md` (Go).

#### 0.4 Yazio

- [x] v22 client with login/refresh, User-Agent gate, v20 fallback, typed errors.
- [x] Token import support (`refreshToken`) for Google/social accounts.
- [x] Mapper: meal macro totals, goals, water, steps, weight.
- [x] Persistent sync into `nutrition_daily` / `metrics_daily` + audit.
- [x] `check` / `sync` / `overview` endpoints and UI card “Yazio Nutrition”.
- [x] Contract tests + mapper with fixtures.
- [x] Login with a real account (Yazio password; refresh token support for Google already implemented).
- [x] Real pull: profile, nutrients-daily, summary, diary, latest weight, goals (7 days).
- [x] Check 2FA/blocks: no block; tokens/refresh handled.
- [x] Verdict and risks in `docs/spikes/yazio.md` (Go).

#### 0.5 Zepp

- [x] Technical analysis of endpoint `GET /users/{userId}/members/-1/weightRecords`.
- [x] Verified HTTPS proxy authentication constraints and 30-day TTL.
- [x] Document verdict (No-go web / HC fallback) in `docs/spikes/zepp.md`.

#### 0.6 Hevy

- [x] Analysis of Hevy OpenAPI documentation and routine payload contracts.
- [x] Verify Hevy Pro prerequisite for the developer API key.
- [x] Document mapping and limits in `docs/spikes/hevy.md` (Go with prerequisite).

#### 0.7 Auth and data

- [x] `EnvModule`, `GET /api/health`, `GET /api/integrations/status`.
- [x] `AuthModule` with Google ID token support, local email + password (scrypt) accounts, and dev login. _(Local signup/login and Google linking by email: F1-24.)_
- [x] Email allowlist check (`GOOGLE_ALLOWED_EMAILS`).
- [x] `users` in Mongo with unique indexes, JWT session with HMAC-SHA256, and unit tests.
- [x] Endpoint `/api/me`.
- [x] Frontend: authenticated athlete display on the status page.

### Acceptance criteria

- [x] All spikes have a document with real answers and a **go / no-go / workaround** verdict (`garmin.md`, `garmin-export.md`, `yazio.md`, `zepp.md`, `hevy.md`).
- [x] The monorepo starts with `npm install` and `npm run dev` (local Mongo running).
- [x] Base auth and email allowlist work end-to-end with persistence in `users` and `/api/me`.
- [x] At least Garmin and Yazio return real data synchronized in Mongo.
- [x] The `.FIT` workout export is generated, compliant with the FIT specifications, validated with Decoder, and downloadable.

> Current status: **Phase 0 completed**. All acceptance criteria are met. 65 green tests, clean typecheck and lint. Ready for Phase 1 (Onboarding and first vertical slice).

### Risks

| Risk | Mitigation |
|---|---|
| Garmin key/token does not work | read the official FAQ; use the Python client as reference |
| Yazio login blocked (2FA) | document; manual fallback |
| Zepp token too fragile | postpone; use Health Connect in phase 3 |
| Hevy not Pro | activate Pro or postpone export |
| `.FIT` workout not importable | verify with a file generated by a known tool; use FIT SDK |

---

## Phase 1 — Personal Web MVP (4–5 weeks)

### Status (updated November 4, 2026)

> ⚠️ **Phase 1 is functionally complete but has not yet been validated over 14 real days.**
> The October 27, 2026 review ([`REVIEW-FASE-1.md`](REVIEW-FASE-1.md)) found
> 5 blocking issues, 7 serious, and 7 medium. After WS-0, Wave 1, and Wave 2, only
> one postponed P2 (scheduler/credentials F1-19) and real-world use remain open. F1-18 (AI coach)
> is closed: the coach consumes `RecentContext` and uses DeepSeek.
> Unit tests: 308 green; the multi-user e2e on real MongoDB (14 checks) is green (November 4, 2026).
> The checkboxes below have been realigned: those not verified are `[ ]`.
>
> **Methodology layer (October 30, 2026):** coach interview, LLM-chosen methodology with
> envelope validation, LLM phases and periodization, re-evaluation at the weekly review,
> i18n it/en. Details in [`METODOLOGIA-LLM.md`](METODOLOGIA-LLM.md) and in §1.8 / §1.10 below.
>
> **WS-0 (October 27, 2026):** global JWT guard, `@CurrentUser()`, secure config,
> Zod validation, and FIT body limit are closed (F1-01, F1-02, F1-04, F1-05, F1-14).
>
> **Wave 1 (October 27, 2026):** closed baseline/versioning (F1-03), review and check-in
> (F1-06, F1-07, F1-15, F1-16), FIT/Hevy export (F1-08, F1-09), and backup/restore/wipe
> (F1-10).
>
> **Wave 2 (October 27, 2026):** closed safety (F1-11), generator (F1-12), timezone
> (F1-13), auth/Hevy UI (F1-17), and documentation (F1-20); the multi-user e2e
> with real Mongo (WS-9) was added. F1-19 remains postponed (scheduler and encrypted
> credentials); F1-18 was closed on October 27, 2026.
>
> **Block decided on October 27, 2026:** replace the rule-based generator as
> the *author* of the plan with the Proposer + Critic + Referee pipeline described in
> [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md). The generator remains as a fallback.
> What actually landed (October 30) is an intermediate step: the LLM chooses the
> methodology and the phases, the generator still writes the sessions. Recognized
> prerequisite still open: post-race unloading is a global constant
> (21 days, gym included) and is wrong for experienced athletes and for
> non-impact sports (F1-30).

**Tests:** 308 unit + 14 e2e checks, all green on November 4, 2026 (`npm run test:e2e`, temporary
`health_trainer_e2e` database). Details and remaining limits in
[`REVIEW-FASE-1.md`](REVIEW-FASE-1.md).
- **1.1 Domain and rules:** Complete L0–L4 schemas (baseline, preferences, medical history, plans, sessions, check-ins, review), 85 unit tests with edge cases and fixtures for 4 personas (Marco beginner 5k, Giulia half marathon + gym, Luca knee pain, Sara former competitive athlete returning).
- **1.2 Onboarding:** Interactive 6-step wizard (`OnboardingWizard.tsx`) with complete medical history — red flags, known conditions, medications, injuries — and safety assessment shown in real time. Sticky save bar: when editing, you can save from any step; on first onboarding the draft remains in `sessionStorage` until it is completed, goals, availability, equipment, demo persona selector, and persistence on MongoDB (`athlete_baselines`) + API `/api/baseline`. _(WS-6: red flags and injuries can be entered from the wizard; saving is permitted, generation is blocked.)_
- **1.3 Plan:** 5k feasibility check with realistic projections, deterministic macrocycle and microcycle generator (`generateMacroPlan`, `generateMicroPlan`), safety critic (automatic replacement of running with bike/swimming/mobility for knee pain), multisport Board and "Today" Card with express variants (15 min, 30 min, exercise bike).
- **1.4 Execution and feedback:** Quick morning check-in (`MorningCheckinCard.tsx`), real-time daily adjustment engine (`computeDailyAdjustment`), manual activity entry (`/api/activities/manual`) and `.FIT` file upload with analysis and automatic planned vs actual comparison (`compareSessionWithActivity`).
- **1.5 Integrations:** Garmin Personal client with token cache and metrics/activities sync; Yazio client v22 with nutrition and weight sync; integrations status card and credential verification.
- **1.6 Export:** `.FIT` export for run/bike/swim (`/api/export/workouts/session/:id.fit`), gym routine export to Hevy Pro (`/api/export/workouts/hevy/export`), full backup (`/api/export/backup`) and idempotent restore (`/api/export/restore`). _(F1-08, F1-09, F1-10 closed in WS-4/WS-5; Hevy export with a real key has not yet been tested.)_
- **1.7 Review:** Deterministic weekly review engine (`computeWeeklyReview`), adherence based only on `completed` sessions, pain events limited to the evaluated week, verdict (`continue`, `progress`, `deload`) applied to the next microcycle (`/api/review/advance-week`, `WeeklyReviewCard.tsx`). _(F1-06, F1-15, F1-16 closed in WS-3.)_
- **1.8 AI Coach:** Versioned schemas and prompts (`coach-advice-v1`), deterministic offline-first provider (`DeterministicCoachProvider`), tracking of `ai_runs` executions with token, latency, and model, endpoint `/api/ai/coach-advice` and coaching briefing card integrated into the UI.
- **1.9 Security & Privacy (GDPR):** Credentials isolated in `secrets/`, local passwords hashed with scrypt in `auth_credentials` (never in the `users` document), full backup with `ai_runs`, restore per authenticated user and complete deletion (`DELETE /api/export/me`, which also removes credentials). _(F1-10 closed in WS-5; JWT authentication and secure defaults closed in WS-0; local accounts F1-24.)_

**Green (verified on October 27, 2026 after Wave 2; unit count updated November 4, 2026):** 239 unit tests at the time (308 today), 14 e2e checks
on real MongoDB, workspace typecheck, `typecheck:scripts` and Biome lint pass;
API and web builds complete. **Not covered:** Google login with real credentials (Google
registration requires OAuth client and allowlist), Hevy export with a real key,
`.FIT` import to Garmin Connect, automatic scheduler, real 14-day use.

### Goal

Use the app every day for 2 weeks: plan, workout, check-in, review, Garmin/Yazio data, export.

### Task

#### 1.1 Domain and rules

- [x] Zod L0 schemas: profile, medical history, goals, availability, equipment, preferences (`baseline.ts`, `preferences.ts`, etc.).
- [x] L1–L4 schemas: plan, week, session, daily state, review (`plan.ts`, `daily-state.ts`, `review.ts`, `session.ts`).
- [x] `readiness`, `load`, `progression`, `feasibility`, `safety`, `validator`.
- [x] Unit tests for each rule, with edge cases (99 green tests in `packages/domain`).
- [x] Fixtures for 4 personas (Marco beginner 5k, Giulia intermediate half marathon + gym, Luca patellar tendinopathy, Sara former competitive athlete inactive for 2 years).

#### 1.2 Onboarding

- [x] 6-step wizard, saveable, mobile-friendly (`OnboardingWizard.tsx`).
- [x] Structured medical history + free text + red flag. _(WS-6: the wizard allows red flags and injuries; `assessSafety` evaluates them and generation is blocked.)_
- [x] **Saving not tied to the last step** (October 27, 2026): when editing, "Save changes" appears in a sticky bar on every step, with an "Unsaved changes" indicator and confirmation before discarding. On first onboarding, changes remain in a `sessionStorage` draft (health data: it does not survive closing the tab) and are restored on return.
- [x] **Known conditions and medications** (October 27, 2026): selection of conditions and entry of medications in the wizard, with live `assessSafety` assessment. Conditions requiring medical advice block generation; chronic ones (asthma, diabetes, controlled hypertension…) raise severity to caution; medications that alter exercise response (beta-blockers, diuretics, anticoagulants, hypoglycemics) produce an explicit note.
- [x] Primary/secondary goal + target date.
- [x] Weekly availability and maximum duration per session.
- [x] Equipment, gym, pool, home with visual selection.
- [x] Optional photos (upload, EXIF strip, private storage - deferred to mobile phase).
- [x] Editable baseline summary with Mongo persistence (`athlete_baselines`) and `/api/baseline` API module. _(Without a baseline, `GET /api/baseline` responds 404, never 200 with an empty body: F1-21.)_

#### 1.3 Plan

- [x] Feasibility check with realistic goal proposal (`project5k` and feasibility card in the web app).
- [x] Deterministic macro generation (phases, weeks, targets) from Baseline (`generateMacroPlan`).
- [x] Micro generation (sessions, structured blocks, 15/30/low-impact alternatives) from Baseline (`generateMicroPlan`).
- [x] Validator + safety critic (automatic replacement of running with bike/swimming/mobility for knee pain). _(WS-6: `assessSafety` blocks generation on absolute red flags or missing PAR-Q; the critic remains active for the knee.)_
- [x] Diff and "why" in the UI (phase focus, RPE intensity and success criteria).
- [x] Weekly multisport board (gym, running, bike, swimming, mobility).
- [x] "Today" card + alternatives (15/30 min, stationary bike/low impact) and completion state saving (`PATCH /api/plan/sessions/:id`).

#### 1.4 Execution and feedback

- [x] Morning check-in (sleep, energy, soreness, pain, time) with a quick 20-second form (`MorningCheckinCard.tsx`).
- [x] Post-session (RPE, sensations, pain, notes) and session completion recording.
- [x] Manual activity entry (`POST /api/activities/manual`).
- [x] `.FIT` upload and parsing with metric extraction (`POST /api/activities/upload-fit`). _(JSON body up to 15 MB, `.FIT` signature at bytes 8–11 and 10 MB limit validated in WS-0. `.TCX` is not supported.)_
- [x] Device data vs planned comparison (`compareSessionWithActivity`).
- [x] Daily adjustment (`computeDailyAdjustment`: confirm/reduce/swap/rest with immediate session update). _(WS-3: duration, RPE, blocks and notes are persisted with `replacePlannedSession`.)_

#### 1.5 Integrations

- [x] Garmin Personal: pull adapter, token cache. _(The integration status uses the same credential resolution as the client, including `secrets/garmin-key.txt`: F1-22.)_
- [ ] Garmin: scheduler, backoff, key expiration reminder. _(Not implemented: manual sync only.)_
- [x] Yazio: v22 adapter, refresh, nutrients-daily/summary/weight.
- [x] Yazio: credentials isolated in `secrets/`.
- [x] Activity dedupe via unique keys (userId, source, externalId).
- [x] Integrations status page/card (connected/expired/error). _(Garmin and Yazio read metrics filtered by `source`, with no duplicate dates: F1-23.)_

#### 1.6 Export

- [x] Gym routine export → Hevy (exercise mapping, routine creation `POST /api/export/workouts/hevy/export`). _(WS-4: exercises derived from blocks, key required, session never invented. Export with a real key not yet tested.)_
- [x] Running/bike/swim workout export → dynamic downloadable `.FIT` (`GET /api/export/workouts/session/:id.fit`) + Garmin import instructions. _(WS-4: strength/mobility rejected with 400; pace, power, cadence and HR zones mapped. Import into Garmin Connect not verified.)_
- [x] Full JSON backup export (`GET /api/export/backup`) and restore (`POST /api/export/restore`). _(WS-5: `0.3.0` backup with `ai_runs`, idempotent restore limited to the authenticated user. November 4, 2026: `0.4.0` adds `methodology_decisions` and `plan_interviews`; `0.3.0` backups still restore.)_

#### 1.7 Review

- [x] Weekly review (adherence %, total load, pain episodes).
- [x] Deterministic decisions: continue / progress (+10% volume) / deload (-30% volume) / change macro. _(WS-3: `progress` and `deload` applied to the next microcycle.)_
- [x] Micro regeneration and advancement to the next week with full context (`POST /api/review/advance-week`).
- [x] Review visualization in the UI (`WeeklyReviewCard.tsx`).

#### 1.8 AI

> **Current status (November 4, 2026):** DeepSeek is connected (`LLM_PROVIDER=deepseek` +
> `LLM_API_KEY`); without a key the coach uses `DeterministicCoachProvider` and the
> interview/methodology endpoints answer `503`. The coach consumes `RecentContext`.
> The LLM chooses methodology and periodization; sessions are still written by the
> rule-based generator. The target design is in [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md).

- [x] Versioned prompts (`coach-advice-v2`, `plan-interview-v1`, `methodology-v1`) with Zod schema validation.
- [x] Offline-first Deterministic Coach Provider for reliable execution without third-party keys.
- [x] `ai_runs` audit log with tokens, latency, model and USD cost. _(Metadata only: the proposal payload and verdict are missing.)_
- [x] `POST /api/ai/coach-advice` endpoint and AI Coach widget in the dashboard.
- [x] **Coach with real context** (October 27, 2026, closes F1-18): the payload includes `recentContext` (last race/effort, days elapsed, recovery window, 7/28 load, ACWR, flags) and the system prompt forbids prescribing load during the window. Verified on real data: it cites the marathon from 2 days ago and the acute/chronic ratio.
- [x] **Native DeepSeek connection** (October 27, 2026): `DeepSeekProvider` with JSON mode, selectable thinking, `retryable` error mapping, timeout; `deepseek-v4-pro` for planning and `deepseek-flash` for the coach; smoke test `npm run spike:deepseek`. Without a key, the deterministic provider remains.
- [x] **LLM methodology** (October 30, 2026): `POST /api/plan/methodology`, `MethodologyDecision` (methodology, weekly structure, periodization, phases, alternatives, risks, confidence) validated against `buildMethodologyEnvelope()` with one correction retry, saved in `methodology_decisions`. Plan generation uses it when ≤ 14 days old and for the same goal.
- [x] **Coach interview** (October 30, 2026): `PlanInterviewChat.tsx` + `/api/plan/interview*`, max 6 replies, findings fed back into the methodology, target date can be updated; regenerating the plan always starts a new interview.
- [x] **Methodology re-evaluation at the weekly review** (October 30, 2026): optional, the review stays valid if the model is down.
- [x] Interview and methodology calls logged in `ai_runs` (November 4, 2026): every attempt, failures included, via `recordAiRun()`.

#### 1.9 Security

- [x] Credentials isolated and protected in `secrets/`.
- [x] Log sanitization.
- [x] Data portability: Full JSON backup export.
- [x] Total data deletion / GDPR wipe (`DELETE /api/export/me`). _(WS-5: also deletes `users` and `ai_runs`; after the wipe `/api/me` responds 401.)_
- [x] **Regression of October 30, 2026, fixed November 4, 2026:** `plan_interviews` and `methodology_decisions` are now in backup/restore and in the wipe; `backup.spec.ts` fails if a future collection is left out of the wipe.

#### 1.10 LLM Architecture (partially implemented)

Complete plan and criteria in [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md) §11.
Binding order: each step presupposes the previous one.

- [x] **A. Athlete dossier** (`F1-25`) — deterministic `buildAthleteDossier()`, `GET /api/athlete/dossier`, used by plan and coach via `AthleteService.getContext()`. The dossier declares what is missing (`warnings`) and a coverage test prevents adding fields to the baseline without passing through it. _Still to be connected to the rule-based generator: age, time windows, preferred time, and secondary goals—the dossier exposes them, but the generator does not read them yet._
- [x] **Intermediate step: LLM methodology** (October 30, 2026, outside the A–E sequence) — the LLM chooses methodology, weekly structure, periodization and phases; the envelope is still computed by code (`buildMethodologyEnvelope`) and there is no Critic. See [`METODOLOGIA-LLM.md`](METODOLOGIA-LLM.md). It does not replace B–E.
- [ ] **B. Schema and provenance** (`F1-26`) — `trainingModel`, `envelope` per modality, `review`, `generatedBy`; `ai_runs` with the payload; compatible migration of existing plans.
- [~] **C. Provider and loop** (`F1-27`) — **DeepSeek provider done** (JSON mode, thinking, retryable errors, timeout, smoke test). Remaining: `PlanProposer`, `PlanCritic`, Referee in code, max 2 revisions, declared fallback.
- [ ] **D. Adversarial evaluation** (`F1-28`) — `npm run eval:plans` with deliberately wrong plans that the Critic must reject; measure false negatives before any other metric.
- [ ] **E. Comparison and memory** (`F1-29`) — LLM plan and rule-based plan side by side for 2-3 weeks; then `Reviewer` and `Daily Adjuster` using plan memory.
- [ ] **Replace the constant envelope** (`F1-30`) — remove the global 21 days from `RECOVERY_RULES`, introduce per-modality constraints (impact, upper body, heavy eccentrics, mobility). This must be done before giving an envelope to the Proposer; otherwise, it will be passed the wrong constraint.

### Acceptance criteria

- [ ] Real use for **14 consecutive days**: not done. The architecture is prepared, but there is no evidence of use.
- [ ] At least **80%** of sessions tracked (device or check-in): not measured on real data.
- [ ] Garmin and Yazio sync without manual intervention: there is no scheduler; sync is manual.
- [ ] The plan adapts to a real data point (sleep/HRV/pain/time): the adaptation is persisted (verified with a synthetic check-in); use over 14 real days is missing.
- [ ] Hevy export creates a valid routine: payload derived from the session, but not verified with a real key.
- [ ] `.FIT` export importable into Garmin Connect: decoding and targets verified with the SDK; import into Garmin Connect not yet tried.
- [x] Backup exported and restored on a clean environment: verified in WS-5 (wipe → restore → baseline v5, idempotent double restore).
- [x] No plan violates safety constraints: WS-6 blocks generation on absolute red flags or missing PAR-Q; verified at runtime (save 201, generate 400 with message).
- [x] Multi-user isolation: WS-9 verifies 401 without token, separate plans/check-ins/backups, cross-user PATCH and FIT export rejected with 404.
- [x] Missing resources without an ambiguous body: baseline, macro and micro return 404, never 200 with empty body (F1-14, F1-21).

### Out of scope (deferred)

- Zepp.
- Import of completed Hevy workouts.
- Push notifications.
- Automatic backup to Drive.
- Photo analysis.

---

## Next steps (November 4, 2026)

In order. Each item is small enough to be one PR.

1. ~~**Close the gaps of the methodology layer.**~~ Done on November 4, 2026:
   - [x] `plan_interviews` and `methodology_decisions` in backup (`0.4.0`), restore and wipe, with compatibility tests.
   - [x] Interview and methodology calls logged in `ai_runs`.
   - [x] Time-dependent tests made deterministic (`plan.service.spec.ts` pins the clock; the e2e compares dossier version and plan length with the real values instead of literals).
   - [x] Pre-existing type errors fixed (`PlanMethodology.phases` now uses `MethodologyPhaseSchema`), so CI typecheck is green again.
   - [ ] E2E check for the 503 of interview/methodology without a model: not added, because the e2e loads the root `.env` and with a real `LLM_API_KEY` it would call the paid model. It first needs a way to force the LLM off in the e2e API process.
2. **14-day real-use validation** (Phase 1 acceptance criteria). Decide explicitly whether
   to run it now or after step 3: development has moved on without it.
3. **Phase 2, starting from the sport model** (below): per-sport modules, then real strength
   training, then multi-sport weeks.
4. **F1-19** (scheduler, encrypted credentials) before any test with other users.

---

## Phase 2 — Multisport, export, automations (3–5 weeks)

### Goal

Make **planning** and feedback useful for all four sports and reduce manual input.

> **Why the plan is running-shaped today (analysis of November 4, 2026).** The week skeleton
> (`MethodologyWeeklyStructure`: `qualitySessions`, `longSessionMin`, `strengthSessions` as an
> add-on) comes from endurance running. Strength sessions are a fixed text ("Forza Funzionale
> A/B") without sets, reps, load or progression. Measured capacity only projects a 5K time
> (`rules/capacity.ts`). `primarySportOf` falls back to `"running"`, a week has a single
> endurance sport, goal inference uses Italian-only running patterns, and the interview prompt
> asks whether the gym "supports running". The tasks below fix the model, not just the texts.

### Tasks — sport model (new, first)

- [ ] **Per-sport modules** in `packages/domain/src/sports/`: one interface (capacity metrics, key session types, intensity anchors, progression model, contraindications) implemented for running, cycling, swimming, strength, mobility. The generator delegates to the module instead of `if (sport === …)`.
- [ ] **Sport-neutral methodology schema**: replace `qualitySessions`/`longSessionMin` with key sessions defined by the sport module; migrate existing `methodology_decisions` and plans compatibly.
- [ ] **Real strength training**: exercise library filtered by equipment, split chosen by available days (full body / upper-lower / push-pull-legs), sets × reps × RIR or %1RM, double progression, weekly volume per muscle group, e1RM from imported Hevy workouts.
- [ ] **Multi-sport weeks**: distribution across disciplines (triathlon, running + gym, hybrid), interference rules (no heavy legs within 24 h of a quality run, no back-to-back long sessions).
- [ ] **Capacity per sport**: FTP/power for cycling, CSS for swimming, e1RM for strength, plus cross-sport metrics (resting HR, VO2max from Garmin).
- [ ] **Non-performance goals**: body composition (Yazio weight trend and intake + strength to preserve lean mass), health/habit (weekly active minutes, consistency).
- [ ] **Neutral prompts and goal inference**: remove the running bias from the interview/methodology prompts, drop the `"running"` fallback, infer the goal type with the LLM or a structured field instead of Italian-only regexes.
- [ ] **Per-modality post-race deload** (F1-30): impact vs upper body vs heavy eccentrics, instead of the global 21 days.

### Tasks — feedback, export, automations

- [ ] Zepp weight: unofficial adapter + manual fallback.
- [ ] Import completed workouts from Hevy and link them to sessions.
- [ ] Specific feedback:
  - gym: volume, reps, load, RPE, pain;
  - running: pace/HR vs target, RPE, pain;
  - cycling: power/HR/duration vs target;
  - swimming: pace/100m, distance, technique.
- [ ] Automatic adaptation to new data (debounce, `inputsHash`).
- [ ] Notifications: morning check-in, pre-session, post-session, review.
- [ ] Installable PWA.
- [ ] Automatic backup to Google Drive (encrypted ZIP).
- [ ] Monthly review and macro modification.
- [ ] Improve the "why" and the diff.
- [ ] Token/expiry handling for all providers.
- [ ] Eval suite with 10 personas + coach review.

### Acceptance criteria

- 4 weeks of data with all 4 sports.
- The 10-persona eval includes at least one strength-primary, one cycling/swimming-primary, one multi-sport and one body-composition athlete, and none of them receives running sessions they did not ask for.
- Strength sessions carry exercises, sets, reps and load/RIR, and progress week over week.
- At least one Hevy export and one Garmin export per week.
- Automatic sync > 90% of days.
- Weekly automatic backup + tested restore.
- Weekly review generated without schema errors.
- No security regression.

---

## Phase 3 — Android local-first (4–6 weeks)

### Goal

Android app usable every day, with local data and personal backup.

### Technical decision

**Expo/React Native** to share `packages/domain`, `packages/integrations`, and the prompts. If background Health Connect sync proves unstable, isolate a native module or switch to Kotlin only for the health layer.

### Tasks

#### 3.1 App and local data

- [ ] Expo app: Google login, onboarding, today, week, check-in, progress.
- [ ] Local SQLite with versioned schema and migrations.
- [ ] SQLite repository implementing the same interface as the web.
- [ ] Offline-first: all basic functions without network.
- [ ] `outbox` queue for export/backup/LLM.

#### 3.2 Health Connect

- [ ] Permissions: steps, sleep, HR, weight, exercise, nutrition (where available).
- [ ] Periodic import + sync on open.
- [ ] Dedupe with Garmin/Yazio/manual.
- [ ] Handling of denied/revoked permissions.
- [ ] Play Store health data declaration.

#### 3.3 Direct integrations

- [ ] Garmin Personal (optional) with key on device/Keystore.
- [ ] Yazio (unofficial API) with local credentials.
- [ ] Direct Hevy export with local API key.
- [ ] Garmin `.FIT` export + file sharing.
- [ ] LLM: direct BYOK or managed API with consent.

#### 3.4 Photos and backup

- [ ] Guided camera (front/side/back) + comparison.
- [ ] Encrypted ZIP backup to Google Drive (`drive.file`).
- [ ] Restore on a clean device.
- [ ] Backup retention and rotation.

#### 3.5 Notifications

- [ ] Local push notifications for check-in and session.
- [ ] Deep link to the right screen.
- [ ] Quiet hours.

### Acceptance criteria

- Daily use on Android for **2 weeks**.
- No health data sent to the server (only auth/backup metadata).
- Health Connect imports at least sleep, steps, HR and weight.
- Backup and restore work on a new device.
- The app works in airplane mode for today/check-in.
- Hevy and Garmin exports work from the phone.

---

## Phase 4 — Testing with other users (3–4 weeks)

### Goal

Validate the product with 5–10 people, not just yourself.

### Tasks

- [ ] Multi-user auth and data isolation.
- [ ] Multi-tenant Mongo (or Postgres, if preferred) + indexes.
- [ ] Art. 9 consents, privacy policy, DPIA, DPA.
- [ ] Tester onboarding + support.
- [ ] Garmin: Startup tier if you want to avoid the personal key for testers; otherwise each tester uses their own.
- [ ] Hevy Pro required for testers for export.
- [ ] Yazio/Zepp: evaluate whether to keep the unofficial APIs in multi-user (probably not).
- [ ] Observability: Sentry, logs, adherence metrics.
- [ ] Structured feedback collection.
- [ ] Fix bugs and prompts.
- [ ] Coach review of 20 plans.

### Acceptance criteria

- 5–10 testers for 4 weeks.
- Retention D7 > 50%, D30 > 30%.
- At least 70% of sessions tracked.
- No unhandled security incidents.
- LLM cost < €3/user/month.
- Qualitative NPS > 30 (or equivalent feedback).

---

## Phase 5 — Consolidation (continuous)

Non-priority backlog:

- Automatic Garmin push via Training API.
- iOS/HealthKit (only if needed).
- Coach chat with read-only tools.
- AI photo analysis.
- Multisport depth (structured bike/swim plans, triathlon).
- Coach mode (professional following multiple athletes).
- Payments/subscription.
- Polar/Suunto/Whoop/Withings integrations.
- Multi-device sync.

---

## Definition of Done (for each task)

- [ ] Strict TypeScript code, no unjustified `any`.
- [ ] Unit tests for domain logic.
- [ ] Contract tests for the integration (recorded fixtures, no network in CI).
- [ ] E2E tests for the user flow, if applicable.
- [ ] No secrets in code or logs.
- [ ] Compatible migration/backup.
- [ ] Updated documentation (`PIANO`, `FASI`, `INTEGRAZIONI`, `AGENT`).
- [ ] Phase acceptance criteria verified.
- [ ] Manual verification on real data.

## Testing strategy

| Level | What | Tool |
|---|---|---|
| Unit | rules, feasibility, validator | Vitest |
| Contract | Garmin/Yazio/Zepp/Hevy/FIT adapters | Vitest + JSON fixtures |
| E2E | onboarding → plan → check-in → review | Playwright |
| AI eval | 10 personas, assertions on schema/safety | script + fixtures |
| Backup | export → wipe → import | dedicated test |
| Device | Health Connect, Hevy/Garmin export | manual on Android |

## External dependencies

| Dependency | Used for | When |
|---|---|---|
| Garmin Personal API key | web sync | Phase 0 |
| Garmin account + device | `.FIT` test | Phase 0 |
| Yazio account | nutrition sync | Phase 0 |
| Zepp account + scale | weight | Phase 0/2 |
| Hevy Pro + API key | gym export | Phase 0 |
| Google Cloud OAuth | login, Drive backup | Phase 0 |
| LLM API key | plans | Phase 1 |
| Android device | Health Connect | Phase 3 |
| Certified coach | plan review | Phase 2/4 |
| Legal consulting | testing phase | Phase 4 |

## Things that can cause delays

- Garmin/Yazio/Zepp change APIs or block the account.
- Hevy requires Pro or changes the schema.
- The workout `.FIT` format is not imported as expected.
- Health Connect in the background is too limited on Expo.
- The LLM does not produce valid plans without many repairs.
- Actual time is less than estimated.

In all these cases: **cut scope, not quality**. Safety and the coaching loop come before features.
