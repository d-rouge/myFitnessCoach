# Fasi di realizzazione

**Versione:** 1.9  
**Data:** 26 ottobre 2026  
**Riferimenti:** [`PIANO.md`](PIANO.md) · [`INTEGRAZIONI.md`](INTEGRAZIONI.md) · [`../AGENT.md`](../AGENT.md)

---

## Principi

1. **Risk-first:** prima si provano le integrazioni fragili (Garmin, Yazio, Zepp, Hevy, export `.FIT`), poi si costruisce la UI.
2. **Vertical slice:** ogni fase produce qualcosa che usi davvero, non solo infrastruttura.
3. **Nessuna assunzione sulle API:** ogni integrazione si chiude con risposte reali salvate in `docs/spikes/`.
4. **Il dominio è testato prima dell'AI:** le regole si validano con unit test; l'LLM arriva dopo.
5. **Local-first su Android:** il server non è necessario per allenarsi.
6. **Ogni fase ha criteri di accettazione verificabili.**

## Timeline indicativa

| Fase | Durata | Risultato |
|---|---|---|
| 0 — Spike e fondamenta | 1 settimana | Integrazioni provate + scaffold |
| 1 — Web MVP personale | 4–5 settimane | Loop completo sul web, uso quotidiano |
| 2 — Multisport, export, automazioni | 2–3 settimane | Feedback per 4 sport + Hevy/Garmin + sync |
| 3 — Android local-first | 4–6 settimane | App Android usabile, dati locali, backup |
| 4 — Test con altri utenti | 3–4 settimane | 5–10 tester, multi-utente, compliance |
| 5 — Consolidamento | continuo | Qualità, sport depth, optional |

Totale primo prodotto Android usabile: **3–4 mesi** con una persona senior, meno se si taglia scope.

---

## Fase 0 — Spike e fondamenta (1 settimana)

### Stato (26 ottobre 2026)

**Fatto:** scaffold npm workspaces, dominio, Garmin sync persistente, **FIT parser/analysis/brief**, Yazio v22 con test reale, generatore ed export workout `.FIT` (`garmin-export.md`), modulo `auth` (Google OAuth allowlist, dev login, `/api/me`, collezione `users`), modulo `export`, UI, CI, MongoDB locale, `.env.example`, 5 spike documentati con verdetto, repo git.
**Verde:** `npm run build`, `npm test` (65 test), `npm run typecheck`, `npm run lint`. `npm run dev` avvia API su :3000 e web su :5173; con Mongo attivo `/api/health` risponde `ok`.
**Fase 0 completata.** Pronti per la **Fase 1 — Web MVP personale**.

> Nota: NestJS è alla versione **12 (ESM)**, con `type: module` e import `.js`. Non reintrodurre CommonJS o Nest 11.

### Obiettivo

Dimostrare che le integrazioni chiave funzionano **davvero** e creare lo scheletro su cui costruire. Nessuna UI elaborata.

### Task

#### 0.1 Scaffold

- [x] Monorepo npm workspaces (niente pnpm, niente Turborepo).
- [x] `apps/api` NestJS con `EnvModule`, `HealthModule`, `IntegrationsModule`, `AuthModule`, `ExportModule`.
- [ ] Moduli di dominio avanzati: `profile`, `plans`, `metrics`, `ai` (in Fase 1).
- [x] `apps/web` React + Vite + Tailwind (shadcn/ui da aggiungere).
- [x] `packages/domain` con schemi Zod (profilo, anamnesi, obiettivi, disponibilità, attrezzatura, check-in, sessione, piano, user).
- [x] Regole pure: `readiness`, `load`, `feasibility`, `progression`, `safety`, `validator` + 20 test.
- [x] `packages/integrations` con `ProviderAdapter`, client Garmin/Yazio, FIT parser/analyzer, workout FIT encoder + 32 test.
- [x] `packages/config`, `packages/db`, `packages/ai`, `packages/ui`.
- [x] MongoDB locale configurato su `127.0.0.1:27017` (nessun Docker).
- [x] CI: workflow GitHub Actions (typecheck, lint, test, build).
- [x] `.env.example` con tutte le variabili.
- [x] Repository git locale: branch `main`, identità `d-rouge`, nessun remote.

#### 0.2 Garmin Personal

