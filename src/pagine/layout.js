/* =========================================================================
   EmmeLù — scheletro HTML condiviso dalle pagine generate dal Worker
   (negozio, scheda prodotto, carrello, checkout, stato dell'ordine).

   Questo modulo è l'unico posto in cui vive la testa del documento, l'header,
   il menu e il piè di pagina: se una pagina generata diverge dalla home per
   un dettaglio di marcatura, la divergenza va corretta qui e non copiata.

   La testa riproduce quella di public/index.html nei due frammenti di script
   in linea: la configurazione di iubenda e la riga che segna la pagina come
   "js".

   ATTENZIONE a come sono autorizzati, perché qui prima c'era scritto il
   contrario ed è costato il consenso cookie su tutte le pagine generate.
   Le pagine STATICHE passano da public/_headers, che autorizza per hash
   SHA-256 (li calcola tools/aggiorna-csp-hash.py). Le pagine GENERATE non
   passano da quel file: la loro CSP la costruisce intestazioniSicurezza() in
   src/index.js, e autorizza per NONCE. Gli hash dei file statici non
   c'entrano nulla con questa testa.

   Conseguenza pratica: ogni <script> in linea qui dentro deve portare
   ${nonce}, altrimenti il browser lo blocca — in silenzio per chi prova con
   curl, che le intestazioni le riceve ma non esegue niente.
   ========================================================================= */

import { esc } from "../util.js";

/* Larghezze delle varianti responsive davvero presenti in public/assets/img:
   le foto dei pezzi sono state generate a 450 px, quelle della galleria a
   400 px. Non esiste una colonna nel database che lo dica, quindi la regola
   sta qui, in un posto solo, invece che sparsa nelle pagine. */
const LARGHEZZA_GALLERIA = 400;
const LARGHEZZA_PEZZO = 450;

/**
 * Larghezza della variante ridotta per una data immagine.
 * Garantisce un numero sempre valido; non garantisce che il file esista se
 * qualcuno aggiunge immagini con una convenzione di nomi diversa.
 */
export function larghezzaVariante(base) {
  return String(base || "").startsWith("gallery") ? LARGHEZZA_GALLERIA : LARGHEZZA_PEZZO;
}

/**
 * Costruisce il <picture> responsive di un'immagine di prodotto.
 *
 * Garantisce: marcatura valida anche con immagine assente o incompleta,
 * `width`/`height` sempre presenti (zero spostamento di layout), `alt`
 * sempre passato da esc().
 *
 * NON garantisce la presenza dei file WebP: in public/assets/img alcune basi
 * hanno la variante WebP e altre no (borsa-03 e gallery-03 non ce l'hanno), e
 * un <source type="image/webp"> che punta a un file mancante non ricade sul
 * JPEG — mostra un'immagine rotta. Finché il database non dichiara i formati
 * disponibili si servono solo AVIF (variante ridotta) e JPEG, che esistono
 * per ogni base. Vedi la nota nel resoconto.
 */
export function figuraProdotto(immagine, opzioni) {
  const opt = opzioni || {};
  const img = immagine || {};
  const base = String(img.base || "");
  if (!base) { return ""; }

  const w = larghezzaVariante(base);
  const sizes = opt.sizes || "(min-width: 64em) 30vw, (min-width: 48em) 46vw, 90vw";
  const larghezza = Number(img.larghezza) > 0 ? Math.round(Number(img.larghezza)) : 900;
  const altezza = Number(img.altezza) > 0 ? Math.round(Number(img.altezza)) : 1200;
  const prioritaria = opt.prioritaria === true;

  const ridotta = `/assets/img/${esc(base)}-w${w}`;
  const piena = `/assets/img/${esc(base)}`;

  return `<picture>
              <source type="image/avif" srcset="${ridotta}.avif ${w}w" sizes="${esc(sizes)}">
              <img src="${piena}.jpg" srcset="${ridotta}.jpg ${w}w, ${piena}.jpg ${larghezza}w" sizes="${esc(sizes)}" alt="${esc(img.alt || "")}" width="${larghezza}" height="${altezza}" ${prioritaria ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async">
            </picture>`;
}

/* I simboli SVG usati dalle pagine generate. Sono gli stessi della home più
   il carrello, che sulla home non serve. */
