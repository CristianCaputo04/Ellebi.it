-- =========================================================================
-- EmmeLù — schema del negozio (Cloudflare D1 / SQLite)
--
-- Convenzioni valide per tutto il file:
--   · ogni importo è un INTEGER in CENTESIMI. Mai REAL sui soldi: 0.1 + 0.2
--     non fa 0.3 in virgola mobile, e su un carrello di dieci righe l'errore
--     diventa visibile in fattura.
--   · ogni data è TEXT in ISO-8601 UTC ('2026-09-12T10:30:00Z'). SQLite non
--     ha un tipo data, e una stringa ISO si ordina correttamente come testo.
--   · i booleani sono INTEGER 0/1 con CHECK esplicito.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- catalogo

-- Le nove linee del marchio. Sono in tabella e non in una costante del codice
-- perché la titolare deve poterne aggiungere una senza una pubblicazione.
CREATE TABLE categorie (
  id            INTEGER PRIMARY KEY,
  slug          TEXT    NOT NULL UNIQUE,
  nome          TEXT    NOT NULL,
  descrizione   TEXT    NOT NULL DEFAULT '',
  posizione     INTEGER NOT NULL DEFAULT 0,
  attiva        INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1))
);

CREATE INDEX idx_categorie_ordine ON categorie (attiva, posizione);

CREATE TABLE prodotti (
  id              INTEGER PRIMARY KEY,
  slug            TEXT    NOT NULL UNIQUE,
  categoria_id    INTEGER NOT NULL REFERENCES categorie (id),
  nome            TEXT    NOT NULL,
  sottotitolo     TEXT    NOT NULL DEFAULT '',
  descrizione     TEXT    NOT NULL DEFAULT '',
  materiale       TEXT    NOT NULL DEFAULT '',
  colore          TEXT    NOT NULL DEFAULT '',
  -- Decide se la scheda mostra il campo "personalizzazione" al carrello e —
  -- soprattutto — se al pezzo si applica il diritto di recesso: sui beni
  -- confezionati su misura il recesso è escluso (art. 59 lett. c Codice del
  -- Consumo), e il cliente va avvisato PRIMA di comprare, non dopo.
  personalizzabile INTEGER NOT NULL DEFAULT 0 CHECK (personalizzabile IN (0, 1)),
  -- Un pezzo unico non viene riordinato: esaurito è esaurito. Cambia il
  -- messaggio mostrato quando la giacenza arriva a zero.
  pezzo_unico     INTEGER NOT NULL DEFAULT 1 CHECK (pezzo_unico IN (0, 1)),
  stato           TEXT    NOT NULL DEFAULT 'bozza'
                          CHECK (stato IN ('bozza', 'attivo', 'archiviato')),
  creato_il       TEXT    NOT NULL,
  aggiornato_il   TEXT    NOT NULL
);

CREATE INDEX idx_prodotti_vetrina  ON prodotti (stato, categoria_id);
CREATE INDEX idx_prodotti_categoria ON prodotti (categoria_id);

-- "base" è il nome del file senza estensione e senza larghezza (borsa-01):
-- da lì il frontend ricostruisce l'intero <picture> AVIF/WebP/JPEG con le
-- varianti responsive già presenti in public/assets/img, esattamente come fa
-- la home. Tenere qui l'URL completo significherebbe non poter più cambiare
-- i formati serviti senza riscrivere il database.
CREATE TABLE prodotti_immagini (
  id           INTEGER PRIMARY KEY,
  prodotto_id  INTEGER NOT NULL REFERENCES prodotti (id) ON DELETE CASCADE,
  base         TEXT    NOT NULL,
  alt          TEXT    NOT NULL,
  larghezza    INTEGER NOT NULL,
  altezza      INTEGER NOT NULL,
  posizione    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_immagini_prodotto ON prodotti_immagini (prodotto_id, posizione);

-- Prezzo e giacenza vivono QUI, non su prodotti: anche un pezzo unico ha la
-- sua variante "unica". Così un domani una borsa disponibile in tre colori
-- non richiede di cambiare schema, solo di inserire tre righe.
CREATE TABLE varianti (
  id           INTEGER PRIMARY KEY,
  prodotto_id  INTEGER NOT NULL REFERENCES prodotti (id) ON DELETE CASCADE,
  sku          TEXT    NOT NULL UNIQUE,
  nome         TEXT    NOT NULL DEFAULT 'Unica',
  prezzo_cent  INTEGER NOT NULL CHECK (prezzo_cent >= 0),
  peso_g       INTEGER NOT NULL DEFAULT 500 CHECK (peso_g >= 0),
  -- La giacenza non può scendere sotto zero nemmeno per un errore di codice:
  -- il vincolo fa fallire la transazione invece di vendere aria.
  giacenza     INTEGER NOT NULL DEFAULT 0 CHECK (giacenza >= 0),
  posizione    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_varianti_prodotto ON varianti (prodotto_id, posizione);

-- ------------------------------------------------------------- spedizioni

-- Scaglioni di peso. Si sceglie il primo scaglione con peso_max_g >= peso
-- totale del carrello; se nessuno basta, l'ordine non è spedibile in
-- automatico e il checkout lo dice invece di inventare una tariffa.
CREATE TABLE spedizioni_tariffe (
  id          INTEGER PRIMARY KEY,
  nome        TEXT    NOT NULL,
  peso_max_g  INTEGER NOT NULL CHECK (peso_max_g > 0),
  prezzo_cent INTEGER NOT NULL CHECK (prezzo_cent >= 0),
  attiva      INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1))
);

