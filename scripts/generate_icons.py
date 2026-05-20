"""
Generate app icons for the desktop pet app.
Creates a cute geometric cat face on a warm gradient background.
"""
from PIL import Image, ImageDraw
import math, os, subprocess, shutil, struct

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")

# Catppuccin-inspired palette
BG_START = (203, 166, 247)  # mauve
BG_END = (245, 194, 147)    # peach
CAT_BODY = (30, 30, 46)     # base (dark)
CAT_FACE = (205, 214, 244)  # text (light)
NOSE = (243, 139, 168)      # pink
EYES = (137, 180, 250)      # blue


def draw_cat(draw, size, scale=1.0):
    """Draw a cute geometric cat face centered in the canvas."""
    w, h = size
    cx, cy = w / 2, h / 2
    r = min(w, h) * 0.29 * scale  # head radius

    # Ears (triangles)
    ear_h = r * 0.9
    ear_w = r * 0.55
    ear_offset = r * 0.72
    for side in (-1, 1):
        ex = cx + side * ear_offset
        ey = cy - r * 0.55
        draw.polygon([
            (ex - ear_w, ey + ear_h * 0.4),
            (ex, ey - ear_h * 0.45),
            (ex + ear_w, ey + ear_h * 0.4),
        ], fill=CAT_BODY)

        # Inner ear
        inner_scale = 0.55
        draw.polygon([
            (ex - ear_w * inner_scale, ey + ear_h * 0.3),
            (ex, ey - ear_h * 0.2),
            (ex + ear_w * inner_scale, ey + ear_h * 0.3),
        ], fill=NOSE)

    # Head (slightly flattened circle)
    head_top = cy - r * 0.75
    head_bottom = cy + r * 0.7
    draw.ellipse(
        [cx - r, head_top, cx + r, head_bottom],
        fill=CAT_BODY
    )

    # Face inner area (lighter)
    face_r = r * 0.68
    face_cy = cy + r * 0.02
    draw.ellipse(
        [cx - face_r, face_cy - face_r * 0.85, cx + face_r, face_cy + face_r * 0.9],
        fill=CAT_FACE
    )

    # Eyes
    eye_r = r * 0.14
    eye_offset_x = r * 0.30
    eye_y = cy - r * 0.12
    for side in (-1, 1):
        ex = cx + side * eye_offset_x
        # Eye white
        draw.ellipse(
            [ex - eye_r * 1.3, eye_y - eye_r * 1.2, ex + eye_r * 1.3, eye_y + eye_r * 0.9],
            fill=CAT_BODY
        )
        # Iris
        draw.ellipse(
            [ex - eye_r * 0.7, eye_y - eye_r * 0.7, ex + eye_r * 0.7, eye_y + eye_r * 0.5],
            fill=EYES
        )
        # Pupil
        draw.ellipse(
            [ex - eye_r * 0.25, eye_y - eye_r * 0.25, ex + eye_r * 0.25, eye_y + eye_r * 0.25],
            fill=CAT_BODY
        )
        # Eye shine
        shine_r = eye_r * 0.28
        draw.ellipse(
            [ex - eye_r * 0.35 - shine_r, eye_y - eye_r * 0.55, ex - eye_r * 0.35 + shine_r, eye_y - eye_r * 0.55 + shine_r * 2],
            fill=(255, 255, 255)
        )

    # Nose
    nose_size = r * 0.10
    ny = cy + r * 0.18
    draw.ellipse(
        [cx - nose_size * 0.8, ny - nose_size * 0.5, cx + nose_size * 0.8, ny + nose_size * 0.5],
        fill=NOSE
    )

    # Mouth (simple curved lines)
    mouth_y = ny + nose_size * 0.8
    for side in (-1, 1):
        mx = cx + side * r * 0.06
        end_x = mx + r * 0.18 * side
        draw.line(
            [(mx, mouth_y), (end_x, mouth_y + r * 0.15)],
            fill=CAT_BODY, width=max(2, int(r * 0.06))
        )
        draw.line(
            [(mx, mouth_y), (end_x * 0.3 + mx * 0.7, mouth_y)],
            fill=CAT_BODY, width=max(2, int(r * 0.05))
        )

    # Whiskers
    whisk_y = ny - r * 0.02
    whisk_len = r * 0.55
    for side in (-1, 1):
        wx = cx + side * face_r * 0.55
        for wy_off in (-r * 0.07, r * 0.01, r * 0.09):
            wy = whisk_y + wy_off
            angle = 0.18 * side if wy_off < 0 else -0.12 * side
            end_x = wx + whisk_len * side
            end_y = wy + abs(wy_off) * 1.0
            draw.line([wx, wy, end_x, end_y], fill=CAT_BODY, width=max(1, int(r * 0.035)))


