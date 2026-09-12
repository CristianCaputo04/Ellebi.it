/* =========================================================================
   EmmeLù — funzioni di servizio condivise
   Nessuna dipendenza esterna: tutto quello che serve lo offre già il runtime
   dei Worker (WebCrypto, TextEncoder, Intl).
   ========================================================================= */

/* ------------------------------------------------------------------ testo */

const FUGA_HTML = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Rende un valore qualunque sicuro da interpolare in HTML.
 *
 * Garantisce che il risultato non possa mai aprire un tag o un attributo, e
 * quindi che un nome prodotto con un apostrofo o una personalizzazione scritta
 * da un cliente non possano iniettare markup.
 *
 * NON garantisce di essere sufficiente dentro un attributo `href`, `src` o
 * dentro un blocco `<script>`: lì servono controlli diversi, e infatti gli URL
 * passano da `urlSicuro()` e i dati strutturati da `JSON.stringify` + fuga di
 * `<` (vedi `jsonLdSicuro`).
 *
 * `null` e `undefined` diventano stringa vuota di proposito: è quasi sempre
 * ciò che si vuole in una pagina, e stampare "undefined" al cliente no.
 */
export function esc(valore) {
  if (valore === null || valore === undefined) return "";
  return String(valore).replace(/[&<>"']/g, (c) => FUGA_HTML[c]);
}

/**
 * Serializza un oggetto per un blocco <script type="application/ld+json">.
 *
 * `JSON.stringify` da solo non basta: una stringa che contenga la sequenza
 * `</script>` chiuderebbe il blocco in anticipo e il resto finirebbe nel
 * documento come HTML. Si sostituisce `<` con la sua fuga unicode, che dentro
 * JSON è equivalente e dentro HTML è inerte.
 */
export function jsonLdSicuro(oggetto) {
  return JSON.stringify(oggetto).replace(/</g, "\\u003c");
}

/**
 * Lascia passare solo gli URL che vogliamo davvero seguire.
 *
 * Serve dove un indirizzo arriva dal database o da un modulo: `javascript:`
 * dentro un `href` esegue codice al clic, ed è il modo più semplice per
 * trasformare un campo di testo in una falla.
 */
export function urlSicuro(valore) {
  const s = String(valore || "").trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(s)) return esc(s);
  return "#";
}

/* ------------------------------------------------------------------ soldi */

const FORMATO_EURO = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

/** Da centesimi interi alla forma leggibile: `euro(9000)` → "90,00 €". */
export function euro(centesimi) {
  return FORMATO_EURO.format(Number(centesimi || 0) / 100);
}

/**
 * Da centesimi alla forma che vogliono i dati strutturati e PayPal: "90.00".
 * Punto decimale e due cifre sempre, mai la virgola italiana e mai il simbolo.
 */
export function euroDecimale(centesimi) {
  const c = Math.round(Number(centesimi || 0));
  return (c / 100).toFixed(2);
}

/**
 * Arrotondamento a metà superiore sul centesimo.
 *
 * `Math.round` in JavaScript arrotonda -0.5 verso lo zero, il che sui rimborsi
 * darebbe un centesimo di differenza rispetto a quanto si aspetta chi fa i
 * conti. Qui gli importi sono sempre positivi, ma la funzione resta esplicita
 * per non dover ricontrollare il ragionamento fra sei mesi.
 */
export function arrotondaCentesimi(valore) {
  return Math.floor(valore + 0.5);
}

/* ------------------------------------------------------------------- date */

const FORMATO_DATA_ORA = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

/** Da ISO-8601 UTC all'ora italiana leggibile: "12/09/2026 10:30". */
export function dataOra(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return FORMATO_DATA_ORA.format(d).replace(",", "");
}

/** Solo la data: "12/09/2026". */
export function data(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return FORMATO_DATA.format(d);
}

/** Il momento presente in ISO-8601 UTC, la forma con cui scriviamo in D1. */
export function adesso() {
  return new Date().toISOString();
}

/** Un istante futuro, in minuti, nella stessa forma. */
export function fraMinuti(minuti) {
  return new Date(Date.now() + minuti * 60_000).toISOString();
}

/* ------------------------------------------------------------- casualità */

const ALFABETO_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Token casuale robusto, sicuro da mettere in un URL.
 *
 * Usa `crypto.getRandomValues` (generatore crittografico) e non `Math.random`,
 * che è prevedibile: questi token sono l'unica cosa che protegge la pagina di
 * stato di un ordine e la sessione dell'amministratore.
 *
 * Il modulo su 64 non introduce distorsione perché 256 è multiplo esatto di 64.
 */
export function tokenCasuale(byte = 32) {
  const grezzo = new Uint8Array(byte);
  crypto.getRandomValues(grezzo);
  let fuori = "";
  for (const b of grezzo) fuori += ALFABETO_URL[b % 64];
  return fuori;
}

/* ------------------------------------------------------------------- hash */

const CODIFICA = new TextEncoder();

function inEsadecimale(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 esadecimale. Usato per gli hash dei token di sessione. */
export async function sha256(testo) {
  return inEsadecimale(await crypto.subtle.digest("SHA-256", CODIFICA.encode(testo)));
}

/**
 * Hash con sale segreto, per i dati che non vogliamo conservare in chiaro ma
 * dobbiamo poter confrontare: indirizzi IP per la limitazione di frequenza,
 * e-mail nella prova del consenso.
 *
 * Senza il sale un hash di e-mail o di IP è reversibile in pratica: lo spazio
 * degli indirizzi IPv4 si esaurisce in pochi minuti su una macchina qualunque,
 * e per le e-mail esistono elenchi già pronti. Con un sale segreto e lungo,
 * l'hash resta confrontabile per noi e inutile per chi legga il database.
 */
export async function hashConSale(testo, sale) {
  return sha256(`${sale}::${String(testo || "").trim().toLowerCase()}`);
}

/**
 * Confronto a tempo costante fra due stringhe esadecimali.
 *
 * Il confronto `===` esce al primo carattere diverso: misurando i tempi di
 * risposta si può ricostruire un segreto un carattere alla volta. Qui si
 * scorrono sempre tutti i caratteri e si accumula la differenza con un OR.
 */
export function confrontoCostante(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let differenza = 0;
  for (let i = 0; i < x.length; i++) differenza |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return differenza === 0;
}

/**
 * Deriva la chiave di una password con PBKDF2-SHA256.
 *
 * 210.000 iterazioni è la soglia raccomandata da OWASP per PBKDF2-SHA256:
 * abbastanza alta da rendere costoso un attacco a dizionario, abbastanza
 * bassa da restare sotto i limiti di CPU di un Worker.
 */
export async function derivaPassword(password, saleEsadecimale, iterazioni = 210_000) {
  const sale = new Uint8Array(
    saleEsadecimale.match(/.{1,2}/g).map((h) => parseInt(h, 16))
  );
  const chiave = await crypto.subtle.importKey(
    "raw",
    CODIFICA.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bit = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sale, iterations: iterazioni, hash: "SHA-256" },
    chiave,
    256
  );
  return inEsadecimale(bit);
}

/* -------------------------------------------------------------- risposte */

const INTESTAZIONI_BASE = {
  "X-Content-Type-Options": "nosniff",
};

/** Risposta JSON con le intestazioni giuste e nessuna cache. */
export function rispostaJson(dati, stato = 200, intestazioni = {}) {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: {
      ...INTESTAZIONI_BASE,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...intestazioni,
    },
  });
}