function simboli() {
  return `<svg class="visually-hidden" aria-hidden="true" focusable="false" width="0" height="0">
  <defs>
    <symbol id="emmelu-mark" viewBox="0 0 120 120">
      <g fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round">
        <path d="M60 46 C 55 58, 49 66, 44 73"/>
        <path d="M60 46 C 66 56, 72 63, 77 70"/>
      </g>
      <g fill="currentColor">
        <path d="M60 45 C 43 47, 26 36, 15 13 C 38 13, 55 25, 60 45 Z"/>
        <path d="M60 45 C 77 47, 94 36, 105 13 C 82 13, 65 25, 60 45 Z" opacity=".92"/>
        <circle cx="42" cy="88" r="13.5"/>
        <circle cx="78" cy="85" r="13.5" opacity=".93"/>
      </g>
    </symbol>
    <symbol id="i-arrow-right" viewBox="0 0 24 24">
      <path d="M5 12h14m0 0-5.5-5.5M19 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-arrow-up" viewBox="0 0 24 24">
      <path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-arrow-left" viewBox="0 0 24 24">
      <path d="M19 12H5m0 0 5.5-5.5M5 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-close" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-expand" viewBox="0 0 24 24">
      <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="i-carrello" viewBox="0 0 24 24">
      <path d="M8 8V6.5a4 4 0 0 1 8 0V8m-11 0h14l-1 12.5H6L5 8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
  </defs>
</svg>`;
}

/* Etichetta parlata dell'indicatore carrello: il numero da solo, letto da uno
   screen reader accanto a un'icona, non dice nulla. */
export function etichettaCarrello(articoli) {
  const n = Number(articoli) || 0;
  if (n <= 0) { return "Carrello, vuoto"; }
  if (n === 1) { return "Carrello, 1 articolo"; }
  return `Carrello, ${n} articoli`;
}

function contaArticoli(carrello) {
  if (!Array.isArray(carrello)) { return 0; }
  return carrello.reduce(function (somma, riga) {
    const q = Number(riga && riga.quantita);
    return somma + (Number.isFinite(q) && q > 0 ? Math.floor(q) : 0);
  }, 0);
}

function intestazione(ctx) {
  const config = ctx.config || {};
  const instagram = config.instagram || "https://www.instagram.com/emmeluofficial/";
  const articoli = contaArticoli(ctx.carrello);

  /* In modalità vetrina non esiste un carrello da mostrare: l'indicatore non
     compare affatto, invece di comparire vuoto e promettere un acquisto che
     il server rifiuterebbe con un 503. */
  const indicatore = config.negozioAttivo
    ? `<a class="header__carrello" href="/carrello" data-carrello-indicatore aria-label="${esc(etichettaCarrello(articoli))}">
        <svg class="header__carrello-icona" aria-hidden="true" focusable="false"><use href="#i-carrello"></use></svg>
        <span class="header__carrello-num" data-carrello-numero${articoli > 0 ? "" : " hidden"}>${esc(String(articoli))}</span>
      </a>`
    : "";

  return `<header class="header" id="site-header">
  <div class="header__inner">
    <nav class="header__nav header__nav--sections" aria-label="Sezioni del sito">
      <a class="header__link" href="/">Home</a>
      <a class="header__link" href="/negozio">Negozio</a>
      <a class="header__link" href="/#filosofia">Filosofia</a>
      <a class="header__link" href="/#lavorazione">Lavorazione</a>
      <a class="header__link" href="/#domande">Domande</a>
    </nav>

    <a class="header__brand" href="/" aria-label="EmmeLù — torna alla home">
      <svg viewBox="0 0 260 198" role="img" aria-hidden="true" focusable="false">
        <use href="#emmelu-mark" x="91" y="0" width="78" height="78"></use>
        <text x="130" y="152" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="98" fill="currentColor">LM</text>
        <text x="134" y="190" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="25" letter-spacing="7" fill="currentColor">EMMELÙ</text>
      </svg>
    </a>

    <nav class="header__nav header__nav--end" aria-label="Instagram e carrello">
      <a class="header__link" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
      ${indicatore}
    </nav>

    <button class="burger" type="button" id="burger" aria-expanded="false" aria-controls="menu" aria-label="Apri il menu">
      <span class="burger__label" aria-hidden="true">
        <span class="burger__word">Menu</span>
        <span class="burger__word">Chiudi</span>
      </span>
      <span class="burger__icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" focusable="false">
          <path d="M7.333 16V0h1.334v16H7.333Z" fill="currentColor"></path>
          <path d="M16 8.667H0V7.333h16v1.334Z" fill="currentColor"></path>
        </svg>
      </span>
    </button>
  </div>
</header>`;
}

