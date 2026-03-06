#!/usr/bin/env python3
"""
KAZI AGENT — Icon Generator
Generates icon.png (256x256) from the SVG logo using Pillow.
Run once: python python/create_icon.py

Outputs:
  assets/icon.png      — 256×256  (Electron default / Linux)
  assets/icon_16.png   — 16×16    (tray)
  assets/icon_32.png   — 32×32
  assets/icon_512.png  — 512×512  (macOS Retina)
"""

import os
import sys

ROOT   = os.path.join(os.path.dirname(__file__), '..')
SVG    = os.path.join(ROOT, 'assets', 'logo.svg')
OUT    = os.path.join(ROOT, 'assets')

SIZES  = {
    'icon.png':    256,
    'icon_16.png':  16,
    'icon_32.png':  32,
    'icon_512.png': 512,
}

def main():
    try:
        import cairosvg
        from PIL import Image
        from io import BytesIO

        if not os.path.exists(SVG):
            print(f'SVG not found: {SVG}')
            sys.exit(1)

        for name, size in SIZES.items():
            png_bytes = cairosvg.svg2png(url=SVG, output_width=size, output_height=size)
            img = Image.open(BytesIO(png_bytes)).convert('RGBA')
            out_path = os.path.join(OUT, name)
            img.save(out_path)
            print(f'Created {name} ({size}×{size})')

        print('\n✅ All icons generated in assets/')

    except ImportError as e:
        print(f'Missing package: {e}')
        print('Run:  pip install cairosvg pillow')
        sys.exit(1)

if __name__ == '__main__':
    main()
