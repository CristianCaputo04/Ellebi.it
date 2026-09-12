# Rapporto di sicurezza — negozio EmmeLù

Revisione del 12 settembre 2026, sul codice al commit che accompagna questo
documento. Riguarda tutto il percorso d'acquisto (catalogo, carrello,
checkout, pagamento, stato dell'ordine), il pannello di amministrazione, i
rimborsi e le rotte API.

Non è una dichiarazione di conformità e non sostituisce una verifica
indipendente: è il resoconto di cosa è stato controllato, cosa è stato
trovato, cosa è stato corretto e cosa resta scoperto.

---

## 1. In breve

Sono stati trovati e corretti **dieci difetti**, quattro dei quali gravi: un
incasso PayPal non ancora avvenuto contato come riuscito, il consenso cookie
bloccato dalla propria CSP — sia sulle pagine statiche sia su quelle
generate, per due cause tecniche diverse — e il modulo dei rimborsi
inutilizzabile. Nessuno era sfruttabile da un visitatore qualsiasi per
ottenere merce gratis o leggere i dati di un altro cliente: le difese
principali — prezzo calcolato dal server, verifica dell'importo PayPal,
token sull'ordine, CSRF sul pannello — reggevano già.

| # | Difetto | Gravità | Stato |
|---|---------|---------|-------|
| 1 | Un incasso PayPal ancora in sospeso veniva accettato come riuscito | **Alta** | Corretto |
| 2 | Le pagine generate uscivano con meno intestazioni di sicurezza di quelle statiche | Media | Corretto |
| 3 | Il tentativo di accesso al pannello non aveva un tetto complessivo | Media | Corretto |
| 4 | `/api/preventivo` era senza limite di frequenza | Media | Corretto |
| 5 | Il token dell'ordine si confrontava con `!==` | Bassa | Corretto |
| 6 | Il token anti-CSRF veniva sfuggito due volte | Bassa | Corretto |
| 7 | Le nuove pagine non avevano l'hash CSP del proprio JSON-LD | Bassa | Corretto |
| 8 | Lo script di configurazione del consenso cookie era bloccato dalla CSP su **tutte** le pagine | **Alta** | Corretto |
| 9 | Il modulo dei rimborsi non poteva funzionare: nessun rimborso sarebbe partito | **Alta** | Corretto |
| 10 | Gli script in linea delle pagine generate erano senza nonce, quindi bloccati | **Alta** | Corretto |

---

## 2. I difetti, uno per uno

### 2.1 Un incasso in sospeso contato come riuscito — **alta**

`src/paypal.js`, funzione `valutaCattura`.

La funzione cercava la cattura completata e, se non la trovava, ripiegava
sulla prima disponibile:

```js
const cattura = catture.find((c) => c.status === "COMPLETED") || catture[0];
```

Quel ripiego sembra prudente e non lo è. Lo stato dell'**ordine** PayPal può
essere `COMPLETED` mentre la **cattura** sotto è `PENDING`: succede con gli
eCheck, dove il denaro arriva giorni dopo e può non arrivare affatto. In quel
caso l'ordine veniva marcato «pagato», partiva l'e-mail di conferma e il
pezzo sarebbe stato spedito senza incasso.

Il controllo sull'importo non copriva il buco: l'importo di una cattura in
sospeso è quello giusto, solo che i soldi non ci sono.

**Correzione.** Si accetta solo una cattura `COMPLETED`. Una cattura
`PENDING` produce un esito dedicato (`incasso_in_sospeso`) con un messaggio
che dice al cliente di non rifare il pagamento, e lascia l'ordine in attesa
perché il webhook lo chiuda quando l'accredito arriva davvero.

### 2.2 Intestazioni di sicurezza disallineate — media

`src/index.js`, funzione `intestazioniSicurezza`.

Le pagine statiche prendono le intestazioni da `public/_headers`, quelle
generate dal Worker le costruiscono in codice. Le due liste erano diverse, e
nel verso peggiore: mancavano `Cross-Origin-Resource-Policy`,
`X-Permitted-Cross-Domain-Policies` e `X-DNS-Prefetch-Control` proprio su
carrello, checkout, stato dell'ordine e pannello — cioè sulle uniche pagine
che contengono soldi e dati personali.

**Correzione.** Le tre intestazioni sono state aggiunte. La duplicazione fra
`_headers` e il codice resta un punto fragile: vedi §4.

### 2.3 Accesso al pannello senza tetto complessivo — media

`src/admin.js`, funzione `accedi`.

