# Spike: Zepp / Huami (Peso e composizione corporea)

**Stato:** completato — **No-go web / Rimandato ad Android Health Connect**  
**Data:** 26 ottobre 2026  
**Ambiente:** analisi specifiche community ([`zepp-health-cli`](https://github.com/m4ary/zepp-health-cli))  
**Obiettivo:** valutare la fattibilità dell'estrazione del peso e composizione corporea da bilance Zepp/Amazfit/MiFit.

---

## 1. Analisi Tecnica dell'API non ufficiale

### 1.1 Endpoint
```http
GET https://{host}/users/{userId}/members/-1/weightRecords
Header: apptoken: <app_token>
```

### 1.2 Requisiti di autenticazione
1. Non esiste OAuth pubblico né login standard con username/password via REST senza risolvere captcha e controlli anti-bot.
2. Per ottenere `app_token`, `userId` e l'host geografico (es. `api-mifit-us3.zepp.com`) è necessaria una **cattura proxy HTTPS** dal dispositivo mobile (usando strumenti come Proxyman, Charles o mitmproxy con certificato CA custom installato).
3. La durata dell'`app_token` è stimata in circa 30 giorni, dopodiché la cattura va ripetuta manualmente.

---

## 2. Limiti e Rischi

1. **Fragilità estrema:** Richiedere all'utente di riconfigurare proxy HTTPS ogni 30 giorni degrada l'esperienza utente a un livello inaccettabile.
2. **Violazione ToS & Rischio ban:** Mancando qualsiasi contratto formale o developer portal, le modifiche agli endpoint o alle chiavi di firma non offrono preavviso.
3. **Ridondanza:**
   - Il peso corporeo è già sincronizzato con successo in `metrics_daily` dall'integrazione con **Yazio v22**.
   - Per gli utenti Android (Fase 3), l'app Zepp scrive nativamente il peso in **Android Health Connect**, che fornisce una sorgente locale-first, stabile e conforme ai permessi di sistema senza necessità di proxy o token non ufficiali.

---

## 3. Verdetto

- **Web (Fase 0/1):** **No-go**. Non implementare l'adapter server-side con proxy token. Il dato del peso arriva da Yazio o da inserimento manuale.
- **Android (Fase 3):** **Go via Health Connect**. La lettura avverrà tramite API di sistema Android (`READ_WEIGHT`), che raccoglierà automaticamente i dati scritti da Zepp Life/Zepp sul telefono.
