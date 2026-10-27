# Integrazioni — specifiche operative

**Versione:** 1.7  
**Data:** 26 ottobre 2026  
**Riferimenti:** [`PIANO.md`](PIANO.md) · [`FASI.md`](FASI.md) · [`../AGENT.md`](../AGENT.md)

> Le API non ufficiali (Yazio, Zepp) possono cambiare o violare i ToS. In questo progetto sono usate in **modalità personale**, isolate dietro un adapter e con fallback manuale. Non diventano dipendenze critiche.

## 0. Stato implementazione (26 ottobre 2026)

| Provider | Stato | Dove |
|---|---|---|
| Garmin Personal | **client + mapper + sync persistente + UI + FIT analysis/brief**: 3 attività e 7 giorni di metriche in Mongo; FIT reale parsato (17.492 record, 44 lap, 42 split); test con 6 attività, sonno, HRV, passi, stress, Body Battery, RHR, SpO₂, `.FIT` 529 KB; peso 0 record | `packages/integrations/src/garmin/`, `packages/integrations/src/fit/`, `apps/api/src/integrations/garmin-sync.service.ts`, `docs/FIT.md` |
| Garmin `.FIT` export | non iniziato | — |
| Yazio | **client v22 + mapper + sync persistente + UI**; **test reale OK**: 7 giorni di macro e peso, 0 errori, sync idempotente | `packages/integrations/src/yazio/`, `apps/api/src/integrations/yazio-sync.service.ts`, `docs/spikes/yazio.md` |
| Zepp | non iniziato | — |
| Hevy | non iniziato | — |
| Health Connect | non iniziato (fase 3) | — |
| Google Drive backup | non iniziato | — |

Comandi utili:

```bash
npm run spike:garmin              # stampa un report redatto
npm run spike:garmin -- --write   # salva docs/spikes/garmin.local.json (ignorato da git)
npm run test -w @health-trainer/integrations
```

---

## 1. Contratto comune degli adapter

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

Regole:

- **Idempotenza:** ogni item ha `(source, externalId)`.
- **Provenance:** `source`, `fetchedAt`, `confidence`.
- **Nessun adapter scrive direttamente nel DB:** restituisce dati canonici; il service li persiste.
- **Nessun adapter logga token o payload sanitari.**
- **Errori tipizzati:** `AuthExpired`, `RateLimited`, `ProviderUnavailable`, `InvalidResponse`, `TermsBlocked`.
- **Fixture:** ogni adapter ha risposte registrate per i test di contratto.

---

## 2. Garmin Personal API

### 2.1 Cosa è

API **personale, read-only, pull**, pensata per applicazioni personali. Non è per applicazioni commerciali multi-utente.

### 2.2 Autenticazione

1. Creare la chiave su `https://connect.garmin.com/app/settings/personalApiToken`.
2. Scegliere scadenza: 30 / 90 / 180 / 365 giorni.
3. La chiave è mostrata **una sola volta**.
4. Scambiarla con un token:

```http
POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token
Authorization: ApiKey <PERSONAL_API_KEY>
```

Risposta: JWT `access_token` con `exp` (24 ore). **Nessun refresh token**: si ripete lo scambio con la chiave.

### 2.3 Endpoint utili

| Dato | Endpoint |
|---|---|
| Attività (lista) | `GET /activitylist-service/activities/search/activities?start=0&limit=20&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` |
| Dettaglio attività | `GET /activity-service/activity/{activityId}` |
| Download `.FIT` | `GET /download-service/files/activity/{activityId}` (ZIP) |
| Sonno | `GET /sleep-service/sleep/dailySleep?date=YYYY-MM-DD` |
| Sonno (range) | `GET /sleep-service/sleep/dailySleepSummariesByDate?startDate=…&endDate=…` |
| HRV | `GET /hrv-service/hrv/{date}` |
| HRV (range) | `GET /hrv-service/hrv/daily/{start}/{end}` |
| RHR / summary | `GET /usersummary-service/v2/dailysummaries?startDate=…&endDate=…` |
| Passi | `GET /usersummary-service/stats/steps/daily/{start}/{end}` |
| Stress | `GET /usersummary-service/stats/stress/daily/{start}/{end}` |
| Body Battery | `GET /wellness-service/wellness/bodyBattery/reports/daily?startDate=…&endDate=…` |
| Peso/misure | `GET /weight-service/weight/range/{start}/{end}?includeAll=true` |
| Food log | `GET /nutrition-service/food/logs/{date}` |
| Profilo | `GET /userprofile-service/userprofile/settings` |

