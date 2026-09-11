# Color-contrast audit (WCAG 2.1 AA)

Prompted by an external review flag: "light type on colored backgrounds
may not meet strict WCAG contrast ratios." Every foreground/background
pair the app actually renders was measured against the real token values
in `globals.css` (relative-luminance formula; thresholds: 4.5:1 normal
text, 3:1 icons/UI/large text). Script lived in scratch; values below.

## Fixed (were sub-AA as small text / icons on cream)

| Pair | Before | After | Fix |
|---|---|---|---|
| `accent-press` on paper | 4.42 | **4.57** | token darkened `#8A5E10 → #875C10` (it was labeled "AA 4.5:1+" but computed 4.42 — a latent bug) |
| `warning` as TEXT on cream | 3.26 | **4.66** | new `--app-warning-press #8F5600`; swapped the text usages (PlanBuilder open-labels, PreferencesPanel reset, OSM popup "Unverified" line) |
| `accent` as small text / icon on cream | 2.42 | **4.57** | swapped to `accent-press` (PlaceCard "rated" chip, FromAboveCta eyebrow, BusinessExtrasCard icon) |

`--app-warning` (3.26) is **kept as-is for FILLS and ICONS** — it clears the
3:1 icon/UI bar (ErrorBoundary, HoursBlock, NextTrainBoard, FreshnessChip
all use it as an icon, and FreshnessChip's stale text is already `ink-2`).
Only genuine *text* usages moved to `warning-press`.

## Verified already-passing (no change)

- All ink tones on all three cream grounds (`ink` 14.3, `ink-2` 8.3,
  `ink-3` 5.4 on paper; `ink-3` on sunken 4.77 — the tightest, still AA).
- `brand-press` (4.80), `cool` (6.74), `positive` (5.06), `danger` (5.09),
  `civic` (6.58) as text on cream.
- White (`on-brand`) on the solid fills used for buttons/badges: `brand`
  4.03, `warning` 4.06, `accent` 3.02, `sage` 3.25 — all ≥3:1, and those
  fills only carry **large/bold** button + badge text (≥14px semibold),
  which AA scores at the 3:1 large-text bar. `cool` (8.4), `danger` (6.3),
  `positive` (6.3), `brand-2` (12.9), `civic` (8.2) pass outright.
- `sage` and `cool-2` appear only in decorative `PageBloom` gradients
  (opacity 0.3–0.5), never as text.

## Accepted brand exception — vermilion micro-eyebrows

The 10px uppercase brand-colored eyebrow labels ("FIELD NOTES", "From
above", category kickers in ~12 components) measure **3.24:1** on cream —
under the 4.5:1 small-text bar. Kept as `--app-brand` vermilion by owner
decision (2026-07-02):

- Signal vermilion is the brand's load-bearing color (brand deck +
  CLAUDE.md); darkening to `brand-press` brick dulls the one thing that
  makes the app not read as a generic template.
- These eyebrows are **supplementary** — each sits directly above a
  high-contrast ink heading and never conveys information alone, so no
  user relies on reading the eyebrow itself (WCAG's intent is preserved
  even where the strict 4.5 ratio isn't).
- They clear the 3:1 graphical/large bar.

If a future strict-AA pass is required, the mechanical fix is `--app-brand
→ --app-brand-press` on those text usages only (leave fills/icons alone).