/* Il menu a tutta pagina è lo stesso della home — stessa marcatura, perché è
   main.js a pilotarlo e si aspetta .menu__shape / .menu__item[data-shape]. */
function menuMobile(ctx) {
  const config = ctx.config || {};
  const instagram = config.instagram || "https://www.instagram.com/emmeluofficial/";
  const email = config.email || "ellebi.style@gmail.com";
  const voceCarrello = config.negozioAttivo
    ? `<li class="menu__item" data-shape="6"><a class="menu__link" href="/carrello">Carrello</a></li>`
    : "";

  return `<div class="menu" id="menu" hidden>
  <div class="menu__bg" aria-hidden="true">
    <span class="menu__panel"></span>
    <span class="menu__panel"></span>
    <span class="menu__panel"></span>
  </div>

  <div class="menu__shapes" aria-hidden="true">
    <svg class="menu__shape" data-shape="1" viewBox="0 0 400 400" fill="none">
      <circle class="menu__shape-el" fill="currentColor" cx="86" cy="118" r="42"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="298" cy="84" r="62"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="198" cy="298" r="82"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="342" cy="282" r="30"></circle>
    </svg>
    <svg class="menu__shape" data-shape="2" viewBox="0 0 400 400" fill="none">
      <path class="menu__shape-el" stroke="currentColor" fill="none" d="M0 196 Q100 96, 200 196 T400 196" stroke-width="58"></path>
      <path class="menu__shape-el" stroke="currentColor" fill="none" d="M0 282 Q100 182, 200 282 T400 282" stroke-width="38"></path>
    </svg>
    <svg class="menu__shape" data-shape="3" viewBox="0 0 400 400" fill="none">
      <circle class="menu__shape-el" fill="currentColor" cx="70" cy="96" r="9"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="170" cy="96" r="9"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="270" cy="96" r="9"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="120" cy="196" r="13"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="220" cy="196" r="13"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="320" cy="196" r="13"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="170" cy="300" r="10"></circle>
      <circle class="menu__shape-el" fill="currentColor" cx="270" cy="300" r="10"></circle>
    </svg>
    <svg class="menu__shape" data-shape="4" viewBox="0 0 400 400" fill="none">
      <path class="menu__shape-el" fill="currentColor" d="M104 104 Q154 54, 204 104 Q254 154, 204 204 Q154 254, 104 204 Q54 154, 104 104"></path>
      <path class="menu__shape-el" fill="currentColor" d="M244 206 Q294 156, 344 206 Q394 256, 344 306 Q294 356, 244 306 Q194 256, 244 206"></path>
    </svg>
    <svg class="menu__shape" data-shape="5" viewBox="0 0 400 400" fill="none">
      <line class="menu__shape-el" stroke="currentColor" x1="0" y1="104" x2="300" y2="400" stroke-width="30"></line>
      <line class="menu__shape-el" stroke="currentColor" x1="104" y1="0" x2="400" y2="296" stroke-width="24"></line>
      <line class="menu__shape-el" stroke="currentColor" x1="204" y1="0" x2="400" y2="196" stroke-width="18"></line>
    </svg>
    <svg class="menu__shape" data-shape="6" viewBox="0 0 400 400" fill="none">
      <circle class="menu__shape-el" stroke="currentColor" fill="none" cx="200" cy="200" r="52" stroke-width="30"></circle>
      <circle class="menu__shape-el" stroke="currentColor" fill="none" cx="200" cy="200" r="122" stroke-width="22"></circle>
      <circle class="menu__shape-el" stroke="currentColor" fill="none" cx="200" cy="200" r="186" stroke-width="14"></circle>
    </svg>
  </div>

  <nav aria-label="Navigazione del sito">
    <ul class="menu__list" role="list">
      <li class="menu__item" data-shape="2"><a class="menu__link" href="/negozio">Negozio</a></li>
      ${voceCarrello}
      <li class="menu__item" data-shape="1"><a class="menu__link" href="/#collezioni">Collezioni</a></li>
      <li class="menu__item" data-shape="3"><a class="menu__link" href="/#filosofia">Filosofia</a></li>
      <li class="menu__item" data-shape="4"><a class="menu__link" href="/#lavorazione">Lavorazione</a></li>
      <li class="menu__item" data-shape="5"><a class="menu__link" href="/#domande">Domande</a></li>
    </ul>
  </nav>
  <div class="menu__foot">
    <a class="btn btn--solid" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">
      Ordina su Instagram
      <svg class="btn__icon" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
    </a>
    <a class="link-line" href="mailto:${esc(email)}">${esc(email)}</a>
  </div>
</div>`;
}

