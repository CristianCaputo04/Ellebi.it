#!/usr/bin/env python3
"""Rigenera icone e anteprima social partendo dal logo ufficiale.

Richiede prima `python3 tools/genera-logo.py`, poi il rasterizzatore Node
(`tools/rasterizza.js`) che trasforma l'SVG in PNG con Chromium.

    node tools/rasterizza.js && python3 tools/genera-icone.py
"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(BASE, "public", "assets", "img")
TMP = os.path.join(BASE, ".logo-tmp")

PAPER = (251, 247, 244)


def apri(nome):
    return Image.open(os.path.join(TMP, nome)).convert("RGBA")


def su_fondo(im, size, fondo=PAPER):
    """Appiattisce su fondo opaco: le icone PNG non devono avere trasparenza."""
    out = Image.new("RGB", (size, size), fondo)
    im = im.resize((size, size), Image.LANCZOS)
    out.paste(im, (0, 0), im)
    return out


def icona_maskable(im, size, fondo=(247, 221, 208)):
    """L'icona mascherabile ha bisogno di margine: Android ne ritaglia i bordi."""
    out = Image.new("RGB", (size, size), fondo)
    interno = int(size * 0.68)
    piccola = im.resize((interno, interno), Image.LANCZOS)
    off = (size - interno) // 2
    out.paste(piccola, (off, off), piccola)
    return out


def anteprima_social(logo, larghezza=1200, altezza=630):
    """Foto della borsa + logo, per l'anteprima quando il link viene condiviso."""
    foto = Image.open(os.path.join(IMG, "hero.jpg")).convert("RGB")
    r = max(larghezza / foto.width, altezza / foto.height)
    foto = foto.resize((round(foto.width * r), round(foto.height * r)), Image.LANCZOS)
    sx = (foto.width - larghezza) // 2
    sy = int((foto.height - altezza) * 0.42)
    tela = foto.crop((sx, sy, sx + larghezza, sy + altezza))

    # velo chiaro da sinistra, così il logo resta leggibile sulla foto
    velo = Image.new("RGBA", (larghezza, altezza), (0, 0, 0, 0))
    px = velo.load()
    for x in range(larghezza):
        a = int(238 * max(0.0, 1.0 - (x / larghezza) / 0.72))
        for y in range(altezza):
            px[x, y] = (251, 247, 244, a)
    tela = Image.alpha_composite(tela.convert("RGBA"), velo).convert("RGB")

    lato = 430
    marchio = logo.resize((lato, lato), Image.LANCZOS)
    tela.paste(marchio, (78, (altezza - lato) // 2), marchio)
    return tela


if __name__ == "__main__":
    completo = apri("logo-1024.png")
    marchio = apri("marchio-1024.png")

    su_fondo(completo, 192).save(os.path.join(IMG, "icon-192.png"), optimize=True)
    su_fondo(completo, 512).save(os.path.join(IMG, "icon-512.png"), optimize=True)
    su_fondo(completo, 180).save(os.path.join(IMG, "apple-touch-icon.png"), optimize=True)
    icona_maskable(marchio, 512).save(os.path.join(IMG, "icon-512-maskable.png"), optimize=True)

    anteprima_social(completo).save(os.path.join(IMG, "og-cover.jpg"),
                                    quality=84, optimize=True, progressive=True)
    print("Icone e anteprima social rigenerate.")
