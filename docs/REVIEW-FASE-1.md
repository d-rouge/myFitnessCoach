# Revisione Fase 1 — problemi e piano di fix

**Versione:** 1.3 (WS-0, Onda 1 e Onda 2 applicati)
**Data:** 27 ottobre 2026
**Scope:** codice della Fase 1 (`7dacb6e..b2c7b49`)
**Metodo:** revisione statica + verifica runtime su MongoDB temporaneo (`health_trainer_review`) e API sulla porta 3999
**Riferimenti:** [`FASI.md`](FASI.md) · [`PIANO.md`](PIANO.md) · [`../AGENT.md`](../AGENT.md)

---

## 1. Esito in sintesi

La Fase 1 è **implementata nelle feature ma non è rilasciabile**: il loop principale
(onboarding → piano → check-in → review → export) si rompe a causa di namespace utente
incompatibili e l'autenticazione è aperta per default.

| Severità | Conteggio | Significato |
|---|---|---|
| P0 — bloccante | 5 | Rompe il flusso o espone/corrompe dati |
| P1 — grave | 7 | Feature dichiarata ma non funzionante o fuorviante |
| P2 — medio | 7 | UX, timezone, incoerenze, debito |
| Doc | 1 | Documentazione che dichiara il falso |

**Stato che ha prodotto questa revisione:** `lint`, `typecheck`, `build` e `npm test`
(105 test) sono verdi. I difetti non sono coperti perché i service usano mock di Mongo
permissivi e non esiste un test end-to-end con database reale.

**Verdetto:** Fase 1 **non completata**. I criteri di accettazione in `FASI.md` erano
dichiarati tutti soddisfatti; la maggior parte non è stata verificata su dati reali.

> **Stato al 27 ottobre 2026:** WS-0, Onda 1 e Onda 2 hanno chiuso tutti i P0/P1 e i P2
> di safety/timezone/UI. Restano solo F1-18 e F1-19 (rinviati) e la validazione d'uso
> reale. Vedi §1.1–§1.3.

### 1.1 Aggiornamento WS-0 (27 ottobre 2026)

Le fondamenta sono state chiuse in **WS-0**: guard JWT globale, `@CurrentUser()`,
config sicura, validazione Zod e body limit FIT. Stato attuale:

| Area | Stato |
|---|---|
| Autenticazione (F1-01, F1-02) | ✅ chiusa |
| Validazione input (F1-05) | ✅ chiusa |
| Upload FIT (F1-04) | ✅ chiuso |
| Baseline/versioning (F1-03) | ✅ chiuso (WS-2) |
| Review e check-in (F1-06, F1-07, F1-15, F1-16) | ✅ chiusi (WS-3) |
| Export FIT e Hevy (F1-08, F1-09) | ✅ chiusi (WS-4) |
| Backup, restore e wipe (F1-10) | ✅ chiusi (WS-5) |
| `GET /api/review/latest` senza review (F1-14) | ✅ chiuso |
| `GET /api/baseline` senza baseline (F1-21) | ✅ chiuso (verifica runtime) |
| Health Garmin e overview metriche (F1-22, F1-23) | ✅ chiusi (verifica runtime) |
| Account locali email/password (F1-24) | ✅ implementato |
| Safety, generatore, timezone, UI (F1-11, F1-12, F1-13, F1-17) | ✅ chiusi (Onda 2) |
| AI coach, scheduler | ❌ aperti (F1-18, F1-19, rinviati) |

**Test:** 117 unitari verdi (`api` 32, `domain` 41, `integrations` 36, `ai` 3,
`config` 5), `lint`, `typecheck` e build API puliti. Il test e2e con Mongo reale
resta da fare (WS-9). Le verifiche runtime di WS-0 sono state eseguite su
`health_trainer_ws0` (poi eliminato) e sulla porta 3999.

Conteggio residuo: **1 P0**, **7 P1**, **6 P2**.

### 1.2 Aggiornamento Onda 1 (27 ottobre 2026)

Onda 1 ha chiuso cinque difetti P1 e i due P2 di review/check-in:

| Workstream | Fix | Evidenza runtime |
|---|---|---|
| WS-2 | F1-03 | 5 salvataggi → versioni 1–5, 1 sola baseline attiva, `GET /api/baseline` = v5, indice unique partial `uniq_active_baseline_per_user` presente |
| WS-3 | F1-06, F1-07, F1-15, F1-16 | settimana con sole `adjusted` → aderenza 0%; check-in con 20 min → sessione persistita a 20 min, RPE 5, blocchi e note; `progress` → 50/44/50 min; ultima settimana → `400 Il macrociclo è completo (settimana 4/4)...`; check-in di due settimane prima ignorato |
| WS-4 | F1-08, F1-09 | corsa → download `.FIT` con magic bytes; forza → 400 esplicito; Hevy senza chiave → 400, sport non-forza → 400 prima della chiave, sessione inesistente → 404 |
| WS-5 | F1-10 | backup `0.3.0` con `aiRuns`; restore con `userId` estraneo → 15 righe sull'utente autenticato; doppio restore → sempre 15; wipe → `/api/me` 401, `users` e `ai_runs` a 0; restore successivo recupera la baseline v5 |

