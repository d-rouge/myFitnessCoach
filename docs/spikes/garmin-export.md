# Spike: Garmin Workout Export (.FIT)

**Stato:** completato — **Go**  
**Data:** 26 ottobre 2026  
**Ambiente:** macOS, Node 25, `@garmin/fitsdk`  
**Obiettivo:** verificare la generazione di un file binario `.FIT` valido di tipo workout, compatibile con Garmin Connect e con i dispositivi Garmin per l'esecuzione di allenamenti strutturati.

---

## 1. Perché `.FIT` e non API

La **Garmin Personal API** è un'API di sola lettura (pull). Per inviare workout strutturati senza dover aderire al programma aziendale Garmin Developer Startup/Enterprise (Training API), la via supportata e affidabile è generare file binari `.FIT` di tipo `workout` che l'utente può:
1. Importare via web su **Garmin Connect** (`Allenamento e pianificazione > Allenamenti > Importa`).
2. Oppure copiare direttamente via USB nella cartella `Garmin/NewFiles/` di qualsiasi orologio o ciclocomputer compatibile.

---

## 2. Struttura del file FIT Workout

Il file binario generato implementa le specifiche FIT ufficiali tramite l'SDK `@garmin/fitsdk`:

1. **`FILE_ID` (MesgNum 0)**:
   - `type`: `workout` (id 5)
   - `manufacturer`: `garmin` (id 1)
   - `timeCreated`: timestamp UTC
2. **`WORKOUT` (MesgNum 26)**:
   - `sport`: `running` (id 1, o cycling/swimming)
   - `numValidSteps`: numero totale di step definiti
   - `wktName`: nome visualizzato sul dispositivo (es. "5x800m Ripetute")
   - `wktDescription`: descrizione o obiettivo dell'allenamento
3. **`WORKOUT_STEP` (MesgNum 27)** per ogni fase:
   - `messageIndex`: indice sequenziale (0, 1, 2, ...)
   - `wktStepName`: etichetta step (es. "Riscaldamento", "800m Ripetuta", "Ripeti 5x")
   - `intensity`: `warmup` | `interval` | `recovery` | `cooldown` | `rest` | `active`
   - `durationType`:
     - `time`: durata in millisecondi (`durationValue = sec * 1000`)
     - `distance`: distanza in centimetri (`durationValue = meters * 100`)
     - `open`: fino alla pressione del tasto Lap (`durationValue = 0`)
     - `repeatUntilStepsCmplt`: ripetizione di step precedenti (`durationValue = repeatCount`, `targetValue = repeatFromStepIndex`)
   - `targetType`:
     - `open`: nessun vincolo numerico
     - `speed`: target di passo/velocità; `customTargetValueLow` e `customTargetValueHigh` in millimetri al secondo (mm/s, fattore di scala 1000 m/s)
     - `heartRate`: target in zona cardiaca (1..5 in `targetValue`) oppure range bpm in `customTargetValueLow/High`
     - `cadence`: range rpm
     - `power`: range Watt

---

## 3. Test ed Evidenze

### 3.1 Workout di prova: 5×800m Ripetute

- **Step 0:** Riscaldamento 10 min (600s), target Zona FC 2, intensità `warmup`
- **Step 1:** Ripetuta 800m (80.000 cm), target passo 4:15 - 4:35/km (3.636 - 3.921 m/s), intensità `interval`
- **Step 2:** Recupero 200m (20.000 cm), intensità `recovery`
- **Step 3:** Ripeti 5 volte a partire dallo step 1 (`durationType = repeatUntilStepsCmplt`, `repeatSteps = 1`, `durationStep = 5`)
- **Step 4:** Defaticamento 10 min (600s), target Zona FC 1, intensità `cooldown`

### 3.2 Verifica con FIT SDK Decoder

Il file generato da [`encodeWorkoutToFit`](../../packages/integrations/src/fit/workout-encoder.ts) è stato immediatamente validato con il decoder ufficiale Garmin in [`packages/integrations/src/fit/workout-encoder.spec.ts`](../../packages/integrations/src/fit/workout-encoder.spec.ts):

- **Header:** Magic bytes `0x2E 0x46 0x49 0x54` (`.FIT`) a offset 8-11.
- **Dimensione file:** 537 byte.
- **Decoder error count:** `0`.
- **Messaggi decodificati:**
  ```json
  {
    "fileId": { "type": "workout", "manufacturer": "garmin" },
    "workout": { "sport": "running", "numValidSteps": 5, "wktName": "5x800m Ripetute" },
    "steps": [
      { "name": "Riscaldamento", "durationTime": 600, "targetHrZone": 2 },
      { "name": "800m Ripetuta", "durationDistance": 800, "customTargetSpeedLow": 3.636, "customTargetSpeedHigh": 3.921 },
      { "name": "200m Recupero", "durationDistance": 200, "intensity": "recovery" },
      { "name": "Ripeti 5x", "durationType": "repeatUntilStepsCmplt", "repeatSteps": 1, "durationStep": 5 },
      { "name": "Defaticamento", "durationTime": 600, "targetHrZone": 1 }
    ]
  }
  ```

---

## 4. Come Usare / Importare il file

### Opzione A: Download via Web / API
- Endpoint: `GET /api/export/workouts/sample-5x800m.fit`
- Da terminale o browser:
  ```bash
  curl -O 'http://localhost:3000/api/export/workouts/sample-5x800m.fit'
  ```
- Oppure tramite comando script:
  ```bash
  npm run export:workout
  # Genera dist/workouts/5x800m-intervals.fit
  ```

### Opzione B: Importazione in Garmin Connect Web
1. Apri [Garmin Connect Workouts](https://connect.garmin.com/modern/workouts).
2. Clicca su **Importa** accanto a "Crea un allenamento".
3. Trascina o seleziona il file `.fit`.
4. L'allenamento compare tra gli allenamenti salvati, pronto per essere inviato al dispositivo via Garmin Connect Mobile o Garmin Express.

### Opzione C: Copia diretta USB (offline)
1. Collega l'orologio Garmin al computer via cavo USB.
2. Apri la memoria dell'orologio e naviga nella cartella `GARMIN/NewFiles/`.
3. Incolla il file `.fit`.
4. Scollega l'orologio: Garmin elabora automaticamente il file e lo inserisce nella lista allenamenti sul dispositivo.

---

## 5. Verdetto

**Go.** La generazione e decodifica dei workout `.FIT` rispetta al 100% le specifiche del FIT Protocol, non richiede reverse-engineering o librerie instabili ed è pronta per la generazione dinamica dei piani nella Fase 1.
