# FrederickRadius: Subtraction Brief

**Date:** June 12, 2026, audited live at 4:11 PM ET
**Purpose:** A deletion contract for Claude Code, not another findings document. Every item below is verified against the live site today. The goal of this work is to remove, merge, and demote until each screen has one job. Nothing in this brief adds a feature.

---

## 1. Why the app feels clumsy

The app has one good dataset and roughly seven surfaces re-rendering it in parallel. The clutter is structural, not visual. Verified on the live site today:

- **One event, four mentions.** "Miscast Cabaret" is named four times on the Today screen alone: in the "What's on Tonight" block, as "Best bet" in the Tonight module, as "Don't miss" in the Weekend module, and again as a standalone event row. It then appears twice more on Events (Best tonight, then again in the browse list).
- **The "open now" intent has four entry points.** The header button "What's open right now? ⌘K" on every page, the "195 places open near downtown" stat card on Today, the "See what's open" link, and the map's `open=now` mode. Four doors to one room.
- **Events runs two complete systems stacked on one page.** An editorial layer (Best tonight, More tonight, Happening soon, This weekend, Browse by mood, Later this week) sits on top of a full browse system (search input, seven filter chips, four view modes, a Filters panel, a Sort control, a town chip row, and a date strip). The page carries two search inputs plus the global ⌘K, so three search affordances on one screen.
- **The counts contradict each other on the same screen.** The editorial header says "This weekend 13 events" while the browse section below it says "This weekend 12." The editorial layer says "Later this week 12" while browse says 11. The browse header says "76 upcoming" while the town chips say "All 80." Every drifting count erodes trust in the data, which is the one thing this app sells.
- **Two routes serve the same map.** `/map` and `/radius` render the identical view with identical controls. The app's namesake feature is a duplicate URL.
- **Pulse leads with five empty rows.** Fire, traffic, power, schools, and 311 all display "0 · clear, No issues right now" before any content. Below that sits a "By the numbers" census block (population, founding year, Catoctin elevation). That is static trivia formatted as live data.
- **Three start surfaces.** `/` and `/guide` are byte-identical (confirmed by hash), the tab is labeled Ask, the page asks "What are you looking for?", and Today is a separate landing experience. A new user cannot tell where the app begins.
- **The June 9 payload finding is still live.** Decoded /events HTML measured 788KB today, almost exactly the 787KB flagged three days ago. /today is 326KB decoded. The audit findings are accumulating in documents instead of landing in the repo. That is the wheel-spinning, and it is why this brief works differently.

**Visible-text baseline (the clutter budget):** Today renders 310 visible text lines. Events renders 951. These numbers become the regression metric. Every Claude Code session below must end with these numbers lower, verified by script, or the session did not ship.

---

## 2. Operating rules (paste these into CLAUDE.md)

These are constraints, not suggestions. Claude Code must treat a violation as a failing test.

1. **One job per screen.** Today answers "what should I do right now." Events answers "what is happening and when." Map answers "where is it relative to me." Saved holds the user's own list. A module that serves a different screen's job moves to that screen or dies.
2. **No event or place renders twice on one screen.** One entity, one card, per view.
3. **Counts are control labels, never content.** "Weekend 13" inside a tab is navigation. "195 places open near downtown" as a card is noise. Delete every stat card. Any count that survives inside a control must derive from the exact selector that renders the list it describes, so it cannot drift.
4. **One search system.** The ⌘K command bar is the only search in the product. Every other input is deleted, and page-level filtering happens through chips, not text fields.
5. **Empty states collapse.** A category with zero items renders one line or nothing. It never renders a card.
6. **Weather is one sentence and one link.** The phone already has a weather app. Radius provides context ("Storms 3 to 8 PM, plan indoors"), not forecasts.
7. **Reveal on intent.** Default view shows the answer. Filters, view modes, sort, town selection, and layers live behind a single "Refine" affordance until the user asks for them.
8. **Subtraction ships first.** No new features, modules, or data sources enter the repo until the persona suite in Section 5 passes.

---

## 3. The lists

### Kill (delete outright)

