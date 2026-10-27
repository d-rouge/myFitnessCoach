# Revisione Fase 1 — problemi e piano di fix

**Versione:** 1.0
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

- **Sintomo:** qualsiasi FIT reale viene rifiutato.
- **Evidenza:** payload 200 KB → 266 KB base64 → `413 request entity too large`.
- **Causa:** `apps/api/src/main.ts` non configura il body parser (default Express 100 KB);
  l'endpoint accetta base64 in JSON (overhead ~33%).
- **Fix:** limite body ≥ 10 MB oppure upload multipart; validare estensione, dimensione e
  magic bytes FIT prima del decode.
- **Test:** upload di un FIT reale da 1 MB → 201; file > limite → 413 con messaggio chiaro.

#### F1-05 — Nessuna validazione degli input

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

- **Sintomo:** la UI mostra la sessione ridotta, ma il piano resta invariato.
- **Causa:** `checkin.service.ts:63-67` salva solo `status: "adjusted"` e le note;
  `DailyAdjustmentResult.adjustedSession` non viene persistito.
- **Fix:** persistere sessione adattata (durata, RPE, blocchi) e distinguerla da
  "completata"; la review deve leggere i dati reali.
- **Test:** check-in con dolore → la sessione salvata ha durata/RPE ridotti e la review
  non la conta come completata.

#### F1-08 — Export FIT errato per forza/mobilità e target persi

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

- **Sintomo:** senza chiave restituisce `success: true`; la routine è sempre la stessa.
- **Causa:** `routine-builder.ts:139-147` (offline preview con successo),
  esercizi e pesi hardcoded, nessuna lettura di `session.blocks`, `HEVY_API_KEY` env
  ignorata (`export.controller.ts:117-146`), sessione `strength_generic` inventata.
- **Fix:** `success: false` senza chiave; usare `HEVY_API_KEY`; mappare blocchi/esercizi;
  non inventare sessioni; validare la risposta Hevy.
- **Test:** senza chiave → 4xx/`success:false`; con mock Hevy → payload con esercizi
  derivati dalla sessione.

#### F1-10 — Backup, restore e wipe non mantengono le promesse

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

- **Sintomo:** red flag e PAR-Q non impediscono la creazione del piano.
- **Causa:** `assessSafety` è chiamata solo da `GET /api/baseline/safety`
  (`baseline.service.ts:74`); onboarding e generazione piani non la usano.
- **Fix:** valutazione obbligatoria prima di salvare baseline e generare piani;
  blocco su red flag assoluti; il wizard deve poter inserire red flag e infortuni.
- **Test:** baseline con red flag → piano rifiutato con motivazione; PAR-Q negativo →
  richiesta di clearance.

#### F1-12 — Il generatore ignora obiettivo, sport e durata reale

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

- **Causa:** `toISOString().slice(0,10)` in API, UI e generatore; `profile.timezone`
  inutilizzato.
- **Effetto:** check-in e sessione "oggi" sbagliati dopo le 22:00 italiane.
- **Fix:** helper `localDate(date, timezone)` unico, usato ovunque.
- **Test:** `2026-10-27T23:30:00Z` con `Europe/Rome` → `2026-10-28`.

#### F1-14 — `GET /api/review/latest` risponde 200 con body vuoto

- **Causa:** il service restituisce `null` (`review.service.ts:66-69`); Nest invia 200
  senza body.
- **Effetto:** `WeeklyReviewCard` tratta solo il 404 come "nessuna review" e va in errore
  di parsing JSON.
- **Fix:** rispondere 404 esplicito o `204`, e allineare la UI.
- **Test:** nessuna review → 404 gestito dalla UI senza errori.

#### F1-15 — `advanceWeek` riusa review vecchie e riparte da 1

- **Causa:** usa l'ultima review disponibile senza verificare la settimana
  (`review.service.ts:80-107`); a fine macro `nextWeekIndex = 1`.
- **Fix:** ricalcolare/validare la review della settimana corrente; a fine macro
  chiudere il ciclo o richiedere un nuovo macrociclo.
- **Test:** due avanzamenti consecutivi usano review distinte; ultima settimana →
  nessun wrap-around.

#### F1-16 — Finestra temporale della review sbagliata

- **Causa:** `review.service.ts:48` legge gli ultimi 14 check-in, non quelli della
  settimana valutata.
- **Fix:** filtrare per `date` tra `microPlan.startDate` e `microPlan.endDate`.
- **Test:** dolore di due settimane prima non influenza la review corrente.

#### F1-17 — Google login e chiavi non collegati alla UI

