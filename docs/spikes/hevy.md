# Spike: Hevy (Export Routine Palestra e Import Workout)

**Stato:** completato — **Go con prerequisito Hevy Pro**  
**Data:** 26 ottobre 2026  
**Ambiente:** analisi documentazione ufficiale OpenAPI Hevy ([`api.hevyapp.com/docs/`](https://api.hevyapp.com/docs/))  
**Obiettivo:** verificare l'architettura di esportazione delle schede di allenamento forza su Hevy e il recupero dei log di esecuzione.

---

## 1. Analisi dell'API

Hevy espone un'API REST pubblica (in beta), accessibile con header `api-key: <UUID>`.
La chiave è generabile dal pannello web `https://hevy.com/settings?developer` ed è riservata agli utenti abbonati a **Hevy Pro**.

### 1.1 Endpoint chiave

| Metodo | Endpoint | Funzione |
|---|---|---|
| `GET` | `/v1/exercise_templates` | Catalogo esercizi standard (con id, nome, gruppo muscolare, attrezzo) |
| `POST` | `/v1/exercise_templates` | Creazione di varianti custom se non presenti nel catalogo |
| `POST` | `/v1/routines` | Creazione scheda/routine (titolo, note, esercizi, serie, pesi, ripetizioni, riposo) |
| `GET` | `/v1/routines` | Elenco routine esistenti |
| `GET` | `/v1/workouts` | Elenco allenamenti svolti (con serie effettive e RPE) |

---

## 2. Contratto per l'Export della Scheda

Il payload formalizzato per la creazione di routine è compatibile al 100% con il nostro modello `PlannedSession` di palestra:

```json
{
  "routine": {
    "title": "Full Body A — Settimana 1",
    "folder_id": null,
    "notes": "Focus eccentrica 3 sec, recupero 90s",
    "exercises": [
      {
        "exercise_template_id": "D04AC939",
        "notes": "Riscaldamento progressivo",
        "rest_seconds": 90,
        "sets": [
          { "type": "warmup", "reps": 10, "weight_kg": 20 },
          { "type": "normal", "reps": 8, "weight_kg": 50 },
          { "type": "normal", "reps": 8, "weight_kg": 50 }
        ]
      }
    ]
  }
}
```

Tipi di set supportati da Hevy: `warmup`, `normal`, `failure`, `dropset`.

---

## 3. Strategia di Mapping

1. **Catalogo locale:** Cache locale di `exercise_templates` scaricata periodicamente (o salvata in `hevy_mappings`).
2. **Matching:** Corrispondenza slug esercizio del dominio (es. `barbell_bench_press`) con template ID Hevy.
3. **Fallback:** Se un esercizio non ha corrispondenza diretta, l'adapter chiama `POST /v1/exercise_templates` per registrarlo automaticamente con nome e muscolo target.

---

## 4. Stato Attuale e Verdetto

- **Verdetto:** **Go con prerequisito Hevy Pro**.
- **Prerequisito:** L'utente deve disporre di un account Hevy Pro e configurare `HEVY_API_KEY` in `.env` per l'invio reale.
- **Implementazione pianificata:** L'export effettivo delle routine fa parte del macro-modulo di generazione schede della **Fase 1** (Task 1.6).
