#!/usr/bin/env python3
"""Rigenera sitemap.xml dalle pagine davvero pubblicate.

La sitemap è l'elenco che Google usa per sapere cosa esiste sul sito. Se una
pagina non c'è, viene trovata più tardi o non viene trovata affatto: è quello
che era successo a /termini, pubblicata ma assente dall'elenco per settimane.

Tenerla scritta a mano significa doversene ricordare ogni volta. Qui invece
l'elenco si ricava dai file: ogni pagina HTML che non è "noindex" entra nella
sitemap, e l'indirizzo si legge dal suo stesso <link rel="canonical">, così
non possono divergere.

Le foto delle borse arrivano dai dati strutturati della home: sono già
descritte lì, con nome e descrizione, e ripeterle qui a mano vorrebbe dire
tenerne allineate due copie. L'estensione "image" della sitemap è ciò che le
porta su Google Immagini, che per un sito che vive di fotografie non è un
dettaglio.

    python3 tools/aggiorna-sitemap.py            # riscrive la sitemap
    python3 tools/aggiorna-sitemap.py --check    # non scrive, esce con 1 se
                                                 # manca una pagina
"""
import datetime
import glob
import json
import os
import re
import sys
from xml.sax.saxutils import escape

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(BASE, "public")
SITEMAP = os.path.join(PUB, "sitemap.xml")
CHECK = "--check" in sys.argv

# Quanto spesso cambia una pagina e quanto conta rispetto alle altre. La home
# è il sito; le pagine legali si aggiornano quando cambia una norma.
PESI = {"/": ("monthly", "1.0")}
PESO_LEGALE = ("yearly", "0.3")

# Foto che raccontano il lavoro ma non sono prodotti, quindi non compaiono
# nei dati strutturati come Product.
EXTRA = [("atelier.jpg", "La lavorazione a mano EmmeLù",
          "Le mani al lavoro sul filato, un punto alla volta: cucito a mano in Italia.")]


def pagine():
    """Le pagine indicizzabili, con indirizzo preso dal loro canonical."""
    trovate = []
    for percorso in sorted(glob.glob(os.path.join(PUB, "*.html"))):
        testo = open(percorso, encoding="utf-8").read()

        robots = re.search(r'<meta name="robots" content="([^"]*)"', testo)
        if robots and "noindex" in robots.group(1):
            continue

        canonical = re.search(r'<link rel="canonical" href="([^"]+)"', testo)
        if not canonical:
            sys.exit("Manca il canonical in " + os.path.basename(percorso))

        trovate.append((canonical.group(1), testo))
    return trovate


def immagini(testo):
    """Le foto della pagina, lette dai suoi dati strutturati."""
    blocco = re.search(r'<script type="application/ld\+json">\s*(.*?)\s*</script>',
                       testo, re.DOTALL)
    if not blocco:
        return []
    dati = json.loads(blocco.group(1))
    fuori = []
    for nodo in dati.get("@graph", []):
        if nodo.get("@type") != "Product":
            continue
        for src in nodo.get("image", []):
            fuori.append((src, nodo["name"], nodo.get("description", "")))
    for nome, titolo, didascalia in EXTRA:
        fuori.append(("https://ellebi.it/assets/img/" + nome, titolo, didascalia))
    return fuori


def costruisci():
    oggi = datetime.date.today().isoformat()
    righe = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<!-- Generata da tools/aggiorna-sitemap.py: non modificare a mano. -->',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
             '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']

    for url, testo in sorted(pagine(), key=lambda p: (p[0] != "https://ellebi.it/", p[0])):
        percorso = url.replace("https://ellebi.it", "") or "/"
        freq, pri = PESI.get(percorso, PESO_LEGALE)
        righe += [f"  <url>", f"    <loc>{escape(url)}</loc>",
                  f"    <lastmod>{oggi}</lastmod>",
                  f"    <changefreq>{freq}</changefreq>",
                  f"    <priority>{pri}</priority>"]
        for src, titolo, didascalia in immagini(testo):
            righe.append("    <image:image>")
            righe.append(f"      <image:loc>{escape(src)}</image:loc>")
            righe.append(f"      <image:title>{escape(titolo)}</image:title>")
            if didascalia:
                righe.append(f"      <image:caption>{escape(didascalia)}</image:caption>")
            righe.append("    </image:image>")
        righe.append("  </url>")

    righe.append("</urlset>")
    return "\n".join(righe) + "\n"


def main():
    nuova = costruisci()
    attesi = {u for u, _ in pagine()}

    presenti = set()
    if os.path.exists(SITEMAP):
        presenti = set(re.findall(r"<loc>([^<]+)</loc>", open(SITEMAP, encoding="utf-8").read()))

    mancanti = attesi - presenti
    avanzate = presenti - attesi

    if CHECK:
        # Le date cambiano a ogni rigenerazione: qui interessa solo che nella
        # sitemap ci siano tutte le pagine pubblicate, e nient'altro.
        if not mancanti and not avanzate:
            print("Sitemap completa (%d pagine)." % len(attesi))
            return
        for u in sorted(mancanti):
            print("manca nella sitemap   " + u)
        for u in sorted(avanzate):
            print("non esiste più        " + u)
        sys.exit("\nEsegui:\n  python3 tools/aggiorna-sitemap.py")

    open(SITEMAP, "w", encoding="utf-8").write(nuova)
    print("Sitemap rigenerata: %d pagine." % len(attesi))
    for u in sorted(mancanti):
        print("  aggiunta " + u)
    for u in sorted(avanzate):
        print("  tolta    " + u)


if __name__ == "__main__":
    main()
