/* =========================================================================
   EmmeLù — posta transazionale

   Un Worker non parla SMTP, quindi le e-mail passano da un fornitore via API.
   Qui sono supportati Resend e Brevo, scelti con `EMAIL_FORNITORE`.

   Regola importante: SE LA POSTA NON È CONFIGURATA, L'ORDINE NON DEVE
   FALLIRE. Un negozio che rifiuta un pagamento perché non riesce a mandare
   una conferma è peggio di un negozio che incassa e avvisa la titolare nel
   pannello. Ogni funzione di invio restituisce un esito, non solleva.
   ========================================================================= */

import { esc, euro, registra } from "./util.js";
import { ETICHETTE_STATO } from "./ordini.js";

/* --------------------------------------------------------------- invio */

async function inviaConResend(env, { a, oggetto, html, testo, mittente, nomeMittente }) {
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${nomeMittente} <${mittente}>`,
      to: [a],
      subject: oggetto,
      html,
      text: testo,
    }),
  });
  return { ok: risposta.ok, stato: risposta.status };
}

async function inviaConBrevo(env, { a, oggetto, html, testo, mittente, nomeMittente }) {
  const risposta = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.EMAIL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: mittente, name: nomeMittente },
      to: [{ email: a }],
      subject: oggetto,
      htmlContent: html,
      textContent: testo,
    }),
  });
  return { ok: risposta.ok, stato: risposta.status };
}

/**
 * Invia un messaggio, se e solo se la posta è configurata.
 *
 * Non solleva mai: un guasto del fornitore di posta non deve propagarsi fino
 * a far fallire un pagamento già incassato. Registra e restituisce l'esito,
 * così chi chiama può decidere — e nessuno, oggi, decide di annullare un
 * ordine perché l'e-mail non è partita.
 */
export async function invia(env, config, messaggio) {
  const chiave = String(env.EMAIL_API_KEY || "").trim();
  if (!chiave) {
    registra("avviso", "posta non configurata: messaggio non inviato", { oggetto: messaggio.oggetto });
    return { ok: false, codice: "posta_non_configurata" };
  }

  const comune = {
    ...messaggio,
    mittente: config.email_mittente,
    nomeMittente: config.email_nome_mittente,
  };

  try {
    const fornitore = String(env.EMAIL_FORNITORE || "resend").toLowerCase();
    const esito = fornitore === "brevo"
      ? await inviaConBrevo(env, comune)
      : await inviaConResend(env, comune);

    if (!esito.ok) {
      // Si registra lo stato HTTP e l'oggetto, mai il destinatario: l'indirizzo
      // e-mail è un dato personale e i log non sono il posto in cui tenerlo.
      registra("errore", "invio e-mail fallito", { stato: esito.stato, oggetto: messaggio.oggetto });
    }
    return { ok: esito.ok, codice: esito.ok ? null : "invio_fallito" };
  } catch (errore) {
    registra("errore", "invio e-mail: eccezione", { errore: String(errore && errore.message) });
    return { ok: false, codice: "eccezione" };
  }
}

/* ------------------------------------------------------------ modelli */

/* Un'e-mail transazionale non è una pagina web: niente fogli di stile
   esterni, niente immagini remote (molti client le bloccano e la mail
   diventa illeggibile), stile in linea e struttura semplice. Il testo
   alternativo non è un di più: c'è chi legge la posta in solo testo, e
   soprattutto è quello che riduce la probabilità di finire nello spam. */

function cornice(titolo, contenuto) {
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(titolo)}</title></head>
<body style="margin:0;padding:24px;background:#fbf7f4;font-family:Georgia,'Times New Roman',serif;color:#3f2418;line-height:1.6">
<div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:8px">
<p style="margin:0 0 24px;font-size:22px;letter-spacing:.18em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif">EmmeL&ugrave;</p>
${contenuto}
<hr style="border:0;border-top:1px solid #e8d9cf;margin:32px 0">
<p style="margin:0;font-size:13px;color:#6f5346">Capsule limited edition cucite a mano in Italia.</p>
</div></body></html>`;
}

