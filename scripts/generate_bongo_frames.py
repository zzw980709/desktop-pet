#!/usr/bin/env python3
"""Generate bongo paw-tap animation frames using soft-masked paw shift.

Creates paw-tapping visuals by shifting the paw area upward with an
elliptical soft mask — avoiding hard seams. The mask blends smoothly
from 1.0 at the paw center to 0.0 at edges.

Per-column desk surface colors are sampled to fill the exposed gap
naturally when the paw moves up.

Frames per side:
- Frame 0: rest (idle)
- Frame 1: paw raised 2px
- Frame 2: paw raised 4px (peak tap)
- Frame 3: paw returning 2px
"""

from __future__ import annotations

import math
from pathlib import Path
from PIL import Image

CELL_W = 192
CELL_H = 208
COLS = 8

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC = PROJECT_ROOT / "src-tauri/resources/cat/spritesheet.webp"
BACKUP = PROJECT_ROOT / "src-tauri/resources/cat/spritesheet_pre_bongo_v2.webp"

# Paw soft-mask definitions. cx/cy = center of paw above desk,
# rx/ry = ellipse radii, feather = edge softness in pixels
LEFT_PAW_MASK = {"cx": 71, "cy": 176, "rx": 22, "ry": 12, "feather": 5}
RIGHT_PAW_MASK = {"cx": 120, "cy": 176, "rx": 24, "ry": 12, "feather": 5}

SHIFTS = [0, -2, -4, -2]

BONGO_LEFT_ROW = 9
BONGO_RIGHT_ROW = 10


def mask_value(x: int, y: int, mask_def: dict) -> float:
    """Return 0.0-1.0 mask weight. 1 = full paw shift, 0 = no change."""
    cx, cy = mask_def["cx"], mask_def["cy"]
    rx, ry = mask_def["rx"], mask_def["ry"]
    feather = mask_def["feather"]

    if rx <= 0 or ry <= 0:
        return 0.0
    dx = (x - cx) / rx
    dy = (y - cy) / ry
    dist = math.sqrt(dx * dx + dy * dy)

    if dist <= 1.0:
        return 1.0
    feather_dist = feather / max(rx, ry)
    if dist <= 1.0 + feather_dist:
        t = (dist - 1.0) / feather_dist
        return 1.0 - t
    return 0.0


def get(pixels: list, x: int, y: int) -> tuple:
    """Get pixel at (x, y) with bounds check."""
    if 0 <= x < CELL_W and 0 <= y < CELL_H:
        return pixels[y * CELL_W + x]
    return (0, 0, 0, 0)


def set_px(pixels: list, x: int, y: int, color: tuple):
    """Set pixel at (x, y) with bounds check."""
    if 0 <= x < CELL_W and 0 <= y < CELL_H:
        pixels[y * CELL_W + x] = color


def create_bongo_frames(
    base_img: Image.Image,
    mask_def: dict,
) -> list[Image.Image]:
    """Generate 4 bongo frames with soft-masked paw shift."""
    frames = []
    base_rgba = base_img.convert("RGBA")
    # Keep original pixel data as read-only reference
    ref = list(base_rgba.getdata())

    # Precompute mask grid and per-column fill colors
    mask = {}       # (x, y) -> weight
    fill_colors = {}  # x -> desk surface fill color
    desk_sample_y = mask_def["cy"] + mask_def["ry"] + 5  # desk surface row

    for y in range(CELL_H):
        for x in range(CELL_W):
            m = mask_value(x, y, mask_def)
            if m > 0.001:
                mask[(x, y)] = m
                if x not in fill_colors:
                    # Sample desk surface color for this column
                    for dy in range(6):
                        sy = desk_sample_y + dy
                        fc = get(ref, x, sy)
                        if fc[3] > 20:
                            fill_colors[x] = fc
                            break
                    if x not in fill_colors:
                        fill_colors[x] = (0, 0, 0, 0)

    for shift in SHIFTS:
        if shift == 0:
            frames.append(base_img.copy())
            continue

        work = list(base_rgba.getdata())

        for (x, y), m in mask.items():
            src_y = y
            dst_y = y + shift
            if dst_y < 0:
                continue

            src_color = get(ref, x, src_y)
            if src_color[3] == 0:
                continue

            # At destination: blend shifted paw onto existing pixels
            existing = get(work, x, dst_y)
            r = int(src_color[0] * m + existing[0] * (1 - m))
            g = int(src_color[1] * m + existing[1] * (1 - m))
            b = int(src_color[2] * m + existing[2] * (1 - m))
            a = max(src_color[3], existing[3])
            set_px(work, x, dst_y, (r, g, b, a))

            # At source: blend toward desk surface fill color
            fill_color = fill_colors.get(x, (0, 0, 0, 0))
            r_s = int(src_color[0] * (1 - m) + fill_color[0] * m)
            g_s = int(src_color[1] * (1 - m) + fill_color[1] * m)
            b_s = int(src_color[2] * (1 - m) + fill_color[2] * m)
            # Alpha: fade toward fill alpha, but keep some opacity
            a_s = int(src_color[3] * (1 - m * 0.7) + fill_color[3] * m * 0.7)
            set_px(work, x, src_y, (r_s, g_s, b_s, a_s))

        result = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        result.putdata(work)
        frames.append(result)

    return frames


def main() -> None:
    import shutil

    if not BACKUP.exists():
        shutil.copy2(SRC, BACKUP)
        print(f"Backed up to {BACKUP}")

    src_img = Image.open(SRC)
    orig_w, orig_h = src_img.size
    orig_rows = orig_h // CELL_H
    print(f"Current spritesheet: {orig_w}x{orig_h} ({orig_rows} rows)")

    idle_frame = src_img.crop((0, 0, CELL_W, CELL_H))

    left_frames = create_bongo_frames(idle_frame, LEFT_PAW_MASK)
    right_frames = create_bongo_frames(idle_frame, RIGHT_PAW_MASK)

    target_rows = max(orig_rows, 11)
    new_h = target_rows * CELL_H
    new_img = Image.new("RGBA", (orig_w, new_h), (0, 0, 0, 0))
    new_img.paste(src_img, (0, 0))

    for col in range(4):
        new_img.paste(left_frames[col], (col * CELL_W, BONGO_LEFT_ROW * CELL_H))
        new_img.paste(right_frames[col], (col * CELL_W, BONGO_RIGHT_ROW * CELL_H))
    for col in range(4, COLS):
        new_img.paste(left_frames[0], (col * CELL_W, BONGO_LEFT_ROW * CELL_H))
        new_img.paste(right_frames[0], (col * CELL_W, BONGO_RIGHT_ROW * CELL_H))

    new_img.save(SRC, lossless=True)
    print(f"Saved updated spritesheet: {orig_w}x{new_h} ({target_rows} rows)")

    preview_dir = PROJECT_ROOT / "scripts/bongo_preview"
    preview_dir.mkdir(exist_ok=True)
    for i, (lf, rf) in enumerate(zip(left_frames, right_frames)):
        lf.save(preview_dir / f"bongo_left_f{i}.png")
        rf.save(preview_dir / f"bongo_right_f{i}.png")
    print(f"Preview frames saved to {preview_dir}/")


if __name__ == "__main__":
    main()