/**
 * Errore in forma sempre uguale: un codice per il codice chiamante e un
 * messaggio per la persona. Il frontend non deve mai dover leggere il
 * messaggio per capire cosa è successo.
 */
export function rispostaErrore(codice, messaggio, stato = 400, intestazioni = {}) {
  return rispostaJson({ errore: codice, messaggio }, stato, intestazioni);
}

/** Risposta HTML. Le pagine generate non si mettono mai in cache a lungo. */
export function rispostaHtml(html, { stato = 200, intestazioni = {} } = {}) {
  return new Response(html, {
    status: stato,
    headers: {
      ...INTESTAZIONI_BASE,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      ...intestazioni,
    },
  });
}

/** Reindirizzamento. 303 perché segue quasi sempre una POST. */
export function rispostaRedirect(dove, stato = 303, intestazioni = {}) {
  return new Response(null, {
    status: stato,
    headers: { Location: dove, "Cache-Control": "no-store", ...intestazioni },
  });
}

/* ------------------------------------------------------------- validazione */

/** Le 107 sigle di provincia italiane. Usate per validare, non per decorare. */
export const PROVINCE = [
  "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ",
  "CA","CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE",
  "GO","GR","IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT",
  "NA","NO","NU","OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC",
  "RE","RG","RI","RM","RN","RO","SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP",
  "TR","TS","TV","UD","VA","VB","VC","VE","VI","VR","VT","VV",
];

const INSIEME_PROVINCE = new Set(PROVINCE);

/**
 * Convalida sintattica di un indirizzo e-mail.
 *
 * Volutamente permissiva: l'unica verifica che conta davvero è che il
 * messaggio di conferma arrivi, e un'espressione regolare aggressiva rifiuta
 * indirizzi legittimi (apostrofi, domini nuovi, sottodomini lunghi) molto più
 * spesso di quanto non blocchi errori veri.
 */
export function emailValida(valore) {
  const s = String(valore || "").trim();
  return s.length >= 5 && s.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
}

/** CAP italiano: esattamente cinque cifre. */
export function capValido(valore) {
  return /^\d{5}$/.test(String(valore || "").trim());
}

/** Sigla di provincia realmente esistente, non due lettere qualsiasi. */
export function provinciaValida(valore) {
  return INSIEME_PROVINCE.has(String(valore || "").trim().toUpperCase());
}

/**
 * Numero di telefono: almeno otto cifre, ignorando spazi, punti, trattini,
 * parentesi e prefisso internazionale. Serve al corriere per avvisare della
 * consegna, quindi conta che sia chiamabile, non che sia in un formato preciso.
 */
