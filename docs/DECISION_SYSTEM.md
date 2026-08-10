# Frederick Radius decision system

Status: accepted for incremental migration.

## Decision

Frederick Radius will use one client/server-safe decision contract across its
primary surfaces. Each domain keeps its own policy. A restaurant, an event,
an alert, and a saved place do not share one artificial score.

The shared contract defines:

- one lead and a short set of alternatives;
- the location scope and how much that origin can be trusted;
- whether availability is confirmed, unknown, or not applicable;
- whether coverage supports a negative claim such as “none are open”;
- complete-sentence reasons backed by named evidence; and
- a confirmed, partial, or insufficient claim state.

Scores are private implementation details. They cannot be returned by an API,
used as marketing copy, or sold as placement. The user sees the reasons.

## Why this shape

The app already has strong domain logic, but several surfaces developed their
own versions of location trust, hours handling, and explanation copy. Replacing
them with one universal ranker would erase useful differences and create a
large regression risk. Sharing the decision output and the hard trust rules
allows the product to become coherent without flattening every use case.

## Rules that every adapter must keep

1. A device fix or chosen place may affect nearest-first ranking. A network
   estimate may provide regional context but cannot crown a nearest result.
2. Unknown hours are not a closure. Thin coverage cannot support a claim that
   nothing is open.
3. A recommendation must explain why it leads. A score alone is not an
   explanation.
4. Paid participation may improve a business record. It cannot alter the
   decision score or buy the lead position.
5. Raw coordinates and private scores do not cross the decision API boundary.
6. A surface returns an insufficient state when the evidence cannot support a
   useful decision.

## Migration order

1. Today and Ask use the same `WantAnswer` adapter and canonical `DecisionSet`.
2. Nearby and category guides use the shared factor evaluator while preserving
   their existing intent policies.
3. Events wrap the existing event-domain comparator in the same output shape.
4. Map keeps its richer route and live-signal model, then adapts its lead and
   alternatives to the shared contract.
5. Saved adds personal change evidence. Compass consumes decision summaries
   while remaining an intent router.

Each migration requires focused ranking tests, a cross-surface invariant test,
and rendered mobile evidence before it can replace compatibility fields.
