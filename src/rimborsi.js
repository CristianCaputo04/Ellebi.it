/* =========================================================================
   EmmeLù — rimborsi

   È l'operazione più pericolosa del sistema dopo l'incasso: qui esce denaro,
   e un errore non si annulla con un tasto. Le regole che ne derivano:

   · l'importo si valida SEMPRE contro quanto è stato davvero incassato e
     quanto è già stato restituito. Un rimborso superiore al residuo non
     parte, nemmeno se qualcuno lo chiede esplicitamente;
   · ogni rimborso PayPal passa da una chiave di idempotenza scritta in
     tabella PRIMA di chiamare PayPal: se la titolare preme due volte, o se
     la risposta si perde e lei riprova, il secondo tentativo si ferma sul
     vincolo UNIQUE invece di far uscire il denaro una seconda volta;
   · il registro non si aggiorna e non si cancella. Si aggiunge soltanto.
   ========================================================================= */

import { adesso, registra, arrotondaCentesimi, sha256 } from "./util.js";
import { rimborsa } from "./paypal.js";
import { cambiaStato } from "./ordini.js";

/** Motivi ammessi. Un valore fuori da questo elenco viene rifiutato. */
export const MOTIVI = {
  recesso: "Recesso entro 14 giorni",
  difetto: "Prodotto difettoso o non conforme",
  non_disponibile: "Pezzo non più disponibile",
  errore_ordine: "Errore nell'ordine",
  altro: "Altro",
};

/**
 * Converte un importo scritto da una persona in centesimi interi.
 *
 * Accetta sia "45,50" sia "45.50" perché entrambe le forme arrivano davvero
 * da una tastiera italiana, e rifiutarne una significherebbe far sbagliare
 * chi non capisce perché il modulo non lo accetta. Rifiuta invece tutto il
 * resto: lettere, segni, valori negativi, numeri assurdi.
 *
 * Restituisce `null` quando il valore non è un importo valido — mai 0, che
 * sarebbe indistinguibile da "rimborsa zero euro".
 */
export function importoInCentesimi(testo) {
  const pulito = String(testo ?? "").trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(pulito)) return null;
  const centesimi = arrotondaCentesimi(Number(pulito) * 100);
  if (!Number.isFinite(centesimi) || centesimi <= 0) return null;
  return centesimi;
}

/**
 * Fotografa la situazione dei rimborsi di un ordine.
 *
 * La usa sia la pagina del pannello (per decidere cosa mostrare) sia la
 * rotta di scrittura (per decidere cosa accettare). È deliberatamente la
 * stessa funzione: se le due si separassero, l'interfaccia potrebbe offrire
 * un'azione che il server rifiuta, o peggio il contrario.
 */
export async function statoRimborsi(db, ordine, config) {
  const { results } = await db
    .prepare(
      `SELECT importo_cent, motivo, nota, riferimento, metodo, creato_il
         FROM rimborsi WHERE ordine_id = ?1 ORDER BY creato_il, id`
    )
    .bind(ordine.id)
    .all();

  const storico = results || [];
  const giaRimborsato = storico.reduce((somma, r) => somma + r.importo_cent, 0);
  const rimborsabile = Math.max(0, ordine.totale_cent - giaRimborsato);

  let motivoNo = null;
  if (ordine.metodo_pagamento === "contrassegno") motivoNo = "contrassegno";
  else if (!["pagato", "in_lavorazione", "spedito", "consegnato", "rimborsato"].includes(ordine.stato)) {
    motivoNo = "non_pagato";
  } else if (rimborsabile === 0) motivoNo = "gia_rimborsato";
  else if (!config.paypal.configurato) motivoNo = "paypal_non_configurato";
  else if (!ordine.paypal_capture_id) motivoNo = "non_pagato";

  return {
    possibile: motivoNo === null,
    motivo_non_possibile: motivoNo,
    gia_rimborsato_cent: giaRimborsato,
    rimborsabile_cent: rimborsabile,
    incassato_cent: ordine.totale_cent,
    storico,
  };
}

/**
 * Esegue un rimborso PayPal e lo registra.
 *
 * L'ordine delle operazioni non è indifferente:
 *
 *   1. si rilegge l'ordine e si ricalcola quanto è rimborsabile ADESSO;
 *   2. si valida l'importo contro quel residuo;
 *   3. si scrive la chiave di idempotenza — se esiste già, ci si ferma qui
 *      senza chiamare PayPal;
 *   4. si chiama PayPal;
 *   5. si registra il rimborso e, se l'ordine è stato restituito per intero,
 *      lo si porta in stato "rimborsato" liberando la giacenza.
 *
 * Il passo 3 prima del 4 è il punto centrale: fare il contrario significa
 * che due richieste simultanee chiamano entrambe PayPal, e il denaro esce
 * due volte prima che qualcuno se ne accorga.
 */