- [x] Client Garmin: token exchange, cache 24h, retry su 401, gestione 429, endpoint attività/sonno/HRV/peso/passi/stress.
- [x] Script `npm run spike:garmin` con output redatto, `--write` e `--download`.
- [x] Creare una chiave personale reale su Garmin Connect.
- [x] Pull di 14 giorni con la chiave reale: 6 attività, sonno, HRV, passi, stress, daily summary, Body Battery, RHR, SpO₂, zone HR; peso 0 record.
- [x] Scaricare un `.FIT` di un'attività reale (ZIP 529 KB, valido).
- [x] Misurare latenza (~2,9 s totale) e verificare errori/rate limit (nessun 429 nel singolo run).
- [x] Salvare risposte reali (redatte) in `docs/spikes/garmin.md`.
- [x] Gestire il workaround 406: niente header `Accept` su token/download; token raw JWT.
- [x] Mapper canonico attività → `activities` e metriche → `metrics_daily`.
- [x] Repository Mongo con upsert idempotente, indici e `sync_state`.
- [x] `POST /api/integrations/garmin/sync?days=N` con audit in `sync_runs`.
- [x] `GET /api/integrations/garmin/overview?days=N` per stato, attività e metriche.
- [x] UI: pulsante “Sincronizza ora”, ultimo sync, attività recenti, tabella metriche.
- [x] Test end-to-end reale: 3 attività e 7 giorni di metriche persistiti; secondo sync idempotente.
- [ ] Verifica rate limit su 24–48h di polling continuo (monitoraggio in background).
- [x] Parsing del `.FIT` e generazione `ActivityAnalysis`/brief.
- [ ] Salvataggio del `.FIT` originale su object storage (oggi si parsa on demand).

#### 0.3 FIT: lettura, analisi, export

- [x] Parser FIT/ZIP (`fit-file-parser` + `fflate`).
- [x] Normalizzazione `ActivityAnalysis`: summary, lap, split, zone HR, deriva HR, negative split, variabilità passo.
- [x] Brief compatto per LLM (senza record a 1 Hz).
- [x] Storage `activity_analyses` + endpoint `analyze`/`analysis` + UI “Analizza FIT”.
- [x] Validazione reale: FIT ~1,3 MB, 17.492 record, 44 lap, 42 split, brief ~2 KB.
- [x] Generare un workout `.FIT` strutturato (5×800m con warm-up Z2, interval @ 4:15-4:35/km, recovery 200m, repeat 5x, cooldown Z1).
- [x] Valida con Decoder ufficiale `@garmin/fitsdk` (0 errori, magic bytes `.FIT`, messaggi conformi).
- [x] Script `npm run export:workout` + endpoint `GET /api/export/workouts/sample-5x800m.fit` + card UI con download.
- [x] Documentare il formato export e i limiti in `docs/spikes/garmin-export.md` (Go).

#### 0.4 Yazio

- [x] Client v22 con login/refresh, User-Agent gate, fallback v20, errori tipizzati.
- [x] Supporto token import (`refreshToken`) per account Google/social.
- [x] Mapper: somma macro dei pasti, obiettivi, acqua, passi, peso.
- [x] Sync persistente in `nutrition_daily` / `metrics_daily` + audit.
- [x] Endpoint `check` / `sync` / `overview` e card UI “Nutrizione Yazio”.
- [x] Test di contratto + mapper con fixture.
- [x] Login con account reale (password Yazio; supporto refresh token per Google già implementato).
- [x] Pull reale: profilo, nutrients-daily, summary, diario, ultimo peso, obiettivi (7 giorni).
- [x] Verificare 2FA/blocchi: nessun blocco; token/refresh gestiti.
- [x] Verdetto e rischi in `docs/spikes/yazio.md` (Go).

#### 0.5 Zepp

- [x] Analisi tecnica endpoint `GET /users/{userId}/members/-1/weightRecords`.
- [x] Verificati vincoli di autenticazione proxy HTTPS e TTL di 30 giorni.
- [x] Documentare verdetto (No-go web / fallback HC) in `docs/spikes/zepp.md`.

#### 0.6 Hevy

- [x] Analisi della documentazione OpenAPI Hevy e contratti payload routine.
- [x] Verifica prerequisito Hevy Pro per la chiave API sviluppatore.
- [x] Documentare mapping e limiti in `docs/spikes/hevy.md` (Go con prerequisito).

#### 0.7 Auth e dati

