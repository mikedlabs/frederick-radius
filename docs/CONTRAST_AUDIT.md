# Color-contrast audit (WCAG 2.1 AA)

> **Current rules:** the contrast rules and ratios for today's tokens live in
> the "Contrast" section of [`docs/STYLE.md`](STYLE.md), re-measured on
> 2026-10-08. This page is the record of the July 2026 pass. Its figures were
> measured against a palette that has since been retired, so do not apply
> them to the current tokens.

## July 2026 pass (history)

Prompted by an external review flag: "light type on colored backgrounds
may not meet strict WCAG contrast ratios." Every foreground/background
pair the app actually renders was measured against the real token values
in `globals.css` (relative-luminance formula; thresholds: 4.5:1 normal
text, 3:1 icons/UI/large text). Script lived in scratch; values below.

### Fixed then (were sub-AA as small text / icons on cream)

| Pair | Before | After | Fix |
|---|---|---|---|
| `warning` as TEXT on cream | 3.26 | **4.66** | new `--app-warning-press #8F5600`; swapped the text usages (PlanBuilder open-labels, PreferencesPanel reset, OSM popup "Unverified" line) |
| `accent` as small text / icon on cream | 2.42 | **4.57** | swapped to `accent-press` (PlaceCard "rated" chip, FromAboveCta eyebrow, BusinessExtrasCard icon) |

At the time `--app-accent` was a gold and `--app-warning` measured 3.26:1 on
cream. Both tokens have changed since: `--app-accent` is now Plum and passes
as text, and `--app-warning` is now `#925E16`, which is text-safe on Cream.
A row recording the old gold `accent-press` hex was removed on 2026-10-08
because it described a token that no longer means gold.

The "verified already-passing" list from this pass measured older ink, brand
and fill values. Its current equivalent is the table in `docs/STYLE.md`.

## Removed on 2026-10-08: the vermilion eyebrow exception

This page used to record an "accepted brand exception" (owner decision,
2026-07-02) that kept 10 px uppercase eyebrows in vermilion `#E14328` at
3.24:1 on cream. Its premise is gone. Vermilion was retired, Brick `#B5462B`
measures 4.69:1 on Cream, and the eyebrows it covered now use
`--app-brand-press`, which `tests/design/brand-text-contrast.spec.ts`
enforces for small text. Nothing licenses small text below 4.5:1.
