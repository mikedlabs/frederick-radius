# Frederick Radius — Design System & UX Audit

> One source of truth for fixing the experience **as a system**, in a
> coordinated pass — instead of patching surfaces one at a time.
>
> Generated from a codebase scan (213 components, globals.css token
> layer, all `(app)` routes). Severity: 🔴 systemic · 🟠 high · 🟡 medium.

---

## TL;DR — the one root cause

**The design system exists but isn't adopted.** `globals.css` already
defines a complete token layer (color/ink, spacing, radius, shadow,
elevation, motion) **and** a semantic type scale (`.display-1/2/3`,
`.text-title/lead/body/caption/meta`, `.eyebrow`). Components almost
universally **bypass** it with ad-hoc values:

| Drift signal | Count | Should be |
| --- | --- | --- |
| Arbitrary `text-[Npx]` sizes (incl. 10.5/11.5/12.5/13.5) | ~20 distinct, 1,000+ uses | ~6 scale steps |
| `font-semibold` everywhere | 624 | a 3-weight hierarchy |
| Hardcoded hex colors in `.tsx` | 359 | tokens |
| Files using inline `style={{}}` | 214 | utilities/tokens |
| Overlapping primitives | 3 buttons · 3 sheets · 5 chips | 1 each, variant-driven |

Everything the user *feels* — "fonts inconsistent," "weights strange,"
"layout spread out," "disjointed" — traces back to this. **Fix the
adoption, and most surface complaints resolve at once.**

---

## 1. Typography 🔴

- **No enforced scale.** ~20 distinct pixel sizes, including half-pixel
  values (`10.5`, `11.5`, `12.5`, `13.5`). Two cards built a week apart
  use different sizes for the same role.
- **Weight monotony.** 624 `font-semibold` vs 168 medium / 149 bold /
  32 light. Hierarchy is carried by *size alone*; nothing reads as
  "quiet caption" vs "strong label," so dense screens feel noisy.
- **Display face underused.** Fraunces (`--font-display`) is loaded but
  mostly only the weather temp uses it; section ledes default to sans.

**Fix:** adopt the existing semantic classes everywhere; map the ~20
ad-hoc sizes onto 6 steps. Define a 3-weight rule (e.g. `400` body /
`500` label / `600` emphasis; reserve `700` for numerics). Ban
`text-[Npx]` and inline `fontWeight` via lint.

## 2. Color 🟠

- **359 raw hex** in components. Many are the brand terracotta `#A8462C`
  (= `--app-brand`) and civic blue `#2F5470` re-typed by hand — so a
  palette tweak can't be made in one place.
- **Category colors** (`#1E6B3A`, `#C99632`, `#7E2C6F`…) are real data
  (per-category accents) and legitimately live in data — but they should
  flow through a single helper, not be re-pasted per component.

**Fix:** promote tokens into the Tailwind theme so `text-brand`,
`bg-ink-3`, `border-app` exist as utilities; replace raw hex; route
category colors through one `categoryColor()` accessor.

## 3. Inline styling & utility drift 🟠

- **214 of 213-ish component files** use inline `style={{}}`. Inline
  styles can't be deduped, themed, or overridden by state, and they
  bloat the DOM. Much of it is re-deriving token values (`color:
  "var(--app-ink-3)"`) that could be a utility class.

**Fix:** tokens-as-utilities (Tailwind `@theme`) so `style={{color:
var(--app-ink-3)}}` becomes `className="text-ink-3"`. Reserve inline
styles for genuinely dynamic values (computed gradients, positions).

## 4. Component library 🟠 — consolidation needed

Real duplication, each with slightly different padding/radius/motion:

- **Buttons:** `Button` · `TapButton` · `animated-button` → **one**
  `Button` with `variant`/`size` props.
- **Sheets/overlays:** `Sheet` · `BottomDrawer` · `CollapsibleSection`
  · the map's in-view drawer → a shared sheet primitive + a disclosure.
- **Chips:** `Chip` · `FilterChip` · `ReasonChip` · `TrustChip` ·
  `FreshnessChip` → **one** `Chip` with `tone`/`variant`.
- **Cards:** PlaceCard, EventCard, glass-card, Surface, plus many
  bespoke bordered `div`s repeating the same
  `rounded-[var(--app-radius-lg)] border bg-elevated shadow` recipe →
  one `Card`/`Surface` primitive.

**Fix:** a small primitive layer driven by `class-variance-authority` +
`tailwind-merge`; migrate call sites. Net: fewer files, one look.

## 5. Navigation & information architecture 🔴

