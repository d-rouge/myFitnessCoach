# Modello atleta (v2)

Documento di riferimento per la parte di dominio che risponde a una domanda sola:
**quanto carico posso prescrivere a questa persona, adesso?**

La versione precedente usava un unico campo `profile.experience`
(`beginner | intermediate | advanced`). Era ambiguo e, nel momento in cui lo si
rendeva pesante, pericoloso: "ex agonista fermo da due anni" e "avanzato" non
sono la stessa cosa.

## Background sportivo generale

`profile.athleteBackground` descrive il passato sportivo della persona **in
generale**, non la sua esperienza nella corsa o nello sport dell'obiettivo:
`occasional | consistent | amateur_competitive | elite | null`.

L'onboarding lo raccoglie con una scelta sola: sportivo saltuario, sportivo
costante per molti anni, ex atleta agonistico o ex atleta di alto livello.
Serve come contesto per descrivere la persona (es. "ex atleta di punta"), non
come misura della forma attuale e non autorizza un carico maggiore. La pratica
attuale arriva da `profile.capacity` e dalle attività Garmin quando disponibili.

## Dati e derivazioni per la prescrizione

### 1. `profile.history` — storico specifico per sport

```ts
history: {
  sports: [
    { sport: "running", level: "competitive", yearsRegular: 12, detrainingMonths: 24 },
  ];
}
```

- `level`: `none | amateur | competitive | elite`.
- `yearsRegular`: anni **cumulati** di pratica regolare, non età.
- `detrainingMonths`: mesi dall'ultimo blocco regolare in **quello** sport.

È un dato sport-specifico mantenuto per compatibilità con i profili esistenti e
con le regole del tier. Il nuovo onboarding non lo chiede: il passato sportivo
generale viene raccolto in `athleteBackground` e non viene trasformato
artificialmente in esperienza nella disciplina dell'obiettivo.

### 2. `profile.capacity` — cosa sai fare ora

```ts
capacity: {
  lastActivityDate: "2026-10-25",
  activeWeeks: 8,           // settimane consecutive di allenamento attuale
  weeklySessions: 3,        // sedute/settimana fatte davvero nelle ultime 4
  longestRecentSessionMin: 40,
  recent5kSec: null,
  recent5kSource: "measured" | "declared",  // assente nei documenti vecchi = measured
  source: "garmin" | "manual" | "calibration",
  asOf: "2026-10-27T10:00:00.000Z",
}
```

Questa è la parte **misurabile**, e ha la precedenza su tutto. `lastActivityDate`
registra la data locale dell'ultima seduta: Garmin la calcola dalle attività,
mentre nel percorso manuale viene raccolta con fasce temporali semplici. Se non
ci sono attività importate, il dossier usa questa data per rilevare un eventuale
periodo di inattività; in presenza di dati importati prevalgono questi ultimi.
Nel wizard, il riepilogo degli ultimi 90 giorni filtra i record con fonte Garmin,
include tutte le discipline e mostra conteggi e durata per sport, oltre alle
singole attività incluse. Le ore sono la somma di `durationSec` ricevuto da Garmin,
non un calcolo del solo tempo in movimento.

| `source` | Come si ottiene | Effetto |
|---|---|---|
| `garmin` | `estimateCapacityFromActivities()` sulle attività importate. Ricalcolata dal server al salvataggio, in lettura (`GET /baseline`) **e** a ogni generazione di piano. Il client manda solo l'intenzione, mai i numeri. | Carico iniziale misurato. |
| `manual` | L'atleta li digita. | Carico iniziale dichiarato. |
| `calibration` | Non c'è nulla da misurare. | La settimana 1 è un test a RPE 4-5; la capacità viene ri-stimata appena esistono dati. |

Con `garmin` e nessuna attività importata la baseline viene **rifiutata**
(`400`), invece di salvare zeri silenziosi.

