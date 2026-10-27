# AGENT.md

Guida operativa per un agente che interviene su **health-trainer**. Leggere questo file prima di modificare qualsiasi cosa.

**Aggiornato:** 27 ottobre 2026 (revisione Fase 1).

---

## 0. Regola zero — documentazione sempre aggiornata

**Ogni avanzamento aggiorna la documentazione nello stesso commit/PR.** Non rimandare a "dopo".

| Se cambi... | Aggiorna... |
|---|---|
| Codice o stato di una fase | `docs/FASI.md` (checkbox e stato) + `README.md` (stato) |
| Architettura, stack o una decisione | `docs/PIANO.md` + questo file |
| Chi genera il piano, ruoli LLM, envelope, memoria | `docs/ARCHITETTURA-LLM.md` + `docs/FASI.md` |
| Un'integrazione, endpoint, token o limite | `docs/INTEGRAZIONI.md` + fixture/test |
| Un comando, un path o un invariante | `AGENT.md` |
| Un'ipotesi non verificata | il documento di spike, con la dicitura **non verificato** |

Regole pratiche:

- Se una cosa non è stata testata, scrivilo: **non spacciare un'ipotesi per fatto**.
- Se un test viene rimosso o non eseguito, spiega perché.
- Se una decisione cambia, aggiorna anche la tabella "Decisioni aperte" di `PIANO.md`.
- Un task non è "Done" se la documentazione è disallineata.

---

## 0.1 Repository git

- Branch: **`main`**
- Identità **locale** del repo: `d-rouge <d-rouge@users.noreply.github.com>`
- **Nessun remote configurato.** Non aggiungerlo, non fare `push`, `reset --hard`, `rebase` o force-push senza conferma esplicita.
- Non committare `.env`, `node_modules`, `dist`, foto, `.FIT` o backup.

---

## 1. Cos'è il progetto

Un personal trainer AI multi-sport, inizialmente a **uso personale**, poi in test con pochi utenti.

Il loop:

> dati → interpretazione → piano → esecuzione → feedback → piano aggiornato

L'app non è un tracker. Il valore è il ciclo di coaching, la coerenza del piano e la spiegazione delle scelte.