| Item | Location | Why |
|---|---|---|
| "195 places open near downtown" stat card | /today | Counts as content. The user wants a place, not a number. Replace with nothing; the intent lives in ⌘K and the map. |
| "By the numbers" census block | /pulse | Static trivia dressed as live data. Move two or three facts to /about if wanted, delete the rest. |
| Hourly forecast, 7-day forecast, "More weather details" modules | /today | Rule 6. Keep one context sentence and a link out. |
| Second search input ("Search story time, market, council…") | /events | Rule 4. |
| First search input ("Search events, venues…") | /events | Rule 4. Filtering happens via chips and the date strip; free-text goes to ⌘K. |
| Editorial duplication layer (Best tonight, More tonight, Happening soon, Later this week as separate modules) | /events | Today owns "best of." Events owns the complete list. Keep at most one pinned "Tonight" row at the top of the list. |
| "Don't miss" and "Best bet" duplicate mentions of the same event | /today | Rule 2. The Tonight module renders the event once. |
| Duplicate Events link in the utility nav | header | It is already a primary tab. |
| ParkMobile and OpenTable explainer paragraph | /today | Demote to the place detail page where reserving and parking are actual next steps. Keep "Parking downtown" and "MARC & transit" as two compact handoff rows. |
| /radius as a rendered route | routing | 301 it to /map. The radius tool stays as a map control, which it already is. |

### Merge (one source of truth)

| Items | Into | Result |
|---|---|---|
| `/` and `/guide` and the Ask tab | One root | See Decision 1 below. Whatever you choose, root resolves to exactly one surface and the dead duplicate redirects. |
| Four "open now" entries | ⌘K plus one map state | Header button stays. Today gets one action row, "What's open near you," that links to the map's open-now state. The standalone card and link die. |
| Events count sources | One selector | Editorial labels, chip counts, and section headers all read from the same filtered query result. If that is hard, remove the numbers from labels entirely. Matching counts or no counts, nothing in between. |
| List, Compact, Agenda, Map view modes | Two modes | List and Map. Compact is a density toggle nobody asked for, and Agenda duplicates the date strip. |
| /pulse | Conditional surface | Pulse becomes an alert strip on Today that renders only when at least one category is non-zero. The full page survives as /alerts for the rare active day, with empty categories collapsed to one summary line. |

### Demote (progressive disclosure)

| Item | From | To |
|---|---|---|
| Filters, Sort, town chips | Always visible on /events | One "Refine" button opening a sheet. Default visible controls: date strip plus five mood chips maximum. |
| Map layers, "Show whole county," "Fit radius" | Persistent map buttons | One layers/settings control. "Use my location" stays primary. |
| Worth a look, afternoon plan, hidden gems | Competing mid-feed modules | These are the actual product. Today keeps exactly two editorial modules above the fold: one "right now" answer and one plan or pick set. Hidden gems lives at /collections/hidden-gems and gets one entry row, not a six-card gallery on the root. |
| Drone book promo ("From above") | Mid-feed on /today | Footer slot or About page. It currently interrupts the answer the screen exists to give. |

---

## 4. Three decisions only you can make

Make these before the first Claude Code session, because every session depends on them.

1. **What is the root?** Recommendation: `/` becomes Today, the daily answer, and the field-guide gallery page dies as a landing surface. The Ask tab is replaced by a Search tab that opens the ⌘K command bar. Tab bar: Today, Events, Map, Search, Saved. The alternative is keeping the field-guide home, but then Today and Home must visibly differ in job, and right now they do not.
2. **Does Ask survive as a concept?** The tab says Ask, the page shows a gem gallery, and the actual ask behavior lives in ⌘K. Either Ask becomes a real single-input surface that routes intents (and ⌘K becomes its shortcut), or the word disappears. A label that promises intelligence the input does not have was flagged June 9 and is still the state today.
3. **Is Pulse a page or a behavior?** Recommendation: behavior. It earns a screen only on the days something is happening.

---

## 5. Persona agents (your users-as-agents idea, made executable)

Run these in Claude Code with the Playwright MCP server or plain `npx playwright test`. They run before any change to record the baseline, and after every session as the regression gate. A session that fails any persona does not merge.

### The five personas and their tasks

1. **Saturday visitor.** Landed downtown with three free hours. Task: from the root, reach one specific open place with a directions link in three taps or fewer. Fail if the path requires scrolling past more than two modules or if the first tappable answer is a count.
2. **Parent.** Wants free, family-friendly events this weekend. Task: reach a filtered weekend family list in two interactions. Fail if any visible count label disagrees with the number of cards rendered.
3. **Date-night local.** Needs dinner plus one event tonight. Task: identify tonight's event and reach a restaurant's reserve action. Fail if the same event appears more than once on any screen in the path.
4. **New resident.** Skeptical, evaluating whether to trust the site. Task: state the value proposition from above-the-fold copy alone, then find the sources page. Fail if the root presents three or more competing entry points.
5. **Civic user.** Wants the next Planning Commission meeting. Task: find it through the civic chip or ⌘K. Fail if facility reservations or non-events pollute the first ten results.

