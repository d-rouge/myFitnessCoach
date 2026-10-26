# Spike: Yazio (API non ufficiale)

**Stato:** completato — **Go**  
**Data:** 26 ottobre 2026  
**API:** `v22` (fallback `v20`)  
**Auth:** `grant_type=password` (account Google con password impostata)

## Obiettivo

Verificare login, riepilogo nutrizionale, peso e stabilità dell'API non ufficiale.

## Login con Google

Yazio supporta il login Google, ma l'API privata espone solo:

- `grant_type=password` (email + password)
- `grant_type=refresh_token`

Con un account Google ci sono due strade:

### A. Impostare una password Yazio

Flusso **Password dimenticata** / impostazione password nell'app Yazio usando la stessa email dell'account Google. Poi:

```json
{ "email": "la-tua-email", "password": "la-tua-password" }
```

**Questa è la strada usata per il test.**

### B. Importare un refresh token

1. Login Google nell'app Yazio.
2. Proxy HTTPS (mitmproxy/Proxyman) sulla risposta di `POST https://yzapi.yazio.com/v22/oauth/token`.
3. Copia `refresh_token`.
4. Salva in `secrets/yazio.json`:

```json
{ "refreshToken": "il-refresh-token" }
```

Il client usa il refresh token per ottenere e rinnovare l'access token.

> Il token è una credenziale: non condividerlo in chat, non committarlo, non loggarlo.

## User-Agent gate

L'API rifiuta con `403 {"error":"version_blocked"}` le richieste con User-Agent non riconosciuto, su tutti gli endpoint tranne il token exchange. Il default del client è:

```text
YAZIO/26.30.1 (com.yazio.ios.YAZIO; build:2607271240; iOS 27.0.0) Ktor
```

Se compare un muro di 403, aggiorna `YAZIO_USER_AGENT`.

## Comandi

```bash
npm run spike:yazio
npm run spike:yazio -- --write
```

## Risultati

| Check | Esito |
|---|---|
| Login | **OK** |
| Versione API | **v22** |
| User-Agent | accettato |
| Health (`GET /user`) | **OK**, 845 ms |
| `nutrients-daily` | 2 giorni nel probe (7 nel sync) |
| Daily summary | presente |
| Peso | presente |
| Goals | presente |
| Consumed items | 2 prodotti |
| Rate limit | nessun 429 |
| 2FA | nessun blocco |

**Sync reale:** 7 giorni di nutrizione, 7 weight entry, 0 errori. Secondo sync idempotente.

## Campi reali

```text
/v22/user/consumed-items/nutrients-daily
  date, energy, carb, protein, fat, energy_goal
  → usato per i macro esatti

/v22/user/widgets/daily-summary
  steps, water_intake, goals, meals, user
  → usato per acqua/passi/obiettivi

/v22/user/goals/unmodified
  "energy.energy", "nutrient.protein", "nutrient.carb", "nutrient.fat",
  water, "activity.step", "bodyvalue.weight"
  → fonte stabile degli obiettivi

/v22/user/bodyvalues/weight/last
  date, value, ...
```

## Scoperte importanti

1. **v22 è la versione corrente.** La v15 del repo `saganos/yazio_public_api` è superata.
2. **User-Agent obbligatorio.** Senza versione app valida: 403 `version_blocked`.
3. **`nutrients-daily` è la fonte giusta per i macro.** Evita di sommare i pasti e i problemi di arrotondamento.
4. **`goals/unmodified` è più stabile del summary.** Il summary può incorporare l'energia attività (es. obiettivo 4943 kcal in un giorno di maratona); il sync usa ora gli obiettivi unmodified.
5. **`weight/last` ripete l'ultimo peso** per ogni data richiesta: non è una storia peso. Per il trend serve un endpoint range o inserimento manuale.
6. **Il diario può essere parziale.** Giorni con poche kcal riflettono ciò che è stato registrato, non il fabbisogno.

## Verdetto

**Go.** Login, macro e peso funzionano; il sync è persistente e idempotente. Restano limiti noti su storia peso e completezza del diario.

## Prossimo passo

- Usare macro e peso Yazio nel contesto del coach.
- Valutare un endpoint range per la storia peso o fallback manuale.
- Aggiungere lo scheduler automatico.

## Privacy

- `docs/spikes/yazio.local.json` è ignorato da git.
- `secrets/yazio.json` è ignorato da git.
- Non sono stati salvati/loggati token o password.