export function telefonoValido(valore) {
  const cifre = String(valore || "").replace(/[^\d]/g, "");
  return cifre.length >= 8 && cifre.length <= 15;
}

/** Slug ammesso negli indirizzi: minuscole, cifre e trattini. */
export function slugValido(valore) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(valore || ""));
}

/**
 * Normalizza e accorcia un testo libero arrivato da un modulo.
 *
 * Toglie i caratteri di controllo — compresi quelli che permettono di
 * falsificare una riga di log o di nascondere testo in un'etichetta di
 * spedizione — e impone una lunghezza massima.
 */
export function testoPulito(valore, lunghezzaMassima = 200) {
  let ripulito = "";
  for (const carattere of String(valore ?? "")) {
    ripulito += carattereInnocuo(carattere) ? carattere : " ";
  }
  return ripulito.replace(/\s+/g, " ").trim().slice(0, lunghezzaMassima);
}

/**
 * Decide se un carattere puo' finire in un testo che verra' mostrato, stampato
 * su un'etichetta di spedizione o scritto in un registro.
 *
 * Il controllo e' fatto sui punti di codice e non con una classe di caratteri
 * in un'espressione regolare: scritti letteralmente nel sorgente, questi
 * caratteri sarebbero invisibili a chi rilegge il file, e qualche editor li
 * normalizza in silenzio facendo sparire la regola senza che nessuno se ne
 * accorga.
 *
 * Si scartano:
 *   · i controlli C0 (0x00-0x1F) e C1 (0x7F-0x9F), che possono falsificare una
 *     riga di log o spezzare un'intestazione;
 *   · gli spazi a larghezza zero e i marcatori di direzione (0x200B-0x200F),
 *     i sostituti bidirezionali (0x202A-0x202E) e gli isolatori (0x2066-0x2069).
 *     Questi ultimi permettono di far LEGGERE un indirizzo diverso da quello
 *     realmente scritto: su un'etichetta di spedizione e' un modo noto per far
 *     recapitare un pacco altrove senza che il testo sembri alterato.
 */
function carattereInnocuo(carattere) {
  const c = carattere.codePointAt(0);
  if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return false;
  if (c >= 0x200b && c <= 0x200f) return false;
  if (c >= 0x202a && c <= 0x202e) return false;
  if (c >= 0x2066 && c <= 0x2069) return false;
  return true;
}

/* ------------------------------------------------------------------- cookie */

/** Legge un cookie dalla richiesta. Restituisce `null` se non c'è. */
export function leggiCookie(richiesta, nome) {
  const intestazione = richiesta.headers.get("Cookie") || "";
  for (const pezzo of intestazione.split(";")) {
    const [chiave, ...resto] = pezzo.trim().split("=");
    if (chiave === nome) {
      try {
        return decodeURIComponent(resto.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Compone l'intestazione `Set-Cookie`.
 *
 * `Secure` e `SameSite` non sono facoltativi: senza `SameSite` il cookie di
 * sessione dell'amministratore viaggerebbe anche su richieste partite da altri
 * siti, che è esattamente come funziona un attacco CSRF.
 */
export function scriviCookie(nome, valore, {
  maxEta = 60 * 60 * 24 * 30,
  percorso = "/",
  soloHttp = false,
  stessoSito = "Lax",
} = {}) {
  const parti = [
    `${nome}=${encodeURIComponent(valore)}`,
    `Path=${percorso}`,
    `Max-Age=${maxEta}`,
    `SameSite=${stessoSito}`,
    "Secure",
  ];
  if (soloHttp) parti.push("HttpOnly");
  return parti.join("; ");
}

/** Cancella un cookie impostandolo scaduto. */
export function cancellaCookie(nome, percorso = "/") {
  return `${nome}=; Path=${percorso}; Max-Age=0; SameSite=Lax; Secure`;
}

/* --------------------------------------------------------------------- log */

/**
 * Registrazione di servizio.
 *
 * Esiste per un motivo preciso: avere un unico punto da cui passano tutti i
 * messaggi, così si può garantire che non ci finisca mai un dato personale.
 * Chi scrive `console.log` sparsi nel codice prima o poi ci mette dentro
 * un'e-mail, e quell'e-mail resta nei log di Cloudflare.
 */
export function registra(livello, messaggio, extra = {}) {
  const riga = { livello, messaggio, quando: adesso(), ...extra };
  if (livello === "errore") console.error(JSON.stringify(riga));
  else console.log(JSON.stringify(riga));
}

/**
 * Indirizzo IP del chiamante, per la sola limitazione di frequenza.
 *
 * Cloudflare garantisce `CF-Connecting-IP`; le altre intestazioni sono
 * falsificabili dal client e non vanno usate. Il valore non va mai conservato
 * né registrato in chiaro: passa sempre da `hashConSale()`.
 */
export function ipChiamante(richiesta) {
  return richiesta.headers.get("CF-Connecting-IP") || "0.0.0.0";
}
