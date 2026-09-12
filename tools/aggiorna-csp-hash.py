#!/usr/bin/env python3
"""Ricalcola gli hash CSP dei blocchi inline e aggiorna _headers.

La Content-Security-Policy del sito non consente script inline generici:
ogni blocco (JSON-LD, ma anche il frammento di configurazione di iubenda)
è autorizzato singolarmente tramite il suo hash SHA-256. Se un blocco
cambia — o se ne aggiunge uno su una nuova pagina — l'hash va rigenerato,
altrimenti il browser lo blocca in silenzio.

Vengono esaminate tutte le pagine, non solo la principale.

    python3 tools/aggiorna-csp-hash.py
"""
import base64
import glob
import hashlib
import os
import re
import sys
from html.parser import HTMLParser

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
HEADERS = os.path.join(PUB, "_headers")


class RaccoglitoreScript(HTMLParser):
    """Estrae il contenuto di ogni <script> privo di attributo src.

    Qui prima c'era un'espressione regolare, e sbagliava in un modo che non
    si vedeva: nel <head> di ogni pagina c'è un commento che CITA il tag
    («...quando incontra il tag <script>.»). L'espressione regolare non
    distingue un commento dal documento, quindi partiva da quella citazione e
    catturava tutto fino al primo </script> vero — inghiottendo i preconnect
    e il frammento di configurazione di iubenda. Risultato: veniva pubblicato
    l'hash di quel blocco inventato, e la configurazione di iubenda —
    l'unica cosa che accende il banner del consenso — restava bloccata dalla
    CSP su ogni pagina del sito.

    Un analizzatore vero i commenti li riconosce, e non può ricascarci.
    """

    def __init__(self):
        # convert_charrefs=False: il contenuto deve arrivare byte per byte
        # come sta nel file, o l'hash non corrisponde a quello che il
        # browser calcola.
        super().__init__(convert_charrefs=False)
        self.dentro = False
        self.pezzi = []
        self.blocchi = []

    def handle_starttag(self, tag, attributi):
        if tag == "script":
            # Gli script con src (main.js, quelli esterni di iubenda) sono già
            # coperti da 'self' o dal dominio esplicito: niente hash.
            self.dentro = not any(nome == "src" for nome, _ in attributi)
            self.pezzi = []

    def handle_data(self, dati):
        if self.dentro:
            self.pezzi.append(dati)

    def handle_entityref(self, nome):
        if self.dentro:
            self.pezzi.append("&%s;" % nome)

    def handle_charref(self, nome):
        if self.dentro:
            self.pezzi.append("&#%s;" % nome)

    def handle_endtag(self, tag):
        if tag == "script" and self.dentro:
            self.blocchi.append("".join(self.pezzi))
            self.dentro = False


def hash_di(contenuto):
    digest = hashlib.sha256(contenuto.encode("utf-8")).digest()
    return "'sha256-%s'" % base64.b64encode(digest).decode()


def raccogli():
    trovati = []
    for pagina in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        lettore = RaccoglitoreScript()
        lettore.feed(open(pagina, encoding="utf-8").read())
        for blocco in lettore.blocchi:
            h = hash_di(blocco)
            if h not in trovati:
                trovati.append(h)
            print("  %-22s %s" % (os.path.basename(pagina), h))
    return trovati


def main():
    hash_list = raccogli()
    if not hash_list:
        sys.exit("Nessun blocco JSON-LD trovato in " + PUB)

    headers = open(HEADERS, encoding="utf-8").read()
    riga = re.search(r"^(\s*Content-Security-Policy:.*)$", headers, re.M)
    if not riga:
        sys.exit("Riga Content-Security-Policy non trovata in _headers")

    vecchia = riga.group(1)
    if "script-src" not in vecchia:
        sys.exit("Direttiva script-src assente nella CSP")

    # si sostituisce l'intero elenco di hash dentro script-src
    senza_hash = re.sub(r"'sha256-[A-Za-z0-9+/=]+'\s*", "", vecchia)
    nuova = re.sub(r"(script-src 'self')", r"\1 " + " ".join(hash_list), senza_hash)
    nuova = re.sub(r"\s+;", ";", nuova)

    if nuova == vecchia:
        print("\nCSP già aggiornata (%d hash)." % len(hash_list))
        return

    open(HEADERS, "w", encoding="utf-8").write(headers.replace(vecchia, nuova))
    print("\n_headers aggiornato con %d hash." % len(hash_list))


if __name__ == "__main__":
    main()
