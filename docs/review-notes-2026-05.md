# Review notes — 2026-05

Source: user-pasted QA review of the live site. Not a full crawl (1,677 places not visited); follow-up should be a Playwright/mobile-Safari pass.

## Overall thesis
> Frederick Radius helps you make a better local decision in under 30 seconds.

Three products fighting each other today: daily briefing, directory, map. Pick one mental model.

## Priority 1 — fix first

- [ ] **From Above link 404** — About page link to From Above returns 404. Route exists at `src/app/from-above/`, so likely a stale href somewhere in nav/About.
- [ ] **OpenTable CTA 404** — "Reserve a table tonight" on Today page. High-trust CTA, must work.
- [ ] **Add to Calendar (Alive @ Five)** — crawler got "400 OK"; verify ICS download works in real browser.
- [ ] **ParkMobile 403** — likely bot block, but replace with controlled handoff/explainer card instead of dumping users into a dead-feeling external link.
- [ ] **Dead "Call" actions** — place pages show "Call" with no number or tel: link (Hoffman Brothers example).
- [ ] **Duplicate events** — Alive @ Five appears as both curated/verified and municipal feed. Add dedupe layer; merge by title+date+venue overlap; show combined sources.
- [ ] **Miscategorized restaurants:**
  - The Original Popcorn House → labeled Markets but listed under Restaurants
  - Lc Stylez → labeled Shopping but listed under Restaurants
  - Immersion Active → shows Spanish-restaurant description (wrong place)

## Priority 2

- [ ] **Nav vocabulary** — pick one set: **Today / Map / Events / Saved**. Radius becomes a feature inside Map or Today. Kill "Browse" vs "Places" overlap; use **Places**.
- [ ] **Route structure** — canonical: `/today`, `/map`, `/places`, `/events`, `/saved`, `/about`, `/trust`. `/browse` returning a map-style page is conceptually messy.
- [ ] **Map empty state** — replace "Loading map" / "Move the map to see places" with default Downtown view + "Tonight: N events", "Open now: N places", restrooms/parking/coffee/events pills ready.
- [ ] **Category pages as decision pages** — 206 restaurants in one list is database exhaust. Sections: Top 6 hand-picked / Open now / Near me / By town / Good for groups / Quick bite / Worth the drive / Full directory below.
- [ ] **"Nearby" logic** — Alive @ Five page shows US-40 Trailhead Parking 13mi away. Caps: 0.75mi for downtown event parking, drive-time for rural/trail, walking distance first for "near me". Never mix "technically in county" with "useful nearby".
- [ ] **Place page contradictions** — "Hours not posted" + full hours table is broken-looking. One clean status line: "Open today, 3–8pm" or "Hours from Google, confirmed 7 days ago" or "Call unavailable". Never show a dead action.

## Priority 3 — polish

- [ ] **Full-card click targets** — whole card should be one accessible tappable object with clear label; right now image is the link and title is just text in some places.
- [ ] **Heading dedupe** — some place pages repeat business name as secondary heading + H1.
- [ ] **Badge hierarchy** — Verified / Hand-picked / Official / Community / Confirmed / Local favorite / Top rated — give them roles. "Verified" = data confidence. "Hand-picked" = editorial. "Top rated" = secondary. Don't let badges become confetti.
- [ ] **Generic descriptions** — "Restaurants in Downtown Frederick" should never appear as a description.
- [ ] **Loading/empty fallbacks** — every state needs a useful default; "Loading map" is not enough.

## UI direction

Home built around three primary cards: **Right now / Tonight / This weekend**. Map becomes a beautiful secondary layer with bottom sheets and chips on mobile. Visual system leans into "civic field guide": clean cards, annotated map details, source stamps, subtle coordinates, verified tags, local photography, small utility icons, confident spacing.

## What was working (keep)

- Today page concept (weather + right-now needs + tonight + picks + news)
- Trust & Data page (source types, badge meanings, "confirmed" definition, report flow)
- Event detail pages (Alive @ Five — summary, verified, calendar, directions, tickets, good-to-know, lineup, nearby food, parking)
- Collections ("Frederick without a plan", "Walkable date night", "Rainy day Frederick") — the editorial voice
- Account flow (My Radius works without account; magic-link explained without forced registration)