/* Dati fiscali: o ci sono tutti o non si stampa nulla. Un piè di pagina con
   «P.IVA: —» è peggio di un piè di pagina senza quel blocco, perché dichiara
   al pubblico un'informazione obbligatoria che non c'è (D.Lgs 70/2003 art. 7).
   L'interruttore NEGOZIO_ATTIVO e questo blocco condividono la stessa
   condizione, e non è un caso. */
function datiFiscali(config) {
  if (!config.datiFiscaliCompleti) { return ""; }

  const righe = [
    config.ragioneSociale ? `<li>${esc(config.ragioneSociale)}</li>` : "",
    config.piva ? `<li>P.IVA ${esc(config.piva)}</li>` : "",
    config.codiceFiscale && config.codiceFiscale !== config.piva
      ? `<li>C.F. ${esc(config.codiceFiscale)}</li>` : "",
    config.sedeLegale ? `<li>${esc(config.sedeLegale)}</li>` : "",
    config.rea ? `<li>REA ${esc(config.rea)}</li>` : "",
    config.pec ? `<li>PEC <a class="link-line" href="mailto:${esc(config.pec)}">${esc(config.pec)}</a></li>` : "",
    config.codiceSdi ? `<li>Codice SDI ${esc(config.codiceSdi)}</li>` : "",
  ].filter(Boolean).join("\n          ");

  if (!righe) { return ""; }

  // 320 e non 240: la colonna "Serve aiuto" si e' inserita prima di
  // "Trovami", che ha preso il 240. Due colonne con lo stesso ritardo
  // comparirebbero insieme, rompendo la cascata da sinistra a destra.
  return `<div class="footer__col" data-reveal data-reveal-delay="320">
        <h3>Dati fiscali</h3>
        <ul class="footer__list footer__fiscali" role="list">
          ${righe}
        </ul>
      </div>`;
}

/**
 * Il carrello a scomparsa.
 *
 * È il pezzo che mancava perché il sito somigliasse a un negozio e non a un
 * catalogo: finora premere «Aggiungi al carrello» scriveva una riga di testo
 * sotto il pulsante, e chi comprava doveva accorgersene da solo. Ora il
 * pannello si apre di lato, mostra cosa c'è dentro e porta al pagamento.
 *
 * Tre scelte da non disfare:
 *
 * · qui dentro NON c'è nessun totale. Il pannello nasce vuoto e lo riempie
 *   negozio.js con la risposta di /api/preventivo: i conti li fa il server,
 *   sempre, anche quando servono solo a disegnare una cifra;
 * · l'indicatore in testa resta un <a href="/carrello"> vero. Il pannello si
 *   aggancia al clic e previene la navigazione solo se lo script gira: senza
 *   JavaScript si finisce sulla pagina del carrello, che funziona;
 * · il pannello è marcato `inert` e `hidden` finché è chiuso, così non si
 *   raggiunge col tabulatore da dietro il velo.
 */
