/* =========================================================================
   EmmeLù — esercizio dei diritti dell'interessato e conservazione

   Questo file esiste perché una politica di conservazione scritta soltanto
   nell'informativa non è una politica: è una promessa. Qui la promessa
   diventa codice che cancella davvero.

   Il punto più delicato è la cancellazione. L'art. 17.3.b GDPR dice che il
   diritto all'oblio non prevale sull'obbligo legale di conservazione, e
   l'art. 2220 del Codice civile impone di tenere le scritture contabili per
   dieci anni. Le due norme non sono in conflitto: si cancella la PERSONA e si
   conserva il DOCUMENTO. Nome, indirizzo, e-mail e telefono vengono
   sovrascritti; numero, data e importi restano, perché quelli servono al
   fisco e non identificano più nessuno.
   ========================================================================= */

import { adesso, registra } from "./util.js";

/** Marcatore scritto al posto dei dati personali cancellati. */
const RIMOSSO = "(dato rimosso su richiesta)";

/**
 * Raccoglie tutto ciò che è conservato su una persona, a partire dalla sua
 * e-mail. È la risposta a una richiesta di accesso (art. 15) e di
 * portabilità (art. 20): il formato è JSON, che l'art. 20 considera
 * strutturato, di uso comune e leggibile da dispositivo automatico.
 *
 * NON include gli hash del consenso e dell'IP: sono dati pseudonimizzati che
 * non permettono di risalire alla persona senza il sale segreto, e restituirli
 * non aggiungerebbe nulla di comprensibile per chi ha fatto la richiesta.
 */
export async function esportaDatiPersona(db, email) {
  const normalizzata = String(email || "").trim().toLowerCase();
  if (!normalizzata) return null;

  const { results: ordini } = await db
    .prepare(
      `SELECT numero, stato, metodo_pagamento, creato_il,
              nome, cognome, email, telefono, via, civico, cap, citta, provincia, note,
              subtotale_cent, spedizione_cent, supplemento_cent, iva_cent, totale_cent,
              corriere, tracciatura, consenso_versione, consenso_il, anonimizzato_il
         FROM ordini WHERE email = ?1 ORDER BY creato_il`
    )
    .bind(normalizzata)
    .all();

  const completi = [];
  for (const ordine of ordini || []) {
    const { results: righe } = await db
      .prepare(
        `SELECT r.sku, r.nome_prodotto, r.nome_variante, r.personalizzazione,
                r.prezzo_unitario_cent, r.quantita, r.totale_cent
           FROM ordini_righe r
           JOIN ordini o ON o.id = r.ordine_id
          WHERE o.numero = ?1 ORDER BY r.id`
      )
      .bind(ordine.numero)
      .all();
    completi.push({ ...ordine, righe: righe || [] });
  }

  return {
    generato_il: adesso(),
    email: normalizzata,
    ordini: completi,
    nota:
      "Questo file contiene tutti i dati personali conservati su di te. " +
      "Gli importi sono in centesimi di euro. Non conserviamo altro: nessun " +
      "profilo, nessuna cronologia di navigazione, nessun dato pubblicitario.",
  };
}

/**
 * Anonimizza un singolo ordine.
 *
 * Sovrascrive i dati personali e lascia intatti numero, date, importi e righe
 * — con l'unica eccezione della personalizzazione, che può contenere un nome
 * proprio (“iniziali A.B.”, una dedica) e quindi va rimossa anch'essa.
 *
 * L'operazione è **irreversibile per costruzione**: non si sposta il dato in
 * una tabella d'archivio, lo si sovrascrive. Una cancellazione che lascia una
 * copia da qualche parte non è una cancellazione.
 *
 * Restituisce `false` se l'ordine non esiste o era già stato anonimizzato:
 * ripetere l'operazione non deve riscrivere la data e far sembrare recente
 * una cancellazione vecchia.
 */
