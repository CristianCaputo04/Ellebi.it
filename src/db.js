/* =========================================================================
   EmmeLù — accesso al database D1

   Tutte le query del progetto passano da qui. Il motivo non è l'eleganza: è
   che così esiste un solo file in cui verificare che si usino sempre query
   parametriche. Una concatenazione di stringhe SQL nascosta in un modulo
   qualsiasi è un'iniezione che nessuno rivede più.
   ========================================================================= */

import { adesso } from "./util.js";

/* ------------------------------------------------------------- catalogo */

/** Le categorie attive, nell'ordine scelto dalla titolare. */
export async function categorieAttive(db) {
  const { results } = await db
    .prepare(
      `SELECT id, slug, nome, descrizione, posizione
         FROM categorie
        WHERE attiva = 1
        ORDER BY posizione, nome`
    )
    .all();
  return results || [];
}

/**
 * I prodotti in vetrina, con prezzo minimo e disponibilità già aggregati.
 *
 * L'aggregazione si fa in SQL e non in JavaScript perché altrimenti servirebbe
 * una query per prodotto per sapere se è disponibile: con nove linee e un
 * catalogo che cresce diventano decine di andate e ritorno su ogni
 * caricamento del catalogo.
 */
export async function prodottiInVetrina(db, { categoriaSlug = null } = {}) {
  const condizione = categoriaSlug ? "AND c.slug = ?1" : "";
  const query = `
    SELECT p.id, p.slug, p.nome, p.sottotitolo, p.materiale, p.colore,
           p.personalizzabile, p.pezzo_unico,
           c.slug AS categoria_slug, c.nome AS categoria_nome,
           MIN(v.prezzo_cent)        AS prezzo_cent,
           COALESCE(SUM(v.giacenza), 0) AS giacenza_totale
      FROM prodotti p
      JOIN categorie c ON c.id = p.categoria_id
      LEFT JOIN varianti v ON v.prodotto_id = p.id
     WHERE p.stato = 'attivo' AND c.attiva = 1 ${condizione}
     GROUP BY p.id
     ORDER BY c.posizione, p.nome`;

  const preparata = categoriaSlug
    ? db.prepare(query).bind(categoriaSlug)
    : db.prepare(query);
  const { results } = await preparata.all();
  const prodotti = results || [];
  if (prodotti.length === 0) return [];

  // Le immagini si prendono in una sola query per tutti i prodotti e si
  // ricuciono qui: una query per prodotto sarebbe il classico problema N+1.
  const immagini = await immaginiDi(db, prodotti.map((p) => p.id));

  return prodotti.map((p) => ({
    ...p,
    disponibile: p.giacenza_totale > 0,
    immagini: immagini.get(p.id) || [],
  }));
}

/** Le immagini di più prodotti in un colpo solo, raggruppate per prodotto. */
async function immaginiDi(db, idProdotti) {
  if (idProdotti.length === 0) return new Map();
  // I segnaposto si generano dal NUMERO di elementi, non dai loro valori:
  // gli id restano sempre legati come parametri.
  const segnaposto = idProdotti.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT prodotto_id, base, alt, larghezza, altezza
         FROM prodotti_immagini
        WHERE prodotto_id IN (${segnaposto})
        ORDER BY prodotto_id, posizione`
    )
    .bind(...idProdotti)
    .all();

  const per = new Map();
  for (const riga of results || []) {
    if (!per.has(riga.prodotto_id)) per.set(riga.prodotto_id, []);
    per.get(riga.prodotto_id).push(riga);
  }
  return per;
}

/** Un prodotto completo: anagrafica, immagini, varianti. `null` se non c'è. */
export async function prodottoPerSlug(db, slug) {
  const prodotto = await db
    .prepare(
      `SELECT p.*, c.slug AS categoria_slug, c.nome AS categoria_nome,
              c.descrizione AS categoria_descrizione
         FROM prodotti p
         JOIN categorie c ON c.id = p.categoria_id
        WHERE p.slug = ?1 AND p.stato = 'attivo'`
    )
    .bind(slug)
    .first();
  if (!prodotto) return null;

  const [immagini, varianti] = await Promise.all([
    db
      .prepare(
        `SELECT base, alt, larghezza, altezza
           FROM prodotti_immagini WHERE prodotto_id = ?1 ORDER BY posizione`
      )
      .bind(prodotto.id)
      .all(),
    db
      .prepare(
        `SELECT id, sku, nome, prezzo_cent, peso_g, giacenza
           FROM varianti WHERE prodotto_id = ?1 ORDER BY posizione, id`
      )
      .bind(prodotto.id)
      .all(),
  ]);

  const listaVarianti = varianti.results || [];
  return {
    ...prodotto,
    immagini: immagini.results || [],
    varianti: listaVarianti,
    prezzo_cent: listaVarianti.length
      ? Math.min(...listaVarianti.map((v) => v.prezzo_cent))
      : 0,
    disponibile: listaVarianti.some((v) => v.giacenza > 0),
  };
}

/**
 * Le varianti richieste, indicizzate per SKU, con i dati del prodotto padre.
 *
 * È la lettura su cui si basa ogni calcolo di prezzo: deve restituire prezzo e
 * giacenza **del momento**, mai valori messi in cache. Un prezzo in cache è un
 * prezzo sbagliato che finisce in una fattura.
 */
export async function variantiPerSku(db, sku) {
  const unici = [...new Set(sku.map(String))].filter(Boolean).slice(0, 50);
  if (unici.length === 0) return new Map();

  const segnaposto = unici.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT v.id, v.sku, v.nome, v.prezzo_cent, v.peso_g, v.giacenza,
              p.id   AS prodotto_id,
              p.nome AS nome_prodotto,
              p.slug AS slug_prodotto,
              p.personalizzabile,
              p.pezzo_unico
         FROM varianti v
         JOIN prodotti p ON p.id = v.prodotto_id
        WHERE v.sku IN (${segnaposto}) AND p.stato = 'attivo'`
    )
    .bind(...unici)
    .all();

  return new Map((results || []).map((v) => [v.sku, v]));
}

