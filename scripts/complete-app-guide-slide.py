#!/usr/bin/env python3
"""Compose a complete-application chapter card around a real workspace capture."""
import json
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

src, dst, number, kicker, title, subtitle, features_json, total = sys.argv[1:9]
features = json.loads(features_json)
W, H = 1280, 720
PANEL = (530, 156, 1232, 551)
TEAL = (45, 212, 191, 255)
WHITE = (248, 250, 252, 255)
MUTED = (148, 163, 184, 255)
DIM = (100, 116, 139, 255)
AMBER = (251, 191, 36, 255)

FONT_CANDIDATES = [
    "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]
REGULAR_CANDIDATES = [
    "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]


def first_existing(paths, fallback):
    for value in paths:
        if Path(value).exists():
            return value
    return fallback


BOLD = first_existing(FONT_CANDIDATES, FONT_CANDIDATES[-1])
REGULAR = first_existing(REGULAR_CANDIDATES, REGULAR_CANDIDATES[-1])


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


def wrap(draw, text, width, face):
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=face) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


img = Image.new("RGBA", (W, H), (4, 9, 20, 255))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
for radius in range(820, 70, -30):
    alpha = int(34 * (1 - radius / 820) ** 1.7)
    gdraw.ellipse(
        [-radius, -radius + 80, radius + 180, radius + 220],
        fill=(13, 148, 136, alpha),
    )
img = Image.alpha_composite(img, glow)

grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ldraw = ImageDraw.Draw(grid)
for y in range(0, H, 48):
    ldraw.line([0, y, 516, y], fill=(148, 163, 184, 13), width=1)
for x in range(0, 516, 86):
    ldraw.line([x, 0, x, H], fill=(148, 163, 184, 8), width=1)
img = Image.alpha_composite(img, grid)
draw = ImageDraw.Draw(img)

# Masthead
draw.rounded_rectangle([40, 24, 420, 58], radius=16, fill=(3, 7, 18, 220))
draw.ellipse([56, 37, 66, 47], fill=TEAL)
draw.text(
    (76, 31),
    "S.M.U.V.E 2.0 // COMPLETE GUIDE",
    font=font(15, True),
    fill=TEAL,
)
draw.rounded_rectangle([724, 24, 1240, 58], radius=16, fill=(3, 7, 18, 220))
draw.text(
    (982, 32),
    f"CHAPTER {number} / {total}",
    font=font(12, True),
    fill=MUTED,
    anchor="ma",
)

# Oversized chapter number
num_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(num_layer).text(
    (38, 58),
    number,
    font=font(152, True),
    fill=(45, 212, 191, 42),
)
img = Image.alpha_composite(img, num_layer)
draw = ImageDraw.Draw(img)

draw.text((50, 232), kicker.upper(), font=font(18, True), fill=TEAL)
draw.rectangle([50, 260, 108, 264], fill=TEAL)

title_face = font(43, True)
y = 282
for line in wrap(draw, title, 446, title_face):
    draw.text((50, y), line, font=title_face, fill=WHITE)
    y += 49

sub_face = font(18)
y = max(y + 8, 430)
for line in wrap(draw, subtitle, 438, sub_face):
    draw.text((50, y), line, font=sub_face, fill=MUTED)
    y += 26

y = max(y + 12, 500)
feature_face = font(13, True)
for feature in features[:4]:
    draw.rounded_rectangle([50, y + 5, 57, y + 12], radius=3, fill=TEAL)
    for line in wrap(draw, feature, 400, feature_face):
        draw.text((68, y), line, font=feature_face, fill=(203, 213, 225, 255))
        y += 20
    y += 5

draw.text(
    (50, 676),
    "REAL WORKSPACE  ·  NO MOCKUPS",
    font=font(11, True),
    fill=DIM,
)

# Workspace capture in a rounded frame
panel_source = Image.open(src).convert("RGB")
panel_w, panel_h = PANEL[2] - PANEL[0], PANEL[3] - PANEL[1]
panel = ImageOps.fit(panel_source, (panel_w, panel_h), Image.LANCZOS)
mask = Image.new("L", (panel_w, panel_h), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [0, 0, panel_w, panel_h], radius=18, fill=255
)
img.paste(panel, (PANEL[0], PANEL[1]), mask)
draw = ImageDraw.Draw(img)
draw.rounded_rectangle(PANEL, radius=18, outline=(45, 212, 191, 150), width=2)
draw.rounded_rectangle(
    [PANEL[0] + 14, PANEL[3] - 38, PANEL[0] + 190, PANEL[3] - 12],
    radius=8,
    fill=(3, 7, 18, 205),
)
draw.ellipse(
    [PANEL[0] + 24, PANEL[3] - 30, PANEL[0] + 32, PANEL[3] - 22],
    fill=AMBER,
)
draw.text(
    (PANEL[0] + 40, PANEL[3] - 33),
    "LIVE WORKSPACE",
    font=font(10, True),
    fill=AMBER,
)

img.convert("RGB").save(dst, quality=94)