> I path sono quelli usati dal client ufficiale `garmin/connect-personal-api-python`. Verificare sempre nella Swagger docs e con risposte reali.

### 2.4 Implementazione attuale

- `packages/integrations/src/garmin/personal-client.ts`: token exchange, cache con scadenza, retry singolo su 401, errori tipizzati (`AuthExpiredError`, `RateLimitedError`), timeout.
- In sviluppo l'API legge la chiave da `GARMIN_PERSONAL_API_KEY` oppure da `secrets/garmin-key.txt` (ignorato da git). In produzione solo env/secret manager.
- Wrapper: `getProfileSettings`, `searchActivities`, `getActivity`, `downloadActivity`, `getDailySleep`, `getHrv`, `getDailySummaries`, `getWeightMeasurements`, `getSteps`, `getStress`, `healthCheck`.
- Test: `personal-client.spec.ts` con fetch mockato (token raw/JSON, cache, 401, 429, download, health check).
- Spike: `scripts/spike-garmin.ts`, output redatto; non salva token né valori clinici.

**Verificato con chiave reale (26 ottobre 2026):**

- Il token endpoint restituisce **406** se si invia `Accept: application/json`; senza `Accept` restituisce **200** con un **JWT in testo**, non JSON. Il client gestisce entrambi.
- Il download attività restituisce **406** con `Accept: application/octet-stream`; senza `Accept` restituisce uno ZIP valido (529 KB nel test).
- 6 attività in 14 giorni; sonno, HRV, passi, stress, daily summary, Body Battery, RHR, SpO₂, zone HR presenti; peso 0 record (nessuna bilancia Garmin); idratazione/fitness age raggiungibili ma senza dati.
- Nessun rate limit osservato in un singolo run.
- **Sync persistente verificato:** 3 attività e 7 giorni di metriche in `activities` / `metrics_daily`; secondo sync idempotente (stessi conteggi).

**Non ancora verificato:** rate limit su 24–48h di polling, comportamento con attività manuali/indoor, salvataggio del `.FIT` originale.

### 2.5 Persistenza e sync

Collezioni:

| Collezione | Contenuto | Chiave |
|---|---|---|
| `activities` | attività canoniche | `(userId, source, externalId)` unico |
| `metrics_daily` | metriche giornaliere canoniche | `(userId, date, source)` unico |
| `sync_runs` | audit di ogni sync | `runId`, stato, stats, errori |
| `sync_state` | ultimo sync per provider | `(userId, provider)` unico |

Endpoint:

```text
POST /api/integrations/garmin/sync?days=7
GET  /api/integrations/garmin/overview?days=7
```

Flusso:

1. `searchActivities` + `getDailySummaries` + `getBodyBattery` + `getWeightMeasurements`.
2. Per ogni giorno: `getDailySleep`, `getHrv`, `getDailyHeartRate`, `getSpo2` (concorrenza 3, errori per giorno non bloccanti).
3. `mapGarminActivities` / `buildGarminDailyMetrics`.
4. Upsert idempotente in Mongo.
5. `sync_runs` + `sync_state`; l'overview legge da Mongo e non chiama Garmin.

UI: pulsante “Sincronizza ora”, ultimo sync, 3 attività recenti, tabella metriche a 7 giorni.

### 2.6 Sync scheduling (da fare)