/* ----------------------------------------------------------- spedizioni */

export async function tariffeAttive(db) {
  const { results } = await db
    .prepare(
      `SELECT id, nome, peso_max_g, prezzo_cent, attiva
         FROM spedizioni_tariffe WHERE attiva = 1 ORDER BY peso_max_g`
    )
    .all();
  return results || [];
}

/* --------------------------------------------------------------- ordini */

/** Un ordine per numero, con righe ed eventi. `null` se non esiste. */
export async function ordinePerNumero(db, numero) {
  const ordine = await db
    .prepare(`SELECT * FROM ordini WHERE numero = ?1`)
    .bind(numero)
    .first();
  if (!ordine) return null;

  const [righe, eventi] = await Promise.all([
    db
      .prepare(`SELECT * FROM ordini_righe WHERE ordine_id = ?1 ORDER BY id`)
      .bind(ordine.id)
      .all(),
    db
      .prepare(
        `SELECT stato, nota, origine, creato_il
           FROM ordini_eventi WHERE ordine_id = ?1 ORDER BY creato_il, id`
      )
      .bind(ordine.id)
      .all(),
  ]);

  return { ordine, righe: righe.results || [], eventi: eventi.results || [] };
}

/** Un ordine a partire dal riferimento PayPal, per il webhook. */
export async function ordinePerPaypal(db, paypalOrderId) {
  return db
    .prepare(`SELECT * FROM ordini WHERE paypal_order_id = ?1`)
    .bind(paypalOrderId)
    .first();
}

/** Elenco per il pannello, filtrabile e impaginato. */
export async function elencoOrdini(db, { stato = null, pagina = 1, perPagina = 25 } = {}) {
  const salto = Math.max(0, (pagina - 1) * perPagina);
  const filtro = stato ? "WHERE stato = ?3" : "";
  const query = `SELECT * FROM ordini ${filtro} ORDER BY creato_il DESC LIMIT ?1 OFFSET ?2`;

  // Si chiede una riga in più del necessario: se torna, esiste una pagina
  // successiva. Evita una seconda query di conteggio su tutta la tabella.
  const preparata = stato
    ? db.prepare(query).bind(perPagina + 1, salto, stato)
    : db.prepare(query).bind(perPagina + 1, salto);

  const { results } = await preparata.all();
  const righe = results || [];
  const altrePagine = righe.length > perPagina;
  return { ordini: righe.slice(0, perPagina), altrePagine };
}