- [x] `EnvModule`, `GET /api/health`, `GET /api/integrations/status`.
- [x] Modulo `AuthModule` con supporto token Google ID e dev login.
- [x] Controllo allowlist email (`GOOGLE_ALLOWED_EMAILS`).
- [x] `users` in Mongo con indici univoci, sessione JWT con HMAC-SHA256 e test unitari.
- [x] Endpoint `/api/me`.
- [x] Frontend: visualizzazione atleta autenticato nella status page.

### Criteri di accettazione

- [x] Tutti gli spike hanno un documento con risposte reali e un verdetto **go / no-go / workaround** (`garmin.md`, `garmin-export.md`, `yazio.md`, `zepp.md`, `hevy.md`).
- [x] Il monorepo parte con `npm install` e `npm run dev` (Mongo locale attivo).
- [x] Auth base e allowlist email funzionano end-to-end con persistenza in `users` e `/api/me`.
- [x] Almeno Garmin e Yazio restituiscono dati reali sincronizzati in Mongo.
- [x] L'export workout `.FIT` è generato, conforme alle specifiche FIT, validato con Decoder e scaricabile.

> Stato attuale: **Fase 0 completata**. Tutti i criteri di accettazione sono soddisfatti. 65 test verdi, typecheck e lint puliti. Pronti per la Fase 1 (Onboarding e prima vertical slice).

### Rischi

| Rischio | Mitigazione |
|---|---|
| Garmin key/token non funziona | leggere FAQ ufficiale; usare il client Python come riferimento |
| Yazio login bloccato (2FA) | documentare; fallback manuale |
| Zepp token troppo fragile | rimandare; usare Health Connect in fase 3 |
| Hevy non Pro | attivare Pro o rimandare export |
| `.FIT` workout non importabile | verificare con un file generato da strumento noto; usare FIT SDK |

---

## Fase 1 — Web MVP personale (4–5 settimane)

### Stato (aggiornato al 27 ottobre 2026)

> ⚠️ **La Fase 1 non è completata.** La revisione del 27 ottobre 2026
> ([`REVIEW-FASE-1.md`](REVIEW-FASE-1.md)) ha trovato 5 problemi bloccanti, 7 gravi e
> 7 medi. Il loop principale resta rotto dal versioning della baseline e dai flussi
> review/check-in/export; i test unitari sono verdi ma non esiste alcun test end-to-end
> con MongoDB reale. Le checkbox sotto sono state riallineate: quelle non verificate
> sono di nuovo `[ ]`.
>
> **WS-0 (27 ottobre 2026):** guard JWT globale, `@CurrentUser()`, config sicura,
> validazione Zod e body limit FIT sono chiusi (F1-01, F1-02, F1-04, F1-05, F1-14).
> Restano **1 P0** (baseline/versioning, F1-03), i P1 e i P2 di Onda 1/2.

