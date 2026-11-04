# Phase 1 Review — issues and fix plan

**Version:** 1.3 (WS-0, Wave 1 and Wave 2 applied)
**Date:** 27 October 2026
**Scope:** Phase 1 code (`7dacb6e..b2c7b49`)
**Method:** static review + runtime verification on temporary MongoDB (`health_trainer_review`) and API on port 3999
**References:** [`FASI.md`](FASI.md) · [`PIANO.md`](PIANO.md) · [`../AGENT.md`](../AGENT.md)

---

## 1. Summary outcome

Phase 1 is **implemented feature-wise but not releasable**: the main loop
(onboarding → plan → check-in → review → export) breaks due to incompatible user
namespaces, and authentication is open by default.

| Severity | Count | Meaning |
|---|---|---|
| P0 — blocking | 5 | Breaks the flow or exposes/corrupts data |
| P1 — serious | 7 | Feature declared but not working or misleading |
| P2 — medium | 7 | UX, timezone, inconsistencies, debt |
| Doc | 1 | Documentation that makes false claims |

**State that produced this review:** `lint`, `typecheck`, `build`, and `npm test`
(105 tests) are green. The defects are not covered because the services use permissive
Mongo mocks and there is no end-to-end test with a real database.

**Verdict:** Phase 1 **not completed**. The acceptance criteria in `FASI.md` were
all declared satisfied; most were not verified on real data.

> **Status as of 27 October 2026:** WS-0, Wave 1 and Wave 2 closed all P0/P1 and the P2
> safety/timezone/UI items. Only F1-18 and F1-19 remain (deferred) and real-usage
> validation. See §1.1–§1.3.

### 1.1 WS-0 Update (27 October 2026)

The foundations were closed in **WS-0**: global JWT guard, `@CurrentUser()`,
secure config, Zod validation, and FIT body limit. Current status:

| Area | Status |
|---|---|
| Authentication (F1-01, F1-02) | ✅ closed |
| Input validation (F1-05) | ✅ closed |
| FIT upload (F1-04) | ✅ closed |
| Baseline/versioning (F1-03) | ✅ closed (WS-2) |
| Review and check-in (F1-06, F1-07, F1-15, F1-16) | ✅ closed (WS-3) |
| FIT and Hevy export (F1-08, F1-09) | ✅ closed (WS-4) |
| Backup, restore and wipe (F1-10) | ✅ closed (WS-5) |
| `GET /api/review/latest` without review (F1-14) | ✅ closed |
| `GET /api/baseline` without baseline (F1-21) | ✅ closed (runtime verification) |
| Garmin health and metrics overview (F1-22, F1-23) | ✅ closed (runtime verification) |
| Local email/password accounts (F1-24) | ✅ implemented |
| Safety, generator, timezone, UI (F1-11, F1-12, F1-13, F1-17) | ✅ closed (Wave 2) |
| AI coach, scheduler | ❌ open (F1-18, F1-19, deferred) |

**Tests:** 117 green unit tests (`api` 32, `domain` 41, `integrations` 36, `ai` 3,
`config` 5), `lint`, `typecheck`, and API build clean. The e2e test with real Mongo
remains to be done (WS-9). The WS-0 runtime verifications were performed on
`health_trainer_ws0` (then deleted) and on port 3999.

Remaining count: **1 P0**, **7 P1**, **6 P2**.

### 1.2 Wave 1 Update (27 October 2026)

Wave 1 closed five P1 defects and the two review/check-in P2s:

| Workstream | Fix | Runtime evidence |
|---|---|---|
| WS-2 | F1-03 | 5 saves → versions 1–5, only 1 active baseline, `GET /api/baseline` = v5, unique partial index `uniq_active_baseline_per_user` present |
| WS-3 | F1-06, F1-07, F1-15, F1-16 | week with only `adjusted` → 0% adherence; check-in with 20 min → session persisted at 20 min, RPE 5, blocks and notes; `progress` → 50/44/50 min; last week → `400 Il macrociclo è completo (settimana 4/4)...`; check-in from two weeks earlier ignored |
| WS-4 | F1-08, F1-09 | running → `.FIT` download with magic bytes; strength → explicit 400; Hevy without key → 400, non-strength sport → 400 before the key, nonexistent session → 404 |
| WS-5 | F1-10 | backup `0.3.0` with `aiRuns`; restore with foreign `userId` → 15 rows on the authenticated user; double restore → always 15; wipe → `/api/me` 401, `users` and `ai_runs` at 0; subsequent restore recovers baseline v5 |