- **Attività:** ogni 30–60 minuti (o all'apertura dell'app).
- **Salute:** 1–2 volte al giorno (sonno/HRV/RHR al mattino).
- **Peso:** 1 volta al giorno.
- **Backfill:** all'onboarding, ultimi 30–90 giorni (attività e peso). Personal API consente range; rispettare rate limit.
- **Cursore:** `lastActivityStartDate` e `lastHealthDate`.
- **Dedupe:** `externalId = activityId`; conservare `source: "garmin"`.
- **Token cache:** salvarlo cifrato con `expiresAt`; rinnovare 1 ora prima.
- **Chiave in scadenza:** reminder a 7 giorni; stato `expiring` in UI.

> Oggi il sync è manuale (endpoint/UI); lo scheduler automatico è il passo successivo.

- **Attività:** ogni 30–60 minuti (o all'apertura dell'app).
- **Salute:** 1–2 volte al giorno (sonno/HRV/RHR al mattino).
- **Peso:** 1 volta al giorno.
- **Backfill:** all'onboarding, ultimi 30–90 giorni (attività e peso). Personal API consente range; rispettare rate limit.
- **Cursore:** `lastActivityStartDate` e `lastHealthDate`.
- **Dedupe:** `externalId = activityId`; conservare `source: "garmin"`.
- **Token cache:** salvarlo cifrato con `expiresAt`; rinnovare 1 ora prima.
- **Chiave in scadenza:** reminder a 7 giorni; stato `expiring` in UI.

### 2.7 Errori

| Codice | Significato | Azione |
|---|---|---|
| 401 | token scaduto/revocato | nuovo token dalla chiave; se fallisce, chiave scaduta |
| 403 | chiave non valida o permesso | chiedere nuova chiave |
| 429 | rate limit | backoff esponenziale + jitter |
| 5xx | Garmin down | retry con backoff; non marcare la connessione come rotta |

### 2.8 Limiti

- **Nessun push di workout.**
- **Nessun webhook:** solo polling.
- **Chiave personale:** non usarla per più utenti. Per la fase test: Garmin Startup o chiavi personali separate (con UX chiara).
- **Scadenza:** la chiave va ruotata; il token dura 24h.

### 2.9 Mapping canonico

| Garmin | Canonico |
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
| sonno/HRV/RHR/peso | `metrics_daily` con `source: "garmin"` |

### 2.10 FIT analysis e brief per LLM

Un LLM non legge il `.FIT` binario. La pipeline è:

```text
ZIP/.FIT → fit-file-parser → messaggi → ActivityAnalysis → brief compatto → LLM
```

- Parser: `packages/integrations/src/fit/parser.ts` (`fit-file-parser` + `fflate`).
- Analisi: summary, lap/split filtrati, zone HR, deriva HR, negative split, variabilità passo, miglior/peggior split.
- Brief: `ActivityAnalysis.brief`, ~1–3 KB, senza record a 1 Hz.
- Storage: `activity_analyses` (unique `userId+source+externalId`).
- API:
  ```text
  POST /api/integrations/garmin/activities/:activityId/analyze
  GET  /api/integrations/garmin/activities/:activityId/analysis
  ```
- UI: pulsante **Analizza FIT** sulle attività Garmin, con brief espandibile.
- Dettagli: [`FIT.md`](FIT.md).

Validato su un’attività reale: FIT ~1,3 MB, 17.492 record, 44 lap, 42 split utili, brief ~2 KB.

---

## 3. Garmin workout export (`.FIT`)

### 3.1 Perché `.FIT`

La Personal API è read-only. Il modo più affidabile per portare un workout pianificato su Garmin, senza partner program, è generare un file `.FIT` di **workout** e importarlo.

### 3.2 Generazione

Usare il SDK ufficiale Garmin: `@garmin/fitsdk` (Encoder). Messaggi necessari:

- `FILE_ID` con `type: "workout"`;
- `WORKOUT` con `sport`, `numValidSteps`, `wktName`;
- `WORKOUT_STEP` per ogni step: `messageIndex`, `durationType`, `durationValue`, `targetType`, `targetValue`, `intensity`, `notes`;
- eventuale `WORKOUT_SESSION` se richiesto dal dispositivo.

