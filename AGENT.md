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

**Stato attuale (27 ottobre 2026):** Fase 0 completata. La Fase 1 è **implementata ma non rilasciabile**: la revisione ha trovato 5 bloccanti, 7 problemi gravi e 7 medi. Il loop principale è rotto da namespace utente incompatibili (`personal` vs `user_marco`) e l'autenticazione è aperta per default. Dettaglio in [`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

**Non assumere** che un path o una feature esista solo perché è nel piano: verifica nel repository.

---

## 2. Ordine di lettura

1. `AGENT.md` (questo file)
2. `docs/PIANO.md` — prodotto, architettura, dominio, AI, sicurezza
3. `docs/FASI.md` — fase corrente, task, criteri di accettazione
4. `docs/REVIEW-FASE-1.md` — problemi aperti della Fase 1 e piano di fix
5. `docs/INTEGRAZIONI.md` — Garmin, Yazio, Zepp, Hevy, Health Connect, Drive
6. `docs/spikes/` — risultati reali degli spike (Garmin, Yazio, FIT export, Zepp, Hevy)
7. `README.md` — avvio rapido

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
docs/
  PIANO.md
  FASI.md
  REVIEW-FASE-1.md          problemi aperti Fase 1 + piano di fix
  INTEGRAZIONI.md
  FIT.md
  spikes/                   risultati reali (template + registro)
apps/
  api/                      NestJS 12 ESM: health, integrations, auth, export
    src/database/           MongoService (connessione + indici)
    src/integrations/       GarminService, GarminSyncService, YazioService, YazioSyncService
    src/auth/               AuthService, AuthController, JWT util
    src/export/             ExportController (download workout .FIT)
  web/                      React + Vite + Tailwind, dati Garmin/Yazio in UI, atleta autenticato, export FIT
  mobile/                   Expo (fase 3, non ancora creata)
packages/
  domain/                   Zod (activity, daily metrics, user, etc.), regole pure
  integrations/             Garmin + Yazio + FIT parser/analysis + FIT workout encoder
  db/                       Mongo client, repository activities/metrics/nutrition/analyses/sync/users
  ai/                       interfacce provider/prompt (stub)
  ui/                       utility UI condivise (cn)
  config/                   env Zod, feature flag
```

> Alcuni path sono previsti e non esistono ancora (`apps/mobile`, ecc.). Verifica prima di crearli o importarli.

---

## 4. Fase corrente

Leggere `docs/FASI.md`. La **Fase 0 — Spike e fondamenta** è completata.

La **Fase 1 — Web MVP personale** è implementata e Onda 1 è chiusa (baseline,
review/check-in, export FIT/Hevy, backup/restore). Restano aperti i P1 di Onda 2
(safety F1-11, generatore F1-12), i P2 (timezone, UI auth/Hevy, AI coach, scheduler) e
l'e2e con Mongo reale (WS-9). Dettaglio in
[`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md).

**Prossimo passo:** chiudere Onda 2 seguendo le onde del documento di revisione, poi il
test d'uso reale di 14 giorni.

---

## 5. Comandi

```bash
npm install
cp .env.example .env          # poi compila le chiavi che servono
npm run dev                   # build pacchetti + API + web
npm run dev:api               # solo NestJS (watch)
npm run dev:web               # solo Vite
npm run build                 # build completo
npm test                      # unit/contract test (130 test, nessun e2e)
npm run lint                  # Biome
npm run typecheck             # TypeScript strict
npm run spike:garmin          # spike Garmin (aggiungi -- --write per salvare il report)
npm run spike:yazio           # spike Yazio (credenziali in secrets/yazio.json o .env)
npm run analyze:fit           # scarica l'ultima attività Garmin, parsa il FIT e stampa il brief
npm run export:workout        # genera file dist/workouts/5x800m-intervals.fit
```

MongoDB è locale su `127.0.0.1:27017` ed è **gestito dall'utente**. Non avviare o fermare servizi di sistema (MongoDB, Redis) senza conferma. Non serve Docker.

Comandi **non ancora presenti** (non inventarli): `test:e2e`, `db:migrate`, `eval`. Verranno aggiunti quando ci sarà il codice corrispondente.

Se un comando non esiste, verifica `package.json`, crea lo script solo se fa parte del task, aggiorna questo file.

### 5.1 Endpoint API attuali

Tutti gli endpoint sono protetti dal `AuthGuard` globale (`APP_GUARD`) e richiedono
`Authorization: Bearer <token>`, tranne quelli marcati `@Public()`:

```text
Pubblici
GET  /api/health
GET  /api/auth/status
POST /api/auth/google
POST /api/auth/dev-login   (solo se ENABLE_DEV_ENDPOINTS=true, altrimenti 403)
POST /api/auth/logout

Protetti (JWT)
GET  /api/me
GET  /api/baseline
POST /api/baseline
GET  /api/baseline/history
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
- **Test attuali:** 65 test verdi (domain 20, config 3, integrations 32, api 10). Build, lint e typecheck verdi.
- **MongoDB:** locale su `127.0.0.1:27017`, gestito dall'utente. Se non è in ascolto, `/api/health` risponde `degraded`; non è un bug dell'API. Non avviare servizi di sistema senza conferma.
- **Env:** `apps/api/src/main.ts` e gli spike caricano `.env` con `dotenv/config`. Il package `config` valida le variabili con Zod. In sviluppo l'API e gli spike accettano `secrets/garmin-key.txt` e `secrets/yazio.json` (ignorati da git); in produzione le credenziali devono arrivare da env/secret manager.
- **Yazio:** API non ufficiale **v22** con User-Agent gate (`YAZIO_USER_AGENT`). Per account Google usare `refreshToken` importato; il grant password funziona solo se l'account ha una password Yazio.
- **MongoDB:** locale su `127.0.0.1:27017`, gestito dall'utente. Se non è in ascolto, `/api/health` risponde `degraded`; non è un bug dell'API. Non avviare servizi di sistema senza conferma.
- **Env:** `apps/api/src/main.ts` e gli spike caricano `.env` con `dotenv/config`. Il package `config` valida le variabili con Zod. In sviluppo l'API e gli spike accettano `secrets/garmin-key.txt` e `secrets/yazio.json` (ignorati da git); in produzione le credenziali devono arrivare da env/secret manager.
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
| E2E | onboarding → piano → check-in → review | previsto (`npm run test:e2e`) |
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
