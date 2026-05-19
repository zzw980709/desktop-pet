#!/usr/bin/env python3
"""Convert pet spritesheet to true pixel art with dark outlines and limited palette."""

from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageFilter

CELL_W = 192
CELL_H = 208
COLS = 8
ROWS = 9

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
    color_levels: int,
    outline_darken: float,
) -> Image.Image:
    """Convert one sprite frame to pixel art with dark outline."""
    frame = frame.convert("RGBA")
    r, g, b, a = frame.split()

    small_w = max(1, CELL_W // pixel_scale)
    small_h = max(1, CELL_H // pixel_scale)

    # Downscale everything
    small_r = r.resize((small_w, small_h), Image.Resampling.LANCZOS)
    small_g = g.resize((small_w, small_h), Image.Resampling.LANCZOS)
    small_b = b.resize((small_w, small_h), Image.Resampling.LANCZOS)
    small_a = a.resize((small_w, small_h), Image.Resampling.LANCZOS)

    # Posterize each channel
    factor = 256 // color_levels
    small_r = small_r.point(lambda x: (x // factor) * factor + factor // 2)
    small_g = small_g.point(lambda x: (x // factor) * factor + factor // 2)
    small_b = small_b.point(lambda x: (x // factor) * factor + factor // 2)

    # Detect edges from alpha for outline
    alpha_edges = small_a.filter(ImageFilter.FIND_EDGES)

    # Darken RGB pixels where alpha edges exist
    for y in range(small_h):
        for x in range(small_w):
            edge_val = alpha_edges.getpixel((x, y))
            if edge_val > 60:  # edge detected
                small_r.putpixel((x, y), int(small_r.getpixel((x, y)) * outline_darken))
                small_g.putpixel((x, y), int(small_g.getpixel((x, y)) * outline_darken))
                small_b.putpixel((x, y), int(small_b.getpixel((x, y)) * outline_darken))

    # Assemble small RGBA
    small_rgba = Image.merge("RGBA", (small_r, small_g, small_b, small_a))

    # Quantize to limited palette
    small_rgb = small_rgba.convert("RGB")
    # Only quantize non-transparent pixels
    quantized = small_rgb.quantize(
        colors=min(32, color_levels * 4),
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )

    # Convert back and reapply alpha
    small_rgb_q = quantized.convert("RGB")
    r_q, g_q, b_q = small_rgb_q.split()
    small_final = Image.merge("RGBA", (r_q, g_q, b_q, small_a))

    # Upscale to original cell size with crisp pixels
    result = small_final.resize((CELL_W, CELL_H), Image.Resampling.NEAREST)
    return result


def pixelate_sheet(
    src: Path,
    dst: Path,
    pixel_scale: int = 6,
    color_levels: int = 6,
    outline_darken: float = 0.35,
) -> None:
    src_img = Image.open(src)
    atlas_w = COLS * CELL_W
    atlas_h = ROWS * CELL_H
    out = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    for row, cols in ROW_FRAMES.items():
        for col in cols:
            x = col * CELL_W
            y = row * CELL_H
            frame = src_img.crop((x, y, x + CELL_W, y + CELL_H))
            pixelated = pixelate_frame(frame, pixel_scale, color_levels, outline_darken)
            out.alpha_composite(pixelated, (x, y))
        print(f"  Row {row} done ({len(cols)} frames)")

    out.save(dst, lossless=True)
    print(f"Saved to {dst}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("--pixel-scale", type=int, default=6)
    parser.add_argument("--color-levels", type=int, default=6)
    parser.add_argument("--outline-darken", type=float, default=0.35)
    args = parser.parse_args()
    pixelate_sheet(args.src, args.dst, args.pixel_scale, args.color_levels, args.outline_darken)


if __name__ == "__main__":
    main()