**Tests:** 130 green unit tests (`api` 38, `domain` 42, `integrations` 40, `ai` 3,
`config` 5, `db` 2), `lint`, `typecheck`, and build clean.

Remaining count: **0 P0**, **2 P1** (F1-11, F1-12), **4 P2**
(F1-13, F1-17, F1-18, F1-19) and the F1-20 documentation mismatch, largely
resolved with this update. The e2e with real Mongo remains in WS-9.

### 1.3 Wave 2 Update (27 October 2026)

Wave 2 closed the two remaining P1s, the timezone P2, and the auth/Hevy UI P2, and
introduced multi-user e2e on real MongoDB:

| Workstream | Fix | Runtime evidence |
|---|---|---|
| WS-6 | F1-11, F1-12 | beginner baseline → macro from `2026-10-27` (same day) with sessions 27/29/31 and sport `running`; cycling goal → all sessions `cycling`, no running; 20 min availability → all blocks exactly 20 min; red flag → save 201 but `POST /api/plan/macro/generate` → `400 ... bloccata per motivi di sicurezza`; PAR-Q `false` → `400 Idoneità medica richiesta...` |
| WS-7 | F1-13 | baseline with `Pacific/Kiritimati` at 10:37 UTC → macro start `2026-10-28`, `/api/plan/today` → `today: 2026-10-28`, `/api/checkin/today` → `date: 2026-10-28` (UTC was still 27/10) |
| WS-8 | F1-17 | `/api/auth/status` exposes `googleClientId`; Google login via Google Identity Services; explicit logout is not overridden by dev auto-login; Hevy key entered in the UI, saved in `localStorage`, and forwarded in the `api-key` header (unit test with mocked `fetch`) |
| WS-9 | e2e | 9 green checks on `health_trainer_e2e`: 401 without token, distinct JWT identities, baselines bound to the authenticated user (userId in the body ignored), isolated plans, cross-user PATCH 404, cross-user FIT export 404 and own FIT with magic bytes, isolated check-ins, isolated backups, missing plans 404 |

**Tests:** 151 green unit tests (`api` 45, `domain` 56, `integrations` 40, `ai` 3,
`config` 5, `db` 2) + 9 e2e checks (`npm run test:e2e`), `lint`, `typecheck`,
`typecheck:scripts` and clean API/web builds.

Remaining count: **0 P0**, **0 P1**, **2 P2** (F1-18 AI coach, F1-19 scheduler and
encrypted credentials, both deferred with justification). F1-20 is closed by this
documentation update; **F1-21**, **F1-22** and **F1-23** were found and closed
during the runtime verification of October 27, 2026.

**Not verified:** Google login with real credentials, Hevy export with a real key,
`.FIT` import to Garmin Connect, automatic sync, real 14-day usage.

#### F1-21 — `GET /api/baseline` responds 200 with an empty body

**Status: ✅ closed during runtime verification.** Without a baseline the controller
returned `null`, which Nest serializes as `200` with no body. The UI calls
`response.json()` and would error out; with the global refetch every 10 s the onboarding
wizard was unmounted and remounted. Now the controller responds `404` with an explicit
message (the UI already interprets it as "no baseline"). Added controller unit tests
and an e2e check on missing baseline and plans.

#### F1-22 — Garmin health says "missing" while sync and check work

**Status: ✅ closed during runtime verification.** `/api/health` only looked at
`env.GARMIN_PERSONAL_API_KEY`, while `GarminService` also accepts
`secrets/garmin-key.txt`. Now `HealthService` passes to `buildHealthReport` the value
resolved by `GarminService.isConfigured()`; the report remains a pure, testable function.
Verified at runtime: `/api/health` → `garmin: configured` with the key from file.

#### F1-23 — The Garmin overview includes Yazio metrics and duplicates dates

**Status: ✅ closed during runtime verification.** `GarminSyncService.overview` used
`getRecentDailyMetrics` (all sources) instead of
`getRecentDailyMetricsBySource(..., GARMIN_PROVIDER)`, so for the same dates
two rows appeared and React reported duplicate keys. Also fixed the count
with `countDailyMetricsBySource`. Verified: 7 metrics, 7 unique dates, `counts.metrics`
Garmin only.

### 1.4 Local accounts and integration isolation (October 27, 2026)

Added local authentication to be able to start with a real account without depending
on Google, keeping Google as an alternative method:

