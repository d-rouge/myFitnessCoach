# Metodologia scelta dall'LLM

## Principio

La scelta della metodologia di allenamento è una decisione del modello, non di
una tabella deterministica. L'LLM conosce la letteratura e le scuole
(polarizzata, piramidale, soglia, run-walk, forza concorrente, ecc.) e va
interrogato con un criterio esplicito:

> Dati questo atleta, questo obiettivo, questi vincoli e queste ultime due
> settimane di allenamenti, qual è la metodologia più efficace e perché?
> Confronta almeno due alternative, dichiara le assunzioni, i rischi e quali
> dati cambierebbero la risposta.

La domanda va ripetuta durante l'avanzamento del piano: all'inizio, alla
revisione settimanale e ogni volta che cambia un dato rilevante (gara, dolore,
aderenza, carico, obiettivo). Con più dati la personalizzazione diventa più
evidente, non più rigida.

Il livello deterministico non decide la metodologia. Serve a:

- calcolare i fatti (volumi, carichi, ACWR, recupero, tipi di seduta);
- applicare i guardrail di sicurezza;
- verificare l'aritmetica e i limiti della proposta;
- generare le sedute una volta approvata la metodologia.

## Dati che l'LLM deve ricevere

- profilo, obiettivo, data target, esperienza, capacità attuale;
- `trainingHistory` delle ultime due settimane: sedute, sport, tipo, durata,
  distanza, passo, HR, training effect, carico, titolo;
- sintesi: sedute per sport, easy/lungo/qualità/gara/forza, quota intensa,
  seduta più lunga, trend vs le due settimane precedenti;
- `recentContext`: carico 7/28 giorni, ACWR, recupero post-gara, flag;
- piano corrente e review, se si sta rigenerando;
- aderenza, RPE, dolore, readiness;
- vincoli, attrezzatura, disponibilità, preferenze.

## Output atteso

```json
{
  "methodology": "polarized_80_20",
  "why": "…",
  "evidence": ["principio fisiologico", "riscontro nei dati"],
  "alternatives": [{ "name": "pyramidal", "whyNot": "…" }],
  "weeklyStructure": {
    "sessions": 4,
    "qualitySessions": 2,
    "longSessionMin": 75,
    "strengthSessions": 2,
    "plyometrics": false
  },
  "assumptions": ["…"],
  "risks": ["…"],
  "dataThatWouldChange": ["…"],
  "confidence": "medium"
}
```

Regole:

- niente citazioni bibliografiche inventate: si citano principi e nomi di
  metodologie, non paper fittizi;
- niente numeri fuori dall'envelope calcolato dal dominio;
- se un dato manca, va dichiarato, non riempito;
- la sicurezza (red flag, dolore acuto, post-gara) non è negoziabile.

## Flusso ricorrente

1. Il dominio costruisce il contesto e l'envelope di sicurezza.
2. L'LLM riceve contesto + domanda + envelope e sceglie la metodologia.
3. Il dominio valida la proposta (aritmetica, tetti, sicurezza).
4. Se valida, il generatore produce il piano con quella struttura.
5. Alla review settimanale, con i nuovi dati, la stessa domanda viene posta di
   nuovo: confermare, adattare o cambiare metodologia.

## Perché non una tabella fissa

Una tabella può tradurre “50 km/settimana” in “polarizzata” ma non sa
distinguere un atleta che corre 50 km da dieci anni da uno che li ha fatti una
volta tre mesi fa, né leggere il tipo di sedute, il dolore, l'aderenza o la
risposta individuale. L'LLM può farlo, a patto che i fatti siano calcolati e i
limiti siano verificati.

### Orizzonte e periodizzazione

L'orizzonte del piano deriva dalla data target concordata (o da quella della
baseline). In intervista l'LLM può proporre una data più realistica e, dopo la
conferma dell'atleta, la data viene salvata nella baseline: il piano e la
scheda obiettivo leggono lo stesso orizzonte.

L'LLM sceglie anche la periodizzazione (`periodization`): modello, settimane di
carico prima dello scarico, settimane di scarico per ciclo e taper. Il
generatore applica quella struttura alle settimane (`3:1`, `2:1`, blocchi,
ecc.). La struttura settimanale della metodologia vale per il primo blocco:
la finestra di recupero se è attiva, altrimenti il primo mesociclo
(carico + scarico). Dopo, la settimana riprende la progressione della fase,
mentre il ritmo carico/scarico della periodizzazione continua. Se la
metodologia è di recupero post-gara, vale solo per quella finestra.

## Intervista e generazione

Il pulsante "Parla col coach" apre un'intervista, non un generatore immediato.

1. `POST /api/plan/interview` crea l'intervista e fa il primo turno. Il modello
   riceve il dossier (ultime due settimane comprese) e fa al massimo due
   domande mirate.
2. `POST /api/plan/interview/:id/message` aggiunge la risposta, aggiorna i
   `findings` e prosegue. L'intervista si chiude quando il modello dichiara
   `readyToPlan` o dopo 6 risposte.
3. `POST /api/plan/interview/:id/generate` rivaluta la metodologia **con i
   findings raccolti**, poi genera il piano con quella struttura.

Il piano generato conserva la metodologia (`macroPlan.methodology`) e la
settimana porta il flag `methodology_guided`. Se l'obiettivo cambia, la
metodologia precedente non viene riusata: serve una nuova analisi/intervista.

Una metodologia scelta dentro la finestra post-gara vale solo per quella
finestra (`applyThroughWeek`): dopo, la settimana riprende qualità, lungo e
volume dalla fase del macrociclo. Altrimenti un recupero di 3 settimane
condannerebbe tutto il piano a restare in recupero.

Limite attuale: i findings influenzano la struttura (sedute, qualità, lungo,
forza, pliometria) tramite la metodologia, ma il giorno lungo resta quello
della disponibilità in baseline. Spostarlo in base alla risposta dell'atleta è
il prossimo affinamento.

## MVP

1. `trainingHistory` (fatto: ultime 2 settimane con tipo e trend).
2. Endpoint/servizio che interroga l'LLM con il contesto e salva la
   `MethodologyDecision`.
3. Intervista a domande fisse per raccogliere i dati mancanti.
4. Generazione del piano dalla metodologia scelta, con validazione.
5. Rivalutazione alla review settimanale.
