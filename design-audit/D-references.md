# Phase 0, Agent D: Reference Analysis

Eight references, ten transferable patterns. Six references were assigned: Wildsam Field Guides, the NPS Unigrid system, Monocle travel guides, Linear, Airbnb editorial layouts, and Flighty. Two were discovered: the BBC Shipping Forecast and the instrument approach plate. The closing section argues for the two discoveries.

## The overall lesson of the set

Every reference in this set earns its authority the same way: it moves judgment upstream. A fixed grid, a fixed reading order, a word budget, an accent budget, a curation bar. Each system decides things once, in advance, so the surface the user sees can stay calm, dense, and specific. None of these references signal quality through abundance. A directory shows everything and asks the user to judge. A guide judges first and shows less.

The second lesson is that restraint only reads as confidence when it is paired with specificity. Wildsam can afford quiet layouts because its facts are exact and its voices are named. The Shipping Forecast can afford a 350-word budget because every word in it is load-bearing. Restraint without specificity reads as emptiness. Frederick Radius already has the specificity (real data, real towns, a cleaned pipeline). The work of this redesign is to build the systems that let that specificity carry the screen, and to remove everything that competes with it.

## The ten patterns

### 1. The Almanac Layer

**Source:** Wildsam Field Guides. Every Wildsam city guide carries an Almanac section alongside its Bests and Maps: historical dates, literary excerpts, archival oddities, regional vocabulary. The almanac material is not navigation and not listing data. It sits beside the practical content as proof of depth, and the guides close with blank Notes pages that invite the reader to add their own layer.

**Why it works:** Specific local knowledge cannot be scraped or faked, so a single exact fact ("the 1862 ransom of Frederick was $200,000") establishes more authority than any amount of polish. The almanac layer converts a reference object into a cultural object. It also rewards rereading, which is how a guide becomes a companion rather than a lookup tool.

**Frederick application:** Give place and town pages one curated almanac line each, sourced from a small hand-edited data file like `places-overrides.json`, set quietly below the practical details in the data style. One line, never a section the user must scroll past.

### 2. Named Voices Over Star Counts

**Source:** Wildsam Field Guides. Wildsam's recommendation engine is people: interviews with named locals across professions, pitmasters and river pilots and musicians, each vouching for places from inside their expertise. The guides carry no star ratings and no review counts at all.

**Why it works:** Aggregate ratings flatten every place toward 4.4 and tell the reader nothing about fit. A named human with a stated stake transfers trust through identity: the reader can evaluate the recommender, not just the recommendation. Attribution also disciplines the editor, because a named claim must survive scrutiny.

**Frederick application:** Where Frederick Radius has a real editorial reason to recommend a place, state it as one attributed or first-person line ("Our pick for a first visit to Brunswick") instead of leading with Google's rating. Keep counts as supporting detail in the data style, exactly as the existing voice rules already demand.

### 3. The Constant Band

**Source:** The NPS Unigrid system. Every National Park brochure since 1977 carries the same black band across the top with the park name in standardized typography, joined by the arrowhead emblem in 1999. Yellowstone and a tiny historic battlefield get the identical band. The band never flexes for content, mood, or season.

**Why it works:** One immovable identity element makes hundreds of varied documents read as a single trustworthy family, so trust accrues to the system rather than to any single brochure. Because the band absorbs the identity job completely, the interior pages are free to vary without ever feeling off-brand. The user stops re-evaluating "is this legitimate?" on every new page.

**Frederick application:** Define one fixed masthead treatment, the same height and the same Newsreader placement of the locality or surface name, and apply it identically across Today, Map, Events, and every one of the thirteen locality pages. Walkersville gets the same band as downtown Frederick, which is itself a statement about how the app values the county.

### 4. Standardize the Production, Vary the Subject

**Source:** The NPS Unigrid system. The system fixes the panel grid (4 by 8.25 inch modules), the typefaces, the paper, the ink, and the fold formats, which let the government print everything through one bulk contract. What varies per park is the content: imagery, maps, and layout composition within the grid. The NPS itself notes that two brochures of the same size by the same designer can look quite different. Vignelli won the first Presidential Design Award in 1985 for this split.

**Why it works:** Rigid systems read as bureaucratic only when the constraints are visible as constraints. The Unigrid hides them as scaffolding: routine decisions (sizes, type, production) are removed so all remaining attention concentrates on what distinguishes each park. Authority comes from the consistency; vitality comes from the variance. The split also makes every new document cheap, which is why the system survived fifty years.

**Frederick application:** Write down the Frederick equivalent of the spec sheet: fixed module set for locality pages (orientation map, bests, events, almanac line in a fixed order), fixed type roles, fixed spacing scale, with only imagery and content varying per town. New towns and new surfaces then cost a content decision, not a design negotiation.

### 5. The Verdict Line

