#!/usr/bin/env python3
"""Pixelate a pet spritesheet: downscale + quantize + upscale for retro pixel-art look."""

from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image

CELL_W = 192
CELL_H = 208
COLS = 8
ROWS = 9

# Per-row used columns (from animator.ts PET_ANIMATIONS)
ROW_FRAMES: dict[int, list[int]] = {
    0: [0, 1, 2, 3, 4, 5],
    1: [0, 1, 2, 3, 4, 5, 6, 7],
    2: [0, 1, 2, 3, 4, 5, 6, 7],
    3: [0, 1, 2, 3],
    4: [0, 1, 2, 3, 4],
    5: [0, 1, 2, 3, 4, 5, 6, 7],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5],
    8: [0, 1, 2, 3, 4, 5],
}


def pixelate_frame(
    frame: Image.Image,
    pixel_scale: int,
    colors: int,
) -> Image.Image:
    """Downscale, quantize palette, upscale with nearest-neighbor."""
    frame = frame.convert("RGBA")
    r, g, b, a = frame.split()
    rgb = Image.merge("RGB", (r, g, b))

    small_w = max(1, CELL_W // pixel_scale)
    small_h = max(1, CELL_H // pixel_scale)

    small_rgb = rgb.resize((small_w, small_h), Image.Resampling.LANCZOS)
    small_a = a.resize((small_w, small_h), Image.Resampling.LANCZOS)

    quantized = small_rgb.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    small_rgb_q = quantized.convert("RGB")

    pixelated_rgb = small_rgb_q.resize((CELL_W, CELL_H), Image.Resampling.NEAREST)
    pixelated_a = small_a.resize((CELL_W, CELL_H), Image.Resampling.NEAREST)

    return Image.merge("RGBA", (*pixelated_rgb.split(), pixelated_a))


def pixelate_sheet(
    src: Path,
    dst: Path,
    pixel_scale: int = 4,
    colors: int = 32,
) -> None:
    src_img = Image.open(src)
    atlas_w = COLS * CELL_W  # 1536
    atlas_h = ROWS * CELL_H  # 1872
    out = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    for row, cols in ROW_FRAMES.items():
        for col in cols:
            x = col * CELL_W
            y = row * CELL_H
            frame = src_img.crop((x, y, x + CELL_W, y + CELL_H))
            pixelated = pixelate_frame(frame, pixel_scale, colors)
            out.alpha_composite(pixelated, (x, y))

    # Save as lossless WebP to preserve exact pixel colors
    out.save(dst, lossless=True)
    print(f"Pixelated spritesheet saved to {dst}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("--pixel-scale", type=int, default=4)
    parser.add_argument("--colors", type=int, default=32)
    args = parser.parse_args()
    pixelate_sheet(args.src, args.dst, args.pixel_scale, args.colors)


if __name__ == "__main__":
    main()
