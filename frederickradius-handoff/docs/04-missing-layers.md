# FrederickRadius: The Missing Layers

**Date:** June 12, 2026
**Position in the stack:** The subtraction brief fixes structure. The Pattern Lab fixes interaction. The Signature Layer fixes feel. This document covers everything those three cannot touch: why a person returns, how you would know, and what compounds while you sleep. These are the layers that separate a beautiful demo from a product with a pulse.

---

## Layer 0: Measurement, and it goes first

You have commissioned four audits in thirty days and every one of them was me or another model walking the site, because there is no evidence in any session that a single analytics event fires anywhere in the app. You have been redesigning blind. The persona agents in the brief gate the structure; only real behavioral data gates reality.

**Build:** PostHog (free tier is plenty at this scale) with exactly ten named events and no more: search_submitted, chip_tapped, place_viewed, directions_tapped, save_tapped, plan_generated, plan_shuffled, event_viewed, outbound_clicked, digest_subscribed. Add session replay for mobile.

**Why it goes before the subtraction work, not after:** instrumenting now gives you a before-and-after baseline, which turns the entire redesign into an experiment instead of an opinion. Two weeks of data will also settle arguments this conversation can only estimate, like whether anyone uses the town chips at all.

**Effort:** one evening. This is the highest ratio of insight to work on this page.

---

## Layer 1: The return loop

Nothing in the current app gives anyone a reason to come back tomorrow. Local guides live or die on ritual, and right now the only retention mechanism is the user remembering the URL. This is the single largest gap in the product.

**Build:** The Weekend Radius, a weekly email that ships every Thursday at 4 PM. It assembles itself from data you already generate: the weekend's editorial picks, one hidden gem with a drone shot, one plan, the civic item worth knowing. You already run Resend for SwipeGrid and Supabase for everything else, so the entire pipeline is a cron job, a template, and a subscribe field in the site footer and on every event page.

**Why email and not push or social:** it is the only channel you own outright, it works without an install, and a Thursday 4 PM arrival creates the exact ritual the product is for. Open rates on hyperlocal digests routinely embarrass every other channel a small product has.

**The bar:** 1,000 local subscribers makes this app un-killable in Frederick regardless of what any competitor ships, because the audience travels with you, not with the interface.

**Effort:** a weekend for v1. The ongoing cost is near zero because the content is the site.

---

## Layer 2: Data operations become the brand

The audits keep finding the same class of problem: dead event links, duplicate records, a timezone bug, hours missing from list views. For a data product, freshness is not a maintenance chore. It is the product, and right now it is invisible when it works and embarrassing when it fails.

**Build three things:**
1. **Nightly validation jobs.** A link checker on every event URL, an hours sanity check against the Places API, and a dedupe pass on the canonical record set. Failures land in a queue, not on the live site.
2. **A freshness badge on every record.** "Verified Tuesday" on a place page converts your biggest liability into the visible reason to trust you over a Google result that might be three years stale.
3. **A closed correction loop.** "Suggest a correction" already exists. Add status: the submitter gets an email when their fix ships. Every closed correction makes one resident feel like a contributor, and contributors evangelize.

**The compounding move:** let business owners claim their listing with a magic link and a domain-matched email. A claimed listing means the owner maintains hours and photos for you. This is the start of the moat and, quietly, the start of revenue.

**Effort:** the validation jobs are one Claude Code session each. The claim flow is a week.

---

## Layer 3: Identity and the Saved graph

Saved exists as a tab, but if it is localStorage it evaporates with the browser, and it currently feeds nothing. A save is the single strongest signal a user can give you, and the app does nothing with it.

**Build:** magic link auth, which you have already shipped once for SwipeGrid, so the pattern is sitting in a repo you own. Saves persist across devices. Then close the loop: the plan generator draws from saved places first, the digest leads with "two of your saved spots have something on this weekend," and the Saved tab becomes "your Radius" in fact rather than in name.

**What not to build:** profiles, followers, avatars, or anything social. Identity here is a key for persistence and personalization, not a network.

**Effort:** a week, mostly reuse.

---

## Layer 4: Install and interrupt

The product is named like an app and lives at a .app domain, but there is no manifest in the captures, which means no home screen icon, no offline shell, and no push. You are renting attention from the browser address bar.

**Build:** PWA basics first: manifest, icons, a service worker that caches the shell, saved places, and this weekend's events for offline. Then push notifications, which now work on installed PWAs on iOS. Push has exactly one dignified use here, and it is the thing Pulse always wanted to be: "Tonight's Alive @ Five is cancelled, storms" or "Heat advisory until 8, three indoor picks." Conditional, rare, and genuinely local. Never marketing.

**Effort:** PWA shell is a session. Push is a second session plus restraint forever.

