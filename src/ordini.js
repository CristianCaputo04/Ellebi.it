/* =========================================================================
   EmmeLù — ciclo di vita degli ordini

   Due cose in questo file vanno lette prima di modificarlo.

   1. LA GIACENZA SI DECREMENTA IN MODO CONDIZIONALE, MAI LEGGENDO E POI
      SCRIVENDO. Fra una lettura e una scrittura separate ci sta un altro
      ordine, e su un catalogo fatto di pezzi unici questo significa vendere
      due volte la stessa borsa. L'unica forma corretta è
      `UPDATE ... WHERE giacenza >= ?`, guardando quante righe sono cambiate.

   2. GLI STATI NON SONO ETICHETTE, SONO UNA MACCHINA. Le transizioni lecite
      sono dichiarate qui e verificate qui, non nell'interfaccia: un pannello
      che mostra solo i pulsanti giusti non impedisce a una richiesta
      costruita a mano di portare un ordine da "annullato" a "spedito".
   ========================================================================= */

import {
  adesso, fraMinuti, tokenCasuale, hashConSale, testoPulito,
  emailValida, capValido, provinciaValida, telefonoValido, registra,
} from "./util.js";
import { calcolaOrdine } from "./prezzi.js";
import { variantiPerSku, tariffeAttive } from "./db.js";

/**
 * Le transizioni di stato ammesse.
 *
 * Chiave: stato di partenza. Valore: stati in cui si può andare.
 * Uno stato assente, o un elenco vuoto, è definitivo.
 */
export const TRANSIZIONI = {
  in_attesa_pagamento: ["pagato", "annullato"],
  pagato: ["in_lavorazione", "annullato", "rimborsato"],
  confermato: ["in_lavorazione", "annullato"],
  in_lavorazione: ["spedito", "annullato"],
  spedito: ["consegnato"],
  // Da "consegnato" si può ancora rimborsare: è esattamente ciò che succede
  // quando il cliente esercita il recesso entro i quattordici giorni.
  consegnato: ["rimborsato"],
  annullato: [],
  rimborsato: [],
};

/** Gli stati in cui l'ordine tiene bloccata della giacenza. */
const STATI_CHE_IMPEGNANO = new Set([
  "in_attesa_pagamento", "pagato", "confermato", "in_lavorazione", "spedito", "consegnato",
]);

/** Etichette leggibili, usate nelle e-mail e nelle pagine. */
export const ETICHETTE_STATO = {
  in_attesa_pagamento: "In attesa di pagamento",
  pagato: "Pagato",
  confermato: "Confermato",
  in_lavorazione: "In lavorazione",
  spedito: "Spedito",
  consegnato: "Consegnato",
  annullato: "Annullato",
  rimborsato: "Rimborsato",
};

/** Dice se una transizione è lecita. Unica fonte di verità sul punto. */
export function transizioneAmmessa(da, a) {
  return Array.isArray(TRANSIZIONI[da]) && TRANSIZIONI[da].includes(a);
}

/* --------------------------------------------------------- validazione */

const LUNGHEZZE = {
  nome: 60, cognome: 60, email: 254, telefono: 30,
  via: 120, civico: 12, cap: 5, citta: 60, provincia: 2, note: 500,
};

/**
 * Normalizza e verifica i dati del cliente arrivati dal modulo.
 *
 * Garantisce che l'oggetto restituito contenga **solo** i campi previsti, già
 * ripuliti e troncati. Costruire l'ordine copiando l'intero corpo della
 * richiesta sarebbe il modo più semplice per farsi scrivere in tabella campi
 * che nessuno ha previsto.
 *
 * Restituisce `{ dati, errori }`: `errori` è un oggetto campo → motivo, così
 * il frontend può evidenziare il campo giusto invece di dire "modulo errato".
 */
