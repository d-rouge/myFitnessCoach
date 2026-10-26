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
| Garmin Personal | `garmin.md` | in attesa di chiave reale | — |
| Garmin `.FIT` export | `garmin-export.md` | da fare | — |
| Yazio | `yazio.md` | da fare | — |
| Zepp | `zepp.md` | da fare | — |
| Hevy | `hevy.md` | da fare | — |
| Google Drive backup | `drive.md` | da fare | — |

## Regole

- Rimuovi token, email, ID account e dati personali dai JSON salvati.
- Salva solo ciò che serve a testare il mapping.
- Se un provider cambia comportamento, aggiorna il documento e il test di contratto.