| Area | Implementation |
|---|---|
| Registration | `POST /api/auth/register` with email, password (min 8) and optional name; normalized email, 409 on duplicate, `usr_<uuid>` account with `athlete` role |
| Login | `POST /api/auth/login` (200) with scrypt verification and timing-safe; generic 401 `Email o password non validi.` |
| Storage | `scrypt$<salt>$<key>` hash in `auth_credentials` (unique indexes on `userId` and `email`); no password material in the public `users` document |
| Google | The first verified login in the allowlist creates the account; with an email already present it links the same `userId` instead of duplicating it |
| UI | Login screen with Sign in / Create account tabs, Italian API error handling, Google button always visible (disabled with instructions as long as `GOOGLE_CLIENT_ID`/`GOOGLE_ALLOWED_EMAILS` are missing) and dev login unchanged |
| Integrations | Garmin/Yazio sync, analyze and overview use the token's `userId`; hardcoded `PERSONAL_USER_ID` removed |
| Wipe | `DELETE /api/export/me` also deletes `auth_credentials` |

**Tests:** 225 green unit tests (`api` 73, `domain` 99, `integrations` 40, `ai` 20,
`config` 5, `db` 2) + 14 e2e checks, `lint`, `typecheck`, `typecheck:scripts` and clean
API/web builds. The e2e verifies registration, correct login, wrong password (401),
duplicate email (409), absence of password material in the response and initial baseline
404 for the new account.

Remaining count unchanged: **0 P0**, **0 P1**, **2 P2** (F1-18 AI coach, F1-19
scheduler and encrypted credentials). Still unverified: real Google login (requires an
OAuth client + allowlist) and Hevy export with a real key.

---

## 2. How to reproduce

```bash
npm run build -w @health-trainer/api
API_PORT=3999 MONGODB_URI=mongodb://127.0.0.1:27017/health_trainer_review \
  node apps/api/dist/main.js
```

Minimal checks:

```bash
# 1. Namespace incoerente
curl -s localhost:3999/api/me                     # id: personal
curl -s -X POST localhost:3999/api/review/weekly  # 404: cerca user_marco
curl -s localhost:3999/api/export/backup          # tutte le collezioni vuote

# 2. Baseline corrotta (dopo 4 salvataggi dello stesso payload)
curl -s localhost:3999/api/baseline/history       # 3 record con supersededAt: null

# 3. Upload FIT
# payload JSON con base64 da 200 KB -> HTTP 413

# 4. Validazione assente
curl -X POST localhost:3999/api/plan/macro/generate -d '{"totalWeeks":1}'  # 500
curl -X PATCH localhost:3999/api/plan/sessions/<id> -d '{"status":"banana"}' # 200
```

Cleanup: stop the API process and delete the `health_trainer_review` database.

---

## 3. Issue log

### P0 — Blockers

#### F1-01 — Two incompatible user namespaces

**Status: ✅ closed in WS-0.** Global `AuthGuard` (`APP_GUARD` in `auth.module.ts`)
risolve l'utente solo dal bearer token e lo espone con `@CurrentUser()`; `x-user-id` è
ignorato da tutti i controller. Verificato a runtime: senza token → 401,
`x-user-id: personal` senza token → 401, `me` con token + header estraneo → `personal`.

- **Symptom:** half of the APIs write to `personal`, half read `user_marco`.
- **Evidence:** `/api/me` → `personal`; baseline and plans saved to `personal`;
  `POST /api/review/weekly` → `404`; `GET /api/export/backup` → empty collections.
- **Cause:** `baseline`, `plan`, `checkin` use `AuthService.getMe`; `review`, `activity`,
  `ai`, `export` use the `x-user-id` header with fallback `"user_marco"`
  (`review.controller.ts:4-6`, `activity.controller.ts:5-6`, `ai.controller.ts:4-5`,
  `export.controller.ts:33-34`). The UI does not send any header.
- **Risk:** anyone can read, modify or delete another id's data
  simply by sending `x-user-id`.
- **Fix:** single JWT guard; `@CurrentUser()` decorator; remove `x-user-id`;
  the UI sends `Authorization: Bearer`.
- **Test:** e2e with two users: every endpoint must isolate data and reject
  requests without a token.

#### F1-02 — Insecure authentication by default

**Status: ✅ closed in WS-0.** Removed the hardcoded secret: `JWT_SECRET` is required
(min 32 characters) outside of `NODE_ENV=test` and boot fails with
`Invalid environment configuration`. `ENABLE_DEV_ENDPOINTS` is `false` by default and
dev login responds 403 when disabled. `auth/status` reads the real env. The Google
token verifies `iss`, `aud`, `email_verified`, `exp` and the allowlist (required if
`GOOGLE_CLIENT_ID` is set). `getMe` no longer performs auto-login and a deleted user
is no longer re-authenticated by the fallback.

