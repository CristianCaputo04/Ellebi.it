# Registro delle attività di trattamento — EmmeLù

Documento previsto dall'**art. 30 del GDPR**. Va tenuto aggiornato e mostrato
al Garante se lo chiede. Non si pubblica sul sito: è un documento interno.

| | |
|---|---|
| **Titolare del trattamento** | `{{RAGIONE_SOCIALE}}` — P.IVA `{{PIVA}}` |
| **Sede** | `{{SEDE_LEGALE}}` |
| **Contatti** | ellebi.style@gmail.com — PEC `{{PEC}}` |
| **Responsabile della protezione dei dati (DPO)** | **Non nominato.** Non ricorre nessuno dei casi dell'art. 37.1: non c'è monitoraggio sistematico su larga scala né trattamento di categorie particolari su larga scala. |
| **Ultimo aggiornamento** | 12 settembre 2026 |

> **Stato attuale: nessun trattamento è ancora attivo.** Il negozio è spento
> (`NEGOZIO_ATTIVO=0`) in attesa dell'apertura della partita IVA. Questo
> registro descrive i trattamenti che **inizieranno** all'accensione, ed è
> già compilato perché all'accensione dev'essere pronto, non da scrivere.

---

## 1. Gestione degli ordini e spedizione

| Voce | Contenuto |
|---|---|
| **Finalità** | Ricevere l'ordine, produrre il pezzo, spedirlo, assistere il cliente dopo la vendita. |
| **Base giuridica** | **Art. 6.1.b** — esecuzione di un contratto di cui l'interessato è parte. **Non si chiede il consenso**, e chiederlo sarebbe scorretto: senza questi dati il contratto non è eseguibile, quindi il consenso non sarebbe libero. |
| **Categorie di interessati** | Clienti (persone fisiche, consumatori). |
| **Categorie di dati** | Nome, cognome, e-mail, telefono, indirizzo di spedizione (via, civico, CAP, città, provincia), note per la consegna, contenuto dell'ordine, testo della personalizzazione richiesta. |
| **Categorie particolari (art. 9)** | **Nessuna.** Il campo di personalizzazione è a testo libero: se un cliente vi scrivesse spontaneamente un dato particolare (per esempio una dedica che rivela una convinzione religiosa), quel dato non viene usato per alcuna finalità ulteriore e viene cancellato con l'anonimizzazione dell'ordine. |
| **Destinatari** | Cloudflare Inc. (hosting e database — responsabile ex art. 28); il corriere incaricato della spedizione (titolare autonomo); il fornitore di posta transazionale (responsabile). |
| **Trasferimenti extra-UE** | Cloudflare: possibile trattamento negli USA, coperto da **clausole contrattuali tipo** (decisione UE 2021/914) e dal DPA di Cloudflare. |
| **Conservazione** | 10 anni dalla data dell'ordine (vedi trattamento 2). Dopo, anonimizzazione automatica. |
| **Misure di sicurezza** | HTTPS obbligatorio con HSTS; query esclusivamente parametriche; validazione di ogni campo lato server; escape di ogni valore in uscita; accesso al pannello con password derivata PBKDF2 a 210.000 iterazioni e sessioni di 8 ore; token anti-CSRF su ogni scrittura; limitazione di frequenza. |
| **Dove nel codice** | `src/ordini.js`, tabelle `ordini` e `ordini_righe`. |

## 2. Adempimenti fiscali e contabili

| Voce | Contenuto |
|---|---|
| **Finalità** | Conservare la documentazione delle vendite come impone la legge. |
| **Base giuridica** | **Art. 6.1.c** — obbligo legale: art. 2220 Codice civile, D.P.R. 633/1972. |
| **Categorie di interessati** | Clienti. |
| **Categorie di dati** | Numero e data dell'ordine, importi, imponibile e IVA, metodo di pagamento, identificativi del pagamento; dati di fatturazione se la fattura è richiesta. |
| **Destinatari** | Commercialista (responsabile ex art. 28 — **serve un atto di nomina scritto**); Agenzia delle Entrate quando dovuto. |
| **Trasferimenti extra-UE** | Nessuno. |
| **Conservazione** | **10 anni**. È il termine che prevale sul diritto alla cancellazione (art. 17.3.b GDPR). |
| **Misure di sicurezza** | Come sopra. L'esportazione CSV per il commercialista è protetta da autenticazione e neutralizza le formule per impedire l'esecuzione di codice all'apertura del file. |
| **Dove nel codice** | `src/admin.js` (`esportaCsv`), tabella `ordini`. |

## 3. Prova della presa visione dell'informativa

