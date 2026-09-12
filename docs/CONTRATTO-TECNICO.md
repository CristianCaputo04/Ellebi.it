# EmmeLù — contratto tecnico dell'e-commerce

Fonte unica di verità per chi lavora su questo repo. Se una cosa qui è scritta in
un modo, va implementata così: contratti divergenti fra backend e frontend sono
il modo più rapido per rompere un negozio.

---

## 0. Decisioni prese (non rimetterle in discussione senza chiedere)

| Scelta | Valore | Perché |
|---|---|---|
| Runtime | Cloudflare Worker + Static Assets | resta il repo e l'infrastruttura attuale, zero canone |
| Database | Cloudflare D1 (SQLite) | transazionale, nello stesso runtime, nessun round-trip esterno |
| Pagamenti | **PayPal** + **contrassegno** | scelti dalla titolare. **Stripe NON è integrato** |
| Spedizioni | **solo Italia** | niente OSS, niente dogana, IVA sempre 22% |
| P.IVA | **non ancora aperta** | il negozio nasce spento, dietro l'interruttore `NEGOZIO_ATTIVO` |
| Valuta | EUR, sempre in **centesimi interi** | mai float sui soldi |
| Lingua | solo `it-IT` | |

### L'interruttore `NEGOZIO_ATTIVO`

Variabile d'ambiente, stringa `"1"` o `"0"` (default `"0"`).

- **`0` — modalità vetrina (stato attuale).** Il catalogo si vede, i prezzi si
  vedono, ma `/carrello`, `/checkout` e tutte le `POST /api/*` d'ordine
  rispondono **`503`** con un corpo JSON `{ "errore": "negozio_non_attivo" }`.
  Al posto del pulsante “Aggiungi al carrello” il frontend mostra la CTA
  Instagram. Nessuna rotta d'acquisto compare in `sitemap.xml`.
- **`1` — negozio aperto.** Tutto attivo.

Questo **non è un dettaglio estetico**: senza partita IVA incassare online in
Italia è illecito. L'interruttore parte spento e resta spento finché i dati
fiscali del §9 non sono compilati davvero. Il Worker si rifiuta di attivarsi se
`NEGOZIO_ATTIVO=1` ma `PIVA` è vuota (vedi §9).

---

## 1. Struttura dei file e chi possiede cosa

```
wrangler.toml              binding D1, assets, variabili       → BACKEND
migrazioni/
  0001-schema.sql          tabelle e indici                    → BACKEND
  0002-dati-iniziali.sql   categorie, prodotti, tariffe         → BACKEND
src/
  index.js                 entry del Worker, router             → BACKEND
  db.js                    accesso a D1, query tipizzate        → BACKEND
  prezzi.js                motore di calcolo (IVA, spedizione)  → BACKEND
  ordini.js                ciclo di vita, giacenze, transazioni → BACKEND
  paypal.js                Orders v2 + verifica webhook         → BACKEND
  email.js                 invio transazionale                  → BACKEND
  admin.js                 autenticazione e API del pannello    → BACKEND
  gdpr.js                  registro consensi, purga, export     → BACKEND
  util.js                  helper condivisi                     → BACKEND
  pagine/                  ⟵ SOLO FRONTEND NEGOZIO
    layout.js              scheletro HTML condiviso
    negozio.js             /negozio  (catalogo)
    prodotto.js            /prodotto/:slug
    carrello.js            /carrello
    checkout.js            /checkout
    ordine.js              /ordine/:numero
  admin-pagine/            ⟵ SOLO FRONTEND ADMIN
    *.js
public/
  assets/css/negozio.css   ⟵ SOLO FRONTEND NEGOZIO
  assets/js/negozio.js     ⟵ SOLO FRONTEND NEGOZIO
  assets/css/admin.css     ⟵ SOLO FRONTEND ADMIN
  assets/js/admin.js       ⟵ SOLO FRONTEND ADMIN
  (il resto invariato)                                          → LEGALE/GDPR
docs/                      documentazione GDPR                  → LEGALE/GDPR
```

**Regola d'oro: nessuno scrive fuori dal proprio perimetro.** Serve una modifica
altrove? Si segnala nel resoconto, non si tocca.

---

## 2. Perché le pagine prodotto sono generate dal Worker

