# Signature Spec: The Premium Layer (Session 5 only)

Distilled from `docs/reference/signature-layer.html`, which contains working implementations of every element below. This layer ships only after sessions 1 through 4 pass their gates. Applied earlier, it is paint on clutter.

## S1. The Radius line

One motif, an SVG ring drawn with `stroke-dashoffset`, in exactly four roles and nowhere else:

1. **Arrival:** route transitions draw the ring (about 1.1 s, the project spring curve), then the destination word fades up. Replaces any spinner.
2. **The pulse:** the user's location pin on the map emits three staggered expanding rings (2.6 s loop, scale .18 to 1.15, opacity .85 to 0).
3. **The rule:** every editorial section header sits on a hairline that terminates in a small arc and an endpoint dot. This is the typographic system; the reference file has the exact path.
4. **The confirm:** the save control is a circled ring that draws closed, then a check draws inside (88 and 22 dash units in the reference), with `navigator.vibrate(8)` on success where supported.

The discipline clause: no other element in the product animates decoratively. The motif's scarcity is its value.

## S2. The clock

Three daypart token sets applied at the layout level, selected by the sunset time already fetched with weather:

- **Afternoon:** the existing paper and ink system.
- **Golden hour (roughly 90 minutes before sunset to sunset):** warm gradient field, deep warm ink, burnt accent, grain at 5 percent multiply.
- **After dark:** deep green-black ground (#0F1A15 family), warm lamp accent, cards one step lighter than ground, grain at 7 percent screen.

Copy keys off the same clock: "Today in Frederick" becomes "This evening" becomes "After dark." Content priorities shift with it (open places by day, the event hero at golden hour, what is still pouring after dark). Exact token values and copy examples are in the reference file. Respect `prefers-reduced-motion` and transition themes over 600 ms.

## S3. The image layer

Editorial surfaces only (picks, gems, plans) lead with full-bleed imagery from Mike's drone library, never stock, never on data lists. Treatment: a bottom gradient veil to 72 percent black-green, grain overlay at 8 percent, title set large in Fraunces with an italic accent word, a dashed slot badge during development marking where real photography lands. Parallax is a 6 to 8 percent inner translate against card scroll. Use next/image with portrait art direction on phones.

## S4. The touch

- In-page expansions (card to detail) use framer-motion `layoutId` so the tapped element becomes the destination. The reference implements the same effect with FLIP geometry; match its timing, 420 ms on the project spring.
- Route changes use the View Transitions API.
- Sheets keep vaul's spring physics.
- Motion rules, absolute: springs only, 250 to 400 ms, interruptible, and nothing animates that the user did not cause. A haptic tick (`vibrate(6)`) accompanies expansions on supporting devices.

## The project spring

One easing everywhere: `cubic-bezier(.3, 1.18, .35, 1)` or its framer-motion spring equivalent (high stiffness, light overshoot). A single curve is half of what makes motion feel like one product.
