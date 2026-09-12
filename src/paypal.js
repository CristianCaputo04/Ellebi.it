/* =========================================================================
   EmmeLù — integrazione PayPal (API Orders v2)

   Il principio che regge tutto il file: PAYPAL NON È UNA FONTE DI VERITÀ SUI
   PREZZI, MA È L'UNICA FONTE DI VERITÀ SUL PAGAMENTO.

   Gli importi mandati a PayPal li calcola sempre il nostro server dal nostro
   database. In cambio, che un pagamento sia avvenuto lo decide solo PayPal:
   mai il browser del cliente, che può dire qualunque cosa. Per questo la
   cattura verifica lo stato *e* l'importo prima di segnare un ordine come
   pagato, e il webhook verifica la firma prima di credere a una notifica.
   ========================================================================= */

import { euroDecimale, registra, adesso } from "./util.js";

const BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

/**
 * Ottiene un token d'accesso con le credenziali dell'applicazione.
 *
 * Il token non viene messo in cache di proposito: un Worker vive pochi
 * millisecondi e non ha una memoria condivisa affidabile fra le istanze, e un
 * token conservato male è molto peggio di una chiamata in più. PayPal li
 * emette con validità di ore, ma richiederne uno per operazione costa una
 * richiesta e toglie ogni problema di scadenza.
 */
