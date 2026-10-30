# Integrations — operational specifications

**Version:** 1.7  
**Date:** 26 October 2026  
**References:** [`PIANO.md`](PIANO.md) · [`FASI.md`](FASI.md) · [`../AGENT.md`](../AGENT.md)

> Unofficial APIs (Yazio, Zepp) may change or violate the ToS. In this project they are used in **personal mode**, isolated behind an adapter and with manual fallback. They do not become critical dependencies.

## 0. Implementation status (26 October 2026)

| Provider | Status | Where |
|---|---|---|
| Garmin Personal | **client + mapper + persistent sync + UI + FIT analysis/brief**: 3 activities and 7 days of metrics in Mongo; real FIT parsed (17,492 records, 44 laps, 42 splits); test with 6 activities, sleep, HRV, steps, stress, Body Battery, RHR, SpO₂, `.FIT` 529 KB; weight 0 records | `packages/integrations/src/garmin/`, `packages/integrations/src/fit/`, `apps/api/src/integrations/garmin-sync.service.ts`, `docs/FIT.md` |
| Garmin `.FIT` export | not started | — |
| Yazio | **client v22 + mapper + persistent sync + UI**; **real test OK**: 7 days of macros and weight, 0 errors, idempotent sync | `packages/integrations/src/yazio/`, `apps/api/src/integrations/yazio-sync.service.ts`, `docs/spikes/yazio.md` |
| Zepp | not started | — |
| Hevy | not started | — |
| Health Connect | not started (phase 3) | — |
| Google Drive backup | not started | — |

Useful commands:

```bash
npm run spike:garmin              # stampa un report redatto
npm run spike:garmin -- --write   # salva docs/spikes/garmin.local.json (ignorato da git)
npm run test -w @health-trainer/integrations
```

---

## 1. Common adapter contract

```ts
export interface ProviderAdapter<TConfig, TRaw, TCanonical> {
  readonly provider: string;
  readonly capabilities: ProviderCapability[];

  connect(config: TConfig): Promise<ProviderConnection>;
  refresh(connection: ProviderConnection): Promise<ProviderConnection>;
  healthCheck(connection: ProviderConnection): Promise<ProviderHealth>;

  pull(connection: ProviderConnection, cursor?: string): Promise<{
    items: TCanonical[];
    nextCursor?: string;
    raw?: TRaw[];
  }>;

  // Solo per provider che supportano scrittura (Hevy)
  push?(connection: ProviderConnection, payload: TCanonical): Promise<PushResult>;
}
```

Rules:

- **Idempotency:** each item has `(source, externalId)`.
- **Provenance:** `source`, `fetchedAt`, `confidence`.
- **No adapter writes directly to the DB:** it returns canonical data; the service persists it.
- **No adapter logs tokens or health payloads.**
- **Typed errors:** `AuthExpired`, `RateLimited`, `ProviderUnavailable`, `InvalidResponse`, `TermsBlocked`.
- **Fixtures:** each adapter has recorded responses for contract tests.

---

## 2. Garmin Personal API

### 2.1 What it is

A **personal, read-only, pull** API intended for personal applications. It is not for multi-user commercial applications.

### 2.2 Authentication

1. Create the key at `https://connect.garmin.com/app/settings/personalApiToken`.
2. Choose expiration: 30 / 90 / 180 / 365 days.
3. The key is shown **only once**.
4. Exchange it for a token:

```http
POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token
Authorization: ApiKey <PERSONAL_API_KEY>
```

Response: JWT `access_token` with `exp` (24 hours). **No refresh token**: repeat the exchange with the key.

### 2.3 Useful endpoints