Catalogo e schede prodotto **non** sono file statici: li genera il Worker
leggendo D1 a ogni richiesta. Tre motivi, in ordine di peso:

1. **SEO.** Un prodotto reso da JavaScript lato client arriva a Google come una
   pagina vuota. Qui il markup — titolo, prezzo, disponibilità, JSON-LD `Product`
   con `offers` — esce già completo dalla prima risposta.
2. **Verità del prezzo e della giacenza.** Un pezzo unico venduto dieci minuti fa
   deve risultare esaurito adesso, non alla prossima pubblicazione del sito.
3. **Nessuna duplicazione.** Il prezzo esiste in un posto solo: la tabella
   `varianti`. Nessun listino da tenere allineato a mano nell'HTML.

Home, pagine legali e 404 **restano file statici** in `public/`: non dipendono dal
database e devono continuare a uscire dalla cache dei bordi senza toccare D1.

Cache: le pagine generate rispondono con
`Cache-Control: public, max-age=0, must-revalidate` (come le altre pagine HTML).
**Mai** cache lunga su una pagina che dichiara una disponibilità.

---

## 3. Schema dati (riassunto — la verità è in `migrazioni/0001-schema.sql`)

Tutti gli importi sono **interi in centesimi**. Tutte le date sono stringhe
ISO-8601 UTC (`2026-09-12T10:30:00Z`).

- **`categorie`** — le nove linee. `slug` univoco, `posizione` per l'ordine.
- **`prodotti`** — `slug` univoco, `categoria_id`, testi, `personalizzabile` (0/1),
  `pezzo_unico` (0/1), `stato` (`bozza` | `attivo` | `archiviato`).
- **`prodotti_immagini`** — `base` è il nome file senza estensione
  (`borsa-01`): il frontend ricostruisce `<picture>` AVIF/WebP/JPEG da lì, come
  fa già la home.
- **`varianti`** — **è qui che vivono prezzo e giacenza**. Un prodotto senza
  varianti dichiarate ne ha comunque una, “unica”. Campi: `sku` univoco,
  `prezzo_cent`, `peso_g`, `giacenza`.
- **`ordini`** — dati del cliente, indirizzo, totali *congelati al momento
  dell'acquisto*, stato, riferimenti di pagamento, prova del consenso.
- **`ordini_righe`** — **copia** di nome, SKU, prezzo e personalizzazione al
  momento dell'ordine. Non si fa `JOIN` su `varianti` per ricostruire un ordine
  vecchio: se domani il prezzo cambia, l'ordine passato deve restare quello che
  era. È un requisito fiscale, non un vezzo.
- **`ordini_eventi`** — traccia append-only di ogni cambio di stato: chi, quando,
  perché. Serve per le contestazioni e per l'art. 5.2 GDPR (responsabilizzazione).
- **`spedizioni_tariffe`** — scaglioni di peso.
- **`consensi`** — prova del consenso privacy raccolto al checkout.
- **`admin_sessioni`** — sessioni del pannello, solo hash dei token.

---

## 4. Motore dei prezzi — `src/prezzi.js`

**Il client non calcola mai un totale che conti.** Il carrello nel browser è un
promemoria; ogni importo che finisce in un ordine è ricalcolato dal server a
partire dagli SKU e dalle quantità. Un preventivo inviato dal client viene
ignorato.

Regole, nell'ordine:

1. **Subtotale** = Σ `prezzo_cent × quantità` delle varianti richieste, rilette
   da D1 adesso (non dal payload).
2. **IVA 22% inclusa.** In Italia i prezzi al consumatore si espongono IVA
   inclusa. Lo scorporo per la fattura è
   `iva = totale − arrotonda(totale / 1.22)`, con arrotondamento a metà superiore
   sul centesimo.
3. **Spedizione** = primo scaglione di `spedizioni_tariffe` con
   `peso_max_g ≥ peso totale`. Sopra la `SOGLIA_SPEDIZIONE_GRATIS_CENT`
   (default `15000`, cioè 150 €) la spedizione è `0`.
4. **Contrassegno**: se `metodo = "contrassegno"`, somma
   `SUPPLEMENTO_CONTRASSEGNO_CENT` (default `500`). Con PayPal è `0`.
5. **Totale** = subtotale + spedizione + supplemento.