**Test:** 130 unitari verdi (`api` 38, `domain` 42, `integrations` 40, `ai` 3,
`config` 5, `db` 2), `lint`, `typecheck` e build puliti.

Conteggio residuo: **0 P0**, **2 P1** (F1-11, F1-12), **4 P2**
(F1-13, F1-17, F1-18, F1-19) e il disallineamento documentale F1-20, in gran parte
risolto con questo aggiornamento. L'e2e con Mongo reale resta in WS-9.

### 1.3 Aggiornamento Onda 2 (27 ottobre 2026)

Onda 2 ha chiuso i due P1 rimasti, il P2 timezone e il P2 di UI auth/Hevy, e ha
introdotto l'e2e multi-utente su MongoDB reale:

| Workstream | Fix | Evidenza runtime |
|---|---|---|
| WS-6 | F1-11, F1-12 | baseline principiante → macro dal `2026-10-27` (stesso giorno) con sessioni 27/29/31 e sport `running`; obiettivo bici → tutte le sessioni `cycling`, nessuna corsa; disponibilità 20 min → tutti i blocchi esattamente 20 min; red flag → save 201 ma `POST /api/plan/macro/generate` → `400 ... bloccata per motivi di sicurezza`; PAR-Q `false` → `400 Idoneità medica richiesta...` |
| WS-7 | F1-13 | baseline con `Pacific/Kiritimati` alle 10:37 UTC → macro start `2026-10-28`, `/api/plan/today` → `today: 2026-10-28`, `/api/checkin/today` → `date: 2026-10-28` (UTC era ancora 27/10) |
| WS-8 | F1-17 | `/api/auth/status` espone `googleClientId`; login Google via Google Identity Services; logout esplicito non viene annullato dal dev auto-login; chiave Hevy inserita in UI, salvata in `localStorage` e inoltrata nell'header `api-key` (unit test con `fetch` mockato) |
| WS-9 | e2e | 9 verifiche verdi su `health_trainer_e2e`: 401 senza token, identità JWT distinte, baseline legate all'utente autenticato (userId del body ignorato), piani isolati, PATCH cross-utente 404, export FIT cross-utente 404 e proprio FIT con magic bytes, check-in isolati, backup isolati, piani assenti 404 |

**Test:** 151 unitari verdi (`api` 45, `domain` 56, `integrations` 40, `ai` 3,
`config` 5, `db` 2) + 9 verifiche e2e (`npm run test:e2e`), `lint`, `typecheck`,
`typecheck:scripts` e build API/web puliti.

Conteggio residuo: **0 P0**, **0 P1**, **2 P2** (F1-18 AI coach, F1-19 scheduler e
credenziali cifrate, entrambi rinviati con motivazione). F1-20 è chiuso da questo
aggiornamento documentale; **F1-21**, **F1-22** e **F1-23** sono stati trovati e chiusi
durante la verifica runtime del 27 ottobre 2026.

**Non verificato:** login Google con credenziali reali, export Hevy con chiave reale,
import `.FIT` su Garmin Connect, sync automatico, uso reale di 14 giorni.

#### F1-21 — `GET /api/baseline` risponde 200 con body vuoto

**Stato: ✅ chiuso durante la verifica runtime.** Senza baseline il controller
restituiva `null`, che Nest serializza come `200` senza body. La UI chiama
`response.json()` e andava in errore; con il refetch globale ogni 10 s il wizard
onboarding veniva smontato e rimontato. Ora il controller risponde `404` con messaggio
esplicito (la UI lo interpreta già come “nessuna baseline”). Aggiunti unit test del
controller e verifica e2e su baseline e piani assenti.

#### F1-22 — Health Garmin dice “missing” mentre sync e check funzionano

**Stato: ✅ chiuso durante la verifica runtime.** `/api/health` guardava solo
`env.GARMIN_PERSONAL_API_KEY`, mentre `GarminService` accetta anche
`secrets/garmin-key.txt`. Ora `HealthService` passa a `buildHealthReport` il valore
risolto da `GarminService.isConfigured()`; il report resta una funzione pura e testabile.
Verificato a runtime: `/api/health` → `garmin: configured` con chiave da file.

#### F1-23 — L’overview Garmin include le metriche Yazio e duplica le date

**Stato: ✅ chiuso durante la verifica runtime.** `GarminSyncService.overview` usava
`getRecentDailyMetrics` (tutte le fonti) invece di
`getRecentDailyMetricsBySource(..., GARMIN_PROVIDER)`, quindi per le stesse date
comparivano due righe e React segnalava chiavi duplicate. Corretto anche il conteggio
con `countDailyMetricsBySource`. Verificato: 7 metriche, 7 date uniche, `counts.metrics`
solo Garmin.