| Data | Endpoint |
|---|---|
| Activities (list) | `GET /activitylist-service/activities/search/activities?start=0&limit=20&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` |
| Activity detail | `GET /activity-service/activity/{activityId}` |
| Download `.FIT` | `GET /download-service/files/activity/{activityId}` (ZIP) |
| Sleep | `GET /sleep-service/sleep/dailySleep?date=YYYY-MM-DD` |
| Sleep (range) | `GET /sleep-service/sleep/dailySleepSummariesByDate?startDate=…&endDate=…` |
| HRV | `GET /hrv-service/hrv/{date}` |
| HRV (range) | `GET /hrv-service/hrv/daily/{start}/{end}` |
| RHR / summary | `GET /usersummary-service/v2/dailysummaries?startDate=…&endDate=…` |
| Steps | `GET /usersummary-service/stats/steps/daily/{start}/{end}` |
| Stress | `GET /usersummary-service/stats/stress/daily/{start}/{end}` |
| Body Battery | `GET /wellness-service/wellness/bodyBattery/reports/daily?startDate=…&endDate=…` |
| Weight/measurements | `GET /weight-service/weight/range/{start}/{end}?includeAll=true` |
| Food log | `GET /nutrition-service/food/logs/{date}` |
| Profile | `GET /userprofile-service/userprofile/settings` |

> The paths are those used by the official client `garmin/connect-personal-api-python`. Always verify in the Swagger docs and with real responses.

### 2.4 Current implementation

- `packages/integrations/src/garmin/personal-client.ts`: token exchange, cache with expiration, single retry on 401, typed errors (`AuthExpiredError`, `RateLimitedError`), timeout.
- In development, the API reads the key from `GARMIN_PERSONAL_API_KEY` or from `secrets/garmin-key.txt` (ignored by git). In production, only env/secret manager.
- Wrapper: `getProfileSettings`, `searchActivities`, `getActivity`, `downloadActivity`, `getDailySleep`, `getHrv`, `getDailySummaries`, `getWeightMeasurements`, `getSteps`, `getStress`, `healthCheck`.
- Test: `personal-client.spec.ts` with mocked fetch (raw/JSON token, cache, 401, 429, download, health check).
- Spike: `scripts/spike-garmin.ts`, redacted output; it does not save tokens or clinical values.

**Verified with a real key (26 October 2026):**
File: docs/INTEGRAZIONI.md (part 2)

- The token endpoint returns **406** if `Accept: application/json` is sent; without `Accept` it returns **200** with a **plain-text JWT**, not JSON. The client handles both.
- The activity download returns **406** with `Accept: application/octet-stream`; without `Accept` it returns a valid ZIP (529 KB in the test).
- 6 activities in 14 days; sleep, HRV, steps, stress, daily summary, Body Battery, RHR, SpO₂, HR zones present; weight 0 records (no Garmin scale); hydration/fitness age reachable but without data.
- No rate limit observed in a single run.
- **Persistent sync verified:** 3 activities and 7 days of metrics in `activities` / `metrics_daily`; second sync idempotent (same counts).

**Not yet verified:** rate limit over 24–48h of polling, behavior with manual/indoor activities, saving of the original `.FIT`.

### 2.5 Persistence and sync

Collections:

| Collection | Content | Key |
|---|---|---|
| `activities` | canonical activities | `(userId, source, externalId)` unique |
| `metrics_daily` | canonical daily metrics | `(userId, date, source)` unique |
| `sync_runs` | audit of every sync | `runId`, status, stats, errors |
| `sync_state` | last sync per provider | `(userId, provider)` unique |

Endpoint:

```text
POST /api/integrations/garmin/sync?days=7
GET  /api/integrations/garmin/overview?days=7
```

Flow:

1. `searchActivities` + `getDailySummaries` + `getBodyBattery` + `getWeightMeasurements`.
2. For each day: `getDailySleep`, `getHrv`, `getDailyHeartRate`, `getSpo2` (concurrency 3, non-blocking per-day errors).
3. `mapGarminActivities` / `buildGarminDailyMetrics`.
4. Idempotent upsert in Mongo.
5. `sync_runs` + `sync_state`; the overview reads from Mongo and does not call Garmin.

UI: “Sync now” button, last sync, 3 recent activities, 7-day metrics table.

### 2.6 Sync scheduling (to do)