export function validaCliente(grezzo) {
  const g = grezzo && typeof grezzo === "object" ? grezzo : {};
  const errori = {};

  const dati = {
    nome: testoPulito(g.nome, LUNGHEZZE.nome),
    cognome: testoPulito(g.cognome, LUNGHEZZE.cognome),
    email: testoPulito(g.email, LUNGHEZZE.email).toLowerCase(),
    telefono: testoPulito(g.telefono, LUNGHEZZE.telefono),
    via: testoPulito(g.via, LUNGHEZZE.via),
    civico: testoPulito(g.civico, LUNGHEZZE.civico),
    cap: testoPulito(g.cap, LUNGHEZZE.cap),
    citta: testoPulito(g.citta, LUNGHEZZE.citta),
    provincia: testoPulito(g.provincia, LUNGHEZZE.provincia).toUpperCase(),
    note: testoPulito(g.note, LUNGHEZZE.note),
  };

  if (dati.nome.length < 2) errori.nome = "Serve il nome.";
  if (dati.cognome.length < 2) errori.cognome = "Serve il cognome.";
  if (!emailValida(dati.email)) errori.email = "L'indirizzo e-mail non sembra valido.";
  if (!telefonoValido(dati.telefono)) errori.telefono = "Serve un telefono raggiungibile: lo usa il corriere.";
  if (dati.via.length < 3) errori.via = "Serve l'indirizzo.";
  if (dati.civico.length < 1) errori.civico = "Serve il numero civico.";
  if (!capValido(dati.cap)) errori.cap = "Il CAP è di cinque cifre.";
  if (dati.citta.length < 2) errori.citta = "Serve la città.";
  if (!provinciaValida(dati.provincia)) errori.provincia = "Sigla di provincia non riconosciuta.";

  return { dati, errori, valido: Object.keys(errori).length === 0 };
}

/**
 * Estrae le righe richieste dal corpo della richiesta.
 *
 * Prende solo SKU, quantità e personalizzazione: tutto il resto — in
 * particolare qualunque prezzo il browser volesse suggerire — viene scartato
 * senza nemmeno guardarlo.
 */
export function normalizzaRighe(grezzo) {
  if (!Array.isArray(grezzo)) return [];
  return grezzo.slice(0, 50).map((r) => ({
    sku: testoPulito(r && r.sku, 40),
    quantita: Math.floor(Number(r && r.quantita)),
    personalizzazione: testoPulito(r && r.personalizzazione, 280),
  })).filter((r) => r.sku !== "");
}

/* ------------------------------------------------------------ creazione */

/**
 * Assegna il numero progressivo dell'anno in corso.
 *
 * `UPDATE ... RETURNING` fa incremento e lettura in un'unica istruzione
 * atomica. Leggere il massimo da `ordini` e sommarci uno darebbe lo stesso
 * numero a due ordini fatti nello stesso istante — e un numero d'ordine
 * duplicato è un problema fiscale, non un fastidio.
 */
async function prossimoNumero(db, anno) {
  const chiave = `ordini-${anno}`;
  await db
    .prepare(`INSERT INTO contatori (chiave, valore) VALUES (?1, 0) ON CONFLICT (chiave) DO NOTHING`)
    .bind(chiave)
    .run();
  const riga = await db
    .prepare(`UPDATE contatori SET valore = valore + 1 WHERE chiave = ?1 RETURNING valore`)
    .bind(chiave)
    .first();
  const progressivo = riga ? riga.valore : 1;
  return `EL-${anno}-${String(progressivo).padStart(4, "0")}`;
}

/**
 * Crea un ordine e impegna la giacenza.
 *
 * Questa funzione è il punto in cui si decide se una vendita esiste. Ordine
 * delle operazioni, che non va cambiato:
 *
 *   1. si rilegge il listino dal database e si ricalcola **tutto** da zero;
 *   2. si decrementano le giacenze in modo condizionale, una riga per volta;
 *   3. solo se **tutti** i decrementi sono riusciti si scrive l'ordine;
 *   4. se uno solo fallisce, si restituisce ciò che era già stato preso.
 *
 * Il passo 4 esiste perché D1 non offre una transazione che copra più
 * chiamate: `batch()` è atomico al suo interno, ma il decremento condizionale
 * ha bisogno di leggere `meta.changes` di ogni riga per sapere se ha vinto la
 * corsa, e questo obbliga a eseguirli separatamente. La restituzione
 * compensativa è la stessa tecnica che si usa quando una transazione non è
 * disponibile: si annulla ciò che si è fatto, in ordine inverso.
 */