Il limite era **solo per indirizzo IP**: cinque tentativi ogni quindici
minuti. Chi cambia IP a ogni tentativo lo aggira del tutto. Non è un modo
per entrare — la password passa da PBKDF2-SHA256 a 210.000 iterazioni — ma è
un modo per far lavorare il Worker: ogni tentativo costa quelle 210.000
iterazioni di CPU, e qualche riga di script basta a bruciare il budget.

**Correzione.** Aggiunto un secondo contatore complessivo, 120 tentativi ogni
quindici minuti, valutato **prima** di derivare la password.

Il tetto è volutamente alto, ed è un compromesso consapevole: un tetto
stretto proteggerebbe meglio la CPU ma darebbe a chiunque il potere di
chiudere fuori la titolare dal proprio pannello. Fra CPU sprecata e blocco
dell'accesso legittimo, si è scelta la prima.

### 2.4 `/api/preventivo` senza limite di frequenza — media

`src/index.js`, funzione `apiPreventivo`.

Era l'unica rotta pubblica, senza autenticazione, che faceva lavorare il
database a ogni chiamata (lettura delle varianti degli SKU inviati più le
tariffe). Niente impediva di tenerla occupata all'infinito.

**Correzione.** Limite di 150 chiamate ogni dieci minuti per chiamante.
Largo di proposito: il browser la richiama a ogni modifica del carrello e una
sessione d'acquisto normale ne fa qualche decina.

### 2.5 Token dell'ordine confrontato con `!==` — bassa

`src/index.js`, tre punti.

Il token che protegge la pagina di stato dell'ordine veniva confrontato con
`!==`, che esce al primo carattere diverso. In pratica non sfruttabile —
sopra la rete il rumore supera di molto la differenza di tempo, e il token è
di 32 caratteri casuali — ma il repository ha già `confrontoCostante` e lo usa
per gli altri segreti.

**Correzione.** I tre confronti usano `confrontoCostante`.

### 2.6 Token anti-CSRF sfuggito due volte — bassa

`src/admin-pagine/ordine.js`, `accesso.js`, `magazzino.js`.

Le pagine passavano a `paginaAdmin` un token già trattato con `esc()`, e
`paginaAdmin` lo trattava di nuovo. Oggi non si vede, perché `tokenCasuale`
produce solo caratteri che `esc()` non tocca. È un difetto latente: il giorno
in cui l'alfabeto del token cambiasse, il modulo «Esci» spedirebbe un valore
diverso da quello in sessione e il guasto sarebbe incomprensibile.

**Correzione.** Alle funzioni di cornice si passa il token grezzo; la fuga
avviene in un punto solo.

### 2.7 JSON-LD delle nuove pagine fuori dalla CSP — bassa

`public/_headers`.

La CSP delle pagine statiche autorizza gli script in linea **per hash**. Ogni
pagina ha un proprio blocco JSON-LD, quindi un proprio hash. Le cinque pagine
nuove non ce l'avevano: i loro dati strutturati sarebbero stati bloccati.

**Correzione.** `tools/aggiorna-csp-hash.py` rigenerato. Si veda anche §2.8: rigenerandoli è emerso che uno degli hash pubblicati era addirittura inventato. Il
controllo è in CI, quindi una pagina aggiunta senza rigenerare gli hash ferma
la pubblicazione.

### 2.8 Il consenso cookie era bloccato dalla CSP ovunque — **alta**

`tools/aggiorna-csp-hash.py`.

Trovato con il browser, non leggendo il codice: ogni pagina statica apriva la
console con un rifiuto CSP.

La CSP autorizza gli script in linea per hash, e gli hash li calcola questo
strumento con un'espressione regolare:

```python
RX_LD = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', re.S)
```

Nel `<head>` di ogni pagina c'è un commento che **cita** il tag: «…invece di
aprirla solo quando incontra il tag `<script>`.» Un'espressione regolare non
distingue un commento dal documento: la ricerca partiva da quella citazione e
catturava tutto fino al primo `</script>` vero, inghiottendo i preconnect e
il frammento `_iub.csConfiguration`. Veniva così pubblicato l'hash di un
blocco che non esiste, mentre il vero script di configurazione di iubenda
restava **senza hash e quindi bloccato su ogni pagina del sito**.

Le conseguenze non sono estetiche: quel frammento è ciò che configura la
Cookie Solution — identificativo del sito, informativa collegata,
comportamento del banner e la richiamata che lo chiude. Senza, la raccolta
del consenso non funziona come dichiarato nell'informativa. È il difetto più
grave del gruppo, ed era invisibile a ogni prova fatta con `curl`.

