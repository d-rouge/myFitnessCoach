# AI Personal Trainer — Piano di prodotto e architettura

**Versione:** 0.3.0  
**Data:** 26 ottobre 2026  
**Stato:** v0.3 — Fase 0 completata (scaffold, Garmin/Yazio sync, FIT brief, export workout .FIT, auth base e spike pronti)  
**Documenti collegati:** [`FASI.md`](FASI.md) · [`INTEGRAZIONI.md`](INTEGRAZIONI.md) · [`../AGENT.md`](../AGENT.md)

---

## 0. Decisioni v0.2 (rispetto alla v0.1)

| Tema | v0.1 | **v0.2 (deciso)** |
|---|---|---|
| Ambito | SaaS-ready | **Uso personale**, poi fase di test con pochi utenti |
| Web | Next.js full-stack | **NestJS + React (Vite)**, due processi separati |
| Tooling | pnpm + Turborepo | **npm workspaces**, niente pnpm/Turbo |
| NestJS | 11 (CJS) temporaneo | **12 (ESM)**, `type: module` + import `.js` |
| DB web | MongoDB | **MongoDB** per i dati del web; Android **locale** |
| Mobile | iOS + Android | **Solo Android**; dati locali, Mongo solo per l'account |
| Sport | corsa-first | **palestra, corsa, bici, nuoto** per testare il feedback |
| Fonti | Garmin Startup, Strava escluso | **Garmin Personal**, **Yazio (API non ufficiale)**, **Zepp (peso)**, **Hevy**; Strava **fuori** |
| Export | non prioritario | **schede palestra → Hevy**; **workout corsa/bici/nuoto → Garmin** |
| LLM | BYOK + managed | invariato: **BYOK + managed free + locale opzionale** |
| Strava | escluso | **escluso definitivamente**: non è una fonte del prodotto |

### Stato implementazione (26 ottobre 2026)

