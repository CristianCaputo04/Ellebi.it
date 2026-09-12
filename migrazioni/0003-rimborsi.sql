-- =========================================================================
-- EmmeLù — registro dei rimborsi
--
-- I rimborsi hanno una tabella propria e non una colonna su "ordini" per un
-- motivo concreto: un ordine può essere rimborsato più volte — un pezzo su
-- tre restituito oggi, un altro fra due settimane — e con una sola colonna
-- la seconda operazione cancellerebbe la traccia della prima.
--
-- È inoltre un registro CONTABILE: ogni riga corrisponde a denaro uscito, e
-- va conservata quanto l'ordine a cui si riferisce (dieci anni, art. 2220
-- c.c.). Per questo non si aggiorna e non si cancella mai: si aggiunge.
-- =========================================================================

CREATE TABLE rimborsi (
  id             INTEGER PRIMARY KEY,
  ordine_id      INTEGER NOT NULL REFERENCES ordini (id) ON DELETE CASCADE,
  importo_cent   INTEGER NOT NULL CHECK (importo_cent > 0),
  -- 'recesso' | 'difetto' | 'non_disponibile' | 'errore_ordine' | 'altro'
  motivo         TEXT    NOT NULL,
  nota           TEXT    NOT NULL DEFAULT '',
  -- Identificativo restituito da PayPal, oppure vuoto per i rimborsi fatti a
  -- mano fuori dal sistema (il contrassegno si restituisce con un bonifico).
  riferimento    TEXT    NOT NULL DEFAULT '',
  metodo         TEXT    NOT NULL DEFAULT 'paypal' CHECK (metodo IN ('paypal', 'manuale')),
  creato_il      TEXT    NOT NULL
);

CREATE INDEX idx_rimborsi_ordine ON rimborsi (ordine_id, creato_il);

-- Chiave di idempotenza dei rimborsi PayPal.
--
-- Serve a impedire il doppio rimborso: se la titolare preme due volte, o se
-- la risposta di PayPal si perde e lei riprova, senza questo vincolo il
-- denaro uscirebbe due volte. La chiave si costruisce dall'ordine e
-- dall'importo, e l'UNIQUE fa fallire la seconda scrittura invece di
-- lasciarla passare.
CREATE TABLE rimborsi_chiavi (
  chiave    TEXT PRIMARY KEY,
  creato_il TEXT NOT NULL
);