Massimo ordine: `LIMITE_CONTRASSEGNO_CENT` (default `50000`, 500 €) oltre il
quale il contrassegno non è selezionabile — è il limite che i corrieri applicano
di norma e serve a non incassare rifiuti alla consegna.

---

## 5. API pubblica

Tutte le risposte sono JSON `application/json; charset=utf-8`. Gli errori hanno
sempre la forma `{ "errore": "codice_macchina", "messaggio": "testo per l'umano" }`.

| Metodo | Rotta | Cosa fa |
|---|---|---|
| `GET` | `/api/catalogo` | categorie + prodotti attivi con prezzo e disponibilità |
| `GET` | `/api/prodotto/:slug` | un prodotto con tutte le varianti |
| `POST` | `/api/preventivo` | ricalcola totali dal server. **Non crea nulla** |
| `POST` | `/api/ordine` | crea l'ordine, blocca la giacenza |
| `GET` | `/api/ordine/:numero?token=…` | stato dell'ordine (token nell'e-mail) |
| `POST` | `/api/paypal/crea` | crea l'ordine PayPal, restituisce l'`id` |
| `POST` | `/api/paypal/cattura` | incassa e conferma l'ordine |
| `POST` | `/api/paypal/webhook` | notifiche PayPal, **firma verificata** |

### `POST /api/preventivo`

```jsonc
// richiesta
{ "righe": [ { "sku": "NUV-U", "quantita": 1 } ],
  "metodo": "paypal" | "contrassegno",
  "cap": "75100" }
// risposta
{ "righe": [ { "sku": "NUV-U", "nome": "Nuvola", "prezzo_cent": 9000,
               "quantita": 1, "totale_cent": 9000, "disponibile": true } ],
  "subtotale_cent": 9000, "spedizione_cent": 700,
  "supplemento_cent": 0, "totale_cent": 9700, "iva_cent": 1750,
  "spedizione_gratis_da_cent": 15000 }
```

### `POST /api/ordine`

Richiede: `righe`, `metodo`, `cliente` (nome, cognome, email, telefono),
`spedizione` (via, civico, cap, citta, provincia, note), `consenso_privacy: true`.

- Valida **tutto** lato server: CAP italiano a 5 cifre, provincia di 2 lettere
  esistente, e-mail sintatticamente valida, telefono di almeno 8 cifre.
- Rifiuta se una riga non è più disponibile → `409 { "errore": "non_disponibile" }`.
- Rifiuta senza consenso privacy → `400 { "errore": "consenso_mancante" }`.
- Crea l'ordine in **una sola transazione** con il decremento della giacenza
  (§6), registra il consenso, restituisce `{ "numero": "EL-2026-0001", "token": "…" }`.

**Limitazione di frequenza**: massimo 5 creazioni d'ordine per IP ogni 10 minuti,
contate in D1. Serve contro il riempimento automatico del magazzino.

---

## 6. Giacenze e concorrenza — la parte che si sbaglia sempre

Due persone che comprano lo stesso pezzo unico nello stesso secondo **non devono**
poterlo comprare entrambe. In D1 questo si ottiene così, e solo così:

```sql
UPDATE varianti SET giacenza = giacenza - ?1
 WHERE id = ?2 AND giacenza >= ?1;
```

Si controlla `meta.changes`: se è `0`, qualcun altro è arrivato prima e l'ordine
intero va annullato. **Non si legge la giacenza e poi la si scrive** in due query
separate: fra la lettura e la scrittura ci sta un altro ordine.

Tutte le scritture di un ordine vanno in **`db.batch([...])`**, che su D1 è
atomico: o entrano tutte o nessuna.

**Ordini non pagati.** Un ordine PayPal creato ma mai pagato tiene bloccato il
pezzo. Scade dopo `MINUTI_SCADENZA_ORDINE` (default `30`): un cron orario rimette
in giacenza le righe degli ordini rimasti in `in_attesa_pagamento` oltre la
scadenza e li porta in `annullato`.

### Stati dell'ordine

```
                    ┌─ (PayPal) ─→ in_attesa_pagamento ─→ pagato ─┐
bozza ─→ creato ─┤                                                ├─→ in_lavorazione ─→ spedito ─→ consegnato
                    └─ (contrassegno) ─→ confermato ──────────────┘
                                   ↓ (da qualsiasi stato prima di spedito)
                               annullato / rimborsato
```

