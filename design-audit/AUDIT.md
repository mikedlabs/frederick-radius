# AUDIT.md: Phase 0 Gate

This document synthesizes five reports: A-journey.md (26 production screen states walked as 3 personas), B-density.md (full component and decision census), C-forensics.md (design system drift measurement), D-references.md (10 transferable patterns from the reference set), and E-data-verification.md (data defect verification). Every claim below traces to evidence in those files. Audit date: June 11 to 12, 2026, against production.

## The diagnosis in three sentences

The app's destination layer works and its journey layer fails: place detail commits to one primary action and honest hours, while every path that leads there spends the user's attention on filters, duplicate affordances, and contradicting numbers. The single largest failure is not visual but editorial: every flagship recommendation slot audited served at least one disqualifying pick, and one junk pick converts every other promise on the screen into a guess. The design system is sound but ungoverned, and the identity itself has not held still long enough to be judged, with the display font changing twice in five days.

## The 10 worst offenders, ranked by user pain

1. **Flagship slots promote junk.** Screenshot: A-guide-best-match.png. Metric: 5 of 5 audited "trust me" surfaces served at least one disqualifying pick ("Worth your time" in Downtown Frederick led with a travel agency and included a funeral home; the guide's one confident eat answer was a bar in the next county captioned "498 min walk"; a date plan seated the couple in a church community room). It fails because a guide that is wrong once with confidence loses the right to be believed about everything else.

2. **The numbers contradict each other wherever they meet.** Screenshot: A-open-now.png. Metric: three different open-now counts (54, 29, 15) across three screens in 8 minutes, and "286 places" became "24+" across one tap. It fails because the unified-count rule already exists in the architecture and the surfaces ignore it, teaching users that no number in the product is a promise.

3. **The one-tap answer machine is hidden while the sift wall is a nav tab.** Screenshots: A-plan-result.png, A-events.png. Metric: /plan produces a complete 3-stop itinerary in 3 taps from cold open but is reachable only through the search overlay; /events, a permanent tab, renders roughly 320 interactive choices (62x budget) across a 2,907 px wall. It fails because the product's best proof of editorial confidence is unfindable and its worst sift cost has top billing.

4. **Time logic fails exactly when a user tests it.** Screenshot: A-today.png. Metric: "Best move tonight" sold a 7:30 PM movie at 11:08 PM, the planner started a 230-minute evening at 11:17 PM, and a Saturday-morning tourist gets no morning shelf. It fails because time-awareness is the product's core differentiating promise and the edges are where promises are checked.

5. **The events feed is an unfiltered municipal calendar.** Screenshot: A-events-scrolled.png. Metric: yard-waste pickups, Planning Commission meetings, and duplicate weekend listings sit inside the discovery list, and 2 of 15 sampled events carry an officials roster as their description. It fails because it hands the sift cost to the persona least willing to pay it, the local checking for something worth leaving the house for.

6. **The map asks the user to learn 12 vocabularies.** Screenshot: A-map-sheet-open.png. Metric: 12 live chip vocabularies on /map alone (22 app-wide), with four temporal vocabularies that disagree on when "Tonight" starts (16:00 on map, 17:00 on today). It fails because every additional vocabulary is a tax the user pays before the map answers anything.

7. **Persistent chrome spends the entire choice budget before content renders.** Screenshot: any of the 26. Metric: 9 always-on interactive elements (4 header, 5 nav) against a budget of 5; 0 of 26 audited states pass, and 14 would still fail with chrome excluded. It fails because the frame outcompetes the painting on every screen at once.

8. **Thirty-five card designs and seven sheet implementations.** Source: B-density.md sections 2 and 1. Metric: 35 distinct card structures in production against a target of 3, plus 6 button primitives and 7 sheet/drawer implementations. It fails because a user who never sees the same shape twice cannot build the muscle memory that makes an app feel learned.

9. **The design system exists but nothing enforces it.** Source: C-forensics.md. Metric: 34 unique font sizes against 12 intended, 117 raw hex colors (the most common is a hex retired on June 5, used 49 times), 3 phantom tokens used but never defined, 3,393 hardcoded values in components, and a display font that changed twice in five days while four normative documents describe three different systems. It fails because tokens that are not bridged into the styling system make the wrong path the cheapest path on every commit.

10. **Search refuses to say no, and one funnel silently breaks.** Screenshots: A-search-empty.png, A-search-fuzzy.png. Metric: gibberish queries return transit cards under a "DIRECT ANSWER" label, "xylophone warehouse" returns a salon, and 8 of 8 craving chips on /today discard their parameter through a retired redirect. It fails because a search that never admits emptiness teaches users to distrust its fullness, and a tap that promises tacos and delivers a generic page is a lie.

## Hypothesis A versus Hypothesis B: state of the evidence

Hypothesis A holds that the field-guide identity is sound and the execution drifted. Hypothesis B holds that the system itself is the ceiling. Phase 0 found strong evidence of drift (offender 9) and zero evidence that any identity was ever executed with discipline long enough to be judged: the font oscillated, the accent is spent on 13 non-primary elements, and the type scale is accretion rather than a scale. This means Phase 0 cannot settle the question, which is the correct outcome: both hypotheses go to trial as live prototypes in Phase 2, exactly as the directive orders. The AI-cluster concern about a high-contrast serif on warm cream remains open and Direction B must be designed specifically against it.

## Blockers that design cannot paper over

These four items gate specific Phase 2 and 3 features. The full verification is in E-data-verification.md.

1. **Ranking trust (new, found by Agent A).** The junk in offender 1 is a scoring-layer defect, not a layout defect. No redesign of the "Worth your time" carousel survives a funeral home in the third slot. The ranking inputs (category gating, distance ceilings, county boundary, editorial floors) must be fixed before any surface re-asserts confidence. This is the program's highest-priority engineering prerequisite.
2. **Count unification.** Every surface must count from the same query with the same predicate before any number renders large.
3. **The event normalizer gap.** The officials-roster pattern must die in normalize.ts before the Daily Cover or any editorial event surface ships.
4. **The imagery treatment standard.** Coverage is 88.6 percent and resolution is adequate (typical 1,200 px), but the assets are uncurated Google submissions. An image-led hierarchy requires either a curation pass over the top 150 editorial places or a uniform treatment standard. Until one exists, no direction may make raw photography load-bearing.

Verified sound and not blockers: timezone handling, place deduplication, event link integrity, and hours coverage at 79.6 percent with an honest undercount predicate.

## What holds up

Phase 1 must protect these. The place detail page commits to one primary action, shows honest closed states, and cites its hours source. The event detail page carries provenance in one calm column. Search quality for real queries is the best in the app ("date night" returns the planner ranked first). The /plan screen is the only surface in the product that decides something for the user, and it resolves the date-night job in 3 taps. The data pipeline's boundary-cleaning architecture is correct even where individual normalizer patterns lag.

## The shape of the fix, from the reference set

D-references.md reduces the reference set to one lesson: authority comes from moving judgment upstream into a system, and restraint reads as confidence only when paired with specificity. The five patterns with the most direct purchase on the offenders above: the Now-State Screen from Flighty (one lead story per time state, killing offenders 4 and 7), the Verdict Line from Monocle (fixed listing anatomy, killing offender 8's card sprawl), the Constant Band from Unigrid (one immovable masthead, disciplining offender 7), Named Voices Over Star Counts from Wildsam (an attributed point of view in flagship slots, the design half of offender 1), and the printed failure plan from approach plates (every recommendation ships with a plan B, which no competitor offers).

## Phase 1 mandate

Phase 1 produces the kill list and applies the choice budget on paper. The default verdict for every element is death, and survival must be argued. Its inputs are the 41 dead files and 5 consolidations in B-density.md, the 10 offenders above, and the protected list. Its output is REDUCTION.md. No code changes ship in Phase 1 except, with explicit founder approval, the four blocker fixes above, which are engineering work and not design work.
