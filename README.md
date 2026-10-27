# health-trainer

Personal trainer AI multi-sport: raccoglie anamnesi, obiettivi, disponibilità, attrezzatura e dati da device/app, poi costruisce e adatta macrociclo, microciclo e piano giornaliero.

**Stato:** Fase 1 implementata e **Onda 1 chiusa**. WS-0 (autenticazione JWT unica,
config sicura, validazione Zod, upload FIT) e Onda 1 (baseline/versioning, semantica
review/check-in, export FIT/Hevy, backup/restore/wipe) sono completati e verificati a
runtime. Restano i P1 di Onda 2 (safety F1-11, generatore F1-12), i P2 (timezone, UI
auth/Hevy, AI coach, scheduler) e l'e2e con Mongo reale
([`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md)).

Componenti presenti:
- **L0 Onboarding & Baseline:** Wizard 6 step (`OnboardingWizard.tsx`) con obiettivi e persistenza Mongo (`athlete_baselines`).
- **L1–L3 Piani & Esecuzione:** Generatore deterministico macro/micro ciclo (`generateMacroPlan`, `generateMicroPlan`), safety critic per il ginocchio, board settimanale e card "Oggi".
- **Feedback & Adattamento:** Morning check-in (`MorningCheckinCard.tsx`), motore `computeDailyAdjustment` con sessione adattata persistita (durata, RPE, blocchi, note), attività manuale e upload FIT con validazione firma/dimensione.
- **L4 Review Settimanale:** `computeWeeklyReview`, aderenza, carico, dolore, verdetto e avanzamento (`WeeklyReviewCard.tsx`).
- **AI Coach:** provider deterministico offline-first, prompt `coach-advice-v1`, audit `ai_runs`.
- **Export & Portabilità:** FIT per corsa/bici/nuoto con target strutturati (forza/mobilità rifiutate), Hevy con esercizi derivati e chiave obbligatoria, backup completo con restore idempotente e wipe totale.

130 test unitari verdi, typecheck e lint puliti, build verificata. **Nessun test e2e** con
Mongo reale né verifica multi-utente: le verifiche di Onda 1 sono state fatte a runtime
su un database temporaneo (poi eliminato).

## Documenti

| Documento | Contenuto |
|---|---|
| [`AGENT.md`](AGENT.md) | Guida per un agente: invarianti, mappa del repo, comandi, cosa non fare |
| [`docs/PIANO.md`](docs/PIANO.md) | Prodotto, modello dati, architettura, pipeline AI, sicurezza |
| [`docs/FASI.md`](docs/FASI.md) | Fasi, task, criteri di accettazione, stato corrente |
| [`docs/REVIEW-FASE-1.md`](docs/REVIEW-FASE-1.md) | Problemi aperti della Fase 1, evidenze e piano di fix in parallelo |
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
# Obbligatorio: genera un JWT_SECRET (min 32 caratteri)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Incollalo in .env come JWT_SECRET=...
npm install
npm run dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/api/health>
- Integrazioni: <http://localhost:3000/api/integrations/status>
- Utente corrente: `GET /api/me` con `Authorization: Bearer <token>`

Se Mongo non è raggiungibile, l'API parte comunque e `/api/health` risponde `degraded`. Con Mongo attivo risponde `ok`.

Gli esempi `curl` più sotto verso endpoint protetti richiedono il bearer token. In
locale, con `ENABLE_DEV_ENDPOINTS=true`:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/me
```

La web app lo fa automaticamente tramite `apiFetch` (`apps/web/src/lib/api.ts`).

## Comandi

```bash
npm run dev              # build pacchetti + API + web
npm run dev:api          # solo NestJS (watch)
npm run dev:web          # solo Vite
npm run build            # build completo
npm test                 # unit + contract test (130 test)
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
- `AuthGuard` globale: tutti gli endpoint richiedono `Authorization: Bearer <token>`,
  tranne `/api/health` e le rotte `@Public()` di auth. `x-user-id` è ignorato.
- `GET /api/me` per il profilo dell'utente autenticato.
- Google OAuth token exchange (`POST /api/auth/google`) con verifica `iss`, `aud`,
  `email_verified`, `exp` e allowlist email (`GOOGLE_ALLOWED_EMAILS`, obbligatoria se
  `GOOGLE_CLIENT_ID` è impostata).
- Dev login (`POST /api/auth/dev-login`) **opt-in** con `ENABLE_DEV_ENDPOINTS=true`
  (default `false`); quando disabilitato risponde 403.
- `JWT_SECRET` obbligatorio e di almeno 32 caratteri fuori da `NODE_ENV=test`: senza
  di esso l'API non parte.
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