### 1.4 Account locali e isolamento integrazioni (27 ottobre 2026)

Aggiunta l'autenticazione locale per poter partire con un account reale senza dipendere
da Google, mantenendo Google come metodo alternativo:

| Area | Implementazione |
|---|---|
| Registrazione | `POST /api/auth/register` con email, password (min 8) e nome opzionale; email normalizzata, 409 su duplicato, account `usr_<uuid>` con ruolo `athlete` |
| Login | `POST /api/auth/login` (200) con verifica scrypt e timing-safe; 401 generico `Email o password non validi.` |
| Storage | Hash `scrypt$<salt>$<key>` in `auth_credentials` (indici unique su `userId` ed `email`); nessun materiale password nel documento pubblico `users` |
| Google | La prima login verificata e in allowlist crea l'account; con email già presente collega lo stesso `userId` invece di duplicarlo |
| UI | Login screen con tab Accedi / Crea account, gestione errori API in italiano, Google e dev login invariati |
| Integrazioni | Garmin/Yazio sync, analyze e overview usano l'`userId` del token; rimosso `PERSONAL_USER_ID` hardcoded |
| Wipe | `DELETE /api/export/me` elimina anche `auth_credentials` |

**Test:** 162 unitari verdi (`api` 56, `domain` 56, `integrations` 40, `ai` 3,
`config` 5, `db` 2) + 10 verifiche e2e, `lint`, `typecheck`, `typecheck:scripts` e build
API/web puliti. L'e2e verifica registrazione, login corretto, password errata (401),
email duplicata (409), assenza di materiale password nella risposta e baseline iniziale
404 per il nuovo account.

Conteggio residuo invariato: **0 P0**, **0 P1**, **2 P2** (F1-18 AI coach, F1-19
scheduler e credenziali cifrate). Restano non verificati il login Google reale (serve
client OAuth + allowlist) e l'export Hevy con chiave reale.

---

## 2. Come riprodurre

```bash
npm run build -w @health-trainer/api
API_PORT=3999 MONGODB_URI=mongodb://127.0.0.1:27017/health_trainer_review \
  node apps/api/dist/main.js
```

Verifiche minime:

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

Pulizia: terminare il processo API e cancellare il database `health_trainer_review`.

---

## 3. Registro problemi

### P0 — Bloccanti

#### F1-01 — Due namespace utente incompatibili

**Stato: ✅ chiuso in WS-0.** `AuthGuard` globale (`APP_GUARD` in `auth.module.ts`)
risolve l'utente solo dal bearer token e lo espone con `@CurrentUser()`; `x-user-id` è
ignorato da tutti i controller. Verificato a runtime: senza token → 401,
`x-user-id: personal` senza token → 401, `me` con token + header estraneo → `personal`.

- **Sintomo:** metà delle API scrive su `personal`, metà legge `user_marco`.
- **Evidenza:** `/api/me` → `personal`; baseline e piani salvati su `personal`;
  `POST /api/review/weekly` → `404`; `GET /api/export/backup` → collezioni vuote.
- **Causa:** `baseline`, `plan`, `checkin` usano `AuthService.getMe`; `review`, `activity`,
  `ai`, `export` usano l'header `x-user-id` con fallback `"user_marco"`
  (`review.controller.ts:4-6`, `activity.controller.ts:5-6`, `ai.controller.ts:4-5`,
  `export.controller.ts:33-34`). La UI non invia alcun header.
- **Rischio:** chiunque può leggere, modificare o cancellare i dati di un altro id
  semplicemente inviando `x-user-id`.
- **Fix:** guard JWT unico; decorator `@CurrentUser()`; rimuovere `x-user-id`;
  la UI invia `Authorization: Bearer`.
- **Test:** e2e con due utenti: ogni endpoint deve isolare i dati e rifiutare
  richieste senza token.

#### F1-02 — Autenticazione insicura per default

**Stato: ✅ chiuso in WS-0.** Rimosso il segreto hardcoded: `JWT_SECRET` è obbligatorio
(min 32 caratteri) fuori da `NODE_ENV=test` e il boot fallisce con
`Invalid environment configuration`. `ENABLE_DEV_ENDPOINTS` è `false` di default e il
dev login risponde 403 quando disabilitato. `auth/status` legge l'env reale. Il token
Google verifica `iss`, `aud`, `email_verified`, `exp` e la allowlist (obbligatoria se
`GOOGLE_CLIENT_ID` è impostata). `getMe` non esegue più auto-login e un utente
cancellato non viene più riautenticato dal fallback.

- **Sintomo:** login automatico, segreto hardcoded, Google token accettati senza verifica.
- **Causa:**
  - `JWT_SECRET` fallback a `"dev-jwt-secret-health-trainer-32chars!"`
    (`apps/api/src/auth/auth.service.ts`);
  - `ENABLE_DEV_ENDPOINTS` default `true` (`packages/config/src/env.ts:20`);
  - `getMe` senza header esegue `devLogin()` (`auth.service.ts:180-195`);
  - `/api/auth/status` restituisce sempre `devLoginEnabled: true` (`auth.controller.ts`);
  - verifica Google senza `iss`/`email_verified`, `aud` saltato se `GOOGLE_CLIENT_ID`
    non è impostato, allowlist vuota di default.
