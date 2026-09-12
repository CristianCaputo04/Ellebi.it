#!/usr/bin/env python3
"""Riallinea il ?v=... di CSS e JS al contenuto reale dei file.

Il foglio di stile e lo script sono richiamati con una marca di versione
(`style.css?v=1a364e1ec8`) calcolata dal contenuto del file. Serve a due cose:

  1. appena si pubblica una modifica, l'indirizzo cambia e nessuno resta con
     la versione vecchia in cache;
  2. proprio perché l'indirizzo cambia a ogni modifica, public/_headers può
     dire ai browser di tenersi quei file per un anno senza richiederli mai
     più (`immutable`), il che rende istantanee le visite successive.

Il secondo punto vale però solo se la marca è aggiornata: pubblicare un CSS
modificato lasciando il vecchio ?v= significa lasciare le persone con lo stile
vecchio per un anno. Per questo il controllo gira anche in fase di
pubblicazione (.github/workflows) e blocca il deploy se qualcosa non torna.

    python3 tools/aggiorna-versioni.py            # riscrive le marche
    python3 tools/aggiorna-versioni.py --check    # non scrive, esce con 1 se
                                                  # ce n'è una da aggiornare
"""
import glob
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")

# I file versionati e il modo in cui compaiono nelle pagine statiche.
VERSIONATI = ["assets/css/style.css", "assets/js/main.js"]

# I file usati SOLO dalle pagine generate dal Worker (negozio, carrello,
# pagamento, pannello). Non compaiono in nessun file HTML statico: la loro
# marca la costruisce src/pagine/layout.js leggendola dalla configurazione.
# Senza questo blocco resterebbero in cache un anno anche dopo una modifica,
# perche' public/_headers dichiara "immutable" tutto /assets/css e /assets/js.
GENERATI_CSS = ["assets/css/style.css", "assets/css/negozio.css", "assets/css/admin.css"]
GENERATI_JS = ["assets/js/main.js", "assets/js/negozio.js", "assets/js/admin.js"]

CHECK = "--check" in sys.argv


def marca(percorso_relativo):
    with open(os.path.join(PUB, percorso_relativo), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def main():
    attese = {}
    for rel in VERSIONATI:
        pieno = os.path.join(PUB, rel)
        if not os.path.exists(pieno):
            sys.exit("Manca " + rel)
        attese["/" + rel] = marca(rel)

    da_sistemare = []
    for pagina in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        testo = open(pagina, encoding="utf-8").read()
        nuovo = testo
        for url, atteso in attese.items():
            # cattura l'indirizzo con o senza marca già presente
            rx = re.compile(re.escape(url) + r"(\?v=[0-9a-f]+)?")
            for m in rx.finditer(testo):
                presente = (m.group(1) or "")[3:]
                if presente != atteso:
                    da_sistemare.append(
                        "%s: %s ha ?v=%s, dovrebbe essere %s"
                        % (os.path.basename(pagina), url, presente or "(nessuna)", atteso)
                    )
            nuovo = rx.sub(url + "?v=" + atteso, nuovo)
        if nuovo != testo and not CHECK:
            open(pagina, "w", encoding="utf-8").write(nuovo)

    # Le pagine generate dal Worker non hanno un ?v= scritto nell'HTML: la
    # loro marca vive in wrangler.toml e va riallineata qui, altrimenti un
    # negozio.css modificato resterebbe in cache un anno.
    wrangler_cambiato = aggiorna_wrangler()

    if not da_sistemare:
        if not wrangler_cambiato:
            print("Marche di versione già allineate (%s)." % ", ".join(sorted(attese.values())))
            return
        if CHECK:
            print("\nwrangler.toml non allineato. Esegui:\n"
                  "  python3 tools/aggiorna-versioni.py")
            sys.exit(1)
        print("\nwrangler.toml aggiornato.")
        return

    for riga in da_sistemare:
        print(("da aggiornare  " if CHECK else "aggiornato     ") + riga)

    if CHECK:
        print(
            "\n%d marca/e non allineata/e. Esegui:\n"
            "  python3 tools/aggiorna-versioni.py" % len(da_sistemare)
        )
        sys.exit(1)
    print("\n%d marca/e aggiornata/e." % len(da_sistemare))



def marca_insieme(percorsi):
    """Marca unica di un gruppo di file: cambia se cambia uno qualsiasi.

    Serve per le pagine generate, dove un'unica variabile deve invalidare
    tutti i fogli o tutti gli script insieme. Piu' grossolano di una marca per
    file, ma qui l'alternativa sarebbe passare al layout sei variabili diverse
    per risparmiare un download ogni tanto.
    """
    somma = hashlib.sha256()
    for rel in percorsi:
        pieno = os.path.join(PUB, rel)
        if not os.path.exists(pieno):
            sys.exit("Manca " + rel)
        with open(pieno, "rb") as f:
            somma.update(f.read())
    return somma.hexdigest()[:10]


def aggiorna_wrangler():
    """Riallinea VERSIONE_CSS e VERSIONE_JS in wrangler.toml.

    Restituisce True se qualcosa andava cambiato.
    """
    percorso = os.path.join(BASE, "wrangler.toml")
    testo = open(percorso, encoding="utf-8").read()
    atteso = {"VERSIONE_CSS": marca_insieme(GENERATI_CSS),
              "VERSIONE_JS": marca_insieme(GENERATI_JS)}

    cambiato = False
    for chiave, valore in atteso.items():
        # re.M + ^: la stessa chiave compare due volte, in [vars] e in
        # [env.sviluppo.vars]. Vanno allineate entrambe, altrimenti la prova
        # in locale non rispecchia quello che vedra' un cliente.
        rx = re.compile(r'^(' + chiave + r' = ")([0-9a-f]*)(")', re.M)
        occorrenze = rx.findall(testo)
        if not occorrenze:
            sys.exit("Manca %s in wrangler.toml" % chiave)
        if any(o[1] != valore for o in occorrenze):
            cambiato = True
            print("%-14s %s: %s -> %s" % ("wrangler.toml", chiave,
                  ", ".join(o[1] or "(vuoto)" for o in occorrenze), valore))
            if not CHECK:
                testo = rx.sub(lambda m: m.group(1) + valore + m.group(3), testo)

    if cambiato and not CHECK:
        open(percorso, "w", encoding="utf-8").write(testo)
    return cambiato


if __name__ == "__main__":
    main()