- **Symptom:** automatic login, hardcoded secret, Google tokens accepted without verification.
- **Cause:**
  - `JWT_SECRET` fallback to `"dev-jwt-secret-health-trainer-32chars!"`
    (`apps/api/src/auth/auth.service.ts`);
  - `ENABLE_DEV_ENDPOINTS` default `true` (`packages/config/src/env.ts:20`);
  - `getMe` without header runs `devLogin()` (`auth.service.ts:180-195`);
  - `/api/auth/status` always returns `devLoginEnabled: true` (`auth.controller.ts`);
  - Google verification without `iss`/`email_verified`, `aud` skipped if `GOOGLE_CLIENT_ID`
    is not set, allowlist empty by default.
- **Fix:** `JWT_SECRET` required outside of `NODE_ENV=test`; dev endpoints explicit
  opt-in; `auth/status` reads the env; full Google token verification; allowlist
  required when Google is configured.
- **Test:** boot without `JWT_SECRET` in production → error; forged Google token or
  without `email_verified` → 401.

#### F1-03 — Baseline saving corrupts history

**Status: ✅ closed in WS-2.** `id`s are generated by the server with UUIDv7
(`packages/db/src/ids.ts`), `saveBaseline` supersedes by `{ userId, supersededAt: null }`
and increments `version`; `getCurrentBaseline` sorts by `version`/`validFrom`. The
unique partial index `uniq_active_baseline_per_user` is created at boot, with
deduplication of legacy data. Verified: 5 saves → versions 1–5, only one active, `GET` = v5.

- **Symptom:** multiple baselines active at the same time, duplicate versions, `/api/baseline`
  returns an old version.
- **Evidence:** 4 saves → 4 records, 3 with `supersededAt: null`, two with `version: 3`,
  `GET /api/baseline` → `version: 2`.
- **Cause:** `saveBaseline` supersedes by the `_id` of the current baseline
  (`packages/db/src/baselines.ts:15-40`), but the `id` comes from the client and is not validated;
  a unique/partial index on `{userId, supersededAt: null}` is missing; `getCurrentBaseline`
  has no deterministic ordering.
- **Fix:** server-generated id; supersede by `{userId, supersededAt: null}`;
  unique partial index; `getCurrentBaseline` sorts by `version`/`validFrom`.
- **Test:** integration test with real Mongo: 5 saves → only 1 active baseline,
  monotonic versions, `getCurrent` = latest.

#### F1-04 — FIT upload always fails with 413

**Status: ✅ closed in WS-0.** `main.ts` disables the default body parser and registers
`useBodyParser("json", { limit: "15mb" })`. The endpoint validates the `.FIT` signature at bytes 8–11 and
the maximum size of 10 MB before decoding. Verified: 200 KB non-FIT payload → 400 with
a clear message (no longer 413), valid FIT → 201.

- **Symptom:** any real FIT is rejected.
- **Evidence:** 200 KB payload → 266 KB base64 → `413 request entity too large`.
- **Cause:** `apps/api/src/main.ts` does not configure the body parser (Express default 100 KB);
  the endpoint accepts base64 in JSON (overhead ~33%).
- **Fix:** body limit ≥ 10 MB or multipart upload; validate extension, size and
  FIT magic bytes before decoding.
- **Test:** upload of a real 1 MB FIT → 201; file > limit → 413 with a clear message.

#### F1-05 — No input validation

**Status: ✅ closed in WS-0.** `ZodValidationPipe` explicitly applied to every
endpoint (plan, activity, check-in, AI, auth, export) with dedicated schemas. The session
patch is re-validated with `PlannedSessionSchema` after the merge. Verified:
`totalWeeks:1` → 400 `MacroPlan validation failed`, `weekIndex:"abc"` → 400,
`status:"banana"` → 400, `durationMin:-5` → 400, check-in with invalid date → 400.

- **Symptom:** invalid inputs produce 500 or are persisted.
- **Evidence:** `totalWeeks: 1` → 500; `weekIndex: "abc"` → 500;
  `PATCH status: "banana"` → 200 and status `banana` saved.
- **Cause:** no global `ValidationPipe`; the DTOs are TypeScript interfaces
  (erased at runtime); `updatePlannedSession` writes raw state without revalidating
  against `PlannedSessionSchema`.
- **Fix:** global `ValidationPipe` + Zod DTOs (or class-validator); validate the patch with
  `PlannedSessionSchema.partial()`; 400 errors with detail.