CREATE INDEX idx_tariffe_scaglione ON spedizioni_tariffe (attiva, peso_max_g);

-- ----------------------------------------------------------------- ordini

-- Contatore per la numerazione progressiva annuale. Sta in tabella e si
-- incrementa con UPDATE ... RETURNING dentro la stessa transazione
-- dell'ordine: leggere il massimo da "ordini" e sommarci uno darebbe due
-- ordini con lo stesso numero appena due persone comprano insieme.
CREATE TABLE contatori (
  chiave TEXT    PRIMARY KEY,
  valore INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ordini (
  id               INTEGER PRIMARY KEY,
  numero           TEXT    NOT NULL UNIQUE,
  -- 32 byte casuali in base64url. È l'unica cosa che protegge la pagina di
  -- stato dell'ordine, che non richiede registrazione: non va mai messo in
  -- un URL indicizzabile né mostrato a chi non ha ricevuto l'e-mail.
  token            TEXT    NOT NULL UNIQUE,
  stato            TEXT    NOT NULL
                           CHECK (stato IN ('in_attesa_pagamento', 'pagato',
                                            'confermato', 'in_lavorazione',
                                            'spedito', 'consegnato',
                                            'annullato', 'rimborsato')),
  metodo_pagamento TEXT    NOT NULL CHECK (metodo_pagamento IN ('paypal', 'contrassegno')),

  -- Dati del cliente: il minimo che serve a consegnare un pacco e a emettere
  -- un documento. Nessun campo "utile in futuro" — vedi docs/GDPR.
  email            TEXT    NOT NULL,
  nome             TEXT    NOT NULL,
  cognome          TEXT    NOT NULL,
  telefono         TEXT    NOT NULL,
  via              TEXT    NOT NULL,
  civico           TEXT    NOT NULL,
  cap              TEXT    NOT NULL,
  citta            TEXT    NOT NULL,
  provincia        TEXT    NOT NULL,
  note             TEXT    NOT NULL DEFAULT '',

  -- Totali congelati al momento dell'acquisto. Non si ricalcolano mai da
  -- "varianti": se domani il listino cambia, l'ordine di ieri deve restare
  -- quello di ieri. È un requisito fiscale prima che una comodità.
  subtotale_cent   INTEGER NOT NULL CHECK (subtotale_cent >= 0),
  spedizione_cent  INTEGER NOT NULL CHECK (spedizione_cent >= 0),
  supplemento_cent INTEGER NOT NULL DEFAULT 0 CHECK (supplemento_cent >= 0),
  totale_cent      INTEGER NOT NULL CHECK (totale_cent >= 0),
  -- IVA scorporata dal totale (prezzi esposti IVA inclusa, come impone la
  -- vendita al consumatore in Italia).
  iva_cent         INTEGER NOT NULL CHECK (iva_cent >= 0),
  aliquota_iva     INTEGER NOT NULL DEFAULT 22,

  -- Prova della presa visione dell'informativa privacy: testo, versione e
  -- momento. Serve a dimostrare l'adempimento dell'art. 13 GDPR.
  consenso_versione TEXT   NOT NULL,
  consenso_il       TEXT   NOT NULL,

  paypal_order_id  TEXT,
  paypal_capture_id TEXT,
  tracciatura      TEXT,
  corriere         TEXT,

  -- Momento oltre il quale un ordine mai pagato viene annullato e la
  -- giacenza liberata. NULL quando l'ordine non è più in attesa.
  scade_il         TEXT,
  creato_il        TEXT    NOT NULL,
  aggiornato_il    TEXT    NOT NULL,
  -- Impostato quando i dati personali vengono anonimizzati su richiesta
  -- dell'interessato: l'ordine resta per gli obblighi fiscali, la persona no.
  anonimizzato_il  TEXT
);

CREATE INDEX idx_ordini_stato    ON ordini (stato, creato_il DESC);
CREATE INDEX idx_ordini_scadenza ON ordini (stato, scade_il);
CREATE INDEX idx_ordini_email    ON ordini (email);
CREATE INDEX idx_ordini_paypal   ON ordini (paypal_order_id);

-- Copia dei dati del prodotto al momento dell'acquisto. Non si fa JOIN su
-- "varianti" per ricostruire un ordine vecchio: il prodotto potrebbe essere
-- stato rinominato, ripezzato o cancellato, e la riga d'ordine è un documento.
CREATE TABLE ordini_righe (
  id                 INTEGER PRIMARY KEY,
  ordine_id          INTEGER NOT NULL REFERENCES ordini (id) ON DELETE CASCADE,
  variante_id        INTEGER REFERENCES varianti (id),
  sku                TEXT    NOT NULL,
  nome_prodotto      TEXT    NOT NULL,
  nome_variante      TEXT    NOT NULL DEFAULT '',
  slug_prodotto      TEXT    NOT NULL DEFAULT '',
  personalizzazione  TEXT    NOT NULL DEFAULT '',
  -- Ricopiato dal prodotto: decide se su QUESTA riga il recesso si applica.
  -- Tenerlo qui, e non su "prodotti", significa che cambiare la scheda domani
  -- non riscrive le condizioni di un ordine già concluso.
  personalizzato     INTEGER NOT NULL DEFAULT 0 CHECK (personalizzato IN (0, 1)),
  prezzo_unitario_cent INTEGER NOT NULL CHECK (prezzo_unitario_cent >= 0),
  quantita           INTEGER NOT NULL CHECK (quantita > 0),
  peso_unitario_g    INTEGER NOT NULL DEFAULT 0,
  totale_cent        INTEGER NOT NULL CHECK (totale_cent >= 0)
);

CREATE INDEX idx_righe_ordine ON ordini_righe (ordine_id);

-- Traccia append-only di ogni cambio di stato. Non si aggiorna e non si
-- cancella: serve per le contestazioni sui pagamenti e per dimostrare cosa è
-- successo e quando (art. 5.2 GDPR, responsabilizzazione).
CREATE TABLE ordini_eventi (
  id         INTEGER PRIMARY KEY,
  ordine_id  INTEGER NOT NULL REFERENCES ordini (id) ON DELETE CASCADE,
  stato      TEXT    NOT NULL,
  nota       TEXT    NOT NULL DEFAULT '',
  -- 'sistema' | 'cliente' | 'admin' | 'paypal'
  origine    TEXT    NOT NULL DEFAULT 'sistema',
  creato_il  TEXT    NOT NULL
);

CREATE INDEX idx_eventi_ordine ON ordini_eventi (ordine_id, creato_il);

-- ------------------------------------------------------------------- GDPR

-- Prova del consenso, separata dall'ordine perché deve sopravvivere alla sua
-- anonimizzazione: si conserva l'hash dell'e-mail, non l'e-mail, così resta
-- dimostrabile che un consenso c'è stato senza tenere il dato personale.
CREATE TABLE consensi (
  id          INTEGER PRIMARY KEY,
  tipo        TEXT    NOT NULL,
  versione    TEXT    NOT NULL,
  testo       TEXT    NOT NULL,
  email_hash  TEXT    NOT NULL,
  ordine_numero TEXT,
  creato_il   TEXT    NOT NULL
);

CREATE INDEX idx_consensi_email ON consensi (email_hash);

-- ---------------------------------------------------- amministrazione

CREATE TABLE admin_sessioni (
  -- Solo l'hash SHA-256 del token: chi legge il database non può rubare una
  -- sessione attiva.
  token_hash TEXT PRIMARY KEY,
  csrf_hash  TEXT NOT NULL,
  creato_il  TEXT NOT NULL,
  scade_il   TEXT NOT NULL
);

CREATE INDEX idx_sessioni_scadenza ON admin_sessioni (scade_il);

-- Limitazione di frequenza. L'IP non compare mai in chiaro: si conserva un
-- hash con sale segreto, e le righe si cancellano dopo 24 ore.
CREATE TABLE limiti (
  chiave     TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL,
  conteggio  INTEGER NOT NULL DEFAULT 1,
  finestra   TEXT    NOT NULL,
  PRIMARY KEY (chiave, ip_hash, finestra)
);

CREATE INDEX idx_limiti_finestra ON limiti (finestra);