function pannelloCarrello(config) {
  if (!config.negozioAttivo) { return ""; }

  const soglia = Number(config.sogliaSpedizioneGratisCent) || 0;

  return `<div class="pannello" id="pannello-carrello" hidden inert>
  <div class="pannello__velo" data-pannello-chiudi></div>
  <aside class="pannello__foglio" role="dialog" aria-modal="true" aria-labelledby="pannello-titolo">
    <header class="pannello__testa">
      <h2 class="pannello__titolo" id="pannello-titolo">Il tuo carrello</h2>
      <button class="pannello__chiudi" type="button" data-pannello-chiudi aria-label="Chiudi il carrello">
        <svg aria-hidden="true" focusable="false"><use href="#i-close"></use></svg>
      </button>
    </header>

    ${soglia > 0 ? `<div class="pannello__spedizione" data-spedizione-gratis data-soglia="${esc(String(soglia))}" hidden>
      <p class="pannello__spedizione-testo" data-spedizione-testo></p>
      <div class="pannello__barra"><span class="pannello__barra-riempi" data-spedizione-barra></span></div>
    </div>` : ""}

    <div class="pannello__corpo" data-pannello-righe aria-live="polite" aria-busy="true">
      <p class="pannello__attesa">Un momento…</p>
    </div>

    <footer class="pannello__piede" data-pannello-piede hidden>
      <div class="pannello__totale">
        <span>Subtotale</span>
        <strong class="numerico" data-pannello-subtotale>—</strong>
      </div>
      <p class="pannello__nota">Spedizione e IVA nel passaggio successivo.</p>
      <a class="btn btn--solid pannello__paga" href="/checkout">Vai al pagamento</a>
      <a class="link-line pannello__vedi" href="/carrello">Vedi il carrello completo</a>
    </footer>
  </aside>
</div>`;
}

function piePagina(ctx) {
  const config = ctx.config || {};
  const instagram = config.instagram || "https://www.instagram.com/emmeluofficial/";
  const email = config.email || "ellebi.style@gmail.com";

  return `<footer class="footer" id="footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__col" data-reveal>
        <h2>EMMELÙ</h2>
        <p class="footer__text">Capsule limited edition cucite a mano in Italia. Stile, armonia, autenticità.</p>
      </div>

      <div class="footer__col" data-reveal data-reveal-delay="80">
        <h3>Naviga</h3>
        <ul class="footer__list" role="list">
          <li><a class="link-line" href="/negozio">Negozio</a></li>
          <li><a class="link-line" href="/#collezioni">Collezioni</a></li>
          <li><a class="link-line" href="/#filosofia">Filosofia</a></li>
          <li><a class="link-line" href="/#lavorazione">Lavorazione</a></li>
          <li><a class="link-line" href="/#domande">Domande</a></li>
        </ul>
      </div>

      <div class="footer__col" data-reveal data-reveal-delay="160">
        <h3>Serve aiuto</h3>
        <ul class="footer__list" role="list">
          <li><a class="link-line" href="/ordine">Ritrova il tuo ordine</a></li>
          <li><a class="link-line" href="/spedizioni">Spedizioni e tempi</a></li>
          <li><a class="link-line" href="/pagamenti">Come si paga</a></li>
          <li><a class="link-line" href="/resi">Resi e recesso</a></li>
          <li><a class="link-line" href="/cura">Come si cura</a></li>
          <li><a class="link-line" href="/assistenza">Assistenza</a></li>
          <li><a class="link-line" href="/chi-siamo">Chi c'è dietro</a></li>
        </ul>
      </div>

      <div class="footer__col" data-reveal data-reveal-delay="240">
        <h3>Trovami</h3>
        <ul class="footer__list" role="list">
          <li><a class="link-line" href="${esc(instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a></li>
          <li><a class="link-line" href="mailto:${esc(email)}">${esc(email)}</a></li>
        </ul>
      </div>

      ${datiFiscali(config)}
    </div>
  </div>

  <p class="footer__wordmark" aria-hidden="true">EmmeLù</p>

  <div class="wrap">
    <div class="footer__bottom">
      <p>© <span data-year>2026</span> EMMELÙ — Capsule limited edition</p>
      <ul class="footer__legal" role="list">
        <li><a class="link-line" href="/cookie">Cookie policy</a></li>
        <li><a class="link-line" href="/privacy">Privacy policy</a></li>
        <li><a class="link-line" href="/termini">Termini e condizioni</a></li>
        <li><a class="link-line" href="/vendita">Condizioni di vendita</a></li>
        <li><a class="link-line" href="/resi">Resi e recesso</a></li>
        <li><a class="link-line" href="/ordine">Ritrova il tuo ordine</a></li>
        <li><a class="link-line" href="/accessibilita">Accessibilità</a></li>
        <li><button class="cookie-prefs iubenda-cs-preferences-link" type="button">Preferenze cookie</button></li>
      </ul>
    </div>
  </div>
</footer>

<button class="to-top" type="button" id="to-top" aria-label="Torna all'inizio della pagina">
  <svg aria-hidden="true" focusable="false"><use href="#i-arrow-up"></use></svg>
</button>

<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Immagine ingrandita" hidden>
  <div class="lightbox__bar">
    <span id="lightbox-counter">1 / 1</span>
    <button class="lightbox__close" type="button" data-lightbox-close aria-label="Chiudi l'immagine ingrandita">
      <svg aria-hidden="true" focusable="false"><use href="#i-close"></use></svg>
    </button>
  </div>
  <div class="lightbox__stage">
    <picture>
      <source id="lightbox-avif" type="image/avif">
      <source id="lightbox-webp" type="image/webp">
      <img id="lightbox-img" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" width="1" height="1" decoding="async">
    </picture>
  </div>
  <p class="lightbox__caption" id="lightbox-caption"></p>
  <button class="lightbox__nav lightbox__nav--prev" type="button" data-lightbox-prev aria-label="Immagine precedente">
    <svg aria-hidden="true" focusable="false"><use href="#i-arrow-left"></use></svg>
  </button>
  <button class="lightbox__nav lightbox__nav--next" type="button" data-lightbox-next aria-label="Immagine successiva">
    <svg aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg>
  </button>
</div>`;
}

