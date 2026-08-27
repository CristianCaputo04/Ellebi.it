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

  function onScrollFrame(handler) {
    var ticking = false;
    function update() { ticking = false; handler(); }
    return function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    };
  }

  /* ------------------------------------------------------------ preloader */
  (function preloader() {
    var node = $(".preloader");
    if (!node) { return; }
    function hide() { document.body.classList.add("is-loaded"); }
    if (document.readyState === "complete") { hide(); }
    else { window.addEventListener("load", hide, { once: true }); }
    // rete lenta o risorsa bloccata: il sito resta comunque utilizzabile
    window.setTimeout(hide, 3500);
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

    var update = onScrollFrame(function () {
      var y = window.scrollY;
      el.classList.toggle("is-stuck", y > 40);
      // nasconde l'header scendendo, lo riporta salendo (mai a menu aperto)
      if (!menuOpen()) {
        el.classList.toggle("is-hidden", y > last && y > 260);
      }
      last = y;
    });

    window.addEventListener("scroll", update, { passive: true });
    update();
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
    var desktop = window.matchMedia("(min-width: 62em)");
    var onChange = function (e) { if (e.matches && menu.classList.contains("is-open")) { close(); } };
    if (typeof desktop.addEventListener === "function") { desktop.addEventListener("change", onChange); }
    else if (typeof desktop.addListener === "function") { desktop.addListener(onChange); }
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

    var update = onScrollFrame(function () {
      var y = window.scrollY;

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

    window.addEventListener("scroll", update, { passive: true });
    update();
  })();

  /* --------------------------------------------------------- torna su */
  (function toTop() {
    var btn = $("#to-top");
    if (!btn) { return; }
    var update = onScrollFrame(function () {
      btn.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.8);
    });
    window.addEventListener("scroll", update, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" });
      var main = $("#main");
      if (main) { main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
    });
    update();
  })();

  /* --------------------------------------------------------------- lightbox */
  (function lightbox() {
    var box = $("#lightbox");
    var img = $("#lightbox-img");
    var caption = $("#lightbox-caption");
    var counter = $("#lightbox-counter");
    if (!box || !img) { return; }

    var triggers = $$("[data-lightbox]");
    if (!triggers.length) { return; }

    var index = 0;
    var lastFocused = null;

    function show(i) {
      index = (i + triggers.length) % triggers.length;
      var t = triggers[index];
      img.src = t.getAttribute("data-lightbox") || "";
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
        if (!box.classList.contains("is-open")) { box.hidden = true; img.src = ""; }
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
      localStorage.setItem(seenKey, "1");
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
    if (resetCookies) { localStorage.removeItem(seenKey); }

    if (localStorage.getItem(seenKey) !== "1") {
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