| Area | Stato |
|---|---|
| Monorepo npm workspaces | fatto |
| Dominio Zod + regole (readiness, load, feasibility, progression, safety, validator, date/timezone) | fatto, 56 test |
| Client Garmin Personal + mapper + test di contratto | fatto, 40 test nel pacchetto integrations |
| Spike Garmin con chiave reale | fatto (6 attività, daily metrics, Body Battery, RHR, SpO₂, `.FIT`); peso 0 |
| Sync Garmin persistente (attività + metriche) | fatto (3 attività, 7 giorni, idempotente) |
| Yazio client v22 + mapper + sync + UI | fatto; **test reale OK** (7 giorni, peso); supporto refresh token per Google |
| FIT parser + ActivityAnalysis + brief LLM | fatto (FIT reale: 17.492 record → brief ~2 KB) |
| Garmin workout `.FIT` export | fatto (encoder con `@garmin/fitsdk`, test validati con Decoder ufficiale, script e endpoint download) |
| Modulo Auth Google / Dev e `/api/me` | fatto (NestJS `AuthModule`, allowlist email, sessione JWT, collezione `users` Mongo, login Google/dev e logout nella UI) |
| Spike documentati con verdetto | fatto (`garmin.md`, `garmin-export.md`, `yazio.md`, `zepp.md`, `hevy.md`) |
| API NestJS `health` + Garmin/Yazio `sync`/`overview` + `export` + `auth` | fatto |
| Web React/Vite con dati Garmin + nutrizione Yazio + export FIT + profilo atleta | fatto |
| Test totali | 148 unitari + 9 verifiche e2e su MongoDB reale |
| MongoDB locale `127.0.0.1:27017` | configurato (gestito dall'utente) |
| Repository git locale (`main`, nessun remote) | fatto |
| Prossimi passi | Fase 1 funzionalmente completa; validazione d'uso di 14 giorni, poi F1-18/F1-19 o Fase 2 |

**Cosa resta valido dalla v0.1** (è il cuore del progetto):

1. Motore deterministico + LLM, non "un prompt che fa tutto".
2. Conoscenza a 5 strati versionati: baseline → macro → micro → giorno → review.
3. Contesto stateless e esplicito: base stabile + trend + ultimi giorni + vincoli.
4. Validator e safety gate prima di pubblicare un piano.
5. Privacy e sicurezza serie, anche in uso personale.

---

## 1. Prodotto

### 1.1 Promessa

> "Dimmi chi sei, cosa vuoi ottenere e quanto tempo hai. Io costruisco il piano, lo adatto ogni giorno ai tuoi dati e ti spiego ogni scelta."

L'app non è un tracker: è un ciclo di coaching. Il valore è il loop

> dati → interpretazione → piano → esecuzione → feedback → piano aggiornato

### 1.2 Uso personale, poi test

La prima versione è per te. Questo cambia le priorità:

- meno astrazione multi-tenant, più velocità;
- Garmin Personal API è sufficiente (è pensata per uso personale);
- le API non ufficiali (Yazio, Zepp) sono accettabili con isolamento e consapevolezza dei rischi;
- l'Android può essere local-first, senza portare i dati di salute sul server;
- la fase di test con altri utenti è un progetto separato (auth multi-utente, consensi, DPIA, Garmin Startup).

### 1.3 Non-obiettivi

- Non è un dispositivo medico: nessuna diagnosi, cura o riabilitazione.
- Non è un diario alimentare completo: legge/aggregata dati e dà target.
- Non è un social fitness.
- Non è un sostituto di medico, fisioterapista, nutrizionista o allenatore certificato.
- Non promette trasformazioni estetiche in tempi definiti.

### 1.4 Il loop

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

Regola: **il livello N non riscrive N−1**. Lo supersede con una nuova versione e lascia traccia del perché.

### 1.5 Metriche personali (prime 8 settimane)

| Area | Cosa misurare | Target |
|---|---|---|
| Aderenza | sessioni completate / pianificate | > 75% |
| Dati | giorni con almeno un dato device o check-in | > 85% |
| Coaching | review settimanali lette | > 80% |
| Qualità | piani che passano il validator al primo colpo | > 95% |
| Costo | costo LLM/mese | < €3 (BYOK: €0) |
| Sicurezza | dolore/red flag gestiti e tracciati | 100% |

---

## 2. Fonti dati e realtà delle API

Dettagli operativi, endpoint e mapping: [`INTEGRAZIONI.md`](INTEGRAZIONI.md).

### 2.1 Matrice

| Fonte | Cosa dà | Accesso | Limiti | Uso nel progetto |
|---|---|---|---|---|
| **Garmin Personal API** | attività JSON + `.FIT`, sonno, HRV, RHR, stress, Body Battery, passi, peso, food log | Chiave personale da Garmin Connect, token 24h, **pull** | Solo uso personale; chiave 30/90/180/365 giorni; **read-only**; nessun push di workout; nessun refresh token (si riusa la chiave) | **Sync passivo web sì**: polling server-side. Fonte principale corsa/bici/nuoto |
| **Garmin Training API** | push di workout strutturati | Programma Startup/Enterprise | Richiede organizzazione; no storico; free fino a ~1.000 utenti | Fase successiva, solo se vuoi push automatico |
| **Yazio** | diario, nutrients-daily, summary, macro, peso | **API non ufficiale v22** (JSON token, User-Agent gate, refresh token import) | Nessuna API pubblica; ToS; 2FA; login Google senza password; possibili rotture; UA da aggiornare | **Uso personale**: adapter isolato, credenziali/token cifrati, feature flag |
| **Zepp** | peso, composizione corporea, HR, sonno, attività | **API non ufficiale** (token da cattura proxy, ~30 giorni) **oppure Health Connect su Android** | Fragile; token a scadenza; region-specific; ToS | **Peso**: adapter opzionale; su Android preferire Health Connect |
| **Hevy** | routine, workout completati, exercise templates, body measurements | **API pubblica**, solo Hevy Pro, API key | Beta, nessuna garanzia di stabilità; richiede Pro | **Export schede palestra** e import dei workout completati |
| **Android Health Connect** | passi, sonno, HR, peso, esercizio, nutrizione (se le app scrivono) | App Android nativa | Android 14+ per alcune integrazioni; permessi granulari; Play policy | **Fonte primaria Android**; Garmin/Zepp possono arrivare via HC |
| **Strava** | attività | API con divieto AI | **Vietato l'uso in AI Application** (API Policy 2026 §5.3) | **Escluso** |
| **Apple Health** | — | Solo iOS | Non rilevante: Android-only | Fuori scope |

### 2.2 Risposte dirette

**Garmin: il sync passivo su web con chiave personale è possibile?**  
**Sì.** La Personal API è pensata esattamente per questo: crei una chiave, la dai al tuo backend, il backend la scambia con un token di 24 ore e fa polling periodico su attività, sonno, HRV, RHR, peso, passi, stress. Non ci sono webhook: è **pull**. La chiave scade (30/90/180/365 giorni) e va ruotata; il token si rigenera dalla chiave. È **read-only**: non puoi inviare workout a Garmin con questa API.

**Yazio: si può usare?**  
Sì, tramite API non ufficiale. La specifica community corrente è **v22** (non più v15), con `nutrients-daily`, summary, obiettivi e ultimo peso. Richiede un **User-Agent app valido** (`YAZIO_USER_AGENT`) e, per account Google/social, un **refresh token importato**: il grant password funziona solo se l'account ha una password Yazio. Non è ufficiale: va isolata, con token cifrati e fallback manuale.

**Zepp: si può prendere il peso?**  
Sì, via endpoint non ufficiale `GET /users/{id}/members/-1/weightRecords`, ma serve un `app_token` ottenuto da una cattura proxy e scade in ~30 giorni. Su Android l'alternativa pulita è **Health Connect** (se l'app Zepp scrive il peso). Per il web: adapter opzionale, non dipendenza critica.

**Hevy: si possono esportare le schede?**  
Sì. L'API pubblica (Hevy Pro) permette di creare routine, leggere workout, creare exercise template e gestire body measurements. È il canale giusto per l'export palestra.

