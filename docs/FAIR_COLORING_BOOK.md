# Fair Nights coloring book

`Fair Nights: A Frederick Coloring Book` is a free, print-at-home activity from
Frederick Radius. The first edition contains 12 US Letter pages: a cover, ten
coloring and activity pages, and a closing drawing page.

## Rights and source boundary

The drawings are original vector geometry informed only by Mike D's own 2024
fairground photographs listed in `docs/FAIR_DAY_PHOTOGRAPHY.md`. The book does
not copy or trace The Great Frederick Fair's official logo, posters, map, ticket
art, vendor branding, or another illustrator's work. A short line on the last
page says that the independent activity book is not affiliated with or endorsed
by The Great Frederick Fair.

The photographs are atmosphere references only. Nothing drawn from them is
presented as a current map, ride placement, vendor list, or operational claim.

## Build

Run:

```sh
python3 scripts/generate-fair-coloring-book.py
```

The generator requires `rsvg-convert`, `pdfunite`, and the Python `fonttools`
and `pypdf` packages. Public Sans is converted from the checked-in font files to
vector outlines, so the artwork does not rely on fonts installed on the user's
computer. `pdfinfo` and `pdftoppm` are used for the complete visual-review
workflow. The build does not alter or move the photograph originals.

Generated files:

- `output/pdf/fair-nights-frederick-coloring-book.pdf`
- `output/pdf/fair-nights-coloring-book-svg/*.svg`
- `output/pdf/fair-nights-frederick-coloring-book-manifest.json`
- `public/downloads/fair-nights-frederick-coloring-book.pdf`
- `public/images/fair/fair-nights-coloring-book-cover.svg`

The `output/pdf` directory is local review evidence. The public PDF and cover
are the stable site assets.

## Quiet Color Frederick bridge

The closing page includes one small line: `More Frederick scenes to color:
colorfrederick.com`. It is a clickable PDF link and remains plainly readable on
a printed copy. It is not repeated on the coloring pages. The URL is not
guessed. The generator verifies the existing `https://www.colorfrederick.com`
destination already used by the Frederick Radius About page before it will
build.

## Print and visual checks

Before publishing a new edition:

1. Confirm the PDF has exactly 12 pages at 612 x 792 points, or 8.5 x 11 inches.
2. Run `pdfimages -list` and confirm no raster image objects appear. The book is
   intended to remain vector-only.
3. Render every page with `pdftoppm -png` and inspect the contact sheet and full
   pages for clipping, weak lines, broken text, accidental fills, and margins.
4. Print at 100 percent scale on a normal home printer. Do not use fit-to-page
   unless the printer cannot respect the 0.5-inch safe area.
5. Recheck that the public download and subtle Color Frederick URL work before
   promoting the book.