- **Fix:** `JWT_SECRET` obbligatorio fuori da `NODE_ENV=test`; dev endpoint opt-in
  esplicito; `auth/status` legge l'env; verifica completa del token Google; allowlist
  obbligatoria quando Google è configurato.
- **Test:** boot senza `JWT_SECRET` in produzione → errore; token Google contraffatto o
  senza `email_verified` → 401.

#### F1-03 — Il salvataggio baseline corrompe la cronologia

**Stato: ✅ chiuso in WS-2.** Gli `id` sono generati dal server con UUIDv7
(`packages/db/src/ids.ts`), `saveBaseline` supersede per `{ userId, supersededAt: null }`
e incrementa `version`; `getCurrentBaseline` ordina per `version`/`validFrom`. L'indice
unique partial `uniq_active_baseline_per_user` viene creato al boot, con deduplica dei
dati legacy. Verificato: 5 salvataggi → versioni 1–5, una sola attiva, `GET` = v5.

- **Sintomo:** più baseline attive contemporaneamente, versioni duplicate, `/api/baseline`
  restituisce una versione vecchia.
- **Evidenza:** 4 salvataggi → 4 record, 3 con `supersededAt: null`, due con `version: 3`,
  `GET /api/baseline` → `version: 2`.
- **Causa:** `saveBaseline` supersede per `_id` della baseline corrente
  (`packages/db/src/baselines.ts:15-40`), ma l'`id` arriva dal client e non è validato;
  manca un indice unique/partial su `{userId, supersededAt: null}`; `getCurrentBaseline`
  non ha ordinamento deterministico.
- **Fix:** id generato dal server; supersede per `{userId, supersededAt: null}`;
  indice unique partial; `getCurrentBaseline` ordina per `version`/`validFrom`.
- **Test:** test di integrazione con Mongo reale: 5 salvataggi → 1 sola baseline attiva,
  versioni monotone, `getCurrent` = ultima.

#### F1-04 — Upload FIT sempre in errore 413

**Stato: ✅ chiuso in WS-0.** `main.ts` disabilita il body parser di default e registra
`useBodyParser("json", { limit: "15mb" })`. L'endpoint valida firma `.FIT` ai byte 8–11 e
dimensione massima 10 MB prima del decode. Verificato: payload 200 KB non-FIT → 400 con
messaggio chiaro (non più 413), FIT valido → 201.

- **Sintomo:** qualsiasi FIT reale viene rifiutato.
- **Evidenza:** payload 200 KB → 266 KB base64 → `413 request entity too large`.
- **Causa:** `apps/api/src/main.ts` non configura il body parser (default Express 100 KB);
  l'endpoint accetta base64 in JSON (overhead ~33%).
- **Fix:** limite body ≥ 10 MB oppure upload multipart; validare estensione, dimensione e
  magic bytes FIT prima del decode.
- **Test:** upload di un FIT reale da 1 MB → 201; file > limite → 413 con messaggio chiaro.

#### F1-05 — Nessuna validazione degli input

**Stato: ✅ chiuso in WS-0.** `ZodValidationPipe` applicato esplicitamente a ogni
endpoint (piano, attività, check-in, AI, auth, export) con schemi dedicati. Il patch di
sessione viene rivalidato con `PlannedSessionSchema` dopo il merge. Verificato:
`totalWeeks:1` → 400 `MacroPlan validation failed`, `weekIndex:"abc"` → 400,
`status:"banana"` → 400, `durationMin:-5` → 400, check-in con data invalida → 400.

- **Sintomo:** input invalidi producono 500 o vengono persistiti.
- **Evidenza:** `totalWeeks: 1` → 500; `weekIndex: "abc"` → 500;
  `PATCH status: "banana"` → 200 e stato `banana` salvato.
- **Causa:** nessun `ValidationPipe` globale; i DTO sono interfacce TypeScript
  (cancellate a runtime); `updatePlannedSession` scrive lo stato grezzo senza rivalidare
  contro `PlannedSessionSchema`.
- **Fix:** `ValidationPipe` globale + DTO Zod (o class-validator); validare il patch con
  `PlannedSessionSchema.partial()`; errori 400 con dettaglio.
- **Test:** matrice di payload invalidi → sempre 400, mai 500, nessuna scrittura.

---

### P1 — Gravi

#### F1-06 — `adjusted` conta come completata e `progress` non viene applicato

**Stato: ✅ chiuso in WS-3.** `computeWeeklyReview` conta solo `status === "completed"`;
`applyReviewDecision` applica +10% di volume su `progress` e −30% con RPE −2 su `deload`
(mobilità/recupero esclusi). Verificato: settimana con sole `adjusted` → 0%;
`progress` → 50/44/50 min.

