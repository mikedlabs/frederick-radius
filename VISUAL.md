# VISUAL.md — Premium visual spec

Companion to `STYLE.md`. STYLE.md governs every UI **string**; this
governs every UI **surface**. It is the single source of truth for how
Frederick Radius looks and how data is composed. It is enforced in PR
review: a surface that cannot pass this checklist does not ship.

The product is a sharp local instrument that happens to be beautiful.
Premium here means **bespoke, restrained, coherent, and physical** —
never a generic component kit, never decoration for its own sake. We
already own a complete design system (System Black v2). The job is to
apply it identically everywhere, not to invent more of it.

Mobile is the primary target. Every rule below is written phone-first;
desktop is the same system with more room.

---

## 1. The non-negotiables (the seven pillars)

1. **One system, zero drift.** Every screen uses the same type scale,
   spacing rhythm, surfaces, radii, and motion tokens. Inconsistency is
   the single biggest "unfinished" tell. No ad-hoc `text-[28px]`,
   no one-off shadows, no bespoke radii. Tokens only.
2. **One focal point per screen.** Exactly one element is large and
   confident (the hero / the answer). Everything else is quiet support.
   If two things shout, neither reads as premium.
3. **Disciplined density.** Tight, intentional spacing — the validated
   lever for this product (density, not more color). No element floats
   in dead space; nothing is cramped. Rhythm is consistent and tokened.
4. **Imagery, treated as a system.** Real photos only, one aspect ratio
   per context, one scrim treatment. A photo-less item NEVER shows an
   empty media box — it gets a composed typographic / identity block.
5. **Data composed per type, never dumped.** A place, an event, a
   metric, a civic alert each have a *designed* anatomy with hierarchy.
   A row of raw fields is a bug, not a layout.
6. **Motion is finish, not decoration.** Only the tokenized entrance
   (`.stagger`) and press/lift (`.tactile-interactive`, spring) — applied
   consistently, never gratuitous. Reduced-motion is already honored
   (durations zero in that mode); never reintroduce raw transitions that
   bypass the tokens.
7. **Depth and material.** Content sits on `.tactile` surfaces; overlays
   and controls use glass. The app should feel made, not drawn.

---

## 2. Tokens — the only allowed values

Defined in `src/app/globals.css`. Hard-coded values that duplicate a
token are a review failure.

