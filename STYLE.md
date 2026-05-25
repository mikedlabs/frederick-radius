# STYLE.md — Editorial voice (Voice Guide v1)

This is the source of truth for every UI string and every editorial line in Frederick Radius. It is enforced in PR review and by the copy detector. If a sentence cannot pass these rules, it does not ship.

Aligned with **Brand Book No. 01 — Voice Guide v1** (May 2026).

## The bet

> A county-scoped app, when it's honest and actually local, beats a national app pretending to know your town.

Everything below flows from that sentence on /about. Point back to it when in doubt.

## The voice

A field guide, not a marketing platform. Reads like a neighbor who actually knows the place — patient, specific, anti-bullshit. Plainspoken. Grade 7–9 reading level. Residents first; a visitor can follow resident-grade writing, a resident cannot stand tourist copy.

## Six principles

1. **Specific over general.** Real names, real places, real numbers. "Carroll Creek on Friday," not "things to do near you."
2. **Fragments earn confidence.** Short sentences. Period. They read like field notes — observed, not pitched. "River town. Rail town. Trail town." Use them when they carry weight, not as a substitute for thought.
3. **Honest about gaps.** If we don't know something, we say so. A blank is never dressed up as content. Empty states are part of the trust contract. "Hours not confirmed. Last verified March."
4. **Place before product.** The app is the medium; the county is the subject. Lead with the place; the app shows up where it has to.
5. **Say what we won't do.** What we refuse is as defining as what we offer. "We don't sell ads, and we won't."
6. **Off by default.** No exclamation marks. No emoji. If a line would feel weird on a coffeeshop chalkboard in Brunswick, rewrite it.

## Hard rules

1. **Fragments are permitted** when they carry observed weight (see principle 2). They are not a license for vague marketing stubs.
2. **Em dashes — used freely.** They stack a clause without slowing down. (This rule reverses the previous "no em dashes" stance.)
3. **No exclamation marks.** No emoji. Period.
4. **No second person inside place / event description fields.** Describe the place; do not address the reader. The sentence describes; the data row informs. ("You will love the patio" is forbidden. "The patio runs along Carroll Creek" is correct.) Second person IS allowed in direct UI copy ("Tap to follow", "You're in").
5. **No embedded structured data inside descriptions.** Addresses, phone numbers, hours, and dates are structured fields. Keep them out of prose.
6. **No name-repeat openers.** A description never begins by restating the place name. The name is already the title.
7. **Numbers and facts must be verifiable.** If unsure, say less.
8. **Avoid "users."** Nobody calls themselves a user. "You" is the reader.

## Banned words — cut on sight

`unlock`, `discover` (as a verb in user-facing copy; the `/discover` URL path is internal and stays), `explore`, `curated`, `hidden gem`, `heart of`, `disrupt`, `elevate`, `seamless`, `delight`, `join the journey`, `craft`, `crafting`, `soothing`, `best`, `amazing`, `must-visit`, `nestled`, `vibrant`, `elevated`, `curated experience`, `destination`, `game-changing`, `powerful`, `innovative`, `leverage`, `robust`, `holistic`, `ecosystem`, `journey`, `experience` (as a noun), `bucket list`, `unforgettable`, `tucked away`, `one-stop shop`, `hub`, `platform`.

## Sparingly — earn them with surrounding specifics

`community`, `local`, `nearby`, `trusted`, `essential`, `experience`, `journey`, `guide`. Each is overused elsewhere; only use when the sentence around it is concrete.

## Always — our working vocabulary

`field guide`, `verified`, `built locally`, `the county`, `honest empty`, `followed business`, `civic alert`, `opt in`, `Carroll Creek`, `Catoctin`, `South Mountain`, `Hood College`. Use freely.

## House style

- **Capitalization:** Sentence case for headers. Town names always capitalized — even "downtown Frederick" gets "Downtown Frederick" because around here it's a proper noun.
- **Numbers:** Numerals for counts and quantities. "1,700 places. 27 towns. 153 strong." Spell out only when starting a sentence.
- **Time & date:** "Friday, 7 PM." Not "this evening at 7:00pm EST." Drop the timezone — we're one county, one timezone.
- **Em dashes:** Used freely. No spaces in print; spaces in body copy if it reads better.
- **Oxford comma:** Yes. Always.
- **Exclamation points:** No.
- **Emoji:** No. Use a specific image or a clean piece of typography. If a sentence needs a 🎉 to land, the sentence is the problem.
- **"We" / "you":** "We" = the team (small, named, local). "You" = the reader, presumed local unless context says otherwise.

## What good looks like

One to three sentences. The first states what the place is and one true, specific thing. The second adds a concrete detail a regular would mention. The third, if present, gives one practical note that is not in the structured fields.

> Brewer's Alley is a brewpub and restaurant on Market Street, one of the first in the modern downtown beer scene. The upstairs dining room is quieter than the bar. Packed patio on First Saturdays.

The third sentence is a clean fragment — it works because it carries weight (a specific scene, a specific day) rather than vague mood.

## The scraped-copy detector (rule-based, used by /admin/copy-review)

Flag a description as scraped when any of these are true:

- It begins with the place name or the first 12 characters of it.
- It contains a street suffix token (St, Ave, Rd, Blvd, Ln, Dr, Way, Ct, Pl) followed by a number, or the string "MD 2170".
- It contains second-person voice ("you", "your", "you'll", "you're", "visit us", "come in", "we offer", "our team is ready") **inside a description field**.
- It contains banned words from the list above.
- It contains emoji, a bullet glyph, "•", a hashtag, or a date like "Dec 2025".
- It is shorter than 25 characters or is a single run-on over 320 characters with fewer than two sentence stops.