**Implementato ma non verificato end-to-end.** Dettaglio e piano di fix in
[`REVIEW-FASE-1.md`](REVIEW-FASE-1.md).
- **1.1 Dominio e regole:** Schemi L0–L4 completi (baseline, preferenze, anamnesi, piani, sessioni, check-in, review), 41 unit test con casi limite e fixture di 3 personas (Marco principiante 5k, Giulia mezza+palestra, Luca dolore ginocchio).
- **1.2 Onboarding:** Wizard interattivo a 6 step (`OnboardingWizard.tsx`) con anamnesi di base, obiettivi, disponibilità, attrezzatura, demo persona selector e persistenza su MongoDB (`athlete_baselines`) + API `/api/baseline`. _(Red flag e infortuni non inseribili dal wizard: F1-11.)_
- **1.3 Piano:** Feasibility check 5k con proiezioni realistiche, generatore macrociclo e microciclo deterministico (`generateMacroPlan`, `generateMicroPlan`), safety critic (sostituzione automatica corsa con bici/nuoto/mobilità per dolore al ginocchio), Board multisport e Card "Oggi" con varianti espresse (15 min, 30 min, cyclette).
- **1.4 Esecuzione e feedback:** Check-in mattutino rapido (`MorningCheckinCard.tsx`), motore di adattamento giornaliero real-time (`computeDailyAdjustment`), inserimento attività manuale (`/api/activities/manual`) e upload file `.FIT` con analisi e confronto automatico pianificato vs effettivo (`compareSessionWithActivity`).
- **1.5 Integrazioni:** Client Garmin Personal con token cache e sync metriche/attività; Yazio client v22 con sync nutrizione e peso; card stato integrazioni e verifica credenziali.
- **1.6 Export:** Export dinamico `.FIT` scaricabile per qualsiasi sessione pianificata (`/api/export/workouts/session/:id.fit`), export routine palestra verso Hevy Pro (`/api/export/workouts/hevy/export`), export backup dell'utente (`/api/export/backup`) e restore (`/api/export/restore`). _(Mapping FIT e Hevy da correggere; restore non idempotente: F1-08, F1-09, F1-10.)_
- **1.7 Review:** Motore di review settimanale deterministico (`computeWeeklyReview`), calcolo aderenza %, carico, eventi dolore e verdetto del coach (`continue`, `progress`, `deload`) con avanzamento al microciclo successivo (`/api/review/advance-week`, `WeeklyReviewCard.tsx`). _(`adjusted` conta come completata e `progress` non applica il +10%: F1-06; review vecchie riusate: F1-15.)_
- **1.8 AI Coach:** Schemi e prompt versionati (`coach-advice-v1`), provider deterministico offline-first (`DeterministicCoachProvider`), tracciamento esecuzioni `ai_runs` con token, latenza e modello, endpoint `/api/ai/coach-advice` e card di coaching briefing integrata nella UI.
- **1.9 Sicurezza & Privacy (GDPR):** Credenziali isolate in `secrets/`, endpoint `/api/export/backup`, restore e cancellazione dati (`DELETE /api/export/me`). _(Restore e wipe incompleti: F1-10; autenticazione JWT e default sicuri chiusi in WS-0: F1-01, F1-02.)_

**Verde (verificato il 27 ottobre 2026 dopo WS-0):** 117 test, typecheck dei workspace e
lint Biome passano; build API e Web completata. **Non coperto:** nessun test e2e con
Mongo reale, nessun test multi-utente, nessun import `.FIT` su Garmin Connect, nessun
export Hevy con chiave reale.

### Obiettivo

Usare l'app ogni giorno per 2 settimane: piano, allenamento, check-in, review, dati Garmin/Yazio, export.

### Task

#### 1.1 Dominio e regole

- [x] Schemi Zod L0: profilo, anamnesi, obiettivi, disponibilità, attrezzatura, preferenze (`baseline.ts`, `preferences.ts`, etc.).
- [x] Schemi L1–L4: piano, settimana, sessione, stato giornaliero, review (`plan.ts`, `daily-state.ts`, `review.ts`, `session.ts`).
- [x] `readiness`, `load`, `progression`, `feasibility`, `safety`, `validator`.
- [x] Unit test per ogni regola, con casi limite (41 test verdi in `packages/domain`).
- [x] Fixture di 3 personas (Marco principiante 5k, Giulia intermedia mezza+palestra, Luca tendinopatia rotulea).

#### 1.2 Onboarding

- [x] Wizard 6 step, salvabile, mobile-friendly (`OnboardingWizard.tsx`).
- [ ] Anamnesi strutturata + testo libero + red flag. _(Il modello dati li prevede, ma il wizard non permette di inserire red flag o infortuni oltre al ginocchio: F1-11.)_
- [x] Obiettivo primario/secondario + data target.
- [x] Disponibilità settimanale e durata massima per sessione.
- [x] Attrezzatura, palestra, piscina, casa con selezione visuale.
- [x] Foto opzionali (upload, EXIF strip, storage privato - rimandato alla fase mobile).
- [x] Riepilogo baseline modificabile con persistenza Mongo (`athlete_baselines`) e modulo API `/api/baseline`.

#### 1.3 Piano

- [x] Feasibility check con proposta di obiettivo realistico (`project5k` e card feasibility nel web).
- [x] Generazione macro (fasi, settimane, target) deterministica da Baseline (`generateMacroPlan`).
- [x] Generazione micro (sessioni, blocchi strutturati, alternative 15/30/basso impatto) da Baseline (`generateMicroPlan`).
- [x] Validator + safety critic (sostituzione automatica corsa con bici/nuoto/mobilità per dolore al ginocchio). _(Solo ginocchio; `assessSafety` non è invocata prima di salvare o generare: F1-11.)_
- [x] Diff e "perché" nella UI (focus fase, intensità RPE e criteri di successo).
- [x] Board settimanale multisport (palestra, corsa, bici, nuoto, mobilità).
- [x] Card "oggi" + alternative (15/30 min, cyclette/basso impatto) e salvataggio stato completamento (`PATCH /api/plan/sessions/:id`).