| Voce | Contenuto |
|---|---|
| **Finalità** | Dimostrare di aver adempiuto all'obbligo di informare (art. 13) e di poterlo provare (art. 5.2, responsabilizzazione). |
| **Base giuridica** | **Art. 6.1.c** e **art. 6.1.f** — obbligo legale e legittimo interesse a poter dimostrare la conformità. |
| **Categorie di dati** | **Hash con sale** dell'indirizzo e-mail (mai l'indirizzo in chiaro), versione e testo dell'informativa mostrata, data e ora, numero d'ordine. |
| **Destinatari** | Nessuno. |
| **Conservazione** | 10 anni, come l'ordine a cui si riferisce. Sopravvive volutamente all'anonimizzazione dell'ordine: resta dimostrabile che un consenso c'è stato, senza conservare di chi. |
| **Dove nel codice** | `src/ordini.js` (`creaOrdine`), tabella `consensi`. |

## 4. Sicurezza: limitazione della frequenza delle richieste

| Voce | Contenuto |
|---|---|
| **Finalità** | Impedire creazione automatica di ordini e tentativi ripetuti di indovinare la password del pannello. |
| **Base giuridica** | **Art. 6.1.f** — legittimo interesse alla sicurezza del servizio, espressamente riconosciuto dal considerando 49. |
| **Categorie di dati** | **Hash con sale** dell'indirizzo IP. L'IP in chiaro non viene **mai** scritto né registrato nei log. |
| **Conservazione** | **24 ore**, poi cancellazione automatica dal cron orario. |
| **Bilanciamento** | L'interesse del titolare a non farsi svuotare il magazzino da uno script prevale sull'impatto sull'interessato, che è minimo: il dato è pseudonimizzato, non è collegato all'ordine, non permette di ricostruire una navigazione e dura un giorno. |
| **Dove nel codice** | `src/db.js` (`consumaLimite`), tabella `limiti`. |

## 5. Amministrazione del negozio

| Voce | Contenuto |
|---|---|
| **Finalità** | Consentire alla titolare di gestire ordini e magazzino. |
| **Base giuridica** | **Art. 6.1.f** — legittimo interesse del titolare a gestire la propria attività. |
| **Categorie di interessati** | La sola titolare. |
| **Categorie di dati** | Hash del token di sessione e del token anti-CSRF, data di creazione e di scadenza. Nessun dato anagrafico. |
| **Conservazione** | 8 ore (durata della sessione), poi cancellazione automatica. |
| **Dove nel codice** | `src/admin.js`, tabella `admin_sessioni`. |

## 6. Pagamenti

| Voce | Contenuto |
|---|---|
| **Finalità** | Incassare il corrispettivo. |
| **Base giuridica** | **Art. 6.1.b** — esecuzione del contratto. |
| **Categorie di dati trattati da noi** | **Nessun dato di pagamento.** Conserviamo solo gli identificativi tecnici restituiti da PayPal (`paypal_order_id`, `paypal_capture_id`) e l'importo. **Numeri di carta, scadenze e CVV non transitano mai da questo sito**: il pagamento avviene interamente su infrastruttura PayPal. |
| **Ruolo di PayPal** | **Titolare autonomo** per le proprie finalità (antifrode, obblighi antiriciclaggio), non nostro responsabile. La sua informativa va linkata nella nostra. |
| **Trasferimenti extra-UE** | PayPal tratta dati negli USA. Base: clausole contrattuali tipo. |
| **Contrassegno** | Nessun dato di pagamento: l'incasso avviene in contanti alla consegna, tramite il corriere. |
| **Dove nel codice** | `src/paypal.js`. |

---

## Trattamenti che NON facciamo

Elencati apposta: la loro assenza è una scelta, e va poterla dimostrare.

- **Nessuna profilazione**, nessuna decisione automatizzata ex art. 22.
- **Nessun marketing**, nessuna newsletter, nessuna casella pre-spuntata.
- **Nessuno strumento di analisi statistica** attivo, né proprio né di terzi.
- **Nessuna registrazione di account**: non esistono utenti, non esistono password dei clienti.
- **Nessuna raccolta** di data di nascita, sesso, codice fiscale del cliente (salvo richiesta esplicita di fattura), o di qualunque campo "utile in futuro".
- **Nessun cookie** di profilazione o pubblicitario.

## Da fare prima di accendere il negozio

- [ ] Firmare il **DPA con Cloudflare** (disponibile nel pannello Cloudflare).
- [ ] Firmare il **DPA con il fornitore di posta** scelto (Resend o Brevo).
- [ ] **Nominare per iscritto il commercialista** responsabile del trattamento (art. 28).
- [ ] Verificare che il **corriere** scelto abbia un'informativa propria e indicarlo per nome nella privacy policy.
- [ ] Compilare i segnaposto `{{...}}` di questo documento con i dati reali.
