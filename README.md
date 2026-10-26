# health-trainer

Personal trainer AI multi-sport: raccoglie anamnesi, obiettivi, disponibilità, attrezzatura e dati da device/app, poi costruisce e adatta macrociclo, microciclo e piano giornaliero.

**Stato:** Fase 1 completata (Web MVP personale completo) — implementati tutti i componenti del loop:
- **L0 Onboarding & Baseline:** Wizard 6 step interattivo (`OnboardingWizard.tsx`) con red flags, obiettivi e persistenza Mongo (`athlete_baselines`).
- **L1–L3 Piani & Esecuzione:** Generatore deterministico macro/micro ciclo multisport (`generateMacroPlan`, `generateMicroPlan`), safety critic per infortuni, board settimanale e card "Oggi" con varianti espresse (15/30 min/cyclette).
- **Feedback & Adattamento:** Morning check-in rapido (`MorningCheckinCard.tsx`), motore di adattamento dinamico real-time (`computeDailyAdjustment`), tracciamento attività manuale (`/api/activities/manual`) e upload FIT con confronto pianificato vs effettivo (`compareSessionWithActivity`).
- **L4 Review Settimanale:** Motore deterministico (`computeWeeklyReview`), calcolo aderenza, carico ed eventi dolore, verdetto del coach (continua, progredisci +10%, scarico -30%) e avanzamento al microciclo successivo (`WeeklyReviewCard.tsx`).
- **AI Coach:** Provider deterministico offline-first (`DeterministicCoachProvider`), prompt versionato (`coach-advice-v1`), tracciamento esecuzioni in `ai_runs` e widget AI Coach.
- **Export & Portabilità:** Export FIT dinamico per qualsiasi sessione pianificata, export routine palestra Hevy Pro, backup completo JSON e cancellazione totale dati utente (GDPR wipe).
105 test verdi, typecheck pulito (9 workspace), lint Biome pulito, build di produzione verificata.

## Documenti

| Documento | Contenuto |
|---|---|
| [`AGENT.md`](AGENT.md) | Guida per un agente: invarianti, mappa del repo, comandi, cosa non fare |
| [`docs/PIANO.md`](docs/PIANO.md) | Prodotto, modello dati, architettura, pipeline AI, sicurezza |
| [`docs/FASI.md`](docs/FASI.md) | Fasi, task, criteri di accettazione, stato corrente |
| [`docs/INTEGRAZIONI.md`](docs/INTEGRAZIONI.md) | Garmin, Yazio, Zepp, Hevy, Health Connect, Drive, LLM |
| [`docs/FIT.md`](docs/FIT.md) | Parsing binario, normalizzazione, ActivityAnalysis e brief compatto per LLM |
| [`docs/spikes/`](docs/spikes/) | Template e risultati reali degli spike (Garmin, Yazio, FIT export, Zepp, Hevy) |

> Regola del progetto: **la documentazione si aggiorna a ogni avanzamento**, nello stesso commit.

## Requisiti

- Node.js >= 22
- npm (incluso con Node)
- MongoDB locale su `127.0.0.1:27017`, gestito da te

L'app non avvia né ferma servizi di sistema. Se Mongo non è in ascolto, avvialo come preferisci. Non serve Docker.

## Avvio rapido