Il tempo 5K ha una provenienza esplicita. `recent5kSource: "declared"` significa
che l'atleta l'ha inserito (per esempio la race prediction che Garmin Connect
mostra nel suo profilo): è un dato che il server non può ricostruire dalle
attività, quindi `preserveDeclaredFiveK()` lo conserva quando la capacità viene
ricalcolata al salvataggio, in lettura e alla generazione del piano. Un valore
`measured` (o assente) è invece derivato con Riegel dalla corsa di riferimento e
viene aggiornato a ogni sync.

La stessa regola vale per `calibration`: finché non ci sono dati il documento
tiene gli zeri segnaposto, appena arrivano le attività la lettura mostra la
capacità misurata. Un solo punto di verità: `withMeasuredCapacity()`
(`apps/api/src/baseline/measured-capacity.ts`), usato dalla lettura e dalla
generazione del piano.

Le baseline salvate prima della v2 (campo `experience`) vengono normalizzate in
lettura con `source: "calibration"`: i vecchi numeri non sono considerati
affidabili, quindi la prima generazione li ri-stima dalle attività e, se non ce
ne sono, usa la settimana di test.

### 2b. Disponibilità, obiettivo e preferenze

La disponibilità non chiede più minuti né giorni specifici: l'atleta indica
**quanti giorni a settimana** può allenarsi e se ha spazio per una **seduta più
lunga** (fine settimana oppure un giorno scelto). `resolveAvailabilityDays()`
traduce questi due controlli nei giorni concreti usati dal generatore, con
60 minuti per le sedute normali e 120 per quella lunga. I documenti precedenti
restano validi: se manca `daysPerWeek`, viene ricavato da `days`.

Il **tipo di obiettivo** non è più una domanda: `inferGoalType()` lo deduce
dalla descrizione (gara, performance, composizione corporea, forza, abitudine,
salute) e il server riallinea il campo a ogni salvataggio. La descrizione resta
il testo che arriva al modello di pianificazione.

Le preferenze non chiedono più l'orario: l'atleta si allena quando vuole e
quell'informazione non cambia la prescrizione. Restano il tono del coach e le
altre preferenze; il sesto passo del profilo è il **riepilogo**.

### 3. `profile.experienceTier` — derivato, mai chiesto

```ts
experienceTier: "novice" | "returning" | "trained" | "highly_trained";
```

Calcolato da `deriveExperienceTier()` per lo sport dell'obiettivo primario
usando `profile.history` specifico per sport e `profile.capacity`. Il background
generale non modifica il tier. Viene ricalcolato a ogni lettura e a ogni
salvataggio; un valore inviato dal client viene sovrascritto.

| Tier | Condizione | Conseguenza |
|---|---|---|
| `novice` | storia < 2 anni **e** `activeWeeks < 12` | nessun lavoro strutturato, volume ridotto |
| `returning` | storia ≥ 2 anni o agonismo, **e** `detrainingMonths ≥ 12` | sessioni tecniche ok, intensità dalla sett. 3, volume ridotto fino alla sett. 4 |
| `trained` | storia ≥ 2 anni **o** `activeWeeks ≥ 12` | progressione standard |
| `highly_trained` | agonismo, nessuno stop, `activeWeeks ≥ 24`, ≥ 3 sedute/sett., uscita ≥ 60 min | progressione in % ridotta, tetto alto |

La regola che tiene insieme tutto:

> **Il background generale non autorizza il carico iniziale. La capacità attuale
> è il riferimento per partire; lo storico specifico per sport resta un dato
> distinto.**

Il motivo è fisiologico: la memoria motoria e l'economia di movimento tornano in
settimane, tendini e ossa in mesi. Un ex agonista ha il motore pronto e le gomme
secche.

## Contesto recente (quarto livello, non persistito nell'atleta)

`buildRecentContext(activities, { now })` produce fatti strutturati sul passato
immediato:

```ts
{
  lastLongEffort: { label: "maratona", localDate: "2026-10-25", daysAgo: 2, recoveryDays: 21 },
  postRaceRecovery: { active: true, weeks: 3, untilDate: "2026-11-15", reason: "..." },
  load7dMin: 240,
  load28dMin: 900,
  acuteChronicRatio: 1.07,
  flags: ["post_race_recovery", "long_effort_recent"],
}
```