- **Test:** invalid payload matrix → always 400, never 500, no writes.

---

### P1 — Severe

#### F1-06 — `adjusted` counts as completed and `progress` is not applied

**Status: ✅ closed in WS-3.** `computeWeeklyReview` counts only `status === "completed"`;
`applyReviewDecision` applies +10% volume on `progress` and −30% with RPE −2 on `deload`
(mobility/recovery excluded). Verified: week with only `adjusted` → 0%;
`progress` → 50/44/50 min.

- **Symptom:** a week with only adapted sessions results in 100% completed and
  "ready to progress", but the volume does not change.
- **Evidence:** 3 `adjusted` sessions → `3/3`, `100%`, `progress` decision.
- **Cause:** `weekly-review.ts:15-16` includes `status === "adjusted"`;
  `advanceWeek` (`review.service.ts:80-107`) handles only `deload` and ignores
  `progress`/`maintain`/`reduce`.
- **Fix:** `adjusted` is not completed; introduce a separate `adjustedCompleted` if needed;
  actually apply +10% (or the chosen progression) to the next microcycle.
- **Test:** review with only `adjusted` → 0% adherence; `progress` → next week's
  volume greater than 10% (± rounding).

#### F1-07 — Check-in adaptation is discarded

**Status: ✅ closed in WS-3.** `PlanService.applyAdjustment` revalidates the adapted session
and fully replaces it (`replacePlannedSession`): duration, RPE, blocks and notes
persist. Verified: check-in with 20 min available → 20-min session, RPE 5,
1 block, notes `Adattamento automatico (swap): ...`.

- **Symptom:** the UI shows the reduced session, but the plan remains unchanged.
- **Cause:** `checkin.service.ts:63-67` saves only `status: "adjusted"` and the notes;
  `DailyAdjustmentResult.adjustedSession` is not persisted.
- **Fix:** persist the adapted session (duration, RPE, blocks) and distinguish it from
  "completed"; the review must read the real data.
- **Test:** check-in with pain → the saved session has reduced duration/RPE and the review
  does not count it as completed.

#### F1-08 — Incorrect FIT export for strength/mobility and lost targets

**Status: ✅ closed in WS-4.** `workoutSportFor` maps only running/bike/swim and throws an
explicit error for other sports; the controller responds 400. `parseTextTarget`
converts pace (`4:20-4:35/km` → speed), power (`W`), cadence (`rpm`) and HR zones.
Verified: running → `.FIT` with magic bytes; strength → 400 with dedicated message.

- **Symptom:** a gym workout is exported as running; pace/HR targets
  disappear.
- **Evidence:** `strength → running`, `mobility → running`; all generated steps
  have `heartRateZone` or `open` targets.
- **Cause:** `workout-encoder.ts:260-261` maps everything that is not bike/swim to running;
  `sessionToWorkoutDef` does not interpret textual targets.
- **Fix:** reject FIT for unsupported sports; map pace/HR/zones from blocks;
  explicit message for strength/mobility (Hevy or generic export).
- **Test:** strength/mobility → 400; running with pace target → correct speed target
  in the decoded FIT.

#### F1-09 — Fake Hevy export

**Status: ✅ closed in WS-4.** `exportHevyRoutine` returns `success: false` without a
key; the controller first resolves session and sport (strength required) and then reads
`HEVY_API_KEY`/`body.apiKey`. Exercises derive from blocks with a declared full-body
fallback. No invented session: missing session → 404. Verified without a real key;
export with a real key remains to be tested.

- **Symptom:** without a key it returns `success: true`; the routine is always the same.
- **Cause:** `routine-builder.ts:139-147` (offline preview with success),
  hardcoded exercises and weights, no reading of `session.blocks`, `HEVY_API_KEY` env
  ignored (`export.controller.ts:117-146`), invented `strength_generic` session.
- **Fix:** `success: false` without a key; use `HEVY_API_KEY`; map blocks/exercises;
  do not invent sessions; validate the Hevy response.
- **Test:** without a key → 4xx/`success:false`; with Hevy mock → payload with exercises
  derived from the session.

#### F1-10 — Backup, restore and wipe do not keep their promises

**Status: ✅ closed in WS-5.** `0.3.0` backup with `aiRuns`; `restoreUserData(db, backup,
userId)` ignores the body's `userId`, validates keys before deleting and replaces
the collections (idempotent). The wipe also deletes `users` and `ai_runs`. Verified:
foreign `userId` ignored (0 rows), double restore → 15 rows, wipe → `/api/me` 401,
dev login + restore → recovered v5 baseline.

