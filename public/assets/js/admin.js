/* =========================================================================
   EmmeLù — comodità del pannello di gestione

   Questo file aggiunge SOLO comodità. Il pannello è fatto di <form> veri, e
   senza JavaScript funziona tutto: si cambia stato, si salva il magazzino, si
   anonimizza un ordine. Se un giorno questo file sparisse, la titolare non
   se ne accorgerebbe se non per tre dettagli.

   È una scelta, non un caso: il pannello è lo strumento con cui si spediscono
   i pacchi, e non deve poter smettere di funzionare perché uno script non ha
   caricato.
   ========================================================================= */
(function () {
  "use strict";

  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ------------------------------------------------ conferma distruttiva */

  /* L'anonimizzazione è irreversibile. Nel modulo c'è già una casella
     obbligatoria — quella è la protezione vera, perché resta anche senza
     JavaScript e la verifica il server. Questa finestra è il secondo
     ostacolo, per chi la casella l'ha spuntata senza leggere. */
  $$("[data-conferma]").forEach(function (modulo) {
    modulo.addEventListener("submit", function (evento) {
      var domanda = modulo.getAttribute("data-conferma");
      if (domanda && !window.confirm(domanda)) {
        evento.preventDefault();
      }
    });
  });

  /* ---------------------------------------------------- copia indirizzo */

  /* Il pulsante nasce nascosto nel markup e lo si accende qui: un pulsante
     "Copia" che non copia niente, perché il browser non espone gli appunti,
     è peggio che nessun pulsante. */
  $$("[data-copia]").forEach(function (bottone) {
    var sorgente = document.getElementById(bottone.getAttribute("data-copia"));
    if (!sorgente) { return; }

    var appuntiDisponibili = Boolean(navigator.clipboard && navigator.clipboard.writeText);
    var selezioneDisponibile = Boolean(window.getSelection && document.createRange);
    if (!appuntiDisponibili && !selezioneDisponibile) { return; }

    bottone.hidden = false;
    var testoIniziale = bottone.textContent;

    bottone.addEventListener("click", function () {
      var testo = sorgente.textContent || "";

      function riuscito() {
        bottone.textContent = "Copiato";
        window.setTimeout(function () { bottone.textContent = testoIniziale; }, 2000);
      }

      if (appuntiDisponibili) {
        navigator.clipboard.writeText(testo).then(riuscito, selezionaTutto);
        return;
      }
      selezionaTutto();

      /* Ricaduta per i browser senza API degli appunti, o quando la scrittura
         viene negata: si seleziona il testo, così basta un Ctrl+C. Non è
         automatico, ma è meglio di un pulsante che non fa nulla. */
      function selezionaTutto() {
        try {
          var intervallo = document.createRange();
          intervallo.selectNodeContents(sorgente);
          var selezione = window.getSelection();
          selezione.removeAllRanges();
          selezione.addRange(intervallo);
          bottone.textContent = "Selezionato: premi Ctrl+C";
          window.setTimeout(function () { bottone.textContent = testoIniziale; }, 3000);
        } catch (e) { /* si resta senza copia, e pazienza */ }
      }
    });
  });

  /* ------------------------------------------- campi modificati a video */

  /* Nel magazzino si correggono poche giacenze in mezzo a molte righe: senza
     un segno è facile salvare credendo di aver cambiato una cosa e averne
     cambiate due, o nessuna. Il confronto è con il valore di partenza scritto
     dal server in data-iniziale. */
  var campiGiacenza = $$("input[data-iniziale]");
  if (campiGiacenza.length) {
    var modulo = campiGiacenza[0].form;
    var contatore = null;

    if (modulo) {
      contatore = document.createElement("p");
      contatore.className = "modificati";
      contatore.setAttribute("role", "status");
      contatore.hidden = true;
      modulo.insertBefore(contatore, modulo.firstChild);
    }

    function aggiorna() {
      var quanti = 0;
      campiGiacenza.forEach(function (campo) {
        var cambiato = String(campo.value).trim() !== String(campo.getAttribute("data-iniziale")).trim();
        campo.classList.toggle("campo__valore--modificato", cambiato);
        if (cambiato) { quanti += 1; }
      });
      if (!contatore) { return; }
      contatore.hidden = quanti === 0;
      contatore.textContent = quanti === 1
        ? "1 giacenza modificata, non ancora salvata."
        : quanti + " giacenze modificate, non ancora salvate.";
    }

    campiGiacenza.forEach(function (campo) {
      campo.addEventListener("input", aggiorna);
      campo.addEventListener("change", aggiorna);
    });

    /* Chi chiude la pagina con modifiche non salvate perde il lavoro fatto.
       Il browser mostra la sua finestra standard: non si può personalizzare,
       e va bene così. */
    window.addEventListener("beforeunload", function (evento) {
      var cambiati = campiGiacenza.some(function (campo) {
        return String(campo.value).trim() !== String(campo.getAttribute("data-iniziale")).trim();
      });
      if (!cambiati) { return; }
      evento.preventDefault();
      evento.returnValue = "";
    });

    if (modulo) {
      // Il salvataggio non deve far scattare l'avviso di uscita.
      modulo.addEventListener("submit", function () {
        campiGiacenza.forEach(function (campo) {
          campo.setAttribute("data-iniziale", campo.value);
        });
      });
    }

    aggiorna();
  }
})();