- **Homeless "Explore" cluster.** 4 tabs (Today/Map/Events/My Radius)
  but ~14 routes belong to none (`/places`, `/category`, `/collections`,
  `/parking`, `/parks`, `/trails`, `/rivers`, `/amenities`, `/transit`,
  `/m/[muni]`, `/pulse`, `/plan`, `/history`, `/trail`). On these the
  bottom nav lights no tab → no "you are here."
  - ✅ *Done:* Back button on every deep page (PR #360).
  - ⏳ *Next:* light the nearest parent tab on deep routes.
- **Orphan routes** reachable only by URL: `/places` index, `/trail`
  (Beverage Trail — not even in More), `/parking`. Real features buried.
- **`trail` vs `trails`** name collision (Beverage Trail vs hiking).
- **Consistent (good):** place cards open a bottom sheet everywhere via
  `PlaceSheetProvider` — keep this; make sure *every* place link uses it
  rather than full-page nav.

**Fix:** define the IA explicitly — either add an "Explore/Browse" tab
that owns the cluster, or fold the cluster under Map; map every route to
a parent; surface or retire the orphans; rename the beverage trail.

## 6. Layout density & compactness 🟡

- Default rhythm was `space-y-6` everywhere (uniform, spread out) —
  ✅ tightened to `space-y-4` and removed the screen-eating hero.
- Pattern to standardize: **mix densities** (one hero + compact rows +
  rails) instead of stacks of equal-weight full-width cards; **collapse
  secondary modules** (CollapsibleSection now exists — roll it out
  consistently with a shared rule for what's open vs closed).

## 7. The map 🔴 (own workstream — needs product direction)

- Shows **every pin at once** (overwhelming); user wants
  **pinpoint-first** (start focused/filtered, reveal on intent).
- **Filter UI is buried** far below the canvas — should sit above/at the
  map edge.
- **Browse vs Radius** = two maps with a slow swap; revisit whether two
  modes is right, or one map with a mode chip.
- **Road & alerts overlay covers UI**; overlay z-order needs a pass.
- Load: heavy blocking fetch; ✅ loading skeleton + client-cache added,
  ⏳ stream overlays / defer off-by-default layers.

## 8. Performance ✅ mostly addressed / ⏳ remaining

- ✅ Route `loading.tsx` skeletons; `staleTimes` client-cache; lazy
  1.5MB place JSON; map perf flags; lighter pin/popup images.
- ✅ Already on: React Compiler, View Transitions, `next/font`, ISR.
- ⏳ Stream the map; pilot **PPR**; move shared fetches (NWS/traffic/
  events) to `"use cache"`.

## 9. Accessibility 🟡

- Verify all tap targets ≥ 44px (some chips/toggles were ~28–32px;
  the mode toggle was fixed). Audit color contrast of `--app-ink-3` on
  tinted backgrounds. Ensure every collapsible/sheet has
  `aria-expanded`/labels (CollapsibleSection does).

---

## Recommended additions (libraries / Next capabilities)

| Add | Why it serves the goal |
| --- | --- |
| **Tailwind `@theme` token mapping** | Turns the existing CSS vars into real utilities (`text-brand`, `text-ink-3`, `text-sm`), killing 359 raw hex + most inline styles. The single highest-leverage change. |
| **`class-variance-authority` + `tailwind-merge`** | One variant-driven `Button`/`Chip`/`Card` instead of 3–5 each. Consistency by construction. |
| **Radix UI primitives** (Dialog, Popover, Tabs, Accordion, Tooltip) | Accessible, battle-tested behavior under the existing visual skin — replaces hand-rolled sheets/disclosures with correct focus-trap, ARIA, keyboard nav. |
| **ESLint rule banning `text-[…px]` + raw hex in `.tsx`** | Stops the drift from coming back after we fix it. The system stays adopted. |
| **PPR + `"use cache"` (Next 16)** | Near-instant first paint; dedupe data fetching across routes. |
| *(optional)* **Storybook** | A living catalog of the consolidated primitives so future work composes instead of re-inventing. |

> Deliberately *not* recommending a UI kit that imposes its own look
> (MUI/Chakra) — the field-guide identity is a real asset. Radix is
> headless (behavior only), so the visual system stays yours.

---

## Remediation roadmap — the "one swoop" (sequenced)

**Phase 0 — Foundation (do first; everything else depends on it)**
1. Map `globals.css` tokens into the Tailwind theme (`@theme`): color,
   ink, spacing, radius, shadow, **and a 6-step type scale**.
2. Codemod the ~20 ad-hoc `text-[Npx]` → scale steps; raw hex → tokens.
3. Add the lint guards so drift can't return.

**Phase 1 — Primitives**
4. Consolidate Button / Chip / Card / Sheet into single variant-driven
   components (cva). Swap call sites mechanically.
5. Adopt Radix under the skin for Dialog/Sheet/Accordion/Tabs/Tooltip.

**Phase 2 — IA & navigation**
6. Decide the tab model (add Explore tab *or* fold cluster under Map);
   light a parent tab on every route; surface/retire orphans; rename
   beverage trail.

**Phase 3 — Surface re-layout (now cheap, on the new primitives)**
7. `/today`, `/events` (single-line list → better cards), `/map`
   (pinpoint-first + filter-on-top), category/listing pages — re-compose
   with mixed density + consistent disclosure.

**Phase 4 — Performance & polish**
8. Stream the map; PPR pilot; motion consistency; a11y/contrast/tap-size
   sweep.

**Why this order:** Phases 0–1 make Phases 2–3 *fast and consistent* —
re-laying out a surface becomes "compose primitives" instead of
hand-styling, so the whole-app polish lands coherently rather than as
more one-off patches.