- **Sintomo:** una settimana con sole sessioni adattate risulta 100% completata e
  "pronta a progredire", ma il volume non cambia.
- **Evidenza:** 3 sessioni `adjusted` → `3/3`, `100%`, decisione `progress`.
- **Causa:** `weekly-review.ts:15-16` include `status === "adjusted"`;
  `advanceWeek` (`review.service.ts:80-107`) gestisce solo `deload` e ignora
  `progress`/`maintain`/`reduce`.
- **Fix:** `adjusted` non è completata; introdurre `adjustedCompleted` separato se serve;
  applicare davvero +10% (o la progressione scelta) al microciclo successivo.
- **Test:** review con soli `adjusted` → aderenza 0%; `progress` → volume settimana
  successiva maggiore del 10% (± arrotondamento).

#### F1-07 — L'adattamento del check-in viene scartato

**Stato: ✅ chiuso in WS-3.** `PlanService.applyAdjustment` rivalida la sessione adattata
e la sostituisce integralmente (`replacePlannedSession`): durata, RPE, blocchi e note
persistono. Verificato: check-in con 20 min disponibili → sessione a 20 min, RPE 5,
1 blocco, note `Adattamento automatico (swap): ...`.

- **Sintomo:** la UI mostra la sessione ridotta, ma il piano resta invariato.
- **Causa:** `checkin.service.ts:63-67` salva solo `status: "adjusted"` e le note;
  `DailyAdjustmentResult.adjustedSession` non viene persistito.
- **Fix:** persistere sessione adattata (durata, RPE, blocchi) e distinguerla da
  "completata"; la review deve leggere i dati reali.
- **Test:** check-in con dolore → la sessione salvata ha durata/RPE ridotti e la review
  non la conta come completata.

#### F1-08 — Export FIT errato per forza/mobilità e target persi

**Stato: ✅ chiuso in WS-4.** `workoutSportFor` mappa solo corsa/bici/nuoto e lancia un
errore esplicito per gli altri sport; il controller risponde 400. `parseTextTarget`
converte passo (`4:20-4:35/km` → speed), potenza (`W`), cadenza (`rpm`) e zone HR.
Verificato: corsa → `.FIT` con magic bytes; forza → 400 con messaggio dedicato.

- **Sintomo:** una scheda palestra viene esportata come corsa; i target di passo/HR
  spariscono.
- **Evidenza:** `strength → running`, `mobility → running`; tutti gli step generati
  hanno target `heartRateZone` o `open`.
- **Causa:** `workout-encoder.ts:260-261` mappa tutto ciò che non è bici/nuoto su running;
  `sessionToWorkoutDef` non interpreta i target testuali.
- **Fix:** rifiutare FIT per sport non supportati; mappare passo/HR/zone dai blocchi;
  messaggio esplicito per forza/mobilità (Hevy o export generico).
- **Test:** strength/mobility → 400; running con passo target → speed target corretto
  nel FIT decodificato.

#### F1-09 — Export Hevy finto

**Stato: ✅ chiuso in WS-4.** `exportHevyRoutine` restituisce `success: false` senza
chiave; il controller risolve prima sessione e sport (forza obbligatoria) e poi legge
`HEVY_API_KEY`/`body.apiKey`. Gli esercizi derivano dai blocchi con fallback full-body
dichiarato. Nessuna sessione inventata: sessione assente → 404. Verificato senza chiave
reale; l'export con chiave vera resta da provare.

- **Sintomo:** senza chiave restituisce `success: true`; la routine è sempre la stessa.
- **Causa:** `routine-builder.ts:139-147` (offline preview con successo),
  esercizi e pesi hardcoded, nessuna lettura di `session.blocks`, `HEVY_API_KEY` env
  ignorata (`export.controller.ts:117-146`), sessione `strength_generic` inventata.
- **Fix:** `success: false` senza chiave; usare `HEVY_API_KEY`; mappare blocchi/esercizi;
  non inventare sessioni; validare la risposta Hevy.
- **Test:** senza chiave → 4xx/`success:false`; con mock Hevy → payload con esercizi
  derivati dalla sessione.

#### F1-10 — Backup, restore e wipe non mantengono le promesse

**Stato: ✅ chiuso in WS-5.** Backup `0.3.0` con `aiRuns`; `restoreUserData(db, backup,
userId)` ignora il `userId` del body, valida le chiavi prima di cancellare e sostituisce
le collezioni (idempotente). Il wipe elimina anche `users` e `ai_runs`. Verificato:
`userId` estraneo ignorato (0 righe), doppio restore → 15 righe, wipe → `/api/me` 401,
dev login + restore → baseline v5 recuperata.

- **Sintomo:** il restore duplica i dati, ignora metà collezioni e si fida del body;
  il wipe non elimina l'utente.
- **Causa:** `packages/db/src/backup.ts`: `insertMany` senza delete/upsert/transazione,
  `userId` preso dal body, mancano analisi/metriche/nutrizione nel restore,
  `deleteUserData` non tocca `users` né `ai_runs`.
