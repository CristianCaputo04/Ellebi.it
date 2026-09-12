/* =========================================================================
   EmmeLù — punto d'ingresso del Worker

   Il sito è ibrido di proposito:

   · home, pagine legali, 404 restano **file statici** serviti dal binding
     ASSETS. Non dipendono dal database, escono dalla cache dei bordi e non
     costano nulla;
   · catalogo, schede, carrello, checkout, stato dell'ordine e pannello sono
     **generati** leggendo D1, perché devono dire il vero su prezzo e
     disponibilità nel momento in cui qualcuno guarda.

   Ogni rotta che scrive qualcosa passa dai controlli in questo file prima di
   arrivare ai moduli: interruttore del negozio, limitazione di frequenza,
   sessione e CSRF per il pannello. I moduli si fidano di quello che ricevono,
   quindi il filtro deve stare qui e non altrove.
   ========================================================================= */

import { leggiConfig, riempiSegnaposto } from "./config.js";
import {
  rispostaJson, rispostaErrore, rispostaHtml, rispostaRedirect,
  leggiCookie, scriviCookie, esc, tokenCasuale, hashConSale, ipChiamante,
  registra, testoPulito, slugValido, PROVINCE, adesso,
} from "./util.js";
import {
  categorieAttive, prodottiInVetrina, prodottoPerSlug, variantiPerSku,
  tariffeAttive, ordinePerNumero, ordinePerPaypal, elencoOrdini, conteggiOrdini,
  prodottiConVarianti, consumaLimite, pulisciDatiScaduti,
} from "./db.js";
import { calcolaOrdine } from "./prezzi.js";
import {
  creaOrdine, cambiaStato, impostaTracciatura, scadiOrdiniNonPagati,
  normalizzaRighe, TRANSIZIONI,
} from "./ordini.js";
import {
  creaOrdinePaypal, catturaOrdinePaypal, verificaFirmaWebhook,
} from "./paypal.js";
import { invia, modelloConferma, modelloAggiornamento, modelloAvvisoTitolare } from "./email.js";
import { accedi, sessione, csrfValido, esci, esportaCsv } from "./admin.js";
import { anonimizzaOrdine, anonimizzaOrdiniOltreTermine } from "./gdpr.js";

import { paginaNegozio } from "./pagine/negozio.js";
import { paginaProdotto } from "./pagine/prodotto.js";
import { paginaCarrello } from "./pagine/carrello.js";
import { paginaCheckout } from "./pagine/checkout.js";
import { paginaOrdine } from "./pagine/ordine.js";

import { paginaAccesso } from "./admin-pagine/accesso.js";
import { paginaOrdini } from "./admin-pagine/ordini.js";
import { paginaOrdineAdmin } from "./admin-pagine/ordine.js";
import { paginaMagazzino } from "./admin-pagine/magazzino.js";

const COOKIE_CARRELLO = "emmelu_carrello";

/* ------------------------------------------------------------ sicurezza */

/**
 * Intestazioni di sicurezza delle pagine generate.
 *
 * Le pagine statiche prendono le loro da `public/_headers`; quelle generate
 * qui non passano da quel file, quindi la politica va ripetuta — e tenuta
 * allineata a mano. La differenza sostanziale è il nonce: il JSON-LD di una
 * scheda prodotto cambia a ogni richiesta e non può avere un hash calcolato
 * prima della pubblicazione.
 */
function intestazioniSicurezza({ nonce, paypal = false, noindex = false }) {
  const fonti = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https://*.iubenda.com",
    "style-src 'self' 'unsafe-inline' https://*.iubenda.com",
    "font-src 'self'",
    "manifest-src 'self'",
    "media-src 'none'",
    "worker-src 'none'",
    "upgrade-insecure-requests",
  ];

  // PayPal serve il proprio SDK e apre una finestra sul proprio dominio.
  // Si concede **solo** sulla pagina di checkout e sulle rotte che la
  // riguardano: allargare la politica a tutto il sito significherebbe
  // autorizzare uno script di terze parti anche dove non serve.
  if (paypal) {
    fonti.push(`script-src 'self' 'nonce-${nonce}' https://www.paypal.com https://*.paypal.com https://*.iubenda.com 'unsafe-eval'`);
    fonti.push("connect-src 'self' https://*.paypal.com https://*.iubenda.com");
    fonti.push("frame-src https://www.paypal.com https://*.paypal.com https://*.iubenda.com");
  } else {
    fonti.push(`script-src 'self' 'nonce-${nonce}' https://*.iubenda.com 'unsafe-eval'`);
    fonti.push("connect-src 'self' https://*.iubenda.com");
    fonti.push("frame-src https://*.iubenda.com");
  }

  const intestazioni = {
    "Content-Security-Policy": fonti.join("; "),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy":
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), " +
      "geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(self), usb=()",
  };

  if (noindex) intestazioni["X-Robots-Tag"] = "noindex, nofollow";
  return intestazioni;
}

