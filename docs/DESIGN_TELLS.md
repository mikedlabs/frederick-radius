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
- `/proto` and its prototype components. Production already blocks these
  routes.
- `/admin` and its operational components. These tools are private and do not
  define the customer-facing brand.
- The legacy pitch token block inside `globals.css`. The rest of that shared
  stylesheet remains in the public scan.

The all-surfaces command keeps those findings visible. It is the correct scan
before making `/pitch`, a prototype, or an admin tool public.

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

Run `npm run scan:devibe` for the current counts; this page does not record
them, because dated counts here went stale within weeks. The shipping bar is
zero high findings in the public product. CI does not run this scan, so the
checklist below is where that bar is held. Medium and low findings are a
review list, not a pass mark, and most of the medium debt is oversized
rounding and capsules.

Zero high findings means the public product avoids the loudest stock defaults.
It does not mean the visual system is done. Repeated pills, generic cards, and
routine entrance motion can still make a page feel assembled from a template.

## Frederick Radius surface rules

The product should read like a field guide, not a stack of floating SaaS cards.

- Cream paper is the normal canvas. Use rules, spacing, type, and registration
  marks to establish hierarchy before adding another container.
- Utility controls use a 6 to 8 pixel corner. Cards use 10 to 12 pixels. Large
  panels and sheets sit near 16 pixels. Use the closest named radius token.
- Full capsules are reserved for status, toggles, and compact filters. A normal
  action, navigation item, content card, or source row should not be a pill.
- Shadows indicate a real layer such as a menu or sheet. Routine content stays
  flat. Decorative glows are not part of the public product.
- A missing photo falls down the image ladder in `docs/VISUAL_FIRST.md`. Do
  not simulate a photo with random gradients, generated textures, initials or
  seed artwork.
- Motion should explain a state change or spatial relationship. A repeated
  fade-in, hover-grow, or shimmer is not polish by itself.
- Real Frederick photography, the Radius ripple, local map language, and clear
  source attribution carry the identity. Do not replace them with stock blobs
  or generic illustration packs.

## What the high-signal scan already protects

- The public palette does not use violet, indigo, or purple as its primary
  product color.
- Headlines use solid ink instead of gradient-filled text.
- Libre Caslon Display and Public Sans are the named type of the Frederick
  Radius Brand System, not untouched library defaults.
- Brick, Cream, Ink, Forest, Creek, Plum, and Ochre come from the Radius brand
  tokens.
- User-facing icons use the established SVG system instead of emoji.

## Shipping checklist

- [ ] Run `npm run scan:devibe` and fix every new high finding.
- [ ] Review new medium findings in the browser instead of dismissing the raw count.
- [ ] Check that each container has a job. Remove the box if spacing or a rule can do it.
- [ ] Check shape by role. Pills are for status, toggles, and compact filters only.
- [ ] Check every image slot against the VISUAL_FIRST ladder. No fallback carries text inside the image or impersonates a photograph.
- [ ] Check motion with reduced motion enabled.
- [ ] Run the all-surfaces scan before changing the visibility of any excluded route.

Use an `unslop-ignore` comment only when the line is deliberate and its reason
is obvious beside the code. Do not use suppressions to make the report smaller.
