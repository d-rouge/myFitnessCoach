# Spike — template e registro

Questa cartella contiene i risultati **reali** degli spike della Fase 0. Un documento per provider, con risposte salvate (redatte), verdetto e rischi.

Non scrivere assunzioni: se un endpoint non è stato chiamato, non è verificato.

## Template

````md
# Spike: <provider>

- Data:
- Ambiente: (OS, Node, rete)
- Account/credenziali usate: (tipo, non valori)
- Obiettivo:

## Cosa ho provato

1. ...
2. ...

## Risposte reali (redatte)

```json
{ "esempio": "..." }
```

## Mapping verso il modello canonico

| Campo provider | Campo canonico | Note |
|---|---|---|
| ... | ... | ... |

## Limiti osservati

- Rate limit:
- Scadenze token:
- Campi mancanti:
- Errori:

## Verdetto

- [ ] Go
- [ ] Go con workaround
- [ ] No-go

Motivazione:

## Rischi e fallback

- ...

## Da fare in implementazione

- ...
````

## Registro

| Spike | Documento | Stato | Verdetto |
|---|---|---|---|
| Garmin Personal | [`garmin.md`](garmin.md) | completato (dati reali) | **Go con workaround** |
| Garmin `.FIT` export | [`garmin-export.md`](garmin-export.md) | completato (generazione + decodifica) | **Go** |
| Yazio | [`yazio.md`](yazio.md) | completato (dati reali) | **Go** |
| Zepp | [`zepp.md`](zepp.md) | completato (analisi API) | **No-go web / Rimandato ad Android HC** |
| Hevy | [`hevy.md`](hevy.md) | completato (analisi API/OpenAPI) | **Go con prerequisito Hevy Pro** |

## Regole

- Rimuovi token, email, ID account e dati personali dai JSON salvati.
- Salva solo ciò che serve a testare il mapping.
- Se un provider cambia comportamento, aggiorna il documento e il test di contratto.
