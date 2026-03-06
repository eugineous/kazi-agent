#!/usr/bin/env python3
"""
KAZI AGENT — Icon Generator
Draws the Kazi logo directly with Pillow (no Cairo/native libs needed).
Run from the kazi-agent folder:
    python python\create_icon.py

Outputs:
  assets/icon.png      — 256×256  (Electron / tray)
  assets/icon_16.png   — 16×16
  assets/icon_32.png   — 32×32
  assets/icon_512.png  — 512×512  (macOS Retina / installer)
"""

import os, sys, math
from pathlib import Path

# ── paths (works from any working directory) ──────────────────────────────
HERE  = Path(__file__).resolve().parent          # …/kazi-agent/python/
ROOT  = HERE.parent                              # …/kazi-agent/
ASSETS = ROOT / 'assets'

SIZES = {
    'icon.png':    256,
    'icon_16.png':  16,
    'icon_32.png':  32,
    'icon_512.png': 512,
}

def lerp_color(c1, c2, t):
    """Linear interpolate between two RGBA tuples."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))

def rounded_rect_mask(draw, size, radius, color):
    """Draw a filled rounded rectangle into an ImageDraw object."""
    from PIL import ImageDraw
    x0, y0, x1, y1 = 0, 0, size - 1, size - 1
    r = radius
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=color)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=color)
    draw.ellipse([x0, y0, x0 + 2*r, y0 + 2*r], fill=color)
    draw.ellipse([x1 - 2*r, y0, x1, y0 + 2*r], fill=color)
    draw.ellipse([x0, y1 - 2*r, x0 + 2*r, y1], fill=color)
    draw.ellipse([x1 - 2*r, y1 - 2*r, x1, y1], fill=color)

def apply_gradient_bg(img, s, c1=(26,26,46,255), c2=(13,17,23,255)):
    """Fill background with a diagonal gradient."""
    px = img.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            px[x, y] = lerp_color(c1, c2, t)

def cyan_gradient_pixel(x, y, s,
                         c1=(0,229,255,255),
                         c2=(0,119,255,255)):
    t = (x + y) / (2 * s)
    return lerp_color(c1, c2, t)

def draw_poly(draw, points, fill):
    draw.polygon(points, fill=fill)

def draw_rounded_rect(draw, x, y, w, h, r, fill_fn, size):
    """Draw a rounded rect with per-pixel gradient fill via a temp image."""
    from PIL import Image, ImageDraw
    tmp = Image.new('RGBA', (size, size), (0,0,0,0))
    td  = ImageDraw.Draw(tmp)
    rounded_rect_mask(td, size, r, (255,255,255,255))  # white mask, same size hack
    # Reuse draw directly with polygon approximation for simplicity
    # Use many-sided polygon to approximate rounded rect
    pts = []
    corners = [(x+r,y), (x+w-r,y), (x+w,y+r), (x+w,y+h-r),
               (x+w-r,y+h), (x+r,y+h), (x,y+h-r), (x,y+r)]
    steps = 8
    arc_corners = [
        (x+w-r, y,   x+w-r, y+r,    90, 0),    # top-right
        (x+w-r, y+h-r, x+w, y+h,   0, -90),   # bottom-right
        (x,     y+h-r, x+r, y+h,  -90,-180),  # bottom-left
        (x,     y,   x+r,  y+r,  180, 90),    # top-left
    ]
    # Simple approach: draw a plain rect + circles at corners via fill_fn
    # (good enough for icon generation)
    px_data = [fill_fn(ix, iy, size) for iy in range(size) for ix in range(size)]
    return px_data  # not used directly, handled below


def make_icon(size):
    from PIL import Image, ImageDraw

    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s    = size
    r    = int(s * 0.187)   # corner radius ~19% of size

    # ── Background: dark rounded square ─────────────────────────────────
    bg_layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    bg_draw  = ImageDraw.Draw(bg_layer)
    # Draw rounded rect as stacked shapes
    bg_col = (18, 18, 35, 255)   # #121223
    rounded_rect_mask(bg_draw, s, r, bg_col)

    # Apply gradient over it
    bg_px = bg_layer.load()
    c1 = (26, 26, 46, 255)
    c2 = (13, 17, 23, 255)
    for y in range(s):
        for x in range(s):
            if bg_px[x, y][3] > 0:
                t = (x + y) / (2 * s)
                bg_px[x, y] = lerp_color(c1, c2, t)

    img = Image.alpha_composite(img, bg_layer)
    draw = ImageDraw.Draw(img)

    # ── Border glow ──────────────────────────────────────────────────────
    bw = max(1, int(s * 0.006))
    draw.rounded_rectangle([bw, bw, s - bw - 1, s - bw - 1],
                            radius=r - bw,
                            outline=(0, 180, 220, 70),
                            width=bw)

    # ── K geometry (scaled from 512-unit design) ─────────────────────────
    sc = s / 512

    def pt(x, y):  return (int(x * sc), int(y * sc))

    # Cyan gradient helper
    def cyan(x, y):
        t = (x * sc + y * sc) / (2 * s)
        return lerp_color((0, 229, 255, 255), (0, 100, 240, 255), t)

    # Draw each K shape on its own RGBA layer so gradient applies per-pixel
    def draw_shape_layer(points_512):
        layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        ld    = ImageDraw.Draw(layer)
        # Draw flat colour first (will be overwritten by gradient)
        ld.polygon([pt(px, py) for px, py in points_512], fill=(0, 180, 255, 255))
        # Now paint gradient pixels only inside the shape
        lp = layer.load()
        for iy in range(s):
            for ix in range(s):
                if lp[ix, iy][3] > 0:
                    lp[ix, iy] = cyan(ix, iy)
        return layer

    # Left vertical bar: (108,100) w=72 h=312 r=14
    bar_pts = [(108,100),(180,100),(180,412),(108,412)]
    # Rounded corners approximation via slightly inset polygon + ellipses
    bar_layer = Image.new('RGBA', (s, s), (0,0,0,0))
    bd = ImageDraw.Draw(bar_layer)
    # Draw rounded rect for bar
    bd.rounded_rectangle(
        [pt(108,100), pt(180,412)],
        radius=max(1, int(14*sc)),
        fill=(0, 200, 255, 255)
    )
    bp = bar_layer.load()
    for iy in range(s):
        for ix in range(s):
            if bp[ix, iy][3] > 0:
                bp[ix, iy] = cyan(ix, iy)
    img = Image.alpha_composite(img, bar_layer)

    # Upper arm: 180,256 → 180,212 → 402,100 → 402,154
    img = Image.alpha_composite(img, draw_shape_layer([(180,256),(180,212),(402,100),(402,154)]))

    # Lower arm: 180,256 → 180,300 → 402,412 → 402,358
    img = Image.alpha_composite(img, draw_shape_layer([(180,256),(180,300),(402,412),(402,358)]))

    # Lightning bolt (inside K opening): subtle accent
    bolt_pts = [(290,210),(268,276),(284,276),(262,342),(308,268),(290,268),(314,210)]
    bolt_layer = Image.new('RGBA', (s, s), (0,0,0,0))
    boltd = ImageDraw.Draw(bolt_layer)
    boltd.polygon([pt(px,py) for px,py in bolt_pts], fill=(0,229,255,120))
    img = Image.alpha_composite(img, bolt_layer)

    return img


def main():
    try:
        from PIL import Image
    except ImportError:
        print('Pillow not found. Run:  pip install pillow')
        sys.exit(1)

    ASSETS.mkdir(parents=True, exist_ok=True)

    print('Generating Kazi icons...\n')
    for name, size in SIZES.items():
        out_path = ASSETS / name
        icon = make_icon(size)
        icon.save(str(out_path))
        print(f'  ✅  {name}  ({size}×{size})  →  {out_path}')

    print('\n🎉 All icons saved to assets/')
    print('\nTo build the installer:')
    print('  cd kazi-agent')
    print('  npm run build:win')


if __name__ == '__main__':
    main()