- **Activities:** every 30–60 minutes (or when the app opens).
- **Health:** 1–2 times a day (sleep/HRV/RHR in the morning).
- **Weight:** once a day.
- **Backfill:** at onboarding, last 30–90 days (activities and weight). Personal API allows ranges; respect rate limit.
- **Cursor:** `lastActivityStartDate` and `lastHealthDate`.
- **Dedupe:** `externalId = activityId`; keep `source: "garmin"`.
- **Token cache:** store it encrypted with `expiresAt`; renew 1 hour before.
- **Expiring key:** 7-day reminder; `expiring` status in UI.

> Today sync is manual (endpoint/UI); the automatic scheduler is the next step.

- **Activities:** every 30–60 minutes (or when the app opens).
- **Health:** 1–2 times a day (sleep/HRV/RHR in the morning).
- **Weight:** once a day.
- **Backfill:** at onboarding, last 30–90 days (activities and weight). Personal API allows ranges; respect rate limit.
- **Cursor:** `lastActivityStartDate` and `lastHealthDate`.
- **Dedupe:** `externalId = activityId`; keep `source: "garmin"`.
- **Token cache:** store it encrypted with `expiresAt`; renew 1 hour before.
- **Expiring key:** 7-day reminder; `expiring` status in UI.

### 2.7 Errors

| Code | Meaning | Action |
|---|---|---|
| 401 | expired/revoked token | new token from the key; if it fails, expired key |
| 403 | invalid key or permission | request a new key |
| 429 | rate limit | exponential backoff + jitter |
| 5xx | Garmin down | retry with backoff; do not mark the connection as broken |

### 2.8 Limits

- **No workout push.**
- **No webhook:** polling only.
- **Personal key:** do not use it for multiple users. For the test phase: Garmin Startup or separate personal keys (with clear UX).
- **Expiration:** the key must be rotated; the token lasts 24h.

### 2.9 Canonical mapping

| Garmin | Canonical |
|---|---|
| `activityId` | `activities.externalId` |
| `activityType.typeKey` | `activities.sport` (`running`, `cycling`, `swimming`, `strength_training`, …) |
| `startTimeLocal` | `activities.start` (UTC + tz) |
| `duration` | `activities.durationSec` |
| `distance` | `activities.distanceM` |
| `averageHR`, `maxHR` | `activities.avgHr`, `maxHr` |
| `avgPower`, `normPower` | `activities.avgPower`, `normalizedPower` |
| `elevationGain` | `activities.elevationM` |
| `calories` | `activities.calories` |
| sleep/HRV/RHR/weight | `metrics_daily` with `source: "garmin"` |

### 2.10 FIT analysis and brief for LLM

An LLM cannot read the binary `.FIT`. The pipeline is:

```text
ZIP/.FIT → fit-file-parser → messaggi → ActivityAnalysis → brief compatto → LLM
```

- Parser: `packages/integrations/src/fit/parser.ts` (`fit-file-parser` + `fflate`).
- Analysis: summary, filtered lap/split, HR zones, HR drift, negative split, pace variability, best/worst split.
- Brief: `ActivityAnalysis.brief`, ~1–3 KB, without 1 Hz records.
- Storage: `activity_analyses` (unique `userId+source+externalId`).
- API:
  ```text
  POST /api/integrations/garmin/activities/:activityId/analyze
  GET  /api/integrations/garmin/activities/:activityId/analysis
  ```
- UI: **Analyze FIT** button on Garmin activities, with expandable brief.
- Details: [`FIT.md`](FIT.md).

Validated on a real activity: FIT ~1.3 MB, 17,492 records, 44 laps, 42 useful splits, brief ~2 KB.

---

## 3. Garmin workout export (`.FIT`)

### 3.1 Why `.FIT`

The Personal API is read-only. The most reliable way to bring a planned workout to Garmin, without a partner program, is to generate a **workout** `.FIT` file and import it.

### 3.2 Generation
Use the official Garmin SDK: `@garmin/fitsdk` (Encoder). Required messages:

- `FILE_ID` with `type: "workout"`;
- `WORKOUT` with `sport`, `numValidSteps`, `wktName`;
- `WORKOUT_STEP` for each step: `messageIndex`, `durationType`, `durationValue`, `targetType`, `targetValue`, `intensity`, `notes`;
- optional `WORKOUT_SESSION` if required by the device.

