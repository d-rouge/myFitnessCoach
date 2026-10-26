# Fasi di realizzazione

**Versione:** 1.6  
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

**Fatto:** scaffold npm workspaces, dominio con regole e test, client Garmin, **sync Garmin persistente** (attività + metriche in Mongo), **Yazio client/mapper/sync/UI** (test reale in attesa credenziali), API `/api/health`, overview e sync in UI, CI, MongoDB locale, `.env.example`, repo git.
**Verde:** `npm run build`, `npm test` (46 test), `npm run typecheck`, `npm run lint`. `npm run dev` avvia API su :3000 e web su :5173; con Mongo attivo `/api/health` risponde `ok`.
**Bloccato su:** credenziali Yazio/Google OAuth, chiave Hevy Pro per l'export.
**Prossimo passo:** Yazio (nutrizione/peso) + export workout `.FIT`; poi auth Google e onboarding.

> Nota: NestJS è alla versione **12 (ESM)**, con `type: module` e import `.js`. Non reintrodurre CommonJS o Nest 11.

### Obiettivo

Dimostrare che le integrazioni chiave funzionano **davvero** e creare lo scheletro su cui costruire. Nessuna UI elaborata.

### Task

#### 0.1 Scaffold

- [x] Monorepo npm workspaces (niente pnpm, niente Turborepo).
- [x] `apps/api` NestJS con `EnvModule`, `HealthModule`, `IntegrationsModule`.
- [ ] Moduli `auth`, `profile`, `plans`, `metrics`, `ai`, `export`.
- [x] `apps/web` React + Vite + Tailwind (shadcn/ui da aggiungere).
- [x] `packages/domain` con schemi Zod (profilo, anamnesi, obiettivi, disponibilità, attrezzatura, check-in, sessione, piano).
- [x] Regole pure: `readiness`, `load`, `feasibility`, `progression`, `safety`, `validator` + 20 test.
- [x] `packages/integrations` con `ProviderAdapter`, client Garmin e mapper + 11 test di contratto.
- [x] `packages/config`, `packages/db`, `packages/ai`, `packages/ui`.
- [x] MongoDB locale configurato su `127.0.0.1:27017` (nessun Docker).
- [x] CI: workflow GitHub Actions (typecheck, lint, test, build). Prima esecuzione su GitHub da verificare.
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
- [ ] Verifica rate limit su 24–48h di polling.
- [ ] Salvataggio/parsing del `.FIT` originale (oggi si scarica solo nello spike).

#### 0.3 Garmin export workout

- [ ] Generare un workout `.FIT` semplice (es. 5×800m).
- [ ] Importarlo in Garmin Connect (Training > Workouts > Import) e verificare che compaia.
- [ ] Provare la copia in `NewFiles` su un dispositivo, se disponibile.
- [ ] Documentare il formato e i limiti in `docs/spikes/garmin-export.md`.

#### 0.4 Yazio

- [x] Client con login/refresh, fallback v15→v20, errori tipizzati.
- [x] Mapper: somma macro dei pasti, obiettivi, acqua, passi, peso.
- [x] Sync persistente in `nutrition_daily` / `metrics_daily` + audit.
- [x] Endpoint `check` / `sync` / `overview` e card UI “Nutrizione Yazio”.
- [x] Test di contratto + mapper con fixture.
- [ ] Login con account reale (credenziali in `secrets/yazio.json`).
- [ ] Pull reale: profilo, summary giornaliero, diario, ultimo peso, obiettivi.
- [ ] Verificare 2FA/blocchi e scadenza token reale.
- [ ] Compilare verdetto e rischi in `docs/spikes/yazio.md`.

#### 0.5 Zepp

- [ ] Ottenere `app_token`, `user_id`, host regionale (cattura proxy o config).
- [ ] Pull `weightRecords` degli ultimi 30 giorni.
- [ ] Verificare TTL e region.
- [ ] Documentare l'alternativa Health Connect in `docs/spikes/zepp.md`.

#### 0.6 Hevy

- [ ] Verificare Hevy Pro e creare API key.
- [ ] `GET /v1/exercise_templates`: salvare la lista.
- [ ] `POST /v1/routines`: creare una routine di prova.
- [ ] `GET /v1/workouts`: leggere un workout completato.
- [ ] `POST /v1/exercise_templates`: creare un esercizio custom (se serve).
- [ ] Documentare mapping e limiti in `docs/spikes/hevy.md`.

#### 0.7 Auth e dati

- [x] `EnvModule`, `GET /api/health`, `GET /api/integrations/status`, `POST /api/integrations/garmin/check`, `GET /api/integrations/garmin/overview`, `POST /api/integrations/garmin/sync`, `POST /api/integrations/yazio/check`, `GET /api/integrations/yazio/overview`, `POST /api/integrations/yazio/sync`.
- [ ] Google OAuth su NestJS; allowlist della tua email.
- [ ] `users` in Mongo; sessione JWT/httpOnly.
- [ ] Endpoint `/api/me`.
- [ ] Frontend: login + schermata vuota "oggi" (la web UI attuale è una status page).

