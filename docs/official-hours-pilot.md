# Official FCPL opening-hours pilot

Nine existing library identities use two free official sources as one required
observation: https://www.fcpl.org/branches-hours and
https://www.fcpl.org/holiday-closings. No user request fetches those pages.
No Google, model, geocoder, database, source key, or NAS runner is involved.

The initial source evidence was fetched on 2026-10-12 at 09:13:08 UTC for weekly
hours and 09:18:49 UTC for dated closures. The artifact retains those exact
observation timestamps and expires seven days after the older observation:
2026-10-19 at 09:13:08 UTC. Regenerating the
catalog or redeploying cannot extend this date. Runtime expiry remains enforced
even if the legacy provider freshness emergency switch is off.

`places-official-hours.json` carries nine exact slug/source-URL bindings,
ordinary weekly windows, source hashes, 29 dated full/early closure days from
the currently published 2026/2027 calendar, and calendar coverage dates. It
restores the existing Urbana Regional Library identity that was incorrectly
folded into the separate farmers market. The library and market retain separate
canonical slugs. This changes the public catalog from 1,570 to 1,571 places;
only the nine libraries receive first-party schedules.

`getOpenStatus` is the one date-aware decision used by server, slim client,
map time scrubber, planner, Ask/Today and detail. Full closures override the
weekly schedule and overnight spill. Early closures clip real windows without
inventing an opening. The ordinary weekly table remains unchanged and labels
itself as the normal week. Opening labels do not promise dates beyond verified
freshness/closure coverage. The map dims only confirmed closed places; unknown
and expired schedules remain unknown. Structured data carries dated exceptions
and bounds its normal-week validity to complete covered days.

## Refresh and delivery

Run `npm run refresh:official-hours -- --dry-run` for a bounded check, or omit
`--dry-run` to update only the local artifact after both pages validate. The
fixed adapter performs at most two public requests, with no redirects or
retries, a 20-second whole-response deadline per request and 256 KB body cap.
It accepts all nine exact branches, all seven weekdays, and reviewed closure
wording only. An unknown active emergency/hours banner fails closed. The
reviewed Staff Development Day banner must agree with the dated calendar.
A missing, failed or ambiguous page leaves last-good bytes and dates unchanged.

The existing daily 09:17 UTC data-steward workflow has an independent hosted
Node 24 `official-hours` job. It generates the catalog, compact map hours,
coverage/review reports and places release manifest, then uses the existing
credential-isolated publisher on `bot/official-library-hours`. The eight-file
output boundary is explicitly shared by the existing CI dispatcher and status
bridge. The normal required verify/style checks still apply.

Only a refresh whose exact reviewed weekly hours, identities, source bindings,
all date exceptions, schema and coverage end are unchanged may auto-merge after
normal checks and the existing catalog-status review gate. Successful source observations, hashes, expiry and the coverage
start may advance. Any semantic change requires review; no missing comparison
or output is permission to auto-merge. Do not publish by copying a candidate
JSON file directly into production.

The source ledger grades the oldest embedded observation of the **deployed**
artifact, independently of the Google policy hold. A failed daily job remains
failed, and the existing production health monitoring can see the source's
stale publication. Inspect the existing workflow/PR if a refresh fails or waits
for review. A green collector or pending PR is not a deployed freshness claim.

## Limits

This is nine libraries, not countywide current-hours coverage. The existing
coverage threshold, seven-day freshness, future-visit checks and extended/24h
visitability guard remain. Future calendar dates do not grant months of verified
weekly hours. Unexpected emergency closures require a new successful official
observation. Source changes outside these fixed published selectors need a
reviewed parser update; the adapter does not infer new wording or use a paid
fallback. The FCPL event-ingest pipeline is separate and unchanged.
