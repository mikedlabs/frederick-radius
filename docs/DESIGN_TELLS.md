# Design tells audit for Frederick Radius

This audit looks for common signs of a stock AI-generated interface. The rule
set began with
[JCarterJohnson/vibecoded-design-tells](https://github.com/JCarterJohnson/vibecoded-design-tells),
but the decision standard is specific to Frederick Radius: a useful local field
guide with its own type, palette, information structure, photography, and map.

The scanner is a pressure map. It does not decide whether a design is good.
Every finding still needs a visual review in the browser.

## Scan the right surface

```sh
npm run scan:devibe       # public product, the normal review
npm run scan:devibe:all   # public product plus private and experimental surfaces
```

The public scan excludes the following separate surfaces:

- `/pitch` and its marketing-only components and helpers.
- `/admin` and its operational components. These tools are private and do not
  define the customer-facing brand.
- The legacy pitch token block inside `globals.css`. The rest of that shared
  stylesheet remains in the public scan.

The all-surfaces command keeps those findings visible. It is the correct scan
before making `/pitch` or an admin tool public.

Useful direct commands are:

```sh
python3 scripts/devibe_scan.py src --severity high
python3 scripts/devibe_scan.py src --surface all --severity high
python3 scripts/devibe_scan.py src --json
```

The JSON flag now emits a real machine-readable report. The process exits with
the number of high-severity findings, capped at 255. Medium and low findings do
not fail the command.

## Current baseline

> **Note, November 10, 2026.** The interface update the owner approved on
> November 10, 2026 shrinks the radius tokens to 4, 6, 8 and 10px, keeps full
> capsules only on compact filter chips, status badges and toggle switches,
> and resolves the lower shadow tiers to transparent. It removes most of the
> capsule and rounding tells counted below. The baseline below was taken
> before that update and is being regenerated; do not quote its counts as
> current.

The November 10, 2026 public-product scan, taken with the UI defect pass
(#1945) applied, covered 2,510 files and excluded 85 files that belong to the
separate surfaces above. Without that pass the same scan reports 348 medium
findings across 2,494 files.

| Signal | Public product | All surfaces | Reading |
|---|---:|---:|---|
| High | 0 | 30 | Violet gradients and gradient text remain isolated to the internal pitch world. |
| Medium | 343 | Not the release gate | The main debt is 330 uses of oversized rounding or capsules, 55 of them in `globals.css` (52 `border-radius: 999px` rules and 3 `border-radius: 9999px` rules). The rest are 7 glow shadows, 5 routine motion patterns and 1 emoji. This is real repetition, not a reason to call the product finished. |
| Low | 1 | Not the release gate | One source-owned sentence matches a generic-copy expression. Review its provenance before changing it. |

Between October 12 and November 10 this scan skipped almost all of
`globals.css`, because the end marker of the excluded pitch block had been
deleted and the exclusion ran to the end of the file. Counts recorded in that
window understate the stylesheet. The scanner now exits with an error when a
start marker has no end marker.

Zero high findings means the public product avoids the loudest stock defaults.
It does not mean the visual system is done. Repeated pills, generic cards, and
routine entrance motion can still make a page feel assembled from a template.

## Frederick Radius surface rules

The product should read like a field guide, not a stack of floating SaaS cards.

- White is the normal canvas and soft gray is the inset surface (`--app-bg`
  and `--app-bg-sunken`). Dark appearance uses its own canvas and surface
  tokens. Content is rows on the canvas separated by a hairline or space.
  Use rules, spacing, and type to establish hierarchy before adding a
  container, and do not put a card around ordinary content.
- Use the named radius tokens from `src/app/globals.css` (`--app-radius-sm`
  4px, `--app-radius-md` 6px, `--app-radius-lg` 8px, `--app-radius-xl` 10px)
  instead of a hand-set pixel value. Match the nearest shared primitive:
  `Button`, fields, and the `SortDropdown` trigger and menu use
  `--app-radius-md`; `BottomSheet` and `BottomDrawer` use `--app-radius-lg`
  at their top corners; `Row` and `EmptyState` have no box and no radius.
- Full capsules are reserved for compact filter chips, status badges, and
  toggle switches. A normal action, navigation item, row, source line, or
  informational tag should not be a pill. An informational tag is plain text.
- Shadows indicate a real layer such as a menu or sheet. Routine content stays
  flat. Decorative glows are not part of the public product.
- A row without a real photograph shows a plain category glyph in muted ink,
  not a gray or coral-tinted icon tile.
- Missing photography is labeled honestly. Do not simulate a photo with random
  gradients, generated textures, arbitrary initials, or seed-based artwork.
- Motion should explain a state change or spatial relationship. A repeated
  fade-in, hover-grow, or shimmer is not polish by itself.
- Real Frederick photography, the Radius ripple, local map language, and clear
  source attribution carry the identity. Do not replace them with stock blobs
  or generic illustration packs.

## What the high-signal scan already protects

- The public palette does not use violet, indigo, or purple as its primary
  product color.
- Headlines use solid ink instead of gradient-filled text.
- Product UI uses the System sans stack defined in `src/lib/brand.ts`. This is
  the approved Brand System 1.4 choice, so do not replace it with a downloaded
  typeface. Libre Caslon Display Regular is limited to the wordmark and a
  rare editorial signature on a few specialty guide pages. It never appears
  on Today, Map, Events, Saved, Find, Tools, Settings, Ask, place pages or
  event pages. Public Sans is the print and export family.
- Deep Coral, White, Charcoal, Catoctin Forest, Creek, Plum, and Ochre Amber
  come from the Radius brand tokens in `src/lib/brand.ts`. The `brick`,
  `cream`, and `ink` keys are compatibility names for Deep Coral, White, and
  Charcoal.
- User-facing icons use the established SVG system instead of emoji.

## Shipping checklist

- [ ] Run `npm run scan:devibe` and fix every new high finding.
- [ ] Review new medium findings in the browser instead of dismissing the raw count.
- [ ] Check that each container has a job. Remove the box if spacing or a rule can do it.
- [ ] Check shape by role. Pills are for status, toggles, and compact filters only.
- [ ] Check every placeholder. It must state that imagery is missing and must not impersonate a real photograph.
- [ ] Check motion with reduced motion enabled.
- [ ] Run the all-surfaces scan before changing the visibility of any excluded route.

Use an `unslop-ignore` comment only when the line is deliberate and its reason
is obvious beside the code. Do not use suppressions to make the report smaller.