Auto-clean means it reads as prose and trips none of the above. Reviewed means an editor approved it against this file.

## Tone, calibrated

Where the voice sits on each axis (these are starting positions — civic alerts slide left, claimed-business copy slides right, but never far):

- **Modest** (not boastful) — we're a small thing, made well.
- **Specific** (not vague) — 1,700+ places, named.
- **Serious** (not playful) — dry wit, never punchlines.
- **Warm** (not clinical) — neighborly, but not folksy.
- **Brief** (not expansive) — two sentences when one will do.
- **Civic** (not commercial) — public-good framing, not municipal jargon.

## Twenty before-and-after pairs

These target the worst patterns in the current dataset.

1. **Name-repeat opener.**
   Before: "Dancing Bear Toys and Games Patrick St"
   After: "An independent toy and game shop downtown, strong on wooden toys, puzzles, and games for older kids."

2. **Social-feed noise.**
   Before: "Here's his 2026 Wishlist: 1 Show up and do the thing"
   After: "A small studio that runs beginner classes and open sessions on weekends."

3. **Embedded date and feed fragment.**
   Before: "Isabella's Taverna & Tapas Bar Dec 2025 Friends"
   After: "A Spanish tapas restaurant on North Market Street, known for paella and a long sherry list."

4. **Sales call to action.**
   Before: "WealthFlow Financial Schedule a review today"
   After: "An independent financial advisory office serving Frederick County families."

5. **Run-on with embedded facts.**
   Before: "Hollerstown Hill Bed and Breakfast Located in the historic district of Frederick with 38 Eateries with 18 min walk"
   After: "A Victorian bed and breakfast in the historic district. Four guest rooms, walking distance to Market Street."

6. **Second person marketing inside a description.**
   Before: "You'll love our cozy patio and friendly staff who craft the perfect cup."
   After: "A neighborhood cafe with a small back patio. The team roasts in-house."

7. **Tourist hype.**
   Before: "A hidden gem nestled in the heart of vibrant downtown Frederick."
   After: "A wine bar on Church Street with a rotating by-the-glass list."

8. **All caps and exclamation.**
   Before: "BEST CRAB CAKES IN TOWN!! COME HUNGRY!!"
   After: "A Maryland seafood spot. The crab cakes are jumbo lump and sell out on weekends."

9. **Empty filler.**
   Before: "A great place for the whole family to enjoy."
   After: "A play-focused spot for kids under ten, with a quiet room for younger toddlers."

10. **Hours inside copy.**
    Before: "Open Mon to Fri 9 to 5, come visit us soon!"
    After: "A framing studio and small gallery that hangs local work."

11. **Address inside copy.**
    Before: "Located at 100 N Market St Frederick MD 21701 serving the community."
    After: "A long-running hardware store on North Market, deep on fasteners and paint."

12. **Vague superlative.**
    Before: "An amazing destination you simply must visit."
    After: "A working pottery studio with a retail shelf and occasional wheel classes."

13. **Soothing banned word.**
    Before: "A soothing spa experience crafted just for you."
    After: "A day spa offering massage and facials, appointment only."

14. **Staff banned word.**
    Before: "Our staff is passionate about great coffee."
    After: "An espresso bar with a tight menu. The team pulls single-origin shots."

15. **Em dash — now permitted.**
    Before: "Frederick's oldest tavern — a true local landmark — since 1890."
    After: "A tavern operating since the late nineteenth century — one of the oldest continuous bars downtown."
    (The em dashes themselves are fine. The before still fails on "true local landmark" — empty hype. The after keeps the em dash and earns it with a specific claim.)

16. **Brochure cadence with banned word.**
    Before: "Discover the charm and elegance of this exquisite boutique."
    After: "A boutique on East Patrick carrying independent labels and a small home section."

17. **Empty fragment, no specifics.**
    Before: "Cozy. Local. Unforgettable."
    After: "A French-leaning bistro with ten tables on East Patrick. Open Tuesday to Saturday for dinner."
    (Fragments themselves are fine — see principle 2. The before fails because each fragment is a vague mood word, not an observation. Compare: "River town. Rail town. Trail town." — three observations that carry weight.)

18. **Scraped category label.**
    Before: "Restaurant Restaurant American (Traditional) $$"
    After: "An American restaurant with a bar menu until close and a Sunday brunch."

19. **We-voice pitch.**
    Before: "We pride ourselves on crafting unforgettable moments."
    After: "An events venue in a restored mill building, used for weddings and civic gatherings."

20. **Mixed noise and repeat.**
    Before: "McClintock Distilling McClintock Distilling Co. Organic spirits 35 S Carroll"
    After: "An organic grain-to-glass distillery on Carroll Creek, with a tasting room and tours."

## UI strings

The same rules apply to buttons, empty states, and errors. Examples that ship:

- Empty hours: "Hours not confirmed. Last we knew: 11–9, but that was March. Tap to help us update."
- Feed failure: "Events feed from DFP didn't come back today. We'd rather show nothing than guess."
- Push (civic): "Catoctin Creek flood watch through 9 PM. Lower Brunswick streets first. One tap to silence civic alerts."
- Push (followed business): "Volt closed tonight — kitchen fire, no one hurt. They'll post when they reopen."

What does NOT ship: "Oops! Nothing here :(", "Coming soon ✨", "Stay in the loop!", "Subscribe for exclusive updates!"