#### 1.4 Esecuzione e feedback

- [x] Check-in mattutino (sonno, energia, indolenzimento, dolore, tempo) con form rapido 20 secondi (`MorningCheckinCard.tsx`).
- [x] Post-sessione (RPE, sensazioni, dolore, note) e registrazione completamento sessione.
- [x] Inserimento attività manuale (`POST /api/activities/manual`).
- [x] Upload `.FIT` e parsing con estrazione metriche (`POST /api/activities/upload-fit`). _(Corpo JSON fino a 15 MB, firma `.FIT` ai byte 8–11 e limite 10 MB validati in WS-0. `.TCX` non è supportato.)_
- [x] Confronto dati device vs pianificato (`compareSessionWithActivity`).
- [ ] Adattamento giornaliero (`computeDailyAdjustment`: conferma/riduzione/swap/riposo con aggiornamento immediato della sessione). _(La sessione adattata viene calcolata ma non persistita: F1-07.)_

#### 1.5 Integrazioni

- [x] Garmin Personal: adapter pull, token cache.
- [ ] Garmin: scheduler, backoff, reminder scadenza chiave. _(Non implementato: sync solo manuale.)_
- [x] Yazio: adapter v22, refresh, nutrients-daily/summary/peso.
- [x] Yazio: credenziali isolate in `secrets/`.
- [x] Dedupe attività tramite chiavi uniche (userId, source, externalId).
- [x] Pagina/card stato integrazioni (connesso/scaduto/errore).

#### 1.6 Export

- [ ] Export routine palestra → Hevy (mapping esercizi, creazione routine `POST /api/export/workouts/hevy/export`). _(Esercizi e pesi hardcoded, `HEVY_API_KEY` ignorata, `success: true` anche senza chiave: F1-09.)_
- [x] Export workout corsa/bici/nuoto → `.FIT` scaricabile dinamico (`GET /api/export/workouts/session/:id.fit`) + istruzioni import Garmin. _(⚠️ forza/mobilità vengono mappati su corsa e i target testuali vanno persi: F1-08. Import su Garmin Connect non verificato.)_
- [ ] Export backup JSON completo (`GET /api/export/backup`) e ripristino (`POST /api/export/restore`). _(Il restore duplica, ignora metà collezioni e si fida del `userId` del body: F1-10.)_

#### 1.7 Review

- [x] Review settimanale (aderenza %, carico totale, episodi di dolore).
- [ ] Decisioni deterministiche: continua / progredisci (+10% volume) / scarico (-30% volume) / cambia macro. _(`progress` viene deciso ma non applicato al microciclo successivo: F1-06.)_
- [x] Rigenerazione micro e avanzamento alla settimana successiva con contesto completo (`POST /api/review/advance-week`).
- [x] Visualizzazione review nella UI (`WeeklyReviewCard.tsx`).

#### 1.8 AI

- [x] Prompt versionati (`coach-advice-v1`) con validazione Zod schema (`CoachAdviceSchema`).
- [x] Deterministic Coach Provider offline-first per esecuzione affidabile senza chiavi terze parti.
- [x] Audit log `ai_runs` con token, latenza, modello e costo USD.
- [x] Endpoint `POST /api/ai/coach-advice` e widget AI Coach nella dashboard.

#### 1.9 Sicurezza

- [x] Credenziali isolate e protette in `secrets/`.
- [x] Sanitizzazione log.
- [x] Portabilità dati: Export backup JSON completo.
- [ ] Cancellazione totale dati / GDPR wipe (`DELETE /api/export/me`). _(Non elimina `users` né `ai_runs` e usa il fallback `user_marco`: F1-10.)_

### Criteri di accettazione