Example step:

```ts
encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, {
  messageIndex: 0,
  wktStepName: "Warm up",
  durationType: "time",
  durationValue: 15 * 60 * 1000, // ms
  targetType: "heart_rate_zone",
  targetValue: 2,
  intensity: "warmup",
});
```

> Field names must be verified in the SDK Profile. The encoder ignores unknown fields: test the file on Garmin Connect before considering it valid.

### 3.3 Import

1. Garmin Connect web → **Training & Planning → Workouts → Import**.
2. Select the `.FIT`.
3. Open the workout and send it to the device.
4. Offline alternative: copy the `.FIT` to the device's `NewFiles` folder via USB.

### 3.4 Future automation

- **Garmin Training API** (Startup/Enterprise): push structured workouts, calendar, sync.
- **Do not** use simulated login/username-password as the main path: it violates the ToS, requires MFA, and breaks.

### 3.5 Supported sports

| Sport | Steps | Target |
|---|---|---|
| Running | warm-up, intervals, recoveries, cool-down | pace, HR, RPE |
| Cycling | interval, sweet spot, endurance | power, HR |
| Swimming | sets, recoveries | distance, pace/100m, HR |
| Gym | do not export to Garmin; use Hevy | — |

---

## 4. Yazio (unofficial API v22)

### 4.1 What it is

Community documentation for reverse-engineered APIs: <https://github.com/saganos/yazio_public_api>. No official API.

### 4.2 Authentication

```http
POST https://yzapi.yazio.com/v22/oauth/token
Content-Type: application/json

{
  "grant_type": "password",
  "client_id": "<client_id>",
  "client_secret": "<client_secret>",
  "username": "<email>",
  "password": "<password>"
}
```

- Token `expires_in` ≈ 172800 s (48h).
- `refresh_token` to renew.
- **User-Agent gate:** the API returns `403 {"error":"version_blocked"}` if the client does not send a recognized app version. Default: `YAZIO/26.30.1 (...) Ktor`; configurable with `YAZIO_USER_AGENT`.
- The `client_id`/`client_secret` are those of the mobile app (public, not per-user); configurable via env.
- The client uses **v22** and, if the token endpoint is not available, **v20**.
- **Google/social login:** the API does not expose a Google grant. You need either a password set on the account, or an **imported refresh token** (`{ "refreshToken": "..." }`) captured from the official app.
- Credentials in development: `secrets/yazio.json` or env. In production only env/secret manager.

### 4.3 Useful endpoints

| Data | Endpoint |
|---|---|
| Profile | `GET /v22/user` |
| Daily nutrients (range) | `GET /v22/user/consumed-items/nutrients-daily?start=YYYY-MM-DD&end=YYYY-MM-DD` |
| Daily diary | `GET /v22/user/consumed-items?date=YYYY-MM-DD` |
| Daily summary | `GET /v22/user/widgets/daily-summary?date=YYYY-MM-DD` |
| Latest weight | `GET /v22/user/bodyvalues/weight/last?date=YYYY-MM-DD` |
| Goals | `GET /v22/user/goals/unmodified?date=YYYY-MM-DD` |
| Logged exercises | `GET /v22/user/exercises?date=YYYY-MM-DD` |
| Water | `GET /v22/user/water-intake?date=YYYY-MM-DD` |
| Settings | `GET /v22/user/settings` |

> `nutrients-daily` is the preferred source for macros: it returns exact daily totals. The summary remains useful for goals, water, steps, and weight.

> Swagger does not expose a complete weight history, only the latest value. For the trend: daily polling and local storage.

### 4.4 Current implementation

