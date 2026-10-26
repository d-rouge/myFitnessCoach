# AGENT.md

Guida operativa per un agente che interviene su **health-trainer**. Leggere questo file prima di modificare qualsiasi cosa.

**Aggiornato:** 26 ottobre 2026 (Fase 0 in corso).

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

**Stato attuale (26 ottobre 2026):** Fase 0 in corso. Scaffold monorepo, dominio, client Garmin, **sync Garmin persistente**, API health/overview/sync e web UI sono presenti e testati. Mancano auth Google, Yazio, Zepp, Hevy e l'export `.FIT`.

**Non assumere** che un path o una feature esista solo perché è nel piano: verifica nel repository.

---

## 2. Ordine di lettura

1. `AGENT.md` (questo file)
2. `docs/PIANO.md` — prodotto, architettura, dominio, AI, sicurezza
3. `docs/FASI.md` — fase corrente, task, criteri di accettazione
4. `docs/INTEGRAZIONI.md` — Garmin, Yazio, Zepp, Hevy, Health Connect, Drive
5. `docs/spikes/` — risultati reali degli spike (quando esistono)
6. `README.md` — avvio rapido

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
docs/
  PIANO.md
  FASI.md
  INTEGRAZIONI.md
  spikes/                   risultati reali (template + registro)
apps/
  api/                      NestJS 12 ESM: health, Garmin sync/overview
    src/database/           MongoService (connessione + indici)
    src/integrations/       GarminService, GarminSyncService, controller
  web/                      React + Vite + Tailwind, dati Garmin in UI
  mobile/                   Expo (fase 3, non ancora creata)
packages/
  domain/                   Zod (activity, daily metrics), regole pure
  integrations/             Garmin client + mapper canonico
  db/                       Mongo client, repository activities/metrics/sync
  ai/                       interfacce provider/prompt (stub)
  ui/                       utility UI condivise (cn)
  config/                   env Zod, feature flag
```

> Alcuni path sono previsti e non esistono ancora (`apps/mobile`, `packages/integrations/src/yazio`, ecc.). Verifica prima di crearli o importarli.

---

## 4. Fase corrente

Leggere `docs/FASI.md`. Alla data di questo file la fase attiva è la **Fase 0 — Spike e fondamenta**.

Non saltare gli spike: Garmin, Yazio, Zepp, Hevy e l'export `.FIT` hanno dettagli che non si possono indovinare. Ogni spike produce un documento in `docs/spikes/` con risposte reali e un verdetto.

**Prossimo passo:** spike Yazio (nutrizione/peso) e export workout `.FIT` verso Garmin; poi auth Google + onboarding. Lo spike Garmin è completato in `docs/spikes/garmin.md`.

---

## 5. Comandi

```bash
npm install
cp .env.example .env          # poi compila le chiavi che servono
npm run dev                   # build pacchetti + API + web
npm run dev:api               # solo NestJS (watch)
npm run dev:web               # solo Vite
npm run build                 # build completo
npm test                      # unit/contract test
npm run lint                  # Biome
npm run typecheck             # TypeScript strict
npm run spike:garmin          # spike Garmin (aggiungi -- --write per salvare il report)
```

MongoDB è locale su `127.0.0.1:27017` ed è **gestito dall'utente**. Non avviare o fermare servizi di sistema (MongoDB, Redis) senza conferma. Non serve Docker.

Comandi **non ancora presenti** (non inventarli): `test:e2e`, `db:migrate`, `eval`. Verranno aggiunti quando ci sarà il codice corrispondente.

Se un comando non esiste, verifica `package.json`, crea lo script solo se fa parte del task, aggiorna questo file.

### 5.1 Endpoint API attuali

```text
GET  /api/health
GET  /api/integrations/status
POST /api/integrations/garmin/check
GET  /api/integrations/garmin/overview?days=7
POST /api/integrations/garmin/sync?days=7
```

Gli endpoint Garmin sono protetti da `DevOnlyGuard` e richiedono `ENABLE_DEV_ENDPOINTS=true` (default in sviluppo). Il profilo dati è ancora single-user: `PERSONAL_USER_ID = "personal"` in `apps/api/src/config/constants.ts`, in attesa dell'auth.

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
- **Test attuali:** 37 test verdi (domain 20, config 3, integrations 11, api 3). Build e typecheck verdi.
- **MongoDB:** locale su `127.0.0.1:27017`, gestito dall'utente. Se non è in ascolto, `/api/health` risponde `degraded`; non è un bug dell'API. Non avviare servizi di sistema senza conferma.
- **Env:** `apps/api/src/main.ts` e `scripts/spike-garmin.ts` caricano `.env` con `dotenv/config`. Il package `config` valida le variabili con Zod. Lo spike Garmin accetta anche `secrets/garmin-key.txt` (ignorato da git).

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