/* -------------------------------------------------------------- carrello */

/**
 * Legge il carrello dal cookie.
 *
 * Il cookie contiene **solo** SKU e quantità: mai prezzi, mai dati personali.
 * È per questo che è un cookie tecnico e non richiede consenso — e il giorno
 * in cui qualcuno ci mettesse dentro altro, quella qualifica salterebbe.
 *
 * Un cookie illeggibile o manomesso vale carrello vuoto: non ha senso
 * difendersi da una manomissione di un contenuto che il server ricalcola
 * comunque da zero.
 */
function leggiCarrello(richiesta) {
  const grezzo = leggiCookie(richiesta, COOKIE_CARRELLO);
  if (!grezzo) return [];
  try {
    const dati = JSON.parse(grezzo);
    if (!Array.isArray(dati)) return [];
    return dati
      .slice(0, 50)
      .map((r) => ({
        sku: testoPulito(r && r.sku, 40),
        quantita: Math.min(99, Math.max(1, Math.floor(Number(r && r.quantita)) || 1)),
        personalizzazione: testoPulito(r && r.personalizzazione, 280),
      }))
      .filter((r) => r.sku !== "");
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- contesto */

function creaContesto(richiesta, url, config, nonce) {
  return {
    config: { ...config, nonceCsp: nonce },
    url,
    carrello: leggiCarrello(richiesta),
  };
}

/* ----------------------------------------------------------------- API */

async function apiCatalogo(db, url) {
  const categoria = url.searchParams.get("categoria");
  const [categorie, prodotti] = await Promise.all([
    categorieAttive(db),
    prodottiInVetrina(db, { categoriaSlug: categoria && slugValido(categoria) ? categoria : null }),
  ]);
  return rispostaJson({ categorie, prodotti });
}

async function apiPreventivo(db, richiesta, config) {
  let corpo = null;
  try { corpo = await richiesta.json(); } catch { corpo = null; }
  if (!corpo) return rispostaErrore("corpo_non_valido", "Richiesta non leggibile.", 400);

  const righe = normalizzaRighe(corpo.righe);
  if (righe.length === 0) {
    return rispostaJson({
      righe: [], subtotale_cent: 0, spedizione_cent: 0, supplemento_cent: 0,
      totale_cent: 0, iva_cent: 0, articoli_totali: 0,
      soglia_gratis_cent: config.sogliaSpedizioneGratisCent, manca_a_gratis_cent: config.sogliaSpedizioneGratisCent,
      problemi: [{ motivo: "carrello_vuoto" }], valido: false,
    });
  }

  const metodo = corpo.metodo === "contrassegno" ? "contrassegno" : "paypal";
  const [varianti, tariffe] = await Promise.all([
    variantiPerSku(db, righe.map((r) => r.sku)),
    tariffeAttive(db),
  ]);

  const conto = calcolaOrdine({ richieste: righe, varianti, tariffe, metodo, config });
  return rispostaJson(conto);
}

async function apiCreaOrdine(db, env, richiesta, config, contesto) {
  let corpo = null;
  try { corpo = await richiesta.json(); } catch { corpo = null; }
  if (!corpo) return rispostaErrore("corpo_non_valido", "Richiesta non leggibile.", 400);

  // La presa visione dell'informativa è il presupposto dell'art. 13 GDPR:
  // senza, non si va avanti. Non è un consenso al trattamento (la base è il
  // contratto), ma la prova che l'informativa è stata mostrata.
  if (corpo.consenso_privacy !== true) {
    return rispostaErrore("consenso_mancante", "Per procedere serve la presa visione dell'informativa.", 400);
  }

  const ipHash = await hashConSale(ipChiamante(richiesta), config.hashSale);
  const limite = await consumaLimite(db, {
    chiave: "crea-ordine", ipHash, massimo: 5, minutiFinestra: 10,
  });
  if (!limite.consentito) {
    return rispostaErrore("troppe_richieste", "Troppi tentativi ravvicinati. Riprova fra qualche minuto.", 429);
  }

  const esito = await creaOrdine(db, {
    richieste: corpo.righe,
    cliente: corpo.cliente,
    metodo: corpo.metodo,
    config,
    ipHash,
  });

  if (!esito.ok) {
    const stato = esito.codice === "non_disponibile" ? 409
      : esito.codice === "errore_interno" ? 500 : 400;
    return rispostaJson(
      { errore: esito.codice, messaggio: esito.messaggio, campi: esito.campi, problemi: esito.problemi },
      stato
    );
  }

  // Il contrassegno non ha altri passaggi: l'ordine è già buono e le e-mail
  // partono adesso. Con PayPal si aspetta la cattura, altrimenti si
  // manderebbe una conferma per un pagamento che potrebbe non arrivare mai.
  if (esito.stato === "confermato") {
    await mandaEmailOrdine(db, env, config, esito.numero);
  }

  return rispostaJson({
    numero: esito.numero,
    token: esito.token,
    stato: esito.stato,
    totale_cent: esito.conto.totale_cent,
  }, 201);
}

/** Manda conferma al cliente e avviso alla titolare. Non blocca mai. */
async function mandaEmailOrdine(db, env, config, numero) {
  const dati = await ordinePerNumero(db, numero);
  if (!dati) return;

  const conferma = modelloConferma({ ordine: dati.ordine, righe: dati.righe, config });
  await invia(env, config, { a: dati.ordine.email, ...conferma });

  const avviso = modelloAvvisoTitolare({ ordine: dati.ordine, righe: dati.righe, config });
  await invia(env, config, { a: config.email, ...avviso });
}

async function apiPaypalCrea(db, env, richiesta, config) {
  let corpo = null;
  try { corpo = await richiesta.json(); } catch { corpo = null; }
  const numero = testoPulito(corpo && corpo.numero, 20);
  const token = testoPulito(corpo && corpo.token, 64);
  if (!numero || !token) return rispostaErrore("dati_mancanti", "Ordine non identificato.", 400);

  const dati = await ordinePerNumero(db, numero);
  // Il token è ciò che lega la richiesta all'ordine: senza, chiunque
  // conoscesse un numero d'ordine potrebbe avviarne il pagamento.
  if (!dati || dati.ordine.token !== token) {
    return rispostaErrore("ordine_inesistente", "Ordine non trovato.", 404);
  }
  if (dati.ordine.stato !== "in_attesa_pagamento") {
    return rispostaErrore("stato_non_valido", "Questo ordine non è in attesa di pagamento.", 409);
  }

  const esito = await creaOrdinePaypal(env, config, dati.ordine);
  if (!esito.ok) return rispostaErrore(esito.codice, esito.messaggio, 502);

  await db
    .prepare(`UPDATE ordini SET paypal_order_id = ?1, aggiornato_il = ?2 WHERE numero = ?3`)
    .bind(esito.id, adesso(), numero)
    .run();

  return rispostaJson({ id: esito.id });
}

async function apiPaypalCattura(db, env, richiesta, config) {
  let corpo = null;
  try { corpo = await richiesta.json(); } catch { corpo = null; }
  const numero = testoPulito(corpo && corpo.numero, 20);
  const token = testoPulito(corpo && corpo.token, 64);
  const paypalOrderId = testoPulito(corpo && corpo.paypal_order_id, 64);
  if (!numero || !token || !paypalOrderId) {
    return rispostaErrore("dati_mancanti", "Pagamento non identificato.", 400);
  }

  const dati = await ordinePerNumero(db, numero);
  if (!dati || dati.ordine.token !== token) {
    return rispostaErrore("ordine_inesistente", "Ordine non trovato.", 404);
  }

  // Il webhook può aver già fatto il lavoro: in quel caso non è un errore,
  // è la situazione normale di due strade che portano allo stesso posto.
  if (dati.ordine.stato === "pagato" || dati.ordine.stato === "in_lavorazione") {
    return rispostaJson({ stato: dati.ordine.stato, numero });
  }
  if (dati.ordine.stato !== "in_attesa_pagamento") {
    return rispostaErrore("stato_non_valido", "Questo ordine non attende un pagamento.", 409);
  }
  if (dati.ordine.paypal_order_id !== paypalOrderId) {
    return rispostaErrore("ordine_non_corrispondente", "Il pagamento non corrisponde a questo ordine.", 409);
  }

  const esito = await catturaOrdinePaypal(env, config, { paypalOrderId, ordine: dati.ordine });
  if (!esito.ok) return rispostaErrore(esito.codice, esito.messaggio, 402);

  await segnaPagato(db, env, config, numero, esito.capturaId);
  return rispostaJson({ stato: "pagato", numero });
}

/** Porta l'ordine a "pagato", registra la cattura e manda le e-mail. */
async function segnaPagato(db, env, config, numero, capturaId) {
  await db
    .prepare(`UPDATE ordini SET paypal_capture_id = ?1, aggiornato_il = ?2 WHERE numero = ?3`)
    .bind(capturaId, adesso(), numero)
    .run();
  const esito = await cambiaStato(db, {
    numero, nuovoStato: "pagato", nota: "Pagamento PayPal incassato.", origine: "paypal",
  });
  if (esito.ok) await mandaEmailOrdine(db, env, config, numero);
}

/**
 * Notifiche PayPal.
 *
 * Serve come rete di sicurezza quando la cattura lato browser si perde: il
 * cliente paga e chiude la finestra prima che la nostra pagina riceva la
 * risposta. Senza webhook quell'ordine resterebbe "in attesa" e verrebbe
 * annullato dal cron, con i soldi già incassati.
 *
 * La firma si verifica **sempre**: una notifica non verificata è indistinguibile
 * da una inventata da chi conosce l'indirizzo di questa rotta.
 */
async function apiPaypalWebhook(db, env, richiesta, config) {
  const corpoGrezzo = await richiesta.text();
  const autentico = await verificaFirmaWebhook(env, config, {
    intestazioni: richiesta.headers,
    corpoGrezzo,
  });
  if (!autentico) {
    registra("avviso", "webhook PayPal con firma non valida: ignorato");
    return rispostaErrore("firma_non_valida", "Notifica non verificabile.", 401);
  }

  let evento = null;
  try { evento = JSON.parse(corpoGrezzo); } catch { evento = null; }
  if (!evento) return rispostaJson({ ricevuto: true });

  const tipo = String(evento.event_type || "");
  if (tipo !== "PAYMENT.CAPTURE.COMPLETED" && tipo !== "CHECKOUT.ORDER.APPROVED") {
    return rispostaJson({ ricevuto: true, ignorato: tipo });
  }

  const risorsa = evento.resource || {};
  const numero = testoPulito(
    risorsa.custom_id || risorsa.invoice_id ||
    (risorsa.supplementary_data && risorsa.supplementary_data.related_ids
      ? risorsa.supplementary_data.related_ids.order_id : ""),
    40
  );

  let dati = numero ? await ordinePerNumero(db, numero) : null;
  if (!dati && risorsa.id) {
    const perPaypal = await ordinePerPaypal(db, String(risorsa.id));
    if (perPaypal) dati = await ordinePerNumero(db, perPaypal.numero);
  }
  if (!dati) return rispostaJson({ ricevuto: true, ordine: "non_trovato" });
  if (dati.ordine.stato !== "in_attesa_pagamento") return rispostaJson({ ricevuto: true, gia_gestito: true });

  // Non ci si fida dell'importo scritto nella notifica: si va a rileggere
  // l'ordine da PayPal e lo si valuta con le stesse regole della cattura.
  const verifica = await catturaOrdinePaypal(env, config, {
    paypalOrderId: dati.ordine.paypal_order_id,
    ordine: dati.ordine,
  });
  if (verifica.ok) await segnaPagato(db, env, config, dati.ordine.numero, verifica.capturaId);

  return rispostaJson({ ricevuto: true });
}

/* --------------------------------------------------------------- pagine */

async function paginaCatalogo(db, ctx) {
  const slug = ctx.url.searchParams.get("categoria");
  const categoriaSlug = slug && slugValido(slug) ? slug : null;
  const [categorie, prodotti] = await Promise.all([
    categorieAttive(db),
    prodottiInVetrina(db, { categoriaSlug }),
  ]);
  // `paginaNegozio` si aspetta lo slug, non l'oggetto categoria: è lei a
  // ritrovarselo nell'elenco che le passiamo.
  return paginaNegozio(ctx, { categorie, prodotti, categoriaAttiva: categoriaSlug || "" });
}

async function paginaSchedaProdotto(db, ctx, slug) {
  const prodotto = await prodottoPerSlug(db, slug);
  if (!prodotto) return null;
  const correlati = (await prodottiInVetrina(db, { categoriaSlug: prodotto.categoria_slug }))
    .filter((p) => p.slug !== prodotto.slug)
    .slice(0, 3);
  return paginaProdotto(ctx, {
    prodotto,
    categoria: {
      slug: prodotto.categoria_slug,
      nome: prodotto.categoria_nome,
      descrizione: prodotto.categoria_descrizione,
    },
    correlati,
  });
}

/* ------------------------------------------------------------- pannello */

async function gestisciAdmin(db, env, richiesta, url, config, nonce) {
  const percorso = url.pathname;
  const ctxAdmin = {
    config: { ...config, versioneCssAdmin: config.versioneCss, versioneJsAdmin: config.versioneJs },
    url,
  };
  const intestazioni = intestazioniSicurezza({ nonce, noindex: true });

  const sess = await sessione(db, richiesta);

  // --- accesso ---
  if (percorso === "/admin" || percorso === "/admin/" || percorso === "/admin/accesso") {
    if (richiesta.method === "POST") {
      const modulo = await richiesta.formData();
      const esito = await accedi(db, env, config, richiesta, modulo.get("password"));
      if (!esito.ok) {
        return rispostaHtml(paginaAccesso(ctxAdmin, { errore: esito.messaggio, csrf: "" }), {
          stato: 401, intestazioni,
        });
      }
      return rispostaRedirect("/admin/ordini", 303, { "Set-Cookie": esito.cookie, ...intestazioni });
    }
    if (sess.valida) return rispostaRedirect("/admin/ordini", 303, intestazioni);
    return rispostaHtml(paginaAccesso(ctxAdmin, { errore: null, csrf: "" }), { intestazioni });
  }

  // Da qui in poi serve una sessione. Il reindirizzamento, e non un 403,
  // perché la titolare che riapre un segnalibro dopo otto ore deve ritrovarsi
  // al modulo di accesso, non davanti a un errore.
  if (!sess.valida) return rispostaRedirect("/admin", 303, intestazioni);

  if (percorso === "/admin/esci" && richiesta.method === "POST") {
    const modulo = await richiesta.formData();
    if (!csrfValido(sess, modulo.get("csrf"))) return rispostaErrore("csrf", "Richiesta non valida.", 403);
    const cookie = await esci(db, richiesta);
    return rispostaRedirect("/admin", 303, { "Set-Cookie": cookie, ...intestazioni });
  }

  if (percorso === "/admin/ordini") {
    const stato = url.searchParams.get("stato");
    const statiValidi = Object.keys(TRANSIZIONI);
    const filtro = stato && statiValidi.includes(stato) ? stato : null;
    const pagina = Math.max(1, Math.floor(Number(url.searchParams.get("pagina")) || 1));
    const [{ ordini, altrePagine }, conteggi] = await Promise.all([
      elencoOrdini(db, { stato: filtro, pagina }),
      conteggiOrdini(db),
    ]);
    return rispostaHtml(
      paginaOrdini(ctxAdmin, {
        ordini, filtro: filtro || "tutti", conteggi, csrf: sess.csrf, pagina, altrePagine,
      }),
      { intestazioni }
    );
  }

  if (percorso === "/admin/esporta.csv") {
    const da = testoPulito(url.searchParams.get("da"), 30) || "0000-01-01";
    const a = testoPulito(url.searchParams.get("a"), 30) || "9999-12-31";
    const csv = await esportaCsv(db, { da, a: `${a}T23:59:59Z` });
    return new Response(`﻿${csv}`, {
      headers: {
        // Il BOM iniziale fa aprire correttamente gli accenti a Excel, che
        // altrimenti interpreta il file come Latin-1 e mostra caratteri rotti.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ordini-emmelu-${da}_${a}.csv"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const perOrdine = percorso.match(/^\/admin\/ordine\/([A-Za-z0-9-]{1,30})(\/[a-z]+)?$/);
  if (perOrdine) {
    const numero = perOrdine[1];
    const azione = perOrdine[2];

    if (richiesta.method === "POST") {
      const modulo = await richiesta.formData();
      if (!csrfValido(sess, modulo.get("csrf"))) return rispostaErrore("csrf", "Richiesta non valida.", 403);

      if (azione === "/stato") {
        const esito = await cambiaStato(db, {
          numero,
          nuovoStato: testoPulito(modulo.get("stato"), 30),
          nota: testoPulito(modulo.get("nota"), 300),
          origine: "admin",
        });
        if (esito.ok) {
          const dati = await ordinePerNumero(db, numero);
          // Il cliente va avvisato quando succede qualcosa che lo riguarda.
          // "In lavorazione" no: è un dettaglio interno che non gli cambia
          // nulla, e un'e-mail in più vale meno di un'e-mail in meno.
          if (dati && ["spedito", "consegnato", "annullato", "rimborsato"].includes(dati.ordine.stato)) {
            const messaggio = modelloAggiornamento({
              ordine: dati.ordine, config, nota: testoPulito(modulo.get("nota"), 300),
            });
            await invia(env, config, { a: dati.ordine.email, ...messaggio });
          }
        }
        return rispostaRedirect(`/admin/ordine/${encodeURIComponent(numero)}`, 303, intestazioni);
      }

      if (azione === "/tracciatura") {
        await impostaTracciatura(db, {
          numero,
          corriere: testoPulito(modulo.get("corriere"), 60),
          tracciatura: testoPulito(modulo.get("tracciatura"), 60),
        });
        return rispostaRedirect(`/admin/ordine/${encodeURIComponent(numero)}`, 303, intestazioni);
      }

      if (azione === "/anonimizza") {
        // La casella di conferma è nel modulo e non solo nel JavaScript: è
        // l'unica protezione che resta se la pagina viene inviata senza.
        // Il nome del campo è quello scritto in admin-pagine/ordine.js.
        if (modulo.get("conferma") !== "si") {
          return rispostaErrore("conferma_mancante", "Serve la conferma esplicita.", 400);
        }
        await anonimizzaOrdine(db, numero);
        return rispostaRedirect(`/admin/ordine/${encodeURIComponent(numero)}`, 303, intestazioni);
      }
    }

    const dati = await ordinePerNumero(db, numero);
    if (!dati) return rispostaHtml("Ordine non trovato", { stato: 404, intestazioni });
    return rispostaHtml(
      paginaOrdineAdmin(ctxAdmin, {
        ordine: dati.ordine,
        righe: dati.righe,
        eventi: dati.eventi,
        csrf: sess.csrf,
        transizioniPossibili: TRANSIZIONI[dati.ordine.stato] || [],
      }),
      { intestazioni }
    );
  }

  if (percorso === "/admin/magazzino") {
    if (richiesta.method === "POST") {
      const modulo = await richiesta.formData();
      if (!csrfValido(sess, modulo.get("csrf"))) return rispostaErrore("csrf", "Richiesta non valida.", 403);

      const aggiornamenti = [];
      for (const [chiave, valore] of modulo.entries()) {
        const corrispondenza = chiave.match(/^giacenza_(\d+)$/);
        if (!corrispondenza) continue;
        const giacenza = Math.max(0, Math.min(9999, Math.floor(Number(valore) || 0)));
        aggiornamenti.push(
          db.prepare(`UPDATE varianti SET giacenza = ?1 WHERE id = ?2`)
            .bind(giacenza, Number(corrispondenza[1]))
        );
      }
      if (aggiornamenti.length) await db.batch(aggiornamenti);
      return rispostaRedirect("/admin/magazzino?salvato=1", 303, intestazioni);
    }

    const prodotti = await prodottiConVarianti(db);
    return rispostaHtml(
      paginaMagazzino(ctxAdmin, {
        prodotti, csrf: sess.csrf, salvato: url.searchParams.get("salvato") === "1",
      }),
      { intestazioni }
    );
  }

  return rispostaRedirect("/admin/ordini", 303, intestazioni);
}

/* ------------------------------------------------------------- ingresso */

export default {
  async fetch(richiesta, env, ctxEsecuzione) {
    const url = new URL(richiesta.url);
    const percorso = url.pathname.replace(/\/+$/, "") || "/";
    const config = { ...leggiConfig(env), hashSale: String(env.HASH_SALE || "emmelu-sale-di-riserva") };
    const db = env.DB;
    const nonce = tokenCasuale(16);

    // Il database può mancare in sviluppo o durante una migrazione. Il sito
    // statico deve continuare a funzionare: si perde il negozio, non la home.
    const negozioUtilizzabile = Boolean(db) && config.negozioAttivo;

    try {
      /* --- API --- */
      if (percorso.startsWith("/api/")) {
        if (!db) return rispostaErrore("database_assente", "Servizio non disponibile.", 503);

        if (percorso === "/api/catalogo" && richiesta.method === "GET") {
          return apiCatalogo(db, url);
        }
        if (percorso === "/api/preventivo" && richiesta.method === "POST") {
          return apiPreventivo(db, richiesta, config);
        }

        // Il webhook resta attivo anche a negozio spento: se un pagamento è
        // partito prima dello spegnimento, la notifica va comunque gestita,
        // altrimenti resta un incasso senza ordine.
        if (percorso === "/api/paypal/webhook" && richiesta.method === "POST") {
          return apiPaypalWebhook(db, env, richiesta, config);
        }

        if (!negozioUtilizzabile) {
          return rispostaErrore(
            "negozio_non_attivo",
            "Il negozio non è ancora aperto: per ordinare scrivimi su Instagram.",
            503
          );
        }

        if (percorso === "/api/ordine" && richiesta.method === "POST") {
          return apiCreaOrdine(db, env, richiesta, config, null);
        }
        if (percorso === "/api/paypal/crea" && richiesta.method === "POST") {
          return apiPaypalCrea(db, env, richiesta, config);
        }
        if (percorso === "/api/paypal/cattura" && richiesta.method === "POST") {
          return apiPaypalCattura(db, env, richiesta, config);
        }
        return rispostaErrore("rotta_inesistente", "Non esiste.", 404);
      }

      /* --- pagine generate --- */
      const contesto = creaContesto(richiesta, url, config, nonce);

      // Finche' il database non esiste il catalogo non puo' esistere: invece
      // di una 404, che sembrerebbe un guasto a chi arriva da un link, si
      // rimanda alla sezione delle collezioni della home, che quel contenuto
      // ce l'ha gia'. La stessa cosa vale per le schede prodotto.
      if (percorso === "/negozio") {
        if (!db) return rispostaRedirect("/#collezioni", 302);
        return rispostaHtml(await paginaCatalogo(db, contesto), {
          intestazioni: intestazioniSicurezza({ nonce }),
        });
      }

      const scheda = percorso.match(/^\/prodotto\/([a-z0-9-]+)$/);
      if (scheda && !db) return rispostaRedirect("/#pezzi", 302);
      if (scheda && db) {
        const html = await paginaSchedaProdotto(db, contesto, scheda[1]);
        if (html) {
          return rispostaHtml(html, { intestazioni: intestazioniSicurezza({ nonce }) });
        }
        // Prodotto inesistente: si serve la 404 statica, che è già scritta e
        // ha la stessa cornice del resto del sito.
        const quattroZeroQuattro = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`));
        return new Response(quattroZeroQuattro.body, {
          status: 404,
          headers: quattroZeroQuattro.headers,
        });
      }

      if (percorso === "/carrello") {
        if (!negozioUtilizzabile) return rispostaRedirect("/negozio", 302);
        return rispostaHtml(paginaCarrello(contesto), {
          intestazioni: intestazioniSicurezza({ nonce, noindex: true }),
        });
      }

      if (percorso === "/checkout") {
        if (!negozioUtilizzabile) return rispostaRedirect("/negozio", 302);
        return rispostaHtml(
          paginaCheckout(contesto, { paypalClientId: config.paypal.clientId, province: PROVINCE }),
          { intestazioni: intestazioniSicurezza({ nonce, paypal: true, noindex: true }) }
        );
      }

      const statoOrdine = percorso.match(/^\/ordine\/([A-Za-z0-9-]{1,30})$/);
      if (statoOrdine && db) {
        const token = url.searchParams.get("token") || "";
        const dati = await ordinePerNumero(db, statoOrdine[1]);
        // Il token è l'unica cosa che protegge questa pagina: senza, un numero
        // d'ordine indovinato mostrerebbe nome, indirizzo e telefono di un
        // altro cliente. Il messaggio non distingue "ordine inesistente" da
        // "token sbagliato", per non confermare che quel numero esiste.
        if (!dati || !token || dati.ordine.token !== token) {
          return rispostaHtml(
            paginaOrdine(contesto, { ordine: null, righe: [], eventi: [] }),
            { stato: 404, intestazioni: intestazioniSicurezza({ nonce, noindex: true }) }
          );
        }
        return rispostaHtml(
          paginaOrdine(contesto, { ordine: dati.ordine, righe: dati.righe, eventi: dati.eventi }),
          { intestazioni: intestazioniSicurezza({ nonce, noindex: true }) }
        );
      }

      /* --- pannello --- */
      if (percorso.startsWith("/admin")) {
        if (!db) return rispostaErrore("database_assente", "Servizio non disponibile.", 503);
        return gestisciAdmin(db, env, richiesta, url, config, nonce);
      }

      /* --- file statici --- */
      const risposta = await env.ASSETS.fetch(richiesta);

      // Le pagine legali contengono i segnaposto dei dati fiscali: si
      // riempiono al volo, così esiste un solo posto in cui aggiornarli il
      // giorno in cui la partita IVA arriva.
      const tipo = risposta.headers.get("Content-Type") || "";
      if (tipo.includes("text/html")) {
        const testo = await risposta.text();
        if (testo.includes("{{")) {
          return new Response(riempiSegnaposto(testo, config), {
            status: risposta.status,
            headers: risposta.headers,
          });
        }
        return new Response(testo, { status: risposta.status, headers: risposta.headers });
      }
      return risposta;
    } catch (errore) {
      registra("errore", "eccezione non gestita", {
        percorso, errore: String(errore && errore.message), pila: String(errore && errore.stack).slice(0, 500),
      });
      if (percorso.startsWith("/api/")) {
        return rispostaErrore("errore_interno", "Qualcosa è andato storto.", 500);
      }
      return rispostaHtml("<!DOCTYPE html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>Errore</title></head><body><h1>Qualcosa è andato storto</h1><p><a href=\"/\">Torna alla home</a></p></body></html>", { stato: 500 });
    }
  },

  /**
   * Compiti periodici. La pianificazione è in `wrangler.toml`.
   *
   * Tutti e tre servono a mantenere una promessa fatta altrove: le giacenze
   * non devono restare bloccate da ordini morti, e i dati non devono restare
   * oltre i termini dichiarati nell'informativa.
   */
  async scheduled(evento, env, ctxEsecuzione) {
    const db = env.DB;
    if (!db) return;
    ctxEsecuzione.waitUntil((async () => {
      try {
        const scaduti = await scadiOrdiniNonPagati(db);
        const pulizia = await pulisciDatiScaduti(db);
        const anonimizzati = await anonimizzaOrdiniOltreTermine(db, 10);
        registra("info", "manutenzione periodica eseguita", { scaduti, ...pulizia, anonimizzati });
      } catch (errore) {
        registra("errore", "manutenzione periodica fallita", { errore: String(errore && errore.message) });
      }
    })());
  },
};
