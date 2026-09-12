/* =========================================================================
   EmmeLù — parte d'acquisto del sito
   Vanilla, nessuna dipendenza, stesso stile difensivo di main.js: ogni
   modulo esce subito se gli elementi che gli servono non ci sono, così lo
   stesso file può stare su tutte le pagine senza fare danni su nessuna.

   REGOLA CHE NON SI VIOLA: questo file non calcola mai un totale da mostrare
   come definitivo. Il carrello nel browser sa solo COSA vuoi e QUANTO ne
   vuoi; quanto costa lo dice il server, ogni volta, con /api/preventivo.
   Un prezzo calcolato qui sarebbe un prezzo che il checkout può smentire —
   e, peggio, un prezzo che chi apre gli strumenti del browser può cambiare.
   ========================================================================= */
(function () {
  "use strict";

  var COOKIE = "emmelu_carrello";
  var GIORNI_CARRELLO = 30;

  /* ------------------------------------------------------------- utilità */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function euro(centesimi) {
    var n = Number(centesimi) || 0;
    return (n / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }

  /* ------------------------------------------------------------- cookie */

  /* Il carrello sta in un cookie e non in localStorage per un motivo
     preciso: il server deve poterlo leggere per disegnare l'indicatore
     nell'header già nella prima risposta. Con localStorage il numero
     comparirebbe solo dopo il caricamento del JavaScript, con uno scatto
     visibile a ogni pagina. */
  function leggiCarrello() {
    var pezzi = document.cookie ? document.cookie.split(";") : [];
    for (var i = 0; i < pezzi.length; i++) {
      var riga = pezzi[i].trim();
      if (riga.indexOf(COOKIE + "=") !== 0) { continue; }
      try {
        var dati = JSON.parse(decodeURIComponent(riga.slice(COOKIE.length + 1)));
        return Array.isArray(dati) ? dati.filter(rigaValida) : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function rigaValida(r) {
    return r && typeof r.sku === "string" && r.sku.length > 0 && Number(r.quantita) > 0;
  }

  function scriviCarrello(righe) {
    var pulite = righe.filter(rigaValida).slice(0, 50).map(function (r) {
      return {
        sku: String(r.sku).slice(0, 40),
        quantita: Math.min(99, Math.max(1, Math.floor(Number(r.quantita)) || 1)),
        personalizzazione: String(r.personalizzazione || "").slice(0, 280),
      };
    });

    var scadenza = new Date(Date.now() + GIORNI_CARRELLO * 86400000).toUTCString();
    /* SameSite=Lax e non Strict: chi arriva da un link su Instagram deve
       ritrovare il proprio carrello. Non è un cookie di autenticazione,
       quindi Lax non apre alcuna porta. */
    document.cookie = COOKIE + "=" + encodeURIComponent(JSON.stringify(pulite)) +
      "; Path=/; Expires=" + scadenza + "; SameSite=Lax; Secure";
    aggiornaIndicatore(pulite);
    return pulite;
  }

  function svuotaCarrello() {
    document.cookie = COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax; Secure";
    aggiornaIndicatore([]);
  }

  function contaArticoli(righe) {
    return righe.reduce(function (somma, r) { return somma + (Number(r.quantita) || 0); }, 0);
  }

  /* ------------------------------------------------- indicatore in testa */

  function aggiornaIndicatore(righe) {
    /* I nomi degli attributi sono quelli che scrive src/pagine/layout.js:
       data-carrello-indicatore sul collegamento, data-carrello-numero sul
       contatore. In modalita' vetrina l'indicatore non viene stampato
       affatto, quindi qui non c'e' nulla da aggiornare. */
    var collegamento = $("[data-carrello-indicatore]");
    var nodo = $("[data-carrello-numero]");
    if (!nodo || !collegamento) { return; }

    var n = contaArticoli(righe);
    nodo.textContent = n > 0 ? String(n) : "";
    nodo.hidden = n === 0;

    /* L'etichetta parlata va riscritta insieme al numero: un lettore di
       schermo annuncia quella, non la cifra accanto all'icona. */
    collegamento.setAttribute(
      "aria-label",
      n === 0 ? "Carrello, vuoto" : n === 1 ? "Carrello, 1 articolo" : "Carrello, " + n + " articoli"
    );
  }

  /* ------------------------------------------------------ chiamate API */

  function chiedi(percorso, corpo) {
    return fetch(percorso, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then(function (risposta) {
      return risposta.json().then(function (dati) {
        return { ok: risposta.ok, stato: risposta.status, dati: dati };
      }).catch(function () {
        return { ok: false, stato: risposta.status, dati: { errore: "risposta_illeggibile" } };
      });
    }).catch(function () {
      return { ok: false, stato: 0, dati: { errore: "rete", messaggio: "Connessione assente. Riprova." } };
    });
  }

  function preventivo(righe, metodo) {
    return chiedi("/api/preventivo", { righe: righe, metodo: metodo || "paypal" });
  }

  /* ------------------------------------------ aggiunta dalla scheda prodotto */

  (function aggiuntaAlCarrello() {
    var modulo = $("[data-aggiungi-carrello]");
    if (!modulo) { return; }

    var campoSku = $("[data-sku]", modulo);
    var campoQuantita = $("[data-quantita]", modulo);
    var campoPersonalizzazione = $("[data-personalizzazione]", modulo);
    var esito = $("[data-esito]", modulo);

    modulo.addEventListener("submit", function (evento) {
      evento.preventDefault();
      if (!campoSku) { return; }

      var sku = campoSku.value;
      var quantita = Math.max(1, Math.floor(Number(campoQuantita && campoQuantita.value) || 1));
      var personalizzazione = campoPersonalizzazione ? campoPersonalizzazione.value.trim() : "";

      if (!sku) {
        mostraEsito(esito, "Scegli prima una variante.", true);
        return;
      }

      var righe = leggiCarrello();

      /* Due pezzi identici con personalizzazioni diverse sono due righe
         distinte: unirle significherebbe cucire due volte la stessa dedica.
         Stesso SKU e stessa personalizzazione, invece, si sommano. */
      var esistente = null;
      for (var i = 0; i < righe.length; i++) {
        if (righe[i].sku === sku && String(righe[i].personalizzazione || "") === personalizzazione) {
          esistente = righe[i];
          break;
        }
      }

      if (esistente) { esistente.quantita = Number(esistente.quantita) + quantita; }
      else { righe.push({ sku: sku, quantita: quantita, personalizzazione: personalizzazione }); }

      scriviCarrello(righe);

      var nome = modulo.getAttribute("data-nome") || "Il pezzo";
      mostraEsitoAggiunta(esito, nome);

      /* Il pannello si apre e mostra cosa e' successo. La riga di testo qui
         sopra resta comunque: e' quella che legge un lettore di schermo, ed
         e' l'unica cosa che rimane se il pannello non c'e' (vetrina spenta).
         Pannello e' definito piu' in basso nel file, ma questa funzione gira
         solo al submit, quando la dichiarazione e' gia' stata valutata. */
      if (typeof Pannello !== "undefined" && Pannello.attivo) { Pannello.apri(); }
    });
  })();

  /* Messaggio di sola prosa: sempre testo, mai marcatura. */
  function mostraEsito(nodo, messaggio, errore) {
    if (!nodo) { return; }
    nodo.textContent = messaggio;
    nodo.classList.toggle("prodotto__esito--errore", Boolean(errore));
  }

  /**
   * Conferma dell'aggiunta al carrello, con il collegamento al carrello.
   *
   * Il nodo si costruisce pezzo per pezzo invece di comporre una stringa di
   * marcatura, perche' il nome del prodotto arriva da un attributo data- e
   * quindi dal database: passato a innerHTML sarebbe un'iniezione, dato che
   * leggere un attributo restituisce il valore DECODIFICATO e l'escape fatto
   * dal server sparisce esattamente qui. Il collegamento e' un elemento vero,
   * creato qui, e il nome entra solo come testo.
   */
  function mostraEsitoAggiunta(nodo, nome) {
    if (!nodo) { return; }
    nodo.textContent = "";
    nodo.classList.remove("prodotto__esito--errore");

    nodo.appendChild(document.createTextNode(nome + " è nel carrello. "));
    var collegamento = document.createElement("a");
    collegamento.className = "link-line";
    collegamento.href = "/carrello";
    collegamento.textContent = "Vai al carrello";
    nodo.appendChild(collegamento);
  }

  /* ------------------------------------------------- pagina del carrello */

  (function paginaCarrello() {
    var contenitore = $("[data-carrello-contenuto]");
    if (!contenitore) { return; }

    var modelloRiga = $("#modello-riga-carrello");
    var modelloRiepilogo = $("#modello-riepilogo-carrello");
    var modelloVuoto = $("#modello-carrello-vuoto");

    function disegna() {
      var righe = leggiCarrello();

      if (righe.length === 0) {
        contenitore.textContent = "";
        if (modelloVuoto) { contenitore.appendChild(modelloVuoto.content.cloneNode(true)); }
        contenitore.setAttribute("aria-busy", "false");
        return;
      }

      contenitore.setAttribute("aria-busy", "true");

      preventivo(righe).then(function (risposta) {
        contenitore.setAttribute("aria-busy", "false");
        contenitore.textContent = "";

        if (!risposta.ok && risposta.stato !== 200) {
          var avviso = document.createElement("p");
          avviso.className = "carrello__avviso";
          avviso.setAttribute("role", "alert");
          avviso.textContent = (risposta.dati && risposta.dati.messaggio) ||
            "Non riesco a recuperare i prezzi in questo momento. Riprova fra poco.";
          contenitore.appendChild(avviso);
          return;
        }

        var conto = risposta.dati;
        var lista = document.createElement("ul");
        lista.className = "carrello__righe";
        lista.setAttribute("role", "list");

        (conto.righe || []).forEach(function (riga, indice) {
          lista.appendChild(costruisciRiga(riga, indice, righe, disegna));
        });
        contenitore.appendChild(lista);

        if (modelloRiepilogo) {
          var riepilogo = modelloRiepilogo.content.cloneNode(true);
          riempiRiepilogo(riepilogo, conto);
          contenitore.appendChild(riepilogo);
        }
      });
    }

    function costruisciRiga(riga, indice, righeCarrello, ridisegna) {
      var nodo = modelloRiga.content.cloneNode(true);
      var elemento = nodo.querySelector(".carrello__riga");

      var link = nodo.querySelector("[data-link]");
      if (link) {
        link.textContent = riga.nome_prodotto || riga.sku;
        link.href = riga.slug_prodotto ? "/prodotto/" + encodeURIComponent(riga.slug_prodotto) : "/negozio";
      }

      var variante = nodo.querySelector("[data-variante]");
      if (variante && riga.nome_variante && riga.nome_variante !== "Unica") {
        variante.textContent = riga.nome_variante;
        variante.hidden = false;
      }

      var personalizzazione = nodo.querySelector("[data-personalizzazione]");
      if (personalizzazione && riga.personalizzazione) {
        /* textContent e non innerHTML: questo testo l'ha scritto una persona
           in un campo libero, ed è esattamente il posto da cui si tenta
           un'iniezione. */
        personalizzazione.textContent = "Personalizzazione: " + riga.personalizzazione;
        personalizzazione.hidden = false;
      }

      var avvertenza = nodo.querySelector("[data-avvertenza]");
      if (avvertenza && riga.personalizzato && riga.personalizzazione) { avvertenza.hidden = false; }

      var esaurito = nodo.querySelector("[data-esaurito]");
      if (esaurito && riga.disponibile === false) {
        esaurito.textContent = riga.giacenza > 0
          ? "Ne restano solo " + riga.giacenza + ": riduci la quantità."
          : "Questo pezzo è appena stato venduto.";
        esaurito.hidden = false;
        if (elemento) { elemento.classList.add("carrello__riga--problema"); }
      }

      var prezzo = nodo.querySelector("[data-prezzo]");
      if (prezzo) { prezzo.textContent = euro(riga.totale_cent); }

      var campo = nodo.querySelector("[data-quantita]");
      var etichetta = nodo.querySelector("[data-etichetta-quantita]");
      if (campo) {
        var idCampo = "quantita-" + indice;
        campo.id = idCampo;
        campo.value = String(riga.quantita);
        if (etichetta) {
          etichetta.setAttribute("for", idCampo);
          etichetta.textContent = "Quantità di " + (riga.nome_prodotto || riga.sku);
        }
        campo.addEventListener("change", function () {
          cambiaQuantita(righeCarrello, riga, Math.max(1, Math.floor(Number(campo.value) || 1)));
          ridisegna();
        });
      }

      var meno = nodo.querySelector("[data-meno]");
      if (meno) {
        meno.addEventListener("click", function () {
          cambiaQuantita(righeCarrello, riga, Number(riga.quantita) - 1);
          ridisegna();
        });
      }
      var piu = nodo.querySelector("[data-piu]");
      if (piu) {
        piu.addEventListener("click", function () {
          cambiaQuantita(righeCarrello, riga, Number(riga.quantita) + 1);
          ridisegna();
        });
      }

      var togli = nodo.querySelector("[data-togli]");
      if (togli) {
        togli.setAttribute("aria-label", "Togli " + (riga.nome_prodotto || riga.sku) + " dal carrello");
        togli.addEventListener("click", function () {
          cambiaQuantita(righeCarrello, riga, 0);
          ridisegna();
        });
      }

      return nodo;
    }

    function cambiaQuantita(righe, riga, nuova) {
      var risultato = [];
      righe.forEach(function (r) {
        var stessa = r.sku === riga.sku &&
          String(r.personalizzazione || "") === String(riga.personalizzazione || "");
        if (!stessa) { risultato.push(r); return; }
        if (nuova > 0) { risultato.push({ sku: r.sku, quantita: nuova, personalizzazione: r.personalizzazione }); }
      });
      scriviCarrello(risultato);
    }

    function riempiRiepilogo(nodo, conto) {
      testo(nodo, "[data-subtotale]", euro(conto.subtotale_cent));
      testo(nodo, "[data-spedizione]", conto.spedizione_cent === 0 ? "offerta" : euro(conto.spedizione_cent));
      testo(nodo, "[data-totale]", euro(conto.totale_cent));
      testo(nodo, "[data-iva]", "Di cui IVA " + (conto.aliquota_iva || 22) + "%: " + euro(conto.iva_cent) + ".");

      var soglia = nodo.querySelector("[data-soglia]");
      if (soglia && conto.manca_a_gratis_cent > 0) {
        soglia.textContent = "Ti mancano " + euro(conto.manca_a_gratis_cent) + " alla spedizione gratuita.";
        soglia.hidden = false;
      }

      /* Se qualcosa non è più disponibile, il pulsante di pagamento si
         disattiva qui e non solo al checkout: mandare avanti un ordine che il
         server rifiuterà comunque fa solo perdere tempo a chi compra. */
      var vai = nodo.querySelector("[data-vai]");
      if (vai && conto.valido === false) {
        vai.setAttribute("aria-disabled", "true");
        vai.classList.add("btn--spento");
        vai.removeAttribute("href");
        vai.textContent = "Sistema il carrello per continuare";
      }
    }

    function testo(radice, selettore, valore) {
      var nodo = radice.querySelector(selettore);
      if (nodo) { nodo.textContent = valore; }
    }

    disegna();
  })();

  /* ------------------------------------------------- pagina di pagamento */

  (function paginaCheckout() {
    var modulo = $("#modulo-ordine");
    if (!modulo) { return; }

    var contenitoreRiepilogo = $("[data-riepilogo]");
    var erroreGenerale = $("[data-errore-generale]");
    var contenitorePaypal = $("[data-paypal]");
    var bottoneContrassegno = $("[data-invia-contrassegno]");
    var bloccoContrassegno = $("[data-contrassegno-bloccato]");
    var etichettaContrassegno = $("[data-contrassegno]");

    var ultimoConto = null;

    function metodoScelto() {
      var scelto = modulo.querySelector("[data-metodo]:checked");
      return scelto ? scelto.value : "paypal";
    }

    function aggiornaRiepilogo() {
      var righe = leggiCarrello();
      if (righe.length === 0) {
        window.location.href = "/carrello";
        return Promise.resolve();
      }

      if (contenitoreRiepilogo) { contenitoreRiepilogo.setAttribute("aria-busy", "true"); }

      return preventivo(righe, metodoScelto()).then(function (risposta) {
        ultimoConto = risposta.dati;
        if (contenitoreRiepilogo) {
          contenitoreRiepilogo.setAttribute("aria-busy", "false");
          disegnaRiepilogo(contenitoreRiepilogo, risposta.dati);
        }
        aggiornaDisponibilitaContrassegno(risposta.dati);
        aggiornaBottoni();
      });
    }

    function disegnaRiepilogo(nodo, conto) {
      nodo.textContent = "";
      var lista = document.createElement("ul");
      lista.className = "checkout__righe";
      lista.setAttribute("role", "list");

      (conto.righe || []).forEach(function (riga) {
        var voce = document.createElement("li");
        var nome = document.createElement("span");
        nome.textContent = (riga.nome_prodotto || riga.sku) + " ×" + riga.quantita;
        var importo = document.createElement("span");
        importo.textContent = euro(riga.totale_cent);
        voce.appendChild(nome);
        voce.appendChild(importo);
        if (riga.personalizzazione) {
          var nota = document.createElement("small");
          nota.textContent = riga.personalizzazione;
          voce.appendChild(nota);
        }
        lista.appendChild(voce);
      });
      nodo.appendChild(lista);

      nodo.appendChild(rigaConto("Subtotale", euro(conto.subtotale_cent)));
      nodo.appendChild(rigaConto("Spedizione", conto.spedizione_cent === 0 ? "offerta" : euro(conto.spedizione_cent)));
      if (conto.supplemento_cent > 0) {
        nodo.appendChild(rigaConto("Supplemento contrassegno", euro(conto.supplemento_cent)));
      }
      nodo.appendChild(rigaConto("Totale", euro(conto.totale_cent), true));

      var iva = document.createElement("p");
      iva.className = "checkout__iva";
      iva.textContent = "Di cui IVA " + (conto.aliquota_iva || 22) + "%: " + euro(conto.iva_cent) + ".";
      nodo.appendChild(iva);
    }

    function rigaConto(etichetta, valore, forte) {
      var riga = document.createElement("p");
      riga.className = "checkout__conto" + (forte ? " checkout__conto--totale" : "");
      var sinistra = document.createElement("span");
      sinistra.textContent = etichetta;
      var destra = document.createElement("span");
      destra.textContent = valore;
      riga.appendChild(sinistra);
      riga.appendChild(destra);
      return riga;
    }

    function aggiornaDisponibilitaContrassegno(conto) {
      if (!etichettaContrassegno) { return; }
      var radio = etichettaContrassegno.querySelector("input");
      var oltre = (conto.problemi || []).some(function (p) { return p.motivo === "contrassegno_oltre_limite"; });

      if (oltre) {
        if (radio) { radio.disabled = true; radio.checked = false; }
        etichettaContrassegno.classList.add("pagamento--spento");
        if (bloccoContrassegno) { bloccoContrassegno.hidden = false; }
        var paypalRadio = modulo.querySelector('[data-metodo][value="paypal"]');
        if (paypalRadio && !paypalRadio.disabled) { paypalRadio.checked = true; }
      } else if (radio) {
        radio.disabled = false;
        etichettaContrassegno.classList.remove("pagamento--spento");
        if (bloccoContrassegno) { bloccoContrassegno.hidden = true; }
      }
    }

    function aggiornaBottoni() {
      var contrassegno = metodoScelto() === "contrassegno";
      if (contenitorePaypal) { contenitorePaypal.hidden = contrassegno || !contenitorePaypal.getAttribute("data-paypal-client-id"); }
      if (bottoneContrassegno) { bottoneContrassegno.hidden = !contrassegno; }
    }

    $$("[data-metodo]").forEach(function (radio) {
      radio.addEventListener("change", aggiornaRiepilogo);
    });

    /* ---------- raccolta e validazione dei dati ---------- */

    function datiCliente() {
      var dati = {};
      ["nome", "cognome", "email", "telefono", "via", "civico", "cap", "citta", "provincia", "note"]
        .forEach(function (campo) {
          var nodo = modulo.querySelector('[name="' + campo + '"]');
          dati[campo] = nodo ? String(nodo.value || "").trim() : "";
        });
      return dati;
    }

    function pulisciErrori() {
      $$("[data-errore-per]", modulo).forEach(function (nodo) {
        nodo.textContent = "";
        nodo.hidden = true;
      });
      $$("[aria-invalid]", modulo).forEach(function (nodo) { nodo.removeAttribute("aria-invalid"); });
      if (erroreGenerale) { erroreGenerale.hidden = true; erroreGenerale.textContent = ""; }
    }

    function mostraErrori(campi, messaggio) {
      var primo = null;
      Object.keys(campi || {}).forEach(function (campo) {
        var nodo = modulo.querySelector('[data-errore-per="' + campo + '"]');
        var controllo = modulo.querySelector('[name="' + campo + '"]');
        if (nodo) { nodo.textContent = campi[campo]; nodo.hidden = false; }
        if (controllo) {
          controllo.setAttribute("aria-invalid", "true");
          if (!primo) { primo = controllo; }
        }
      });
      if (messaggio && erroreGenerale) {
        erroreGenerale.textContent = messaggio;
        erroreGenerale.hidden = false;
        if (!primo) { erroreGenerale.focus && erroreGenerale.focus(); }
      }
      /* Il fuoco va sul primo campo sbagliato: senza, chi naviga da tastiera
         o con un lettore di schermo non ha modo di sapere dove guardare. */
      if (primo) { primo.focus(); }
    }

    /* Un errore che resta acceso sotto un campo ormai corretto e' peggio di
       nessun errore: la pagina sembra rotta anche quando e' tutto a posto, e
       chi la guarda non capisce piu' quali campi gli restano da sistemare.
       Appena si tocca un campo, la sua segnalazione sparisce; la verifica
       vera rifara' comunque il giro al prossimo invio. */
    function pulisciErroreDi(campo) {
      const nodo = modulo.querySelector('[data-errore-per="' + campo + '"]');
      const controllo = modulo.querySelector('[name="' + campo + '"]');
      if (nodo) { nodo.textContent = ""; nodo.hidden = true; }
      if (controllo) { controllo.removeAttribute("aria-invalid"); }
    }

    $$("[name]", modulo).forEach(function (controllo) {
      const campo = controllo.getAttribute("name");
      if (!campo) { return; }
      /* "input" copre la digitazione, "change" i menu a tendina e le caselle:
         insieme coprono tutti i modi in cui un campo puo' cambiare valore. */
      controllo.addEventListener("input", function () { pulisciErroreDi(campo); });
      controllo.addEventListener("change", function () { pulisciErroreDi(campo); });
    });

    function validaInLocale() {
      var dati = datiCliente();
      var campi = {};
      if (dati.nome.length < 2) { campi.nome = "Serve il nome."; }
      if (dati.cognome.length < 2) { campi.cognome = "Serve il cognome."; }
      if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(dati.email)) { campi.email = "L'indirizzo e-mail non sembra valido."; }
      if (dati.telefono.replace(/\D/g, "").length < 8) { campi.telefono = "Serve un telefono raggiungibile."; }
      if (dati.via.length < 3) { campi.via = "Serve l'indirizzo."; }
      if (dati.civico.length < 1) { campi.civico = "Serve il numero civico."; }
      if (!/^\d{5}$/.test(dati.cap)) { campi.cap = "Il CAP è di cinque cifre."; }
      if (dati.citta.length < 2) { campi.citta = "Serve la città."; }
      if (!dati.provincia) { campi.provincia = "Scegli la provincia."; }

      var consenso = modulo.querySelector('[name="consenso_privacy"]');
      if (!consenso || !consenso.checked) {
        campi.consenso_privacy = "Serve la presa visione per procedere.";
      }
      return { dati: dati, campi: campi, valido: Object.keys(campi).length === 0 };
    }

    /**
     * Crea l'ordine sul server. La validazione fatta qui sopra è solo una
     * cortesia per non far fare un giro inutile: quella che conta è del
     * server, e infatti se il server rifiuta si mostrano i SUOI errori.
     */
    function creaOrdine() {
      pulisciErrori();
      var controllo = validaInLocale();
      if (!controllo.valido) {
        mostraErrori(controllo.campi, "Controlla i campi segnalati.");
        return Promise.resolve(null);
      }

      return chiedi("/api/ordine", {
        righe: leggiCarrello(),
        cliente: controllo.dati,
        metodo: metodoScelto(),
        consenso_privacy: true,
      }).then(function (risposta) {
        if (risposta.ok) { return risposta.dati; }

        if (risposta.dati && risposta.dati.campi) {
          mostraErrori(risposta.dati.campi, risposta.dati.messaggio);
        } else if (erroreGenerale) {
          erroreGenerale.textContent = (risposta.dati && risposta.dati.messaggio) ||
            "Non è stato possibile registrare l'ordine.";
          erroreGenerale.hidden = false;
        }
        /* Se qualcosa è stato venduto nel frattempo, il riepilogo va
           riaggiornato: il cliente deve vedere cosa è cambiato. */
        if (risposta.dati && risposta.dati.errore === "non_disponibile") { aggiornaRiepilogo(); }
        return null;
      });
    }

    /* ---------- contrassegno ---------- */

    modulo.addEventListener("submit", function (evento) {
      evento.preventDefault();
      if (metodoScelto() !== "contrassegno") { return; }

      if (bottoneContrassegno) { bottoneContrassegno.disabled = true; }
      creaOrdine().then(function (ordine) {
        if (!ordine) {
          if (bottoneContrassegno) { bottoneContrassegno.disabled = false; }
          return;
        }
        svuotaCarrello();
        window.location.href = "/ordine/" + encodeURIComponent(ordine.numero) +
          "?token=" + encodeURIComponent(ordine.token);
      });
    });

    /* ---------- PayPal ---------- */

    /* L'SDK si carica qui, e solo qui: è uno script di terze parti che vede
       l'indirizzo IP di chi apre la pagina, e non c'è ragione di farlo
       caricare a chi sta solo guardando le foto. */
    function caricaPaypal() {
      if (!contenitorePaypal) { return; }
      var clientId = contenitorePaypal.getAttribute("data-paypal-client-id");
      if (!clientId) { return; }

      var copione = document.createElement("script");
      copione.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) +
        "&currency=EUR&locale=it_IT&components=buttons&intent=capture";
      copione.onload = montaBottoniPaypal;
      copione.onerror = function () {
        if (erroreGenerale) {
          erroreGenerale.textContent = "Non riesco a caricare PayPal. Prova con il contrassegno, oppure scrivimi.";
          erroreGenerale.hidden = false;
        }
      };
      document.head.appendChild(copione);
    }

    function montaBottoniPaypal() {
      if (!window.paypal || !contenitorePaypal) { return; }

      var ordineCorrente = null;

      window.paypal.Buttons({
        style: { layout: "vertical", shape: "pill", label: "pay" },

        /* L'ordine nostro nasce PRIMA di quello PayPal: così la giacenza è
           già impegnata quando il cliente arriva alla finestra di pagamento,
           e nessun altro può portargli via il pezzo mentre digita la carta. */
        createOrder: function () {
          return creaOrdine().then(function (ordine) {
            if (!ordine) { return Promise.reject(new Error("ordine_non_creato")); }
            ordineCorrente = ordine;
            return chiedi("/api/paypal/crea", { numero: ordine.numero, token: ordine.token })
              .then(function (risposta) {
                if (!risposta.ok || !risposta.dati || !risposta.dati.id) {
                  return Promise.reject(new Error("paypal_non_creato"));
                }
                return risposta.dati.id;
              });
          });
        },

        /* L'incasso lo conferma il SERVER chiamando PayPal, non questo
           codice: quello che succede nel browser non è una prova di
           pagamento e non deve mai esserlo. */
        onApprove: function (dati) {
          return chiedi("/api/paypal/cattura", {
            numero: ordineCorrente.numero,
            token: ordineCorrente.token,
            paypal_order_id: dati.orderID,
          }).then(function (risposta) {
            if (!risposta.ok) {
              if (erroreGenerale) {
                erroreGenerale.textContent = (risposta.dati && risposta.dati.messaggio) ||
                  "Il pagamento non è andato a buon fine.";
                erroreGenerale.hidden = false;
              }
              return;
            }
            svuotaCarrello();
            window.location.href = "/ordine/" + encodeURIComponent(ordineCorrente.numero) +
              "?token=" + encodeURIComponent(ordineCorrente.token);
          });
        },

        onError: function () {
          if (erroreGenerale) {
            erroreGenerale.textContent = "PayPal ha segnalato un problema. Riprova, oppure scegli il contrassegno.";
            erroreGenerale.hidden = false;
          }
        },
      }).render("#paypal-bottoni");
    }

    aggiornaRiepilogo().then(caricaPaypal);
  })();

  /* ================================================================
     Carrello a scomparsa

     Quello che rende un sito un negozio: aggiungi, e il carrello si apre di
     lato a dirti cosa hai fatto. Prima al suo posto c'era una riga di testo
     sotto il pulsante, che nessuno guardava.

     Il pannello non calcola NIENTE. Chiede a /api/preventivo e disegna quel
     che torna: se i conti li facesse qui, basterebbero gli strumenti del
     browser per cambiarli, e il checkout li smentirebbe comunque.
     ================================================================ */

  var Pannello = (function () {
    var radice = $("#pannello-carrello");
    if (!radice) { return { apri: function () {}, attivo: false }; }

    var righeNodo = $("[data-pannello-righe]", radice);
    var piede = $("[data-pannello-piede]", radice);
    var subtotaleNodo = $("[data-pannello-subtotale]", radice);
    var spedizione = $("[data-spedizione-gratis]", radice);
    var spedizioneTesto = $("[data-spedizione-testo]", radice);
    var spedizioneBarra = $("[data-spedizione-barra]", radice);
    var ultimoAperto = null;
    var richiestaInCorso = 0;

    /* --------------------------------------------------- apri e chiudi */

    function apri() {
      if (!radice.hidden) { disegna(); return; }
      ultimoAperto = document.activeElement;
      radice.hidden = false;
      radice.removeAttribute("inert");
      /* La classe arriva un fotogramma dopo, altrimenti il browser non ha
         nulla da cui animare e il pannello compare di scatto. */
      requestAnimationFrame(function () { radice.classList.add("is-aperto"); });
      document.documentElement.classList.add("ha-pannello");
      var chiudi = $(".pannello__chiudi", radice);
      if (chiudi) { chiudi.focus(); }
      disegna();
    }

    function chiudi() {
      if (radice.hidden) { return; }
      radice.classList.remove("is-aperto");
      document.documentElement.classList.remove("ha-pannello");
      /* `inert` subito: il pannello sta ancora sfumando via, ma non deve piu'
         essere raggiungibile col tabulatore da sotto. */
      radice.setAttribute("inert", "");
      window.setTimeout(function () {
        if (!radice.classList.contains("is-aperto")) { radice.hidden = true; }
      }, 260);
      if (ultimoAperto && document.contains(ultimoAperto)) { ultimoAperto.focus(); }
      ultimoAperto = null;
    }

    $$("[data-pannello-chiudi]", radice).forEach(function (nodo) {
      nodo.addEventListener("click", chiudi);
    });

    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && !radice.hidden) { chiudi(); }
    });

    /* Il fuoco resta dentro finche' il pannello e' aperto: un pannello
       modale da cui si esce col tabulatore e' un pannello che confonde chi
       naviga da tastiera. */
    radice.addEventListener("keydown", function (evento) {
      if (evento.key !== "Tab" || radice.hidden) { return; }
      var fuocabili = $$(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        radice
      ).filter(function (n) { return n.offsetParent !== null; });
      if (!fuocabili.length) { return; }
      var primo = fuocabili[0];
      var ultimo = fuocabili[fuocabili.length - 1];
      if (evento.shiftKey && document.activeElement === primo) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primo.focus();
      }
    });

    /* ------------------------------------------------------- disegno */

    function disegna() {
      var righe = leggiCarrello();
      righeNodo.setAttribute("aria-busy", "true");

      if (!righe.length) {
        righeNodo.textContent = "";
        righeNodo.appendChild(vuoto());
        righeNodo.setAttribute("aria-busy", "false");
        piede.hidden = true;
        if (spedizione) { spedizione.hidden = true; }
        return;
      }

      var mio = ++richiestaInCorso;
      preventivo(righe).then(function (esito) {
        /* Due clic rapidi lanciano due richieste: se torna prima la vecchia,
           disegnerebbe uno stato superato. Vince sempre l'ultima partita. */
        if (mio !== richiestaInCorso) { return; }
        righeNodo.setAttribute("aria-busy", "false");

        if (!esito.ok || !esito.dati || !Array.isArray(esito.dati.righe)) {
          righeNodo.textContent = "";
          var errore = document.createElement("p");
          errore.className = "pannello__errore";
          errore.textContent = "Non riesco a leggere il carrello. Ricarica la pagina, oppure aprilo per intero.";
          righeNodo.appendChild(errore);
          piede.hidden = true;
          return;
        }

        disegnaRighe(esito.dati.righe);
        subtotaleNodo.textContent = euro(esito.dati.subtotale_cent);
        piede.hidden = false;
        disegnaSpedizione(esito.dati);
      });
    }

    function vuoto() {
      var p = document.createElement("p");
      p.className = "pannello__vuoto";
      p.appendChild(document.createTextNode("Il carrello è vuoto. "));
      var a = document.createElement("a");
      a.className = "link-line";
      a.href = "/negozio";
      a.textContent = "Guarda i pezzi disponibili";
      p.appendChild(a);
      return p;
    }

    /* Tutto costruito con createElement e textContent: nomi e
       personalizzazioni arrivano dal database, e comporre marcatura con
       quelli sarebbe un'iniezione. In questo file innerHTML non compare. */
    function disegnaRighe(righe) {
      righeNodo.textContent = "";
      var lista = document.createElement("ul");
      lista.className = "pannello__righe";
      lista.setAttribute("role", "list");

      righe.forEach(function (r) {
        var li = document.createElement("li");
        li.className = "pannello__riga" + (r.disponibile === false ? " is-esaurito" : "");

        var testi = document.createElement("div");
        testi.className = "pannello__riga-testi";

        var nome = document.createElement("p");
        nome.className = "pannello__riga-nome";
        nome.textContent = r.nome_prodotto || "Pezzo";
        testi.appendChild(nome);

        if (r.nome_variante && r.nome_variante !== "Unica") {
          var variante = document.createElement("p");
          variante.className = "pannello__riga-variante";
          variante.textContent = r.nome_variante;
          testi.appendChild(variante);
        }

        if (r.personalizzazione) {
          var pers = document.createElement("p");
          pers.className = "pannello__riga-pers";
          pers.textContent = "Personalizzato: " + r.personalizzazione;
          testi.appendChild(pers);
        }

        if (r.disponibile === false) {
          var ko = document.createElement("p");
          ko.className = "pannello__riga-ko";
          ko.textContent = "Non più disponibile: toglilo per proseguire.";
          testi.appendChild(ko);
        }

        var conti = document.createElement("div");
        conti.className = "pannello__riga-conti";

        var prezzo = document.createElement("p");
        prezzo.className = "pannello__riga-prezzo numerico";
        prezzo.textContent = euro(r.totale_cent);
        conti.appendChild(prezzo);

        conti.appendChild(passoQuantita(r));

        var togli = document.createElement("button");
        togli.type = "button";
        togli.className = "pannello__togli";
        togli.textContent = "Togli";
        togli.setAttribute("aria-label", "Togli " + (r.nome_prodotto || "questo pezzo") + " dal carrello");
        togli.addEventListener("click", function () { cambia(r, 0); });
        conti.appendChild(togli);

        li.appendChild(testi);
        li.appendChild(conti);
        lista.appendChild(li);
      });

      righeNodo.appendChild(lista);
    }

    function passoQuantita(r) {
      var gruppo = document.createElement("div");
      gruppo.className = "pannello__quantita";

      var meno = document.createElement("button");
      meno.type = "button";
      meno.textContent = "−";
      meno.setAttribute("aria-label", "Uno in meno");
      meno.addEventListener("click", function () { cambia(r, Number(r.quantita) - 1); });

      var valore = document.createElement("span");
      valore.className = "pannello__quantita-num";
      valore.textContent = String(r.quantita);

      var piu = document.createElement("button");
      piu.type = "button";
      piu.textContent = "+";
      piu.setAttribute("aria-label", "Uno in più");
      /* Oltre la giacenza il pulsante si spegne: proporre un secondo pezzo
         unico che non esiste porta dritti a un errore al checkout. */
      var tetto = Number(r.giacenza);
      if (Number.isFinite(tetto) && Number(r.quantita) >= tetto) { piu.disabled = true; }
      piu.addEventListener("click", function () { cambia(r, Number(r.quantita) + 1); });

      gruppo.appendChild(meno);
      gruppo.appendChild(valore);
      gruppo.appendChild(piu);
      return gruppo;
    }

    function cambia(riga, nuovaQuantita) {
      var righe = leggiCarrello();
      var pers = String(riga.personalizzazione || "");
      var restanti = [];
      righe.forEach(function (r) {
        if (r.sku === riga.sku && String(r.personalizzazione || "") === pers) {
          if (nuovaQuantita > 0) {
            r.quantita = nuovaQuantita;
            restanti.push(r);
          }
          return;
        }
        restanti.push(r);
      });
      scriviCarrello(restanti);
      disegna();
    }

    /* --------------------------------- quanto manca alla spedizione gratis */

    function disegnaSpedizione(dati) {
      if (!spedizione) { return; }
      var soglia = Number(spedizione.getAttribute("data-soglia")) || 0;
      if (soglia <= 0) { spedizione.hidden = true; return; }

      /* Le due cifre le manda il server dentro il preventivo: qui non si
         sottrae niente, si disegna soltanto. */
      var manca = Number(dati.manca_a_gratis_cent);
      if (!Number.isFinite(manca)) { spedizione.hidden = true; return; }

      spedizione.hidden = false;
      if (manca <= 0) {
        spedizioneTesto.textContent = "Spedizione gratuita inclusa.";
        spedizione.classList.add("is-raggiunta");
        spedizioneBarra.style.width = "100%";
        return;
      }

      spedizione.classList.remove("is-raggiunta");
      spedizioneTesto.textContent = "Ti mancano " + euro(manca) + " alla spedizione gratuita.";
      var fatto = Math.max(0, Math.min(100, ((soglia - manca) / soglia) * 100));
      spedizioneBarra.style.width = fatto.toFixed(1) + "%";
    }

    /* L'indicatore in testa apre il pannello invece di cambiare pagina. Resta
       un collegamento vero: senza JavaScript porta a /carrello. */
    var indicatore = $("[data-carrello-indicatore]");
    if (indicatore) {
      indicatore.addEventListener("click", function (evento) {
        /* Ctrl/cmd-clic e rotellina devono continuare ad aprire in una scheda
           nuova: chi lo fa si aspetta quello, non un pannello. */
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) { return; }
        evento.preventDefault();
        apri();
      });
    }

    return { apri: apri, attivo: true };
  })();

  /* ------------------------------- barra d'acquisto fissa su telefono */

  /* Il pulsante della barra non aggiunge niente da solo: invia il modulo che
     sta sopra. Cosi' variante, quantita' e personalizzazione sono sempre
     quelle scelte davvero. Un secondo modulo con i propri campi si sarebbe
     disallineato al primo cambio di variante, e avrebbe messo in carrello il
     pezzo sbagliato senza che nessuno se ne accorgesse. */
  (function barraAcquisto() {
    var barra = $("[data-barra-acquisto]");
    var modulo = $("[data-aggiungi-carrello]");
    var bottone = barra ? $("[data-barra-aggiungi]", barra) : null;
    if (!barra || !modulo || !bottone) { return; }

    bottone.addEventListener("click", function () {
      if (typeof modulo.requestSubmit === "function") { modulo.requestSubmit(); }
      else { modulo.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
    });

    /* La barra compare solo quando il pulsante vero e' uscito dallo schermo:
       tenerla sempre visibile coprirebbe il contenuto anche quando non
       serve, e sovrapporrebbe due pulsanti identici a mezzo centimetro di
       distanza. */
    var vero = $(".prodotto__aggiungi", modulo);
    if (!vero || !("IntersectionObserver" in window)) { return; }

    new IntersectionObserver(function (voci) {
      voci.forEach(function (v) { barra.hidden = v.isIntersecting; });
    }, { rootMargin: "0px 0px -20% 0px" }).observe(vero);
  })();

  /* -------------------------------------- aggiunta rapida dalla griglia */

  /* Un pezzo unico ha una variante sola: chiedere di aprire la scheda per
     scoprirlo e' un passaggio in piu' fra chi guarda e chi compra. I pezzi
     con piu' varianti, o personalizzabili, restano un collegamento alla
     scheda: li' c'e' una scelta da fare, e saltarla farebbe arrivare in
     carrello il pezzo sbagliato. */
  $$("[data-aggiungi-rapido]").forEach(function (bottone) {
    /* Il server lo stampa nascosto: se questo file non gira, il pulsante non
       compare affatto invece di comparire e non fare niente. */
    bottone.hidden = false;
    bottone.addEventListener("click", function () {
      var sku = bottone.getAttribute("data-sku");
      if (!sku) { return; }

      var righe = leggiCarrello();
      var trovata = null;
      for (var i = 0; i < righe.length; i++) {
        if (righe[i].sku === sku && !righe[i].personalizzazione) { trovata = righe[i]; break; }
      }
      if (trovata) { trovata.quantita = Number(trovata.quantita) + 1; }
      else { righe.push({ sku: sku, quantita: 1, personalizzazione: "" }); }

      scriviCarrello(righe);
      if (Pannello.attivo) { Pannello.apri(); }
    });
  });

  /* All'apertura di qualunque pagina l'indicatore va allineato al cookie:
     una pagina servita dalla cache del browser potrebbe mostrarne uno vecchio. */
  aggiornaIndicatore(leggiCarrello());
})();