La finestra di recupero viene salvata in `macroPlan.recoveryWindow` e applicata
deterministicamente: **nessuna settimana di carico** finché non scade, qualunque
sia il tier. Dentro la finestra anche la seduta lunga viene declassata: niente
"lungo progressivo", ma corsa facile più corta a RPE 5. Le soglie sono in `RECOVERY_RULES`: maratona 21 giorni, mezza 14,
lungo ≥ 15 km 7, gran fondo 100 km 10, sforzo ≥ 150 min 7; una gara riconosciuta
dal titolo porta la finestra ad almeno 14 giorni.

> **Limite riconosciuto (27 ottobre 2026).** Queste costanti sono un default
> provvisorio, non una verità. Due difetti: (1) 21 giorni valgono per un
> principiante ma sono troppo conservativi per un amatore avanzato, perché la
> durata reale dipende da esperienza, numero di gare, esecuzione e volume
> pre-gara; (2) la policy è globale, quindi nella finestra anche la palestra
> scende a RPE 6, mentre il lavoro upper body è utile e consentito — a essere
> controindicati sono l'impatto ripetuto e le eccentriche pesanti. Lo scarico è
> **per modalità**, non per atleta intero. La sostituzione è descritta in
> [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md) §5.

## Confine con l'LLM

Il contesto è **dato di base**, non giudizio. Ma il confine non passa dove
sembrava il 26 ottobre: la durata dello scarico e la distribuzione
dell'intensità non sono "guardrail", sono **conoscenza contestabile**.

| Codice (deterministico) | LLM (Proposer) | LLM (Critic) | Codice (Referee) |
|---|---|---|---|
| calcolo di capacità, ACWR, aderenza, gap; dossier | metodo, envelope per modalità, piano, motivazione | contesta envelope e coerenza col metodo | aritmetica: sedute ≤ giorni, minuti ≤ finestra, piano vs envelope |
| blocco per red flag / PAR-Q | prior di recupero e taper | verifica che i prior siano difendibili per *questo* atleta | nessuna conoscenza di allenamento |
| derivazione del tier | racconta cosa significa `returning` | verifica che il piano sia coerente col tier | — |

Il punto di svolta: **l'envelope è un output del Proposer**, non un input del
codice. Il Critic lo attacca; il Referee confronta il piano con ciò che il
Proposer ha dichiarato. Così non esiste un "21 giorni" scritto a mano che valga
per tutti. Disegno completo in [`ARCHITETTURA-LLM.md`](ARCHITETTURA-LLM.md).

## Rigenerazione dei piani

Rigenerare il macro-piano **sostituisce** il precedente
(`supersedeMacroPlans`): due piani con la stessa `startDate` renderebbero
`getCurrentMacroPlan` non deterministico, e un piano generato prima di una gara
potrebbe sopravvivere a quello corretto. Il record versionato è la baseline, non
il piano: i piani sono artefatti derivati.

## Cosa non è ancora fatto

- Il feedback loop "settimana di calibrazione → nuova stima" oggi funziona solo
  se arrivano attività Garmin: manca ancora la lettura dei check-in (RPE reale,
  dolore, completamento) per aggiornare `capacity` senza import.
- La persona `returningPersona` esiste come demo, ma non c'è ancora un test e2e
  che parta da attività Garmin reali e verifichi la finestra post-gara end-to-end.
- I contatori usano il fuso della baseline: se l'atleta cambia fuso durante un
  viaggio, la baseline va aggiornata perché il calcolo resti coerente.
- L'envelope per modalità non esiste ancora: è la costante globale descritta
  sopra. Va implementato come output del Proposer (`ARCHITETTURA-LLM.md`).
- `athleteBackground` è incluso nel dossier come contesto; non influenza ancora
  le regole deterministiche di progressione o di carico.
