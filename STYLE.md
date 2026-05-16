# STYLE.md — Editorial voice

This is the source of truth for every UI string and every editorial line in Frederick Radius. It is enforced in PR review and by the Phase 1 copy detector. If a sentence cannot pass these rules, it does not ship.

## The voice

Direct, intelligent, local. The product reads like a sharp local newsletter written by someone who walks Patrick Street every week. It is not a tourism brochure. It is not a startup landing page. It does not sell Frederick. It tells residents what is true and useful.

Write for the person who already lives here. A visitor can follow resident-grade writing. A resident cannot stand tourist copy.

## Hard rules

1. Every sentence is complete. It has a subject and a verb. No fragments, no headline-stubs in body copy.
2. No em dashes anywhere. Use a period, a comma, a colon, or parentheses.
3. Banned words: "craft", "crafting", "soothing". Do not use them in any form.
4. Use "team", never "staff".
5. No marketing hype. No "best", "amazing", "must-visit", "hidden gem", "nestled", "vibrant", "elevated", "curated experience", "destination".
6. No second person in place and event descriptions. Describe the place, do not address the reader. "You will love the patio" is forbidden. "The patio runs along Carroll Creek" is correct.
7. No embedded addresses, phone numbers, hours, or dates inside descriptive copy. Those are structured fields. The sentence describes; the data row informs.
8. No emoji and no social-feed punctuation in copy.
9. No name-repeat openers. A description never begins by restating the place name. The name is already the title.
10. Numbers and facts must be verifiable. If unsure, say less.

## What good looks like

One to three complete sentences. The first sentence states what the place is and one true, specific thing about it. The second adds a concrete detail a regular would mention. The third, if present, gives one practical note that is not in the structured fields.

Good: "Brewer's Alley is a brewpub and restaurant on Market Street, one of the first in the modern downtown beer scene. The upstairs dining room is quieter than the bar. It runs a packed patio on First Saturdays."

## The scraped-copy detector (rule-based, used by /admin/copy-review)

Flag a description as scraped when any of these are true:

- It begins with the place name or the first 12 characters of it.
- It contains a street suffix token (St, Ave, Rd, Blvd, Ln, Dr, Way, Ct, Pl) followed by a number, or the string "MD 2170".
- It contains second-person voice ("you", "your", "you'll", "you're", "visit us", "come in", "we offer", "our team is ready").
- It contains marketing tokens from rule 5.
- It contains emoji, a bullet glyph, or "•", or a hashtag, or a date like "Dec 2025".
- It is shorter than 25 characters or is a single run-on over 320 characters with fewer than two sentence stops.

Auto-clean means it reads as prose and trips none of the above. Reviewed means an editor approved it against this file.

## 20 before and after pairs

These target the worst patterns in the current dataset.

1. Name-repeat opener.
Before: "Dancing Bear Toys and Games Patrick St"
After: "An independent toy and game shop downtown, strong on wooden toys, puzzles, and games for older kids."

2. Social-feed noise.
Before: "Here's his 2026 Wishlist: 1 Show up and do the thing"
After: "A small studio that runs beginner classes and open sessions on weekends."

3. Embedded date and feed fragment.
Before: "Isabella's Taverna & Tapas Bar Dec 2025 Friends"
After: "A Spanish tapas restaurant on North Market Street, known for paella and a long sherry list."

4. Sales call to action.
Before: "WealthFlow Financial Schedule a review today"
After: "An independent financial advisory office serving Frederick County families."

5. Run-on with embedded facts.
Before: "Hollerstown Hill Bed and Breakfast Located in the historic district of Frederick with 38 Eateries with 18 min walk"
After: "A Victorian bed and breakfast in the historic district, four guest rooms, walking distance to Market Street."

6. Second person marketing.
Before: "You'll love our cozy patio and friendly staff who craft the perfect cup."
After: "A neighborhood cafe with a small back patio. The team roasts in-house."

7. Tourist hype.
Before: "A hidden gem nestled in the heart of vibrant downtown Frederick."
After: "A wine bar on Church Street with a rotating by-the-glass list."

8. All caps and exclamation.
Before: "BEST CRAB CAKES IN TOWN!! COME HUNGRY!!"
After: "A Maryland seafood spot. The crab cakes are jumbo lump and sell out on weekends."

9. Empty filler.
Before: "A great place for the whole family to enjoy."
After: "A play-focused spot for kids under ten, with a quiet room for younger toddlers."

10. Hours inside copy.
Before: "Open Mon to Fri 9 to 5, come visit us soon!"
After: "A framing studio and small gallery that hangs local work."

11. Address inside copy.
Before: "Located at 100 N Market St Frederick MD 21701 serving the community."
After: "A long-running hardware store on North Market, deep on fasteners and paint."

12. Vague superlative.
Before: "An amazing destination you simply must visit."
After: "A working pottery studio with a retail shelf and occasional wheel classes."

13. Soothing banned word.
Before: "A soothing spa experience crafted just for you."
After: "A day spa offering massage and facials, appointment only."

14. Staff banned word.
Before: "Our staff is passionate about great coffee."
After: "An espresso bar with a tight menu. The team pulls single-origin shots."

15. Em dash.
Before: "Frederick's oldest tavern — a true local landmark — since 1890."
After: "A tavern operating since the late nineteenth century, one of the oldest continuous bars downtown."

16. Brochure cadence.
Before: "Discover the charm and elegance of this exquisite boutique."
After: "A boutique on East Patrick carrying independent labels and a small home section."

17. Fragment, no verb.
Before: "Cozy. Local. Unforgettable."
After: "A small bistro with a French-leaning menu and ten tables."

18. Scraped category label.
Before: "Restaurant Restaurant American (Traditional) $$"
After: "An American restaurant with a bar menu until close and a Sunday brunch."

19. We-voice pitch.
Before: "We pride ourselves on crafting unforgettable moments."
After: "An events venue in a restored mill building, used for weddings and civic gatherings."

20. Mixed noise and repeat.
Before: "McClintock Distilling McClintock Distilling Co. Organic spirits 35 S Carroll"
After: "An organic grain-to-glass distillery on Carroll Creek, with a tasting room and tours."

## UI strings

The same rules apply to buttons, empty states, and errors. "No verified hours for this area yet. We hide Open now until coverage is solid." is correct. "Oops! Nothing here :(" is not.
