# VISUAL.md — Premium visual spec

Companion to `STYLE.md`. STYLE.md governs every UI **string**; this
governs every UI **surface**. It is the single source of truth for how
Frederick Radius looks and how data is composed.

**The agent owns this system.** Visual design, UI, UX, layout, color,
type, motion, and information architecture are the agent's call, not a
human-gated one. This document is not a cage to obey; it is the living
record the agent keeps current. The agent may add tokens, retune the
palette, restructure a layout, change motion, or rework a whole
surface whenever its judgment says the product gets better — and then
updates `globals.css` and this file in the same change so the system
and its record never diverge. "That is not in the spec" is never a
reason to hold back; it is a prompt to evolve the spec.

The product is a sharp local instrument that happens to be beautiful.
Premium here means **bespoke, restrained, coherent, and physical** —
never a generic component kit, never decoration for its own sake.

The current direction is **Field Guide v3**: a civic-local discovery
app that reads like a beautifully art-directed local almanac with the
precision of great transit wayfinding. Its signatures: **Fraunces**,
an optical-size editorial serif, for every display header and every
proper noun (place, event, and town names); **Inter** for all
functional text; a monospace **instrument readout** for times,
distances, and counts; **warm almanac paper** with a barely-there
grain; sharp, "set" radii rather than bubbly ones; and the radius
mark as the recurring motif. The map basemap is part of the system,
not a stock layer: `applyFrederickPalette.ts` repaints it to a warm
light field-guide cartography (paper land, paper-halo ink labels,
civic-blue water, sage parks) so the map and the app read as one
piece. It is a floor to build from, not a ceiling. Three limits, and only three, bound this authority, because
they protect users rather than taste:
**coherence** (the app ships as one system at a time, evolved
globally, never forked per screen), **accessibility** (the WCAG-AA
contrast floor holds, always), and **verified** (every change is seen
on a real ~390px viewport before it ships).

Mobile is the primary target. Every rule below is written phone-first;
desktop is the same system with more room.

---

## 1. The non-negotiables (the seven pillars)

1. **One coherent system, owned not frozen.** At any moment every
   screen shares one type scale, spacing rhythm, surface, radius, and
   motion language, because incoherence is the single biggest
   "unfinished" tell. The agent evolves that language deliberately and
   globally: change the token, not the one screen. A stray
   `text-[28px]` that fights the system is drift; raising the whole
   scale on purpose, in `globals.css` and here together, is design
   work and is encouraged. Avoid per-surface one-offs; never avoid
   improving the system itself.
2. **One focal point per screen.** Exactly one element is large and
   confident (the hero / the answer). Everything else is quiet support.
   If two things shout, neither reads as premium.
3. **Disciplined density.** Tight, intentional spacing. Density is a
   proven lever for this product, and so are color, type, and layout
   when the agent's judgment says they raise the work — none of these
   is off-limits. No element floats in dead space; nothing is cramped.
   Rhythm stays consistent and tokened so the system reads as one.
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
   and controls use glass. A barely-there paper grain (`body::before`,
   one tiled SVG, pointer-inert) gives the warm paper a tooth so it
   reads as a made surface, not a flat fill. The app should feel made,
   not drawn — never gimmicky; the grain stays at the edge of
   perception.

---

## 2. Tokens — the system of record the agent maintains

Defined in `src/app/globals.css`. This is the system as it stands
today, not a closed set. The agent adds, retunes, or replaces tokens
as the design evolves and updates this section in the same change so
the record never lags the code. A one-off hard-coded value that
silently duplicates or fights a token is drift, and the fix is to make
it a token; widening or changing the token set on purpose is design
work the agent owns. The WCAG-AA contrast floor on real text is the
one value that is not negotiable.