- `packages/integrations/src/yazio/client.ts`: v22, JSON token, User-Agent gate, password login, imported refresh token, 401 retry, v20 fallback, typed errors, timeout.
- `packages/integrations/src/yazio/mapper.ts`: `nutrients-daily`, summary extras (goals/water/steps/weight), fallback to meals, weight.
- Sync: `POST /api/integrations/yazio/sync?days=7`; overview: `GET /api/integrations/yazio/overview?days=7`; check: `POST /api/integrations/yazio/check`.
- Persistence: `nutrition_daily` and `metrics_daily` (source `yazio`), audit in `sync_runs` / `sync_state`.
- UI: “Yazio Nutrition” card with verification, sync, and kcal/macro/water/weight table.
- Contract and mapper tests with synthetic fixtures (25 integration tests total).
- **Verified with a real account (October 26, 2026):** password login on v22, `nutrients-daily`, summary, goals, weight; 7 days synchronized without errors; no blocking 2FA.

### 4.5 Sync

- 1–2 times a day, after main meals.
- `date` in the user's time zone.
- Store `nutrition_daily` with `source: "yazio"` and `confidence: "high"` (user-entered data).
- Weight: `metrics_daily` with `source: "yazio"`.
- Currently, sync is manual (endpoint/UI); the automatic scheduler is the next step.

### 4.6 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unofficial API / ToS | personal use; feature flag; documentation; no multi-user without assessment |
| Google login without password | refresh token imported from the official app; or a password set |
| Blocked User-Agent (`version_blocked`) | update `YAZIO_USER_AGENT` to a current app version |
| 2FA / blocked login | clear message; manual fallback |
| Expired/revoked token | automatic refresh; if it fails, re-import the refresh token |
| Rate limit | backoff; 1–2 syncs/day |
| Endpoint failure | isolated adapter; contract tests; manual fallback |
| Credentials/tokens | AES-GCM encryption; never log; least access; `secrets/` ignored |

---

## 5. Zepp / Huami (weight)

### 5.1 Endpoint

```
GET https://{host}/users/{userId}/members/-1/weightRecords
Header: apptoken: <app_token>
```

- Regional `host` (e.g. `api-mifit-us3.zepp.com`).
- `app_token`, `user_id`, and host are obtained from an HTTPS capture of the Zepp app (proxy).
- Token TTL ≈ 30 days.
- The payload contains weight records and, if the scale supports it, body composition.

### 5.2 Sync

- Once a day.
- `source: "zepp"`.
- If the token expires: `reauth_required` status and instructions to redo the capture.
- It is **not** a critical dependency: if missing, weight comes from Garmin/Yazio/manual.

### 5.3 Android alternative

- Zepp app → **Health Connect** → our app.
- Cleaner, no unofficial tokens.
- Verify that Zepp writes weight to Health Connect (depends on version/app).

### 5.4 Risks

- Unofficial API, region-specific, fragile token.
- Proxy capture requires a computer and installed CA.
- ToS.
- For a multi-user product: **do not use**. Manual or Health Connect only.

---

## 6. Hevy

### 6.1 What it is

Public API (beta) for **Hevy Pro** users. API key from `https://hevy.com/settings?developer`.

```http
GET https://api.hevyapp.com/v1/routines
Header: api-key: <UUID>
```

### 6.2 Endpoints

| Method | Endpoint | Use |
|---|---|---|
| GET | `/v1/routines` | routine list |
| POST | `/v1/routines` | create routine |
| GET | `/v1/routines/{routineId}` | details |
| PUT | `/v1/routines/{routineId}` | update |
| GET | `/v1/exercise_templates` | exercise catalog |
| POST | `/v1/exercise_templates` | create custom exercise |
| GET | `/v1/exercise_templates/{id}` | details |
| GET | `/v1/workouts` | workout list (page max 10) |
| POST | `/v1/workouts` | create completed workout |
| GET | `/v1/workouts/{id}` | details |
| GET | `/v1/workouts/events` | incremental events |
| GET | `/v1/body_measurements` | body measurements |
| POST | `/v1/body_measurements` | add measurement |
| GET | `/v1/exercise_history/{templateId}` | exercise history |
| GET | `/v1/user/info` | profile |

### 6.3 Routine export

Payload (verified schema):

```json
{
  "routine": {
    "title": "Full Body A — Settimana 1",
    "folder_id": null,
    "notes": "RPE 7, recupero 90s",
    "exercises": [
      {
        "exercise_template_id": "D04AC939",
        "superset_id": null,
        "rest_seconds": 90,
        "notes": "Controlla la discesa",
        "sets": [
          { "type": "warmup", "reps": 10, "weight_kg": 20 },
          { "type": "normal", "reps": 8, "weight_kg": 40 },
          { "type": "normal", "reps": 8, "weight_kg": 40 }
        ]
      }
    ]
  }
}
```

