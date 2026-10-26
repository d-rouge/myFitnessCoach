# Spike: Garmin Personal API

**Stato:** in attesa di chiave reale (26 ottobre 2026)  
**Obiettivo:** verificare che il sync passivo su web funzioni con una chiave personale e che i dati necessari siano disponibili.

## Prerequisiti

- [ ] Account Garmin Connect attivo
- [ ] Almeno un'attività e una notte di sonno recenti
- [ ] Chiave personale creata su <https://connect.garmin.com/app/settings/personalApiToken> (scadenza 90 giorni per il test)
- [ ] `GARMIN_PERSONAL_API_KEY` impostata in `.env`

## Comandi

```bash
npm install
npm run build:packages
npm run spike:garmin
```

Per salvare il report redatto:

```bash
npm run spike:garmin -- --write
# → docs/spikes/garmin.local.json (ignorato da git)
```

## Cosa verificare

| Check | Atteso | Esito |
|---|---|---|
| Token exchange | 200, token JWT con `exp` | |
| Validità token | 24h | |
| `GET /userprofile-service/userprofile/settings` | 200 | |
| Attività ultimi 14 giorni | lista non vuota | |
| Sonno | payload presente | |
| HRV | payload presente | |
| Peso (30 giorni) | lista o null | |
| Passi | lista | |
| Stress | lista | |
| Rate limit | nessun 429 nel test | |
| Download `.FIT` | ZIP valido | |

## Campi reali osservati

Compilare dopo il test, senza dati personali:

```json
{
  "activity": {
    "activityId": 0,
    "activityType": {},
    "startTimeLocal": "",
    "duration": 0,
    "distance": 0
  },
  "sleep": {},
  "hrv": {},
  "weight": {}
}
```

## Limiti e comportamenti

- Rate limit osservato:
- Scadenza token:
- Campi mancanti:
- Errori:
- Note su fuso orario/date:

## Verdetto

- [ ] Go
- [ ] Go con workaround
- [ ] No-go

Motivazione:

## Impatti sull'implementazione

- [ ] Il client attuale copre tutti i dati necessari
- [ ] Servono endpoint aggiuntivi
- [ ] Servono trasformazioni sui campi
- [ ] Il polling va ridotto/aumentato
- [ ] Il download `.FIT` funziona

## Prossimo passo

- Se **go**: completare l'adapter canonico e aggiungere il sync schedulato.
- Se **go con workaround**: documentare il workaround e implementarlo.
- Se **no-go**: usare import `.FIT`/`.TCX` manuale e Health Connect su Android.

## Privacy

- Non salvare token, nome, email, ID account o coordinate GPS.
- Salvare solo struttura delle risposte e pochi campi numerici utili al mapping.
- `docs/spikes/garmin.local.json` è ignorato da git.
