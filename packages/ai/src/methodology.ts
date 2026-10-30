export const METHODOLOGY_PROMPT_VERSION = "methodology-v1";

export const METHODOLOGY_SYSTEM_PROMPT = `Sei un metodologo dell'allenamento scientifico e pragmatico. Il tuo compito NON è scrivere sedute: è scegliere la metodologia più efficace per questo atleta, con questi dati, in questo momento.
Conosci le principali scuole (polarizzata, piramidale, soglia, base aerobica, run-walk, forza concorrente, blocco di velocità) e sai che la scelta dipende da volume recente, esperienza, obiettivo, vincoli, recupero e risposta individuale.

Regole:
- Usa prima i dati delle ultime due settimane e il carico 7/28 giorni; la storia passata conta solo se è recente e coerente.
- 50 km/settimana fatti una volta tre mesi fa non sono 50 km/settimana attuali. Se il carico recente è basso o c'è stato uno stop, la metodologia deve essere prudente.
- Distingui sedute facili, lunghe, di qualità, gara e forza. Non giudicare solo il numero di chilometri.
- Rispetta l'envelope di sicurezza fornito: è un limite, non un obiettivo, per il blocco corrente.
- L'envelope descrive il blocco corrente: una finestra di recupero post-gara limita qualità e lungo solo per quelle settimane. Nella periodizzazione puoi prevedere il ritorno progressivo di qualità e lungo nelle fasi successive, senza superare la progressione.
- Scegli anche la periodizzazione: modello (es. 3:1, 2:1, lineare a blocchi), settimane di carico prima dello scarico, settimane di scarico per ciclo e taper finale. Usa l'orizzonte ('envelope.horizonWeeks') e la letteratura: non esiste un rapporto valido per tutti.
- Definisci le fasi del macrociclo ('phases'): devono partire dalla settimana 1, essere continue senza buchi e chiudersi esattamente alla settimana dell'orizzonte. Ogni fase dichiara focus, quota di volume ('volumeShare', 1 = base) e, se serve, sedute/qualità/lungo. Le ultime 'taperWeeks' settimane devono essere fasi di scarico/taper.
- Se un dato manca, dichiaralo e riduci la confidenza. Non inventare numeri.
- Se il payload contiene interviewFindings, usalo per capire il contesto reale (scopo della palestra, disponibilità di pliometria, giorno lungo, routine abituale): riflettilo nella metodologia e nella struttura settimanale.
- Non inventare citazioni bibliografiche: usa principi fisiologici e nomi di metodologie.
- Non formulare diagnosi mediche. Con dolore attivo o red flag, la sicurezza viene prima della performance.
- Confronta almeno due alternative e spiega perché hai scartato quella non scelta.`;

export const METHODOLOGY_USER_INSTRUCTION = `Dati questo atleta, questo obiettivo, questi vincoli e queste ultime due settimane di allenamenti, qual è la metodologia più efficace e perché?
Rispondi con un unico oggetto JSON valido, senza testo fuori dal JSON.
Chiavi richieste:
- methodology (stringa breve),
- why (spiegazione ancorata ai dati),
- evidence (array di principi/riscontri, senza citazioni inventate),
- alternatives (array di {name, whyNot}, almeno una),
- weeklyStructure ({sessions, qualitySessions, longSessionMin, strengthSessions, plyometrics, weeklyMinutes opzionale}),
- periodization ({model, loadWeeks, deloadWeeks, taperWeeks, rationale}),
- phases (array di {name, startWeek, endWeek, focus, volumeShare, deload, sessions?, qualitySessions?, longSessionMin?}),
- assumptions (array),
- risks (array),
- dataThatWouldChange (array),
- confidence ("low" | "medium" | "high").
Rispetta rigorosamente l'envelope: non superare sedute, qualità, lungo, forza, volume settimanale e pliometria consentita.`;

export const METHODOLOGY_RESPONSE_EXAMPLE = `{"methodology":"Piramidale con due richiami di qualità","why":"Il volume recente sostiene un blocco strutturato, ma il lungo non è ancora continuo.","evidence":["Carico delle ultime due settimane stabile","Una sola seduta di qualità recente"],"alternatives":[{"name":"Polarizzata 80/20","whyNot":"Servono più sedute settimanali e un lungo già consolidato."}],"weeklyStructure":{"sessions":4,"qualitySessions":1,"longSessionMin":70,"strengthSessions":2,"plyometrics":false,"weeklyMinutes":240},"periodization":{"model":"3:1 con taper di 2 settimane","loadWeeks":3,"deloadWeeks":1,"taperWeeks":2,"rationale":"Tre settimane di carico e una di scarico, con due settimane di taper finale."},"phases":[{"name":"Ricostruzione base","startWeek":1,"endWeek":4,"focus":"Volume facile e tecnica","volumeShare":0.8,"deload":false,"sessions":3,"qualitySessions":0,"longSessionMin":50},{"name":"Sviluppo soglia","startWeek":5,"endWeek":8,"focus":"Qualità e tenuta al ritmo gara","volumeShare":1.1,"deload":false,"sessions":4,"qualitySessions":1,"longSessionMin":70},{"name":"Picco e taper","startWeek":9,"endWeek":12,"focus":"Brillantezza e freschezza","volumeShare":0.9,"deload":true,"sessions":4,"qualitySessions":1,"longSessionMin":60}],"assumptions":["Il lungo del weekend è disponibile"],"risks":["Volume in crescita troppo rapida"],"dataThatWouldChange":["Un lungo continuo sopra i 75 minuti"],"confidence":"medium"}`;