Supported set fields: `type` (`warmup|normal|failure|dropset`), `weight_kg`, `reps`, `distance_meters`, `duration_seconds`, `custom_metric`, `rep_range {start,end}`.

### 6.4 Exercise mapping

1. Download `GET /v1/exercise_templates` (7-day cache).
2. Normalize names (lowercase, without equipment in parentheses).
3. Exact match → fuzzy (Levenshtein/Jaro-Winkler) → manual.
4. If missing: `POST /v1/exercise_templates` with name, muscle, equipment.
5. Save in `hevy_mappings` to avoid recomputation.

### 6.5 Import completed workouts

- `GET /v1/workouts?page=1&pageSize=10` (max 10).
- Incremental with `GET /v1/workouts/events` if available.
- Map:
  - `title`, `start_time`, `end_time` → `session_logs`;
  - exercises/sets → `strength_sets` (exercise, reps, weight, RPE);
  - link to the planned session by date and type.
- If the workout was created outside the plan: `session_logs` with `plannedSessionId: null`.

### 6.6 Rate limit and stability

- Do not call at `xx:00`; use random minutes.
- Template cache.
- Backoff on 429/5xx.
- The API is beta: it does not guarantee stability. Provide CSV export/fallback and document the Pro requirement.

---

## 7. Android Health Connect

### 7.1 What to read

| Type | Permission | Use |
|---|---|---|
| Steps | `READ_STEPS` | daily activity |
| Sleep | `READ_SLEEP` | readiness |
| Heart rate | `READ_HEART_RATE` | activity/recovery |
| Weight | `READ_WEIGHT` | trend |
| Exercise | `READ_EXERCISE` | sessions |
| Nutrition | `READ_NUTRITION` | macros (if available) |
| Distance | `READ_DISTANCE` | running/cycling |
| Calories | `READ_TOTAL_CALORIES_BURNED` | balance |

### 7.2 Sync

- When the app opens + periodic background (WorkManager / Expo background task).
- Delta via `lastModifiedTime` or `metadata.clientRecordId`.
- Dedupe with Garmin/Yazio/manual.
- If permission is revoked: `permission_missing` status, no crash.

### 7.3 Play Store

- "Health data" declaration in Play Console.
- Public privacy policy.
- Minimum permissions.
- No undeclared sharing with third parties.

### 7.4 Expo

- `react-native-health-connect` (or native module).
- Config plugin for permissions and `HealthConnect` activity.
- If background sync is unreliable: native module or Kotlin for the health layer only.

---

## 8. Google Drive backup

### 8.1 Scope

- `https://www.googleapis.com/auth/drive.file` → access only to files created by the app.
- Folder `HealthTrainer/Backups` (or `appDataFolder` if it should be invisible).
- The user can view/delete backups from Drive.

### 8.2 Format

```
health-trainer-backup-v1.zip
  manifest.json
  data/*.json
  assets/photos/*
  assets/fit/*
```

`manifest.json`:

```json
{
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "createdAt": "2026-10-26T10:00:00Z",
  "device": "android",
  "counts": { "plans": 2, "sessions": 48, "checkins": 30 },
  "checksum": "sha256:…"
}
```

### 8.3 Encryption

- User passphrase → Argon2id → AES-256-GCM key.
- Alternative: `age` with public key.
- The file on Drive is encrypted; the internal manifest remains readable only after decryption.
- Restore test with wrong passphrase.

### 8.4 Restore

1. Download ZIP.
2. Decrypt.
3. Validate manifest and checksum.
4. Migrate schema if necessary.
5. Import in a transaction.
6. Rebuild indexes and cache.

---

## 9. LLM

### 9.1 Provider