- **Color (semantic, not decorative).** Field Guide v3 values:
  `--app-brand` (#A93A1E, deep Frederick brick) is brand chrome + the
  single primary CTA on a screen, used sparingly; white-on passes AA.
  `--app-cool` (#2C5C86) = civic / transit / info / verified / save.
  `--app-accent` (#BE862A, harvest gold) is accent only.
  `--app-positive` / `--app-warning` = status only. Ink scale:
  `--app-ink` (#211C18, titles), `--app-ink-2` (body), `--app-ink-3`
  (#685F50, meta; WCAG-AA floor — never go lighter for real text).
  Surfaces: `--app-bg` (#F7F4EC warm paper), `--app-bg-elevated`
  (#FFF cards lift off the paper), `--app-bg-sunken`. A screen reads
  in ink + one accent; three accents means the hierarchy is wrong.
- **Type.** Display = `.display-1` (flagship page header), `.display-2`
  (section / result header) — both Fraunces, `font-optical-sizing:auto`,
  `"SOFT" 40`. **Proper-noun rule:** place, event, and town names
  render in the display serif (`font-serif`); everything functional
  (meta, labels, buttons, body) stays Inter. Data (times, distances,
  counts) uses `.readout` (tabular mono). Kicker: `.eyebrow` is the
  structural almanac label above every page and major section. `.rule`
  is the editorial hairline. Long text `.text-pretty`, headers
  `.text-balance` (already in `.display-*`).
- **Radius.** `--app-radius-sm|md|lg|xl` (5 / 9 / 14 / 20px — sharp and
  "set", not bubbly). Cards = `lg`, pills/chips = full, panels/sheets =
  `xl`. Use the token, never a raw `rounded-[Npx]`.
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
- **Long place list** — never a flat uncapped dump. It goes through
  `PlaceBrowser`: one calm refine row (sort, town, open-now), type
  facets derived from the actual contents with counts, a live count, a
  one-tap clear, progressive disclosure (a page at a time), and the
  composed empty state. Below a small threshold it drops the apparatus
  and just shows the list — calm beats clever. A parent category page
  shows its whole subtree (`categorySubtree`), not just rows tagged
  with the parent slug, or most of the data is unreachable by browse.
- **Civic / live alert** — colored status dot, one-line statement, time.
  Only renders when something is actually true. Never a wrong category.
- **Hub / nav tile** — icon in semantic-tinted circle, label + one
  desc line, count Chip only when > 0. Grid of equal tiles, `.stagger`.
- **Empty state** — composed, not a sentence: a soft tinted icon
  circle, a serif line, one quiet sentence of what to do. Never a bare
  dashed box with text.
- **Loading** — a shimmer of the SAME shape it replaces (`Shimmer*`),
  never a spinner-in-a-box, never layout shift on resolve.
- **Photo failure / expiry** — a real photo that 404s or expires
  degrades to the SAME composed identity block as a photo-less item: a
  category-tinted radial wash plus the category's Lucide vector,
  filling the media box. Never an emoji on a near-empty box, never a
  broken-image glyph, never the bare sunken surface showing through.
  This is the `PlacePhoto` primitive's contract; pass the category
  `slug`. Dev has no photo key, so the failure state is the default
  state of every shelf and must be verified, not assumed.

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

## 6. Primitives — the shared vocabulary, evolve it deliberately

`src/components/ui`: `Surface` (the card), `Chip`, `Button`,
`SectionHeading`, `Shelf`, `FilterChip`, `TrustChip`, `LiveDot`,
`FadeUp`, `Shimmer`, `TapButton`. Reach for these first so surfaces
stay coherent. When a primitive is wrong for where the product is
going, the agent changes the primitive (every caller moves with it) or
adds a new one and lists it here — that is the right move, not a
per-surface fork.

Any list of more than a handful of places goes through `PlaceBrowser`
(`src/components/place`), never a hand-rolled `.map` wall: it owns the
refine / sort / facet / progressive-disclosure / empty contract from
§4 so findability is identical on every surface.

For place/event/identity imagery use `PlacePhoto` (never a raw
`next/image` or `<img>` for a place photo): it owns the §4 failure
contract. The vector behind it is `CategoryIcon` (slug in, the one
Lucide set out) — that is the only identity-icon language in the app.
Emoji glyphs are not an identity system; do not introduce them in
tiles, cards, or hubs.

`gradient-text` / `glass-card` / `animated-button` are the **marketing
site** language (neon, framer-motion). The app and the marketing site
are two deliberately distinct languages; keeping them from bleeding
into each other is a coherence call (pillar 1), not a ban on either.
The agent owns both languages and where the line sits — it just keeps
each surface clearly in one of them, not a muddle of the two.

---

## 7. Per-surface ship checklist

The agent's own pre-ship pass. The defaults below are the current
system; the agent may change a default, and then the change lands in
`globals.css` + this file, not as a silent one-off. Answer yes to all:

- [ ] Clear focal hierarchy; one primary thing per screen.
- [ ] Coheres with the current system, OR the system itself was
      evolved in this change (globals.css + VISUAL.md updated together).
- [ ] Every data type rendered on its §4 anatomy; no field dumps.
- [ ] No empty media boxes; photo-less AND photo-failed items render
      the composed §4 identity block (verify with the photo key unset).
- [ ] `.stagger` entrance on the lead list/section; tappables are
      `.tactile-interactive`; one full-width primary CTA max.
- [ ] Verified at 390px: no overflow, ≥44px targets, consistent gutter.
- [ ] Color is semantic; screen reads in ink + one accent.
- [ ] Empty + loading states composed per §4.
- [ ] Copy passes STYLE.md.

---

## 8. Execution order (the systematic pass)

Each surface is its own verified change, raised to the current system
(and free to push that system forward), mobile-first, in priority
order. Plan and Events are the present quality bar; when the agent
raises the bar, it raises it for all, not just the new screen.

1. Today (the mobile home — highest traffic)
2. Place detail (`/places/[slug]`)
3. Directory / list & category pages
4. Map page chrome (controls already in-map; tune density/hierarchy)
5. Municipality pages (`/m/[municipality]`)
6. Explore (`/explore`) — the discovery front door and a primary nav
   surface, held to the full §3/§4 anatomy: towns, browse-by-category
   on `CategoryIcon`, the curated county guides, and Tools. Plus the
   surfaces it gates: /pulse and the data sub-pages.
7. Sweep: Events / Plan re-graded against the final checklist

Definition of done for the whole pass: any two screens, viewed back to
back on a phone, read as the same premium product.
