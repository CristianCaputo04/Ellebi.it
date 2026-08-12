/* Script bloccante minimo: segnala che JavaScript è attivo.
   Serve a mostrare preloader e animazioni solo quando possono essere annullate,
   evitando contenuti invisibili se lo script principale non viene eseguito. */
document.documentElement.classList.add("js");
