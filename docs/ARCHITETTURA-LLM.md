# Architettura LLM

Documento di riferimento per la parte del progetto che risponde a una domanda:
**chi decide il piano, e con quale autorità?**

Stato: **proposta approvata nelle discussioni del 27 ottobre 2026, non ancora
implementata.** Il codice attuale è descritto in §1 e non corrisponde ancora a
questo disegno.

---

## 0. Perché esiste questo documento

Un LLM generalista sa già scrivere un piano di allenamento. Quello che non sa
fare è **essere sul pezzo**: non conosce la storia dell'atleta, non legge
Garmin, non ricorda che tre settimane fa il volume ha sfondato, non sa che la
settimana scorsa due sedute sono state saltate.

Il valore del progetto non è quindi "un LLM che pianifica". È:

1. **contesto** — un dossier atleta compilato da dati reali, non da un form;
2. **memoria** — cosa è stato prescritto, cosa è stato fatto, cosa è stato
   riferito;
3. **validazione** — qualcuno che contesti la proposta prima che diventi un
   piano eseguito.

Senza questi tre pezzi l'LLM produce piani plausibili e generici. Con questi tre
pezzi produce piani che nessun chatbot può produrre.

---

## 1. Stato attuale (onesto)

| Pezzo | Stato |
|---|---|
| Generazione del piano | **deterministica**, `packages/domain/src/rules/plan-generator.ts` |
| Validazione | deterministica, `rules/validator.ts` (il generatore valida il proprio output e lancia se viola) |
| Contesto recente | calcolato, `rules/recent-context.ts` (gara/sforzo lungo, ACWR, gap) |
| Capacità e tier | calcolati, `rules/capacity.ts` e `rules/experience.ts` |
| LLM | **DeepSeek cablato**: `DeepSeekProvider` (JSON mode, thinking, errori `retryable`). `LLM_MODEL=deepseek-v4-pro`, `LLM_MODEL_FAST=deepseek-flash`. Senza chiave resta `DeterministicCoachProvider` |
| Memoria dei piani | solo i documenti salvati: nessuna sintesi usata nelle generazioni successive |
| `ai_runs` | salva metadati e i fallimenti (`success: false`), **non** il payload né il verdetto |
| Coach (narrazione) | **DeepSeek attivo**: riceve `recentContext`, cita gara recente, finestra di recupero e ACWR |

Conseguenza: oggi il piano è corretto rispetto ai vincoli ma rigido, e la
conoscenza metodologica vive nelle regole scritte a mano. Il documento
[`MODELLO-ATLETA.md`](MODELLO-ATLETA.md) descrive i tre livelli già implementati
(storia, capacità misurata, contesto recente).

---

## 2. Il problema che stiamo risolvendo

Quattro difetti che una singola chiamata "obiettivo + età + peso" non può
evitare:

| Difetto | Esempio reale |
|---|---|
| **Context starvation** | il modello non sa che due giorni fa c'è stata una maratona e propone una settimana di carico |
| **Assenza di memoria** | alla settimana 5 ha dimenticato il metodo scelto alla settimana 1 e riparte da zero |
| **Nessuna risposta individuale** | non sa che la soglia prescritta produce RPE 9 invece di 7, e continua a prescriverla |
| **Nessuna coerenza tra prescritto e fatto** | non sa che metà delle sedute vengono saltate, quindi il volume reale è la metà di quello pianificato |

Questi quattro punti sono **dati**, non prompt. Per questo la prima cosa da
costruire non è un agente: è il dossier.

---

## 3. Decisioni

### D1 — Nessun agente autonomo. Pipeline fissa con ruoli di ragionamento

Un agente che decide quali tool chiamare sposta il non determinismo nella fase
di **raccolta dati**, che è esattamente la fase che deve essere affidabile.

- Raccolta, calcolo e compilazione del dossier: **codice deterministico**.
- Ragionamento su metodo, envelope e sessioni: **LLM**.
- Controllo di coerenza: **codice**.

