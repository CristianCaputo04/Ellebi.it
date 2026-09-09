/* =========================================================================
   ELLEBI — interazioni del sito
   Vanilla JS, nessuna dipendenza esterna, nessun tracciamento di default.
   Ogni modulo è difensivo: se un elemento non esiste, il modulo esce.
   ========================================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReduced = function () { return reduceMotion.matches; };
  var supportsIO = "IntersectionObserver" in window;

  /* ---------------------------------------------------------------- utils */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  // sposta il focus solo quando l'elemento è davvero visibile
  // (durante la transizione di apertura focus() verrebbe ignorato)
  function focusWhenVisible(el) {
    if (!el) { return; }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { el.focus(); });
    });
  }

  // Un solo listener di scorrimento per tutta la pagina. Prima ce n'erano
  // tre (header, parallasse, "torna su"): ognuno registrava il proprio
  // requestAnimationFrame e rileggeva window.scrollY per conto suo, cioè tre
  // callback e tre letture per ogni fotogramma di scorrimento. Ora la
  // posizione si legge una volta e viene passata a chi l'ha chiesta.
  var scrollSubs = [];
  (function scrollDispatcher() {
    var ticking = false;
    function run() {
      ticking = false;
      var y = window.scrollY;
      for (var i = 0; i < scrollSubs.length; i++) { scrollSubs[i](y); }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(run); }
    }, { passive: true });
  })();

  function onScroll(handler) {
    scrollSubs.push(handler);
    handler(window.scrollY);
  }

  // localStorage non è sempre disponibile (navigazione privata, cookie di
  // terze parti bloccati, quota esaurita): senza protezione una sola lettura
  // che solleva un'eccezione fermerebbe tutto il modulo che la contiene.
  function memoriaLeggi(chiave) {
    try { return window.localStorage.getItem(chiave); } catch (e) { return null; }
  }
  function memoriaScrivi(chiave, valore) {
    try { window.localStorage.setItem(chiave, valore); } catch (e) { /* si prosegue senza */ }
  }
  function memoriaCancella(chiave) {
    try { window.localStorage.removeItem(chiave); } catch (e) { /* si prosegue senza */ }
  }

  /* ------------------------------------------------------------ preloader */
  (function preloader() {
    var node = $(".preloader");
    if (!node) { return; }
    var salvagente = null;
    function hide() {
      document.body.classList.add("is-loaded");
      if (salvagente !== null) { window.clearTimeout(salvagente); salvagente = null; }
    }
    if (document.readyState === "complete") { hide(); }
    else {
      window.addEventListener("load", hide, { once: true });
      // rete lenta o risorsa bloccata: il sito resta comunque utilizzabile
      salvagente = window.setTimeout(hide, 3500);
    }
  })();

  /* ---------------------------------------------------------- anno footer */
  $$("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* --------------------------------------------------------------- header */
  (function header() {
    var el = $("#site-header");
    if (!el) { return; }
    var last = window.scrollY;
    var menuOpen = function () { return document.body.classList.contains("is-locked"); };
    // Da 76em in su l'header contiene la barra delle sezioni: è la
    // navigazione della pagina e resta sempre a portata di clic. Sotto,
    // dove al suo posto c'è il bottone Menu, continua a sparire scendendo
    // per lasciare più schermo alle foto. La soglia è la stessa del CSS.
    var barraSezioni = window.matchMedia("(min-width: 76em)");

    onScroll(function (y) {
      el.classList.toggle("is-stuck", y > 40);
      if (menuOpen() || barraSezioni.matches) {
        el.classList.remove("is-hidden");
      } else {
        el.classList.toggle("is-hidden", y > last && y > 260);
      }
      last = y;
    });
  })();

  /* ------------------------------------------- sezione in lettura (spy) */
  // Marca nella barra desktop la voce della sezione che si sta guardando.
  // Usa IntersectionObserver: nessuna lettura di geometria a ogni
  // fotogramma, quindi nessun ricalcolo di layout durante lo scorrimento.
  (function sectionSpy() {
    var links = $$(".header__nav--sections .header__link");
    if (!links.length || !supportsIO) { return; }

    var voci = [];
    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.charAt(0) !== "#" || href.length < 2) { return; }
      var target = document.getElementById(href.slice(1));
      if (target) { voci.push({ link: link, target: target, visibile: false }); }
    });
    if (!voci.length) { return; }

    var attiva = null;
    function aggiorna() {
      var prima = null;
      for (var i = 0; i < voci.length; i++) {
        if (voci[i].visibile) { prima = voci[i]; break; }
      }
      if (prima === attiva) { return; }
      if (attiva) { attiva.link.removeAttribute("aria-current"); }
      if (prima) { prima.link.setAttribute("aria-current", "true"); }
      attiva = prima;
    }

    // La fascia utile parte sotto l'header e finisce a metà schermo: è
    // "la sezione che si sta leggendo", non "la sezione che si intravede".
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        for (var i = 0; i < voci.length; i++) {
          if (voci[i].target === entry.target) { voci[i].visibile = entry.isIntersecting; break; }
        }
      });
      aggiorna();
    }, { rootMargin: "-10% 0px -55% 0px", threshold: 0 });

    voci.forEach(function (voce) { io.observe(voce.target); });
  })();

  /* ---------------------------------------------------------- menu mobile */
  (function mobileMenu() {
    var burger = $("#burger");
    var menu = $("#menu");
    if (!burger || !menu) { return; }

    var lastFocused = null;
    var headerEl = $("#site-header");
    var focusableSel = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

    function open() {
      lastFocused = document.activeElement;
      menu.hidden = false;
      // forza un reflow perché la transizione parta dallo stato chiuso
      void menu.offsetWidth;
      menu.classList.add("is-open");
      burger.setAttribute("aria-expanded", "true");
      burger.setAttribute("aria-label", "Chiudi il menu");
      document.body.classList.add("is-locked");
      if (headerEl) { headerEl.classList.add("is-over-menu"); headerEl.classList.remove("is-hidden"); }
      focusWhenVisible($(focusableSel, menu));
      document.addEventListener("keydown", onKeydown);
    }

    // Forme d'ambiente: affiorano dietro la voce puntata dal mouse o
    // raggiunta con il tabulatore, così l'effetto non è solo per chi ha un
    // dispositivo di puntamento.
    var shapes = $$(".menu__shape", menu);

    function clearShapes() {
      shapes.forEach(function (s) { s.classList.remove("is-active"); });
    }

    $$(".menu__item[data-shape]", menu).forEach(function (item) {
      var wanted = item.getAttribute("data-shape");
      var target = null;
      shapes.forEach(function (s) {
        if (s.getAttribute("data-shape") === wanted) { target = s; }
      });
      if (!target) { return; }

      var show = function () { clearShapes(); target.classList.add("is-active"); };
      item.addEventListener("mouseenter", show);
      item.addEventListener("mouseleave", clearShapes);

      var link = $("a", item);
      if (link) {
        link.addEventListener("focus", show);
        link.addEventListener("blur", clearShapes);
      }
    });

    function close() {
      clearShapes();
      menu.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "Apri il menu");
      document.body.classList.remove("is-locked");
      if (headerEl) { headerEl.classList.remove("is-over-menu"); }
      document.removeEventListener("keydown", onKeydown);
      // i pannelli escono uno dopo l'altro: si nasconde a uscita finita
      window.setTimeout(function () {
        if (!menu.classList.contains("is-open")) { menu.hidden = true; }
      }, 900);
      if (lastFocused && typeof lastFocused.focus === "function") { lastFocused.focus(); }
    }

    function onKeydown(e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") { return; }
      var items = $$(focusableSel, menu).filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) { return; }
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    burger.addEventListener("click", function () {
      if (menu.classList.contains("is-open")) { close(); } else { open(); }
    });

    $$("a", menu).forEach(function (link) {
      link.addEventListener("click", close);
    });

    // tornando al layout desktop il menu non deve restare aperto
    // (stessa soglia del CSS che lo nasconde)
    var desktop = window.matchMedia("(min-width: 76em)");
    var onChange = function (e) { if (e.matches && menu.classList.contains("is-open")) { close(); } };
    if (typeof desktop.addEventListener === "function") { desktop.addEventListener("change", onChange); }
    else if (typeof desktop.addListener === "function") { desktop.addListener(onChange); }
  })();

  /* ------------------------------------------------- nastro scorrevole */
  // Animazione infinita: quando il nastro esce dalla vista non c'è motivo di
  // tenere sveglio il compositore. Senza IntersectionObserver resta acceso,
  // come prima.
  (function marquee() {
    var el = $(".marquee");
    if (!el) { return; }
    if (!supportsIO) { el.classList.add("is-onscreen"); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { el.classList.toggle("is-onscreen", e.isIntersecting); });
    }, { rootMargin: "150px 0px" }).observe(el);
  })();

  /* ------------------------------------- seconda foto delle schede (hover) */
  // La foto che compare al passaggio del mouse è dichiarata nel CSS come
  // --card-hover-img e non viene scaricata finché quella variabile non entra
  // in una proprietà vera. Qui si aggiunge .has-hover alla prima intenzione —
  // puntatore che entra nella scheda o focus da tastiera — e da lì in poi la
  // classe resta, così anche la dissolvenza in uscita ha la sua immagine.
  // Su telefono e tablet l'evento non arriva mai: zero byte scaricati.
  (function fotoAlPassaggio() {
    var cards = $$(".card");
    if (!cards.length) { return; }
    var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) { return; }

    cards.forEach(function (card) {
      var arma = function () {
        card.classList.add("has-hover");
        card.removeEventListener("pointerenter", arma);
        card.removeEventListener("focusin", arma);
      };
      card.addEventListener("pointerenter", arma);
      card.addEventListener("focusin", arma);
    });
  })();

  /* --------------------------------------------------- rivelazioni scroll */
  (function reveal() {
    var items = $$("[data-reveal]");
    var splits = $$("[data-split]");
    var diagrams = $$("[data-diagram]");

    // ritardo progressivo per i gruppi con [data-stagger]
    $$("[data-stagger]").forEach(function (group) {
      $$("[data-reveal]", group).forEach(function (child, i) {
        if (!child.hasAttribute("data-reveal-delay")) {
          child.style.setProperty("--reveal-delay", (i * 90) + "ms");
        }
      });
    });

    items.forEach(function (el) {
      var d = el.getAttribute("data-reveal-delay");
      if (d) { el.style.setProperty("--reveal-delay", parseInt(d, 10) + "ms"); }
    });

    // titolo "spezzato" in parole, ognuna con la sua animazione
    splits.forEach(function (el) {
      var words = (el.textContent || "").trim().split(/\s+/);
      var frag = document.createDocumentFragment();
      words.forEach(function (word, i) {
        var outer = document.createElement("span");
        outer.className = "word";
        var inner = document.createElement("span");
        inner.textContent = word;
        inner.style.setProperty("--i", String(i));
        outer.appendChild(inner);
        frag.appendChild(outer);
        if (i < words.length - 1) { frag.appendChild(document.createTextNode(" ")); }
      });
      el.textContent = "";
      el.appendChild(frag);
    });

    // linee del diagramma: lunghezza reale del tracciato per l'effetto "disegno"
    diagrams.forEach(function (d) {
      $$(".diagram__lines path", d).forEach(function (path) {
        if (typeof path.getTotalLength !== "function") { return; }
        var len = Math.ceil(path.getTotalLength());
        path.style.setProperty("--len", String(len));
      });
    });

    var all = items.concat(splits).concat(diagrams);
    if (!all.length) { return; }

    if (!supportsIO || prefersReduced()) {
      all.forEach(function (el) { el.classList.add("is-inview"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        entry.target.classList.add("is-inview");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    all.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------------ parallasse */
  (function parallax() {
    var layers = $$("[data-parallax]");
    var heroContent = $("[data-hero-content]");
    var heroHost = $("[data-hero-layers]");
    var heroLayers = heroHost ? $$("[data-hero-layer]", heroHost).map(function (el) {
      return { el: el, shift: parseFloat(el.getAttribute("data-hero-shift")) || 0 };
    }) : [];
    if (!layers.length && !heroContent && !heroLayers.length) { return; }
    if (prefersReduced()) { return; }

    // La parallasse dell'hero vive solo da computer: passando al telefono i
    // piani vanno riportati a zero, altrimenti resterebbero dove si trovavano.
    var heroDesktop = window.matchMedia("(min-width: 62em)");

    function azzeraPiani() {
      heroLayers.forEach(function (l) { l.el.style.transform = ""; });
    }

    var vh = window.innerHeight;
    var onResize = function () { vh = window.innerHeight; };
    window.addEventListener("resize", onResize, { passive: true });

    var onModo = function (e) { if (!e.matches) { azzeraPiani(); } };
    if (typeof heroDesktop.addEventListener === "function") { heroDesktop.addEventListener("change", onModo); }
    else if (typeof heroDesktop.addListener === "function") { heroDesktop.addListener(onModo); }

    onScroll(function (y) {
      layers.forEach(function (layer) {
        var host = layer.parentElement || layer;
        var rect = host.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) { return; }
        var speed = parseFloat(layer.getAttribute("data-parallax")) || 0.15;
        var offset = (rect.top - vh / 2) * -speed;
        layer.style.transform = "translate3d(0," + offset.toFixed(2) + "px,0)";
      });

      // i quattro piani dell'hero: più il piano è lontano, più strada percorre.
      // Lo spostamento è una percentuale dell'altezza dell'hero, così la
      // profondità resta la stessa su ogni schermo.
      // Solo da computer: sul telefono l'effetto costa e rende poco.
      if (heroLayers.length && heroDesktop.matches) {
        var hh = heroHost.offsetHeight || vh;
        var hp = Math.min(Math.max(y / hh, 0), 1);
        heroLayers.forEach(function (l) {
          var px = hp * l.shift * hh / 100;
          l.el.style.transform = "translate3d(0," + px.toFixed(2) + "px,0)";
        });
      }

      // il testo dell'hero sale e sfuma mentre si scorre
      if (heroContent) {
        var p = Math.min(y / (vh * 0.85), 1);
        heroContent.style.transform = "translate3d(0," + (p * -60).toFixed(2) + "px,0)";
        heroContent.style.opacity = String(Math.max(0, 1 - p * 1.25));
      }
    });
  })();

  /* --------------------------------------------------------- torna su */
  (function toTop() {
    var btn = $("#to-top");
    if (!btn) { return; }
    onScroll(function (y) {
      btn.classList.toggle("is-visible", y > window.innerHeight * 0.8);
    });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" });
      var main = $("#main");
      if (main) { main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
    });
  })();

  /* --------------------------------------------------------------- lightbox */
  (function lightbox() {
    var box = $("#lightbox");
    var img = $("#lightbox-img");
    var srcAvif = $("#lightbox-avif");
    var srcWebp = $("#lightbox-webp");
    var caption = $("#lightbox-caption");
    var counter = $("#lightbox-counter");
    if (!box || !img) { return; }

    var triggers = $$("[data-lightbox]");
    if (!triggers.length) { return; }

    // 1×1 trasparente: assegnare src="" farebbe richiedere al browser
    // l'indirizzo della pagina stessa come se fosse un'immagine.
    var VUOTO = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

    var index = 0;
    var lastFocused = null;

    // Il <picture> serve la versione AVIF o WebP quando esiste: sono
    // le stesse foto della pagina, ma un ingrandimento pesa fino a metà
    // del JPEG originale. Senza srcset la sorgente viene semplicemente
    // saltata, quindi chi non ha il formato scarica il JPEG.
    function formato(nodo, valore) {
      if (!nodo) { return; }
      if (valore) { nodo.setAttribute("srcset", valore); }
      else { nodo.removeAttribute("srcset"); }
    }

    function show(i) {
      index = (i + triggers.length) % triggers.length;
      var t = triggers[index];
      formato(srcAvif, t.getAttribute("data-lightbox-avif"));
      formato(srcWebp, t.getAttribute("data-lightbox-webp"));
      img.src = t.getAttribute("data-lightbox") || VUOTO;
      var text = t.getAttribute("data-caption") || "";
      img.alt = text || "Immagine ingrandita";
      if (caption) { caption.textContent = text; }
      if (counter) { counter.textContent = (index + 1) + " / " + triggers.length; }
    }

    function open(i) {
      lastFocused = document.activeElement;
      box.hidden = false;
      void box.offsetWidth;
      show(i);
      box.classList.add("is-open");
      document.body.classList.add("is-locked");
      document.addEventListener("keydown", onKeydown);
      focusWhenVisible($("[data-lightbox-close]", box));
    }

    function close() {
      box.classList.remove("is-open");
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKeydown);
      window.setTimeout(function () {
        if (!box.classList.contains("is-open")) {
          box.hidden = true;
          formato(srcAvif, null);
          formato(srcWebp, null);
          img.src = VUOTO;
        }
      }, 500);
      if (lastFocused && typeof lastFocused.focus === "function") { lastFocused.focus(); }
    }

    function onKeydown(e) {
      if (e.key === "Escape") { close(); }
      else if (e.key === "ArrowRight") { show(index + 1); }
      else if (e.key === "ArrowLeft") { show(index - 1); }
      else if (e.key === "Tab") {
        var items = $$("button", box);
        if (!items.length) { return; }
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    triggers.forEach(function (t, i) {
      t.addEventListener("click", function (e) { e.preventDefault(); open(i); });
    });

    var closeBtn = $("[data-lightbox-close]", box);
    var prevBtn = $("[data-lightbox-prev]", box);
    var nextBtn = $("[data-lightbox-next]", box);
    if (closeBtn) { closeBtn.addEventListener("click", close); }
    if (prevBtn) { prevBtn.addEventListener("click", function () { show(index - 1); }); }
    if (nextBtn) { nextBtn.addEventListener("click", function () { show(index + 1); }); }

    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.classList.contains("lightbox__stage")) { close(); }
    });

    // scorrimento con il dito per passare da un'immagine all'altra
    var touchX = null;
    box.addEventListener("touchstart", function (e) {
      touchX = e.changedTouches[0].clientX;
    }, { passive: true });

    box.addEventListener("touchend", function (e) {
      if (touchX === null) { return; }
      var delta = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(delta) < 45) { return; }
      show(delta < 0 ? index + 1 : index - 1);
    }, { passive: true });
  })();

  /* ---------------------------------------------------- cookie banner
     L'interfaccia è nostra, ma il consenso vero e proprio (autoblocking,
     registrazione, conformità) resta gestito da iubenda tramite le sue
     API pubbliche _iub.cs.api.acceptAll() / rejectAll()
     (https://www.iubenda.com/it/help/1205). Il banner nativo di iubenda è
     nascosto via configurazione e CSS: qui si pilota solo il suo motore. */
  (function cookieBanner() {
    var banner = $("#cookie-banner");
    var acceptBtn = $("#cookie-accept");
    var rejectBtn = $("#cookie-reject");
    if (!banner || !acceptBtn || !rejectBtn) { return; }

    // Solo per decidere subito se mostrare il banner, senza aspettare che
    // iubenda_cs.js (asincrono) sia pronto: evita un lampo del banner a
    // chi ha già scelto in una visita precedente. La fonte di verità del
    // consenso resta comunque iubenda, non questa chiave.
    var seenKey = "ellebi_cookie_seen";

    function hideBanner() {
      banner.classList.remove("is-visible");
      memoriaScrivi(seenKey, "1");
    }

    function showBanner() {
      banner.classList.add("is-visible");
    }

    // iubenda_cs.js è caricato in modo asincrono: se la persona clicca
    // prima che sia pronto, si riprova per un paio di secondi.
    function withIubendaApi(fn, attempt) {
      attempt = attempt || 0;
      if (window._iub && window._iub.cs && window._iub.cs.api) {
        fn(window._iub.cs.api);
        return;
      }
      if (attempt < 40) {
        window.setTimeout(function () { withIubendaApi(fn, attempt + 1); }, 50);
      }
    }

    function choose(accept) {
      hideBanner();
      withIubendaApi(function (api) {
        if (accept) { api.acceptAll(); } else { api.rejectAll(); }
      });
    }

    // Debug: reset-cookies=true nel URL forza il banner a mostrare
    var resetCookies = new URLSearchParams(window.location.search).has("reset-cookies");
    if (resetCookies) { memoriaCancella(seenKey); }

    if (memoriaLeggi(seenKey) !== "1") {
      showBanner();
    }

    acceptBtn.addEventListener("click", function () { choose(true); });
    rejectBtn.addEventListener("click", function () { choose(false); });
  })();

  /* Il consenso cookie (banner, categorie, blocco degli script non essenziali
     finché non c'è una scelta, e la sua conservazione come prova) è gestito
     dalla Cookie Solution di iubenda, caricata nell'<head> di ogni pagina.
     Il pulsante "Preferenze cookie" nel footer usa la classe
     iubenda-cs-preferences-link: iubenda vi aggancia da solo il click. */
})();