def create_bg_gradient(size):
    """Create a smooth gradient background."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    w, h = size
    for y in range(h):
        t = y / h
        r = int(BG_START[0] + (BG_END[0] - BG_START[0]) * t)
        g = int(BG_START[1] + (BG_END[1] - BG_START[1]) * t)
        b = int(BG_START[2] + (BG_END[2] - BG_START[2]) * t)
        for x in range(w):
            img.putpixel((x, y), (r, g, b, 255))
    return img


def rounded_rect_mask(size, radius_ratio=0.22):
    """Create a rounded rectangle mask."""
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    r = int(min(w, h) * radius_ratio)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    return mask


def generate_icon(size, name, scale_label=""):
    """Generate a single icon at the given size."""
    img = create_bg_gradient(size)
    draw = ImageDraw.Draw(img)
    draw_cat(draw, size, scale=0.95 if size[0] <= 32 else 1.0)

    # Apply rounded corners
    mask = rounded_rect_mask(size)
    # Soften edges slightly on small icons
    img = Image.composite(
        img,
        Image.new("RGBA", size, (0, 0, 0, 0)),
        mask
    )

    # Add subtle shadow for larger icons
    if size[0] >= 128:
        shadow = Image.new("RGBA", (size[0] + 20, size[1] + 20), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.rounded_rectangle(
            [10, 10, size[0] + 9, size[1] + 9],
            radius=int(min(size) * 0.22),
            fill=(0, 0, 0, 40)
        )
        shadow.paste(img, (10, 10), img)
        img = shadow.crop((10, 10, size[0] + 10, size[1] + 10))

    path = os.path.join(ICONS_DIR, name)
    img.save(path, "PNG")
    print(f"  ✓ {name} ({size[0]}x{size[1]})")
    return path


def generate_icns(png_1024_path):
    """Generate .icns from a 1024x1024 PNG using macOS iconutil."""
    iconset = os.path.join(ICONS_DIR, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)

    sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    src = Image.open(png_1024_path)
    for name, sz in sizes.items():
        img = src.resize((sz, sz), Image.LANCZOS)
        img.save(os.path.join(iconset, name), "PNG")

    subprocess.run(["iconutil", "-c", "icns", iconset], check=True)
    shutil.move(os.path.join(ICONS_DIR, "icon.icns"), os.path.join(ICONS_DIR, "icon.icns"))
    shutil.rmtree(iconset)
    print("  ✓ icon.icns")


def generate_ico(base_png_path):
    """Generate a multi-resolution .ico file."""
    src = Image.open(base_png_path)
    ico_path = os.path.join(ICONS_DIR, "icon.ico")

    # Generate multiple sizes for the .ico
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = []
    for sz in ico_sizes:
        img = src.resize(sz, Image.LANCZOS)
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        images.append(img)

    images[0].save(
        ico_path,
        format="ICO",
        sizes=[(i.size[0], i.size[1]) for i in images],
        append_images=images[1:]
    )
    print("  ✓ icon.ico")


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    print("Generating icons...")

    # Generate base icon at 1024x1024
    base_path = generate_icon((1024, 1024), "icon.png")

    # Sizes needed by Tauri config
    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }

    for name, sz in sizes.items():
        img = Image.open(base_path).resize((sz, sz), Image.LANCZOS)
        img.save(os.path.join(ICONS_DIR, name), "PNG")
        print(f"  ✓ {name}")

    # Generate .icns (macOS) and .ico (Windows)
    generate_icns(base_path)
    generate_ico(base_path)

    print(f"\nDone! Icons saved to {ICONS_DIR}")


if __name__ == "__main__":
    main()
