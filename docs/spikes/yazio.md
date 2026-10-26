# Spike: Yazio (API non ufficiale)

**Stato:** implementazione pronta, **test reale in attesa di credenziali** (26 ottobre 2026)  
**API:** `v22` (fallback `v20`)  
**Obiettivo:** verificare login, riepilogo nutrizionale, peso e stabilità dell'API non ufficiale.

## Login con Google

Yazio supporta il login Google. L'API privata, però, espone solo:

- `grant_type=password` (email + password)
- `grant_type=refresh_token`

Quindi con un account Google ci sono due strade:

### A. Impostare una password Yazio

Prova il flusso **Password dimenticata** / impostazione password nell'app Yazio usando la stessa email dell'account Google. Se Yazio lo consente, puoi usare:

```json
{
  "email": "la-tua-email",
  "password": "la-tua-password"
}
```

### B. Importare un refresh token (consigliato per Google)

1. Apri l'app Yazio e fai login con Google.
2. Con un proxy HTTPS (mitmproxy/Proxyman) cattura la risposta di:
   `POST https://yzapi.yazio.com/v22/oauth/token`
3. Copia il campo `refresh_token`.
4. Salvalo in `secrets/yazio.json` (ignorato da git):

```json
{
  "refreshToken": "il-refresh-token"
}
```

Il client usa il refresh token per ottenere un access token e rinnovarlo. Non serve la password.

> Il token è una credenziale: non condividerlo in chat, non committarlo, non loggarlo. Se viene revocato, rifai la cattura.

## User-Agent gate

L'API rifiuta con `403 {"error":"version_blocked"}` le richieste con User-Agent non riconosciuto, su tutti gli endpoint tranne il token exchange. Il default del client è:

```text
YAZIO/26.30.1 (com.yazio.ios.YAZIO; build:2607271240; iOS 27.0.0) Ktor
```

Se compare un muro di 403, aggiorna `YAZIO_USER_AGENT` con una versione corrente dell'app.

## Comandi

```bash
npm run spike:yazio
npm run spike:yazio -- --write   # salva docs/spikes/yazio.local.json (ignorato da git)
```

## Cosa verificare

| Check | Atteso | Esito |
|---|---|---|
| Auth | password o refresh token | |
| Versione API | v22 (o v20) | |
| User-Agent | nessun `version_blocked` | |
| `GET /user` | 200 | |
| `nutrients-daily` | array con `energy`, `protein`, `carb`, `fat` | |
| Daily summary | 200, goals/water/steps | |
| Peso | valore o null | |
| Consumed items | prodotti/ricette/simple products | |
| Rate limit | nessun 429 nel run | |
| 2FA | nessun blocco | |

## Campi attesi

```text
/v22/user/consumed-items/nutrients-daily?start&end
  [{ date, energy, carb, protein, fat, energy_goal }]

/v22/user/widgets/daily-summary?date=
  activity_energy, consume_activity_energy, steps, water_intake,
  goals { "energy.energy", "nutrient.protein", "nutrient.carb", "nutrient.fat", water, "activity.step" },
  units, meals { breakfast|lunch|dinner|snack { energy_goal, nutrients } },
  user { start_weight, current_weight, goal, sex }

/v22/user/bodyvalues/weight/last?date=
  { id, date, value, external_id, gateway, source }
```

## Rischi

- API **non ufficiale**: può cambiare o violare i ToS.
- Login Google: richiede password impostata o refresh token importato.
- User-Agent gate: la versione app va aggiornata quando Yazio la ritira.
- 2FA / captcha possono bloccare il login.
- Rate limit sconosciuti.
- Token ~48h; il refresh token va conservato e protetto.
- v22 può cambiare senza preavviso.

## Verdetto

- [ ] Go
- [ ] Go con workaround
- [ ] No-go

Motivazione:

## Prossimo passo

- Se **go**: attivare il sync Yazio in background e usare i macro nel contesto del coach.
- Se **no-go**: fallback manuale (macro giornalieri) e peso da Zepp/Garmin/manuale.