| Provider | Status | Notes |
|---|---|---|
| **DeepSeek (native)** | **wired** | base `https://api.deepseek.com`, OpenAI format, JSON output |
| OpenAI | planned | structured outputs |
| Anthropic | planned | tool use/JSON |
| Google | planned | Gemini |
| OpenRouter | planned | multi-model |
| Ollama | planned | privacy, no costs |

Today only DeepSeek has a client: `LLM_PROVIDER` with a different value stays on the
deterministic provider instead of failing at runtime.

### 9.1.1 DeepSeek

Verified against the official documentation on October 27, 2026.

| Item | Value |
|---|---|
| Base URL (OpenAI format) | `https://api.deepseek.com` |
| Reasoning model | `deepseek-v4-pro` (`LLM_MODEL`) |
| Fast model | `deepseek-flash` (`LLM_MODEL_FAST`) |
| Context | 1M tokens; maximum output 384K |
| JSON output | `response_format: { type: "json_object" }` |
| Thinking mode | `thinking: { type: "enabled" \| "disabled" }`, default enabled |

Usage in the project:

| Purpose | Model | Thinking | Why |
|---|---|---|---|
| `coach`, simple context | `deepseek-flash` | no | short, frequent task: latency matters |
| `coach`, sensitive context | `deepseek-flash` | yes (auto) | pain, low readiness, post-race window, rising load |
| `planning` (macro, micro, critique) | `deepseek-v4-pro` | always | reasoning about the method and the envelope |

`LLM_THINKING=auto` (default) implements the third row; `on`/`off` force the
behavior. Thinking is not a generic quality switch: it turns on when there is
something to judge.

**Real measurements** (October 27, 2026, full coach prompt):

| Configuration | Latency | Tokens in / out |
|---|---|---|
| flash, no thinking | 2,3–2,8 s | 433 / ~200 |
| flash, thinking | 3,6 s | 101 / 496 (303 reasoning) |
| v4-pro, thinking | 6,2 s | 509 / 387 |

For a card requested with one click, 2-3 s are acceptable, 6 s is not: this is why
the coach stays on flash and thinking turns on only in sensitive cases.

JSON mode constraints, both handled by the client:

1. the word "json" must appear in the prompt (the provider adds it if missing);
2. an example of the expected format must be shown (done in the coach prompts);
3. `max_tokens` must be sized, otherwise the JSON is truncated.

In thinking mode `temperature` is ignored by the API: the provider **does not
send it**, to avoid giving the illusion of controlling variability.

Two real defects encountered during the first calls, both handled:

1. **Empty `content`** in JSON mode: documented and intermittent behavior.
   The provider retries once (300 ms wait) before returning a retryable error
   that reports `finish_reason`.