- **Symptom:** restore duplicates data, ignores half the collections and trusts the body;
  the wipe does not delete the user.
- **Cause:** `packages/db/src/backup.ts`: `insertMany` without delete/upsert/transaction,
  `userId` taken from the body, analysis/metrics/nutrition missing in restore,
  `deleteUserData` does not touch `users` or `ai_runs`.
- **Fix:** restore for authenticated user, delete+insert or upsert in a transaction,
  all exported collections, complete wipe; explicit confirmation in the UI.
- **Test:** export → wipe → import on a clean DB → identical dataset; double import
  does not duplicate.

#### F1-11 — Safety blocks nothing

**Status: ✅ closed in WS-6.** `assessSafety` is invoked both when saving the baseline
(log only, to avoid losing data) and before generation, which is blocked with
`400` on absolute red flags or incomplete PAR-Q. The wizard allows entering red
flags and injuries. Verified at runtime: save 201, generate 400 with an explicit message.

- **Symptom:** red flags and PAR-Q do not prevent plan creation.
- **Cause:** `assessSafety` is called only by `GET /api/baseline/safety`
  (`baseline.service.ts:74`); onboarding and plan generation do not use it.
- **Fix:** mandatory assessment before saving the baseline and generating plans;
  block on absolute red flags; the wizard must be able to enter red flags and injuries.
- **Test:** baseline with red flags → plan rejected with a reason; negative PAR-Q →
  clearance request.

#### F1-12 — The generator ignores goal, sport, and actual duration

**Status: ✅ closed in WS-6.** The generator starts from today in the athlete's timezone (or
from the requested date), respects `goals.primary.sport` and `profile.sports`, derives the paces
from `goal.targetValue`/`targetUnit`, and scales the blocks to `durationMin`. The validator
reports `session_blocks_overflow`.

- **Symptom:** plan always running-first, starts on the following Monday, blocks longer
  than the session.
- **Cause:** `plan-generator.ts`: default `running` outside the knee branch;
  `getNextMonday()` (Tuesday 27/10 → start 02/11, 6 rest days); hardcoded paces
  `4:20–4:35`; strength blocks ~50 min even with a lower `durationMin`.
- **Fix:** start from the requested date or from today; use `profile.sports` and
  `goals.primary.sport`; derive the paces from the baseline; scale the blocks to the duration.
- **Test:** bike goal → no running; Tuesday generation → starts today;
  sum of blocks ≤ `durationMin`.

---

### P2 — Medium

#### F1-13 — Dates in UTC instead of the user's timezone

**Status: ✅ closed in WS-7.** Single helper in `packages/domain/src/rules/dates.ts`
(`localDate`, `todayLocalDate`, `resolveTimeZone`, `addDaysIso`) used by API, sync,
generator, and UI; `getUserTimeZone` reads the active baseline with fallback `Europe/Rome`.
Verified with `Pacific/Kiritimati`: local "today" 28/10 while UTC was 27/10.

- **Cause:** `toISOString().slice(0,10)` in API, UI, and generator; `profile.timezone`
  unused.
- **Effect:** check-in and "today" session wrong after 22:00 Italian time.
- **Fix:** single `localDate(date, timezone)` helper, used everywhere.
- **Test:** `2026-10-27T23:30:00Z` with `Europe/Rome` → `2026-10-28`.

#### F1-14 — `GET /api/review/latest` responds 200 with an empty body

**Status: ✅ closed in WS-0.** The controller responds `404 Not Found` with an explicit
message when no review exists; the UI handles 404 as "no review".

- **Cause:** the service returns `null` (`review.service.ts:66-69`); Nest sends 200
  without a body.
- **Effect:** `WeeklyReviewCard` treats only 404 as "no review" and fails with a JSON
  parsing error.
- **Fix:** respond with an explicit 404 or `204`, and align the UI.
- **Test:** no review → 404 handled by the UI without errors.

#### F1-15 — `advanceWeek` reuses old reviews and restarts from 1

**Status: ✅ closed in WS-3.** `advanceWeek` uses `getReviewForWeek` on the current
week and, if missing, recalculates it; at the end of the macro it responds 400 instead of
returning to week 1. Verified: `400 Il macrociclo è completo (settimana 4/4)...`.

- **Cause:** it uses the latest available review without checking the week
  (`review.service.ts:80-107`); at the end of the macro `nextWeekIndex = 1`.
- **Fix:** recalculate/validate the current week's review; at the end of the macro
  close the cycle or request a new macrocycle.
