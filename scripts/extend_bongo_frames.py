#!/usr/bin/env python3
"""Extend pet spritesheet with bongo paw-tap rows using waving animation as base."""

from __future__ import annotations

from pathlib import Path
from PIL import Image

CELL_W = 192
CELL_H = 208
COLS = 8
WAVING_ROW = 3  # existing waving animation (4 frames, columns 0-3)
WAVING_FRAMES = 4

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC = PROJECT_ROOT / "src-tauri/resources/cat/spritesheet.webp"
BACKUP = PROJECT_ROOT / "src-tauri/resources/cat/spritesheet_pre_bongo.webp"


def main() -> None:
    if not BACKUP.exists():
        import shutil
        shutil.copy2(SRC, BACKUP)
        print(f"Backed up original to {BACKUP}")

    src_img = Image.open(SRC)
    orig_w, orig_h = src_img.size
    orig_rows = orig_h // CELL_H
    print(f"Current spritesheet: {orig_w}x{orig_h} ({orig_rows} rows)")

    if orig_rows >= 11:
        print("Spritesheet already has 11+ rows, skipping")
        return

    # Extract waving frames
    waving_frames = []
    for col in range(WAVING_FRAMES):
        frame = src_img.crop((col * CELL_W, WAVING_ROW * CELL_H, (col + 1) * CELL_W, (WAVING_ROW + 1) * CELL_H))
        waving_frames.append(frame)

    # Create new spritesheet with enough rows for bongo (11 total)
    target_rows = 11
    new_h = target_rows * CELL_H
    new_img = Image.new("RGBA", (orig_w, new_h), (0, 0, 0, 0))
    new_img.paste(src_img, (0, 0))

    bongo_left_row = 9
    bongo_right_row = 10

    # Row 9: bongo-left (copy waving frames as-is)
    for col in range(WAVING_FRAMES):
        new_img.paste(waving_frames[col], (col * CELL_W, bongo_left_row * CELL_H))
    # Fill unused columns with first frame
    for col in range(WAVING_FRAMES, COLS):
        new_img.paste(waving_frames[0], (col * CELL_W, bongo_left_row * CELL_H))

    # Row 10: bongo-right (mirror waving frames)
    for col in range(WAVING_FRAMES):
        mirrored = waving_frames[col].transpose(Image.FLIP_LEFT_RIGHT)
        new_img.paste(mirrored, (col * CELL_W, bongo_right_row * CELL_H))
    for col in range(WAVING_FRAMES, COLS):
        mirrored = waving_frames[0].transpose(Image.FLIP_LEFT_RIGHT)
        new_img.paste(mirrored, (col * CELL_W, bongo_right_row * CELL_H))

    new_img.save(SRC, lossless=True)
    print(f"Saved extended spritesheet: {orig_w}x{new_h} ({target_rows} rows)")


if __name__ == "__main__":
    main()
