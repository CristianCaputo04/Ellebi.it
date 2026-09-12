-- =========================================================================
-- EmmeLù — dati iniziali
--
-- Si applica DOPO 0001-schema.sql. È scritta per poter essere rieseguita
-- senza danni: gli INSERT usano ON CONFLICT DO NOTHING o DO UPDATE, così
-- rilanciarla non duplica le categorie e non azzera le giacenze di un
-- negozio già avviato.
--
-- IMPORTANTE — I PREZZI SONO UNA STIMA DA CONFERMARE.
-- La titolare non ha ancora comunicato un listino. I valori qui sotto sono
-- un punto di partenza plausibile per pouch e mini bag all'uncinetto fatte a
-- mano, e vanno rivisti prima di aprire il negozio: si cambiano dal pannello
-- (/admin/magazzino per le giacenze) o con un UPDATE su "varianti".
-- =========================================================================

-- ------------------------------------------------------------ categorie
-- Le nove linee dichiarate nella comunicazione del marchio. L'ordine è
-- quello della card ufficiale delle collezioni.

INSERT INTO categorie (slug, nome, descrizione, posizione, attiva) VALUES
  ('borse',               'Borse',               'Eleganza e funzionalità in ogni dettaglio.', 1, 1),
  ('piccola-pelletteria', 'Piccola Pelletteria', 'Piccoli dettagli, grande personalità.',      2, 1),
  ('abbigliamento',       'Abbigliamento',       'Capi versatili e senza tempo.',              3, 1),
  ('accessori',           'Accessori',           'Completa il tuo stile con unicità.',         4, 1),
  ('gioielli',            'Gioielli',            'Luce ai tuoi momenti più speciali.',         5, 1),
  ('lingerie',            'Lingerie',            'Femminilità a contatto con la pelle.',       6, 1),
  ('beachwear',           'Beachwear',           'Stile che ti accompagna ovunque.',           7, 1),
  ('linea-home',          'Linea Home',          'La bellezza di sentirsi a casa.',            8, 1),
  ('linea-baby',          'Linea Baby',          'Dolcezza per i suoi primi momenti.',         9, 1)
ON CONFLICT (slug) DO UPDATE SET
  nome = excluded.nome,
  descrizione = excluded.descrizione,
  posizione = excluded.posizione;

-- ---------------------------------------------------------- spedizioni
-- Scaglioni indicativi per la spedizione tracciata in Italia. Si sceglie il
-- primo scaglione capiente: sotto i 500 g la tariffa piccola, e così via.
-- Oltre i 5 kg non è previsto nulla, e il checkout lo dice invece di
-- inventare un prezzo — è la situazione in cui conviene sentirsi prima.

INSERT INTO spedizioni_tariffe (id, nome, peso_max_g, prezzo_cent, attiva) VALUES
  (1, 'Spedizione tracciata — fino a 500 g',  500, 600, 1),
  (2, 'Spedizione tracciata — fino a 2 kg',  2000, 750, 1),
  (3, 'Spedizione tracciata — fino a 5 kg',  5000, 990, 1)
ON CONFLICT (id) DO UPDATE SET
  nome = excluded.nome,
  peso_max_g = excluded.peso_max_g,
  prezzo_cent = excluded.prezzo_cent,
  attiva = excluded.attiva;

-- ------------------------------------------------------------- prodotti
-- Le quattro borse realmente fotografate. Sono le uniche di cui esistono
-- immagini: le altre linee entrano nel catalogo quando ci saranno le foto.
--
-- Tutte "attivo", "pezzo unico" e "personalizzabile": corrisponde a quello
-- che il marchio dichiara — capsule limited edition, alcuni pezzi mai più
-- replicati, ogni linea personalizzabile su richiesta.

INSERT INTO prodotti
  (slug, categoria_id, nome, sottotitolo, descrizione, materiale, colore,
   personalizzabile, pezzo_unico, stato, creato_il, aggiornato_il)
SELECT 'nuvola', c.id, 'Nuvola',
       'Pouch morbida in filato tortora',
       'Pouch morbida lavorata a mano in fettuccia di cotone tortora, con bordo intrecciato. Morbida al tatto e ferma nella forma: il filato pesante la tiene in piedi senza rinforzi rigidi interni. Capsule limited edition, pezzo unico.',
       'Fettuccia di cotone', 'Tortora',
       1, 1, 'attivo', datetime('now'), datetime('now')
  FROM categorie c WHERE c.slug = 'borse'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO prodotti
  (slug, categoria_id, nome, sottotitolo, descrizione, materiale, colore,
   personalizzabile, pezzo_unico, stato, creato_il, aggiornato_il)
SELECT 'perla', c.id, 'Perla',
       'Mini bag cacao con manico rigido',
       'Mini bag color cacao con manico rigido e tre perle cucite a mano, una a una. La lavorazione fitta della fettuccia di cotone regge la forma anche da vuota. Capsule limited edition, pezzo unico.',
       'Fettuccia di cotone', 'Cacao',
       1, 1, 'attivo', datetime('now'), datetime('now')
  FROM categorie c WHERE c.slug = 'borse'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO prodotti
  (slug, categoria_id, nome, sottotitolo, descrizione, materiale, colore,
   personalizzabile, pezzo_unico, stato, creato_il, aggiornato_il)