**Source:** Monocle travel guides. Monocle packs roughly ten sections of listings into a pocket book without overwhelm. Each section is keyed by an accent color applied to text, which removes repeated header furniture. Each listing follows one fixed anatomy: a bold name, a short opinionated verdict, and a compressed details line. The team states the curation rule plainly: they will not list a hundred places to eat, but they will name the best for each occasion.

**Why it works:** Density overwhelms when every entry must be parsed fresh. When all entries share one anatomy, the eye learns the rhythm once and then scans at high speed. The hierarchy inside each entry matches the value of the information: the opinion is the scarce good and gets the prominent type, while logistics are commodity and get one small line. Cutting the list to "best for each occasion" turns curation itself into the product.

**Frederick application:** Give every place card one editorial verdict line in Newsreader as the second element after the name, and compress address, hours, and distance into a single small JetBrains Mono detail line. Remove per-card category badges and let section grouping carry that information.

### 6. Alignment Before Ornament

**Source:** Linear. Linear's own redesign writeup describes the work as reducing visual noise while increasing density: darkening neutral text for contrast, collapsing 98 theme variables to three (base, accent, contrast), reserving Inter Display for headings only, and spending unglamorous effort aligning every label, icon, and button vertically and horizontally in the sidebar. Cards gain presence through 1px borders and type contrast, not fills. The accent color is rationed to roughly one primary action per screen. Keyboard response is instant, and speed is treated as part of the design.

**Why it works:** The eye reads misalignment and jitter as carelessness before it reads any styling as quality. When everything sits on a strict rhythm and contrast alone carries hierarchy, the surface feels engineered, and users extend that perceived precision to the data itself. Rationing the accent keeps it meaningful: a color that appears once is an instruction, a color that appears ten times is wallpaper. Instant response completes the effect, because hesitation reads as doubt.

**Frederick application:** Audit list rows, chips, and detail pages onto one spacing scale and one shared baseline, and enforce a budget of one vermilion element per screen. Where a card currently uses a fill or border to assert itself, try alignment and type contrast first and keep the border only if the content still swims.

### 7. When the Image Leads, the Chrome Leaves

**Source:** Airbnb editorial layouts. Airbnb listing cards are photo-first: a fixed aspect-ratio image with rounded clipping, a small floating badge on the image itself, and four or five lines of modest type beneath. The system uses no shadows and no elevation tiers on editorial surfaces. Depth comes from the photography and from white space, and typography stays deliberately light because the image supplies the visual weight.

**Why it works:** A strong photograph is the highest-bandwidth element on the screen, and any chrome beside it (borders, shadows, badges, bold labels) splits attention and cheapens the image. Removing the container transfers perceived quality from the interface to the subject, which is exactly where a marketplace, or a guide, wants the desire to land. The discipline is in what gets removed once the image leads: competing hierarchy, decoration, and redundant labels.

**Frederick application:** Where Frederick Radius has a strong photograph (a Today pick, a place hero), run it full-bleed with only the name and the verdict line beneath, and strip the card chrome entirely. Where the photo is weak or missing, never fake it with a gray placeholder; fall back to the typographic listing form from pattern 5, which fails gracefully instead of visibly.

### 8. The Now-State Screen

**Source:** Flighty. Flighty defines fifteen context-aware states keyed to time and location, from "farOut" through "headToAirport," "atGate," "boarding," "inFlight," and "landed." Each state reorders the screen so the single most relevant fact sits above the fold: confirmation number a day out, gate three hours out, walking route after landing. Everything else waits behind progressive disclosure. Status is color-coded on an airport convention (green on time, amber delayed, red cancelled), and numbers are set in monospaced type like a departures board.

**Why it works:** A dense data app fails when it presents the same dashboard at every moment and makes the user perform the triage. Committing to one narrative per state moves that triage into the product. The user learns that the top of the screen is always the answer to "what matters right now," which builds the kind of trust that lets everything secondary collapse one tap deeper.

**Frederick application:** Make Today a state machine rather than a fixed feed: a weekday morning leads with coffee and what opens soon, a Saturday morning leads with the market, an evening leads with dinner and tonight's events, and a festival day leads with the festival. One lead per state, everything else below the fold.

### 9. Fixed Order, Fixed Vocabulary

**Source:** The BBC Shipping Forecast (discovered reference). The forecast has run for over a century inside hard constraints: a budget of about 350 words, a fixed broadcast sequence through 31 named sea areas starting at Viking and moving clockwise, and a fixed within-area order of wind, sea state, weather, visibility, which lets those labels be omitted entirely. The vocabulary is a defined code: "imminent" means within six hours, "soon" means six to twelve, "later" means twelve to twenty-four, and "good," "moderate," and "poor" name exact visibility distances.

**Why it works:** When the order never changes, position itself carries meaning and labels become unnecessary, so every remaining word is data. When the vocabulary is controlled, each term has one calibrated meaning and the listener never has to interpret tone. The constancy compounds into voice: the format's refusal to vary is what makes it feel calm and authoritative, and regular listeners develop a fluency that the format respects. That respect is the premium feeling.