function tabellaRighe(righe) {
  return righe.map((r) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #f0e6df">${esc(r.nome_prodotto)}${r.nome_variante && r.nome_variante !== "Unica" ? ` — ${esc(r.nome_variante)}` : ""}${r.personalizzazione ? `<br><span style="font-size:13px;color:#6f5346">Personalizzazione: ${esc(r.personalizzazione)}</span>` : ""}</td>
<td style="padding:8px 0;border-bottom:1px solid #f0e6df;text-align:center">&times;${esc(r.quantita)}</td>
<td style="padding:8px 0;border-bottom:1px solid #f0e6df;text-align:right;white-space:nowrap">${esc(euro(r.totale_cent))}</td>
</tr>`).join("");
}

function righeInTesto(righe) {
  return righe.map((r) =>
    `- ${r.nome_prodotto} x${r.quantita} — ${euro(r.totale_cent)}` +
    (r.personalizzazione ? `\n  Personalizzazione: ${r.personalizzazione}` : "")
  ).join("\n");
}

/**
 * Conferma d'ordine al cliente.
 *
 * È il documento che, secondo le condizioni di vendita, conclude il contratto:
 * deve contenere numero, riepilogo, totali e il richiamo al diritto di recesso
 * — compresa la sua **esclusione** sui pezzi personalizzati, che il Codice del
 * Consumo impone di ricordare e che qui va detto pezzo per pezzo, non in
 * generale, perché un ordine può contenere entrambi i casi.
 */
export function modelloConferma({ ordine, righe, config }) {
  const link = `${config.sito}/ordine/${encodeURIComponent(ordine.numero)}?token=${encodeURIComponent(ordine.token)}`;
  const personalizzati = righe.filter((r) => r.personalizzato);
  const standard = righe.filter((r) => !r.personalizzato);

  const notaRecesso = personalizzati.length === 0
    ? `<p style="margin:16px 0 0;font-size:14px">Hai <strong>14 giorni</strong> dalla consegna per cambiare idea e restituire il pezzo. Le condizioni complete sono su <a href="${esc(config.sito)}/resi" style="color:#9c5539">${esc(config.sito)}/resi</a>.</p>`
    : `<p style="margin:16px 0 0;font-size:14px;padding:12px;background:#fbeae1;border-radius:6px">
<strong>Attenzione ai pezzi personalizzati.</strong> ${esc(personalizzati.map((r) => r.nome_prodotto).join(", "))}
${personalizzati.length === 1 ? "è realizzato" : "sono realizzati"} su tua richiesta: per legge (art. 59 del Codice del Consumo)
${personalizzati.length === 1 ? "non è restituibile" : "non sono restituibili"} e il diritto di recesso non si applica.
${standard.length > 0 ? `Per ${standard.length === 1 ? "l'altro pezzo" : "gli altri pezzi"} restano i 14 giorni di ripensamento.` : ""}
La garanzia legale di conformità di 2 anni vale comunque, su tutto.</p>`;

  const pagamento = ordine.metodo_pagamento === "contrassegno"
    ? `<p style="margin:16px 0 0"><strong>Pagamento alla consegna.</strong> Prepara ${esc(euro(ordine.totale_cent))} in contanti per il corriere.</p>`
    : `<p style="margin:16px 0 0">Pagamento ricevuto tramite PayPal.</p>`;

  const html = cornice(`Ordine ${ordine.numero}`, `
<h1 style="margin:0 0 8px;font-size:26px;font-weight:normal">Grazie, ${esc(ordine.nome)}.</h1>
<p style="margin:0 0 24px;color:#6f5346">Ho ricevuto il tuo ordine <strong>${esc(ordine.numero)}</strong> e mi ci metto al lavoro.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">${tabellaRighe(righe)}</table>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:12px">
<tr><td style="padding:4px 0">Subtotale</td><td style="padding:4px 0;text-align:right">${esc(euro(ordine.subtotale_cent))}</td></tr>
<tr><td style="padding:4px 0">Spedizione</td><td style="padding:4px 0;text-align:right">${ordine.spedizione_cent === 0 ? "offerta" : esc(euro(ordine.spedizione_cent))}</td></tr>
${ordine.supplemento_cent > 0 ? `<tr><td style="padding:4px 0">Supplemento contrassegno</td><td style="padding:4px 0;text-align:right">${esc(euro(ordine.supplemento_cent))}</td></tr>` : ""}
<tr><td style="padding:8px 0;font-size:18px;border-top:1px solid #3f2418"><strong>Totale</strong></td><td style="padding:8px 0;text-align:right;font-size:18px;border-top:1px solid #3f2418"><strong>${esc(euro(ordine.totale_cent))}</strong></td></tr>
<tr><td style="padding:0;font-size:13px;color:#6f5346">di cui IVA ${esc(ordine.aliquota_iva)}%</td><td style="padding:0;text-align:right;font-size:13px;color:#6f5346">${esc(euro(ordine.iva_cent))}</td></tr>
</table>
${pagamento}
<p style="margin:24px 0 0"><strong>Spedizione a</strong><br>
${esc(ordine.nome)} ${esc(ordine.cognome)}<br>
${esc(ordine.via)} ${esc(ordine.civico)}<br>
${esc(ordine.cap)} ${esc(ordine.citta)} (${esc(ordine.provincia)})</p>
<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;background:#3f2418;color:#fbf7f4;text-decoration:none;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.15em;text-transform:uppercase">Segui il tuo ordine</a></p>
${notaRecesso}`);

  const testo = `Grazie, ${ordine.nome}.

Ho ricevuto il tuo ordine ${ordine.numero}.

${righeInTesto(righe)}

Subtotale: ${euro(ordine.subtotale_cent)}
Spedizione: ${ordine.spedizione_cent === 0 ? "offerta" : euro(ordine.spedizione_cent)}
${ordine.supplemento_cent > 0 ? `Supplemento contrassegno: ${euro(ordine.supplemento_cent)}\n` : ""}TOTALE: ${euro(ordine.totale_cent)} (di cui IVA ${ordine.aliquota_iva}%: ${euro(ordine.iva_cent)})

Spedizione a:
${ordine.nome} ${ordine.cognome}
${ordine.via} ${ordine.civico}
${ordine.cap} ${ordine.citta} (${ordine.provincia})

Segui il tuo ordine: ${link}

${personalizzati.length > 0
    ? `ATTENZIONE: ${personalizzati.map((r) => r.nome_prodotto).join(", ")} ${personalizzati.length === 1 ? "e' realizzato" : "sono realizzati"} su tua richiesta e per legge (art. 59 Codice del Consumo) non ${personalizzati.length === 1 ? "e' restituibile" : "sono restituibili"}.`
    : "Hai 14 giorni dalla consegna per cambiare idea."}
Condizioni complete: ${config.sito}/resi

EmmeLu' — capsule limited edition cucite a mano in Italia.`;

  return { oggetto: `Ordine ${ordine.numero} ricevuto — EmmeLù`, html, testo };
}

/** Avviso di cambio stato al cliente (spedito, annullato, rimborsato…). */
export function modelloAggiornamento({ ordine, config, nota = "" }) {
  const link = `${config.sito}/ordine/${encodeURIComponent(ordine.numero)}?token=${encodeURIComponent(ordine.token)}`;
  const etichetta = ETICHETTE_STATO[ordine.stato] || ordine.stato;

  const tracciatura = ordine.tracciatura
    ? `<p style="margin:16px 0 0">Corriere: <strong>${esc(ordine.corriere || "")}</strong><br>Codice di spedizione: <strong>${esc(ordine.tracciatura)}</strong></p>`
    : "";

  const html = cornice(`Ordine ${ordine.numero}: ${etichetta}`, `
<h1 style="margin:0 0 8px;font-size:26px;font-weight:normal">Ordine ${esc(ordine.numero)}</h1>
<p style="margin:0 0 16px;color:#6f5346">Stato aggiornato: <strong style="color:#3f2418">${esc(etichetta)}</strong>.</p>
${nota ? `<p style="margin:0 0 16px">${esc(nota)}</p>` : ""}
${tracciatura}
<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;background:#3f2418;color:#fbf7f4;text-decoration:none;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.15em;text-transform:uppercase">Vedi l'ordine</a></p>`);

  const testo = `Ordine ${ordine.numero}
Stato aggiornato: ${etichetta}
${nota ? `\n${nota}\n` : ""}${ordine.tracciatura ? `\nCorriere: ${ordine.corriere || ""}\nCodice di spedizione: ${ordine.tracciatura}\n` : ""}
Vedi l'ordine: ${link}`;

  return { oggetto: `Ordine ${ordine.numero}: ${etichetta} — EmmeLù`, html, testo };
}

/** Avviso alla titolare che è arrivato un ordine. */
export function modelloAvvisoTitolare({ ordine, righe, config }) {
  const personalizzazioni = righe.filter((r) => r.personalizzazione);
  const html = cornice(`Nuovo ordine ${ordine.numero}`, `
<h1 style="margin:0 0 8px;font-size:24px;font-weight:normal">Nuovo ordine ${esc(ordine.numero)}</h1>
<p style="margin:0 0 16px">${esc(euro(ordine.totale_cent))} — ${esc(ordine.metodo_pagamento === "contrassegno" ? "contrassegno" : "PayPal")}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">${tabellaRighe(righe)}</table>
${personalizzazioni.length > 0 ? `<p style="margin:16px 0 0;padding:12px;background:#fbeae1;border-radius:6px"><strong>Da personalizzare:</strong><br>${personalizzazioni.map((r) => `${esc(r.nome_prodotto)}: ${esc(r.personalizzazione)}`).join("<br>")}</p>` : ""}
<p style="margin:16px 0 0">${esc(ordine.nome)} ${esc(ordine.cognome)}<br>${esc(ordine.via)} ${esc(ordine.civico)}<br>${esc(ordine.cap)} ${esc(ordine.citta)} (${esc(ordine.provincia)})<br>${esc(ordine.telefono)}</p>
<p style="margin:24px 0 0"><a href="${esc(config.sito)}/admin/ordine/${esc(ordine.numero)}" style="color:#9c5539">Apri nel pannello</a></p>`);

  const testo = `Nuovo ordine ${ordine.numero} — ${euro(ordine.totale_cent)} (${ordine.metodo_pagamento})

${righeInTesto(righe)}

${ordine.nome} ${ordine.cognome}
${ordine.via} ${ordine.civico}
${ordine.cap} ${ordine.citta} (${ordine.provincia})
${ordine.telefono}

Pannello: ${config.sito}/admin/ordine/${ordine.numero}`;

  return { oggetto: `Nuovo ordine ${ordine.numero} — ${euro(ordine.totale_cent)}`, html, testo };
}