**Garmin: si possono inviare i workout di corsa?**  
Non con la Personal API. Opzioni:
1. **Manuale (consigliato ora):** generi un file `.FIT` di workout e lo importi in Garmin Connect (Training > Workouts > Import) o lo copi nella cartella `NewFiles` del dispositivo.
2. **Automatico (dopo):** Garmin Training API, disponibile con Startup/Enterprise.
3. **Non consigliato:** librerie non ufficiali che usano username/password Garmin; funzionano ma violano i ToS e si rompono con MFA.

---

## 3. Scope

### 3.1 MVP personale — "il loop funziona"

**Must have**

- Login Google (allowlist della tua email in modalità personale).
- Onboarding: profilo, anamnesi, obiettivi, disponibilità, attrezzatura, preferenze, foto opzionali.
- Riepilogo baseline modificabile ("ecco cosa ho capito").
- Macrociclo 8–16 settimane + microciclo settimanale.
- Board multisport: palestra, corsa, bici, nuoto.
- Card "oggi" con sessione, alternative e "perché".
- Check-in mattutino (20 sec) e post-sessione (RPE, sensazioni, dolore).
- Sync Garmin Personal (attività, sonno, HRV, RHR, peso).
- Sync Yazio (summary, macro, peso).
- Inserimento manuale e upload `.FIT`/`.TCX`.
- Review settimanale + micro successivo.
- Export routine palestra → Hevy.
- Export workout corsa/bici/nuoto → `.FIT` per Garmin (download + import manuale).
- BYOK LLM + fallback managed.
- Export/backup dei dati.

**Should have (fase 2)**

- Peso Zepp (adapter non ufficiale o Health Connect).
- Import dei workout completati da Hevy.
- Adattamento automatico su nuovi dati.
- Notifiche.
- Backup su Google Drive.

**Could have**

- Analisi foto.
- Chat coach.
- Push automatico Garmin via Training API.
- Apple Health.

**Won't have (per ora)**

- Strava.
- Pagamenti.
- Multi-coach.
- Riabilitazione/nutrizione clinica.

### 3.2 Criterio di uscita MVP

Lo usi per **2 settimane consecutive**: almeno l'80% delle sessioni è tracciato, il piano si adatta ai dati Garmin/Yazio, l'export Hevy funziona, il backup si ripristina, nessun piano viola i vincoli di sicurezza.

---

## 4. Conoscenza a 5 strati

| Strato | Contenuto | Vita | Chi lo produce | Quando cambia |
|---|---|---|---|---|
| **L0 Baseline** | profilo, anamnesi, condizioni, infortuni, obiettivi, disponibilità, attrezzatura, preferenze, foto | permanente, versionato | utente + intake AI | modifica utente o evento rilevante |
| **L1 Macrociclo** | 8–16 settimane, fasi (base/build/peak/taper), test, volumi, distribuzione intensità | 8–16 settimane | planner AI + motore | fine blocco o review che smentisce le assunzioni |
| **L2 Microciclo** | 1 settimana, sessioni, target, luogo, attrezzatura, alternative | 1 settimana | planner AI + motore | ogni settimana o su richiesta |
| **L3 Giorno** | conferma/riduzione/swap/riposo, motivazione, alternativa | 1 giorno | adjuster AI + motore | ogni mattina o su nuovo dato |
| **L4 Review** | metriche, aderenza, progressi, flag, decisioni, input al ciclo successivo | 1 settimana / 1 mese / 1 blocco | reviewer AI + motore | domenica, fine blocco, fine macro |

### 4.1 Versionamento

- Append-only: nuova versione, non modifica.
- Campi: `version`, `validFrom`, `supersededAt`, `contentHash`, `createdBy`, `engineVersion`, `promptVersion`, `model`, `contextHash`.
- Indice unico parziale: `(userId, kind)` con `supersededAt: null`.
- Ogni piano conserva il riferimento alla baseline usata. Se la baseline cambia, il piano diventa `needsReview`, non viene riscritto.
- Ogni rigenerazione mostra un **diff**: cosa cambia, perché, quali dati.

### 4.2 Invalidazione a cascata

| Evento | Effetto |
|---|---|
| Infortunio/dolore acuto | L3 immediato; L2/L1 `needsReview`; esercizi controindicati bloccati |
| Cambio obiettivo/data gara | L1 `needsReview` + nuovo feasibility check |
| Riduzione disponibilità | L2 rigenerato; L1 verificato |
| Nuovo peso/foto | L4 aggiornata; L1 invariato salvo deviazione oltre soglia |
| Device scollegato | nessuna invalidazione; confidenza dati abbassata |

---

## 5. Architettura

### 5.1 Vista d'insieme (web personale)

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

