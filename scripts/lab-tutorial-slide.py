#!/usr/bin/env python3
"""Compose a Cinema Academy chapter card over a real lab screenshot."""
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageOps

src, dst, number, kicker, title, subtitle = sys.argv[1:7]
panel_box = [int(value) for value in sys.argv[7:11]] if len(sys.argv) >= 11 else None
W, H = 1280, 720

BOLD = "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf"
REGULAR = "/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf"
GREEN = (52, 211, 153, 255)
WHITE = (248, 250, 252, 255)
MUTED = (148, 163, 184, 255)


def badge(draw):
    draw.rounded_rectangle([40, 24, 356, 58], radius=16, fill=(3, 7, 18, 205))
    draw.ellipse([56, 37, 66, 47], fill=GREEN)
    draw.text(
        (76, 31),
        "S.M.U.V.E. CINEMA ACADEMY",
        font=ImageFont.truetype(BOLD, 17),
        fill=GREEN,
    )
    draw.rounded_rectangle([1030, 24, 1240, 58], radius=16, fill=(3, 7, 18, 205))
    draw.text(
        (1135, 31),
        f"CHAPTER {number} / 09",
        font=ImageFont.truetype(BOLD, 18),
        fill=MUTED,
        anchor="ma",
    )


def rounded_paste(base, panel, xy, radius=18):
    x, y = xy
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, panel.width - 1, panel.height - 1], radius=radius, fill=255
    )
    shadow = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [0, 0, panel.width - 1, panel.height - 1], radius=radius, fill=(0, 0, 0, 150)
    )
    base.alpha_composite(shadow, (x + 10, y + 12))
    base.paste(panel, (x, y), mask)
    ImageDraw.Draw(base).rounded_rectangle(
        [x - 1, y - 1, x + panel.width, y + panel.height],
        radius=radius,
        outline=(52, 211, 153, 180),
        width=2,
    )


if panel_box:
    # Split card: huge chapter type on the left, the real control surface on
    # the right. Used where the full console would be mostly empty monitor.
    img = Image.new("RGBA", (W, H), (5, 10, 22, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for radius in range(620, 60, -30):
        alpha = int(26 * (1 - radius / 620) ** 1.6)
        gdraw.ellipse([-radius, -radius, radius + 180, radius + 180], fill=(16, 185, 129, alpha))
    img = Image.alpha_composite(img, glow)
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(grid)
    for y in range(0, H, 48):
        ldraw.line([0, y, W, y], fill=(148, 163, 184, 12), width=1)
    img = Image.alpha_composite(img, grid)
    draw = ImageDraw.Draw(img)
    badge(draw)

    num_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(num_layer).text(
        (36, 54),
        number,
        font=ImageFont.truetype(BOLD, 150),
        fill=(16, 185, 129, 48),
    )
    img = Image.alpha_composite(img, num_layer)
    draw = ImageDraw.Draw(img)
    draw.text((50, 252), kicker.upper(), font=ImageFont.truetype(BOLD, 19), fill=GREEN)
    title_font = ImageFont.truetype(BOLD, 52)
    title_lines = textwrap.wrap(title, width=15)
    y = 288
    for line in title_lines:
        draw.text((50, y), line, font=title_font, fill=WHITE)
        y += 60
    draw.rectangle([50, y + 12, 108, y + 16], fill=GREEN)
    y += 42
    sub_font = ImageFont.truetype(REGULAR, 21)
    for line in textwrap.wrap(subtitle, width=36):
        draw.text((50, y), line, font=sub_font, fill=MUTED)
        y += 31
    draw.text(
        (50, 646),
        "REAL CONSOLE  ·  NO MOCKUPS",
        font=ImageFont.truetype(BOLD, 15),
        fill=(100, 116, 139, 255),
    )

    panel = Image.open(src).convert("RGB").crop(
        (panel_box[0], panel_box[1], panel_box[0] + panel_box[2], panel_box[1] + panel_box[3])
    )
    panel = ImageOps.contain(panel, (536, 594), Image.LANCZOS)
    px = 660 + (560 - panel.width) // 2
    py = 92 + (600 - panel.height) // 2
    draw.text(
        (px, max(66, py - 26)),
        "LIVE CONTROL SURFACE",
        font=ImageFont.truetype(BOLD, 15),
        fill=GREEN,
    )
    rounded_paste(img, panel, (px, py))
    img.convert("RGB").save(dst, quality=94)
else:
    img = ImageOps.fit(Image.open(src).convert("RGB"), (W, H), Image.LANCZOS)
    img = Image.alpha_composite(img.convert("RGBA"), Image.new("RGBA", (W, H), (2, 6, 23, 46)))
    gradient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gradient)
    for y in range(400, H):
        alpha = int(242 * ((y - 400) / (H - 400)) ** 0.8)
        gdraw.rectangle([0, y, W, y + 1], fill=(3, 7, 18, alpha))
    img = Image.alpha_composite(img, gradient)
    top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(top)
    for y in range(0, 110):
        alpha = int(150 * (1 - y / 110))
        tdraw.rectangle([0, y, W, y + 1], fill=(3, 7, 18, alpha))
    img = Image.alpha_composite(img, top)
    draw = ImageDraw.Draw(img)
    badge(draw)
    draw.rectangle([48, 506, 96, 510], fill=GREEN)
    draw.text((48, 528), kicker.upper(), font=ImageFont.truetype(BOLD, 18), fill=GREEN)
    draw.text((48, 560), title, font=ImageFont.truetype(BOLD, 42), fill=WHITE)
    sub_font = ImageFont.truetype(REGULAR, 21)
    y = 618
    for line in textwrap.wrap(subtitle, width=88):
        draw.text((48, y), line, font=sub_font, fill=MUTED)
        y += 28
    img.convert("RGB").save(dst, quality=94)