- **Test:** two consecutive advances use distinct reviews; last week →
  no wrap-around.

#### F1-16 — Wrong time window for the review

**Status: ✅ closed in WS-3.** The review reads `getCheckinsInRange` between
`microPlan.startDate` and `microPlan.endDate`. Verified: a check-in with pain from
2026-10-01 (outside the week) did not produce pain events in the current review.

- **Cause:** `review.service.ts:48` reads the last 14 check-ins, not those of the
  week being evaluated.
- **Fix:** filter by `date` between `microPlan.startDate` and `microPlan.endDate`.
- **Test:** pain from two weeks earlier does not influence the current review.

#### F1-17 — Google login and keys not connected to the UI

**Status: ✅ closed in WS-8.** `/api/auth/status` exposes the public client ID, the login
screen uses Google Identity Services, dev login is hidden when disabled, logout exists,
and the Hevy key can be entered in the board and forwarded for export.
Verified at runtime the status (`googleConfigured:false`, `devLoginEnabled:true`) and in
a unit test the forwarding of the key; the real Google login has not been tested.

- **Cause:** backend `POST /api/auth/google` present, but no button or token handling;
  no `fetch` sends `Authorization`; input for the Hevy key is missing.
- **Fix:** login flow (Google + dev) with token storage, `apiFetch` wrapper, Hevy key
  form; hide dev login when disabled.
- **Test:** login → authenticated calls; logout → protected endpoints 401.

#### F1-18 — AI coach misaligned with the domain

**Status: ❌ open, deferred.** It was not touched in Wave 2.

- **Cause:** `packages/ai/src/coach.ts` distinguishes `strength`/`interval`, while the
  generator produces `aerobic_base`, `low_impact_endurance`, `intervals`, etc.
- **Effect:** recommendations in the default branch; deterministic provider passed off as AI.
- **Fix:** map the real types or use `sport` + `intensity`; clearly state
  that the provider is deterministic.
- **Test:** each generated type produces specific advice.

#### F1-19 — Scheduler and credentials

**Status: ❌ open, deferred.** It was not touched in Wave 2; sync remains manual.

- **Cause:** no scheduler (manual sync only); Yazio credentials in files/env,
  unencrypted; Yazio weight limited to the latest value per date.
- **Fix (can be deferred to Phase 2):** scheduled job with backoff; credential encryption;
  complete weight history.
- **Note:** until this is done, the documentation must not say "automatic sync".

### Documentation

#### F1-20 — Outdated documentation

**Status: ✅ closed in Wave 2.** `FASI.md`, `AGENT.md`, and `README.md` report 148 unit
tests + 9 e2e, the real status of safety/generator/timezone/auth, the remaining limitations, and
link this document.

- **Cause:** `FASI.md` declares the scheduler, `.TCX`, post-session flow,
  red flag UI, safety for all injuries, 14 days of real use, valid Hevy,
  Garmin import, and clean restore as complete; `AGENT.md` says "Phase 0 completed"; inconsistent test
  counts (65 vs 105).
- **Fix:** report the real status, link this document, update the counts.

---

## 4. Parallelizable work

### 4.1 Partitioning rule

The code is already divided into packages with one-way dependencies:

```
domain  <-  ai
   ^
   |
 db  <-  api  ->  integrations
                     ^
                     |
                   web (solo HTTP)
```

Work that **does not touch the same files** can be parallelized. Conflict points
are:

| File / area | Contended by |
|---|---|
| `apps/api/src/*/*.controller.ts` | WS-1 (auth), WS-3 (review), WS-4 (export), WS-5 (backup) |
| `apps/api/src/main.ts` | WS-1 (guard/validation), WS-2 (body limit) |
| `packages/db/src/baselines.ts` | WS-2 (versioning) |
| `apps/api/src/baseline/baseline.service.ts` | WS-2 (versioning), WS-6 (safety) |
| `apps/api/src/export/export.controller.ts` | WS-4 (FIT/Hevy), WS-5 (backup) |
| `packages/domain/src/rules/plan-generator.ts` | WS-6 (sport/date), WS-7 (timezone) |
| `apps/web/src/**` | WS-1 (fetch auth), WS-8 (UX export/login), WS-7 (date) |

### 4.2 Workstream