- **Fix:** restore per utente autenticato, delete+insert o upsert in transazione,
  tutte le collezioni esportate, wipe completo; conferma esplicita lato UI.
- **Test:** export → wipe → import su DB pulito → dataset identico; doppio import
  non duplica.

#### F1-11 — La safety non blocca nulla

**Stato: ✅ chiuso in WS-6.** `assessSafety` è invocata sia al salvataggio della baseline
(solo log, per non perdere dati) sia prima della generazione, che viene bloccata con
`400` su red flag assoluti o PAR-Q non completato. Il wizard permette di inserire red
flag e infortuni. Verificato a runtime: save 201, generate 400 con messaggio esplicito.

- **Sintomo:** red flag e PAR-Q non impediscono la creazione del piano.
- **Causa:** `assessSafety` è chiamata solo da `GET /api/baseline/safety`
  (`baseline.service.ts:74`); onboarding e generazione piani non la usano.
- **Fix:** valutazione obbligatoria prima di salvare baseline e generare piani;
  blocco su red flag assoluti; il wizard deve poter inserire red flag e infortuni.
- **Test:** baseline con red flag → piano rifiutato con motivazione; PAR-Q negativo →
  richiesta di clearance.

#### F1-12 — Il generatore ignora obiettivo, sport e durata reale

**Stato: ✅ chiuso in WS-6.** Il generatore parte da oggi nel timezone dell'atleta (o
dalla data richiesta), rispetta `goals.primary.sport` e `profile.sports`, ricava i passi
da `goal.targetValue`/`targetUnit` e scala i blocchi su `durationMin`. Il validator
segnala `session_blocks_overflow`.

- **Sintomo:** piano sempre corsa-first, inizio al lunedì successivo, blocchi più lunghi
  della sessione.
- **Causa:** `plan-generator.ts`: default `running` fuori dal ramo ginocchio;
  `getNextMonday()` (martedì 27/10 → inizio 02/11, 6 giorni di riposo); passi hardcoded
  `4:20–4:35`; blocchi forza ~50 min anche con `durationMin` inferiore.
- **Fix:** partire dalla data richiesta o da oggi; usare `profile.sports` e
  `goals.primary.sport`; ricavare i passi dalla baseline; scalare i blocchi sulla durata.
- **Test:** obiettivo bici → nessuna corsa; generazione di martedì → inizio oggi;
  somma blocchi ≤ `durationMin`.

---

### P2 — Medi

#### F1-13 — Date in UTC invece del timezone utente

**Stato: ✅ chiuso in WS-7.** Helper unico in `packages/domain/src/rules/dates.ts`
(`localDate`, `todayLocalDate`, `resolveTimeZone`, `addDaysIso`) usato da API, sync,
generatore e UI; `getUserTimeZone` legge la baseline attiva con fallback `Europe/Rome`.
Verificato con `Pacific/Kiritimati`: "oggi" locale 28/10 mentre UTC era 27/10.

- **Causa:** `toISOString().slice(0,10)` in API, UI e generatore; `profile.timezone`
  inutilizzato.
- **Effetto:** check-in e sessione "oggi" sbagliati dopo le 22:00 italiane.
- **Fix:** helper `localDate(date, timezone)` unico, usato ovunque.
- **Test:** `2026-10-27T23:30:00Z` con `Europe/Rome` → `2026-10-28`.

#### F1-14 — `GET /api/review/latest` risponde 200 con body vuoto

**Stato: ✅ chiuso in WS-0.** Il controller risponde `404 Not Found` con messaggio
esplicito quando non esiste una review; la UI gestisce il 404 come "nessuna review".

- **Causa:** il service restituisce `null` (`review.service.ts:66-69`); Nest invia 200
  senza body.
- **Effetto:** `WeeklyReviewCard` tratta solo il 404 come "nessuna review" e va in errore
  di parsing JSON.
- **Fix:** rispondere 404 esplicito o `204`, e allineare la UI.
- **Test:** nessuna review → 404 gestito dalla UI senza errori.

#### F1-15 — `advanceWeek` riusa review vecchie e riparte da 1

**Stato: ✅ chiuso in WS-3.** `advanceWeek` usa `getReviewForWeek` sulla settimana
corrente e, se manca, la ricalcola; a fine macro risponde 400 invece di tornare alla
settimana 1. Verificato: `400 Il macrociclo è completo (settimana 4/4)...`.

- **Causa:** usa l'ultima review disponibile senza verificare la settimana
  (`review.service.ts:80-107`); a fine macro `nextWeekIndex = 1`.
- **Fix:** ricalcolare/validare la review della settimana corrente; a fine macro
  chiudere il ciclo o richiedere un nuovo macrociclo.
- **Test:** due avanzamenti consecutivi usano review distinte; ultima settimana →
  nessun wrap-around.

#### F1-16 — Finestra temporale della review sbagliata

