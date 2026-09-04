#!/usr/bin/env python3
"""Build the vector-only Fair Nights Frederick coloring book.

The drawings are original geometry inspired by Mike D's own 2024 Fair photos.
No official Fair logo, vendor mark, poster, map, or third-party illustration is
used. The script writes editable SVG pages, a merged US Letter PDF, a public
download, and a public SVG cover preview.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import random
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
SVG_DIR = OUTPUT_DIR / "fair-nights-coloring-book-svg"
TMP_DIR = ROOT / "tmp" / "pdfs" / "fair-nights-coloring-book"
PUBLIC_PDF = ROOT / "public" / "downloads" / "fair-nights-frederick-coloring-book.pdf"
PUBLIC_COVER = ROOT / "public" / "images" / "fair" / "fair-nights-coloring-book-cover.svg"
OUTPUT_PDF = OUTPUT_DIR / "fair-nights-frederick-coloring-book.pdf"
MANIFEST = OUTPUT_DIR / "fair-nights-frederick-coloring-book-manifest.json"

PAGE_WIDTH = 612
PAGE_HEIGHT = 792
INK = "#221C15"
PAPER = "#FFFFFF"
CREAM = "#F4EEE2"
BRICK = "#B5462B"
OCHRE = "#C58A32"
CREEK = "#285D73"
PLUM = "#7E2C6F"
FOREST = "#315A43"
STORE_URL = "https://www.colorfrederick.com"

PHOTO_REFERENCES = (
    "public/images/fair/fairgrounds-night-mike-d-1920.jpg",
    "public/images/fair/fairgrounds-midway-mike-d-1920.jpg",
    "public/images/fair/fairgrounds-ferris-wheel-mike-d-1920.jpg",
)


@dataclass(frozen=True)
class Page:
    slug: str
    title: str
    subtitle: str
    artwork: str
    is_cover: bool = False
    is_closing: bool = False


def attrs(**values: object) -> str:
    rendered = []
    for name, value in values.items():
        if value is None:
            continue
        rendered.append(
            f'{name.rstrip("_").replace("_", "-")}="{html.escape(str(value), quote=True)}"'
        )
    return " ".join(rendered)


def element(name: str, content: str = "", **values: object) -> str:
    properties = attrs(**values)
    if content:
        return f"<{name} {properties}>{content}</{name}>" if properties else f"<{name}>{content}</{name}>"
    return f"<{name} {properties}/>" if properties else f"<{name}/>"


def group(content: Iterable[str] | str, **values: object) -> str:
    body = "".join(content) if not isinstance(content, str) else content
    return element("g", body, **values)


def line(x1: float, y1: float, x2: float, y2: float, **values: object) -> str:
    return element("line", x1=f"{x1:.2f}", y1=f"{y1:.2f}", x2=f"{x2:.2f}", y2=f"{y2:.2f}", **values)


def rect(x: float, y: float, width: float, height: float, rx: float = 0, **values: object) -> str:
    return element(
        "rect",
        x=f"{x:.2f}",
        y=f"{y:.2f}",
        width=f"{width:.2f}",
        height=f"{height:.2f}",
        rx=f"{rx:.2f}" if rx else None,
        **values,
    )


def circle(cx: float, cy: float, radius: float, **values: object) -> str:
    return element("circle", cx=f"{cx:.2f}", cy=f"{cy:.2f}", r=f"{radius:.2f}", **values)


def ellipse(cx: float, cy: float, rx: float, ry: float, **values: object) -> str:
    return element(
        "ellipse",
        cx=f"{cx:.2f}",
        cy=f"{cy:.2f}",
        rx=f"{rx:.2f}",
        ry=f"{ry:.2f}",
        **values,
    )


def path(d: str, **values: object) -> str:
    return element("path", d=d, **values)


def polygon(points: Iterable[tuple[float, float]], **values: object) -> str:
    point_string = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return element("polygon", points=point_string, **values)


def text(x: float, y: float, value: str, **values: object) -> str:
    """Turn checked-in Public Sans glyphs into deterministic SVG paths."""
    try:
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.ttLib import TTFont
    except ImportError as error:
        raise SystemExit(
            "fonttools is required to outline Public Sans into the vector pages. "
            "Install it with `python3 -m pip install fonttools`."
        ) from error

    font_size = float(values.pop("font_size", 12))
    font_weight = int(values.pop("font_weight", 400))
    letter_spacing = float(values.pop("letter_spacing", 0))
    text_anchor = str(values.pop("text_anchor", "start"))
    font_file = (
        "PublicSans-Bold.ttf"
        if font_weight >= 700
        else "PublicSans-Medium.ttf"
        if font_weight >= 500
        else "PublicSans-Regular.ttf"
    )
    font_path = ROOT / "public" / "brand" / "fonts" / "static" / font_file
    font = TTFont(font_path, recalcBBoxes=False, recalcTimestamp=False)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"].metrics
    units_per_em = font["head"].unitsPerEm
    scale = font_size / units_per_em
    spacing_units = letter_spacing / scale if scale else 0

    glyphs: list[tuple[str, float]] = []
    cursor = 0.0
    for index, character in enumerate(value):
        glyph_name = cmap.get(ord(character), ".notdef")
        glyphs.append((glyph_name, cursor))
        cursor += hmtx.get(glyph_name, hmtx[".notdef"])[0]
        if index < len(value) - 1:
            cursor += spacing_units
    width = cursor * scale
    start_x = x - width / 2 if text_anchor == "middle" else x - width if text_anchor == "end" else x

    paths: list[str] = []
    for glyph_name, offset in glyphs:
        pen = SVGPathPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        commands = pen.getCommands()
        if commands:
            paths.append(path(commands, transform=f"translate({offset:.2f} 0)"))
    font.close()
    return group(
        paths,
        transform=f"translate({start_x:.2f} {y:.2f}) scale({scale:.8f} {-scale:.8f})",
        aria_label=value,
        vector_effect="non-scaling-stroke",
        **values,
    )


def star(cx: float, cy: float, outer: float, inner: float | None = None, points: int = 5) -> str:
    inner = inner if inner is not None else outer * 0.43
    coordinates: list[tuple[float, float]] = []
    for index in range(points * 2):
        angle = -math.pi / 2 + index * math.pi / points
        radius = outer if index % 2 == 0 else inner
        coordinates.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return polygon(coordinates)


def bunting(x1: float, y: float, x2: float, depth: float = 15, count: int = 10) -> str:
    pieces = [path(f"M {x1:.2f} {y:.2f} Q {(x1 + x2) / 2:.2f} {y + 14:.2f} {x2:.2f} {y:.2f}")]
    for index in range(count):
        x = x1 + (x2 - x1) * (index + 0.5) / count
        offset = 14 * (1 - (abs(x - (x1 + x2) / 2) / ((x2 - x1) / 2)) ** 2)
        yy = y + offset
        pieces.append(polygon(((x - 8, yy), (x + 8, yy), (x, yy + depth))))
    return group(pieces)


def string_lights(x1: float, y1: float, x2: float, y2: float, count: int = 12) -> str:
    pieces = [path(f"M {x1:.2f} {y1:.2f} Q {(x1 + x2) / 2:.2f} {max(y1, y2) + 18:.2f} {x2:.2f} {y2:.2f}")]
    for index in range(count + 1):
        t = index / count
        x = x1 + (x2 - x1) * t
        linear_y = y1 + (y2 - y1) * t
        sag = 18 * 4 * t * (1 - t)
        y = linear_y + sag
        pieces.append(line(x, y, x, y + 7))
        pieces.append(circle(x, y + 11, 4))
    return group(pieces)


def person(x: float, y: float, scale: float = 1.0) -> str:
    return group(
        (
            circle(x, y - 14 * scale, 5 * scale),
            path(
                f"M {x:.2f} {y - 9 * scale:.2f} L {x:.2f} {y + 8 * scale:.2f} "
                f"M {x - 9 * scale:.2f} {y - 1 * scale:.2f} L {x:.2f} {y - 5 * scale:.2f} L {x + 9 * scale:.2f} {y - 1 * scale:.2f} "
                f"M {x:.2f} {y + 8 * scale:.2f} L {x - 7 * scale:.2f} {y + 20 * scale:.2f} "
                f"M {x:.2f} {y + 8 * scale:.2f} L {x + 7 * scale:.2f} {y + 20 * scale:.2f}"
            ),
        )
    )


def tent(x: float, y: float, width: float, height: float) -> str:
    return group(
        (
            polygon(((x, y + height * 0.38), (x + width / 2, y), (x + width, y + height * 0.38))),
            rect(x + 3, y + height * 0.38, width - 6, height * 0.62, rx=2),
            line(x + width / 2, y, x + width / 2, y + height),
            path(
                f"M {x + 3:.2f} {y + height * 0.38:.2f} "
                + " ".join(
                    f"L {x + width * (i + 0.5) / 5:.2f} {y + height * (0.38 + (0.13 if i % 2 == 0 else 0)):.2f}"
                    for i in range(5)
                )
                + f" L {x + width - 3:.2f} {y + height * 0.38:.2f}"
            ),
        )
    )


def wheel(cx: float, cy: float, radius: float, cabins: int = 16) -> str:
    pieces = [circle(cx, cy, radius), circle(cx, cy, radius - 9), circle(cx, cy, 16)]
    for index in range(cabins):
        angle = 2 * math.pi * index / cabins
        rim_x = cx + math.cos(angle) * (radius - 5)
        rim_y = cy + math.sin(angle) * (radius - 5)
        pieces.append(line(cx, cy, rim_x, rim_y))
        cabin_x = cx + math.cos(angle) * (radius + 7)
        cabin_y = cy + math.sin(angle) * (radius + 7)
        pieces.append(line(cabin_x, cabin_y - 8, cabin_x, cabin_y - 2))
        pieces.append(rect(cabin_x - 10, cabin_y - 2, 20, 13, rx=3))
    pieces.extend(
        (
            line(cx - 12, cy + 12, cx - radius * 0.62, cy + radius * 1.32),
            line(cx + 12, cy + 12, cx + radius * 0.62, cy + radius * 1.32),
            line(cx - radius * 0.77, cy + radius * 1.32, cx + radius * 0.77, cy + radius * 1.32),
        )
    )
    return group(pieces)


def cloud(x: float, y: float, scale: float = 1.0) -> str:
    return path(
        f"M {x:.2f} {y:.2f} "
        f"C {x + 6 * scale:.2f} {y - 16 * scale:.2f}, {x + 25 * scale:.2f} {y - 18 * scale:.2f}, {x + 32 * scale:.2f} {y - 4 * scale:.2f} "
        f"C {x + 44 * scale:.2f} {y - 15 * scale:.2f}, {x + 64 * scale:.2f} {y - 8 * scale:.2f}, {x + 62 * scale:.2f} {y + 6 * scale:.2f} "
        f"L {x + 8 * scale:.2f} {y + 6 * scale:.2f} C {x - 2 * scale:.2f} {y + 6 * scale:.2f}, {x - 3 * scale:.2f} {y - 1 * scale:.2f}, {x:.2f} {y:.2f} Z"
    )


def page_shell(page: Page, page_number: int) -> str:
    metadata = (
        "Original vector drawing inspired by Mike D's own 2024 Frederick fairground photographs. "
        "No official Fair logo, map, vendor identity, or third-party artwork is used."
    )
    if page.is_cover:
        body = page.artwork
    elif page.is_closing:
        body = page.artwork
    else:
        body = "".join(
            (
                text(40, 49, f"PAGE {page_number - 1:02d}", font_size=8, font_weight=800, letter_spacing=1.4, fill=INK, stroke="none"),
                text(40, 76, page.title, font_size=22, font_weight=800, fill=INK, stroke="none"),
                text(40, 96, page.subtitle, font_size=9.5, font_weight=500, fill=INK, stroke="none"),
                line(40, 112, 572, 112, stroke_width=1.4),
                group(page.artwork, transform="translate(0 8)"),
                line(40, 748, 572, 748, stroke_width=1),
                text(40, 765, "FAIR NIGHTS · A FREDERICK COLORING BOOK", font_size=7, font_weight=700, letter_spacing=0.9, fill=INK, stroke="none"),
                text(572, 765, str(page_number), font_size=8, font_weight=700, text_anchor="end", fill=INK, stroke="none"),
            )
        )
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="8.5in" height="11in" viewBox="0 0 {PAGE_WIDTH} {PAGE_HEIGHT}" role="img"
     aria-labelledby="page-title page-desc">
  <title id="page-title">{html.escape(page.title)}</title>
  <desc id="page-desc">{html.escape(metadata)}</desc>
  <rect width="{PAGE_WIDTH}" height="{PAGE_HEIGHT}" fill="{PAPER}"/>
  <g fill="none" stroke="{INK}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
    {body}
  </g>
</svg>
'''


def cover_art() -> str:
    color_bands = group(
        (
            path("M 0 0 H 612 V 16 H 0 Z", fill=BRICK, stroke="none"),
            path("M 0 16 H 612 V 23 H 0 Z", fill=OCHRE, stroke="none"),
            circle(527, 111, 31, fill=CREEK, stroke="none", opacity=0.16),
            circle(87, 655, 42, fill=PLUM, stroke="none", opacity=0.12),
            circle(535, 684, 28, fill=FOREST, stroke="none", opacity=0.12),
        )
    )
    stars = [star(62 + index * 49, 168 + (index % 2) * 13, 6) for index in range(11)]
    fair_wheel = wheel(306, 446, 151, cabins=18)
    skyline = group(
        (
            path("M 37 661 L 37 618 L 74 618 L 74 586 L 99 586 L 99 661"),
            path("M 99 661 L 99 606 L 129 606 L 129 568 L 145 532 L 161 568 L 161 606 L 190 606 L 190 661"),
            path("M 422 661 L 422 607 L 454 607 L 454 574 L 470 537 L 486 574 L 486 607 L 515 607 L 515 661"),
            path("M 515 661 L 515 623 L 574 623 L 574 661"),
            line(27, 661, 585, 661),
        ),
        stroke_width=2.5,
    )
    return "".join(
        (
            color_bands,
            text(306, 64, "FREDERICK RADIUS PRESENTS", font_size=9, font_weight=800, text_anchor="middle", letter_spacing=1.8, fill=INK, stroke="none"),
            text(306, 112, "FAIR NIGHTS", font_size=48, font_weight=900, text_anchor="middle", fill=PAPER, stroke=INK, stroke_width=1.6, paint_order="stroke fill", letter_spacing=2.2),
            text(306, 144, "A FREDERICK COLORING BOOK", font_size=14, font_weight=800, text_anchor="middle", letter_spacing=2.0, fill=INK, stroke="none"),
            group(stars),
            fair_wheel,
            skyline,
            bunting(55, 699, 557, depth=13, count=14),
            text(306, 744, "12 PRINTABLE PAGES · MADE FOR LETTER-SIZE PAPER", font_size=8.5, font_weight=800, text_anchor="middle", letter_spacing=1.1, fill=INK, stroke="none"),
            text(306, 765, "Independent artwork inspired by Mike D's own Frederick fairground photographs.", font_size=7.5, font_weight=500, text_anchor="middle", fill=INK, stroke="none"),
        )
    )


def aerial_midway_art() -> str:
    pieces: list[str] = []
    pieces.append(path("M 83 690 C 172 610 191 468 279 357 C 348 270 441 221 544 169"))
    pieces.append(path("M 129 708 C 207 619 226 489 307 386 C 379 295 468 247 563 208"))
    pieces.append(path("M 83 690 L 129 708 M 544 169 L 563 208"))
    pieces.append(wheel(436, 367, 102, cabins=14))
    tent_positions = ((80, 168, 72, 62), (174, 194, 68, 57), (80, 263, 84, 68), (196, 301, 76, 62), (76, 384, 94, 73), (195, 439, 83, 66), (68, 510, 92, 70), (337, 553, 87, 68), (448, 533, 90, 71))
    pieces.extend(tent(*item) for item in tent_positions)
    for index, (x, y) in enumerate(((298, 226), (319, 270), (282, 326), (333, 443), (301, 506), (277, 563), (329, 626), (181, 572), (478, 656), (391, 656))):
        pieces.append(person(x, y, 0.68 + (index % 2) * 0.08))
    pieces.append(string_lights(52, 142, 560, 135, count=16))
    pieces.extend((star(86, 127, 8), star(515, 119, 9), star(275, 151, 6)))
    pieces.append(text(130, 678, "ENTRY", font_size=9, font_weight=800, letter_spacing=1, fill=INK, stroke="none"))
    return "".join(pieces)


def ferris_wheel_art() -> str:
    pieces = [wheel(306, 407, 211, cabins=20)]
    pieces.append(bunting(45, 159, 567, depth=18, count=16))
    pieces.append(string_lights(70, 673, 542, 673, count=14))
    pieces.extend((cloud(55, 212, 0.9), cloud(465, 238, 0.75)))
    pieces.extend(star(x, y, size) for x, y, size in ((91, 160, 7), (517, 181, 9), (154, 229, 6), (460, 149, 5)))
    pieces.extend(person(x, 699, 0.8) for x in (118, 165, 432, 479))
    return "".join(pieces)


def carousel_art() -> str:
    pieces: list[str] = [
        line(306, 159, 306, 202),
        star(306, 147, 13),
        path("M 128 300 Q 306 134 484 300"),
        path("M 128 300 Q 306 388 484 300"),
        line(128, 300, 128, 597),
        line(484, 300, 484, 597),
        ellipse(306, 597, 191, 31),
        ellipse(306, 623, 208, 39),
        line(306, 227, 306, 625),
    ]
    for index in range(9):
        x = 150 + index * 39
        pieces.append(line(x, 280 + abs(index - 4) * 7, x, 585))
    for index, x in enumerate((176, 254, 332, 410)):
        y = 420 + (index % 2) * 50
        pieces.extend(
            (
                ellipse(x, y, 32, 19),
                path(
                    f"M {x + 20} {y - 12} C {x + 27} {y - 35}, {x + 37} {y - 55}, {x + 54} {y - 54} "
                    f"C {x + 67} {y - 53}, {x + 66} {y - 42}, {x + 56} {y - 38} "
                    f"C {x + 46} {y - 34}, {x + 42} {y - 15}, {x + 30} {y - 3}"
                ),
                polygon(((x + 42, y - 55), (x + 45, y - 69), (x + 54, y - 55))),
                circle(x + 56, y - 49, 2.2),
                path(f"M {x + 61} {y - 42} Q {x + 66} {y - 39} {x + 70} {y - 43}"),
                path(f"M {x - 29} {y - 7} Q {x - 51} {y - 28} {x - 48} {y + 1} Q {x - 43} {y + 17} {x - 31} {y + 10}"),
                path(f"M {x - 13} {y - 16} L {x + 13} {y - 16} L {x + 17} {y - 3} L {x - 10} {y - 3} Z"),
                path(f"M {x - 18} {y + 12} L {x - 22} {y + 42} L {x - 10} {y + 42}"),
                path(f"M {x + 17} {y + 12} L {x + 25} {y + 40} L {x + 36} {y + 40}"),
            )
        )
    pieces.append(bunting(132, 303, 480, depth=16, count=12))
    pieces.append(string_lights(119, 656, 493, 656, count=12))
    return "".join(pieces)


def big_slide_art() -> str:
    pieces: list[str] = [
        rect(84, 188, 124, 439, rx=3),
        line(84, 236, 208, 236),
        path("M 208 215 C 301 240 292 343 382 361 C 485 382 480 495 539 603"),
        path("M 208 271 C 263 290 260 387 355 407 C 444 426 428 537 492 623"),
        path("M 208 328 C 247 350 231 428 329 451 C 405 469 386 583 444 643"),
        line(444, 643, 539, 603),
    ]
    for y in range(260, 610, 34):
        pieces.append(line(104, y, 188, y))
    pieces.extend((line(104, 236, 104, 627), line(188, 236, 188, 627)))
    pieces.append(polygon(((70, 188), (146, 122), (222, 188))))
    pieces.append(bunting(88, 205, 204, depth=13, count=6))
    for index, y in enumerate((300, 383, 474, 560)):
        x = (286, 340, 409, 467)[index]
        pieces.append(person(x, y, 0.72))
        pieces.append(path(f"M {x - 12} {y + 23} Q {x:.2f} {y + 33:.2f} {x + 13} {y + 24}"))
    pieces.append(string_lights(52, 157, 560, 157, count=15))
    pieces.extend((cloud(340, 208, 0.75), star(490, 137, 8), star(281, 151, 5)))
    return "".join(pieces)


def barn_art() -> str:
    pieces: list[str] = [
        polygon(((81, 349), (306, 154), (531, 349))),
        rect(92, 349, 428, 297, rx=2),
        rect(238, 408, 136, 238, rx=2),
        path("M 238 408 L 374 646 M 374 408 L 238 646"),
        circle(306, 288, 34),
        line(272, 288, 340, 288),
        line(306, 254, 306, 322),
        rect(117, 417, 81, 72, rx=3),
        line(117, 453, 198, 453),
        line(157, 417, 157, 489),
        rect(414, 417, 81, 72, rx=3),
        line(414, 453, 495, 453),
        line(454, 417, 454, 489),
    ]
    # Cow in front of the barn.
    pieces.extend(
        (
            path("M 128 570 C 159 538 238 539 268 573 L 259 619 L 147 619 Z"),
            ellipse(111, 578, 32, 26),
            polygon(((87, 564), (72, 548), (91, 551))),
            polygon(((133, 564), (150, 548), (131, 550))),
            circle(101, 574, 3),
            circle(119, 574, 3),
            path("M 101 591 Q 110 598 120 591"),
            line(158, 618, 153, 657),
            line(235, 618, 240, 657),
            path("M 263 578 Q 287 563 281 544"),
        )
    )
    # Pig and rooster add large, friendly coloring shapes.
    pieces.extend(
        (
            ellipse(437, 595, 63, 36),
            circle(492, 588, 27),
            ellipse(510, 596, 13, 9),
            polygon(((476, 568), (477, 545), (493, 567))),
            path("M 373 590 Q 355 570 368 556 Q 380 546 384 561"),
            line(408, 628, 405, 657),
            line(471, 626, 476, 657),
            circle(488, 581, 2.7),
        )
    )
    pieces.append(string_lights(61, 702, 551, 702, count=15))
    return "".join(pieces)


def pumpkin(cx: float, cy: float, scale: float = 1.0) -> str:
    return group(
        (
            path(
                f"M {cx:.2f} {cy - 43 * scale:.2f} C {cx - 49 * scale:.2f} {cy - 52 * scale:.2f}, {cx - 70 * scale:.2f} {cy - 12 * scale:.2f}, {cx - 57 * scale:.2f} {cy + 36 * scale:.2f} "
                f"C {cx - 38 * scale:.2f} {cy + 61 * scale:.2f}, {cx + 38 * scale:.2f} {cy + 61 * scale:.2f}, {cx + 57 * scale:.2f} {cy + 36 * scale:.2f} "
                f"C {cx + 70 * scale:.2f} {cy - 12 * scale:.2f}, {cx + 49 * scale:.2f} {cy - 52 * scale:.2f}, {cx:.2f} {cy - 43 * scale:.2f} Z"
            ),
            path(f"M {cx:.2f} {cy - 42 * scale:.2f} C {cx - 21 * scale:.2f} {cy - 14 * scale:.2f}, {cx - 20 * scale:.2f} {cy + 29 * scale:.2f}, {cx:.2f} {cy + 51 * scale:.2f}"),
            path(f"M {cx:.2f} {cy - 42 * scale:.2f} C {cx + 21 * scale:.2f} {cy - 14 * scale:.2f}, {cx + 20 * scale:.2f} {cy + 29 * scale:.2f}, {cx:.2f} {cy + 51 * scale:.2f}"),
            path(f"M {cx - 5 * scale:.2f} {cy - 42 * scale:.2f} Q {cx - 4 * scale:.2f} {cy - 74 * scale:.2f} {cx + 16 * scale:.2f} {cy - 76 * scale:.2f}"),
            path(f"M {cx + 10 * scale:.2f} {cy - 66 * scale:.2f} Q {cx + 41 * scale:.2f} {cy - 74 * scale:.2f} {cx + 52 * scale:.2f} {cy - 54 * scale:.2f}"),
        )
    )


def sunflower(cx: float, cy: float, radius: float) -> str:
    pieces = [circle(cx, cy, radius * 0.32)]
    for index in range(12):
        angle = 2 * math.pi * index / 12
        px = cx + math.cos(angle) * radius * 0.67
        py = cy + math.sin(angle) * radius * 0.67
        pieces.append(ellipse(px, py, radius * 0.18, radius * 0.38, transform=f"rotate({index * 30 + 90} {px:.2f} {py:.2f})"))
    return group(pieces)


def ribbon(cx: float, cy: float, radius: float) -> str:
    scallop = []
    for index in range(16):
        angle = 2 * math.pi * index / 16
        r = radius if index % 2 == 0 else radius * 0.84
        scallop.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    return group(
        (
            polygon(scallop),
            circle(cx, cy, radius * 0.61),
            polygon(((cx - radius * 0.48, cy + radius * 0.48), (cx - radius * 0.72, cy + radius * 1.42), (cx - radius * 0.12, cy + radius * 1.05), (cx, cy + radius * 0.56))),
            polygon(((cx + radius * 0.48, cy + radius * 0.48), (cx + radius * 0.72, cy + radius * 1.42), (cx + radius * 0.12, cy + radius * 1.05), (cx, cy + radius * 0.56))),
            text(cx, cy + 8, "1", font_size=32, font_weight=900, text_anchor="middle", fill=INK, stroke="none"),
        )
    )


def harvest_art() -> str:
    pieces: list[str] = [ribbon(306, 270, 77), pumpkin(306, 546, 1.35)]
    pieces.extend((sunflower(125, 323, 74), sunflower(490, 326, 68)))
    pieces.extend(
        (
            path("M 125 376 Q 131 486 194 626"),
            path("M 490 374 Q 476 485 426 628"),
            path("M 150 440 Q 105 413 87 448 Q 121 472 151 460"),
            path("M 459 446 Q 507 412 529 450 Q 494 478 460 465"),
            path("M 166 501 Q 118 480 106 519 Q 145 536 174 520"),
            path("M 446 508 Q 495 482 508 522 Q 472 542 437 527"),
            bunting(62, 166, 550, depth=18, count=14),
            string_lights(68, 684, 544, 684, count=14),
        )
    )
    return "".join(pieces)


def food_cart(x: float, y: float, label: str, symbol: str) -> str:
    pieces = [
        rect(x, y + 66, 143, 180, rx=7),
        polygon(((x - 8, y + 66), (x + 72, y), (x + 151, y + 66))),
        rect(x + 16, y + 89, 111, 46, rx=4),
        text(x + 71.5, y + 119, label, font_size=12, font_weight=900, text_anchor="middle", fill=INK, stroke="none", letter_spacing=0.7),
        rect(x + 23, y + 153, 97, 55, rx=3),
        circle(x + 30, y + 257, 15),
        circle(x + 113, y + 257, 15),
    ]
    if symbol == "lemon":
        pieces.extend((circle(x + 72, y + 181, 18), path(f"M {x + 61} {y + 169} L {x + 83} {y + 193} M {x + 84} {y + 167} L {x + 60} {y + 194}")))
    elif symbol == "popcorn":
        pieces.extend((polygon(((x + 51, y + 200), (x + 44, y + 160), (x + 101, y + 160), (x + 94, y + 200))), circle(x + 57, y + 157, 9), circle(x + 73, y + 151, 11), circle(x + 91, y + 158, 9)))
    else:
        pieces.extend((line(x + 50, y + 197, x + 88, y + 160), ellipse(x + 91, y + 157, 10, 25, transform=f"rotate(40 {x + 91} {y + 157})"), path(f"M {x + 75} {y + 165} L {x + 101} {y + 151} M {x + 80} {y + 174} L {x + 106} {y + 160}")))
    return group(pieces)


def food_row_art() -> str:
    return "".join(
        (
            string_lights(44, 160, 568, 160, count=16),
            food_cart(48, 269, "LEMONADE", "lemon"),
            food_cart(235, 225, "POPCORN", "popcorn"),
            food_cart(422, 269, "CORN DOGS", "corn"),
            path("M 42 666 Q 306 622 570 666"),
            bunting(61, 665, 551, depth=17, count=14),
            star(84, 211, 8),
            star(306, 180, 10),
            star(529, 215, 8),
        )
    )


def grandstand_art() -> str:
    pieces: list[str] = [
        polygon(((72, 248), (306, 144), (540, 248))),
        rect(85, 248, 442, 313, rx=3),
        rect(112, 282, 78, 196, rx=5),
        rect(422, 282, 78, 196, rx=5),
        rect(212, 294, 188, 219, rx=4),
        path("M 212 390 Q 306 311 400 390"),
        line(306, 308, 306, 502),
        string_lights(105, 269, 507, 269, count=13),
    ]
    # Original guitar geometry, not an artist or event mark.
    pieces.extend(
        (
            ellipse(285, 426, 31, 43, transform="rotate(-18 285 426)"),
            ellipse(314, 375, 24, 33, transform="rotate(-18 314 375)"),
            circle(293, 409, 8),
            path("M 310 385 L 357 305 L 369 312 L 326 395 Z"),
            rect(358, 295, 29, 17, rx=3, transform="rotate(29 372 303)"),
        )
    )
    for index, x in enumerate(range(72, 557, 35)):
        y = 643 + (index % 3) * 9
        pieces.append(circle(x, y - 20, 10))
        pieces.append(path(f"M {x - 15} {y + 22} Q {x} {y - 3} {x + 15} {y + 22}"))
    pieces.extend(star(x, y, size) for x, y, size in ((95, 171, 8), (159, 203, 5), (456, 194, 6), (520, 161, 9), (306, 153, 6)))
    pieces.append(path("M 53 704 Q 306 663 559 704"))
    return "".join(pieces)


def tractor_art() -> str:
    pieces: list[str] = [
        circle(211, 568, 78),
        circle(211, 568, 38),
        circle(438, 591, 51),
        circle(438, 591, 23),
        path("M 180 505 L 237 410 L 363 410 L 397 532 L 468 550 L 480 608 L 260 608"),
        rect(262, 325, 100, 91, rx=4),
        rect(278, 341, 68, 54, rx=2),
        line(262, 325, 244, 296),
        line(362, 325, 382, 296),
        line(239, 296, 388, 296),
        rect(392, 405, 24, 115, rx=4),
        path("M 416 417 Q 447 432 442 457"),
        rect(352, 381, 47, 29, rx=4),
        line(330, 410, 350, 484),
        circle(349, 490, 22),
        line(319, 490, 378, 490),
    ]
    pieces.extend(
        (
            path("M 44 659 Q 145 585 260 649 Q 365 691 569 632"),
            path("M 42 687 Q 179 636 297 682 Q 423 716 570 668"),
            rect(68, 532, 80, 66, rx=9),
            path("M 68 554 Q 108 532 148 554 M 68 576 Q 108 554 148 576"),
            cloud(71, 213, 1.05),
            cloud(431, 240, 0.8),
            path("M 501 337 L 501 243 L 546 243 L 546 366"),
            polygon(((487, 243), (524, 192), (560, 243))),
            line(523, 192, 523, 168),
            path("M 523 168 Q 534 177 545 168"),
            bunting(65, 164, 547, depth=17, count=14),
        )
    )
    return "".join(pieces)


def maze_art() -> str:
    # A deterministic 15 x 19 perfect maze built from a fixed depth-first order.
    cols, rows = 15, 19
    cell = 27
    left, top = 103, 152
    visited = {(0, 0)}
    stack = [(0, 0)]
    openings: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    direction_order = ((1, 0), (0, 1), (-1, 0), (0, -1))
    randomizer = random.Random(20240915)
    while stack:
        x, y = stack[-1]
        candidates = []
        directions = list(direction_order)
        randomizer.shuffle(directions)
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            if 0 <= nx < cols and 0 <= ny < rows and (nx, ny) not in visited:
                candidates.append((nx, ny))
        if not candidates:
            stack.pop()
            continue
        nx, ny = candidates[0]
        a, b = (x, y), (nx, ny)
        openings.add((min(a, b), max(a, b)))
        visited.add((nx, ny))
        stack.append((nx, ny))

    walls: list[str] = []
    for y in range(rows):
        for x in range(cols):
            x0, y0 = left + x * cell, top + y * cell
            if y == 0:
                if x != 0:
                    walls.append(line(x0, y0, x0 + cell, y0))
            elif ((x, y - 1), (x, y)) not in openings:
                walls.append(line(x0, y0, x0 + cell, y0))
            if x == 0:
                walls.append(line(x0, y0, x0, y0 + cell))
            elif ((x - 1, y), (x, y)) not in openings:
                walls.append(line(x0, y0, x0, y0 + cell))
            if x == cols - 1:
                if y != rows - 1:
                    walls.append(line(x0 + cell, y0, x0 + cell, y0 + cell))
            if y == rows - 1:
                walls.append(line(x0, y0 + cell, x0 + cell, y0 + cell))

    return "".join(
        (
            group(walls, stroke_width=2.8),
            text(left + 2, top - 12, "START AT THE GATE", font_size=9, font_weight=800, fill=INK, stroke="none"),
            text(left + cols * cell, top + rows * cell + 22, "WHEEL", font_size=9, font_weight=800, text_anchor="end", fill=INK, stroke="none"),
            polygon(((left + 3, top + 14), (left + 15, top + 3), (left + 27, top + 14))),
            wheel(left + cols * cell - 22, top + rows * cell + 2, 18, cabins=8),
            bunting(62, 695, 550, depth=15, count=14),
        )
    )


def closing_art() -> str:
    pieces: list[str] = [
        text(306, 68, "YOU COLORED FREDERICK", font_size=10, font_weight=800, text_anchor="middle", letter_spacing=1.8, fill=INK, stroke="none"),
        text(306, 113, "Keep the fair night going.", font_size=31, font_weight=900, text_anchor="middle", fill=INK, stroke="none"),
        text(306, 139, "Draw the moment you want to remember in the frame below.", font_size=10.5, font_weight=500, text_anchor="middle", fill=INK, stroke="none"),
        rect(62, 173, 488, 356, rx=18, stroke_width=3),
        path("M 79 190 H 533 V 512 H 79 Z", stroke_dasharray="8 9", stroke_width=1.3),
        bunting(88, 202, 524, depth=17, count=13),
        star(112, 482, 13),
        star(500, 482, 13),
        text(306, 570, "MY FAVORITE PART WAS", font_size=9, font_weight=800, text_anchor="middle", letter_spacing=1.4, fill=INK, stroke="none"),
        line(103, 605, 509, 605),
        line(103, 637, 509, 637),
        text(306, 691, "More Frederick scenes to color: colorfrederick.com", font_size=11, font_weight=800, text_anchor="middle", fill=BRICK, stroke="none"),
        text(306, 716, "Made by Frederick Radius from original drawings inspired by Mike D's own photographs.", font_size=7.5, font_weight=500, text_anchor="middle", fill=INK, stroke="none"),
        text(306, 735, "This independent activity book is not affiliated with or endorsed by The Great Frederick Fair.", font_size=7.2, font_weight=500, text_anchor="middle", fill=INK, stroke="none"),
        text(306, 760, "FREDERICK COUNTY STARTS WHERE YOU ARE.", font_size=7.5, font_weight=800, text_anchor="middle", letter_spacing=1.2, fill=INK, stroke="none"),
    ]
    return "".join(pieces)


def pages() -> list[Page]:
    return [
        Page("01-cover", "Fair Nights: A Frederick Coloring Book", "Free to print and color.", cover_art(), is_cover=True),
        Page("02-midway-from-above", "Midway From Above", "Color the paths, tents, lights, and the giant wheel.", aerial_midway_art()),
        Page("03-ferris-wheel-lights", "Ferris Wheel Lights", "Give every cabin and string of lights its own color.", ferris_wheel_art()),
        Page("04-carousel-night", "Carousel Night", "Color the canopy, horses, and lights around the ride.", carousel_art()),
        Page("05-the-big-slide", "The Big Slide", "Choose a different color for every lane.", big_slide_art()),
        Page("06-barn-morning", "Barn Morning", "Bring the barn and its fair-day animals to life.", barn_art()),
        Page("07-blue-ribbon-harvest", "Blue-Ribbon Harvest", "Color a prize-winning Frederick County harvest.", harvest_art()),
        Page("08-fair-food-row", "Fair Food Row", "Make the signs, snacks, and string lights your own.", food_row_art()),
        Page("09-grandstand-stars", "Grandstand Under the Stars", "Color the stage before the music begins.", grandstand_art()),
        Page("10-tractor-day", "Tractor Day", "Color the tractor, barn, hay, and rolling hills.", tractor_art()),
        Page("11-fairgrounds-maze", "Find the Ferris Wheel", "Start at the gate and trace a path through the fairgrounds.", maze_art()),
        Page("12-keep-coloring", "Keep the Fair Night Going", "Draw the moment you want to remember.", closing_art(), is_closing=True),
    ]


def validate_inputs() -> None:
    missing = [path for path in PHOTO_REFERENCES if not (ROOT / path).is_file()]
    if missing:
        raise SystemExit("Missing Mike-owned photo references: " + ", ".join(missing))
    about_page = (ROOT / "src" / "app" / "(app)" / "about" / "page.tsx").read_text(encoding="utf-8")
    if STORE_URL not in about_page:
        raise SystemExit(f"Refusing to invent or drift the store URL. {STORE_URL} is not in the About page.")
    for tool in ("rsvg-convert", "pdfunite"):
        if shutil.which(tool) is None:
            raise SystemExit(f"Required PDF tool is missing: {tool}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(page_files: list[Path]) -> None:
    data = {
        "title": "Fair Nights: A Frederick Coloring Book",
        "pageCount": len(page_files),
        "pageSize": "US Letter, 8.5 x 11 inches",
        "publicDownload": "/downloads/fair-nights-frederick-coloring-book.pdf",
        "moreColoringPages": STORE_URL,
        "artworkBoundary": "Original vector geometry inspired only by Mike D-owned 2024 Fair photographs; no official Fair or vendor artwork.",
        "photoReferences": [
            {"path": path, "sha256": sha256(ROOT / path)} for path in PHOTO_REFERENCES
        ],
        "pdf": {"path": str(OUTPUT_PDF.relative_to(ROOT)), "sha256": sha256(OUTPUT_PDF)},
        "pages": [
            {"path": str(page.relative_to(ROOT)), "sha256": sha256(page)} for page in page_files
        ],
    }
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def finish_pdf(path_to_pdf: Path) -> None:
    """Add stable metadata and one unobtrusive clickable store handoff."""
    try:
        from pypdf import PdfReader, PdfWriter
        from pypdf.annotations import Link
    except ImportError as error:
        raise SystemExit(
            "pypdf is required to add the closing-page Color Frederick link. "
            "Install it with `python3 -m pip install pypdf`."
        ) from error

    reader = PdfReader(path_to_pdf)
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.add_metadata(
        {
            "/Title": "Fair Nights: A Frederick Coloring Book",
            "/Author": "Frederick Radius",
            "/Subject": "A free, print-at-home Frederick fair coloring and activity book",
            "/Keywords": "Frederick Maryland coloring book fair family activity",
            "/Creator": "Frederick Radius vector coloring-book generator",
        }
    )
    # SVG coordinates start at the top. PDF annotation coordinates start at
    # the bottom, so this rectangle surrounds the visible closing-page CTA at
    # SVG y=691 without creating a larger or repeated promotional hotspot.
    writer.add_annotation(
        page_number=len(reader.pages) - 1,
        annotation=Link(rect=(139, 88, 473, 116), url=STORE_URL),
    )
    linked_pdf = TMP_DIR / "fair-nights-linked.pdf"
    with linked_pdf.open("wb") as stream:
        writer.write(stream)
    shutil.copy2(linked_pdf, path_to_pdf)


def build() -> None:
    validate_inputs()
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_PDF.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_COVER.parent.mkdir(parents=True, exist_ok=True)

    page_files: list[Path] = []
    pdf_pages: list[Path] = []
    for page_number, page in enumerate(pages(), start=1):
        svg_path = SVG_DIR / f"{page.slug}.svg"
        svg_path.write_text(page_shell(page, page_number), encoding="utf-8")
        page_files.append(svg_path)

        pdf_path = TMP_DIR / f"{page.slug}.pdf"
        subprocess.run(
            ["rsvg-convert", "--format=pdf", f"--output={pdf_path}", str(svg_path)],
            cwd=ROOT,
            check=True,
        )
        pdf_pages.append(pdf_path)

    subprocess.run(["pdfunite", *map(str, pdf_pages), str(OUTPUT_PDF)], cwd=ROOT, check=True)
    finish_pdf(OUTPUT_PDF)
    shutil.copy2(OUTPUT_PDF, PUBLIC_PDF)
    shutil.copy2(page_files[0], PUBLIC_COVER)
    write_manifest(page_files)

    print(f"Built {len(page_files)} vector pages")
    print(f"PDF: {OUTPUT_PDF}")
    print(f"Public download: {PUBLIC_PDF}")
    print(f"Cover preview: {PUBLIC_COVER}")
    print(f"Manifest: {MANIFEST}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()


if __name__ == "__main__":
    main()
