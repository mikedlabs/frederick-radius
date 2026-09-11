# Untappd live taps — the brewer pilot playbook

The public Untappd API is closed to new applicants. The sanctioned path
is per-venue: a brewery on **Untappd for Business Premium** can mint a
read-only API token from their own dashboard and share it. Most
Frederick breweries already pay for UTFB because it runs their digital
menus, so for them this is a two-minute favor, not a signup.

Everything on our side is already built and shipped dark: the moment a
token is configured, that brewery's live tap list appears on /beer
("On tap, live from the breweries"), refreshing every 15 minutes,
text-only (names, styles, ABV/IBU — never Untappd-hosted artwork), with
"via Untappd for Business" attribution on every list.

## The ask (copy-paste for a brewer)

> Radius now shows what's happening at the taprooms tonight, and I want
> your tap list on there live. If you're on Untappd for Business, it
> takes 2 minutes: log in at business.untappd.com, scroll to the footer
> and click API, and create a READ ONLY token. Send me that token and
> the email you log in with. Your menu then shows up on the county beer
> page and updates itself whenever you update Untappd. You can revoke
> the token any time from the same screen.

Ask for the **Read Only** token only. If they send a Read & Write
token, ask for a re-issued read-only one instead of using it.

## Configuring a brewery (owner steps)

1. Vercel → the frederick-radius project → Settings → Environment
   Variables.
2. Add or edit `UNTAPPD_BUSINESS_ACCOUNTS` (Production; mark Sensitive).
   The value is a JSON array, one object per brewery:

```json
[
  {
    "slug": "attaboy-beer-frederick",
    "email": "owner@attaboybeer.com",
    "token": "their-read-only-token"
  }
]
```

- `slug` is the brewery's Radius place slug (the end of its
  /places/... URL).
- `locationId` (optional, a number) pins a specific UTFB location for
  multi-location accounts; omitted, the first location is used.

3. Redeploy (any deploy picks it up). The list appears within one
   15-minute cache cycle.

## Rules that keep this trustworthy

- Tokens are secrets. They live only in the Vercel env var — never in
  the repo, an issue, or a screenshot.
- Text only. Untappd-hosted images are never hotlinked or copied.
- Fail-soft. A brewery whose token stops working silently drops off
  the section; nothing on /beer breaks. Check the Vercel function logs
  for `[untappd] <slug>:` lines when a list goes missing.
- A brewery can leave the pilot by revoking its token; the section
  updates itself within a cache cycle.

## Code map

- `src/lib/integrations/untappd-business.ts` — UTFB client, env
  registry, 15-minute cache (`untappd` tag).
- `src/components/beer/OnTapNow.tsx` — the /beer section; self-hides
  with zero accounts configured.