- **Causa:** backend `POST /api/auth/google` presente, ma nessun bottone o gestione token;
  nessuna `fetch` invia `Authorization`; manca input per la chiave Hevy.
- **Fix:** flusso login (Google + dev) con storage token, wrapper `apiFetch`, form chiave
  Hevy; nascondere il dev login quando disabilitato.
- **Test:** login → chiamate autenticate; logout → endpoint protetti 401.

#### F1-18 — AI coach disallineato dal dominio

- **Causa:** `packages/ai/src/coach.ts` distingue `strength`/`interval`, mentre il
  generatore produce `aerobic_base`, `low_impact_endurance`, `intervals`, ecc.
- **Effetto:** consigli nel ramo di default; provider deterministico spacciato per AI.
- **Fix:** mappare i tipi reali o usare `sport` + `intensity`; dichiarare chiaramente
  che il provider è deterministico.
- **Test:** ogni tipo generato produce un consiglio specifico.

#### F1-19 — Scheduler e credenziali

- **Causa:** nessuno scheduler (sync solo manuale); credenziali Yazio in file/env,
  non cifrate; peso Yazio limitato all'ultimo valore per data.
- **Fix (rinviabile a Fase 2):** job schedulato con backoff; cifratura credenziali;
  storico peso completo.
- **Nota:** finché non è fatto, la documentazione non deve dire "sync automatico".

### Documentazione

#### F1-20 — Documentazione disallineata

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
| **WS-0** | Fondamenta: guard JWT, `@CurrentUser`, `ValidationPipe`, body limit, config sicura | `auth/*`, `main.ts`, `config/env.ts`, tutti i controller (1 riga) | — | No: va prima, è il punto di convergenza |
| **WS-1** | Chiusura auth: Google token, allowlist, dev login opt-in, `auth/status` | `auth/*`, `config` | WS-0 | Dopo WS-0 |
| **WS-2** | Baseline: id server, supersede, indice unique, `getCurrent` | `db/baselines.ts`, `db/indexes.ts`, `baseline.service.ts` | — | **Sì** (solo repository) |
| **WS-3** | Semantica review/check-in: `adjusted`, progressione reale, finestra settimanale, `advanceWeek` | `domain/rules/weekly-review.ts`, `domain/rules/daily-adjustment.ts`, `review.service.ts`, `checkin.service.ts` | — | **Sì** (dominio + service, no controller) |
| **WS-4** | Export: FIT sport/target, Hevy reale | `integrations/fit/*`, `integrations/hevy/*`, `export.controller.ts` | — | **Sì** (integrations), controller dopo WS-0 |
| **WS-5** | Backup/restore/wipe | `db/backup.ts` | — | **Sì** (repository), controller dopo WS-0 |
| **WS-6** | Safety + generatore piani | `domain/rules/safety.ts`, `domain/rules/plan-generator.ts`, `baseline.service.ts`, `plan.service.ts` | — | **Sì** (dominio), service dopo WS-0 |
| **WS-7** | Date/timezone | nuovo helper + call site API/UI/domain | WS-2, WS-3, WS-6 (per non riscrivere) | Dopo |
| **WS-8** | UI: login Google/dev, `apiFetch`, chiave Hevy, stati vuoti | `apps/web/src/**` | WS-0 (contratto API) | Dopo WS-0 |
| **WS-9** | Test e2e + documentazione | nuovo `apps/api/test/**`, `docs/**` | tutte | **Sì** (docs subito, e2e dopo WS-0) |

### 4.3 Onde consigliate

**Onda 0 — fondamento (sequenziale, 1 sessione)**
WS-0 + WS-1. Tocca tutti i controller: farlo per primo evita conflitti a valle.
Include `main.ts` (validation + body limit) e `config`.

**Onda 1 — quattro stream paralleli (nessun file condiviso)**

- Stream A: **WS-2** (baseline repository)
- Stream B: **WS-3** (review/check-in, solo dominio + service)
- Stream C: **WS-4** (integrations FIT/Hevy)
- Stream D: **WS-5 + WS-9-docs** (backup repository + documentazione)

Ognuno può girare in un worktree separato con il proprio branch locale; i test di
dominio/integration non richiedono l'API.

**Onda 2 — tre stream paralleli (dopo il merge dell'Onda 1)**

- Stream E: **WS-6** (safety + generatore)
- Stream F: **WS-8** (UI auth/export)
- Stream G: **WS-7** (timezone, ultimo perché attraversa tutti i call site)

**Onda 3 — chiusura**

- **WS-9**: e2e con Mongo reale (golden path + due utenti + backup/restore),
  aggiornamento `FASI.md`/`AGENT.md`/`README.md`.

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