/* JSON-LD: la serializzazione chiude il contesto script se un testo del
   database contiene "</script>". Si neutralizza il solo carattere "<", che in
   JSON è rappresentabile come < senza cambiare il valore. */
function serializzaJsonLd(oggetto, nonce) {
  if (!oggetto) { return ""; }
  let testo;
  try {
    testo = JSON.stringify(oggetto);
  } catch (e) {
    return "";
  }
  if (!testo) { return ""; }
  testo = testo.replace(/</g, "\\u003c");
  return `<script type="application/ld+json"${nonce}>${testo}</script>`;
}

/**
 * Documento HTML completo di una pagina generata dal Worker.
 *
 * Garantisce: testa e cornice identiche a quelle della home (stessi fogli di
 * stile, stesso header, stesso menu, stesso piè di pagina), `<title>` con il
 * suffisso del marchio aggiunto qui una volta sola, escape di ogni valore
 * interpolato.
 *
 * NON garantisce nulla sul contenuto di `corpo`: è la pagina chiamante a
 * doverlo produrre già passato da esc(). Qui `corpo` viene inserito così
 * com'è, perché è marcatura.
 */
export function paginaCompleta(opzioni) {
  const o = opzioni || {};
  const ctx = o.ctx || {};
  const config = ctx.config || {};

  const titolo = String(o.titolo || "EmmeLù");
  const descrizione = String(o.descrizione || "");
  const canonical = o.canonical || null;
  const noindex = o.noindex === true;
  const corpo = String(o.corpo || "");
  const cssExtra = Array.isArray(o.cssExtra) ? o.cssExtra : [];
  const jsExtra = Array.isArray(o.jsExtra) ? o.jsExtra : [];

  const vCss = esc(String(config.versioneCss || "0"));
  const vJs = esc(String(config.versioneJs || "0"));
  const sito = String(config.sito || "https://ellebi.it").replace(/\/$/, "");

  /* La CSP di questo sito autorizza gli script in linea per hash. Gli hash
     però si calcolano sui file statici prima della pubblicazione, e il
     JSON-LD di una pagina generata cambia a ogni richiesta: l'unica via
     praticabile è un nonce per risposta. Se il Worker lo fornisce lo si usa;
     se non lo fornisce la marcatura resta valida e tocca al backend
     aggiungere l'hash. Vedi la nota nel resoconto. */
  const nonce = config.nonceCsp ? ` nonce="${esc(String(config.nonceCsp))}"` : "";

  const titoloCompleto = `${titolo} — EmmeLù`;
  const ogImage = `${sito}/assets/img/og-cover.jpg`;

  const fogli = ["/assets/css/style.css", "/assets/css/negozio.css"]
    .concat(cssExtra.filter(function (p) { return typeof p === "string" && p; }))
    .map(function (percorso) {
      return `<link rel="stylesheet" href="${esc(percorso)}?v=${vCss}">`;
    })
    .join("\n");

  /* main.js resta indispensabile anche qui: è lui a muovere l'header, il menu
     a tutta pagina, la lightbox e il pulsante "torna su", che questa cornice
     riproduce identici. negozio.js aggiunge solo la parte d'acquisto. */
  const copioni = ["/assets/js/main.js", "/assets/js/negozio.js"]
    .concat(jsExtra.filter(function (p) { return typeof p === "string" && p; }))
    .map(function (percorso) {
      return `<script src="${esc(percorso)}?v=${vJs}" defer></script>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- I preconnect precedono gli script di iubenda: il browser apre la
     connessione TLS mentre sta ancora leggendo la testa del documento,
     invece di aprirla solo quando incontra il tag <script>. -->
<link rel="preconnect" href="https://cdn.iubenda.com" crossorigin>
<link rel="preconnect" href="https://cs.iubenda.com" crossorigin>
<!-- Cookie Solution iubenda: deve restare il primo script del documento,
     così l'autoblocking impedisce a qualunque altro script di partire
     prima che la persona scelga (https://www.iubenda.com/it/help/1205). -->
<script type="text/javascript"${nonce}>
var _iub = _iub || [];
_iub.csConfiguration = {"siteId":4652493,"cookiePolicyId":91176910,"lang":"it","consentOnScroll":false,"floatingPreferencesButtonDisplay":"bottom-left","banner":{"acceptButtonDisplay":false,"rejectButtonDisplay":false,"customizeButtonDisplay":false,"closeButtonDisplay":false},"callback":{"onPreferenceExpressed":function(){var b=document.getElementById("cookie-banner");if(b){b.classList.remove("is-visible");}try{localStorage.setItem("emmelu_cookie_seen","1");}catch(e){}}}};
</script>
<script type="text/javascript" src="https://cs.iubenda.com/autoblocking/4652493.js" async></script>
<script type="text/javascript" src="https://cdn.iubenda.com/cs/iubenda_cs.js" charset="UTF-8" async></script>
<title>${esc(titoloCompleto)}</title>
<meta name="description" content="${esc(descrizione)}">
<meta name="author" content="EmmeLù">
<meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
<meta name="theme-color" content="#fbeae1">
<meta name="color-scheme" content="light">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}

<!-- SEO social -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="EmmeLù">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(titoloCompleto)}">
<meta property="og:description" content="${esc(descrizione)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Una borsa EmmeLù cucita a mano in filato tortora">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titoloCompleto)}">
<meta name="twitter:description" content="${esc(descrizione)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<!-- Icone -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<!-- Risorse critiche -->
<link rel="preload" href="/assets/fonts/jost-300-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/jost-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/fonts.css">
${fogli}
<script${nonce}>document.documentElement.classList.add("js")</script>
${serializzaJsonLd(o.jsonLd, nonce)}
</head>

<body>
<a class="skip-link" href="#main">Vai al contenuto principale</a>

<!-- ===================== Banner Cookie ===================== -->
<div class="cookie-banner" id="cookie-banner" role="region" aria-label="Consenso ai cookie" aria-live="polite">
  <div class="cookie-banner__content">
    <div class="cookie-banner__text">
      <p>Utilizziamo cookie e tecnologie simili per garantirti la migliore esperienza sul sito. Puoi gestire le tue preferenze in qualsiasi momento.</p>
    </div>
    <div class="cookie-banner__actions">
      <button class="cookie-banner__btn cookie-banner__btn--accept" type="button" id="cookie-accept">Accetta tutto</button>
      <button class="cookie-banner__btn cookie-banner__btn--reject" type="button" id="cookie-reject">Rifiuta</button>
      <button class="cookie-banner__btn cookie-banner__btn--settings iubenda-cs-preferences-link" type="button">Preferenze</button>
    </div>
  </div>
</div>

<!-- ===================== Simboli SVG ===================== -->
${simboli()}

<!-- ===================== Header ===================== -->
${intestazione(ctx)}

<!-- ===================== Menu mobile ===================== -->
${menuMobile(ctx)}

${corpo}

<!-- ===================== Carrello a scomparsa ===================== -->
${pannelloCarrello(config)}

<!-- ===================== Footer ===================== -->
${piePagina(ctx)}

${copioni}
</body>
</html>`;
}