```bash
cp .env.example .env
npm install
npm run dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/api/health>
- Integrazioni: <http://localhost:3000/api/integrations/status>
- Utente corrente: <http://localhost:3000/api/me>

Se Mongo non è raggiungibile, l'API parte comunque e `/api/health` risponde `degraded`. Con Mongo attivo risponde `ok`.

## Comandi

```bash
npm run dev              # build pacchetti + API + web
npm run dev:api          # solo NestJS (watch)
npm run dev:web          # solo Vite
npm run build            # build completo
npm test                 # unit + contract test (88 test)
npm run lint             # Biome
npm run typecheck        # TypeScript strict
npm run spike:garmin     # spike Garmin Personal API
npm run spike:yazio      # spike Yazio API v22
npm run analyze:fit      # scarica FIT Garmin, normalizza e stampa brief LLM
npm run export:workout   # genera file dist/workouts/5x800m-intervals.fit
```

## Spike Garmin

1. Crea una chiave personale su <https://connect.garmin.com/app/settings/personalApiToken>.
2. Aggiungila a `.env` oppure salvala in `secrets/garmin-key.txt` (ignorato da git). In sviluppo anche l'API legge quel file; in produzione usare env/secret manager:

```bash
GARMIN_PERSONAL_API_KEY=...
```

3. Esegui:

```bash
npm run spike:garmin
npm run spike:garmin -- --write   # salva docs/spikes/garmin.local.json (ignorato da git)
```

Il report è redatto: niente token, niente valori clinici completi. Dopo lo spike compila `docs/spikes/garmin.md` con verdetto go / go con workaround / no-go.

## Sync Garmin

Con API e Mongo attivi, la UI ha il pulsante **Sincronizza ora**. Da terminale:

```bash
curl -X POST 'http://localhost:3000/api/integrations/garmin/sync?days=7'
curl 'http://localhost:3000/api/integrations/garmin/overview?days=7'
```

Il sync salva attività e metriche giornaliere in MongoDB (`activities`, `metrics_daily`) e registra l'esito in `sync_runs` / `sync_state`. È idempotente: rilanciarlo non duplica i dati.

## Analisi FIT

Il `.FIT` non viene dato all'LLM: viene parsato, normalizzato e riassunto in un brief compatto.

```bash
npm run analyze:fit
curl -X POST 'http://localhost:3000/api/integrations/garmin/activities/<id>/analyze'
```

Nella UI, ogni attività Garmin ha il pulsante **Analizza FIT**: mostra il brief con summary, split, zone HR e osservazioni (negative split, deriva HR, variabilità). Dettagli in [`docs/FIT.md`](docs/FIT.md).

## Sync Yazio

Yazio usa l'API non ufficiale **v22** e richiede uno User-Agent app valido. Se entri con **Google** (senza password), importa un refresh token catturato dall'app ufficiale:

```json
{ "refreshToken": "il-refresh-token" }
```

Se invece hai impostato una password Yazio:

```json
{ "email": "la-tua-email", "password": "la-tua-password" }
```

Salva in `secrets/yazio.json` (ignorato da git). Poi, con API e Mongo attivi:

```bash
npm run spike:yazio
curl -X POST 'http://localhost:3000/api/integrations/yazio/sync?days=7'
curl 'http://localhost:3000/api/integrations/yazio/overview?days=7'
```

Il sync salva i macro giornalieri in `nutrition_daily` e il peso in `metrics_daily` (source `yazio`). La UI ha la card **Nutrizione Yazio**. Testato con account reale: 7 giorni, 0 errori, sync idempotente.

## Export Workout Garmin (.FIT)

La Garmin Personal API è read-only. Per caricare workout strutturati senza account aziendale, health-trainer genera file binari `.FIT` conformi alle specifiche Garmin:

```bash
npm run export:workout
curl -O 'http://localhost:3000/api/export/workouts/sample-5x800m.fit'
```

Il file generato (`dist/workouts/5x800m-intervals.fit`) può essere:
1. Importato via web su [Garmin Connect Workouts](https://connect.garmin.com/modern/workouts) tramite il pulsante **Importa**.
2. Oppure copiato via USB nella cartella `GARMIN/NewFiles/` del dispositivo.

## Auth e Profilo Utente

L'API include il modulo `auth` con:
- Endpoint `/api/me` per il profilo dell'utente autenticato (o utente dev con allowlist).
- Google OAuth token exchange (`POST /api/auth/google`) con controllo allowlist email (`GOOGLE_ALLOWED_EMAILS`).
- Dev login (`POST /api/auth/dev-login`) abilitato in sviluppo (`ENABLE_DEV_ENDPOINTS=true`).
- Persistenza automatica del profilo in MongoDB (`users`).

## Stack

- **API:** NestJS 12 (ESM) + TypeScript 6
- **Web:** React + Vite + Tailwind
- **DB:** MongoDB locale `127.0.0.1:27017`
- **Android:** Expo/React Native + SQLite locale (fase 3)
- **AI:** adapter multi-provider (BYOK / managed / Ollama)

## Struttura

```
apps/api        NestJS 12 ESM: health, integrations
apps/web        React + Vite
packages/domain Zod + regole pure (readiness, load, feasibility, safety)
packages/integrations  Garmin client
packages/db     Mongo client
packages/ai     interfacce LLM (stub)
packages/config env Zod
packages/ui     utility UI
scripts         build/dev/spike
docs            piano, fasi, integrazioni, spike
```

## Integrazioni iniziali

- Garmin Personal API (pull: attività, sonno, HRV, peso)
- Yazio (API non ufficiale v15: nutrizione, peso)
- Zepp (peso, opzionale)
- Hevy (export routine palestra)
- Garmin `.FIT` (export workout corsa/bici/nuoto)
- Health Connect (Android, fase 3)

Strava è escluso: la API Policy 2026 vieta l'uso dei dati in applicazioni AI.

## Repository

Git inizializzato sul branch `main`, con identità locale:

```text
user.name  = d-rouge
user.email = d-rouge@users.noreply.github.com
```

Nessun remote configurato: verrà scelto in seguito.

## In una frase

Il motore deterministico calcola i vincoli fisiologici e di sicurezza; l'LLM progetta e spiega **dentro** quei vincoli. Ogni livello del piano è versionato e verificabile.
