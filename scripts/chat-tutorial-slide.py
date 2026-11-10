#!/usr/bin/env python3
"""Compose a Field Guide chapter card around the real assistant drawer."""
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageOps

src, dst, number, kicker, title, subtitle = sys.argv[1:7]
full = len(sys.argv) >= 8 and sys.argv[7] == "full"
W, H = 1280, 720
DRAWER_X = 896
DRAWER_W = 384

BOLD = "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf"
REGULAR = "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf"
TEAL = (45, 212, 191, 255)
WHITE = (248, 250, 252, 255)
MUTED = (148, 163, 184, 255)
DIM = (100, 116, 139, 255)


def badge(draw, chapter=True):
    draw.rounded_rectangle([40, 24, 398, 58], radius=16, fill=(3, 7, 18, 215))
    draw.ellipse([56, 37, 66, 47], fill=TEAL)
    draw.text(
        (76, 31),
        "S.M.U.V.E 2.0 // FIELD GUIDE",
        font=ImageFont.truetype(BOLD, 16),
        fill=TEAL,
    )
    if chapter:
        draw.rounded_rectangle([724, 24, 856, 58], radius=16, fill=(3, 7, 18, 215))
        draw.text(
            (790, 32),
            f"CHAPTER {number} / 09",
            font=ImageFont.truetype(BOLD, 13),
            fill=MUTED,
            anchor="ma",
        )


def split_card():
    img = Image.new("RGBA", (W, H), (5, 10, 22, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for radius in range(760, 60, -30):
        alpha = int(30 * (1 - radius / 760) ** 1.7)
        gdraw.ellipse(
            [-radius, -radius, radius + 130, radius + 130],
            fill=(13, 148, 136, alpha),
        )
    img = Image.alpha_composite(img, glow)
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(grid)
    for y in range(0, H, 48):
        ldraw.line([0, y, 880, y], fill=(148, 163, 184, 11), width=1)
    for x in range(0, 880, 88):
        ldraw.line([x, 0, x, H], fill=(148, 163, 184, 7), width=1)
    img = Image.alpha_composite(img, grid)
    draw = ImageDraw.Draw(img)
    badge(draw)

    num_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(num_layer).text(
        (36, 54),
        number,
        font=ImageFont.truetype(BOLD, 160),
        fill=(45, 212, 191, 46),
    )
    img = Image.alpha_composite(img, num_layer)
    draw = ImageDraw.Draw(img)

    draw.text((50, 272), kicker.upper(), font=ImageFont.truetype(BOLD, 19), fill=TEAL)
    draw.rectangle([50, 302, 108, 306], fill=TEAL)
    title_font = ImageFont.truetype(BOLD, 50)
    y = 322
    for line in textwrap.wrap(title, width=18):
        draw.text((50, y), line, font=title_font, fill=WHITE)
        y += 57
    sub_font = ImageFont.truetype(REGULAR, 20)
    y = max(y + 12, 512)
    for line in textwrap.wrap(subtitle, width=39):
        draw.text((50, y), line, font=sub_font, fill=MUTED)
        y += 29
    draw.text(
        (50, 664),
        "REAL ASSISTANT  ·  NO MOCKUPS",
        font=ImageFont.truetype(BOLD, 14),
        fill=DIM,
    )

    panel = Image.open(src).convert("RGB")
    panel = ImageOps.contain(panel, (DRAWER_W, H), Image.LANCZOS)
    img.paste(panel, (DRAWER_X, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([DRAWER_X - 2, 0, DRAWER_X - 1, H], fill=(45, 212, 191, 120))
    draw.line([DRAWER_X - 10, 0, DRAWER_X - 10, H], fill=(45, 212, 191, 24), width=1)
    draw.text(
        (DRAWER_X - 24, 680),
        "LIVE DRAWER",
        font=ImageFont.truetype(BOLD, 11),
        fill=(45, 212, 191, 130),
        anchor="ra",
    )
    img.convert("RGB").save(dst, quality=94)


def full_card():
    img = Image.open(src).convert("RGB")
    if img.size != (W, H):
        img = ImageOps.fit(img, (W, H), Image.LANCZOS)
    img = Image.alpha_composite(img.convert("RGBA"), Image.new("RGBA", (W, H), (2, 6, 23, 62)))

    gradient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gradient)
    for y in range(360, H):
        alpha = int(250 * ((y - 360) / (H - 360)) ** 0.78)
        gdraw.rectangle([0, y, 900, y + 1], fill=(3, 7, 18, alpha))
    img = Image.alpha_composite(img, gradient)

    top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(top)
    for y in range(0, 120):
        alpha = int(155 * (1 - y / 120))
        tdraw.rectangle([0, y, 900, y + 1], fill=(3, 7, 18, alpha))
    img = Image.alpha_composite(img, top)
    draw = ImageDraw.Draw(img)
    badge(draw)
    draw.rectangle([48, 486, 96, 490], fill=TEAL)
    draw.text((48, 508), kicker.upper(), font=ImageFont.truetype(BOLD, 18), fill=TEAL)
    draw.text((48, 538), title, font=ImageFont.truetype(BOLD, 44), fill=WHITE)
    sub_font = ImageFont.truetype(REGULAR, 21)
    y = 596
    for line in textwrap.wrap(subtitle, width=52):
        draw.text((48, y), line, font=sub_font, fill=MUTED)
        y += 28
    img.convert("RGB").save(dst, quality=94)


if full:
    full_card()
else:
    split_card()
