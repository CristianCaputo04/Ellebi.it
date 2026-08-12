#!/usr/bin/env python3
"""Genera il logo ELLEBI in SVG e le icone PNG dell'app.

Le lettere non sono testo ma contorni veri, estratti dai font già ospitati
sul sito: il file resta identico ovunque, anche dove i font non si caricano
(favicon, icona sul telefono, anteprima social).

    python3 tools/genera-logo.py
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(BASE, "public", "assets", "fonts")
IMG = os.path.join(BASE, "public", "assets", "img")

BLUSH = "#f7ddd0"
INK = "#432a1b"


def glyphs(font_file, text, size, tracking=0.0):
    """Restituisce (path SVG, larghezza) del testo in contorni."""
    font = TTFont(os.path.join(FONTS, font_file))
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / upm
    parts, x = [], 0.0

    for ch in text:
        if ch == " ":
            x += size * 0.32 + tracking
            continue
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit("Carattere assente nel font: %r (%s)" % (ch, font_file))
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        d = pen.getCommands()
        if d:
            parts.append('<path transform="translate(%.3f 0)" d="%s"/>' % (x / scale, d))
        x += gs[name].width * scale + tracking

    inner = "".join(parts)
    return '<g transform="scale(%.6f -%.6f)">%s</g>' % (scale, scale, inner), x


def centered(font_file, text, size, tracking, cx, baseline, fill=INK):
    body, width = glyphs(font_file, text, size, tracking)
    # l'ultimo avanzamento include la spaziatura di coda: si toglie per centrare
    width -= tracking
    return '<g fill="%s" transform="translate(%.2f %.2f)">%s</g>' % (
        fill, cx - width / 2, baseline, body)


def fit_in_circle(font_file, text, cx, baseline, raggio, tracking, size, margine):
    """Rimpicciolisce il testo finché non sta dentro il cerchio, con margine.

    Alla quota `baseline` la larghezza utile del cerchio è la corda
    2·√(r² − d²), dove d è la distanza dal centro: così il motto non tocca
    mai il bordo, a qualunque dimensione venga generato il logo.
    """
    d = abs(baseline - raggio)
    corda = 2 * (max(raggio ** 2 - d ** 2, 1)) ** 0.5
    utile = corda - 2 * margine
    for _ in range(40):
        _, w = glyphs(font_file, text, size, tracking)
        if w - tracking <= utile or size <= 6:
            break
        size *= 0.96
        tracking *= 0.96
    return centered(font_file, text, size, tracking, cx, baseline)


# --- ciliegie: lo stesso disegno già usato sul sito, riscalato ---------------
CILIEGE = """
<g transform="translate({tx} {ty}) scale({s})">
  <g fill="none" stroke="{ink}" stroke-width="3.4" stroke-linecap="round">
    <path d="M60 46 C 55 58, 49 66, 44 73"/>
    <path d="M60 46 C 66 56, 72 63, 77 70"/>
  </g>
  <g fill="{ink}">
    <path d="M60 45 C 43 47, 26 36, 15 13 C 38 13, 55 25, 60 45 Z"/>
    <path d="M60 45 C 77 47, 94 36, 105 13 C 82 13, 65 25, 60 45 Z" opacity=".92"/>
    <circle cx="42" cy="88" r="13.5"/>
    <circle cx="78" cy="85" r="13.5" opacity=".93"/>
  </g>
</g>
"""


def marchio(tx, ty, s):
    return CILIEGE.format(tx=tx, ty=ty, s=s, ink=INK)


def lockup(size=1000, sfondo=True):
    """Logo completo: cerchio, ciliegie, monogramma LB, ELLEBI, motto."""
    k = size / 1000.0
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
           'width="%d" height="%d" role="img" aria-label="ELLEBI">' % (size, size, size, size)]
    if sfondo:
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                   % (size / 2, size / 2, size / 2, BLUSH))

    out.append(marchio(432 * k, 108 * k, 2.3 * k))
    out.append(centered("cormorant-garamond-400-latin.woff2", "LB", 420 * k, -32 * k, 500 * k, 672 * k))
    out.append(centered("cormorant-garamond-400-latin.woff2", "ELLEBI", 92 * k, 24 * k, 500 * k, 762 * k))

    y = 802 * k
    out.append('<g stroke="%s" stroke-width="%.2f" opacity=".7">'
               '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/></g>'
               % (INK, 1.5 * k, 322 * k, y, 678 * k, y))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (500 * k, y, 4.4 * k, INK))

    # il motto deve restare dentro il cerchio: alla sua altezza la corda
    # è larga 2·√(r² − d²), quindi la misura è calcolata, non stimata
    out.append(fit_in_circle("jost-300-latin.woff2", "STILE • ARMONIA • AUTENTICITÀ",
                             500 * k, 856 * k, size * 0.5, 3.0 * k, 30 * k, 46 * k))
    out.append("</svg>")
    return "\n".join(out)


def marchio_solo(size=120):
    """Solo ciliegie e monogramma: per favicon e testata, dove il motto sparirebbe."""
    k = size / 120.0
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">'
        % (size, size, size, size),
        '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (60 * k, 60 * k, 60 * k, BLUSH),
        marchio(41 * k, 12 * k, 0.33 * k),
        centered("cormorant-garamond-400-latin.woff2", "LB", 62 * k, -5 * k, 60 * k, 96 * k),
        "</svg>",
    ])


if __name__ == "__main__":
    with open(os.path.join(BASE, "public", "assets", "img", "logo-ellebi.svg"), "w", encoding="utf-8") as f:
        f.write(lockup())
    with open(os.path.join(BASE, "public", "assets", "img", "logo-badge.svg"), "w", encoding="utf-8") as f:
        f.write(lockup(sfondo=False))
    with open(os.path.join(BASE, "public", "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(marchio_solo())
    print("Creati: logo-ellebi.svg, logo-badge.svg, favicon.svg")