Ogni transizione scrive una riga in `ordini_eventi`. Le transizioni non previste
sono rifiutate dal codice, non solo dall'interfaccia.

---

## 7. PayPal — `src/paypal.js`

API **Orders v2**. Ambiente scelto da `PAYPAL_AMBIENTE` (`sandbox` | `live`).

- `PAYPAL_CLIENT_ID` — pubblica, finisce nell'HTML del checkout.
- `PAYPAL_SECRET` — **segreto Wrangler**, mai nel repo, mai nel client.
- `PAYPAL_WEBHOOK_ID` — serve a verificare la firma delle notifiche.

Flusso:

1. Il browser chiede `POST /api/ordine` → l'ordine nasce `in_attesa_pagamento`
   e la giacenza è già bloccata.
2. `POST /api/paypal/crea` → il server crea l'ordine PayPal **con gli importi
   calcolati da lui**, mai con quelli mandati dal browser.
3. L'utente approva nella finestra PayPal.
4. `POST /api/paypal/cattura` → il server incassa e, **solo se PayPal conferma
   `COMPLETED` e l'importo coincide al centesimo**, porta l'ordine a `pagato`.
5. Il webhook fa da rete di sicurezza se il passo 4 si perde (utente che chiude
   la finestra a incasso avvenuto). **La firma va verificata** con
   `/v1/notifications/verify-webhook-signature`: un webhook non verificato è un
   modo per farsi segnare come pagati ordini mai pagati.

L'SDK JavaScript di PayPal si carica **solo sulla pagina di checkout**, mai
altrove: è un terzo che vede l'indirizzo IP di chi lo carica.

---

## 8. Pannello di amministrazione

Rotte sotto `/admin`, tutte dietro autenticazione, tutte `noindex`.

- Password unica, confrontata con `ADMIN_PASSWORD_HASH` (PBKDF2-SHA256,
  210.000 iterazioni, sale per utente) — **mai** la password in chiaro fra i
  segreti. Confronto a **tempo costante**.
- Sessione: cookie `emmelu_admin`, `HttpOnly; Secure; SameSite=Strict; Path=/admin`,
  scadenza 8 ore, nel database solo l'hash SHA-256 del token.
- Ogni `POST` dell'admin richiede un **token anti-CSRF** legato alla sessione.
- Limite tentativi di accesso: 5 ogni 15 minuti per IP.

Funzioni: elenco ordini filtrabile per stato, dettaglio con storico eventi,
cambio stato, inserimento codice di tracciatura, gestione giacenze, esportazione
CSV degli ordini per il commercialista.

---

## 9. Dati fiscali obbligatori — `src/config.js`

Vanno pubblicati nel piè di pagina e nelle pagine legali (D.Lgs 70/2003 art. 7).
Oggi sono **vuoti**, e finché lo sono `NEGOZIO_ATTIVO` deve restare `0`:

| Variabile | Esempio | Obbligatoria per vendere |
|---|---|---|
| `RAGIONE_SOCIALE` | `EmmeLù di Lucy Basilicata` | sì |
| `PIVA` | `IT01234567890` | sì |
| `CODICE_FISCALE` | | sì |
| `SEDE_LEGALE` | via, civico, CAP, città, provincia | sì |
| `REA` | `MT-123456` | sì, se iscritta |
| `PEC` | | sì |
| `CODICE_SDI` | | per la fatturazione elettronica |

Il Worker **rifiuta l'avvio in modalità negozio** (`NEGOZIO_ATTIVO=1`) se
`PIVA` o `RAGIONE_SOCIALE` sono vuote, e lo scrive nei log. È una protezione
contro l'accensione distratta, non un vincolo tecnico.

---

## 10. GDPR — requisiti vincolanti per chi scrive codice

1. **Minimizzazione.** Si raccoglie solo ciò che serve a spedire un pacco:
   nome, cognome, e-mail, telefono, indirizzo. **Vietato** registrare data di
   nascita, sesso, codice fiscale del cliente (serve solo su richiesta di
   fattura), o qualunque campo “utile in futuro”.
2. **Base giuridica.** Dati d'ordine = **esecuzione del contratto** (art. 6.1.b):
   *non* si chiede il consenso per trattarli, e chiederlo sarebbe sbagliato.
   Il consenso al checkout è una **presa visione dell'informativa**, e si registra
   come tale in `consensi` (testo, versione, data). Conservazione fiscale dei
   documenti = **obbligo di legge** (art. 6.1.c).