### Criteri di accettazione

- Tutti gli spike hanno un documento con risposte reali e un verdetto **go / no-go / workaround**.
- Il monorepo parte con `npm install` e `npm run dev` (Mongo locale attivo).
- Login Google funziona end-to-end.
- Almeno Garmin e Yazio restituiscono dati reali.
- L'export `.FIT` è importabile in Garmin Connect.

> Stato attuale: build/test/typecheck/lint verdi; API e web si avviano. MongoDB locale è attivo e `/api/health` risponde `ok`. Garmin sync è operativo e persistente. Yazio è implementato ma il login reale è in attesa di credenziali. Login Google e export `.FIT` non sono ancora implementati.

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

### Obiettivo

Usare l'app ogni giorno per 2 settimane: piano, allenamento, check-in, review, dati Garmin/Yazio, export.

### Task

#### 1.1 Dominio e regole

- [ ] Schemi Zod L0: profilo, anamnesi, obiettivi, disponibilità, attrezzatura, preferenze.
- [ ] Schemi L1–L4: piano, settimana, sessione, stato giornaliero, review.
- [ ] `readiness`, `load`, `progression`, `feasibility`, `safety`, `validator`.
- [ ] Unit test per ogni regola, con casi limite.
- [ ] Fixture di 3 personas (principiante, intermedio, ginocchio dolorante).

#### 1.2 Onboarding

- [ ] Wizard 6 step, salvabile, mobile-friendly.
- [ ] Anamnesi strutturata + testo libero + red flag.
- [ ] Obiettivo primario/secondario + data.
- [ ] Disponibilità settimanale e durata massima.
- [ ] Attrezzatura, palestra, piscina, casa.
- [ ] Foto opzionali (upload, EXIF strip, storage privato).
- [ ] Riepilogo baseline modificabile.

#### 1.3 Piano

- [ ] Feasibility check con proposta di obiettivo realistico.
- [ ] Generazione macro (fasi, settimane, target).
- [ ] Generazione micro (sessioni, blocchi, alternative).
- [ ] Validator + safety critic + fallback template.
- [ ] Diff e "perché" nella UI.
- [ ] Board settimanale multisport (palestra, corsa, bici, nuoto).
- [ ] Card "oggi" + alternative (15/30/45 min, casa/palestra, basso impatto).

#### 1.4 Esecuzione e feedback

- [ ] Check-in mattutino (sonno, energia, indolenzimento, dolore, tempo).
- [ ] Post-sessione (RPE, sensazioni, dolore, note).
- [ ] Inserimento attività manuale.
- [ ] Upload `.FIT`/`.TCX` e parsing.
- [ ] Confronto dati device vs pianificato.
- [ ] Adattamento giornaliero (conferma/riduzione/swap/riposo).

#### 1.5 Integrazioni

- [ ] Garmin Personal: adapter pull, token cache, scheduler, backoff.
- [ ] Yazio: adapter, credenziali cifrate, refresh, summary/peso.
- [ ] Dedupe attività.
- [ ] Pagina stato integrazioni (connesso/scaduto/errore).
- [ ] Rotazione chiave Garmin con reminder.

#### 1.6 Export

- [ ] Export routine palestra → Hevy (mapping esercizi, creazione routine).
- [ ] Export workout corsa/bici/nuoto → `.FIT` scaricabile + istruzioni import Garmin.
- [ ] Export backup JSON/ZIP.

#### 1.7 Review

- [ ] Review settimanale (aderenza, carico, sonno, peso, nutrizione, dolore).
- [ ] Decisioni: continua / progredisci / scarico / test / cambia macro.
- [ ] Rigenerazione micro con contesto completo.
- [ ] Review mensile/fine blocco (anche solo bozza).

#### 1.8 AI

- [ ] BYOK (OpenAI/Anthropic/Google/OpenRouter).
- [ ] Managed free con quota.
- [ ] Prompt versionati + JSON schema.
- [ ] `ai_runs` con token, costo, validazione.
- [ ] Cache per `contextHash`.

#### 1.9 Sicurezza

- [ ] Credenziali cifrate.
- [ ] Log redatti.
- [ ] Rate limit su auth e generazione.
- [ ] Export/cancellazione account.

### Criteri di accettazione

- Uso reale per **14 giorni consecutivi**.
- Almeno **80%** delle sessioni tracciate (device o check-in).
- Garmin e Yazio sincronizzano senza intervento manuale (salvo token scaduti).
- Il piano si adatta almeno una volta a un dato reale (sonno/HRV/dolore/tempo).
- Export Hevy crea una routine valida.
- Export `.FIT` importabile in Garmin Connect.
- Backup esportato e ripristinato su un ambiente pulito.
- Nessun piano viola i vincoli di sicurezza.

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