SELECT 'sera', c.id, 'Sera',
       'Pouch cioccolato con filo lurex',
       'Pouch in fettuccia di cotone cioccolato attraversata da un filo lurex dorato, che si accende con la luce radente. Pensata per le occasioni serali. Capsule limited edition, pezzo unico.',
       'Fettuccia di cotone e lurex', 'Cioccolato',
       1, 1, 'attivo', datetime('now'), datetime('now')
  FROM categorie c WHERE c.slug = 'borse'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO prodotti
  (slug, categoria_id, nome, sottotitolo, descrizione, materiale, colore,
   personalizzabile, pezzo_unico, stato, creato_il, aggiornato_il)
SELECT 'cacao', c.id, 'Cacao',
       'Pouch capiente in cioccolato opaco',
       'Pouch capiente in fettuccia di cotone cioccolato opaco: la misura che entra in borsa o si porta da sola, senza rinunciare alla forma. Capsule limited edition, pezzo unico.',
       'Fettuccia di cotone', 'Cioccolato opaco',
       1, 1, 'attivo', datetime('now'), datetime('now')
  FROM categorie c WHERE c.slug = 'borse'
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------- immagini
-- "base" è il nome del file senza estensione e senza larghezza: da lì il
-- frontend ricostruisce l'intero <picture> con le varianti responsive già
-- presenti in public/assets/img. Le dimensioni dichiarate sono quelle reali
-- dei file, e servono a non far saltare il layout durante il caricamento.

-- D1 pone un limite basso al numero di rami di una SELECT composta, quindi
-- niente catene di UNION ALL: una inserzione per riga, con un NOT EXISTS che
-- rende la migrazione ripetibile senza duplicare le immagini.

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-01', 'La pouch Nuvola in filato tortora con bordo intrecciato, tenuta in mano', 900, 1200, 0
  FROM prodotti WHERE slug = 'nuvola'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-01');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-01b', 'Dettaglio ravvicinato del punto della pouch Nuvola', 900, 1200, 1
  FROM prodotti WHERE slug = 'nuvola'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-01b');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-02', 'La mini bag Perla color cacao con manico rigido e tre perle cucite a mano', 900, 1200, 0
  FROM prodotti WHERE slug = 'perla'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-02');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-02b', 'Dettaglio del manico rigido e delle perle della mini bag Perla', 900, 1200, 1
  FROM prodotti WHERE slug = 'perla'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-02b');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-03', 'La pouch Sera in filato cioccolato attraversato da lurex dorato', 900, 1200, 0
  FROM prodotti WHERE slug = 'sera'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-03');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-03b', 'Dettaglio del filo lurex dorato della pouch Sera', 900, 1200, 1
  FROM prodotti WHERE slug = 'sera'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-03b');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-04', 'La pouch capiente Cacao in filato cioccolato opaco, tenuta in mano', 900, 1200, 0
  FROM prodotti WHERE slug = 'cacao'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-04');

INSERT INTO prodotti_immagini (prodotto_id, base, alt, larghezza, altezza, posizione)
SELECT id, 'borsa-04b', 'Dettaglio della trama fitta della pouch Cacao', 900, 1200, 1
  FROM prodotti WHERE slug = 'cacao'
   AND NOT EXISTS (SELECT 1 FROM prodotti_immagini WHERE prodotto_id = prodotti.id AND base = 'borsa-04b');

-- ------------------------------------------------------------- varianti
-- Prezzo e giacenza vivono qui. Un pezzo unico ha comunque la sua variante
-- "Unica" con giacenza 1: quando viene venduto scende a 0 e il catalogo lo
-- mostra esaurito, senza cancellare la scheda — resta come prova del lavoro.
--
-- ON CONFLICT DO NOTHING sullo SKU: rieseguire questa migrazione NON deve
-- riportare a 1 la giacenza di un pezzo gia' venduto.
--
-- Il peso e' quello stimato del pezzo imballato e determina lo scaglione di
-- spedizione: sbagliarlo per difetto significa spedire in perdita.

INSERT INTO varianti (prodotto_id, sku, nome, prezzo_cent, peso_g, giacenza, posizione)
SELECT id, 'NUV-U', 'Unica', 8500, 450, 1, 0 FROM prodotti WHERE slug = 'nuvola'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO varianti (prodotto_id, sku, nome, prezzo_cent, peso_g, giacenza, posizione)
SELECT id, 'PER-U', 'Unica', 9500, 500, 1, 0 FROM prodotti WHERE slug = 'perla'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO varianti (prodotto_id, sku, nome, prezzo_cent, peso_g, giacenza, posizione)
SELECT id, 'SER-U', 'Unica', 9000, 420, 1, 0 FROM prodotti WHERE slug = 'sera'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO varianti (prodotto_id, sku, nome, prezzo_cent, peso_g, giacenza, posizione)
SELECT id, 'CAC-U', 'Unica', 8000, 480, 1, 0 FROM prodotti WHERE slug = 'cacao'
ON CONFLICT (sku) DO NOTHING;