| ID | Content | Main files | Depends on | Parallelizable immediately |
|---|---|---|---|---|
| **WS-0** | Foundations: JWT guard, `@CurrentUser`, `ValidationPipe`, body limit, secure config | `auth/*`, `main.ts`, `config/env.ts`, all controllers (1 line) | — | ✅ **done** (27 Oct 2026) |
| **WS-1** | Auth completion: Google token, allowlist, opt-in dev login, `auth/status` | `auth/*`, `config` | WS-0 | ✅ done (backend + UI in WS-8) |
| **WS-2** | Baseline: server id, supersede, unique index, `getCurrent` | `db/baselines.ts`, `db/indexes.ts`, `baseline.service.ts` | — | **Yes** (repository only) |
| **WS-3** | Review/check-in semantics: `adjusted`, actual progression, weekly window, `advanceWeek` | `domain/rules/weekly-review.ts`, `domain/rules/daily-adjustment.ts`, `review.service.ts`, `checkin.service.ts` | — | **Yes** (domain + service, no controller) |
| **WS-4** | Export: FIT sport/target, real Hevy | `integrations/fit/*`, `integrations/hevy/*`, `export.controller.ts` | — | **Yes** (integrations), controller after WS-0 |
| **WS-5** | Backup/restore/wipe | `db/backup.ts` | — | **Yes** (repository), controller after WS-0 |
| **WS-6** | Safety + plan generator | `domain/rules/safety.ts`, `domain/rules/plan-generator.ts`, `baseline.service.ts`, `plan.service.ts` | — | ✅ **done** (27 Oct 2026) |
| **WS-7** | Date/timezone | new helper + API/UI/domain call sites | WS-2, WS-3, WS-6 (to avoid rewriting) | ✅ **done** (27 Oct 2026) |
| **WS-8** | UI: Google/dev login, `apiFetch`, Hevy key, empty states | `apps/web/src/**` | WS-0 (API contract) | ✅ **done** (27 Oct 2026) |
| **WS-9** | e2e tests + documentation | `scripts/e2e-api.ts`, `docs/**` | all | ✅ **done** (27 Oct 2026) |

### 4.3 Recommended waves

**Wave 0 — foundation (sequential, 1 session) — ✅ completed on 27 October 2026**
WS-0 + WS-1. It touches all controllers: doing it first avoids downstream conflicts.
Includes `main.ts` (validation + body limit) and `config`.

**Wave 1 — four parallel streams (no shared files)**

- Stream A: **WS-2** (baseline repository)
- Stream B: **WS-3** (review/check-in, domain + service only)
- Stream C: **WS-4** (integrations FIT/Hevy)
- Stream D: **WS-5 + WS-9-docs** (backup repository + documentation)

Each one can run in a separate worktree with its own local branch; domain/integration
tests do not require the API.

**Wave 2 — three parallel streams (after merging Wave 1) — ✅ completed on 27 October 2026**

- Stream E: **WS-6** (safety + generator)
- Stream F: **WS-8** (UI auth/export)
- Stream G: **WS-7** (timezone, last because it crosses all call sites)

**Wave 3 — closing — ✅ completed on 27 October 2026**

- **WS-9**: e2e with real Mongo (golden path + two users + backup/restore),
  update `FASI.md`/`AGENT.md`/`README.md`. The script is `scripts/e2e-api.ts`
  (`npm run test:e2e`), it rejects DBs not matching `*_e2e` and cleans the database at the end of the run.

### 4.4 What NOT to parallelize

- WS-0 against anyone touching controllers: guaranteed conflicts.
- WS-4 and WS-5 on the same `export.controller.ts`: split the controller into two
  (workout vs data) before parallelizing, or run them sequentially.
- WS-7 vs WS-3/WS-6: the timezone changes the same review and generation functions.
- Any change to `packages/domain/src/schemas/*`: it is imported by everyone.

### 4.5 Definition of Done for each stream

- Unit or integration tests that **fail first** and pass afterward.
- No unjustified `any`, `lint`/`typecheck` green.
- Endpoint updated in `AGENT.md` §5.1 if the contract changes.
- `docs/FASI.md` updated only when the criterion is verified.
- No secrets in code, logs, or fixtures.

---

## 5. Review exit criteria

Phase 1 can be considered closed when:

1. All P0s are closed and covered by tests.
2. All P1s are closed or explicitly deferred with a rationale in `FASI.md`.
3. There is an e2e test with a real Mongo for:
   onboarding → plan → check-in → review → export → backup/restore → wipe.
4. A second user cannot read or modify the first user's data.
5. `FASI.md` does not contain `[x]` checkboxes for unverified features.

---

## 6. Non-goals of this round

- Rewrite the architecture or introduce a real LLM.
- Garmin/Yazio scheduler (Phase 2).
- Android app.
- Multi-tenancy, advanced roles, billing.
- Garmin/Hevy workout import.