async function token(env, config) {
  const credenziali = btoa(`${config.paypal.clientId}:${env.PAYPAL_SECRET}`);
  const risposta = await fetch(`${BASE[config.paypal.ambiente]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credenziali}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!risposta.ok) {
    registra("errore", "PayPal: token rifiutato", { stato: risposta.status });
    throw new Error("paypal_token");
  }
  const dati = await risposta.json();
  return dati.access_token;
}

/** Chiamata autenticata alle API PayPal, con il corpo già in JSON. */
async function chiama(env, config, percorso, { metodo = "GET", corpo = null, chiaveIdempotenza = null } = {}) {
  const intestazioni = {
    Authorization: `Bearer ${await token(env, config)}`,
    "Content-Type": "application/json",
  };
  // La chiave di idempotenza fa sì che un tentativo ripetuto (rete instabile,
  // cliente che preme due volte) non generi due pagamenti: PayPal riconosce la
  // richiesta e restituisce lo stesso risultato invece di incassare due volte.
  if (chiaveIdempotenza) intestazioni["PayPal-Request-Id"] = chiaveIdempotenza;

  const risposta = await fetch(`${BASE[config.paypal.ambiente]}${percorso}`, {
    method: metodo,
    headers: intestazioni,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const testo = await risposta.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = null; }

  if (!risposta.ok) {
    // Si registra lo stato e il nome dell'errore, mai il corpo intero: nelle
    // risposte PayPal possono comparire dati del pagatore, e i log di
    // Cloudflare non sono il posto dove tenerli.
    registra("errore", "PayPal: chiamata fallita", {
      percorso, stato: risposta.status, nome: dati && dati.name,
    });
    return { ok: false, stato: risposta.status, dati };
  }
  return { ok: true, stato: risposta.status, dati };
}

/**
 * Crea l'ordine su PayPal a partire da un ordine già nostro.
 *
 * L'importo è quello congelato nella tabella `ordini`, non uno ricalcolato e
 * men che meno uno arrivato dal browser: l'ordine è già stato scritto, il
 * prezzo è già un fatto.
 *
 * `custom_id` porta il nostro numero d'ordine: è ciò che permette al webhook
 * di ritrovare l'ordine anche se la cattura lato browser si perde.
 */
export async function creaOrdinePaypal(env, config, ordine) {
  const esito = await chiama(env, config, "/v2/checkout/orders", {
    metodo: "POST",
    chiaveIdempotenza: `crea-${ordine.numero}`,
    corpo: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: ordine.numero,
          custom_id: ordine.numero,
          invoice_id: ordine.numero,
          description: `Ordine ${ordine.numero} — EmmeLù`,
          amount: {
            currency_code: "EUR",
            value: euroDecimale(ordine.totale_cent),
            breakdown: {
              item_total: { currency_code: "EUR", value: euroDecimale(ordine.subtotale_cent) },
              shipping: { currency_code: "EUR", value: euroDecimale(ordine.spedizione_cent) },
              handling: { currency_code: "EUR", value: euroDecimale(ordine.supplemento_cent) },
            },
          },
        },
      ],
      application_context: {
        brand_name: "EmmeLù",
        locale: "it-IT",
        // L'indirizzo lo abbiamo già raccolto noi: farlo richiedere di nuovo
        // da PayPal significa avere due indirizzi che possono divergere, e
        // spedire a quello sbagliato.
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    },
  });

  if (!esito.ok || !esito.dati || !esito.dati.id) {
    return { ok: false, codice: "paypal_creazione", messaggio: "Non è stato possibile avviare il pagamento." };
  }
  return { ok: true, id: esito.dati.id };
}

/**
 * Incassa un ordine PayPal e dice se l'incasso è valido per noi.
 *
 * Non basta che PayPal risponda 200: si verifica che lo stato sia `COMPLETED`
 * **e** che l'importo incassato coincida al centesimo con il totale del nostro
 * ordine. Senza il secondo controllo, un ordine manipolato prima della
 * creazione — o una discrepanza dovuta a un errore nostro — passerebbe per
 * pagato regolarmente.
 */
export async function catturaOrdinePaypal(env, config, { paypalOrderId, ordine }) {
  const esito = await chiama(env, config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    metodo: "POST",
    chiaveIdempotenza: `cattura-${ordine.numero}`,
    corpo: {},
  });

  // 422 con issue ORDER_ALREADY_CAPTURED non è un errore: è il secondo clic
  // dello stesso cliente, o il webhook che ci ha preceduti. Si va a rileggere
  // lo stato reale invece di dire al cliente che il pagamento è fallito.
  if (!esito.ok) {
    const dettaglio = esito.dati && Array.isArray(esito.dati.details) ? esito.dati.details[0] : null;
    if (dettaglio && dettaglio.issue === "ORDER_ALREADY_CAPTURED") {
      return verificaOrdinePaypal(env, config, { paypalOrderId, ordine });
    }
    return { ok: false, codice: "paypal_cattura", messaggio: "Il pagamento non è andato a buon fine." };
  }

  return valutaCattura(esito.dati, ordine);
}

/** Rilegge un ordine PayPal e lo valuta come farebbe la cattura. */
export async function verificaOrdinePaypal(env, config, { paypalOrderId, ordine }) {
  const esito = await chiama(env, config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  if (!esito.ok || !esito.dati) {
    return { ok: false, codice: "paypal_verifica", messaggio: "Stato del pagamento non verificabile." };
  }
  return valutaCattura(esito.dati, ordine);
}

/**
 * Decide se una risposta PayPal rappresenta un pagamento buono per questo
 * ordine. Estratta perché la usano sia la cattura sia la verifica, e perché
 * la regola deve essere identica nei due casi.
 */
function valutaCattura(dati, ordine) {
  if (dati.status !== "COMPLETED") {
    return { ok: false, codice: "pagamento_non_completato", messaggio: "Il pagamento non risulta completato.", stato: dati.status };
  }

  const unita = Array.isArray(dati.purchase_units) ? dati.purchase_units[0] : null;
  const catture = unita && unita.payments && Array.isArray(unita.payments.captures)
    ? unita.payments.captures
    : [];
  // Solo una cattura COMPLETED conta. Il ripiego su `catture[0]` che c'era
  // prima sembrava prudente e non lo era: lo stato dell'ORDINE PayPal può
  // essere COMPLETED mentre la cattura sotto è PENDING — succede davvero con
  // gli eCheck, dove il denaro arriva giorni dopo e può non arrivare affatto.
  // Quel ripiego marcava come pagato un ordine non incassato, e il pezzo
  // sarebbe partito.
  const cattura = catture.find((c) => c.status === "COMPLETED");

  if (!cattura) {
    const inSospeso = catture.find((c) => c.status === "PENDING");
    if (inSospeso) {
      registra("avviso", "PayPal: incasso ancora in sospeso", {
        numero: ordine.numero,
        motivo: String((inSospeso.status_details && inSospeso.status_details.reason) || ""),
      });
      return {
        ok: false,
        codice: "incasso_in_sospeso",
        messaggio: "Il pagamento risulta ancora in corso di accredito. Appena arriva ti avviso: non serve rifarlo.",
      };
    }
    return { ok: false, codice: "cattura_assente", messaggio: "PayPal non riporta alcun incasso." };
  }

  const incassato = cattura.amount && cattura.amount.value;
  const atteso = euroDecimale(ordine.totale_cent);

  // Il confronto è fra stringhe a due decimali, non fra numeri in virgola
  // mobile: "97.00" === "97.00" è esatto, 97.0 === 97.00000000001 no.
  if (String(incassato) !== atteso) {
    registra("errore", "PayPal: importo incassato diverso dal dovuto", {
      numero: ordine.numero, atteso, incassato: String(incassato),
    });
    return { ok: false, codice: "importo_non_corrispondente", messaggio: "L'importo incassato non corrisponde all'ordine." };
  }

  if (String(cattura.amount.currency_code) !== "EUR") {
    return { ok: false, codice: "valuta_non_corrispondente", messaggio: "Valuta del pagamento non prevista." };
  }

  return { ok: true, capturaId: cattura.id, incassatoIl: cattura.create_time || adesso() };
}

/**
 * Verifica la firma di una notifica webhook.
 *
 * Senza questa verifica chiunque conosca l'indirizzo del webhook potrebbe
 * inviare una finta notifica di pagamento e farsi spedire merce mai pagata.
 * È il singolo controllo più importante di tutto il file.
 *
 * In assenza di `PAYPAL_WEBHOOK_ID` la verifica non è possibile: si rifiuta la
 * notifica invece di accettarla, perché un webhook non verificabile vale
 * esattamente quanto uno falso.
 */
export async function verificaFirmaWebhook(env, config, { intestazioni, corpoGrezzo }) {
  const webhookId = String(env.PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookId) {
    registra("errore", "PayPal: webhook ricevuto ma PAYPAL_WEBHOOK_ID non configurato");
    return false;
  }

  let evento = null;
  try { evento = JSON.parse(corpoGrezzo); } catch { return false; }

  const esito = await chiama(env, config, "/v1/notifications/verify-webhook-signature", {
    metodo: "POST",
    corpo: {
      auth_algo: intestazioni.get("paypal-auth-algo"),
      cert_url: intestazioni.get("paypal-cert-url"),
      transmission_id: intestazioni.get("paypal-transmission-id"),
      transmission_sig: intestazioni.get("paypal-transmission-sig"),
      transmission_time: intestazioni.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: evento,
    },
  });

  return Boolean(esito.ok && esito.dati && esito.dati.verification_status === "SUCCESS");
}

/**
 * Rimborsa una cattura, in tutto o in parte.
 *
 * Serve per il diritto di recesso: quattordici giorni, e il rimborso va fatto
 * entro altri quattordici dal rientro della merce. Farlo da qui invece che a
 * mano nel pannello PayPal tiene l'ordine e il rimborso allineati.
 */
export async function rimborsa(env, config, { capturaId, importoCent = null, motivo = "" }) {
  const corpo = importoCent === null
    ? {}
    : { amount: { value: euroDecimale(importoCent), currency_code: "EUR" }, note_to_payer: String(motivo || "").slice(0, 255) };

  const esito = await chiama(env, config, `/v2/payments/captures/${encodeURIComponent(capturaId)}/refund`, {
    metodo: "POST",
    corpo,
  });

  if (!esito.ok || !esito.dati) {
    return { ok: false, codice: "rimborso_fallito", messaggio: "PayPal ha rifiutato il rimborso." };
  }
  return { ok: true, rimborsoId: esito.dati.id, stato: esito.dati.status };
}