**Correzione.** Lo strumento usa un analizzatore HTML vero
(`html.parser.HTMLParser`), che i commenti li riconosce. Gli hash sono passati
da 15 (uno dei quali inventato) a 14 corretti, e la console del browser è
pulita su tutte le pagine.

**Lezione.** Un controllo che passa senza che nessuno abbia mai aperto la
pagina in un browser non dimostra molto. Lo stesso vale per il difetto §2.9.

### 2.9 Il modulo dei rimborsi non poteva funzionare — **alta**

`src/admin-pagine/rimborso.js` contro `src/index.js` e `src/rimborsi.js`.

Tre disallineamenti fra il modulo e la rotta che lo riceve:

1. il menu «Motivo» inviava la frase leggibile (`"Recesso entro 14 giorni"`),
   mentre `eseguiRimborso` accetta solo la chiave (`"recesso"`). Le due liste
   non avevano **nessun** valore in comune: ogni rimborso sarebbe stato
   rifiutato con «motivo non riconosciuto»;
2. il campo del dettaglio si chiamava `motivo_dettaglio`, la rotta legge
   `nota`: il testo veniva scartato in silenzio;
3. i due elenchi di motivi erano scritti in due file diversi, quindi
   destinati a divergere di nuovo.

Non è una falla di sicurezza — nessuno poteva far uscire denaro — ma la
funzione più delicata del pannello era **completamente inutilizzabile**, e il
codice sembrava corretto guardando l'uno o l'altro file da solo.

**Correzione.** La pagina importa `MOTIVI` da `src/rimborsi.js`, cioè dal
punto in cui il server li valida: un elenco solo, che non può più divergere.
Il menu invia la chiave e mostra la frase. Il campo è stato rinominato `nota`.

**Prevenzione.** `tools/verifica.mjs` ha otto controlli nuovi che confrontano
i nomi dei campi del modulo con quelli che la rotta legge, e verificano che i
motivi abbiano una sola definizione. Rimettendo il nome sbagliato, la verifica
fallisce — provato.

### 2.10 Script in linea senza nonce sulle pagine generate — **alta**

`src/pagine/layout.js`.

Stessa conseguenza del §2.8 ma causa opposta, e trovata nello stesso modo:
aprendo `/ordine` in un browser.

Le pagine statiche autorizzano gli script in linea **per hash**; quelle
generate dal Worker non passano da `public/_headers` e autorizzano **per
nonce**. I due frammenti in linea di `layout.js` — la configurazione di
iubenda e la riga che segna la pagina come «js» — non portavano l'attributo
`nonce`, quindi erano bloccati su **ogni** pagina generata: catalogo, scheda
prodotto, carrello, checkout, stato dell'ordine.

L'errore era scritto nero su bianco in cima al file, che dichiarava di
riprodurre la testa della home «byte per byte» perché gli hash calcolati sui
file statici la coprissero. Non la coprono: la CSP di quelle pagine gli hash
non li contiene affatto.

**Correzione.** I due frammenti portano `${nonce}`. Il commento in cima al
file dice ora quale meccanismo vale per quale tipo di pagina.

**Prevenzione.** Un controllo in `tools/verifica.mjs` rifiuta qualunque
`<script>` in linea senza `${nonce}` in `layout.js`. Il controllo toglie
prima i commenti: sia quel file sia la verifica stessa **citano** il tag in
prosa, ed è proprio confondere una citazione con la marcatura che aveva
causato il §2.8.

---

## 3. Cosa è stato verificato e ha retto

Queste sono prove eseguite, non letture del codice.

**Prezzo deciso dal server.** Un ordine con prezzi inventati nel corpo della
richiesta viene registrato ai prezzi del database: il cliente non calcola mai
un totale che conti (`src/prezzi.js`, `src/ordini.js`).

**Importo PayPal.** Alla cattura si confronta l'incassato con il dovuto come
stringhe a due decimali, e si controlla la valuta. Un ordine manipolato non
passa.

**Firma dei webhook.** Verificata sempre, contro l'API di PayPal. Se
`PAYPAL_WEBHOOK_ID` manca, la notifica viene rifiutata invece di essere
creduta.

**Doppio rimborso.** La chiave di idempotenza si scrive **prima** di chiamare
PayPal: il secondo invio si ferma sul vincolo `UNIQUE` invece di far uscire il
denaro due volte.