L'autonomia sta nel ragionamento, non nel retrieval. Lo stesso input produce
sempre lo stesso dossier; solo il piano è non deterministico, ed è l'unica cosa
che vogliamo flessibile.

### D2 — L'envelope è un **output**, non un input

La formulazione precedente ("il motore calcola i vincoli, l'LLM sceglie dentro i
vincoli") è stata **respinta**. Il motivo è concreto: la durata dello scarico
post-maratona, la ripartenza della palestra, il taper, la distribuzione
dell'intensità sono conoscenza contesa e dipendono dall'atleta. Codificarli in
costanti significa congelare un'opinione e nasconderla nel codice.

Nuova formulazione:

```
Proposer  → dichiara metodo + envelope + piano + motivazione
Critic    → attacca metodo ed envelope (troppo corto? incoerente col piano?)
Referee   → verifica che il piano rispetti l'envelope dichiarato (aritmetica)
```

L'envelope diventa un artefatto versionato, con motivazione e alternative
scartate. Il Critic può contestarlo. Il Referee non sa nulla di allenamento:
confronta due documenti.

### D3 — Il Referee resta codice, e contiene solo ciò che non è conoscenza

| Cosa verifica | Perché è codice |
|---|---|
| sedute ≤ giorni disponibili | aritmetica |
| minuti ≤ finestra oraria dichiarata | aritmetica |
| date coerenti, nessuna seduta nel passato | aritmetica |
| piano coerente con l'envelope dichiarato (giorni, RPE massimo per modalità) | confronto tra due documenti |
| nessuna sovrapposizione di sedute | aritmetica |

**Non** contiene: durate di recupero, percentuali di progressione, distribuzione
dell'intensità, scelta del metodo. Quella è materia del Proposer e del Critic.

Motivazione: due modelli dello stesso tipo condividono i blind spot, quindi
"due agenti d'accordo" non è una prova. Un controllo aritmetico costa zero e non
sbaglia mai a contare.

### D4 — Il generatore a regole sopravvive come piano di sicurezza

Non viene cancellato. Retrocede a **fallback** quando Proposer e Critic non
convergono entro il numero massimo di revisioni. Il suo ruolo smette di essere
"il cervello" e diventa "il default prudente".

### D5 — La memoria è fatti derivati, non cronologia di chat

Si salvano e si riusano: cosa è stato prescritto, cosa è stato completato, RPE
e dolore riportati, aderenza, variazioni di capacità. Non si passa al modello la
conversazione precedente: si passa una sintesi compatta e stabile.

---

## 4. Ruoli

| Ruolo | Input | Output | Autorità |
|---|---|---|---|
| **Proposer** | dossier atleta + libreria dei metodi | metodo scelto, envelope per modalità, macro-piano, micro-piano, motivazione, alternative scartate | propone |
| **Critic** | dossier + proposta + rubrica esplicita | verdetto strutturato: approvato / violazioni con evidenza e correzione richiesta | respinge, non riscrive |
| **Referee** | piano + envelope dichiarato | incoerenze aritmetiche e di disponibilità | blocca |
| **Reviewer** (fase successiva) | settimana eseguita, check-in, review precedente | conferma o modifica del metodo per la settimana dopo | propone |
| **Daily Adjuster** (fase successiva) | stato del giorno, sessione prevista | adattamento del giorno | propone, entro l'envelope |

Nessun ruolo scrive direttamente sul piano pubblicato. La scrittura avviene solo
dopo Referee verde, e le modifiche strutturali richiedono conferma dell'utente.

---

## 5. Envelope

### 5.1 Forma

Per **modalità**, non per sport intero. Esempio di output del Proposer:

```json
{
  "trainingModel": {
    "name": "polarizzato",
    "why": "8 settimane, base aerobica presente, 3 giorni disponibili",
    "alternatives": ["piramidale", "soglia 2x/settimana"]
  },
  "envelope": {
    "runningImpact": {
      "chosenDays": 12,
      "minDays": 5,
      "maxDays": 21,
      "basis": "6 maratone corse, 8 anni, 60 km/settimana pre-gara",
      "intensityAllowed": false
    },
    "strengthUpper": { "chosenDays": 2, "minDays": 1, "maxDays": 3, "basis": "nessun vincolo specifico" },
    "strengthLowerHeavy": { "chosenDays": 10, "minDays": 7, "maxDays": 21, "basis": "eccentriche pesanti post-maratona" },
    "mobility": { "chosenDays": 0, "basis": "nessuna controindicazione" }
  },
  "revision": 1,
  "review": { "verdict": "approved", "criticModel": "..." }
}
```

### 5.2 Cosa è stato dichiarato sbagliato

L'implementazione attuale usa una costante globale in
`packages/domain/src/rules/recent-context.ts`:

```ts
{ applies: (a) => a.sport === "running" && (a.distanceM >= 40_000), days: 21 }
```

e `sessionPolicy()` applica la stessa policy a **tutti** gli sport, quindi nella
finestra anche la palestra viene limitata a RPE 6 e 40 minuti.

Due errori riconosciuti:

1. **21 giorni per chiunque.** La letteratura propone finestre, non costanti: la
   durata dipende da esperienza, numero di gare, esecuzione della gara, volume
   pre-gara, età, sonno. Per un amatore avanzato è troppo conservativo.
2. **Scarico = niente allenamento.** Falso. Il lavoro upper body è utile e
   consentito; sono l'impatto ripetuto e le eccentriche pesanti a essere
   controindicati nei primi giorni. Lo scarico è **per modalità**, non globale.

### 5.3 Come si decide la durata

| Segnale | Effetto |
|---|---|
| storia (gare corse, anni, volume pre-gara) | sposta l'intervallo `min/tipico/max` |
| esecuzione della gara (passo, split, crampi) | sposta la scelta dentro l'intervallo |
| check-in: dolore, indolenzimento, sonno, RPE a parità di passo | possono **allungare** la finestra |
| check-in: nessun sintomo, RPE in linea | possono **accorciarla**, prima della scadenza |

La finestra non è una data di calendario: è una condizione, con una data come
promemoria.

---

## 6. Dossier atleta

Contenuto minimo perché il modello sia "sul pezzo". I token sono indicativi.

| Blocco | Contenuto | Token |
|---|---|---|
| `identity` | età, sesso, altezza, peso, fuso, unità, tono | 100 |
| `history` | per sport: livello raggiunto, anni regolari, mesi di stop | 200–400 |
| `capacity` | settimane attive, sedute/sett., uscita più lunga, 5k stimato, fonte e data | 150 |
| `recent_context` | ultima gara/sforzo lungo, giorni trascorsi, carico 7/28 gg, ACWR, gap | 200–300 |
| `individual_response` | RPE prescritto vs riportato (4 settimane), aderenza reale, dolore ricorrente | 200–300 |
| `constraints` | giorni e finestre reali, attrezzatura, infortuni, red flag, PAR-Q | 150–250 |
| `method_memory` | metodo in corso, fase del macrociclo, cosa ha funzionato e cosa no | 300–500 |
| `plan_history` | ultime 4–6 settimane: prescritto sintetico vs completato | 400–700 |
| `trend` | aggregati 7/28 giorni (sonno, RHR, HRV, peso, nutrizione) | 300–500 |
| `methodology` | estratto della libreria dei metodi rilevante per sport/obiettivo/fase | 500–1.000 |
| `output_contract` | JSON schema + regole di stile | 300–600 |

Totale indicativo: **3.000–5.000 token** per una settimana, **8.000–14.000** per
un macrociclo. Il dossier è compilato da codice, versionato e ispezionabile: se
il piano è sbagliato, si può capire se il difetto era nei dati o nel
ragionamento.

---

## 7. Loop

```
[S1] Dossier          deterministico
[S2] Proposer         LLM → proposta + envelope + metodo
[S3] Critic           LLM → verdetto sulla proposta
[S4] Referee          codice → coerenza aritmetica e rispetto dell'envelope
     ├─ verde         → [S5]
     ├─ violazioni    → torna a S2 con le violazioni esplicite (max 2 giri)
     └─ ancora rosso  → fallback al generatore a regole, marcato come tale
[S5] Persist          piano + metodo + envelope + verdetto, con provenance
[S6] Diff             confronto col piano precedente, conferma utente se strutturale
[S7] Explain          spiegazione all'atleta (può essere un ruolo separato, tono diverso)
```

Regole non negoziabili:

- Mai pubblicare un piano senza Referee verde.
- Massimo 2 revisioni, poi fallback: nessun loop aperto.
- Ogni giro è loggato con proposta, verdetto e violazioni.
- Il fallback è **dichiarato** nel piano (`generatedBy: "rules_fallback"`), non
  spacciato per output del modello.

---

## 8. Memoria

| Cosa | Dove | Usato per |
|---|---|---|
| piano prescritto (macro/micro) | `athlete_macro_plans`, `athlete_micro_plans` | continuità del metodo, diff |
| eseguito | `activities`, stato sessione | aderenza reale |
| riferito | `checkins` (RPE, dolore, sonno, motivazione) | risposta individuale |
| review settimanale | `weekly_reviews` | decisione `continue/progress/deload` |
| metodo ed envelope | nel piano (`trainingModel`, `envelope`) | coerenza tra settimane |
| esecuzioni LLM | `ai_runs` (da estendere col payload) | audit e debug |

La sintesi si calcola, non si accumula: ogni generazione ricompila il dossier
dallo stato corrente. È così che la settimana 5 non "dimentica" la 1.

---

## 9. Modifiche allo schema necessarie

| Schema | Aggiunta | Motivo |
|---|---|---|
| `MacroPlan` | `trainingModel: { name, why, alternatives[] }` | dichiarare il metodo, non solo le fasi |
| `MacroPlan` | `envelope` per modalità | rendere l'envelope verificabile e discutibile |
| `MacroPlan` | `review: { verdict, attempts, criticModel }` | sapere se è stato contestato |
| `MacroPlan` | `generatedBy: "llm"` oppure `"rules_fallback"` | non spacciare il fallback per modello |
| `AiRunRecord` | `payload` (proposta/verdetto) o riferimento | oggi salva solo metadati |
| `MicroPlan` | `withinEnvelope: boolean` + violazioni | tracciare i veti |

---

## 10. Valutazione

Non "il piano è bello". Si valuta il **Critic** con casi deliberatamente
sbagliati, e il **Proposer** con scenari noti.

| Scenario | Cosa deve succedere |
|---|---|
| maratona 2 giorni fa, atleta esperto | corsa a impatto ridotta, palestra upper consentita, squat pesante no |
| maratona 2 giorni fa, principiante | finestra più lunga, nessuna intensità |
| rientro dopo 2 anni, ex agonista | niente intensità per 2 settimane, volume ridotto fino alla 4ª |
| 3 giorni disponibili, piano con 5 sedute | Referee blocca |
| metodo dichiarato "polarizzato", piano con 3 sedute di soglia | Critic respinge per incoerenza |
| ginocchio dolorante, piano con impatto ripetuto | Critic respinge |
| aumento di volume > 30% in una settimana | Critic chiede giustificazione o corregge |
| zero attività importate | il flusso non inventa numeri: chiede o usa la calibrazione |

Metriche: veti corretti / veti mancati (falsi negativi sono il rischio serio),
numero medio di revisioni, costo per piano, tempo per piano.

---

## 11. Passi per procedere

### Fase A — Dossier (nessuna chiave API) — **fatta il 27 ottobre 2026**

1. ~~`buildAthleteDossier()`~~ in `packages/domain/src/rules/athlete-dossier.ts`.
2. ~~Test~~ su aderenza, scarto RPE, dolore ricorrente, memoria del piano,
   determinismo e copertura dei campi.
3. ~~`GET /api/athlete/dossier`~~, con `404` quando manca la baseline e
   `warnings` espliciti per i blocchi non misurabili.
4. Un solo percorso: `AthleteService.getContext()` alimenta piano e coach.
   `planMemory.method` è ancora `null`: dipende da `trainingModel` (Fase B).

**Perché per prima:** è il differenziatore, non richiede provider, ed è
verificabile. Migliora anche il piano a regole, che resta in uso.

### Fase B — Schema e provenance

1. Estendere `MacroPlan` con `trainingModel`, `envelope`, `review`,
   `generatedBy` (§9).
2. Migrazione compatibile: i piani esistenti restano validi con campi opzionali;
   `recoveryWindow` resta finché l'envelope non lo sostituisce.
3. Estendere `ai_runs` con il payload della proposta e del verdetto.

### Fase C — Provider e loop

1. ~~`LlmProvider` HTTP reale~~ **fatto il 27 ottobre 2026**: `DeepSeekProvider`
   nativo (formato OpenAI, JSON mode, thinking selezionabile, timeout, errori
   `retryable`). Gli altri provider restano senza client e cadono sul
   deterministico.
2. `PlanProposer` e `PlanCritic` come interfacce; implementazione LLM;
   `RulePlanProposer` come fallback.
3. Referee in codice (§3, D3) + loop con max 2 revisioni.
4. Log completi, `generatedBy` valorizzato, nessun auto-publish.

### Fase D — Valutazione avversariale

1. Script `npm run eval:plans` con gli scenari di §10.
2. Assertion sul Critic: deve respingere i piani sbagliati.
3. Report: falsi negativi prima di qualsiasi altra metrica.

### Fase E — Confronto reale e memoria

1. UI: piano LLM e piano a regole affiancati per 2-3 settimane, con scelta
   dell'utente.
2. Se il divario non è evidente, l'idea non paga: si tiene il generatore a
   regole e si investe altrove.
3. Solo dopo: `Reviewer` e `Daily Adjuster` che usano la memoria per correggere
   il metodo, non solo il carico.

---

## 12. Rischi

| Rischio | Mitigazione |
|---|---|
| Errori correlati tra Proposer e Critic | provider diversi o almeno modelli diversi; prompt avversariale; set di §10 |
| Nessuna ground truth | valutazione avversariale + revisione umana dei primi piani + confronto col piano a regole |
| Non determinismo | salvare proposta e verdetto; ogni piano ricostruibile |
| Costo | 2-3 chiamate per generazione; accettabile per uso personale, da misurare per il test con altri utenti |
| Prompt drift | prompt versionati + eval prima di ogni cambio |
| Envelope troppo permissivo | il Critic ha il compito esplicito di attaccarlo, non di approvarlo |
| Referee percepito come "le regole di prima" | il Referee non contiene conoscenza: se cresce oltre l'aritmetica, è un errore di progetto |

---

## 13. Decisioni aperte

| Decisione | Stato | Default |
|---|---|---|
| Provider e modello per Proposer e Critic | **decisa in parte**: DeepSeek, `deepseek-v4-pro` per la proposta e `deepseek-flash` per il coach. Se il Critic debba usare un modello/provider diverso è ancora aperto | due provider diversi, per decorrelare gli errori |
| Ampiezza della libreria dei metodi iniziale | aperta | 3-4 metodi che l'utente conosce |
| Quando l'LLM diventa default e le regole fallback | aperta | dopo Fase E, con evidenza |
| Persistenza del payload in `ai_runs` vs collezione dedicata | aperta | campo `payload` con limite di dimensione |
| Chi firma la revisione umana dei primi piani | aperta | l'utente, uso personale |

---

## 14. Cosa non fare

- Non lasciare che l'LLM calcoli i numeri derivati dai dati (carico, readiness,
  aderenza): quelli si calcolano e si verificano.
- Non usare la cronologia della chat come memoria: si usa il dossier.
- Non pubblicare un piano senza verdetto.
- Non aprire loop di revisione senza limite.
- Non reintrodurre costanti di allenamento nel Referee (es. "21 giorni"): quella
  è materia del Proposer, contestabile dal Critic.
- Non spacciare il fallback a regole per output del modello.
