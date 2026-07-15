# Affordances — the one-arrow system

Adopted July 2026, after an outside UX review correctly called out three
competing arrow styles ("sometimes `-->`, sometimes just `>`, sometimes
nothing") and a prominent non-tappable surface (the /today weather plate)
styled like the tappable cards around it.

Enforced by `tests/design/affordance-glyphs.spec.ts`.

## The rules

1. **In-app "go somewhere" text CTA** → the label, then lucide
   `<ArrowRight>` (`h-3.5 w-3.5`, `strokeWidth 2–2.25`, `aria-hidden`),
   inline after the text. Never a literal `→`, `›`, `»`, or `&rarr;`.

2. **Right-edge disclosure** (a row or plate that opens a sheet/detail)
   → lucide `<ChevronRight>` (`h-4 w-4`, ink-3), pinned at the right edge.

3. **Leaves the app** (external site) → lucide `<ArrowUpRight>`. Never
   used for internal navigation.

4. **Cards carry no arrow.** PlaceCard / EventCard and their variants are
   whole-surface tap targets; a consistent absence is itself the rule.
   What they must NEVER do is the inverse: nothing non-tappable may wear
   the elevated-card + pill styling that signals "tap me." If a display
   surface starts to look like a control, either make it one or flatten it.

5. **Data notation is not an affordance.** "A→Z" sort labels and
   route/range separators ("BWI → DCA", "72° → 85°") keep the glyph;
   they are listed in the guard spec's allowlist with a reason.

## Why icons, not glyphs

One rendering (size, weight, optical alignment) everywhere; text glyphs
render at the row's font size and weight, which is exactly how the app
ended up with three visually different arrows for one meaning.