**Pezzi unici e ordini simultanei.** Lo scarico di giacenza è un `UPDATE`
condizionato che legge `meta.changes`: due ordini contemporanei sullo stesso
pezzo, uno solo riesce.

**Iniezione SQL.** Nessuna interpolazione in una query: tutto passa da
parametri legati. L'unico punto dove un valore entra nel testo SQL è
l'ordinamento della ricerca, che viene scelto da un elenco chiuso (un nome di
colonna non può essere un parametro).

**XSS sul pannello.** Pagina dell'ordine renderizzata con ogni campo testuale
sostituito da `"><script>alert(1)</script><img src=x onerror=alert(2)>`:
zero tag introdotti, zero attributi di evento, zero rotture di attributo.
Nel repository non c'è **nessun** uso di `innerHTML`.

**Enumerazione su «ritrova il tuo ordine».** Ordine inesistente, e-mail
sbagliata e ordine anonimizzato producono lo stesso identico messaggio e lo
stesso codice HTTP: la pagina non dice a nessuno se un certo indirizzo ha
comprato qui. La risposta di errore non contiene nome, token né stato.

**CSRF sulle rotte di scrittura.** Una POST senza `Origin` e una POST con
`Origin` di un altro sito ricevono entrambe 403. La difesa non si fonda sul
`Content-Type`, che un modulo con `enctype="text/plain"` può falsificare.

**Limiti di frequenza.** Con la finestra pulita: cinque ricerche d'ordine
passano, la sesta riceve 429.

**Console del browser.** Tutte le pagine, statiche e generate, aperte con
Chromium a 390 px e a 1440 px: zero violazioni CSP, zero scorrimento
orizzontale, CLS pari a 0.

---

## 4. Cosa resta scoperto

Nessuno di questi punti è un difetto da correggere adesso: sono limiti noti
che conviene avere scritti.

**`'unsafe-eval'` nella CSP.** Lo richiedono gli script di iubenda, non
codice nostro. Indebolisce la CSP come difesa di secondo livello contro
l'XSS. Si toglie solo cambiando gestore del consenso.

**Le intestazioni di sicurezza sono scritte in due posti** — `public/_headers`
per le pagine statiche e `intestazioniSicurezza` in `src/index.js` per quelle
generate — e vanno allineate a mano. È esattamente il difetto §2.2, e può
ripresentarsi. Un controllo automatico che confronti le due liste sarebbe il
modo giusto di chiuderlo.

**Il limite di frequenza è per indirizzo IP.** Dietro un IP condiviso
(azienda, rete mobile) più persone si consumano il limite a vicenda. I tetti
sono stati scelti larghi anche per questo.

**Nessuna autenticazione a due fattori sul pannello.** C'è una password sola.
Per un pannello a utente singolo è una scelta difendibile, ma va detta.

**Il registro dei rimborsi non si riconcilia da solo con PayPal.** Se un
rimborso viene eseguito a mano dalla console PayPal, qui non compare. La
procedura scritta in `src/admin-pagine/rimborso.js` dice di registrarlo
comunque cambiando lo stato dell'ordine.

**Il contrassegno non ha protezione contro chi non ritira.** Chi ordina in
contrassegno e rifiuta il pacco costa la spedizione. È un rischio
commerciale, non tecnico, ma è il motivo per cui esiste
`LIMITE_CONTRASSEGNO_CENT`.

---

## 5. Prima di aprire il negozio

L'elenco completo è in `docs/CHECKLIST-APERTURA-NEGOZIO.md`. I punti che
riguardano la sicurezza:

1. `ADMIN_PASSWORD_HASH`, `HASH_SALE`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID` e
   `EMAIL_API_KEY` vanno impostati con `npx wrangler@4 secret put NOME`. Mai
   in `wrangler.toml`: quel file sta nel repository. Un controllo in CI se ne
   accorgerebbe, ma il segreto sarebbe già nella cronologia di git.
2. `HASH_SALE` deve essere una stringa casuale lunga e **non deve più
   cambiare**: cambiarla azzera i limiti di frequenza e rende inconfrontabili
   gli hash degli IP già registrati.
3. `PAYPAL_WEBHOOK_ID` è obbligatorio. Senza, ogni notifica viene rifiutata e
   gli ordini pagati con la finestra chiusa in anticipo restano in attesa
   finché il cron non li annulla.
4. `NEGOZIO_ATTIVO` resta `"0"` finché la partita IVA non esiste.
5. Provare un rimborso vero in ambiente sandbox prima di farlo in produzione:
   è l'unica operazione del pannello che non si annulla.