- [ ] Uso reale per **14 giorni consecutivi**: non è stato fatto. L'architettura è predisposta, ma non esiste evidenza d'uso.
- [ ] Almeno **80%** delle sessioni tracciate (device o check-in): non misurato su dati reali.
- [ ] Garmin e Yazio sincronizzano senza intervento manuale: non esiste scheduler, il sync è manuale.
- [ ] Il piano si adatta a un dato reale (sonno/HRV/dolore/tempo): il calcolo esiste, ma l'adattamento non viene persistito (F1-07).
- [ ] Export Hevy crea una routine valida: non verificato con chiave reale; payload hardcoded (F1-09).
- [ ] Export `.FIT` importabile in Garmin Connect: verificato solo il decode con l'SDK, non l'import su Garmin Connect (F1-08).
- [ ] Backup esportato e ripristinato su un ambiente pulito: non verificato; il restore non è idempotente (F1-10).
- [ ] Nessun piano viola i vincoli di sicurezza: `assessSafety` non è invocata prima della generazione (F1-11).

### Fuori scope (rimandato)

- Zepp.
- Import workout Hevy completati.
- Notifiche push.
- Backup automatico su Drive.
- Analisi foto.

---

## Fase 2 — Multisport, export, automazioni (2–3 settimane)

### Obiettivo

Rendere il feedback utile per tutti e quattro gli sport e ridurre l'input manuale.

### Task

- [ ] Zepp peso: adapter non ufficiale + fallback manuale.
- [ ] Import workout completati da Hevy e collegamento alle sessioni.
- [ ] Feedback specifico:
  - palestra: volume, reps, load, RPE, dolore;
  - corsa: pace/HR vs target, RPE, dolore;
  - bici: power/HR/durata vs target;
  - nuoto: pace/100m, distanza, tecnica.
- [ ] Adattamento automatico su nuovi dati (debounce, `inputsHash`).
- [ ] Notifiche: check-in mattutino, pre-sessione, post-sessione, review.
- [ ] PWA installabile.
- [ ] Backup automatico su Google Drive (ZIP cifrato).
- [ ] Review mensile e modifica del macro.
- [ ] Migliorare il "perché" e il diff.
- [ ] Token/expiry handling per tutti i provider.
- [ ] Eval suite con 10 personas + revisione di un coach.

### Criteri di accettazione

- 4 settimane di dati con tutti e 4 gli sport.
- Almeno un export Hevy e un export Garmin a settimana.
- Sync automatico > 90% dei giorni.
- Backup automatico settimanale + restore testato.
- Review settimanale generata senza errori di schema.
- Nessuna regressione di sicurezza.

---

## Fase 3 — Android local-first (4–6 settimane)

### Obiettivo

App Android usabile ogni giorno, con dati locali e backup personale.

### Decisione tecnica

**Expo/React Native** per condividere `packages/domain`, `packages/integrations` e i prompt. Se il sync Health Connect in background si dimostra instabile, isolare un modulo nativo o passare a Kotlin solo per il layer health.

### Task

#### 3.1 App e dati locali

- [ ] Expo app: login Google, onboarding, oggi, settimana, check-in, progressi.
- [ ] SQLite locale con schema versionato e migrazioni.
- [ ] Repository SQLite che implementa la stessa interfaccia del web.
- [ ] Offline-first: tutte le funzioni base senza rete.
- [ ] Coda `outbox` per export/backup/LLM.

#### 3.2 Health Connect

- [ ] Permessi: passi, sonno, HR, peso, esercizio, nutrizione (dove disponibile).
- [ ] Import periodico + sync all'apertura.
- [ ] Dedupe con Garmin/Yazio/manuale.
- [ ] Gestione permessi negati/revocati.
- [ ] Play Store health data declaration.

#### 3.3 Integrazioni dirette

- [ ] Garmin Personal (opzionale) con chiave su device/Keystore.
- [ ] Yazio (API non ufficiale) con credenziali locali.
- [ ] Hevy export diretto con API key locale.
- [ ] Garmin `.FIT` export + condivisione file.
- [ ] LLM: BYOK diretto o API managed con consenso.

#### 3.4 Foto e backup

- [ ] Camera guidata (fronte/lato/retro) + confronto.
- [ ] Backup ZIP cifrato su Google Drive (`drive.file`).
- [ ] Restore su dispositivo pulito.
- [ ] Retention e rotazione backup.

#### 3.5 Notifiche

- [ ] Push locali per check-in e sessione.
- [ ] Deep link alla schermata giusta.
- [ ] Quiet hours.

### Criteri di accettazione