Esempio di step:

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

> I nomi dei campi vanno verificati nel Profile del SDK. L'encoder ignora i campi sconosciuti: testare il file su Garmin Connect prima di considerarlo valido.

### 3.3 Import

1. Garmin Connect web → **Training & Planning → Workouts → Import**.
2. Selezionare il `.FIT`.
3. Aprire il workout e inviarlo al dispositivo.
4. Alternativa offline: copiare il `.FIT` nella cartella `NewFiles` del dispositivo via USB.

### 3.4 Automazione futura

- **Garmin Training API** (Startup/Enterprise): push di workout strutturati, calendario, sync.
- **Non** usare login simulato/username-password come percorso principale: viola i ToS, richiede MFA, si rompe.

### 3.5 Sport supportati

| Sport | Step | Target |
|---|---|---|
| Corsa | warm-up, ripetute, recuperi, cool-down | pace, HR, RPE |
| Bici | interval, sweet spot, endurance | power, HR |
| Nuoto | serie, recuperi | distanza, pace/100m, HR |
| Palestra | non esportare su Garmin; usare Hevy | — |

---

## 4. Yazio (API non ufficiale v22)

### 4.1 Cosa è

Documentazione community di API reverse-engineered: <https://github.com/saganos/yazio_public_api>. Nessuna API ufficiale.

### 4.2 Autenticazione

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
- `refresh_token` per rinnovare.
- **User-Agent gate:** l'API risponde `403 {"error":"version_blocked"}` se il client non invia una versione app riconosciuta. Default: `YAZIO/26.30.1 (...) Ktor`; configurabile con `YAZIO_USER_AGENT`.
- Le `client_id`/`client_secret` sono quelle dell'app mobile (pubbliche, non per-utente); configurabili via env.
- Il client usa **v22** e, se il token endpoint non è disponibile, **v20**.
- **Google/social login:** l'API non espone un grant Google. Servono o una password impostata sull'account, oppure un **refresh token importato** (`{ "refreshToken": "..." }`) catturato dall'app ufficiale.
- Credenziali in sviluppo: `secrets/yazio.json` oppure env. In produzione solo env/secret manager.

### 4.3 Endpoint utili

| Dato | Endpoint |
|---|---|
| Profilo | `GET /v22/user` |
| Nutrienti giornalieri (range) | `GET /v22/user/consumed-items/nutrients-daily?start=YYYY-MM-DD&end=YYYY-MM-DD` |
| Diario del giorno | `GET /v22/user/consumed-items?date=YYYY-MM-DD` |
| Summary giornaliero | `GET /v22/user/widgets/daily-summary?date=YYYY-MM-DD` |
| Ultimo peso | `GET /v22/user/bodyvalues/weight/last?date=YYYY-MM-DD` |
| Obiettivi | `GET /v22/user/goals/unmodified?date=YYYY-MM-DD` |
| Esercizi registrati | `GET /v22/user/exercises?date=YYYY-MM-DD` |
| Acqua | `GET /v22/user/water-intake?date=YYYY-MM-DD` |
| Impostazioni | `GET /v22/user/settings` |

> `nutrients-daily` è la fonte preferita per i macro: restituisce i totali esatti per giorno. Il summary resta utile per goals, acqua, passi e peso.

> Lo swagger non espone una storia peso completa, solo l'ultimo valore. Per il trend: polling giornaliero e storage locale.

### 4.4 Implementazione attuale