/** Quanti ordini per stato, per i contatori del pannello. */
export async function conteggiOrdini(db) {
  const { results } = await db
    .prepare(`SELECT stato, COUNT(*) AS quanti FROM ordini GROUP BY stato`)
    .all();
  const conteggi = {
    in_attesa_pagamento: 0, pagato: 0, confermato: 0, in_lavorazione: 0,
    spedito: 0, consegnato: 0, annullato: 0, rimborsato: 0, tutti: 0,
  };
  for (const r of results || []) {
    conteggi[r.stato] = r.quanti;
    conteggi.tutti += r.quanti;
  }
  return conteggi;
}

/* ------------------------------------------------------------ magazzino */

/** Tutti i prodotti con le loro varianti, per la pagina magazzino. */
export async function prodottiConVarianti(db) {
  const { results: prodotti } = await db
    .prepare(
      `SELECT p.id, p.slug, p.nome, p.stato, c.nome AS categoria_nome
         FROM prodotti p JOIN categorie c ON c.id = p.categoria_id
        ORDER BY c.posizione, p.nome`
    )
    .all();
  const { results: varianti } = await db
    .prepare(
      `SELECT id, prodotto_id, sku, nome, prezzo_cent, giacenza
         FROM varianti ORDER BY prodotto_id, posizione, id`
    )
    .all();

  const per = new Map();
  for (const v of varianti || []) {
    if (!per.has(v.prodotto_id)) per.set(v.prodotto_id, []);
    per.get(v.prodotto_id).push(v);
  }
  return (prodotti || []).map((p) => ({ ...p, varianti: per.get(p.id) || [] }));
}

/* -------------------------------------------------- limitazione frequenza */

/**
 * Conta e limita le richieste per chiave e per chiamante.
 *
 * La finestra è un blocco di tempo arrotondato (non scorrevole): è meno
 * preciso di una finestra scorrevole, ma richiede una sola riga e una sola
 * scrittura invece di una riga per richiesta. Su un negozio artigianale la
 * differenza di precisione non ha conseguenze, quella di costo sì.
 *
 * L'IP arriva qui **già sotto forma di hash con sale**: questa funzione non
 * deve mai vedere un indirizzo in chiaro.
 */
export async function consumaLimite(db, { chiave, ipHash, massimo, minutiFinestra }) {
  const finestra = new Date(
    Math.floor(Date.now() / (minutiFinestra * 60_000)) * minutiFinestra * 60_000
  ).toISOString();

  await db
    .prepare(
      `INSERT INTO limiti (chiave, ip_hash, conteggio, finestra)
            VALUES (?1, ?2, 1, ?3)
       ON CONFLICT (chiave, ip_hash, finestra)
       DO UPDATE SET conteggio = conteggio + 1`
    )
    .bind(chiave, ipHash, finestra)
    .run();

  const riga = await db
    .prepare(
      `SELECT conteggio FROM limiti
        WHERE chiave = ?1 AND ip_hash = ?2 AND finestra = ?3`
    )
    .bind(chiave, ipHash, finestra)
    .first();

  const conteggio = riga ? riga.conteggio : 1;
  return { consentito: conteggio <= massimo, conteggio };
}

/* ------------------------------------------------------------- pulizia */

/**
 * Cancella ciò che non va più conservato. La chiama il cron.
 *
 * Ogni termine qui dentro corrisponde a una riga di `docs/CONSERVAZIONE-DATI.md`:
 * se si cambia uno, si cambia anche l'altro. Una conservazione più lunga di
 * quella dichiarata nell'informativa è una violazione dell'art. 5.1.e GDPR.
 */
export async function pulisciDatiScaduti(db) {
  const ora = adesso();
  const ventiquattroOreFa = new Date(Date.now() - 24 * 3600_000).toISOString();
  const trentaGiorniFa = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const esiti = await db.batch([
    // Sessioni amministrative scadute.
    db.prepare(`DELETE FROM admin_sessioni WHERE scade_il < ?1`).bind(ora),
    // Contatori della limitazione di frequenza: 24 ore, come dichiarato.
    db.prepare(`DELETE FROM limiti WHERE finestra < ?1`).bind(ventiquattroOreFa),
    // Ordini mai andati a buon fine: dopo 30 giorni non servono più a nulla,
    // e restano dati personali di persone che non hanno comprato niente.
    db
      .prepare(
        `DELETE FROM ordini
          WHERE stato = 'annullato' AND creato_il < ?1 AND anonimizzato_il IS NULL`
      )
      .bind(trentaGiorniFa),
  ]);

  return {
    sessioni: esiti[0].meta.changes,
    limiti: esiti[1].meta.changes,
    ordiniAnnullati: esiti[2].meta.changes,
  };
}