Sul telefono **non** viaggiano i dati di salute verso MongoDB. Il server serve per:
- autenticazione Google e profilo account;
- backup metadata (opzionale);
- LLM managed (solo se l'utente accetta di inviare il contesto);
- sincronizzazione opzionale futura (non ora).

### 5.3 Stack

| Livello | Scelta | Perché |
|---|---|---|
| API | **NestJS 12 (ESM) + TypeScript 6** | Moduli, DI, scheduler, BullMQ, validazione, Swagger/OpenAPI; adatto a molte integrazioni |
| Web | **React + Vite + React Router + TanStack Query** | SPA veloce, PWA, nessun SSR necessario; meno magia di Next |
| UI | **Tailwind + shadcn/ui** | Componenti controllabili, accessibilità, velocità |
| Auth | **Google OAuth**; in personale allowlist email | Semplice; multi-utente in fase test |
| DB web | **MongoDB locale** (`127.0.0.1:27017`) | Piano come documento versionato; flessibile; Atlas free se serve remoto |
| DB Android | **SQLite** (expo-sqlite o Room) | Offline, locale, backup come file |
| Validazione | **Zod** | Unica fonte per DTO, form, output LLM |
| Job | **BullMQ + Redis** (fase successiva) | Sync, parsing, AI, retry, cron |
| Storage | **R2 / S3 / filesystem locale** | Foto, `.FIT`, backup |
| Export Hevy | **Hevy Public API** (Pro) | Routine e workout |
| Export Garmin | **`.FIT` workout** + import manuale | Funziona senza partner program |
| LLM | **Adapter multi-provider** | BYOK, managed, locale; JSON schema |
| Test | **Vitest + Playwright + eval suite** | Regole, e2e, qualità AI |

**Perché NestJS e non Express:** con 5 integrazioni, job schedulati, pipeline AI, validazione e un client Android, Express richiederebbe di reinventare moduli, DI, scheduler, code e Swagger. NestJS costa un po' di boilerplate ma dà struttura. Se il progetto resta davvero minuscolo, un Fastify modulare è l'alternativa; non partiamo da lì.

**NestJS 12 è ESM-only:** `apps/api` ha `"type": "module"`, `module`/`moduleResolution: nodenext` e import relativi con `.js`. Non è una migrazione da fare: è la configurazione iniziale.

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

Tooling: npm workspaces, TypeScript strict, Biome, Vitest. Playwright/eval suite verranno aggiunti con i flussi e2e/AI.

### 5.5 Perché il dominio è condiviso

`packages/domain` non conosce Mongo, HTTP o React. Contiene:
- schemi Zod (profilo, piano, sessione, check-in);
- regole (readiness, load, progressione, safety, feasibility);
- tipi e utility di data/timezone.

Lo stesso pacchetto gira in NestJS e in Expo. Se in futuro l'Android diventa Kotlin, il dominio va portato o esposto via API; per questo tenerlo puro e testato è importante.

### 5.6 Repository e storage astratti

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

### 5.7 Backup e portabilità

Formato `health-trainer-backup-v1.zip`:

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

- Cifratura client-side con passphrase (AES-GCM + Argon2id, o `age`).
- Upload su Google Drive con scope `drive.file`, cartella `HealthTrainer/Backups`.
- Retention: ultimi N backup + uno mensile.
- Restore: valida manifest, migra schema, ricostruisce indici.
- Il web può importare lo stesso ZIP per analisi/visualizzazione.

---

## 6. Modello dati

### 6.1 Collezioni web (MongoDB)

| Collezione | Scopo | Campi chiave |
|---|---|---|
| `users` | account | email, name, locale, timezone, status |
| `consents` | consensi | userId, type, version, grantedAt, revokedAt |
| `athlete_profiles` | L0 profilo | version, validFrom, sex, birthDate, heightCm, weightKg, experience |
| `anamnesis` | L0 anamnesi | conditions[], medications[], injuries[], redFlags[], freeText |
| `goals` | L0 obiettivi | primary{}, secondary[], targetDate |
| `availability` | L0 disponibilità | weekly[], blackouts[] |
| `equipment` | L0 attrezzatura | items[], memberships[] |
| `preferences` | L0 preferenze | sports, dislikes, tone, units |
| `body_assessments` | foto/misure | date, photos[], measurements |
| `plans` | L1 macro | version, status, phases[], rationale, hashes |
| `weeks` | L2 micro | planId, index, focus, targetLoad, sessionIds[] |
| `sessions` | sessioni | date, sport, type, blocks[], equipment[], alternatives[], status |
| `daily_states` | stato calcolato | readiness, flags, acwr, ctl, atl, sleepDebt |
| `daily_adjustments` | L3 | decision, changes[], rationale, contextHash |
| `checkins` | feedback | sleepQuality, soreness[], pain[], mood, energy, rpe |
| `session_logs` | esecuzione | plannedSessionId, completed, actualDuration, rpe, feedback |
| `strength_sets` | serie palestra | sessionLogId, exerciseKey, hevyTemplateId, setIndex, reps, weightKg, rpe |
| `metrics_daily` | serie giornaliera | source, restingHr, hrv, sleep, steps, weight, stress |
| `activities` | attività normalizzate | source, externalId, sport, start, duration, distance, avgHr, power |
| `nutrition_daily` | nutrizione | kcal, protein, carbs, fat, source, confidence |
| `reviews` | L4 | period, metrics, adherence, decisions, nextCycleInputs |
| `provider_credentials` | credenziali | provider, encryptedPayload, expiresAt, status |
| `sync_runs` | audit sync | provider, startedAt, status, stats, error |
| `sync_state` | ultimo sync per provider | userId, provider, lastSyncAt, status, error |
| `export_jobs` | export | type (hevy/garmin/backup), status, fileKey |
| `hevy_mappings` | mapping esercizi | exerciseKey, hevyTemplateId |
| `ai_runs` | audit AI | layer, model, promptVersion, contextHash, tokens, cost, validation |
| `prompt_versions` | registry prompt | key, version, body, schema |
| `audit_log` | sicurezza | actor, action, entity, ts |

### 6.2 Tabelle Android (SQLite)

Le stesse entità, in tabelle relazionali:

```
profile, anamnesis, goals, availability, equipment, preferences
plans, weeks, sessions, daily_states, daily_adjustments
checkins, session_logs, metrics_daily, activities, nutrition_daily, reviews
provider_credentials (Keystore), sync_state, outbox, backup_state
```

- `outbox` per le operazioni da inviare (export, backup, LLM).
- `sync_state` per cursor/ultimo sync per provider.
- `provider_credentials` cifrate con Android Keystore.
- Migrazioni versionate; backup compatibile tra versioni.

### 6.3 Versionamento

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

### 6.4 Deduplicazione attività

1. Chiave forte: `(source, externalId)`.
2. Chiave debole: stesso sport, start ±2 min, durata ±5%, distanza ±5%.
3. Priorità: `.FIT` > Garmin API > Health Connect > manuale.
4. Conserva `sources[]` con provenance; non sommare due volte.

### 6.5 Unità e timezone

- Storage SI: metri, secondi, kg, bpm.
- Display secondo preferenze.
- Il "giorno" è locale (IANA timezone); i timestamp sono UTC.
- Le date di piano sono `YYYY-MM-DD` locali.

---

## 7. Pipeline AI

### 7.1 Principio

Il motore deterministico calcola i vincoli; l'LLM sceglie e spiega dentro quei vincoli.

| Motore | LLM |
|---|---|
| carico, readiness, progressione | selezione e ordine sessioni |
| controindicazioni, varianti ammesse | dettaglio blocchi |
| fattibilità obiettivo | narrativa, motivazione, spiegazione |
| safety gate | review e raccomandazioni |

### 7.2 Stadi

```
[1] Ingest → [2] Compute → [3] Context → [4] Generate
→ [5] Validate (Zod + regole + safety critic) → [6] Persist + diff → [7] Explain
```

Se la validazione fallisce: repair loop (max 2), poi fallback a template deterministico. Mai pubblicare un piano non valido.

### 7.3 Ruoli (prompt specializzati, non agenti autonomi)

| Ruolo | Input | Output |
|---|---|---|
| Intake Structurer | anamnesi libera + form | JSON + red flag |
| Macro Planner | baseline, goal, feasibility, metodologia | fasi, settimane, target |
| Micro Planner | macro, review, disponibilità | sessioni settimana |
| Daily Adjuster | daily_state, sessione, ultimi 3 giorni | decisione + spiegazione |
| Reviewer | 7/28 giorni, aderenza, obiettivi | review + decisioni |
| Safety Critic | piano + vincoli | pass/fail + problemi |
| Chat Coach (fase 4) | domanda + contesto | risposta + proposta di modifica |

Nessun agente scrive direttamente sul piano. Le proposte passano dal validator e, per modifiche strutturali, dalla conferma dell'utente.

### 7.4 Contratto di contesto

| Blocco | Contenuto | Token target |
|---|---|---|
| `athlete_brief` | profilo, anamnesi, vincoli, obiettivo, disponibilità, attrezzatura, preferenze | 800–1.200 |
| `constraints` | envelope calcolato (carico max, varianti, controindicazioni) | 200–400 |
| `macro_summary` | fasi, focus, target | 300–500 |
| `current_week` | sessioni, stato, review precedente | 500–800 |
| `trend` | aggregati 7/28 giorni | 500–800 |
| `recent` | ultimi 3–7 giorni | 400–800 |
| `methodology` | estratto per sport/obiettivo/fase | 500–1.000 |
| `output_schema` | JSON schema + regole di stile | 300–600 |

Totale: **3.500–6.000 token** per il giorno, **8.000–14.000** per macro/micro.

### 7.5 Coerenza

1. Base immutabile + hash in ogni chiamata.
2. Catena esplicita: macro → micro → giorno → review.
3. Numeri calcolati dal motore, non dall'LLM.
4. Diff e conferma su ogni rigenerazione.
5. Prompt versionati + eval.
6. Temperature basse per la pianificazione (0.2–0.3).
7. Cache per `contextHash`.

### 7.6 Modalità LLM

| Modalità | Chi paga | Uso |
|---|---|---|
| **BYOK** | utente | default per uso personale; qualità e costo sotto controllo |
| **Managed free** | app | quota mensile con modello economico |
| **Managed premium** | abbonamento | fase test / commerciale |
| **Locale (Ollama)** | utente | privacy massima; qualità variabile |

Non usare free tier arbitrari per dati sanitari: spesso consentono training sui dati e hanno quote instabili. La modalità gratuita deve essere pagata dall'app o locale.

### 7.7 Eval

- 10 personas: principiante 5k, sub-20, ipertrofia, postpartum, ginocchio dolorante, asma, turnista, zero attrezzatura, solo palestra, master 55+.
- Assertion: schema valido, nessun esercizio controindicato, volumi entro i cap, obiettivo fattibile o ridimensionato, nessuna frase diagnostica.
- Review umana di un coach certificato su 20 piani prima del test con altri utenti.

---

## 8. Motore deterministico

Moduli in `packages/domain`:

| Modulo | Responsabilità |
|---|---|
| `readiness` | punteggio 0–100 + flag da HRV, RHR, sonno, soggettivo, carico |
| `load` | sRPE, TRIMP, CTL/ATL, ACWR, monotonia, strain |
| `progression` | cap settimanali, deload, taper, distribuzione intensità |
| `feasibility` | stima realistica dell'obiettivo (Riegel/VDOT + esperienza + volume) |
| `safety` | red flag, controindicazioni, dolore, RED-S, limiti nutrizionali |
| `scheduler` | collocazione sessioni, recupero tra sessioni dure |
| `validator` | conformità output LLM |

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

Senza wearable: solo soggettivo + carico, `confidence: "low"`.

### 8.2 Carico multisport

- **sRPE** = `RPE × minuti`: metrica universale per palestra, corsa, bici, nuoto.
- **TRIMP** da HR quando disponibile.
- **CTL/ATL** = medie esponenziali 42/7 giorni.
- **ACWR** = acuto 7d / cronico 28d (EWMA). È un flag, non una legge.
- Mostrare carico per sport + aggregato sRPE, dichiarando la metrica.
- Non sommare unità diverse (TSS bici, TRIMP corsa, volume palestra) senza normalizzare.

### 8.3 Progressione (default, da validare con un coach)

| Regola | Valore |
|---|---|
| Aumento volume settimanale | ≤ 10% |
| Corsa lunga | ≤ 30–35% del volume settimanale |
| Sessioni intense | ≤ 2/settimana per 5k; ≥ 48h tra loro |
| Distribuzione intensità | ~80% facile / 20% intenso |
| Scarico | ogni 4ª settimana, −30–40% volume |
| Taper | 2 settimane, −20% poi −40%, intensità mantenuta |
| Forza | 2×/settimana, full body, RPE 6–8 |
| Forza + qualità | non nello stesso giorno se possibile |

### 8.4 Fattibilità

Per un 5k: stima il tempo attuale, applica Riegel `t2 = t1 × (d2/d1)^1.06`, stima il miglioramento realistico in base a esperienza, volume, aderenza e tempo. Se il gap è troppo grande, proponi un obiettivo intermedio. **L'app deve saper dire "no".**

### 8.5 Sicurezza

Blocchi assoluti: dolore toracico, sincope, palpitazioni importanti, ipertensione non controllata, chirurgia recente, sospetta frattura da stress, gravidanza senza ok, disturbi alimentari attivi, febbre/infezione.

Adattamenti: asma (warm-up, inalatore), beta-bloccanti (RPE invece di HR), dolore tendineo (meno impatto), anemia (meno intensità), turni notturni (proteggere sonno).

Nutrizione: deficit ≤ 0,5–1% peso/settimana; proteine 1,6–2,2 g/kg; energia disponibilità > 30 kcal/kg FFM; niente digiuni estremi.

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

Se fallisce: repair prompt con gli errori; poi fallback template. Meglio un piano semplice e sicuro che uno brillante e sbagliato.

---

## 9. Integrazioni ed export (sintesi)

Dettagli: [`INTEGRAZIONI.md`](INTEGRAZIONI.md).

### 9.1 Flussi

| Flusso | Direzione | Meccanismo | Frequenza |
|---|---|---|---|
| Garmin attività/salute | Garmin → app | Personal API pull | 30–60 min (attività), 1×/giorno (salute) |
| Yazio diario/macro/peso | Yazio → app | API non ufficiale | 1–2×/giorno |
| Zepp peso | Zepp → app | API non ufficiale o Health Connect | 1×/giorno |
| Hevy routine | app → Hevy | Public API `POST /v1/routines` | on demand |
| Hevy workout completati | Hevy → app | Public API `GET /v1/workouts` | 1×/giorno |
| Garmin workout | app → Garmin | `.FIT` file, import manuale | on demand |
| Health Connect | Android → app | API nativa | background/app open |
| Backup | app → Drive | ZIP cifrato | giornaliero/settimanale |

### 9.2 Garmin Personal — note

- Chiave creata su `connect.garmin.com/app/settings/personalApiToken`; scadenza 30/90/180/365 giorni.
- Token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` con header `Authorization: ApiKey <key>`; validità 24h; nessun refresh token.
- Endpoint utili: attività, dettaglio attività, download `.FIT`, sonno, HRV, RHR/daily summaries, peso, passi, stress, Body Battery, food log.
- Polling conservativo; backoff su 429; 401 → nuovo token; chiave scaduta → prompt di rotazione.
- **Solo uso personale.** Per test con altri utenti: ogni tester con la propria chiave (scomodo) o Garmin Startup.

### 9.3 Export Garmin

- Genera `.FIT` workout strutturato (run/bike/swim) con warm-up, blocchi, recuperi, target.
- Import: Garmin Connect web → Training & Planning → Workouts → Import; oppure copia in `NewFiles` del dispositivo.
- Automazione futura: Garmin Training API (Startup/Enterprise).
- Non usare librerie che simulano il login Garmin come percorso principale.

### 9.4 Hevy

- API key da `hevy.com/settings?developer`; richiede Hevy Pro.
- Endpoint: `/v1/routines` (GET/POST), `/v1/routines/{id}`, `/v1/exercise_templates` (GET/POST), `/v1/workouts` (GET/POST), `/v1/workouts/{id}`, `/v1/body_measurements`.
- Export: mappa esercizi → `exercise_template_id`; se manca, crea template custom; crea routine con sets/reps/rest.
- Import: leggi workout completati e collegali alle sessioni pianificate.
- Rispetta la richiesta di non martellare le API a `xx:00`.

### 9.5 Yazio

- API non ufficiale v15; OAuth password/refresh; token ~48h.
- Endpoint: `/user`, `/user/consumed-items`, `/user/widgets/daily-summary`, `/user/bodyvalues/weight/last`, `/user/goals`, `/user/exercises`.
- Credenziali cifrate; feature flag; fallback manuale; nessun scraping.
- Possibili 2FA/rotture: l'adapter deve degradare senza bloccare il piano.

### 9.6 Zepp

- Endpoint peso: `GET /users/{id}/members/-1/weightRecords` con header `apptoken`.
- Serve `app_token`, `user_id`, host regionale da cattura proxy; TTL ~30 giorni.
- Alternativa Android: Zepp → Health Connect → app.
- Non critico: se manca, il peso arriva da Garmin/Yazio/manuale.

---

## 10. UX

### 10.1 Schermate

1. **Login** Google.
2. **Onboarding** (6 step, salvabile): profilo, anamnesi, obiettivo, disponibilità, attrezzatura, integrazioni/foto/preferenze.
3. **Riepilogo baseline** modificabile.
4. **Fattibilità** dell'obiettivo, con eventuale proposta intermedia.
5. **Macro** timeline fasi.
6. **Settimana** board multisport.
7. **Oggi** sessione, "perché", alternative.
8. **Check-in** 20 secondi.
9. **Post-sessione** RPE, sensazioni, dolore.
10. **Progressi** carico, pace/HR, peso, foto, aderenza, review.
11. **Export** Hevy / Garmin `.FIT` / backup.
12. **Impostazioni** integrazioni, LLM, unità, notifiche, privacy.

### 10.2 Board multisport

- Lane: palestra, corsa, bici, nuoto, mobilità.
- Card: sport, durata, intensità (colore), attrezzatura, luogo, stato.
- Totali: tempo vs disponibilità, carico per sport, distribuzione intensità.
- Filtri: "solo casa", "≤ 30 min", "basso impatto", "solo palestra".
- Drawer "perché": dati usati, regola, confidenza.
- Azione "adatta": l'utente aggiunge un vincolo (tempo, viaggio, dolore); il motore ricalcola e mostra il diff.

### 10.3 Feedback per sport

| Sport | Dati device | Feedback utente | Confronto |
|---|---|---|---|
| Palestra | Hevy workout (sets/reps/load) | RPE, dolore, energia | volume/reps vs pianificato |
| Corsa | Garmin pace/HR/elevation | RPE, sensazioni, dolore | pace/HR vs target |
| Bici | Garmin power/HR/durata | RPE, sensazioni | power/HR vs target |
| Nuoto | Garmin distanza/pace/stroke | RPE, tecnica | pace/100m vs target |

### 10.4 Foto

- Wizard guidato: fronte, lato, retro; stessa luce/distanza/posa.
- Storage privato, EXIF rimosso.
- Confronto side-by-side, nessun punteggio estetico.
- Analisi AI opzionale e con consenso; output qualitativo, non body fat spacciato per misura.

---

## 11. Sicurezza, privacy, compliance

### 11.1 Fase personale

- I dati di salute sono comunque dati particolari (GDPR art. 9), anche se l'utente sei tu.
- Hosting: macchina locale o VPS UE; Mongo non esposto pubblicamente.
- Credenziali provider cifrate (AES-256-GCM; master key in env/secret manager).
- Backup cifrati con passphrase; test di restore.
- Log senza token, chiavi, foto, testi clinici.
- Foto in storage privato, URL firmati brevi, EXIF rimosso.
- 18+.

### 11.2 Fase test con altri utenti

- Auth multi-utente, isolamento rigoroso (`userId` nel repository, test di accesso incrociato).
- Consenso esplicito art. 9, privacy policy, DPIA, DPA con subprocessori.
- Diritti: export, rettifica, cancellazione, revoca.
- Garmin: Startup tier, non chiavi personali condivise.
- Yazio/Zepp: valutare se mantenere integrazioni non ufficiali in un prodotto multi-utente; probabilmente no.
- Assicurazione/consulenza legale prima del lancio.

### 11.3 Confine medico

- Linguaggio: allenamento, benessere, performance. Mai diagnosi, terapia, riabilitazione.
- Red flag → stop e invito a professionista.
- Se in futuro riabilitazione → MDR/marcatura CE.

### 11.4 Rischi legali delle API non ufficiali

Yazio e Zepp non hanno API pubbliche. Usarle significa:
- possibili violazioni dei ToS;
- rischio di ban/rate limit;
- rotture senza preavviso;
- credenziali dell'utente sul nostro server.

Mitigazione: uso personale, feature flag, adapter isolato, nessun dato condiviso con terzi, fallback manuale, documentazione chiara. Per la fase test multi-utente, rivalutare o rimuovere.

---

## 12. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| LLM incoerente/allucina | alto | regole, schema, validator, eval, temperature basse |
| Consiglio pericoloso | molto alto | red flag, controindicazioni, safety critic, revisione umana |
| Garmin Personal non basta per push workout | medio | export `.FIT` manuale; Startup in fase test |
| Chiave Garmin scade | medio | reminder, rotazione, stato integrazione |
| Yazio/Zepp si rompono | medio | adapter isolato, fallback manuale, feature flag |
| Hevy API beta/Pro | medio | export CSV/fallback; documentare requisito Pro |
| Costi LLM | medio | routing, cache, quota, BYOK |
| Scope multisport | alto | MVP 4 sport ma profondità diversa; feature flag |
| Bassa aderenza | alto | check-in brevi, alternative, spiegazioni |
| Perdita dati locali | alto | backup cifrato + restore testato |
| Data breach | molto alto | cifratura, least privilege, log redatti |
| Classificazione medica | alto | linguaggio, no riabilitazione, consulenza |

---

## 13. Decisioni ancora aperte

| # | Decisione | Opzioni | Raccomandazione |
|---|---|---|---|
| 1 | Android: Expo/RN o Kotlin | condividere TS vs integrazione nativa | **Expo/RN** ora; modulo nativo per Health Connect se serve; Kotlin solo se il background sync è instabile |
| 2 | Push automatico Garmin | `.FIT` manuale / Startup Training API / libreria non ufficiale | **`.FIT` manuale** in MVP; Startup se il test con altri utenti lo richiede |
| 3 | Deploy web | Locale / VPS UE / PaaS | **Locale** per iniziare; VPS UE quando serve accesso remoto |
| 4 | DB web | Mongo / SQLite | **Mongo** come deciso; SQLite resta un'alternativa semplice per single-user |
| 5 | LLM default | BYOK / managed | **BYOK** per uso personale; managed per il test |
| 6 | Zepp | API non ufficiale / Health Connect / manuale | **Health Connect** su Android; API non ufficiale solo web e opzionale |

---

## 14. Prossimi passi

1. ~~**Spike Garmin reale:**~~ fatto il 26 ottobre 2026 — vedi `docs/spikes/garmin.md` (Go con workaround 406/token raw).
2. ~~**Yazio reale:**~~ fatto il 26 ottobre 2026 — login, 7 giorni di macro e peso; vedi `docs/spikes/yazio.md`.
3. ~~**Export workout `.FIT`:**~~ fatto il 26 ottobre 2026 — generatore e validatore con FIT SDK, vedi `docs/spikes/garmin-export.md`.
4. ~~**Auth Google / Dev + `/api/me`:**~~ fatto il 26 ottobre 2026 — modulo `auth`, sessione JWT, allowlist email e collezione `users`.
5. **Avvio Fase 1 (Web MVP personale):** onboarding wizard a 6 step, baseline summary, feasibility check e prima vertical slice (piano → check-in → review).
6. Usare [`AGENT.md`](../AGENT.md) come guida per ogni intervento sul codice; aggiornare i documenti a ogni avanzamento.

---

## Appendice A — Perché non un unico prompt

Un unico prompt che riceve tutti i dati e restituisce un piano sembra un piano, ma:
- non fa aritmetica di periodizzazione affidabile;
- contraddice i dati della settimana precedente;
- ignora controindicazioni;
- non è riproducibile;
- non si può testare.

La separazione **regole → contesto → LLM → validazione** è più lavoro iniziale, ma è l'unica strada per un prodotto correggibile e spiegabile.

## Appendice B — Perché non Next.js

Non serve SSR: l'app è autenticata, personale, e il client è una SPA. NestJS separa meglio le responsabilità (API, job, integrazioni) e il client Android consumerà le stesse API. Vite + React è più semplice da ragionare e da servire come static build.

## Appendice C — Fonti

- Garmin Connect Personal API: <https://developer.garmin.com/gc-developer-program/personal/>
- Garmin Personal API FAQ (token 24h, chiave 30/90/180/365, no refresh): <https://developer.garmin.com/gc-developer-program/personal/personal-faq/>
- Garmin Personal API Python client (endpoint e wrapper): <https://github.com/garmin/connect-personal-api-python>
- Garmin Connect Developer Program (tier): <https://developer.garmin.com/gc-developer-program/overview/>
- Yazio API non ufficiale v15: <https://github.com/saganos/yazio_public_api>
- Zepp health CLI (endpoint peso, token): <https://github.com/m4ary/zepp-health-cli>
- Hevy Public API (routines, workouts, exercise templates): <https://api.hevyapp.com/docs/>
- Garmin Connect → Health Connect: <https://support.garmin.com/en-US/?faq=JToBEy0jfe6pIygark2Ui5>
- Strava API Policy 2026 (perché è escluso): <https://www.strava.com/legal/api_policy>
