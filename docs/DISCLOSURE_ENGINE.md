# The Declarative Disclosure Engine

> Today every `/today` section is hand-written TSX with its open/closed
> logic, data source, and trust treatment inline. That doesn't scale —
> not to the civic moat (dozens of sources), not to per-user adaptation,
> and not to the "any county" platform thesis in `VISION.md`. This is the
> plan to make disclosure **config, not code**: one engine that reads a
> *manifest* + a *context* and decides what opens, in what order, with
> what reason and what trust treatment. The gate from `UX_REDO.md` is
> enforced in exactly one place.
>
> Working prototype: `docs/disclosure-engine-demo.html` (swap counties to
> see the same engine render a different place from config alone).
>
> **Status:** proposed · **Last updated:** 2026-06-04.

---

## Why

Three forces all point at the same refactor:

1. **The civic moat is wide.** Recycling, government hours, meeting
   agendas, river gauges, AQI, outages, closings — dozens of sources, each
   with its own freshness window and confidence tier. Hand-coding a
   section per source re-implements the data-confidence gate every time
   (and it will drift, exactly as the UX audit found the design tokens
   drifted).
2. **The home should anticipate.** Section order and default-open state
   are currently hardcoded (`defaultOpen`). They should reflect the
   moment — daypart, weather, location — which means the decision has to
   be *computed*, not authored.
3. **The platform is the idea.** `VISION.md`: "config + ingest agents mean
   the same engine could become the intelligence layer for any county."
   A declarative disclosure layer is the front-end half of that promise.

If disclosure is data, all three become cheap and the gate becomes
un-drift-able.

## The shape: manifest → engine → render

```
 manifest (data)        engine (~40 lines)          render (CollapsibleSection)
 ───────────────        ──────────────────          ───────────────────────────
 [{ id, source,    →    decide(card, ctx) →    →     <CollapsibleSection
    tier, ... }]        { open, weight,              open=… reason=… tier=… />
                          reason, assertable }
```

The engine knows nothing about Frederick. It reads the manifest and a
context object and returns a decision. Rendering stays in the existing
`CollapsibleSection` primitive — this is an orchestration layer above it,
not a replacement.

## The manifest (the only thing you edit)

Each card is a row of data:

```ts
type DisclosureCard = {
  id: string;
  eyebrow: string;
  title: string;                 // may contain {tokens}
  source: SourceId;              // one taxonomy: county | city | nws | google | osm | curated | submitted
  tier: "verified" | "probable" | "unconfirmed";
  freshnessDays: number | null;  // drives the FreshnessChip + degrades the claim
  weightBase: number;            // sort; higher = nearer the top
  opensWhen?: Predicate[];       // ["time:morning", "weather:rain", "always"]
  boostWhen?: Predicate[];       // raises weight in-context
  demoteWhen?: Predicate[];      // lowers weight / tucks away
  reason?: string;               // the chip that explains the decision; supports {tokens}
  // data binding (one of):
  loader?: LoaderId;             // server loader that returns the body + facts
  facts?: Record<string,string>; // for {token} fill in title/reason
};
```

A `Predicate` is `"<axis>:<value>"` evaluated against the context, plus
the literal `"always"`. New axes (e.g. `"season:foliage"`) cost one line
in the evaluator.

## The engine contract

```ts
function decide(card, ctx) {
  const assertable = rank(card.tier) >= rank("probable");   // THE GATE
  let open = card.alwaysOpen === true;
  let reason = null;
  if (assertable && matches(card.opensWhen, ctx)) { open = true; reason = fill(card.reason, card.facts); }
  if (!assertable) reason = "Not confirmed";                 // unconfirmed never auto-opens or asserts
  let weight = card.weightBase ?? 50;
  if (matches(card.boostWhen,  ctx)) weight += 30;
  if (matches(card.demoteWhen, ctx)) weight -= 45;
  return { open, reason, weight, assertable };
}
```

**This is where the data-confidence gate lives — once.** `assertable`
gates both *asserting* a fact and *auto-opening*: a `verified` source may
assert "Open now" and lead the page; an `unconfirmed` one renders, but
states its own honesty and can never auto-open or claim. Stale
`probable` data degrades via `freshnessDays` ("as of 3w ago") rather than
being hidden. No surface can opt out, because there is only one engine.

## The context

```ts
type DisclosureContext = {
  time: "morning" | "midday" | "fri-eve" | …;   // from the daypart clock (already shipping)
  weather: "clear" | "rain" | …;                // from NWS (already shipping)
  near: MunicipalitySlug;                        // from geolocation (already shipping)
  // later: season, userPrefs, lastOpened[]      // the adaptive layer plugs in here
};
```

Every input already exists in the app. A `useDisclosureContext()` hook
assembles it; the engine is pure and testable in isolation.

## Migration path (incremental, no big-bang)

1. **Extract the engine** (`lib/disclosure/engine.ts`) + types. Pure, unit-tested.
2. **Author one manifest** for `/today` mirroring today's hand-coded sections 1:1 — behavior-identical, just relocated to data. Ship behind a flag.
3. **Wire `useDisclosureContext()`** and let the engine drive order + `defaultOpen`. Now the home anticipates with zero new sections.
4. **Fold civic sources in** as manifest rows as their data is acquired — each one automatically inherits the gate.
5. **Retire the hardcoded call-sites** once parity is confirmed.

Each step is shippable and reversible.

## What this unlocks (the future-proofing)

- **Replicability.** Swap the manifest → another county, same engine. (The
  prototype's county toggle is the proof.) The platform thesis, realized.
- **The generative target.** When the Ask (`/api/ask` + AI Gateway)
  answers a query, it emits a transient card *in the same shape* — same
  tiers, same reason chips, same gate. The model composes manifests; it
  never bypasses trust.
- **The adaptive layer.** Per-user signals (what you open/dwell on) become
  just another `boostWhen`/`weightBase` input — on-device, no schema
  change.
- **Ambient surfaces.** A widget, a push, a Wallet pass, a voice answer
  are alternate *renderers* of the same manifest + decision. The app is
  one render target, not the only one.

## Non-goals

- Not a CMS. The manifest is committed code-adjacent config, reviewed in PRs.
- Not a replacement for `CollapsibleSection` — it orchestrates it.
- The engine never sources or invents facts; it only decides disclosure
  over data that already carries provenance.
