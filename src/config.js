/* =========================================================================
   EmmeLù — configurazione derivata dall'ambiente

   Tutto ciò che cambia fra sviluppo e produzione, o che la titolare deve
   poter modificare senza toccare il codice, entra da qui. Niente valori
   sparsi nei moduli: un prezzo di spedizione scritto in tre file diventa
   tre prezzi diversi al primo aggiornamento distratto.
   ========================================================================= */

import { registra } from "./util.js";

/** Legge un intero dall'ambiente, con valore di ripiego se assente o assurdo. */
function intero(valore, ripiego) {
  const n = Number.parseInt(valore, 10);
  return Number.isFinite(n) && n >= 0 ? n : ripiego;
}

/** Legge una stringa, normalizzando `undefined` e `null` a stringa vuota. */
function testo(valore) {
  return String(valore ?? "").trim();
}

/**
 * Costruisce la configurazione a partire dalle variabili del Worker.
 *
 * Restituisce sempre un oggetto valido: un errore di configurazione non deve
 * far cadere il sito, deve far restare il negozio spento. Un sito vetrina che
 * funziona è molto meglio di una pagina di errore.
 */
export function leggiConfig(env) {
  const ragioneSociale = testo(env.RAGIONE_SOCIALE);
  const piva = testo(env.PIVA);

  // I dati fiscali sono "completi" solo se ci sono davvero i due che la legge
  // pretende per vendere online (D.Lgs 70/2003 art. 7). Gli altri sono
  // importanti ma non bloccanti.
  const datiFiscaliCompleti = ragioneSociale !== "" && piva !== "";

  const negozioRichiesto = testo(env.NEGOZIO_ATTIVO) === "1";

  // Protezione contro l'accensione distratta. Non è un vincolo tecnico — il
  // codice funzionerebbe — ma incassare senza partita IVA è un illecito, e
  // l'errore più facile da commettere è cambiare una variabile e dimenticarsi
  // del resto. Meglio che il negozio si rifiuti di aprirsi e lo scriva.
  const negozioAttivo = negozioRichiesto && datiFiscaliCompleti;
  if (negozioRichiesto && !negozioAttivo) {
    registra("errore", "NEGOZIO_ATTIVO=1 ignorato: RAGIONE_SOCIALE o PIVA mancanti", {
      ragioneSocialePresente: ragioneSociale !== "",
      pivaPresente: piva !== "",
    });
  }

  return {
    negozioAttivo,
    negozioRichiesto,
    datiFiscaliCompleti,

    // --- identità e recapiti (§9 del contratto tecnico) ---
    ragioneSociale,
    piva,
    codiceFiscale: testo(env.CODICE_FISCALE),
    sedeLegale: testo(env.SEDE_LEGALE),
    rea: testo(env.REA),
    pec: testo(env.PEC),
    codiceSdi: testo(env.CODICE_SDI),
    email: testo(env.EMAIL_PUBBLICA) || "ellebi.style@gmail.com",
    instagram: "https://www.instagram.com/emmeluofficial/",
    sito: testo(env.SITO) || "https://ellebi.it",

    // --- regole commerciali ---
    // 150 € è la soglia sopra la quale la spedizione non incide più sulla
    // decisione d'acquisto e conviene assorbirla.
    sogliaSpedizioneGratisCent: intero(env.SOGLIA_SPEDIZIONE_GRATIS_CENT, 15000),
    // Quello che il corriere addebita per incassare in contanti alla consegna.
    supplementoContrassegnoCent: intero(env.SUPPLEMENTO_CONTRASSEGNO_CENT, 500),
    // Oltre questa soglia il contrassegno non si offre: è il tetto che i
    // corrieri applicano di norma, e un rifiuto alla consegna su un pezzo di
    // valore alto costa due spedizioni e un pezzo invenduto.
    limiteContrassegnoCent: intero(env.LIMITE_CONTRASSEGNO_CENT, 50000),
    aliquotaIva: intero(env.ALIQUOTA_IVA, 22),
    // Quanto un ordine non pagato tiene bloccata la giacenza.
    minutiScadenzaOrdine: intero(env.MINUTI_SCADENZA_ORDINE, 30),
    maxArticoliPerOrdine: intero(env.MAX_ARTICOLI_PER_ORDINE, 20),

    // --- pagamenti ---
    paypal: {
      ambiente: testo(env.PAYPAL_AMBIENTE) === "live" ? "live" : "sandbox",
      clientId: testo(env.PAYPAL_CLIENT_ID),
      // Il segreto non entra mai in questo oggetto: resta in `env` e lo legge
      // solo `paypal.js`. Così un errore che serializzi la configurazione in
      // un log non può esporlo.
      configurato: testo(env.PAYPAL_CLIENT_ID) !== "" && testo(env.PAYPAL_SECRET) !== "",
    },

    // --- posta transazionale ---
    email_mittente: testo(env.EMAIL_MITTENTE) || "ordini@ellebi.it",
    email_nome_mittente: testo(env.EMAIL_NOME_MITTENTE) || "EmmeLù",

    // --- versione dei testi legali, registrata come prova del consenso ---
    versioneInformativa: testo(env.VERSIONE_INFORMATIVA) || "2026-09-12",

    // --- marche di cache dei file usati dalle pagine generate ---
    // Le calcola tools/aggiorna-versioni.py dal contenuto dei file e le
    // scrive in wrangler.toml. Il ripiego "0" serve solo in sviluppo: in
    // produzione un valore fisso lascerebbe i visitatori con il foglio di
    // stile vecchio per un anno, perche' _headers dichiara quei file
    // immutabili.
    versioneCss: testo(env.VERSIONE_CSS) || "0",
    versioneJs: testo(env.VERSIONE_JS) || "0",
  };
}

/**
 * Sostituisce i segnaposto `{{PIVA}}` e simili nelle pagine legali statiche.
 *
 * I testi legali vivono come file in `public/` e contengono segnaposto perché
 * i dati fiscali non esistono ancora. Qui vengono riempiti al volo: quando
 * la titolare apre la partita IVA basta impostare le variabili, senza
 * riscrivere cinque pagine a mano e senza rischiare di aggiornarne quattro.
 *
 * Un segnaposto che resta senza valore diventa una riga neutra invece di
 * mostrare `{{PIVA}}` al pubblico.
 */
export function riempiSegnaposto(html, config) {
  const valori = {
    RAGIONE_SOCIALE: config.ragioneSociale,
    PIVA: config.piva,
    CODICE_FISCALE: config.codiceFiscale,
    SEDE_LEGALE: config.sedeLegale,
    REA: config.rea,
    PEC: config.pec,
    CODICE_SDI: config.codiceSdi,
    EMAIL: config.email,
    SITO: config.sito,
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (intero, chiave) => {
    if (!(chiave in valori)) return intero;
    const v = valori[chiave];
    return v !== "" ? v : "(dato non ancora disponibile)";
  });
}