**Stato: ✅ chiuso in WS-3.** La review legge `getCheckinsInRange` tra
`microPlan.startDate` e `microPlan.endDate`. Verificato: check-in con dolore del
2026-10-01 (fuori settimana) non ha prodotto eventi dolore nella review corrente.

- **Causa:** `review.service.ts:48` legge gli ultimi 14 check-in, non quelli della
  settimana valutata.
- **Fix:** filtrare per `date` tra `microPlan.startDate` e `microPlan.endDate`.
- **Test:** dolore di due settimane prima non influenza la review corrente.

#### F1-17 — Google login e chiavi non collegati alla UI

**Stato: ✅ chiuso in WS-8.** `/api/auth/status` espone il client ID pubblico, il login
screen usa Google Identity Services, il dev login è nascosto quando disabilitato, esiste
il logout e la chiave Hevy è inseribile nella board e inoltrata per export.
Verificato a runtime lo status (`googleConfigured:false`, `devLoginEnabled:true`) e in
unit test l'inoltro della chiave; il login Google reale non è stato provato.

- **Causa:** backend `POST /api/auth/google` presente, ma nessun bottone o gestione token;
  nessuna `fetch` invia `Authorization`; manca input per la chiave Hevy.
- **Fix:** flusso login (Google + dev) con storage token, wrapper `apiFetch`, form chiave
  Hevy; nascondere il dev login quando disabilitato.
- **Test:** login → chiamate autenticate; logout → endpoint protetti 401.

#### F1-18 — AI coach disallineato dal dominio

**Stato: ❌ aperto, rinviato.** Non è stato toccato in Onda 2.

- **Causa:** `packages/ai/src/coach.ts` distingue `strength`/`interval`, mentre il
  generatore produce `aerobic_base`, `low_impact_endurance`, `intervals`, ecc.
- **Effetto:** consigli nel ramo di default; provider deterministico spacciato per AI.
- **Fix:** mappare i tipi reali o usare `sport` + `intensity`; dichiarare chiaramente
  che il provider è deterministico.
- **Test:** ogni tipo generato produce un consiglio specifico.

#### F1-19 — Scheduler e credenziali

**Stato: ❌ aperto, rinviato.** Non è stato toccato in Onda 2; il sync resta manuale.

- **Causa:** nessuno scheduler (sync solo manuale); credenziali Yazio in file/env,
  non cifrate; peso Yazio limitato all'ultimo valore per data.
- **Fix (rinviabile a Fase 2):** job schedulato con backoff; cifratura credenziali;
  storico peso completo.
- **Nota:** finché non è fatto, la documentazione non deve dire "sync automatico".

### Documentazione

#### F1-20 — Documentazione disallineata

**Stato: ✅ chiuso in Onda 2.** `FASI.md`, `AGENT.md` e `README.md` riportano 148 test
unitari + 9 e2e, lo stato reale di safety/generatore/timezone/auth, i limiti residui e
collegano questo documento.

- **Causa:** `FASI.md` dichiara completi scheduler, `.TCX`, flusso post-sessione,
  red flag UI, safety per tutti gli infortuni, 14 giorni di uso reale, Hevy valido,
  import Garmin e restore pulito; `AGENT.md` dice "Fase 0 completata"; conteggi test
  incoerenti (65 vs 105).
- **Fix:** riportare lo stato reale, collegare questo documento, aggiornare i conteggi.

---

## 4. Lavori parallelizzabili

### 4.1 Regola di partizione

Il codice è già diviso in pacchetti con dipendenze a senso unico:

```
domain  <-  ai
   ^
   |
 db  <-  api  ->  integrations
                     ^
                     |
                   web (solo HTTP)
```

Si possono parallelizzare i lavori che **non toccano gli stessi file**. I punti di
conflitto sono:

| File / area | Conteso da |
|---|---|
| `apps/api/src/*/*.controller.ts` | WS-1 (auth), WS-3 (review), WS-4 (export), WS-5 (backup) |
| `apps/api/src/main.ts` | WS-1 (guard/validation), WS-2 (body limit) |
| `packages/db/src/baselines.ts` | WS-2 (versioning) |
| `apps/api/src/baseline/baseline.service.ts` | WS-2 (versioning), WS-6 (safety) |
| `apps/api/src/export/export.controller.ts` | WS-4 (FIT/Hevy), WS-5 (backup) |
| `packages/domain/src/rules/plan-generator.ts` | WS-6 (sport/date), WS-7 (timezone) |
| `apps/web/src/**` | WS-1 (fetch auth), WS-8 (UX export/login), WS-7 (date) |

### 4.2 Workstream