export async function eseguiRimborso(db, env, config, { numero, importoCent, motivo, nota }) {
  if (!(motivo in MOTIVI)) {
    return { ok: false, codice: "motivo_non_valido", messaggio: "Motivo del rimborso non riconosciuto." };
  }

  const ordine = await db.prepare(`SELECT * FROM ordini WHERE numero = ?1`).bind(numero).first();
  if (!ordine) return { ok: false, codice: "inesistente", messaggio: "Ordine non trovato." };

  const stato = await statoRimborsi(db, ordine, config);
  if (!stato.possibile) {
    return {
      ok: false,
      codice: stato.motivo_non_possibile,
      messaggio: "Questo ordine non è rimborsabile da qui.",
    };
  }

  const importo = Number(importoCent);
  if (!Number.isInteger(importo) || importo <= 0) {
    return { ok: false, codice: "importo_non_valido", messaggio: "L'importo non è valido." };
  }
  if (importo > stato.rimborsabile_cent) {
    return {
      ok: false,
      codice: "importo_eccessivo",
      messaggio: `Si può restituire al massimo ${(stato.rimborsabile_cent / 100).toFixed(2)} €.`,
    };
  }

  // Chiave di idempotenza: ordine + importo + residuo attuale. Include il
  // residuo perché due rimborsi parziali identici in momenti diversi sono
  // legittimi (due pezzi uguali restituiti separatamente), mentre lo stesso
  // rimborso inviato due volte di fila trova il residuo invariato e si ferma.
  const chiave = await sha256(`${numero}:${importo}:${stato.gia_rimborsato_cent}`);
  try {
    await db
      .prepare(`INSERT INTO rimborsi_chiavi (chiave, creato_il) VALUES (?1, ?2)`)
      .bind(chiave, adesso())
      .run();
  } catch {
    registra("avviso", "rimborso duplicato bloccato dalla chiave di idempotenza", { numero });
    return {
      ok: false,
      codice: "rimborso_duplicato",
      messaggio: "Questo rimborso risulta già inviato. Ricarica la pagina per vedere lo stato aggiornato.",
    };
  }

  const esito = await rimborsa(env, config, {
    capturaId: ordine.paypal_capture_id,
    importoCent: importo,
    motivo: MOTIVI[motivo],
  });

  if (!esito.ok) {
    // La chiave resta scritta di proposito: se PayPal ha in realtà eseguito
    // il rimborso e ci ha risposto male, un secondo tentativo automatico
    // farebbe uscire il denaro due volte. Si preferisce bloccare e far
    // controllare a mano nel pannello PayPal.
    registra("errore", "rimborso PayPal fallito", { numero, importo });
    return {
      ok: false,
      codice: "rimborso_fallito",
      messaggio: "PayPal ha rifiutato il rimborso. Controlla nel pannello PayPal prima di riprovare: se risulta eseguito, non ripetere l'operazione.",
    };
  }

  const ora = adesso();
  await db
    .prepare(
      `INSERT INTO rimborsi (ordine_id, importo_cent, motivo, nota, riferimento, metodo, creato_il)
            VALUES (?1, ?2, ?3, ?4, ?5, 'paypal', ?6)`
    )
    .bind(ordine.id, importo, motivo, String(nota || "").slice(0, 300), esito.rimborsoId || "", ora)
    .run();

  const totaleRimborsato = stato.gia_rimborsato_cent + importo;
  const integrale = totaleRimborsato >= ordine.totale_cent;

  if (integrale) {
    // Solo il rimborso integrale cambia lo stato dell'ordine e rimette il
    // pezzo in magazzino: un rimborso parziale riguarda una riga sola, e
    // liberare tutto renderebbe di nuovo acquistabile ciò che il cliente ha
    // tenuto.
    await cambiaStato(db, {
      numero,
      nuovoStato: "rimborsato",
      nota: `Rimborso integrale: ${MOTIVI[motivo]}.`,
      origine: "admin",
    });
  } else {
    await db
      .prepare(
        `INSERT INTO ordini_eventi (ordine_id, stato, nota, origine, creato_il)
              VALUES (?1, ?2, ?3, 'admin', ?4)`
      )
      .bind(ordine.id, ordine.stato,
        `Rimborso parziale di ${(importo / 100).toFixed(2)} €: ${MOTIVI[motivo]}.`, ora)
      .run();
  }

  registra("info", "rimborso eseguito", { numero, importo, integrale });
  return { ok: true, integrale, rimborsoId: esito.rimborsoId };
}