- Uso quotidiano su Android per **2 settimane**.
- Nessun dato di salute inviato al server (solo auth/backup metadata).
- Health Connect importa almeno sonno, passi, HR e peso.
- Backup e restore funzionano su un dispositivo nuovo.
- L'app funziona in aereo mode per oggi/check-in.
- Export Hevy e Garmin funzionano dal telefono.

---

## Fase 4 — Test con altri utenti (3–4 settimane)

### Obiettivo

Validare il prodotto con 5–10 persone, non solo con te.

### Task

- [ ] Auth multi-utente e isolamento dati.
- [ ] Mongo multi-tenant (o Postgres, se si preferisce) + indici.
- [ ] Consensi art. 9, privacy policy, DPIA, DPA.
- [ ] Onboarding testers + supporto.
- [ ] Garmin: Startup tier se si vuole evitare la chiave personale per tester; altrimenti ogni tester usa la propria.
- [ ] Hevy Pro richiesto ai tester per l'export.
- [ ] Yazio/Zepp: valutare se mantenere le API non ufficiali in multi-utente (probabilmente no).
- [ ] Observability: Sentry, log, metriche di aderenza.
- [ ] Raccolta feedback strutturata.
- [ ] Fix dei bug e dei prompt.
- [ ] Revisione di un coach su 20 piani.

### Criteri di accettazione

- 5–10 tester per 4 settimane.
- Retention D7 > 50%, D30 > 30%.
- Almeno 70% delle sessioni tracciate.
- Nessun evento di sicurezza non gestito.
- Costo LLM < €3/utente/mese.
- NPS qualitativo > 30 (o equivalent feedback).

---

## Fase 5 — Consolidamento (continuo)

Backlog non prioritario:

- Push automatico Garmin via Training API.
- iOS/HealthKit (solo se serve).
- Chat coach con tool read-only.
- Analisi foto AI.
- Multisport depth (piani bici/nuoto strutturati, triathlon).
- Coach mode (professionista che segue più atleti).
- Pagamenti/abbonamento.
- Integrazioni Polar/Suunto/Whoop/Withings.
- Sync multi-device.

---

## Definition of Done (per ogni task)

- [ ] Codice TypeScript strict, niente `any` non giustificato.
- [ ] Test unitari per la logica di dominio.
- [ ] Test di contratto per l'integrazione (fixture registrate, no rete in CI).
- [ ] Test e2e per il flusso utente, se applicabile.
- [ ] Nessun segreto nel codice o nei log.
- [ ] Migrazione/backup compatibile.
- [ ] Documentazione aggiornata (`PIANO`, `FASI`, `INTEGRAZIONI`, `AGENT`).
- [ ] Criteri di accettazione della fase verificati.
- [ ] Verifica manuale su dati reali.

## Strategia di test

| Livello | Cosa | Strumento |
|---|---|---|
| Unit | regole, feasibility, validator | Vitest |
| Contract | adapter Garmin/Yazio/Zepp/Hevy/FIT | Vitest + fixture JSON |
| E2E | onboarding → piano → check-in → review | Playwright |
| AI eval | 10 personas, assertion su schema/sicurezza | script + fixture |
| Backup | export → wipe → import | test dedicato |
| Device | Health Connect, export Hevy/Garmin | manuale su Android |

## Dipendenze esterne

| Dipendenza | Serve per | Quando |
|---|---|---|
| Garmin Personal API key | sync web | Fase 0 |
| Garmin account + dispositivo | test `.FIT` | Fase 0 |
| Yazio account | sync nutrizione | Fase 0 |
| Zepp account + scale | peso | Fase 0/2 |
| Hevy Pro + API key | export palestra | Fase 0 |
| Google Cloud OAuth | login, Drive backup | Fase 0 |
| LLM API key | piani | Fase 1 |
| Android device | Health Connect | Fase 3 |
| Coach certificato | revisione piani | Fase 2/4 |
| Consulenza legale | fase test | Fase 4 |

## Cose che possono far slittare

- Garmin/Yazio/Zepp cambiano API o bloccano l'account.
- Hevy richiede Pro o cambia lo schema.
- Il formato `.FIT` di workout non viene importato come previsto.
- Health Connect in background è troppo limitato su Expo.
- L'LLM non produce piani validi senza molti repair.
- Il tempo reale è meno di quello stimato.

In tutti questi casi: **tagliare scope, non qualità**. La sicurezza e il loop di coaching vengono prima delle feature.
