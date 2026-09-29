"""Generate the brand assets: favicon, touch icon and the social card.

The mark is a drawn bow with the arrow aimed at a flash - Eklavya the archer, and
the intercept the scheduler is built to make. Geometry matches BrandMark in
web/src/app/layout.tsx, so the site header and the favicon are the same drawing.

Usage:
    python -m scripts.make_brand
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"
APP = ROOT / "web" / "src" / "app"

INK = (28, 25, 20)        # --text-primary
CREAM = (251, 247, 240)   # --page
ACCENT = (44, 70, 208)    # --accent, Eklavya's series colour on every chart
MUTED = (150, 142, 128)

SANS = "C:/Windows/Fonts/segoeui.ttf"
SANS_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
SANS_SEMI = "C:/Windows/Fonts/seguisb.ttf"


def quad(p0, p1, p2, steps=64):
    """Points along a quadratic bezier, for the bow limb."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


def mark(size: int, tile: bool = True) -> Image.Image:
    """The brand mark at any size. Drawn at 8x and downsampled for clean edges."""
    S = size * 8
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 32.0  # the SVG viewBox is 0 0 32 32

    if tile:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(9.5 * u), fill=INK)

    w_bow = max(2, int(2.1 * u))
    w_str = max(1, int(1.3 * u))
    w_arr = max(2, int(2.1 * u))

    # Bow limb, string, arrow shaft, then the flash it is aimed at.
    d.line(quad((11 * u, 5.5 * u), (24 * u, 16 * u), (11 * u, 26.5 * u)),
           fill=CREAM, width=w_bow, joint="curve")
    d.line([(11 * u, 5.5 * u), (11 * u, 26.5 * u)], fill=CREAM + (140,), width=w_str)
    d.line([(5.5 * u, 16 * u), (21 * u, 16 * u)], fill=CREAM, width=w_arr)
    r = 3.0 * u
    d.ellipse([25 * u - r, 16 * u - r, 25 * u + r, 16 * u + r], fill=ACCENT)

    return img.resize((size, size), Image.LANCZOS)


def social_card() -> Image.Image:
    """1200x630 card for link previews (WhatsApp, Slack, X, LinkedIn)."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)

    # Faint sweep arcs behind the type: the spectrum being scanned.
    for i, x in enumerate(range(-200, W + 200, 78)):
        d.line([(x, 0), (x + 150, H)], fill=(38, 34, 28), width=2)

    logo = mark(132, tile=True)
    img.paste(logo, (84, 74), logo)

    title = ImageFont.truetype(SANS_BOLD, 92)
    lede = ImageFont.truetype(SANS, 38)
    small = ImageFont.truetype(SANS_SEMI, 27)

    d.text((84, 250), "Eklavya", font=title, fill=CREAM)
    d.text((84, 366), "A receiver that learns when and where to listen.", font=lede, fill=(214, 206, 192))

    # The headline result, which is the reason to click.
    y = 470
    d.rounded_rectangle([84, y, 452, y + 74], radius=14, fill=(36, 48, 112))
    d.text((108, y + 22), "69.8% of flashes caught", font=small, fill=(196, 208, 255))
    d.text((476, y + 22), "vs 16.8% for a fixed sweep", font=small, fill=(150, 142, 128))

    d.line([(84, 596), (1116, 596)], fill=(58, 52, 44), width=2)
    return img


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)

    ico = APP / "favicon.ico"
    mark(256).save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"  {ico.relative_to(ROOT)}  ({ico.stat().st_size / 1024:.0f} KB, 6 sizes)")

    for name, size in (("icon.png", 512), ("apple-touch-icon.png", 180)):
        p = PUBLIC / name
        mark(size).save(p)
        print(f"  {p.relative_to(ROOT)}  ({p.stat().st_size / 1024:.0f} KB)")

    og = PUBLIC / "og.png"
    social_card().save(og, optimize=True)
    print(f"  {og.relative_to(ROOT)}  ({og.stat().st_size / 1024:.0f} KB, 1200x630)")


if __name__ == "__main__":
    main()