export async function anonimizzaOrdine(db, numero) {
  const ordine = await db
    .prepare(`SELECT id, anonimizzato_il FROM ordini WHERE numero = ?1`)
    .bind(numero)
    .first();

  if (!ordine) return { ok: false, codice: "inesistente" };
  if (ordine.anonimizzato_il) return { ok: false, codice: "gia_anonimizzato" };

  const ora = adesso();
  await db.batch([
    db
      .prepare(
        `UPDATE ordini SET
            email = ?1, nome = ?2, cognome = ?2, telefono = ?2,
            via = ?2, civico = '', cap = '00000', citta = ?2, provincia = 'XX',
            note = '', tracciatura = NULL,
            anonimizzato_il = ?3, aggiornato_il = ?3
          WHERE id = ?4`
      )
      // L'e-mail diventa un valore univoco e non recapitabile: non si può
      // lasciarla vuota perché più ordini anonimizzati genererebbero righe
      // indistinguibili, e non si può lasciare un dominio reale.
      .bind(`rimosso+${ordine.id}@invalid`, RIMOSSO, ora, ordine.id),
    db
      .prepare(`UPDATE ordini_righe SET personalizzazione = '' WHERE ordine_id = ?1`)
      .bind(ordine.id),
    db
      .prepare(
        `INSERT INTO ordini_eventi (ordine_id, stato, nota, origine, creato_il)
              SELECT id, stato, 'Dati personali rimossi su richiesta dell''interessato (art. 17 GDPR). Dati fiscali conservati per obbligo di legge.', 'admin', ?1
                FROM ordini WHERE id = ?2`
      )
      .bind(ora, ordine.id),
  ]);

  registra("info", "ordine anonimizzato", { numero });
  return { ok: true };
}

/**
 * Anonimizza tutti gli ordini di una persona. È la forma in cui si esegue
 * davvero una richiesta di cancellazione: le richieste arrivano per indirizzo
 * e-mail, non per numero d'ordine.
 */
export async function cancellaPersona(db, email) {
  const normalizzata = String(email || "").trim().toLowerCase();
  if (!normalizzata) return { ok: false, codice: "email_mancante" };

  const { results } = await db
    .prepare(`SELECT numero FROM ordini WHERE email = ?1 AND anonimizzato_il IS NULL`)
    .bind(normalizzata)
    .all();

  let fatti = 0;
  for (const riga of results || []) {
    const esito = await anonimizzaOrdine(db, riga.numero);
    if (esito.ok) fatti += 1;
  }

  registra("info", "richiesta di cancellazione eseguita", { ordini: fatti });
  return { ok: true, ordiniAnonimizzati: fatti };
}

/**
 * Anonimizza gli ordini più vecchi del termine fiscale.
 *
 * Dieci anni sono il tempo per cui il Codice civile impone di conservare le
 * scritture: oltre, l'obbligo di legge che giustificava la conservazione non
 * esiste più, e tenere ancora nome e indirizzo violerebbe il principio di
 * limitazione della conservazione (art. 5.1.e GDPR).
 *
 * La chiama il cron. In un negozio nato oggi non farà nulla per dieci anni,
 * ed è esattamente il punto: la regola va scritta adesso, perché fra dieci
 * anni nessuno si ricorderà di scriverla.
 */
export async function anonimizzaOrdiniOltreTermine(db, anni = 10) {
  const limite = new Date(Date.now() - anni * 365.25 * 86_400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT numero FROM ordini
        WHERE creato_il < ?1 AND anonimizzato_il IS NULL
        LIMIT 200`
    )
    .bind(limite)
    .all();

  let fatti = 0;
  for (const riga of results || []) {
    const esito = await anonimizzaOrdine(db, riga.numero);
    if (esito.ok) fatti += 1;
  }
  if (fatti > 0) registra("info", "ordini anonimizzati per scadenza del termine fiscale", { fatti });
  return fatti;
}