3. **Niente marketing senza consenso separato.** In questa versione **non esiste
   alcuna newsletter**: nessuna casella pre-spuntata, nessun invio promozionale.
4. **Conservazione.** Ordini e documenti fiscali: **10 anni** (art. 2220 c.c.).
   Carrelli abbandonati e ordini annullati: **30 giorni**, poi cancellati dal cron.
   Sessioni admin: 8 ore. Log di limitazione frequenza: 24 ore.
5. **Indirizzi IP.** Si conservano solo come **hash con sale** (`HASH_SALE`,
   segreto) e solo per la limitazione di frequenza, per 24 ore. Mai in chiaro,
   mai legati all'ordine.
6. **Responsabili del trattamento** da elencare in informativa: Cloudflare
   (hosting e database), PayPal (pagamento — in realtà titolare autonomo per
   i suoi fini), il fornitore e-mail, il corriere.
7. **Diritti dell'interessato.** Deve esistere un modo reale di esercitarli:
   `docs/PROCEDURA-DIRITTI-INTERESSATI.md` + funzioni di esportazione e
   cancellazione in `src/gdpr.js`. Cancellazione = anonimizzazione dei dati
   personali **mantenendo** i dati fiscali dell'ordine, che la legge impone di
   conservare: si sovrascrivono nome, indirizzo, e-mail e telefono, si tiene
   importo, data e numero.
8. **Trasferimenti extra-UE.** PayPal tratta dati negli USA: va dichiarato in
   informativa con la base del trasferimento (clausole contrattuali tipo).

---

## 11. Sicurezza — requisiti vincolanti

- **Ogni** input dal browser è validato lato server contro una lista di campi
  attesi. Nessun `Object.assign` di un payload dentro una query.
- **Solo query parametriche** (`db.prepare(...).bind(...)`). Mai concatenazione
  di stringhe SQL.
- **Escape dell'HTML** su ogni valore che finisce in una pagina generata:
  `util.js` esporta `esc()`, e va usata sempre — anche sui dati che “vengono dal
  database”, perché nel database ci sono finiti passando da un modulo.
- CSP: `script-src` resta senza `'unsafe-inline'` per il nostro codice. Il
  checkout aggiunge `https://www.paypal.com https://*.paypal.com` **solo su
  quella rotta**, non a tutto il sito.
- Cookie del carrello: `emmelu_carrello`, `SameSite=Lax`, `Secure`, **non**
  `HttpOnly` (lo legge il JavaScript del carrello), contiene **solo SKU e
  quantità**, mai prezzi, mai dati personali. È un cookie **tecnico**: non
  richiede consenso, e va dichiarato nella cookie policy come tale.
- Le pagine `/admin`, `/carrello`, `/checkout`, `/ordine/*` escono con
  `X-Robots-Tag: noindex` e non entrano in `sitemap.xml`.

---

## 12. Convenzioni di scrittura del codice

Il repo è **in italiano**: nomi di funzioni, variabili, commenti, messaggi.
Si prosegue così — un repo mezzo in inglese e mezzo in italiano è peggio di
entrambi.

- JavaScript moderno (ES2022), moduli ES, **zero dipendenze** a runtime.
- I commenti spiegano **perché**, non cosa: il cosa si legge dal codice.
  Lo stile è quello già presente nel repo — prosa in italiano, righe intere,
  non frammenti telegrafici.
- Ogni funzione esportata ha un commento che dice cosa garantisce e cosa non
  garantisce.
- Niente `console.log` lasciati in giro: `util.js` esporta `registra()`.

---

## 13. Numerazione degli ordini

Formato `EL-AAAA-NNNN` (`EL-2026-0001`): progressivo annuale, azzerato a
gennaio, ricavato con un `UPDATE ... RETURNING` su una tabella contatori dentro
la stessa transazione dell'ordine. **Non** un contatore letto e riscritto, per
lo stesso motivo delle giacenze.

Il `token` dell'ordine è 32 byte casuali da `crypto.getRandomValues`, in base64url.
Permette al cliente di rivedere il proprio ordine senza registrarsi: è l'unica
cosa che protegge quella pagina, quindi non va mai messo in un link pubblico né
nei parametri di una risorsa indicizzabile.
