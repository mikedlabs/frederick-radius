# Plausible Starter setup for Frederick Radius

Plausible should answer one practical question: does Radius help someone find a useful next step? Native pageviews show where visits start. A small set of custom goals shows whether people reach an answer, open a useful tool, or save something for later.

## Finish the installation

1. In Plausible, open **Settings → General → Site Installation** for `frederickradius.app`.
2. The public Frederick Radius `pa-*.js` URL from that screen is already the code default. No Plausible password or API key belongs in Vercel.
3. Deploy, then use Plausible's installation test. A real pageview should send a request to `/api/event`.
4. `NEXT_PUBLIC_PLAUSIBLE_SRC` is only needed later if the tracker is moved behind a first-party proxy.

The app queues early events while the script loads. Preview and local traffic should not be added to the production site configuration.

## Goals to create

Create pageview goals for these routes:

- `/today`
- `/map`
- `/ask`
- `/pulse`
- `/compass`

Create custom-event goals with these exact names:

- `find_open`
- `search_pick`
- `search_map`
- `search_empty`
- `ask_open`
- `ask_submit`
- `ask_answer`
- `ask_empty`
- `map_pin`
- `pulse_item_open`
- `compass_tool_open`
- `save_place`
- `save_event`
- `calendar_add`
- `push_optin`
- `report_submit`
- `feedback_send`
- `share_today`

Do not enable automatic outbound-link, file-download, or form tracking unless there is a specific question it will answer. Each custom event counts toward Starter usage.

## What to review each week

- Compare visits to `/today`, `/map`, `/pulse`, and `/compass` with their related action goals.
- Watch `search_empty` and `ask_empty` as friction rates, not raw totals. Exact missed text stays in Radius's private `/admin/data-gaps` queue and is not sent to Plausible.
- Treat `save_place`, `save_event`, and `ask_answer` as the strongest signs that the app delivered value.
- Check mobile versus desktop and referral sources before changing a layout. A Reddit spike should not be mistaken for ordinary local use.

Starter does not include the Stats API, funnels, user journeys, or custom-property analysis. Use Plausible's own dashboard and CSV export. The existing embedded admin traffic panels can be enabled later with a Business plan and server-side API credentials; no Plausible password should ever be added to the repo.