### Mechanical assertions (run on every page)

```ts
// tests/clutter.spec.ts  (Playwright)
import { test, expect } from '@playwright/test';

const pages = ['/', '/today', '/events', '/map'];

for (const path of pages) {
  test(`clutter contract: ${path}`, async ({ page }) => {
    await page.goto(`https://frederickradius.app${path}`);

    // Rule 4: at most one search input outside the command bar
    const inputs = await page.locator('main input[type="text"], main input[type="search"], main input:not([type])').count();
    expect(inputs, 'one search system only').toBeLessThanOrEqual(0);

    // Rule 3: no stat cards
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/\d+\s+places open/i);

    // Rule 2: no entity rendered twice
    const titles = await page.locator('main h3').allInnerTexts();
    const dupes = titles.filter((t, i) => t.trim() && titles.indexOf(t) !== i);
    expect(dupes, `duplicated on screen: ${dupes.join(', ')}`).toHaveLength(0);

    // No tab points at a 404
    for (const href of await page.locator('nav a').evaluateAll(as => as.map(a => a.getAttribute('href')))) {
      if (href?.startsWith('/')) {
        const res = await page.request.get(`https://frederickradius.app${href}`);
        expect(res.status(), `${href} from nav`).toBeLessThan(400);
      }
    }
  });
}

test('count integrity: /events', async ({ page }) => {
  await page.goto('https://frederickradius.app/events');
  // Every visible "N events" label must equal the cards in its own section.
  const sections = page.locator('main section:has(h2)');
  for (let i = 0; i < await sections.count(); i++) {
    const s = sections.nth(i);
    const label = await s.locator('h2').innerText();
    const m = label.match(/(\d+)/);
    if (!m) continue;
    const cards = await s.locator('h3').count();
    expect(cards, `"${label}" claims ${m[1]}`).toBe(parseInt(m[1], 10));
  }
});

test('routes: radius redirects to map', async ({ request }) => {
  const res = await request.get('https://frederickradius.app/radius', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
});
```

### The clutter budget script (run at the end of every session)

```bash
# budget.sh — visible text lines per screen, the single regression number
for p in today events "" map; do
  curl -sL --compressed "https://frederickradius.app/$p" | python3 -c "
import sys,re
from bs4 import BeautifulSoup
s=BeautifulSoup(sys.stdin.read(),'html.parser')
[t.decompose() for t in s(['script','style','noscript','svg','footer','head'])]
print('/'+('${p}' or ''), len([l for l in s.get_text('\n',strip=True).split('\n') if l.strip()]))"
done
```

**Baselines recorded today:** /today 310, /events 951, / 50, /pulse 122.
**Targets:** /today under 150, /events under 400. The decoded HTML targets carry over from the June 9 report: /events under 300KB (currently 788KB), /today under 150KB (currently 326KB).

---

## 6. Claude Code session plan

Four sessions, each small enough to finish, each with a hard gate. Paste the operating rules into CLAUDE.md first, commit the Playwright suite second, record the baseline third. Then:

**Session 1: Routes and navigation.** Resolve Decision 1. Redirect /radius to /map and the losing root surface to the winner. Remove the duplicate Events link from the utility nav. Make both tab bars render from one config object so they cannot diverge again. Gate: nav 404 test passes, route tests pass, no visual regression on remaining pages.

**Session 2: Today subtraction.** Execute every Kill and Demote row that names /today. One weather sentence. One Tonight module rendering each event once. Two editorial modules maximum. Counts policy applied. Gate: /today budget under 150 lines, personas 1 and 3 pass, no duplicate-title failures.

**Session 3: Events single system.** Delete the editorial layer and both inputs. One list grouped by the date strip, five mood chips, a Refine sheet holding filters, sort, and towns. All counts derive from the rendering query. Gate: /events budget under 400 lines, count-integrity test passes, personas 2 and 5 pass, decoded HTML under 300KB (this forces the RSC payload fix, since the inline data is most of the 788KB).

**Session 4: Pulse and map cleanup.** Pulse becomes the conditional alert strip plus /alerts. Map controls consolidate per the Demote list. Gate: full persona suite green, budget script output committed to the repo as the new baseline.

A session that ends without its gate passing gets reverted, not merged. That single discipline is what converts audit findings into a different product.

---

## 7. What stays untouched

The editorial voice, the field-guide identity, the Fraunces and Creek-blue system, the place detail pages, the afternoon-plan generator, the curated picks, and the trust-and-sources framing are the product. The drone library and the plan generator are the two things no competing Frederick app has. This entire brief exists to clear the floor so those two things are what a user actually hits.