**Frederick application:** Give the Today briefing one fixed anatomy in one fixed order (conditions line, the lead pick, open-late note, tonight's events) and a small controlled status vocabulary ("Open now," "Closes soon," "Dark tonight") used identically everywhere. A returning user should scan the briefing in seconds without reading a single label.

### 10. The Briefing Strip

**Source:** The instrument approach plate (discovered reference). An approach chart compresses everything a pilot needs to land on one runway onto one page in six fixed sections, and Jeppesen's trademarked Briefing Strip puts the critical sequence at the top in an order engineered to match how pilots brief: navigation aid and frequency, final approach course, runway, then the missed approach procedure. One chart serves exactly one procedure, and the plan for failure is printed up front, not buried.

**Why it works:** Density stays usable under stress only when the reading order is decided in advance and identical every time, so the eye never searches. One job per page prevents tasks from contaminating each other. Stating the failure plan first is the deepest move: it converts anxiety into procedure, and it signals that the author thought past the happy path, which is what makes the document trustworthy.

**Frederick application:** Open every place page with a fixed visit strip in an unchanging order: open-or-closed status with the next transition time, travel time from the user, a parking note, and a one-line fallback ("If the wait is long: Brewer's Alley is two blocks north"). A recommendation that ships with its own plan B reads like a local, not a database.

## The two discovered references

### The BBC Shipping Forecast

Nobody reaches for a century-old maritime radio broadcast when designing a local discovery app, which is exactly why it belongs here. The Shipping Forecast is a daily, time-bound editorial product about named places, produced under the hardest constraints in publishing: a fixed word budget, a fixed geographic sequence, and a legally precise vocabulary. It demonstrates the purest available case of restraint functioning as voice. The format has no styling at all, and yet it is one of the most loved and trusted information products in the world, with an audience far beyond the sailors it serves, because its constancy makes it both useful and calming. For Frederick Radius the forecast answers a question the other references do not: how a daily surface like Today can feel ritual rather than feed. Feeds ask to be browsed; rituals ask to be checked. The forecast also proves that a controlled vocabulary is a design asset, which maps directly onto the app's status language and its calm local expert voice.

### The instrument approach plate

An approach plate is the most consequential dense document in common use: a single page that a pilot must absorb in seconds, often at night, often in weather, with no tolerance for ambiguity. It earns a place in this set because it solves the exact problem a place page faces, compressing many facts into one glance, and it solves it with structure rather than simplification. Nothing is omitted; everything is sequenced. Its three transferable ideas are the fixed reading order (the Briefing Strip), the one-procedure-per-page rule, and the printed failure plan. The last one is the unexpected gift to a local guide. Every real local recommendation comes with a contingency ("if the line is out the door, go around the corner"), and no directory ever provides one. Building the missed-approach line into the place page template would be a small structural change that no competitor has, and it expresses the app's whole thesis: a confident guide that has already thought about your evening going sideways.

## Sources

- [Yes& Agency: Wildsam Field Guides](https://yesandagency.com/work/wildsam-field-guides/)
- [Front Porch Republic: The Power of Place, Wildsam Field Guides](https://www.frontporchrepublic.com/2023/02/the-power-of-place-wildsam-field-guides/)
- [arun.is: The best city travel guides](https://arun.is/blog/city-travel-guides/) (Wildsam and Monocle structure and layout detail)
- [NPS Harpers Ferry Center: A Brief History of the Unigrid](https://www.nps.gov/subjects/hfc/a-brief-history-of-the-unigrid.htm)
- [Unigrids, Wikipedia](https://en.wikipedia.org/wiki/Unigrids)
- [AisleOne: Massimo Vignelli's Unigrid System](http://www.aisleone.net/2010/05/10/massimo-vignellis-unigrid-system/)
- [Monocle: City Guides](https://monocle.com/travel-guides/)
- [Linear: How we redesigned the Linear UI, part II](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [LogRocket: Linear design, the SaaS design trend](https://blog.logrocket.com/ux-design/linear-design/)
- [VoltAgent design analysis: Airbnb](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/airbnb/DESIGN.md)
- [Google Design: Airbnb invites you in](https://design.google/library/airbnb-invites-you-in)
- [Apple Developer: Behind the Design, Flighty](https://developer.apple.com/news/?id=970ncww4)
- [Blake Crosley: Flighty, data visualization done right](https://blakecrosley.com/guides/design/flighty)
- [Shipping Forecast, Wikipedia](https://en.wikipedia.org/wiki/Shipping_Forecast)
- [Jolly Parrot: How to interpret a shipping forecast](https://www.jollyparrot.co.uk/blog/how-to-interpret-a-shipping-forecast-298)
- [Aviator.NYC: How to brief an instrument approach](https://www.aviator.nyc/blog/how-brief-an-instrument-approach/)
- [Flight Study: Instrument approach procedure charts](https://www.flight-study.com/2021/07/instrument-approach-procedure-charts.html)
