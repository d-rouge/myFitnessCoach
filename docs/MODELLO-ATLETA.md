# Modello atleta (v2)

Documento di riferimento per la parte di dominio che risponde a una domanda sola:
**quanto carico posso prescrivere a questa persona, adesso?**

La versione precedente usava un unico campo `profile.experience`
(`beginner | intermediate | advanced`). Era ambiguo e, nel momento in cui lo si
rendeva pesante, pericoloso: "ex agonista fermo da due anni" e "avanzato" non
sono la stessa cosa.

## I tre livelli

### 1. `profile.history` — cosa hai fatto

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

È l'unica parte che va chiesta all'atleta: nessun orologio sa che a 20 anni
facevi 800 metri. Sono due o tre domande, non un interrogatorio.

### 2. `profile.capacity` — cosa sai fare ora

```ts
capacity: {
  activeWeeks: 8,           // settimane consecutive di allenamento attuale
  weeklySessions: 3,        // sedute/settimana fatte davvero nelle ultime 4
  longestRecentSessionMin: 40,
  recent5kSec: null,
  source: "garmin" | "manual" | "calibration",
  asOf: "2026-10-27T10:00:00.000Z",
}
```

Questa è la parte **misurabile**, e ha la precedenza su tutto:

| `source` | Come si ottiene | Effetto |
|---|---|---|
| `garmin` | `estimateCapacityFromActivities()` sulle attività importate. Ricalcolata dal server al salvataggio **e** a ogni generazione di piano. Il client manda solo l'intenzione, mai i numeri. | Carico iniziale misurato. |
| `manual` | L'atleta li digita. | Carico iniziale dichiarato. |
| `calibration` | Non c'è nulla da misurare. | La settimana 1 è un test a RPE 4-5; la capacità viene ri-stimata appena esistono dati. |

Con `garmin` e nessuna attività importata la baseline viene **rifiutata**
(`400`), invece di salvare zeri silenziosi.

### 3. `profile.experienceTier` — derivato, mai chiesto

```ts
experienceTier: "novice" | "returning" | "trained" | "highly_trained";
```

Calcolato da `deriveExperienceTier()` per lo sport dell'obiettivo primario
(quindi **per sport**, non "in generale": un ex nuotatore agonista che inizia a
correre è `novice` nella corsa). Viene ricalcolato a ogni lettura e a ogni
salvataggio; un valore inviato dal client viene sovrascritto.

| Tier | Condizione | Conseguenza |
|---|---|---|
| `novice` | storia < 2 anni **e** `activeWeeks < 12` | nessun lavoro strutturato, volume ridotto |
| `returning` | storia ≥ 2 anni o agonismo, **e** `detrainingMonths ≥ 12` | sessioni tecniche ok, intensità dalla sett. 3, volume ridotto fino alla sett. 4 |
| `trained` | storia ≥ 2 anni **o** `activeWeeks ≥ 12` | progressione standard |
| `highly_trained` | agonismo, nessuno stop, `activeWeeks ≥ 24`, ≥ 3 sedute/sett., uscita ≥ 60 min | progressione in % ridotta, tetto alto |

La regola che tiene insieme tutto:

> **La storia non autorizza il carico iniziale. La storia autorizza la velocità
> di progressione e il tetto raggiungibile.**

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
sia il tier. Le soglie sono in `RECOVERY_RULES`: maratona 21 giorni, mezza 14,
lungo ≥ 15 km 7, gran fondo 100 km 10, sforzo ≥ 150 min 7; una gara riconosciuta
dal titolo porta la finestra ad almeno 14 giorni.

## Confine con l'LLM

Il contesto è **dato di base**, non giudizio. La divisione è netta:

| Deterministico (guardrail) | LLM (narrazione) |
|---|---|
| Finestra post-gara, tetto di volume, RPE massimo, blocco per red flag/PAR-Q | Spiegare *perché*, dare priorità a ciò che conta, adattare tono ed esercizi |
| Derivazione del tier | Raccontare all'atleta cosa significa `returning` |
| Calcolo ACWR, carico acuto/cronico | Collegare i numeri al vissuto ("hai dormito male tre notti") |

L'LLM riceve `RecentContext` + `history` + `capacity` + `tier` come payload
strutturato. Può spiegare, riordinare e motivare. Non può alzare il carico oltre
il guardrail né ignorare la finestra di recupero: se lo facesse, il piano
verrebbe comunque rifiutato dal validator deterministico.

## Cosa non è ancora fatto

- Il feedback loop "settimana di calibrazione → nuova stima" oggi funziona solo
  se arrivano attività Garmin: manca ancora la lettura dei check-in (RPE reale,
  dolore, completamento) per aggiornare `capacity` senza import.
- La persona `returningPersona` esiste come demo, ma non c'è ancora un test e2e
  che parta da attività Garmin reali e verifichi la finestra post-gara end-to-end.