| ID | Contenuto | File principali | Dipende da | Parallelizzabile subito |
|---|---|---|---|---|
| **WS-0** | Fondamenta: guard JWT, `@CurrentUser`, `ValidationPipe`, body limit, config sicura | `auth/*`, `main.ts`, `config/env.ts`, tutti i controller (1 riga) | — | ✅ **fatto** (27 ott 2026) |
| **WS-1** | Chiusura auth: Google token, allowlist, dev login opt-in, `auth/status` | `auth/*`, `config` | WS-0 | ✅ fatto (backend + UI in WS-8) |
| **WS-2** | Baseline: id server, supersede, indice unique, `getCurrent` | `db/baselines.ts`, `db/indexes.ts`, `baseline.service.ts` | — | **Sì** (solo repository) |
| **WS-3** | Semantica review/check-in: `adjusted`, progressione reale, finestra settimanale, `advanceWeek` | `domain/rules/weekly-review.ts`, `domain/rules/daily-adjustment.ts`, `review.service.ts`, `checkin.service.ts` | — | **Sì** (dominio + service, no controller) |
| **WS-4** | Export: FIT sport/target, Hevy reale | `integrations/fit/*`, `integrations/hevy/*`, `export.controller.ts` | — | **Sì** (integrations), controller dopo WS-0 |
| **WS-5** | Backup/restore/wipe | `db/backup.ts` | — | **Sì** (repository), controller dopo WS-0 |
| **WS-6** | Safety + generatore piani | `domain/rules/safety.ts`, `domain/rules/plan-generator.ts`, `baseline.service.ts`, `plan.service.ts` | — | ✅ **fatto** (27 ott 2026) |
| **WS-7** | Date/timezone | nuovo helper + call site API/UI/domain | WS-2, WS-3, WS-6 (per non riscrivere) | ✅ **fatto** (27 ott 2026) |
| **WS-8** | UI: login Google/dev, `apiFetch`, chiave Hevy, stati vuoti | `apps/web/src/**` | WS-0 (contratto API) | ✅ **fatto** (27 ott 2026) |
| **WS-9** | Test e2e + documentazione | `scripts/e2e-api.ts`, `docs/**` | tutte | ✅ **fatto** (27 ott 2026) |

### 4.3 Onde consigliate

**Onda 0 — fondamento (sequenziale, 1 sessione) — ✅ completata il 27 ottobre 2026**
WS-0 + WS-1. Tocca tutti i controller: farlo per primo evita conflitti a valle.
Include `main.ts` (validation + body limit) e `config`.

**Onda 1 — quattro stream paralleli (nessun file condiviso)**

- Stream A: **WS-2** (baseline repository)
- Stream B: **WS-3** (review/check-in, solo dominio + service)
- Stream C: **WS-4** (integrations FIT/Hevy)
- Stream D: **WS-5 + WS-9-docs** (backup repository + documentazione)

Ognuno può girare in un worktree separato con il proprio branch locale; i test di
dominio/integration non richiedono l'API.

**Onda 2 — tre stream paralleli (dopo il merge dell'Onda 1) — ✅ completata il 27 ottobre 2026**

- Stream E: **WS-6** (safety + generatore)
- Stream F: **WS-8** (UI auth/export)
- Stream G: **WS-7** (timezone, ultimo perché attraversa tutti i call site)

**Onda 3 — chiusura — ✅ completata il 27 ottobre 2026**

- **WS-9**: e2e con Mongo reale (golden path + due utenti + backup/restore),
  aggiornamento `FASI.md`/`AGENT.md`/`README.md`. Lo script è `scripts/e2e-api.ts`
  (`npm run test:e2e`), rifiuta DB non `*_e2e` e pulisce il database a fine corsa.

### 4.4 Cosa NON parallelizzare

- WS-0 contro chiunque tocchi i controller: conflitti garantiti.
- WS-4 e WS-5 sullo stesso `export.controller.ts`: separare il controller in due
  (workout vs data) prima di parallelizzare, oppure eseguirli in sequenza.
- WS-7 contro WS-3/WS-6: la timezone cambia le stesse funzioni di review e generazione.
- Qualsiasi modifica a `packages/domain/src/schemas/*`: è importata da tutti.

### 4.5 Definizione di Done per ogni stream

- Test unitari o di integrazione che **falliscono prima** e passano dopo.
- Nessun `any` non giustificato, `lint`/`typecheck` verdi.
- Endpoint aggiornato in `AGENT.md` §5.1 se cambia il contratto.
- `docs/FASI.md` aggiornato solo quando il criterio è verificato.
- Nessun segreto in codice, log o fixture.

---

## 5. Criteri di uscita della revisione

La Fase 1 si può considerare chiusa quando:

1. Tutti i P0 sono chiusi e coperti da test.
2. Tutti i P1 sono chiusi o esplicitamente rinviati con motivazione in `FASI.md`.
3. Esiste un test e2e con Mongo reale per:
   onboarding → piano → check-in → review → export → backup/restore → wipe.
4. Un secondo utente non può leggere né modificare i dati del primo.
5. `FASI.md` non contiene checkbox `[x]` per feature non verificate.

---

## 6. Non-obiettivi di questo giro

- Riscrivere l'architettura o introdurre un LLM reale.
- Scheduler Garmin/Yazio (Fase 2).
- App Android.
- Multi-tenant, ruoli avanzati, facturazione.
- Import workout Garmin/Hevy.