- **Color (semantic, not decorative).** `--app-brand` (#C4451C, brick)
  is for brand chrome + the single primary CTA on a screen, used
  sparingly. `--app-cool` (#2A5D8F) = civic / transit / info / verified
  / save. `--app-positive` / `--app-warning` = status only. Ink scale:
  `--app-ink` (titles), `--app-ink-2` (body), `--app-ink-3` (meta;
  WCAG-AA floor — never go lighter for real text). Surfaces:
  `--app-bg`, `--app-bg-elevated`, `--app-bg-sunken`. A screen should
  read in ink + one accent; if it needs three accents to make sense,
  the hierarchy is wrong, not the palette.
- **Type.** Headlines: `.display-1` (flagship page header), `.display-2`
  (section / result header). Kicker: `.eyebrow` above every page and
  major section header. Body never exceeds the fluid clamps; long text
  gets `.text-pretty`, headers `.text-balance` (already in `.display-*`).
- **Radius.** `--app-radius-sm|md|lg|xl`. Cards = `lg`, pills/chips =
  full, panels/sheets = `xl`. Never a raw `rounded-[14px]`.
- **Elevation.** `.tactile` (rest), `.tactile-e2/3/4` (raise the
  ambient layer for sheets/popovers/modals), `.tactile-interactive`
  (spring lift + crisp press for anything tappable), `.tactile-lift`
  (filled controls). Never a bare `shadow-[...]` for content.
- **Motion.** `.stagger` on the first list/section of a screen for the
  entrance cascade. Press physics come from `.tactile-interactive` or
  `transition ... [transition-timing-function:var(--app-ease-spring)]`
  with `active:scale-[0.94–0.99]`. Durations: `--app-dur-fast|med`.

---

## 3. Page anatomy (the template every page follows)

Top to bottom, every primary page:

1. **Eyebrow** (`.eyebrow`) — one short orienting line.
2. **Headline** — `.display-1` (page) with optional one-line
   `--app-ink-3` subtitle (`.text-pretty`). A page-level action, if
   any, sits beside it and `shrink-0`; on phones the header is
   `flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`.
3. **The focal element** — the single most important thing on the
   page, given the most visual weight (a hero card, the primary
   result, the map). One per page.
4. **Composed sections** — each introduced by `.display-2` + a count or
   meta on the right, content below on the per-type anatomy from §4.
5. **Footnote / provenance** — quiet `--app-ink-3` on `--app-bg-sunken`.

Vertical rhythm between modules: one consistent spacing step
(`space-y-4` on the primary container is the current baseline; never
mix `space-y-6` and `space-y-3` siblings on the same page).

---

## 4. Data composition — anatomy per type

The highest-leverage rule in this doc. Each datum is a composition.

- **Place card** — photo (or identity block) at one ratio + scrim;
  category eyebrow; name (`--app-ink`, serif/tight); ONE signal line
  (open status · distance · one fact); actions as tactile pills.
  Photo-less → category-tinted typographic block, never grey.
- **Event card** — date anchor (month/day, photo-backed when available
  with scrim, else category-tinted); title (clamp 2); one meta line
  (time · venue); category Chip + Free/price + trust + distance. One
  uniform shape so a grid is scannable.
- **Metric / stat** — big tabular number (`.display-2`-ish, `tabular`),
  quiet label above as `.eyebrow`, optional sparkline/delta. Never a
  sentence where a number belongs.
- **List row** — left identity (icon-in-tinted-circle OR date OR
  thumbnail), title + one meta line, right-aligned single value/affordance.
  Consistent 1 / 2-line height across the list.
- **Civic / live alert** — colored status dot, one-line statement, time.
  Only renders when something is actually true. Never a wrong category.
- **Hub / nav tile** — icon in semantic-tinted circle, label + one
  desc line, count Chip only when > 0. Grid of equal tiles, `.stagger`.
- **Empty state** — composed, not a sentence: a soft tinted icon
  circle, a serif line, one quiet sentence of what to do. Never a bare
  dashed box with text.
- **Loading** — a shimmer of the SAME shape it replaces (`Shimmer*`),
  never a spinner-in-a-box, never layout shift on resolve.

---

## 5. Mobile rules

- Tap targets ≥ 44px. Primary actions reachable in the thumb zone.
- No hidden horizontal scroll for primary navigation/filters — wrap, or
  use an explicit "more" affordance. (Chip rails wrap.)
- One column by default; `sm:`/`lg:` add columns. Content never edge-to-
  edge with the viewport — consistent gutter.
- The single primary CTA per screen is full-width and unmistakable
  (brand gradient, `.tactile-lift`, spring press).
- Test every surface at 390px width before it ships.

---

## 6. Primitives — use these, do not reinvent

`src/components/ui`: `Surface` (the card), `Chip`, `Button`,
`SectionHeading`, `Shelf`, `FilterChip`, `TrustChip`, `LiveDot`,
`FadeUp`, `Shimmer`, `TapButton`. Build new surfaces from these.

`gradient-text` / `glass-card` / `animated-button` are the **marketing
site** language (neon, framer-motion). They are correct on marketing
scenes and **forbidden in the app** — they break the System Black feel.

---

## 7. Per-surface ship checklist

A surface PR must answer yes to all:

- [ ] Eyebrow + `.display-*` header; exactly one focal element.
- [ ] Only tokens (color/type/radius/elevation/motion); zero ad-hoc values.
- [ ] Every data type rendered on its §4 anatomy; no field dumps.
- [ ] No empty media boxes; photo-less items have an identity block.
- [ ] `.stagger` entrance on the lead list/section; tappables are
      `.tactile-interactive`; one full-width primary CTA max.
- [ ] Verified at 390px: no overflow, ≥44px targets, consistent gutter.
- [ ] Color is semantic; screen reads in ink + one accent.
- [ ] Empty + loading states composed per §4.
- [ ] Copy passes STYLE.md.

---

## 8. Execution order (the systematic pass)

Each surface is its own verified PR, elevated to this spec, mobile-
first, in priority order. Plan and Events are largely there and become
the reference quality bar.

1. Today (the mobile home — highest traffic)
2. Place detail (`/places/[slug]`)
3. Directory / list & category pages
4. Map page chrome (controls already in-map; tune density/hierarchy)
5. Municipality pages (`/m/[municipality]`)
6. Explore hubs (Today's Explore hub, /pulse, the data sub-pages)
7. Sweep: Events / Plan re-graded against the final checklist

Definition of done for the whole pass: any two screens, viewed back to
back on a phone, read as the same premium product.