2. **JSON wrapped in a markdown block** despite `response_format`.
   `extractJson()` recovers the object (```` ```json ```` block, introductory
   text, or pure JSON).

Errors mapped to `LlmProviderError` with a `retryable` flag, which the future
Proposer/Critic loop will use to decide whether to retry or switch to fallback:

| HTTP | Meaning | `retryable` |
|---|---|---|
| 401 / 403 | invalid key | no |
| 402 | credit exhausted | no |
| 429 | rate limit | yes |
| 5xx | provider-side failure | yes |
| empty response / invalid JSON / out of schema | transient failure | yes |

The key never appears in error messages or logs; failures are recorded in
`ai_runs` with `success: false` and the message truncated to 500 characters.

Manual check, without printing the key:

```bash
npm run spike:deepseek          # solo flash, pochi token
npm run spike:deepseek -- --all # flash + v4-pro con thinking
```

### 9.2 Rules

- Keys encrypted; never in the client (except local/BYOK mode on device, with Keystore).
- No training on data; use no-training endpoints/contracts.
- Strict JSON schema; validator on our side.
- Timeout, retry, fallback.
- Logs: model, prompt version, tokens, cost, context hash; **not** the full health content.
- Managed free: quota and cheap model; no arbitrary free tiers.

### 9.3 Minimum context

- Compacted base (`athlete_brief`).
- Aggregated trend.
- Last 3–7 days.
- Calculated constraints.
- Output schema.

Do not send photos or full clinical texts without explicit consent.

---

## 10. Canonical mapping

| Source | Entity | Destination |
|---|---|---|
| Garmin | activity | `activities` |
| Garmin | sleep, HRV, RHR, steps, stress, Body Battery | `metrics_daily` |
| Garmin | weight/measurements | `metrics_daily` |
| Yazio | summary/diary | `nutrition_daily` |
| Yazio | weight | `metrics_daily` |
| Zepp | weight/composition | `metrics_daily` |
| Hevy | completed workout | `session_logs` + `strength_sets` |
| Hevy | routine | `sessions` (export) |
| Health Connect | all | `metrics_daily` / `activities` |
| Manual | all | same entity, `source: "manual"` |

### 10.1 `strength_sets` model

```json
{
  "userId": "u_123",
  "sessionLogId": "sl_1",
  "exerciseKey": "bench_press_barbell",
  "hevyTemplateId": "D04AC939",
  "setIndex": 0,
  "type": "normal",
  "reps": 8,
  "weightKg": 40,
  "rpe": 7,
  "notes": null
}
```

Used for: Hevy export, volume comparison, progression, reports.

---

## 11. Sync, retry, idempotency

### 11.1 Rules

- Each sync has a `sync_run` with `startedAt`, `finishedAt`, `status`, `stats`, `error`.
- Upsert by natural key.
- Do not delete data if the provider returns less data than expected: it could be a temporary error.
- Exponential backoff with jitter on 429/5xx.
- Dead letter for jobs that fail after N attempts.
- UI warning if a provider has been disconnected for > 3 days.

### 11.2 Indicative scheduler

| Job | Frequency | Notes |
|---|---|---|
| Garmin activities | 30–60 min | only if connected |
| Garmin health | 2×/day | morning/evening |
| Yazio | 1–2×/day | after meals |
| Zepp weight | 1×/day | optional |
| Hevy workout | 1×/day | incremental |
| daily_state computation | 1×/day + events | by timezone |
| Weekly review | Sunday 18:00 | local |
| Backup | daily/weekly | Android/Drive |
| Token/raw cleanup | daily | retention |

### 11.3 Timezone

- Request dates to providers are local.
- Timestamps are UTC.
- An activity at 23:30 local time must not end up in the following day.

---

## 12. Security and ToS

| Provider | Official? | Risk | Strategy |
|---|---|---|---|
| Garmin Personal | yes | personal use, key expiration, read-only | ok for personal use; Startup for multi-user |
| Garmin Training | yes | requires program | next phase |
| Yazio | **no** | ToS, 2FA, breakages | feature flag, personal use, fallback |
| Zepp | **no** | ToS, fragile token | optional, HC on Android |
| Hevy | yes (beta) | Pro, instability | CSV fallback, cache |
| Health Connect | yes | permissions, Play policy | declaration, minimum necessary |
| Google Drive | yes | scope, revocation | `drive.file`, encryption |
| Strava | yes | **AI prohibited** | do not use |

### 12.1 Credentials

- AES-256-GCM with master key in env/secret manager.
- On Android: Android Keystore.
- Never return to the client; show only `last4`/status.
- Immediate revocation.
- Audit log for accesses.

---

## 13. Fixtures and contract tests

For each provider, save in `packages/integrations/fixtures/<provider>/`:

- login/token response (redacted);
- activity list;
- sleep/HRV;
- weight;
- Hevy workout;
- 401/429 error.

Tests must run **without network** and verify:

- canonical mapping;
- error handling;
- idempotency;
- timezone;
- units.

---

## 14. Open questions to close in Phase 0

1. Garmin Personal: effective rate limit and maximum response size.
2. Garmin `.FIT` workout: is the file generated with `@garmin/fitsdk` imported without errors? On which devices?
3. Yazio: does the account have 2FA? Does the refresh token really last 48h? Are there rate limits?
4. Zepp: does weight include body composition? Which region/host?
5. Hevy: does creating routines with custom templates work? Are there routine limits (403)?
6. Health Connect: do Zepp/Garmin write weight? With what latency?
7. Google Drive: is `drive.file` enough for a visible folder? Is full `drive` needed?