**Stato attuale (27 ottobre 2026):** Fase 0 completata. La Fase 1 è **funzionalmente
completa** dopo WS-0, Onda 1 e Onda 2: safety, generatore, timezone, auth/Hevy UI ed
e2e multi-utente sono chiusi. Restano rinviati due P2 (F1-18 AI coach, F1-19 scheduler e
credenziali cifrate) e la validazione d'uso reale di 14 giorni. Dettaglio in
[`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

**Non assumere** che un path o una feature esista solo perché è nel piano: verifica nel repository.

---

## 2. Ordine di lettura

1. `AGENT.md` (questo file)
2. `docs/PIANO.md` — prodotto, architettura, dominio, AI, sicurezza
3. `docs/FASI.md` — fase corrente, task, criteri di accettazione
4. `docs/REVIEW-FASE-1.md` — problemi aperti della Fase 1 e piano di fix
5. `docs/INTEGRAZIONI.md` — Garmin, Yazio, Zepp, Hevy, Health Connect, Drive
6. `docs/MODELLO-ATLETA.md` — storia, capacità misurata, contesto recente
7. `docs/ARCHITETTURA-LLM.md` — chi decide il piano: dossier, Proposer, Critic, Referee, memoria
8. `docs/spikes/` — risultati reali degli spike (Garmin, Yazio, FIT export, Zepp, Hevy)
9. `README.md` — avvio rapido

Se un documento contraddice un altro, **vince `PIANO.md`** per l'architettura e `FASI.md` per la priorità. Segnala la contraddizione e aggiorna i documenti.

---

## 3. Mappa del repository

```
AGENT.md
README.md
package.json                npm workspaces (apps/*, packages/*)
package-lock.json           lockfile npm
.env.example                variabili richieste
scripts/
  build-packages.sh         build pacchetti in ordine di dipendenza
  dev.sh                    API + web in parallelo
  spike-garmin.ts           spike Garmin Personal API
  spike-yazio.ts            spike Yazio API v22
  analyze-fit.ts            analizza FIT Garmin e stampa brief
  export-workout-fit.ts     genera file FIT workout
  e2e-api.ts                e2e multi-utente su MongoDB reale (`*_e2e`)
docs/
  PIANO.md
  FASI.md
  REVIEW-FASE-1.md          problemi aperti Fase 1 + piano di fix
  INTEGRAZIONI.md
  FIT.md
  MODELLO-ATLETA.md         storia, capacità misurata, contesto recente
  ARCHITETTURA-LLM.md       dossier, Proposer, Critic, Referee, memoria
  spikes/                   risultati reali (template + registro)
apps/
  api/                      NestJS 12 ESM: health, integrations, auth, export
    src/database/           MongoService (connessione + indici)
    src/common/             helper condivisi (`getUserTimeZone`)
    src/integrations/       GarminService, GarminSyncService, YazioService, YazioSyncService
    src/auth/               AuthService (locale/Google/dev), password scrypt, JWT util
    src/export/             ExportController (download workout .FIT)
  web/                      React + Vite + Tailwind, dati Garmin/Yazio in UI, atleta autenticato, export FIT
  mobile/                   Expo (fase 3, non ancora creata)
packages/
  domain/                   Zod (activity, daily metrics, user, etc.), regole pure
  integrations/             Garmin + Yazio + FIT parser/analysis + FIT workout encoder
  db/                       Mongo client, repository activities/metrics/nutrition/analyses/sync/users/credentials
  ai/                       interfacce provider/prompt (stub)
  ui/                       utility UI condivise (cn)
  config/                   env Zod, feature flag
```

> Alcuni path sono previsti e non esistono ancora (`apps/mobile`, ecc.). Verifica prima di crearli o importarli.

---

## 4. Fase corrente

Leggere `docs/FASI.md`. La **Fase 0 — Spike e fondamenta** è completata.

La **Fase 1 — Web MVP personale** è funzionalmente completa: WS-0, Onda 1 e Onda 2
sono chiuse (auth, baseline, review/check-in, export, backup, safety, generatore,
timezone, UI auth/Hevy, e2e). Restano rinviati F1-18 (AI coach allineato ai tipi reali)
e F1-19 (scheduler, credenziali cifrate, storico peso Yazio). Dettaglio in
[`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

**Prossimo passo:** validazione d'uso reale di 14 giorni, poi scegliere tra F1-18 e
F1-19 (o l'inizio della Fase 2).

---

## 5. Comandi

```bash
npm install
cp .env.example .env          # poi compila le chiavi che servono
npm run dev                   # build pacchetti + API + web
npm run dev:api               # solo NestJS (watch)
npm run dev:web               # solo Vite
npm run build                 # build completo
npm test                      # unit/contract test (239 test)
npm run test:e2e              # e2e multi-utente su Mongo reale (`*_e2e`, poi pulito)
npm run lint                  # Biome
npm run typecheck             # TypeScript strict
npm run spike:garmin          # spike Garmin (aggiungi -- --write per salvare il report)
npm run spike:yazio           # spike Yazio (credenziali in secrets/yazio.json o .env)
npm run spike:deepseek        # verifica DeepSeek (--all per provare pro + flash)
npm run analyze:fit           # scarica l'ultima attività Garmin, parsa il FIT e stampa il brief
npm run export:workout        # genera file dist/workouts/5x800m-intervals.fit
```

MongoDB è locale su `127.0.0.1:27017` ed è **gestito dall'utente**. Non avviare o fermare servizi di sistema (MongoDB, Redis) senza conferma. Non serve Docker.

Comandi **non ancora presenti** (non inventarli): `db:migrate`, `eval`. Verranno aggiunti quando ci sarà il codice corrispondente.

`npm run test:e2e` richiede MongoDB locale, `JWT_SECRET` (≥32 caratteri) in `.env` e la
build API; usa `E2E_MONGODB_URI` (default `mongodb://127.0.0.1:27017/health_trainer_e2e`),
rifiuta database che non terminano con `_e2e` e li elimina a fine corsa.

Se un comando non esiste, verifica `package.json`, crea lo script solo se fa parte del task, aggiorna questo file.

### 5.1 Endpoint API attuali

Tutti gli endpoint sono protetti dal `AuthGuard` globale (`APP_GUARD`) e richiedono
`Authorization: Bearer <token>`, tranne quelli marcati `@Public()`:

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

**Autenticazione.** L'utente si risolve **solo** dal bearer token: `x-user-id` è ignorato.
I controller ricevono l'utente con `@CurrentUser()`. `JWT_SECRET` è obbligatorio
(min 32 caratteri) fuori da `NODE_ENV=test`; senza di esso il boot fallisce.
`ENABLE_DEV_ENDPOINTS` è `false` di default. Gli endpoint Garmin/Yazio restano protetti
anche da `DevOnlyGuard` (richiedono `ENABLE_DEV_ENDPOINTS=true`).

**Validazione.** Ogni payload/query passa da `ZodValidationPipe` con uno schema
dedicato; gli errori sono `400` con `{ message, issues[] }`. Il body JSON accetta fino a
15 MB (`useBodyParser` in `main.ts`) per gli upload FIT in base64.

**Semantica consolidata in Onda 1 (non regredire):**

- **Baseline/versioning.** L'`id` è generato dal server con UUIDv7
  (`packages/db/src/ids.ts`), mai dal client. `saveBaseline` supersede per
  `{ userId, supersededAt: null }`, incrementa `version` e imposta `validFrom`.
  L'indice unique partial `uniq_active_baseline_per_user` garantisce una sola baseline
  attiva per utente; `getCurrentBaseline` ordina per `version`/`validFrom`.
- **Review.** Conta come completate solo le sessioni `status === "completed"`; `adjusted`
  non lo è. Gli eventi dolore arrivano solo dai check-in dentro
  `microPlan.startDate..endDate`. `advanceWeek` usa la review della settimana corrente
  (mai una review vecchia) e a fine macro risponde `400`, senza ripartire da 1.
- **Decisioni.** `progress` applica +10% di volume al microciclo successivo; `deload`
  applica −30% e abbassa l'RPE di 2. Mobilità e recupero non vengono scalati.
- **Check-in.** Un adattamento automatico persiste l'intera sessione (durata, RPE,
  blocchi) più le note in `sessions[].notes`, tramite `replacePlannedSession`; non basta
  cambiare lo stato.
- **Export FIT.** Solo `running`, `cycling`, `swimming`; forza/mobilità/altro → `400`.
  I target testuali vengono interpretati: `Z2`, `Passo 4:20-4:35/km`, `85-95 rpm`,
  `180-220 W`. Il testo non interpretabile resta nelle note dello step.
- **Export Hevy.** Richiede `body.apiKey` o `HEVY_API_KEY`. L'ordine di validazione è
  sessione → sport (`strength`) → chiave, così un errore reale non viene mascherato.
  La sessione non viene mai inventata; gli esercizi derivano dai blocchi, con fallback
  full-body dichiarato.
- **Backup/restore.** Il backup (`0.3.0`) include `ai_runs`. La firma è
  `restoreUserData(db, backup, userId)`: il `userId` del body è ignorato, il restore è
  idempotente (delete+insert per collezione) e valida le chiavi prima di cancellare.
  `deleteUserData` elimina anche `users` e `ai_runs`.

**Semantica consolidata in Onda 2 (non regredire):**

- **Safety.** `assessSafety` è valutata al salvataggio della baseline (solo log, i dati
  non si perdono) e **blocca la generazione** con `400` su red flag assoluti o PAR-Q non
  completato. Un valore PAR-Q mancante equivale a `false` (Zod default) e blocca.
- **Generatore.** Parte da oggi nel timezone dell'atleta (o da `startDate`), colloca le
  sessioni alla prossima occorrenza dei giorni configurati, rispetta
  `goals.primary.sport`/`profile.sports` e scala i blocchi su `durationMin`. I passi
  derivano da `goal.targetValue`/`targetUnit`, non da costanti.
- **Timezone.** Un solo helper (`packages/domain/src/rules/dates.ts`): `localDate`,
  `todayLocalDate`, `resolveTimeZone`, `addDaysIso`. L'API legge il fuso dalla baseline
  attiva (`getUserTimeZone`, fallback `Europe/Rome`). Mai `toISOString().slice(0, 10)`
  per il giorno corrente.
- **Risorse assenti.** `GET /api/baseline`, `GET /api/plan/macro` e `GET /api/plan/micro`
  rispondono `404` esplicito; la UI tratta il 404 come "nessun dato". Mai `200` con body
  vuoto: Nest non serializza `null` e il client andrebbe in errore di parsing.
- **Auth locale.** `POST /api/auth/register` e `POST /api/auth/login` gestiscono account
  email + password (scrypt con salt casuale, hash in `auth_credentials`; il documento
  pubblico `users` non contiene mai materiale password). Email normalizzata, messaggi di
  validazione in italiano, 409 su email duplicata, 401 generico su credenziali errate.
  `ENABLE_LOCAL_AUTH` (default `true`) abilita o disabilita i due endpoint.
- **Google e linking.** La prima login Google verificata e in allowlist crea l'account;
  se esiste già un account locale con la stessa email, Google accede a quello stesso
  `userId` invece di duplicarlo. Servono `GOOGLE_CLIENT_ID` e `GOOGLE_ALLOWED_EMAILS`;
  il client secret non è usato dal flusso GIS ID-token attuale ed è opzionale. In UI il
  pulsante Google è sempre visibile e resta disabilitato finché mancano client ID o
  allowlist.
- **Auth UI.** `/api/auth/status` espone `localAuthEnabled`, `googleClientId` e
  `devLoginEnabled`; la login screen offre accesso/registrazione locale, Google Identity
  Services se configurato e dev login solo se abilitato. Il logout imposta
  `health-trainer.logged-out` e impedisce il dev auto-login finché non si effettua un
  login esplicito.
- **Hevy UI.** La chiave può essere inserita nella board: resta in `localStorage`, viene
  inviata solo con l'export e il server ricade su `HEVY_API_KEY` se assente.
- **Integrazioni.** Lo stato in `/api/health` per Garmin usa
  `GarminService.isConfigured()` (env **o** `secrets/garmin-key.txt`), non il solo env.
  Gli overview leggono `metrics_daily` filtrando per `source`: Garmin non deve mostrare
  le righe Yazio della stessa data. Sync, analyze e overview usano l'`userId` del token,
  mai `personal` hardcoded: un account nuovo non vede i dati di un altro.
- **E2E.** `scripts/e2e-api.ts` avvia l'API con dev endpoint disabilitati, firma due JWT
  e verifica registrazione/login locali, isolamento, export FIT, check-in, backup e 404
  per baseline/piani assenti.

---

## 6. Invarianti non negoziabili

1. **Niente Next.js.** API NestJS, web React + Vite.
2. **Il dominio è puro.** `packages/domain` non importa Mongo, HTTP, React, NestJS.
3. **Le regole vengono prima dell'LLM.** Numeri, carichi, progressione, controindicazioni e fattibilità sono calcolati. L'LLM sceglie e spiega.
4. **Nessun output LLM viene salvato senza validazione** (Zod + regole + safety critic).
5. **I piani sono immutabili e versionati.** Non modificare una versione passata: creane una nuova con `supersedes`.
6. **Timezone:** il "giorno" è locale (IANA), i timestamp sono UTC. Mai fare aritmetica con `Date` nudo.
7. **Niente Strava API.** La policy 2026 vieta l'uso in AI. Non aggiungerla.
8. **Nessun dato sanitario nei log.** Niente token, chiavi, foto, testi clinici.
9. **Segreti cifrati.** Chiavi provider e token mai in chiaro nel DB, mai al client, mai nei log.
10. **Android local-first.** I dati di salute restano sul dispositivo; il server serve per auth, backup metadata e LLM managed (con consenso).
11. **Adapter non ufficiali isolati.** Yazio/Zepp dietro feature flag, con fallback manuale e documentazione dei rischi.
12. **Nessun agente autonomo scrive il piano.** Ruoli tipizzati e pipeline deterministica.
13. **UUID v7** per gli ID portabili tra web e SQLite.
14. **Unità SI nello storage**, display secondo preferenze.
15. **Niente `any`** non giustificato; niente `as` per aggirare i tipi.

---

## 6.1 Note tecniche correnti

- **NestJS 12 (ESM)** con `"type": "module"` e import relativi con estensione `.js`. Non reintrodurre CommonJS o Nest 11.
- **TypeScript 6.0.3**, `module`/`moduleResolution: nodenext`. Evita `moduleResolution: node10` e `baseUrl` (deprecati in TS 6).
- **Node >= 22**, **npm workspaces**. Niente pnpm, niente Turborepo.
- `npm run dev` esegue prima `build:packages`: API e web importano i pacchetti da `dist`, non dal sorgente.
- **Test attuali:** 239 test verdi (api 73, ai 20, domain 99, integrations 40, config 5, db 2) + 14 verifiche e2e. Build, lint, typecheck e `typecheck:scripts` verdi.
- **Modello atleta (v2):** `profile.experience` è stato rimosso. Al suo posto `profile.history` (cosa hai fatto), `profile.capacity` (cosa sai fare ora) e `profile.experienceTier` **derivato server-side** per lo sport dell'obiettivo primario. Regole in `packages/domain/src/rules/experience.ts`. Dettagli e confine con l'LLM in `docs/MODELLO-ATLETA.md`.
- **Capacità misurata:** `profile.capacity.source` è `garmin | manual | calibration`. Con `garmin` i numeri vengono ricalcolati dal server dalle attività importate (mai dal client) al salvataggio, in lettura (`GET /baseline`) e alla generazione del piano; senza attività la baseline viene rifiutata con 400. La regola è una sola: `apps/api/src/baseline/measured-capacity.ts`. Con `calibration` la settimana 1 è un test a RPE 4-5 e la capacità viene ri-stimata appena esistono dati.
- **Giorno dell'atleta:** i contatori ("giorni fa", finestra 28 giorni, streak) usano il fuso della baseline, non UTC. Con `toISOString()` dopo le 22:00 italiane si sbaglia di un giorno. `buildRecentContext()` e `estimateCapacityFromActivities()` accettano `timezone`.
- **Sicurezza e anamnesi:** `assessSafety()` riconosce le condizioni sia con gli id inglesi sia con le etichette italiane del wizard (se il wizard salva "ipertensione non controllata", il blocco deve scattare). Le condizioni croniche comuni alzano la severità a `caution` senza bloccare; i farmaci con impatto sull'esercizio aggiungono una nota (beta-bloccanti → usare RPE, diuretici → idratazione, anticoagulanti → niente contatto/cadute, ipoglicemizzanti → rischio ipoglicemia).
- **Dossier atleta (F1-25):** `buildAthleteDossier()` (`packages/domain/src/rules/athlete-dossier.ts`) compila l'unico oggetto di contesto — identità ed età, obiettivi (anche secondari), storia, capacità, contesto recente, risposta individuale (aderenza, scarto RPE, dolore ricorrente), memoria e storico del piano, vincoli, preferenze — con `warnings` espliciti su ciò che manca. Lo usano `PlanService` e `AiService` tramite `AthleteService.getContext()`: **un solo percorso di contesto**. Un test di copertura fallisce se si aggiunge un campo alla baseline senza passarlo al dossier.
- **Contesto recente:** `buildRecentContext()` (`packages/domain/src/rules/recent-context.ts`) produce fatti strutturati (ultima gara/sforzo lungo, giorni di recupero residui, rapporto acuto/cronico, gap). La finestra di recupero finisce in `macroPlan.recoveryWindow` e forza settimane di recupero deterministicamente: l'LLM può spiegarla, non ignorarla.
- **LLM: DeepSeek cablato, provider parziale.** `LLM_PROVIDER=deepseek` + `LLM_API_KEY` attivano `DeepSeekProvider` (`packages/ai/src/providers/deepseek.ts`); senza chiave si resta su `DeterministicCoachProvider`. Due modelli: `LLM_MODEL=deepseek-v4-pro` per pianificazione/critica, `LLM_MODEL_FAST=deepseek-flash` per il coach. `LLM_THINKING=auto` (default) accende il chain-of-thought sulla pianificazione e sul coach solo quando il contesto è delicato (dolore, readiness bassa, finestra post-gara, carico in salita); `on`/`off` lo forzano. Gli altri provider dell'enum **non** hanno un client: restano deterministici. Il coach **consuma** `RecentContext` (ultima gara/sforzo lungo, finestra di recupero, ACWR, gap) dal 27 ottobre 2026. La generazione del piano resta interamente deterministica: **non descrivere il piano come generato da un LLM** finché la pipeline di `docs/ARCHITETTURA-LLM.md` non è implementata.
- **Errori LLM:** `LlmProviderError` espone `status` e `retryable` (401/402 non ritentabili, 429/5xx/risposta vuota ritentabili). La chiave non compare mai nei messaggi né nei log; i fallimenti finiscono in `ai_runs` con `success: false`.
- **Scarico post-gara: costante provvisoria, riconosciuta sbagliata.** `RECOVERY_RULES` usa 21 giorni per chiunque e `sessionPolicy()` applica la stessa policy a tutti gli sport, quindi nella finestra anche la palestra viene limitata a RPE 6. È corretto per un principiante e troppo conservativo per un amatore avanzato; inoltre lo scarico è per modalità (impatto sì/no, upper body ok, eccentriche pesanti no), non globale. Va sostituito dall'envelope proposto dal Proposer e verificato dal Referee (`docs/ARCHITETTURA-LLM.md` §5).
- **Un solo macro-piano attivo:** rigenerare chiama `supersedeMacroPlans()`, che cancella il piano precedente e i suoi micro-piani. Senza, due piani con la stessa `startDate` rendono `getCurrentMacroPlan` ambiguo.
- **MongoDB:** locale su `127.0.0.1:27017`, gestito dall'utente. Se non è in ascolto, `/api/health` risponde `degraded`; non è un bug dell'API. Non avviare servizi di sistema senza conferma.
- **Identità utente:** tutte le collezioni sono partizionate per `userId` = `users.id`, che **non** è l'`_id` di Mongo. Per l'account Google `users.id` è il subject Google (`sub`, es. `114007601918490478360`); per il dev-login è `personal`. Migrando o ispezionando dati usare sempre `users.id`, altrimenti i documenti esistono ma l'app non li vede.
- **Env:** `apps/api/src/main.ts` carica sempre il `.env` di root (anche con cwd
  `apps/api`); gli spike usano `dotenv/config`. Il package `config` valida le variabili con Zod. In sviluppo l'API e gli spike accettano `secrets/garmin-key.txt` e `secrets/yazio.json` (ignorati da git); in produzione le credenziali devono arrivare da env/secret manager.
- **Yazio:** API non ufficiale **v22** con User-Agent gate (`YAZIO_USER_AGENT`). Per account Google usare `refreshToken` importato; il grant password funziona solo se l'account ha una password Yazio.

---

## 7. Dove intervenire

### Nuova integrazione provider

1. Leggi `docs/INTEGRAZIONI.md` e aggiungi la sezione del provider.
2. Crea `packages/integrations/src/<provider>/`:
   - `<provider>.adapter.ts` (implementa `ProviderAdapter`);
   - `<provider>.schema.ts` (Zod delle risposte);
   - `<provider>.mapper.ts` (raw → canonico);
   - `fixtures/` (risposte redatte).
3. Aggiungi test di contratto con fixture, **senza rete**.
4. Aggiungi il provider a `provider_credentials` e alla UI stato integrazioni.
5. Aggiorna `docs/INTEGRAZIONI.md` con auth, endpoint, errori, mapping.

### Nuovo sport

1. Aggiungi lo sport a `packages/domain/src/sports/`.
2. Definisci tipi sessione, metriche, target, controindicazioni.
3. Aggiungi la lane nella board settimanale.
4. Aggiungi il mapping export (Garmin/Hevy) se applicabile.
5. Aggiungi fixture e test.

### Nuovo strato di piano

1. Schema Zod in `packages/domain`.
2. Repository (Mongo + SQLite) e migrazione.
3. Context builder: cosa vede l'LLM.
4. Prompt versionato + JSON schema.
5. Validator e safety.
6. UI con diff e "perché".
7. Test + eval.

### Nuovo task LLM

1. Nuovo prompt in `packages/ai/prompts/<task>/vN.md`.
2. Schema output + Zod.
3. Context builder con budget token.
4. `ai_runs` con modello, versione, hash, costo.
5. Eval con personas.
6. Fallback deterministico.

### Nuova schermata web

1. Route in `apps/web/src/routes/`.
2. Query/mutation con TanStack Query.
3. Componenti in `packages/ui` se riusabili.
4. Stati: loading, empty, error, offline.
5. Test e2e del flusso.

### Nuova regola di dominio

1. Funzione pura in `packages/domain/src/rules/`.
2. Test unitari con casi limite (dati mancanti, outlier, dolore, zero carico).
3. Se cambia il comportamento del piano, aggiorna `PIANO.md` e l'eval.

### Nuovo export

1. Definisci il formato e il mapping.
2. Implementa in `packages/integrations` o `apps/api/src/export`.
3. Test con file reale (Garmin Connect / Hevy).
4. Documenta i limiti e il fallback manuale.

---

## 8. Convenzioni di codice

- TypeScript strict; `noUncheckedIndexedAccess` se possibile.
- File kebab-case: `readiness.service.ts`, `garmin.adapter.ts`.
- Tipi PascalCase, funzioni camelCase, costanti UPPER_SNAKE.
- Zod per ogni boundary: HTTP, provider, LLM, form, backup.
- Errori tipizzati, non stringhe; niente `throw new Error("...")` generico nel dominio.
- NestJS: moduli piccoli, service sottili, repository dietro interfaccia.
- React: componenti funzione, nessuna logica di dominio nel componente.
- Date: ISO 8601 + timezone esplicita; utility condivise.
- Denaro/unità: non applicabile; unità SI.
- Commenti: solo per il "perché", non per il "cosa".

---

## 9. AI e prompt

Disegno completo, ruoli e passi di implementazione: `docs/ARCHITETTURA-LLM.md`.

Tre regole che vengono da lì e non sono negoziabili:

1. **Il contesto non si improvvisa.** Il modello riceve un dossier compilato da codice (dati Garmin, storia, risposta individuale, memoria dei piani), non una cronologia di chat.
2. **L'envelope è un output, non un input.** Metodo, durata dello scarico e distribuzione dell'intensità li propone l'LLM, li attacca il Critic e li verifica il Referee. Non sono costanti nel codice.
3. **Il Referee contiene solo aritmetica.** Se cresce oltre il controllo di coerenza, è un errore di progetto: quella è conoscenza, e va nel Proposer.

- Un prompt per file, versionato (`v1`, `v2`), con changelog.
- System prompt: ruolo, metodologia, vincoli, stile, divieti medici.
- User message: blocchi di contesto espliciti, non chat history.
- Output: JSON schema strict + Zod.
- Temperatura: 0.2–0.3 per pianificare, 0.5–0.7 per la narrativa.
- Cache per `contextHash`.
- `ai_runs` per ogni chiamata: provider, modello, promptVersion, contextHash, token, costo, validazione.
- Evals prima di cambiare prompt/modello.
- Non inviare foto o testi clinici senza consenso.
- Non usare free tier arbitrari per dati sanitari.

---

## 10. Testing

| Tipo | Cosa | Comando |
|---|---|---|
| Unit | regole, feasibility, validator | `npm test` |
| Contract | adapter con fixture | `npm test` |
| E2E | onboarding → piano → check-in → review, isolamento multi-utente | `npm run test:e2e` |
| AI eval | 10 personas, schema/sicurezza | previsto (`npm run eval`) |
| Backup | export → wipe → import | test dedicato |
| Device | Health Connect, Hevy, Garmin `.FIT` | manuale |

Regole:

- Nessuna rete nei test di CI: fixture registrate.
- Ogni bug di regola → test di regressione.
- Ogni nuovo provider → fixture + test di errore 401/429.
- Ogni modifica al backup → test di compatibilità.

---

## 11. Sicurezza e privacy

- `.env` mai committato; `.env.example` sì.
- Credenziali provider cifrate AES-256-GCM; master key in env/secret manager.
- Android: Android Keystore.
- Log redatti: mai token, chiavi, foto, testi clinici, email non necessarie.
- Upload: limiti, MIME sniffing, re-encode immagini, URL firmati brevi.
- Rate limit su auth e generazione piani.
- Multi-tenant: `userId` obbligatorio nel repository; test di accesso incrociato.
- Backup cifrati; test di restore.
- Dipendenze: giustifica ogni nuova libreria; preferisci quelle mantenute.

---

## 12. Cosa NON fare

- Non usare Next.js.
- Non integrare Strava.
- Non usare un agente autonomo per generare o modificare il piano.
- Non salvare output LLM non validati.
- Non modificare versioni passate di piani, profili, review.
- Non aggirare il validator "per far funzionare la demo".
- Non inventare endpoint o campi delle API: verifica in `docs/INTEGRAZIONI.md` o nei docs ufficiali.
- Non usare username/password Garmin o scraping.
- Non loggare dati sanitari o segreti.
- Non committare `.env`, foto, `.FIT`, backup.
- Non aggiungere `any` o cast per compilare.
- Non cambiare un prompt senza eval.
- Non eseguire `git push`, `reset --hard`, `rebase` o force-push senza conferma. Il repo è locale, senza remote.
- Non avviare o fermare MongoDB/Redis o altri servizi di sistema senza conferma.
- Non cancellare dati utente senza backup e conferma.

---

## 13. Definition of Done

Un task è finito quando:

- [ ] Implementazione completa e tipizzata.
- [ ] Test unitari/contract/e2e applicabili.
- [ ] Nessun segreto o dato sanitario nei log.
- [ ] Migrazione/backup compatibile.
- [ ] Criteri di accettazione della fase soddisfatti.
- [ ] Documenti aggiornati (`PIANO`, `FASI`, `INTEGRAZIONI`, `AGENT`).
- [ ] Verifica manuale su dati reali, se il task tocca un'integrazione.
- [ ] Nessuna regressione sui test esistenti.

---

## 14. Decisioni aperte

Prima di implementare, verifica se il task dipende da una di queste:

| Decisione | Stato | Default |
|---|---|---|
| Android Expo vs Kotlin | aperta | Expo/RN, modulo nativo se serve |
| Push Garmin automatico | aperta | `.FIT` manuale; Startup dopo |
| Deploy web | aperta | Locale ora; VPS UE quando serve accesso remoto |
| DB web Mongo vs SQLite | decisa: Mongo | non cambiare senza motivo |
| Zepp | aperta | Health Connect su Android; API non ufficiale solo web |
| LLM default | decisa: BYOK | managed per test |
| Agente autonomo vs pipeline a ruoli | **decisa: pipeline** | nessun agente che scelga i tool; raccolta dati deterministica |
| Autorità sull'envelope | **decisa: LLM propone, Critic attacca, Referee verifica** | niente costanti di allenamento nel Referee |
| Provider/modello per Proposer e Critic | aperta | due provider diversi, chiavi in `.env` |

Se una decisione cambia, aggiorna `PIANO.md` e questo file **nello stesso commit**.

---

## 15. Come lavorare (procedura)

1. Leggi `docs/FASI.md` e scegli **un** task della fase corrente.
2. Verifica le dipendenze (API key, account, device).
3. Scrivi prima lo schema/test, poi l'implementazione.
4. Esegui typecheck, lint, test.
5. Verifica manualmente il flusso reale, se applicabile.
6. Aggiorna la documentazione.
7. Riporta: cosa hai fatto, cosa non hai potuto verificare, rischi residui.

Se un'API non funziona come documentato:

- non aggirarla con hack silenziosi;
- aggiorna `docs/INTEGRAZIONI.md` con il comportamento reale;
- aggiungi una fixture/test;
- valuta un fallback;
- segnala il rischio.

---

## 16. Glossario

| Termine | Significato |
|---|---|
| **Baseline (L0)** | Dati stabili: profilo, anamnesi, obiettivi, disponibilità, attrezzatura |
| **Macro (L1)** | Blocco di 8–16 settimane, fasi e target |
| **Micro (L2)** | Settimana di allenamento |
| **Giorno (L3)** | Adattamento della sessione odierna |
| **Review (L4)** | Verifica settimanale/mensile e decisioni per il ciclo successivo |
| **Readiness** | Punteggio di prontezza da HRV, RHR, sonno, soggettivo, carico |
| **sRPE** | Carico = RPE × minuti |
| **ACWR** | Rapporto carico acuto/cronico (flag, non legge) |
| **Validator** | Controllo schema + regole + sicurezza prima di pubblicare |
| **Adapter** | Componente che normalizza una fonte esterna nel modello canonico |
| **Backup bundle** | ZIP cifrato con dati + asset per il restore |

---

## 17. Link utili

- Garmin Personal API: <https://developer.garmin.com/gc-developer-program/personal/>
- Garmin Personal FAQ: <https://developer.garmin.com/gc-developer-program/personal/personal-faq/>
- Garmin FIT SDK JS: <https://github.com/garmin/fit-javascript-sdk>
- Yazio API non ufficiale: <https://github.com/saganos/yazio_public_api>
- Zepp health CLI: <https://github.com/m4ary/zepp-health-cli>
- Hevy API: <https://api.hevyapp.com/docs/>
- Health Connect: <https://developer.android.com/health-and-fitness/guides/health-connect>
- Strava API Policy (perché è escluso): <https://www.strava.com/legal/api_policy>
