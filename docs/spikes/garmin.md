# Spike: Garmin Personal API

**Stato:** completato — **Go con workaround**  
**Data:** 26 ottobre 2026  
**Ambiente:** macOS, Node 24, rete domestica  
**Chiave:** Garmin Personal API, scadenza 90 giorni (valore non salvato nel repo)

## Obiettivo

Verificare che il sync passivo su web funzioni con una chiave personale e che i dati necessari siano disponibili.

## Comandi

```bash
npm run spike:garmin -- --write --download
```

La chiave è stata passata solo via variabile d'ambiente, leggendola da `secrets/` (ignorato da git). Nessun token o valore clinico è stato stampato.

## Risultati

| Check | Esito |
|---|---|
| Token exchange | **200**, token JWT |
| Validità token | 24h (claim `exp`) |
| Health check (`/userprofile-service/userprofile/settings`) | **OK**, ~1.7 s |
| Attività ultimi 14 giorni | **6** |
| Sonno | presente |
| HRV | presente |
| Peso (30 giorni) | **0 record** |
| Passi (7 giorni) | 8 record |
| Stress (7 giorni) | 8 record |
| Download `.FIT` | **OK**, ZIP 529.432 byte, magic `PK` |
| Rate limit osservati | nessuno nel test |
| Tempo totale | ~2,9 s |

## Campi reali osservati

Solo nomi dei campi, nessun valore personale.

**Profilo:** `displayName`, `preferredLocale`, `measurementSystem`, `timeZone`, `availableTrainingDays`, `preferredLongTrainingDays`.

**Attività:** `activityId`, `activityName`, `startTimeLocal`, `activityType`, `distance`, `duration`, `elapsedDuration`, `movingDuration`, `elevationGain`, `averageSpeed`, `calories`, `averageHR`, `maxHR`, `averageRunningCadenceInStepsPerMinute`, `avgPower`, `normPower`, `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `trainingEffectLabel`, `activityTrainingLoad`, `hrTimeInZone_1..5`, `powerTimeInZone_*`, `fastestSplit_*`, `lapCount`, `manufacturer`.

**Sonno:** `sleepTimeSeconds`, `deepSleepSeconds`, `lightSleepSeconds`, `remSleepSeconds`, `awakeSleepSeconds`, `averageRespirationValue`, `avgSleepStress`, `sleepScores`, `sleepNeed`, `nextSleepNeed`, `sleepStartTimestampLocal`, `sleepEndTimestampLocal`.

**HRV:** `hrvSummary`, `hrvReadings`, `startTimestampLocal`, `endTimestampLocal`, `sleepStartTimestampLocal`, `sleepEndTimestampLocal`.

**Passi:** `calendarDate`, `totalSteps`, `totalDistance`, `stepGoal`.

**Stress:** `calendarDate`, `values`.

## Scoperte importanti

1. **Il token endpoint rifiuta `Accept: application/json`.**
   - Con `Accept: application/json` → **406 NotAcceptableException**.
   - Senza header `Accept` → **200**.
2. **La risposta del token è un JWT in testo, non JSON.**
   - Il client ora accetta sia JWT raw sia JSON (`{ access_token, expires_in }`).
3. **Anche il download attività rifiuta `Accept`.**
   - Con `Accept: application/octet-stream` → 406.
   - Senza header → ZIP valido.
4. **Il peso Garmin è vuoto** per questo account: nessuna bilancia Garmin collegata.
   - Il peso dovrà arrivare da Yazio, Zepp o inserimento manuale.
5. **Il payload attività è molto ricco**: distanza, durata, HR, cadenza, potenza, training effect, zone, split. È più che sufficiente per il coaching.
6. **6 attività in 14 giorni**: dataset piccolo ma sufficiente per il mapping iniziale.

## Verdetto

**Go con workaround.** Il sync passivo su web con chiave personale funziona. I due workaround (niente `Accept` su token/download, token raw) sono già implementati e coperti da test.

## Impatti sull'implementazione

- [x] Client Garmin con token raw/JSON, cache, retry 401, 429.
- [x] Endpoint attività, sonno, HRV, peso, passi, stress, download.
- [x] Test di contratto (7 test).
- [ ] Mapper canonico attività → `activities`.
- [ ] Mapper sonno/HRV/steps/stress → `metrics_daily`.
- [ ] Sync schedulato + cursori.
- [ ] Gestione scadenza chiave e reminder.
- [ ] Verifica rate limit su 24–48h di polling.

## Prossimo passo

1. Implementare il mapping canonico e il sync Garmin schedulato.
2. Aggiungere Yazio per nutrizione e peso.
3. Testare l'export workout `.FIT` verso Garmin Connect.

## Privacy

- `docs/spikes/garmin.local.json` è ignorato da git.
- Non sono stati salvati token, nome, email, ID account o coordinate.
- Il file `secrets/garmin-key.txt` è ignorato da git e non è stato committato.
