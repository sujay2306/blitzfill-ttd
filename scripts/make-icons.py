#!/usr/bin/env python3
"""Render the BlitzFill toolbar/app icons.

A rounded square in system blue (subtle top-to-bottom tonal gradient) with a
centred white lightning bolt. Each size is drawn at 8x and downsampled with
LANCZOS. The 16px size uses a heavier bolt and tighter corners so it stays
legible in the toolbar.

Usage: python3 scripts/make-icons.py   (writes icons/icon-{16,32,48,128}.png)
"""
from pathlib import Path

from PIL import Image, ImageDraw

SS = 8
SIZES = (16, 32, 48, 128)
TOP = (0x1A, 0x8C, 0xFF)      # lighter system blue
BOTTOM = (0x00, 0x6A, 0xE6)   # deeper system blue
OUT = Path(__file__).resolve().parent.parent / "icons"

# Bolt in a 0..1 unit box with a slight forward lean.
BOLT = [(0.60, 0.12), (0.28, 0.56), (0.48, 0.56), (0.40, 0.88),
        (0.73, 0.44), (0.53, 0.44)]
# Heavier, simpler bolt for 16px.
BOLT_SMALL = [(0.64, 0.07), (0.21, 0.58), (0.46, 0.58), (0.36, 0.93),
              (0.80, 0.41), (0.55, 0.41)]


def gradient(n):
    col = Image.new("RGB", (1, n))
    px = col.load()
    for y in range(n):
        t = y / max(1, n - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return col.resize((n, n))


def render(size):
    n = size * SS
    small = size <= 16
    inset = 0 if small else round(n * 0.04)
    box = n - 2 * inset
    radius = round(box * (0.18 if small else 0.225))

    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, n - 1 - inset, n - 1 - inset), radius=radius, fill=255)

    icon = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    icon.paste(gradient(n), (0, 0), mask)

    pts = [(inset + x * box, inset + y * box) for x, y in (BOLT_SMALL if small else BOLT)]
    ImageDraw.Draw(icon).polygon(pts, fill=(255, 255, 255, 255))

    return icon.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        path = OUT / f"icon-{s}.png"
        render(s).save(path, optimize=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