export async function creaOrdine(db, { richieste, cliente, metodo, config, ipHash }) {
  const righeRichieste = normalizzaRighe(richieste);
  if (righeRichieste.length === 0) {
    return { ok: false, codice: "carrello_vuoto", messaggio: "Il carrello è vuoto." };
  }

  const metodoPulito = metodo === "contrassegno" ? "contrassegno" : "paypal";
  if (metodoPulito === "paypal" && !config.paypal.configurato) {
    return { ok: false, codice: "paypal_non_configurato", messaggio: "Il pagamento con PayPal non è al momento disponibile." };
  }

  const controllo = validaCliente(cliente);
  if (!controllo.valido) {
    return { ok: false, codice: "dati_non_validi", messaggio: "Alcuni campi non sono compilati correttamente.", campi: controllo.errori };
  }

  // --- 1. ricalcolo completo dal database ---
  const [varianti, tariffe] = await Promise.all([
    variantiPerSku(db, righeRichieste.map((r) => r.sku)),
    tariffeAttive(db),
  ]);
  const conto = calcolaOrdine({ richieste: righeRichieste, varianti, tariffe, metodo: metodoPulito, config });

  if (!conto.valido) {
    return {
      ok: false,
      codice: "non_disponibile",
      messaggio: "Qualcosa nel carrello non è più acquistabile.",
      problemi: conto.problemi,
    };
  }

  // --- 2. impegno delle giacenze ---
  const presi = [];
  for (const riga of conto.righe) {
    const esito = await db
      .prepare(`UPDATE varianti SET giacenza = giacenza - ?1 WHERE id = ?2 AND giacenza >= ?1`)
      .bind(riga.quantita, riga.variante_id)
      .run();

    if (esito.meta.changes === 1) {
      presi.push(riga);
      continue;
    }

    // Qualcuno è arrivato prima. Si restituisce tutto quello che avevamo già
    // preso e si dice al cliente cosa è successo, senza creare l'ordine.
    await restituisciGiacenze(db, presi);
    registra("avviso", "corsa persa sulla giacenza", { sku: riga.sku });
    return {
      ok: false,
      codice: "non_disponibile",
      messaggio: `"${riga.nome_prodotto}" è appena stato acquistato da qualcun altro.`,
      problemi: [{ sku: riga.sku, motivo: "esaurito" }],
    };
  }

  // --- 3. scrittura dell'ordine ---
  try {
    const ora = adesso();
    const anno = new Date().getUTCFullYear();
    const numero = await prossimoNumero(db, anno);
    const token = tokenCasuale(32);

    // PayPal deve ancora incassare, quindi l'ordine nasce in attesa e con una
    // scadenza. Il contrassegno si incassa alla consegna: l'ordine è già
    // buono, e non ha scadenza perché non c'è nulla da aspettare.
    const stato = metodoPulito === "paypal" ? "in_attesa_pagamento" : "confermato";
    const scadeIl = metodoPulito === "paypal" ? fraMinuti(config.minutiScadenzaOrdine) : null;

    const c = controllo.dati;
    const emailHash = await hashConSale(c.email, config.hashSale);

    const scritture = [
      db.prepare(
        `INSERT INTO ordini (
           numero, token, stato, metodo_pagamento,
           email, nome, cognome, telefono, via, civico, cap, citta, provincia, note,
           subtotale_cent, spedizione_cent, supplemento_cent, totale_cent, iva_cent, aliquota_iva,
           consenso_versione, consenso_il, scade_il, creato_il, aggiornato_il
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)`
      ).bind(
        numero, token, stato, metodoPulito,
        c.email, c.nome, c.cognome, c.telefono, c.via, c.civico, c.cap, c.citta, c.provincia, c.note,
        conto.subtotale_cent, conto.spedizione_cent, conto.supplemento_cent,
        conto.totale_cent, conto.iva_cent, conto.aliquota_iva,
        config.versioneInformativa, ora, scadeIl, ora, ora
      ),
      // La prova del consenso vive in una tabella sua perché deve
      // sopravvivere all'anonimizzazione dell'ordine: dopo una richiesta di
      // cancellazione resta dimostrabile che l'informativa era stata mostrata,
      // senza conservare l'indirizzo e-mail di chi l'ha vista.
      db.prepare(
        `INSERT INTO consensi (tipo, versione, testo, email_hash, ordine_numero, creato_il)
              VALUES ('presa_visione_informativa', ?1, ?2, ?3, ?4, ?5)`
      ).bind(
        config.versioneInformativa,
        "Dichiaro di aver letto l'informativa privacy e le condizioni di vendita.",
        emailHash, numero, ora
      ),
    ];

    await db.batch(scritture);

    const ordine = await db.prepare(`SELECT id FROM ordini WHERE numero = ?1`).bind(numero).first();

    const scrittureRighe = conto.righe.map((r) =>
      db.prepare(
        `INSERT INTO ordini_righe (
           ordine_id, variante_id, sku, nome_prodotto, nome_variante, slug_prodotto,
           personalizzazione, personalizzato, prezzo_unitario_cent, quantita,
           peso_unitario_g, totale_cent
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
      ).bind(
        ordine.id, r.variante_id, r.sku, r.nome_prodotto, r.nome_variante, r.slug_prodotto,
        r.personalizzazione, r.personalizzato, r.prezzo_unitario_cent, r.quantita,
        r.peso_unitario_g, r.totale_cent
      )
    );
    scrittureRighe.push(
      db.prepare(
        `INSERT INTO ordini_eventi (ordine_id, stato, nota, origine, creato_il)
              VALUES (?1, ?2, ?3, 'sistema', ?4)`
      ).bind(ordine.id, stato, `Ordine ricevuto (${metodoPulito}).`, ora)
    );

    await db.batch(scrittureRighe);

    registra("info", "ordine creato", { numero, stato, metodo: metodoPulito, totale: conto.totale_cent });
    return { ok: true, numero, token, stato, conto, cliente: controllo.dati, ordineId: ordine.id };
  } catch (errore) {
    // Se la scrittura fallisce dopo aver impegnato la giacenza, il magazzino
    // resterebbe bloccato su un ordine che non esiste. Si restituisce tutto.
    await restituisciGiacenze(db, presi);
    registra("errore", "scrittura ordine fallita", { errore: String(errore && errore.message) });
    return { ok: false, codice: "errore_interno", messaggio: "Non è stato possibile registrare l'ordine. Riprova." };
  }
}

/**
 * Rimette in magazzino le quantità di un elenco di righe.
 *
 * Usata sia come compensazione di una creazione fallita, sia
 * dall'annullamento. Non fallisce mai in modo rumoroso: se la restituzione
 * non riesce, il danno è una giacenza più bassa del vero — spiacevole ma
 * recuperabile a mano — mentre un'eccezione qui nasconderebbe l'errore
 * originale che ci ha portati fin qui.
 */
async function restituisciGiacenze(db, righe) {
  if (!righe || righe.length === 0) return;
  try {
    await db.batch(
      righe.map((r) =>
        db
          .prepare(`UPDATE varianti SET giacenza = giacenza + ?1 WHERE id = ?2`)
          .bind(r.quantita, r.variante_id ?? r.varianteId)
      )
    );
  } catch (errore) {
    registra("errore", "restituzione giacenze fallita", {
      errore: String(errore && errore.message),
      righe: righe.map((r) => r.sku),
    });
  }
}

/* ------------------------------------------------------- cambio di stato */

/**
 * Porta un ordine in un nuovo stato, verificando che la transizione sia lecita.
 *
 * Restituisce la giacenza quando l'ordine viene annullato o rimborsato, e solo
 * se lo stato di partenza la teneva davvero impegnata: annullare due volte non
 * deve rimettere in magazzino due pezzi.
 */
export async function cambiaStato(db, { numero, nuovoStato, nota = "", origine = "admin" }) {
  const ordine = await db.prepare(`SELECT * FROM ordini WHERE numero = ?1`).bind(numero).first();
  if (!ordine) return { ok: false, codice: "inesistente", messaggio: "Ordine non trovato." };

  if (!transizioneAmmessa(ordine.stato, nuovoStato)) {
    return {
      ok: false,
      codice: "transizione_non_ammessa",
      messaggio: `Da "${ETICHETTE_STATO[ordine.stato] || ordine.stato}" non si può passare a "${ETICHETTE_STATO[nuovoStato] || nuovoStato}".`,
    };
  }

  const ora = adesso();
  const liberaGiacenza =
    (nuovoStato === "annullato" || nuovoStato === "rimborsato") &&
    STATI_CHE_IMPEGNANO.has(ordine.stato);

  if (liberaGiacenza) {
    const { results } = await db
      .prepare(`SELECT variante_id, quantita, sku FROM ordini_righe WHERE ordine_id = ?1`)
      .bind(ordine.id)
      .all();
    await restituisciGiacenze(db, (results || []).filter((r) => r.variante_id));
  }

  await db.batch([
    db
      .prepare(
        `UPDATE ordini SET stato = ?1, aggiornato_il = ?2,
                scade_il = CASE WHEN ?1 = 'in_attesa_pagamento' THEN scade_il ELSE NULL END
          WHERE id = ?3`
      )
      .bind(nuovoStato, ora, ordine.id),
    db
      .prepare(
        `INSERT INTO ordini_eventi (ordine_id, stato, nota, origine, creato_il)
              VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(ordine.id, nuovoStato, testoPulito(nota, 300), origine, ora),
  ]);

  registra("info", "stato ordine cambiato", { numero, da: ordine.stato, a: nuovoStato, origine });
  return { ok: true, ordine: { ...ordine, stato: nuovoStato } };
}

/** Registra corriere e codice di tracciatura, senza cambiare stato. */
export async function impostaTracciatura(db, { numero, corriere, tracciatura }) {
  const ora = adesso();
  const esito = await db
    .prepare(
      `UPDATE ordini SET corriere = ?1, tracciatura = ?2, aggiornato_il = ?3 WHERE numero = ?4`
    )
    .bind(testoPulito(corriere, 60), testoPulito(tracciatura, 60), ora, numero)
    .run();
  if (esito.meta.changes === 0) return { ok: false, codice: "inesistente" };

  const ordine = await db.prepare(`SELECT id, stato FROM ordini WHERE numero = ?1`).bind(numero).first();
  await db
    .prepare(
      `INSERT INTO ordini_eventi (ordine_id, stato, nota, origine, creato_il)
            VALUES (?1, ?2, ?3, 'admin', ?4)`
    )
    .bind(ordine.id, ordine.stato, `Tracciatura: ${testoPulito(corriere, 60)} ${testoPulito(tracciatura, 60)}`, ora)
    .run();
  return { ok: true };
}

/* ------------------------------------------------------------- scadenze */

/**
 * Annulla gli ordini PayPal mai pagati e libera la loro giacenza.
 *
 * La chiama il cron. Senza questa funzione un carrello abbandonato a metà
 * pagamento terrebbe un pezzo unico fuori commercio per sempre: è il modo più
 * silenzioso di far sparire il magazzino di un negozio di pezzi unici.
 */
export async function scadiOrdiniNonPagati(db) {
  const ora = adesso();
  const { results } = await db
    .prepare(
      `SELECT numero FROM ordini
        WHERE stato = 'in_attesa_pagamento' AND scade_il IS NOT NULL AND scade_il < ?1
        LIMIT 100`
    )
    .bind(ora)
    .all();

  let annullati = 0;
  for (const riga of results || []) {
    const esito = await cambiaStato(db, {
      numero: riga.numero,
      nuovoStato: "annullato",
      nota: "Pagamento non completato entro il tempo previsto.",
      origine: "sistema",
    });
    if (esito.ok) annullati += 1;
  }
  if (annullati > 0) registra("info", "ordini scaduti annullati", { annullati });
  return annullati;
}
