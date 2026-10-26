# Spike: Yazio (API non ufficiale)

**Stato:** implementazione pronta, **test reale in attesa di credenziali** (26 ottobre 2026)  
**Obiettivo:** verificare login, riepilogo nutrizionale, peso e stabilità dell'API non ufficiale.

## Prerequisiti

- Account Yazio attivo
- Nessun 2FA bloccante (o gestione manuale)
- Credenziali in `secrets/yazio.json` (ignorato da git):

```json
{
  "email": "la-tua-email",
  "password": "la-tua-password"
}
```

In alternativa: `YAZIO_EMAIL` e `YAZIO_PASSWORD` in `.env`.

## Comandi

```bash
npm run spike:yazio
npm run spike:yazio -- --write   # salva docs/spikes/yazio.local.json (ignorato da git)
```

Il client prova prima `v15`, poi `v20` se il token endpoint non è disponibile. Il report indica quale versione ha risposto.

## Cosa verificare

| Check | Atteso | Esito |
|---|---|---|
| Login | 200, token + refresh | |
| Versione API | v15 o v20 | |
| `GET /user` | 200 | |
| Daily summary oggi | 200 | |
| Daily summary ieri | 200 | |
| `meals.*.nutrients` | presenti e sommati | |
| `goals` | kcal/macro/acqua/passi | |
| `water_intake` / `steps` | presenti | |
| Peso | valore o null | |
| Consumed items | prodotti/ricette/simple products | |
| Rate limit | nessun 429 nel run | |
| 2FA | nessun blocco | |

## Campi attesi

Dal client/reference:

```text
/user/widgets/daily-summary
  activity_energy, consume_activity_energy, steps, water_intake
  goals { "energy.energy", "nutrient.protein", "nutrient.carb", "nutrient.fat", water, "activity.step" }
  units { unit_mass, unit_energy, unit_serving, unit_length }
  meals { breakfast|lunch|dinner|snack { energy_goal, nutrients { ... } } }
  user { start_weight, current_weight, goal, sex }

/user/bodyvalues/weight/last
  { id, date, value, external_id, gateway, source }
```

## Rischi

- API **non ufficiale**: può cambiare o violare i ToS.
- Credenziali email/password: vanno cifrate e mai loggate.
- 2FA / captcha possono bloccare il login.
- Rate limit sconosciuti.
- Il token dura ~48h; serve refresh.
- La versione API può cambiare (v15 → v20).

## Verdetto

- [ ] Go
- [ ] Go con workaround
- [ ] No-go

Motivazione:

## Prossimo passo

- Se **go**: attivare il sync Yazio in background e usare i macro nel contesto del coach.
- Se **no-go**: fallback manuale (macro giornalieri) e peso da Zepp/Garmin/manuale.
