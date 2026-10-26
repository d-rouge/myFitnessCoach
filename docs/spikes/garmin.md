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

La chiave è stata letta da `secrets/garmin-key.txt` (ignorato da git). Lo script supporta anche `GARMIN_PERSONAL_API_KEY` in `.env`. Nessun token o valore clinico è stato stampato.

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
| Daily summaries | **8 giorni** |
| Body Battery | **8 giorni** |
| RHR / daily heart rate | presente (`restingHeartRate`, media 7 giorni) |
| SpO₂ | oggetto presente |
| Heart rate zones | 3 record |
| Hydration | endpoint OK, 0 record |
| Fitness age | oggetto presente |
| Rate limit osservati | nessuno nel test |
| Tempo totale | ~4,4 s (tutte le metriche) |

### Metriche giornaliere verificate

| Metrica | Endpoint | Record | Campi principali |
|---|---|---|---|
| Daily summary | `/usersummary-service/v2/dailysummaries` | 8 | `calendarDate`, `movement`, `calories`, `heartRate`, `intensityMinutes`, `stress`, `bodyBattery`, `hydration`, `respiration`, `pulseOx` |
| Body Battery | `/wellness-service/wellness/bodyBattery/reports/daily` | 8 | `charged`, `drained`, `bodyBatteryValuesArray`, `bodyBatteryActivityEvent` |
| RHR / HR giornaliera | `/wellness-service/wellness/dailyHeartRate` | oggetto | `restingHeartRate`, `lastSevenDaysAvgRestingHeartRate`, `maxHeartRate`, `minHeartRate`, `heartRateValues` |
| SpO₂ | `/wellness-service/wellness/daily/spo2acclimation/{date}` | oggetto | `averageSpO2`, `lowestSpO2`, `lastSevenDaysAvgSpO2`, `spO2HourlyAverages` |
| Zone HR | `/biometric-service/heartRateZones/v2` | 3 | `zone1Floor..zone5Floor`, `maxHeartRateUsed`, `sport` |
| Idratazione | `/usersummary-service/stats/hydration/daily/{start}/{end}` | 0 | nessun dato |
| Fitness age | `/fitnessage-service/fitnessage/v2/{date}` | oggetto | `chronologicalAge`, `fitnessAge`, `components` |
| Peso | `/weight-service/weight/range/{start}/{end}` | 0 | nessun dato |

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
7. **Il daily summary è un documento ricco e annidato**: `heartRate`, `stress`, `bodyBattery`, `respiration`, `pulseOx`, `hydration`, `intensityMinutes`. È la fonte migliore per `metrics_daily`, con Body Battery e RHR come endpoint separati quando serve il dettaglio.

## Verdetto

**Go con workaround.** Il sync passivo su web con chiave personale funziona. I due workaround (niente `Accept` su token/download, token raw) sono già implementati e coperti da test.

## Impatti sull'implementazione

- [x] Client Garmin con token raw/JSON, cache, retry 401, 429.
- [x] Endpoint attività, sonno, HRV, peso, passi, stress, download.
- [x] Test di contratto (7 test).
- [ ] Mapper canonico attività → `activities`.
- [ ] Mapper daily summary/sonno/HRV/Body Battery/SpO₂/stress → `metrics_daily`.
- [ ] Sync schedulato + cursori.
- [ ] Gestione scadenza chiave e reminder.
- [ ] Verifica rate limit su 24–48h di polling.

## Implementazione successiva

- [x] Mapping canonico attività → `activities` e metriche → `metrics_daily`.
- [x] Sync manuale con upsert idempotente in Mongo.
- [x] Overview API + UI (attività e metriche).
- [ ] Sync schedulato e verifica rate limit su 24–48h.
- [x] Parsing FIT + `ActivityAnalysis` + brief per LLM; vedi `docs/FIT.md`.
- [ ] Salvataggio del `.FIT` originale su object storage.
- [ ] Export workout `.FIT` verso Garmin Connect.

**Prossimo:** export workout `.FIT` verso Garmin Connect.

## Privacy

- `docs/spikes/garmin.local.json` è ignorato da git.
- Non sono stati salvati token, nome, email, ID account o coordinate.
- Il file `secrets/garmin-key.txt` è ignorato da git e non è stato committato.