---

## Layer 5: Distribution, including the engines you are blocking

Two findings from this conversation's research belong here.

First, your robots.txt blocks AI crawlers. I could not reach your site through search or standard fetch today; I had to come in through a raw client. Every "what should we do in Frederick this weekend" question that migrates to ChatGPT, Claude, or Perplexity is a question your data cannot answer while that block stands. For a discovery product, this is hiding the store from the street. Unblock the answer engines deliberately, even if you keep blocking bulk training scrapers.

Second, there is no JSON-LD on listing pages. Event schema is the specific prize: Google maintains an events surface in search and Maps that feeds directly from structured Event markup, and you hold a cleaner county-wide event dataset than anyone publishing it. The same applies to LocalBusiness schema on place pages.

**Also build:** one programmatic page, "Things to do in Frederick this weekend," regenerated every Thursday from the same digest assembly. It targets the single highest-intent local query that exists and you can own it within months.

**Effort:** robots and JSON-LD are one session. The weekend page is one more.

---

## Layer 6: The wedge, and the competitor you have

Part of why the IA sprawled to nineteen modules is that the app is trying to serve three audiences at once: visitors, residents, and civic followers. Strong products pick a wedge and let the others arrive later.

Worth knowing: **Frederick Happenings** is live in the app stores today, a community-powered local events calendar, recently updated with mood filters (happy hour, live music, brunch, nightlife) and a redesigned nav, with local blog coverage praising it as simple and focused. It is a real competitor and it is narrower than you.

That narrowness is the map of your answer. They are events-only, native-only, and submission-driven. You hold four things they structurally cannot match: county-wide places and civic data fused with events, an editorial voice, the plan generator, and six years of aerial photography. None of those four wins for tourists, who Visit Frederick already owns. All four win for **the resident deciding what to do tonight or this weekend**, roughly 285,000 people with weekly recurring intent. That is the wedge. It makes the root-surface decision in the brief for you (Today wins), it decides what the digest leads with, and it tells you which persona test must never fail: the date-night local and the parent.

---

## Layer 7: How it pays for itself

You said it directly: a lot of time and money has gone in. Three honest revenue lines exist, in order of dignity, and none requires an ad network.

1. **Claimed listings.** The claim flow from Layer 2 gets a paid tier: verified badge, owner-managed photos and hours, one featured slot per category, clearly labeled. Local directories sustainably charge $15 to $30 a month for exactly this.
2. **A digest sponsor.** One sponsor, one tasteful line, sold to a Frederick business that wants to be in front of 1,000 locals every Thursday. This is the oldest model in local media because it works.
3. **The drone upsell.** This one is yours alone. A business that claims its listing gets offered an aerial photo package from MAD Productions. The app becomes the top of a funnel for the studio that built it, which also makes every hour you spend on it billable in spirit.

None of these launch before the audience exists. They are listed so the architecture decisions above (claims, digest, identity) are made knowing what they later carry.

---

## The refusal list

Knowing what not to build is half of what you asked. Decline these even when they sound exciting:

- **A reviews system.** Moderation is a job you do not want; a one-tap "worth it" signal after a save gives you local-favorite data without the comment section.
- **A social layer.** Saves and plans, yes. Followers, no.
- **A native app.** The PWA covers install and push. A native build doubles your surface area and forfeits the SEO advantage that is your distribution plan.
- **A chatbot.** The search sheet with intents from the Pattern Lab is the right amount of ask. A conversational agent on top of a 1,700-record dataset is theater.
- **More data sources.** Until the validation jobs run green for a month, every new feed is new debt.

---

## Sequencing

| Order | Work | Effort | Gate |
|---|---|---|---|
| Session 0 | PostHog, ten events, session replay | One evening | Events visible in dashboard |
| Sessions 1 to 4 | The subtraction brief, unchanged | As planned | Persona suite green, budgets hit |
| Session 5 | Signature layer | As planned | Rules of expensive in CLAUDE.md |
| Session 6 | Digest v1 plus subscribe fields | A weekend | First Thursday send |
| Session 7 | JSON-LD, robots fix, weekend page | One session | Event schema validates |
| Session 8 | Validation jobs and freshness badges | Two sessions | Zero dead event links for 7 days |
| Session 9 | Magic link identity, persistent saves | A week | Saves survive a device change |
| Session 10 | PWA shell, then conditional push | Two sessions | Installable, one real alert sent |
| Later | Claim flow, paid tier, sponsor | When list > 1,000 | Audience first |

If you only do two things from this entire document: instrument the app tonight, and ship the Thursday digest this month. Measurement tells you what is true, and the digest makes the audience yours. Everything else, including all three documents before this one, works better on top of those two.