- `packages/integrations/src/yazio/client.ts`: v22, JSON token, User-Agent gate, login password, refresh token import, retry 401, fallback v20, errori tipizzati, timeout.
- `packages/integrations/src/yazio/mapper.ts`: `nutrients-daily`, summary extras (goals/acqua/passi/peso), fallback ai pasti, peso.
- Sync: `POST /api/integrations/yazio/sync?days=7`; overview: `GET /api/integrations/yazio/overview?days=7`; check: `POST /api/integrations/yazio/check`.
- Persistenza: `nutrition_daily` e `metrics_daily` (source `yazio`), audit in `sync_runs` / `sync_state`.
- UI: card “Nutrizione Yazio” con verifica, sync e tabella kcal/macro/acqua/peso.
- Test di contratto e mapper con fixture sintetiche (25 test integrations totali).
- **Verificato con account reale (26 ottobre 2026):** login password su v22, `nutrients-daily`, summary, goals, peso; 7 giorni sincronizzati senza errori; nessun 2FA bloccante.

### 4.5 Sync

- 1–2 volte al giorno, dopo i pasti principali.
- `date` nel fuso dell'utente.
- Salvare `nutrition_daily` con `source: "yazio"` e `confidence: "high"` (dati inseriti dall'utente).
- Peso: `metrics_daily` con `source: "yazio"`.
- Oggi il sync è manuale (endpoint/UI); lo scheduler automatico è il passo successivo.

### 4.6 Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| API non ufficiale / ToS | uso personale; feature flag; documentazione; no multi-utente senza valutazione |
| Login Google senza password | refresh token importato dall'app ufficiale; oppure password impostata |
| User-Agent bloccato (`version_blocked`) | aggiornare `YAZIO_USER_AGENT` a una versione app corrente |
| 2FA / login bloccato | messaggio chiaro; fallback manuale |
| Token scaduto/revocato | refresh automatico; se fallisce, re-import del refresh token |
| Rate limit | backoff; 1–2 sync/giorno |
| Rottura endpoint | adapter isolato; test di contratto; fallback manuale |
| Credenziali/token | cifratura AES-GCM; mai log; accesso minimo; `secrets/` ignorato |

---

## 5. Zepp / Huami (peso)

### 5.1 Endpoint

```
GET https://{host}/users/{userId}/members/-1/weightRecords
Header: apptoken: <app_token>
```

- `host` regionale (es. `api-mifit-us3.zepp.com`).
- `app_token`, `user_id` e host si ottengono da una cattura HTTPS dell'app Zepp (proxy).
- TTL token ≈ 30 giorni.
- Il payload contiene record di peso e, se la bilancia lo supporta, composizione corporea.

### 5.2 Sync

- 1 volta al giorno.
- `source: "zepp"`.
- Se il token scade: stato `reauth_required` e istruzioni per rifare la cattura.
- **Non** è una dipendenza critica: se manca, il peso arriva da Garmin/Yazio/manuale.

### 5.3 Alternativa Android

- Zepp app → **Health Connect** → nostra app.
- Più pulito, niente token non ufficiali.
- Verificare che Zepp scriva il peso in Health Connect (dipende da versione/app).

### 5.4 Rischi

- API non ufficiale, region-specific, token fragile.
- Cattura proxy richiede un computer e CA installata.
- ToS.
- Per un prodotto multi-utente: **non usare**. Solo manuale o Health Connect.

---

## 6. Hevy

### 6.1 Cosa è

API pubblica (beta) per utenti **Hevy Pro**. API key da `https://hevy.com/settings?developer`.

```http
GET https://api.hevyapp.com/v1/routines
Header: api-key: <UUID>
```

### 6.2 Endpoint

| Metodo | Endpoint | Uso |
|---|---|---|
| GET | `/v1/routines` | lista routine |
| POST | `/v1/routines` | crea routine |
| GET | `/v1/routines/{routineId}` | dettaglio |
| PUT | `/v1/routines/{routineId}` | aggiorna |
| GET | `/v1/exercise_templates` | catalogo esercizi |
| POST | `/v1/exercise_templates` | crea esercizio custom |
| GET | `/v1/exercise_templates/{id}` | dettaglio |
| GET | `/v1/workouts` | lista workout (pagina max 10) |
| POST | `/v1/workouts` | crea workout completato |
| GET | `/v1/workouts/{id}` | dettaglio |
| GET | `/v1/workouts/events` | eventi incrementali |
| GET | `/v1/body_measurements` | misurazioni corporee |
| POST | `/v1/body_measurements` | aggiungi misurazione |
| GET | `/v1/exercise_history/{templateId}` | storico esercizio |
| GET | `/v1/user/info` | profilo |

### 6.3 Export routine

Payload (schema verificato):

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

Campi set supportati: `type` (`warmup|normal|failure|dropset`), `weight_kg`, `reps`, `distance_meters`, `duration_seconds`, `custom_metric`, `rep_range {start,end}`.

### 6.4 Mapping esercizi

1. Scaricare `GET /v1/exercise_templates` (cache 7 giorni).
2. Normalizzare i nomi (lowercase, senza equipment tra parentesi).
3. Match esatto → fuzzy (Levenshtein/Jaro-Winkler) → manuale.
4. Se manca: `POST /v1/exercise_templates` con nome, muscolo, equipment.
5. Salvare in `hevy_mappings` per evitare ricalcoli.

### 6.5 Import workout completati

- `GET /v1/workouts?page=1&pageSize=10` (max 10).
- Incrementale con `GET /v1/workouts/events` se disponibile.
- Mappare:
  - `title`, `start_time`, `end_time` → `session_logs`;
  - esercizi/set → `strength_sets` (exercise, reps, weight, RPE);
  - collegare alla sessione pianificata per data e tipo.
- Se il workout è stato creato fuori piano: `session_logs` con `plannedSessionId: null`.

### 6.6 Rate limit e stabilità

- Non chiamare a `xx:00`; usare minuti casuali.
- Cache dei template.
- Backoff su 429/5xx.
- L'API è beta: non garantisce stabilità. Prevedere export CSV/fallback e documentare il requisito Pro.

---

## 7. Android Health Connect

### 7.1 Cosa leggere

| Tipo | Permesso | Uso |
|---|---|---|
| Passi | `READ_STEPS` | attività giornaliera |
| Sonno | `READ_SLEEP` | readiness |
| Frequenza cardiaca | `READ_HEART_RATE` | attività/recupero |
| Peso | `READ_WEIGHT` | trend |
| Esercizio | `READ_EXERCISE` | sessioni |
| Nutrizione | `READ_NUTRITION` | macro (se disponibile) |
| Distanza | `READ_DISTANCE` | corsa/bici |
| Calorie | `READ_TOTAL_CALORIES_BURNED` | bilancio |

### 7.2 Sync

- All'apertura dell'app + background periodico (WorkManager / Expo background task).
- Delta tramite `lastModifiedTime` o `metadata.clientRecordId`.
- Dedupe con Garmin/Yazio/manuale.
- Se il permesso viene revocato: stato `permission_missing`, nessun crash.

### 7.3 Play Store

- Dichiarazione "Health data" nella Play Console.
- Privacy policy pubblica.
- Permessi minimi.
- Nessuna condivisione con terzi non dichiarata.

### 7.4 Expo

- `react-native-health-connect` (o modulo nativo).
- Config plugin per permessi e `HealthConnect` activity.
- Se il background sync non è affidabile: modulo nativo o Kotlin per il solo layer health.

---

## 8. Backup su Google Drive

### 8.1 Scope

- `https://www.googleapis.com/auth/drive.file` → accesso solo ai file creati dall'app.
- Cartella `HealthTrainer/Backups` (o `appDataFolder` se si vuole invisibile).
- L'utente può vedere/cancellare i backup dal Drive.

### 8.2 Formato

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

### 8.3 Cifratura

- Passphrase utente → Argon2id → chiave AES-256-GCM.
- Alternativa: `age` con chiave pubblica.
- Il file su Drive è cifrato; il manifest interno resta leggibile solo dopo decrypt.
- Test di restore con passphrase errata.

### 8.4 Restore

1. Scarica ZIP.
2. Decifra.
3. Valida manifest e checksum.
4. Migra schema se necessario.
5. Importa in transazione.
6. Ricostruisci indici e cache.

---

## 9. LLM

### 9.1 Provider

| Provider | Stato | Note |
|---|---|---|
| **DeepSeek (nativo)** | **cablato** | base `https://api.deepseek.com`, formato OpenAI, JSON output |
| OpenAI | previsto | structured outputs |
| Anthropic | previsto | tool use/JSON |
| Google | previsto | Gemini |
| OpenRouter | previsto | multi-modello |
| Ollama | previsto | privacy, no costi |

Oggi solo DeepSeek ha un client: `LLM_PROVIDER` con un valore diverso resta sul
provider deterministico invece di fallire a runtime.

### 9.1.1 DeepSeek

Verificato sulla documentazione ufficiale il 27 ottobre 2026.

| Voce | Valore |
|---|---|
| Base URL (formato OpenAI) | `https://api.deepseek.com` |
| Modello ragionamento | `deepseek-v4-pro` (`LLM_MODEL`) |
| Modello veloce | `deepseek-flash` (`LLM_MODEL_FAST`) |
| Contesto | 1M token; output massimo 384K |
| JSON output | `response_format: { type: "json_object" }` |
| Thinking mode | `thinking: { type: "enabled" \| "disabled" }`, default enabled |

Uso nel progetto:

| Scopo | Modello | Thinking | Perché |
|---|---|---|---|
| `coach` (consiglio giornaliero) | `deepseek-flash` | no | task breve e frequente: conta la latenza |
| `planning` (macro, micro, critica) | `deepseek-v4-pro` | sì | ragionamento sul metodo e sull'envelope |

Vincoli della JSON mode, entrambi gestiti dal client:

1. la parola "json" deve comparire nel prompt (il provider la aggiunge se manca);
2. va mostrato un esempio del formato atteso (fatto nei prompt del coach);
3. `max_tokens` va dimensionato, altrimenti il JSON si tronca.

In thinking mode `temperature` viene ignorata dall'API: il provider **non la
invia**, per non dare l'illusione di controllare la variabilità. L'API può anche
restituire `content` vuoto in JSON mode: è trattato come guasto transitorio.

Errori mappati su `LlmProviderError` con flag `retryable`, che il futuro loop
Proposer/Critic userà per decidere se riprovare o passare al fallback:

| HTTP | Significato | `retryable` |
|---|---|---|
| 401 / 403 | chiave non valida | no |
| 402 | credito esaurito | no |
| 429 | rate limit | sì |
| 5xx | guasto lato provider | sì |
| risposta vuota / JSON invalido / fuori schema | guasto transitorio | sì |

La chiave non appare mai nei messaggi d'errore né nei log; i fallimenti vengono
registrati in `ai_runs` con `success: false` e il messaggio troncato a 500
caratteri.

Verifica manuale, senza stampare la chiave:

```bash
npm run spike:deepseek          # solo flash, pochi token
npm run spike:deepseek -- --all # flash + v4-pro con thinking
```

### 9.2 Regole

- Chiavi cifrate; mai nel client (tranne modalità locale/BYOK su device, con Keystore).
- Nessun training sui dati; usare endpoint/contratti no-training.
- JSON schema strict; validator lato nostro.
- Timeout, retry, fallback.
- Log: modello, versione prompt, token, costo, hash del contesto; **non** il contenuto sanitario completo.
- Managed free: quota e modello economico; niente free tier arbitrari.

### 9.3 Contesto minimo

- Base compattata (`athlete_brief`).
- Trend aggregato.
- Ultimi 3–7 giorni.
- Vincoli calcolati.
- Schema output.

Non inviare foto o testi clinici completi senza consenso esplicito.

---

## 10. Mapping canonico

| Fonte | Entità | Destinazione |
|---|---|---|
| Garmin | attività | `activities` |
| Garmin | sonno, HRV, RHR, passi, stress, Body Battery | `metrics_daily` |
| Garmin | peso/misure | `metrics_daily` |
| Yazio | summary/diary | `nutrition_daily` |
| Yazio | peso | `metrics_daily` |
| Zepp | peso/composizione | `metrics_daily` |
| Hevy | workout completato | `session_logs` + `strength_sets` |
| Hevy | routine | `sessions` (export) |
| Health Connect | tutti | `metrics_daily` / `activities` |
| Manuale | tutto | stessa entità, `source: "manual"` |

### 10.1 Modello `strength_sets`

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

Serve per: export Hevy, confronto volume, progressione, report.

---

## 11. Sync, retry, idempotenza

### 11.1 Regole

- Ogni sync ha un `sync_run` con `startedAt`, `finishedAt`, `status`, `stats`, `error`.
- Upsert per chiave naturale.
- Non cancellare dati se il provider restituisce meno dati del previsto: potrebbe essere un errore temporaneo.
- Backoff esponenziale con jitter su 429/5xx.
- Dead letter per job falliti dopo N tentativi.
- Avviso in UI se un provider è scollegato da > 3 giorni.

### 11.2 Scheduler indicativo

| Job | Frequenza | Note |
|---|---|---|
| Garmin attività | 30–60 min | solo se connesso |
| Garmin salute | 2×/giorno | mattina/sera |
| Yazio | 1–2×/giorno | dopo i pasti |
| Zepp peso | 1×/giorno | opzionale |
| Hevy workout | 1×/giorno | incrementale |
| Calcolo daily_state | 1×/giorno + eventi | per timezone |
| Review settimanale | domenica 18:00 | locale |
| Backup | giornaliero/settimanale | Android/Drive |
| Pulizia token/raw | giornaliero | retention |

### 11.3 Timezone

- Le date di richiesta ai provider sono locali.
- I timestamp sono UTC.
- Un'attività alle 23:30 locali non deve finire nel giorno successivo.

---

## 12. Sicurezza e ToS

| Provider | Ufficiale? | Rischio | Strategia |
|---|---|---|---|
| Garmin Personal | sì | uso personale, chiave scadenza, read-only | ok per personale; Startup per multi-utente |
| Garmin Training | sì | richiede programma | fase successiva |
| Yazio | **no** | ToS, 2FA, rotture | feature flag, uso personale, fallback |
| Zepp | **no** | ToS, token fragile | opzionale, HC su Android |
| Hevy | sì (beta) | Pro, instabilità | fallback CSV, cache |
| Health Connect | sì | permessi, Play policy | dichiarazione, minimo necessario |
| Google Drive | sì | scope, revoca | `drive.file`, cifratura |
| Strava | sì | **vietato AI** | non usare |

### 12.1 Credenziali

- AES-256-GCM con master key in env/secret manager.
- Su Android: Android Keystore.
- Mai restituire al client; mostrare solo `last4`/stato.
- Revoca immediata.
- Audit log per accessi.

---

## 13. Fixture e test di contratto

Per ogni provider salvare in `packages/integrations/fixtures/<provider>/`:

- risposta login/token (redatta);
- lista attività;
- sonno/HRV;
- peso;
- workout Hevy;
- errore 401/429.

I test devono girare **senza rete** e verificare:

- mapping canonico;
- gestione errori;
- idempotenza;
- timezone;
- unità.

---

## 14. Domande aperte da chiudere in Fase 0

1. Garmin Personal: rate limit effettivo e dimensione massima delle risposte.
2. Garmin `.FIT` workout: il file generato con `@garmin/fitsdk` viene importato senza errori? Su quali dispositivi?
3. Yazio: l'account ha 2FA? Il refresh token dura davvero 48h? Ci sono rate limit?
4. Zepp: il peso include composizione corporea? Che region/host?
5. Hevy: la creazione di routine con custom template funziona? Ci sono limiti di routine (403)?
6. Health Connect: Zepp/Garmin scrivono il peso? Con che latenza?
7. Google Drive: `drive.file` basta per una cartella visibile? Serve `drive` completo?
