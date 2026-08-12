#!/usr/bin/env python3
"""Riscrive i tag <img> come <picture>, con WebP e misure per il telefono.

I valori di `sizes` non sono stimati: derivano dalla larghezza con cui ogni
foto viene davvero disegnata a 390, 768, 1024 e 1440 px. Sono arrotondati
per eccesso, così il browser non sceglie mai un file troppo piccolo (che
apparirebbe sgranato).

Il JPEG a piena misura resta sempre come ultima risorsa nel tag <img>:
se WebP e varianti mancassero, l'immagine si vede lo stesso.

    python3 tools/genera-webp.py && python3 tools/aggiorna-immagini.py
"""
import glob
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELENCO = os.path.join(BASE, "tools", "varianti-immagini.json")

# larghezza di resa misurata sul sito, per famiglia di immagini
SIZES = [
    (re.compile(r"^(hero|hero-mobile|atelier)"), "100vw"),
    (re.compile(r"^borsa-"), "(min-width: 64em) 30vw, (min-width: 48em) 46vw, 90vw"),
    (re.compile(r"^gallery-"), "(min-width: 48em) 28vw, 40vw"),
    (re.compile(r"^step-"), "(min-width: 64em) 50vw, 95vw"),
]


def sizes_per(nome):
    radice = os.path.splitext(nome)[0]
    for rx, val in SIZES:
        if rx.match(radice):
            return val
    return "100vw"


def srcset(varianti):
    return ", ".join("/assets/img/%s %dw" % (f, w) for f, w in varianti)


def sorgenti(nome, varianti, media=None):
    """Costruisce i tag <source>: prima WebP, poi JPEG multi-misura."""
    attr_media = ' media="%s"' % media if media else ""
    s = sizes_per(nome)
    out = []
    v = varianti.get(nome)
    if not v:
        return out
    if v["webp"]:
        out.append('<source type="image/webp" srcset="%s" sizes="%s"%s>'
                   % (srcset(v["webp"]), s, attr_media))
    if len(v["jpg"]) > 1:
        out.append('<source type="image/jpeg" srcset="%s" sizes="%s"%s>'
                   % (srcset(v["jpg"]), s, attr_media))
    return out


RX_IMG = re.compile(r'<img\b[^>]*?src="/assets/img/([\w.-]+\.jpg)"[^>]*>')


def avvolgi(html, varianti):
    """Racchiude in <picture> ogni <img> che non ci sia già dentro."""
    fatte = 0
    fuori = []
    pos = 0
    risultato = []

    for m in RX_IMG.finditer(html):
        # già dentro un <picture>? si guarda il testo che precede
        prima = html[:m.start()]
        if prima.rfind("<picture") > prima.rfind("</picture>"):
            continue
        fuori.append(m)

    for m in fuori:
        nome = m.group(1)
        src = sorgenti(nome, varianti)
        if not src:
            continue
        indent = ""
        riga_inizio = html.rfind("\n", 0, m.start()) + 1
        indent = html[riga_inizio:m.start()]
        if indent.strip():
            indent = ""
        blocco = ("<picture>\n%s  %s\n%s  %s\n%s</picture>"
                  % (indent, ("\n" + indent + "  ").join(src), indent, m.group(0), indent))
        risultato.append((m.start(), m.end(), blocco))
        fatte += 1

    for inizio, fine, blocco in reversed(risultato):
        html = html[:inizio] + blocco + html[fine:]
    return html, fatte


def aggiorna_hero(html, varianti):
    """L'hero è già un <picture>: si aggiungono solo le sorgenti WebP."""
    if 'type="image/webp"' in html or "hero-mobile.jpg" not in html:
        return html, 0
    vecchio = ('<source media="(max-width: 47.99em)" srcset="/assets/img/hero-mobile.jpg"'
               ' width="1000" height="1400">')
    if vecchio not in html:
        return html, 0
    nuove = []
    nuove += sorgenti("hero-mobile.jpg", varianti, media="(max-width: 47.99em)")
    nuove += sorgenti("hero.jpg", varianti, media="(min-width: 48em)")
    nuove.append(vecchio)
    return html.replace(vecchio, "\n        ".join(nuove)), 1


if __name__ == "__main__":
    varianti = json.load(open(ELENCO, encoding="utf-8"))
    for f in sorted(glob.glob(os.path.join(BASE, "public", "*.html"))):
        html = open(f, encoding="utf-8").read()
        html, n_hero = aggiorna_hero(html, varianti)
        html, n = avvolgi(html, varianti)
        if n or n_hero:
            open(f, "w", encoding="utf-8").write(html)
        print("  %-24s picture: %d   hero: %d" % (os.path.basename(f), n, n_hero))
