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
- **Display face underused.** ~~Fraunces~~ *(STALE — the shipped display
  face is **Newsreader**; see CLAUDE.md for the current brand deck. Two
  external audits imported this line as "the locked spec," so it's
  corrected in place.)* The original point stands historically: the
  display face was underused; section ledes defaulted to sans.

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
  1.5MB place JSON; map perf flags; lighter pin/popup images. The
  Mapbox renderer (`mapbox-gl` / `react-map-gl`) loads client-only via
  `dynamic(ssr:false)` (`AppMapClient.tsx`), keeping it out of the
  initial/server bundle; pins cluster natively via GL `cluster` sources.
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

---

## Operating principles (hold every change to these)

The north star: **a stranger must find it faster, clearer, and more
pleasant than Google/Yelp on the FIRST tap — or they bounce back to
their habit and never return.** Speed and ease are not features; they
are survival. Everything below serves that.

1. **Adopt once → apply everywhere, same release.** When we establish a
   pattern (a type step, a Chip, a disclosure, a card density), we sweep
   *every* sibling instance in the same pass. No "fixed on Today but not
   on Events." This is enforced *structurally*, not by memory:
   - shared **primitives** — change the component once, all call sites
     inherit it (the reason Phase 1 precedes surface work);
   - **tokens** — one color/size value, used everywhere;
   - **lint guards** — ban `text-[Npx]` and raw hex so a one-off can't
     re-enter after we've migrated an area.
   - PR rule: "did a similar element elsewhere just become inconsistent
     with this change?" must be answered before merge.
2. **No directories. No walls of text.** The moment a screen becomes a
   long stack of equal-weight rows or paragraphs, it has failed. Every
   list-y / text-heavy surface must use: a visual anchor (image/glyph/
   color), **mixed density** (one hero + compact rows + a rail), and
   **progressive disclosure** (collapse secondary content). Target: the
   first screen answers a question; depth is one tap away, never a
   scroll-forever.
3. **Every tap is predictable.** It goes where the label promises; you
   always know where you are (a lit tab) and how to get back (the Back
   control). Never dump the user into a re-search.
4. **Verify before shipping.** Visual/perf changes get eyes on the
   rendered result (screenshot harness) before they hit the live site.

---

## Backend & integrations audit (so the experience actually has data)

Great UI over thin data still feels broken. Source registry
(`data/sources.yaml`) status tally: **12 active · 15 scaffold · 44
pending**. The unwired ones are silently capping the experience.

### Highest-impact gaps (wire these first)
- **Event coverage → the visible one.** The aggregators that would fill
  the calendar are off: **Ticketmaster** (`scaffold`), **Bandsintown**,
  **Eventbrite**, **Songkick** (`pending`). Today only a few calendar
  feeds (Celebrate Frederick, Hood, County) + seed data are live — which
  is why a weekend can read empty. *Action:* set `TICKETMASTER_API_KEY`
  + `BANDSINTOWN_APP_ID` in Vercel and flip those sources `active`.
- **Place richness.** `GOOGLE_PLACES_API_KEY` powers photos + hours
  enrichment; `MAPILLARY_TOKEN` the street-level map pins; `YELP_API_KEY`
  ratings. Missing keys = grey cards / fewer pins.
- **Weather extras.** `AIRNOW_API_KEY` (AQI in the almanac),
  `NWS_USER_AGENT` (NWS *requires* a UA or throttles).

### Env keys the code expects (set in Vercel → Project → Settings → Env)
| Area | Vars |
| --- | --- |
| Places/enrichment | `GOOGLE_PLACES_API_KEY`, `YELP_API_KEY` |
| Map | `MAPILLARY_TOKEN` |
| Events | `TICKETMASTER_API_KEY`, `BANDSINTOWN_APP_ID`, `HOOD_CALENDAR_URL` |
| Weather/air | `AIRNOW_API_KEY`, `NWS_USER_AGENT`, `NPS_API_KEY` |
| Data / persistence | `NEXT_PUBLIC_SUPABASE_URL`, `*_SUPABASE_*_KEY`, `POSTGRES_URL` / `DATABASE_URL` (saved / My Radius / business claims) |
| Notifications / email | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web push), `RESEND_API_KEY` (email) |
| Ops / observability | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_PLAUSIBLE_*`, `SLACK_WEBHOOK_URL` |
| AI | `ANTHROPIC_API_KEY` |

### Cron jobs (vercel.json) — depend on the keys + DB above
`/api/ingest/all` (daily 09:00), `/api/cron/notify-civic-alerts`
(every 30m → needs VAPID), `/api/cron/business-status` (daily),
`/api/cron/data-health` (daily). If their upstream keys are unset they
run but no-op.

### Good news
Integrations fail **soft** — loaders use `.catch(() => [])`, so a
missing key degrades quietly (thinner data) instead of crashing. So
wiring keys is purely *additive* upside, low risk.

> **Note:** I can't set secrets from here — these go in the Vercel
> dashboard. Tell me which you've set and I'll flip the matching
> `data/sources.yaml` entries `active` and verify the wiring.
