# FIT: lettura, interpretazione e brief per l'LLM

**Scopo:** trasformare un file `.FIT` binario in dati strutturati e in un brief compatto che un LLM possa usare senza ricevere migliaia di record grezzi.

## Perché serve un layer intermedio

Un `.FIT` non è testo: è un formato binario con messaggi (`session`, `lap`, `record`, `length`, `set`, `event`, …). Un LLM non può leggerlo in modo affidabile. La pipeline è quindi:

```
ZIP / .FIT
   ↓  fit-file-parser
messaggi FIT strutturati
   ↓  normalizzazione + aggregazione
ActivityAnalysis (summary, laps, splits, zone, derived)
   ↓  buildActivityBrief
brief compatto (Markdown/JSON) + summary
   ↓
contesto LLM
```

I record a 1 Hz (migliaia) **non vengono inviati** al modello: servono solo per calcolare aggregati e anomalie.

## Cosa estraiamo

| Blocco FIT | Uso |
|---|---|
| `sessions` | sport, durata, distanza, HR, potenza, cadenza, dislivello, calorie, training effect/load |
| `laps` | split distance-based (su Garmin running: 1 km), HR, potenza, passo, dislivello |
| `splits` | split automatici run/walk; filtriamo walk/stand e l’intera attività |
| `records` | solo per deriva HR e fallback zone; non salvati nel brief |
| `time_in_zone` | minuti in zona HR |
| `activity_metrics` | VO2max, recovery time, training effect |
| `lengths` | vasche nuoto (estensione futura) |
| `sets` | serie palestra (estensione futura) |

## Normalizzazione

- `sessions` è un array; `session` singolare non è affidabile.
- I timestamp sono `Date`; convertiamo in ISO.
- La cadenza running nel FIT è in cicli/min: la portiamo a **passi/min** (`×2`).
- Per la corsa preferiamo i **lap da 1 km** agli split automatici run/walk.
- Escludiamo split con distanza troppo piccola, durata < 60 s o pari all’intera attività.
- Le zone HR vengono da `time_in_zone` (`reference_mesg=session`); se assenti, fallback approssimativo dai record.

## Cosa contiene il brief

Esempio sintetico:

```md
## Attività
- Sport: running
- Data: 2026-10-25
- Durata: 45m 0s
- Distanza: 10.00 km
- Passo medio: 4:30/km
- HR: 165 / 182 bpm
- Cadenza: 176 spm
- Dislivello: +40 / -35 m
- Calorie: 720 kcal
- Training effect: 4.2 (anaerobico 0.8)

## Split
| # | distanza | tempo | passo | HR |
|---|---|---|---|---|
| 1 | 1.00 km | 4:38 | 4:38/km | 158 |
| 2 | 1.00 km | 4:32 | 4:32/km | 164 |
| ... | ... | ... | ... | ... |

## Zone HR
Z1: 1 min · Z2: 5 min · Z3: 12 min · Z4: 20 min · Z5: 7 min

## Osservazioni
- Negative split: sì
- Variabilità passo: 2.1%
- Deriva HR: +3.4%
- Miglior split: 4:25/km
- Peggiore split: 4:41/km
- Dislivello per km: 4.0 m/km
```

Il brief è pensato per essere:
- **compatto**: ~1–3 KB, non 17.000 record;
- **strutturato**: sezioni stabili, facili da citare;
- **spiegabile**: l’LLM può usare i numeri senza inventarli;
- **non diagnostico**: descrive l’allenamento, non formula diagnosi.

## API e persistenza

```text
POST /api/integrations/garmin/activities/:activityId/analyze
GET  /api/integrations/garmin/activities/:activityId/analysis
```

- `analyze` scarica lo ZIP dell’attività da Garmin, estrae il `.FIT`, lo parsa, salva `ActivityAnalysis` e restituisce la versione compatta (`summary`, `derived`, `hrZones`, `brief`, conteggi).
- Collezione Mongo: `activity_analyses` (unique `userId+source+externalId`).
- UI: pulsante **Analizza FIT** su ogni attività Garmin; il brief è espandibile.

## Validazione reale

Su un’attività Garmin reale:

- FIT ~1,3 MB
- 17.492 record
- 44 lap
- 42 split utilizzabili
- 25 messaggi `time_in_zone`
- brief finale ~2 KB, senza record grezzi
- deriva HR, negative split, variabilità passo e miglior/peggior split calcolati

## Limiti attuali

- Nuoto: parsing dei `lengths` non ancora esposto nel brief.
- Palestra: `sets` non ancora normalizzati.
- GPS/altimetria: usati solo per dislivello, non per analisi di percorso.
- Zone HR: dipendono dalla configurazione del dispositivo.
- Split: la scelta lap vs split è euristica per sport.
- Non sostituisce un’analisi biomeccanica o clinica.

## Prossimo passo

1. Aggiungere `lengths` per il nuoto e `sets` per la palestra.
2. Iniettare i brief delle ultime attività nel contesto del coach.
3. Solo dopo, generare workout `.FIT` per l’export verso Garmin usando il FIT SDK encoder.
