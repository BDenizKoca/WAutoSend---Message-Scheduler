#!/usr/bin/env python3
from PIL import Image
import os

SIZES = [24, 38]

src = os.path.join('icons', 'icon.png')
out_dir = 'icons'

with Image.open(src) as img:
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    for size in SIZES:
        out = img.resize((size, size), Image.Resampling.LANCZOS)
        out.save(os.path.join(out_dir, f'icon-{size}.png'), 'PNG', optimize=True)
        print(f'Generated icon-{size}.png')
