# ADR-003: Website installation first, native iPhone pilot later

**Status:** Accepted for website installation; native work paused by the product owner.
**Date:** September 21, 2026.
**Decider:** Product owner, who selected “Public install-from-website experience first.”

The owner subsequently paused native development to focus the remaining work
on web quality and keep development usage bounded. The native options below
are research for a future decision, not authorized implementation work.

## Context

Radius serves the public in Frederick County, Maryland. The immediate goal is
an easy-to-install phone experience, while preserving the existing catalog,
Fair guide, source provenance, links, and saved plans. A native app must earn
its additional development and distribution burden through better user tasks.

The repository is a Next.js web app, not an iOS project. It already has a
standalone manifest, Apple icons, platform-specific installation guidance,
notification settings, and an update-aware service worker. The active worker
is `src/app/sw.js/route.ts`, not the legacy file under `public`. Xcode 26.3 is
installed on the development Mac; that is not evidence of signing, membership,
device deployment, or a built native app.

## Decision

Ship a shareable `/install` entry point that reuses the existing installation
flow. Safari users finish Apple's **Share → Add to Home Screen → Open as Web
App → Add** flow. This creates a Home Screen web app, not an App Store or Xcode
binary. Do not imply that a website can silently install it.
[Apple's iPhone instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

Keep the four primary destinations and one-overlay interaction contract.
Installation is a deliberate action, not a recurring interruption. Browser
and standalone layouts need the same safe-area, large-text, focus, Back,
saved-state, and update-recovery checks. No new paid service, signing identity,
location permission, or notification subscription is needed for this change.

## Options considered

| Option | Reuse and maintenance | Distribution | Decision |
| --- | --- | --- | --- |
| Home Screen web app | Reuses the current UI, APIs, and one release pipeline. | Public website installation. | First release. |
| SwiftUI with native maps | Reuses validated data/APIs, but UI and client state need a separate implementation. | A native distribution channel is still required. | Proposed pilot after task-level evidence. |
| Capacitor shell | Reuses web UI and permits native plugins. A wrapper does not automatically improve cartography or navigation. | Native signing and distribution still apply. | Consider only for a specific capability the web cannot deliver. |

For a native pilot, compare [MapKit for SwiftUI](https://developer.apple.com/documentation/mapkit/mapkit-for-swiftui)
with [MapLibre Native](https://maplibre.org/maplibre-native/ios/latest/documentation/maplibre/mlnofflinepack/).
MapKit offers native Apple map presentation; MapLibre is a candidate for
custom cartography and controlled offline packs. Neither supplies missing
Fair vendor positions or turns the organizer's schematic into surveyed GPS
coordinates. [Capacitor's iOS runtime](https://capacitorjs.com/docs/ios) is an
incremental integration option, not an automatic native redesign.

## Distribution constraints

- [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
  offers public invitation links for up to 10,000 external testers, with
  review requirements and 90-day build expiry. It requires TestFlight and is
  a testing channel, not permanent unrestricted website distribution.
- [Apple's native Web Distribution](https://developer.apple.com/support/web-distribution-eu/)
  is an EU program, not the route for the US audience. Its eligibility terms
  are changing around October 1, 2026; recheck them before any future decision.
- Ad Hoc requires registered devices, with a yearly limit of 100 per product
  family. [Device limits](https://developer.apple.com/help/account/devices/devices-overview/).
  Enterprise distribution is for internal employee apps, not local residents.
  [Enterprise program](https://developer.apple.com/programs/enterprise/).
- An [unlisted app](https://developer.apple.com/support/unlisted-app-distribution/)
  still goes through App Store distribution and review.

## Native roadmap, not shipped features

A useful first SwiftUI pilot would be one journey: find a Fair vendor, inspect
its booth, save a stop, and reopen the plan. Reuse published same-origin
responses such as `/api/map/places`, `/api/search`, and `/api/events/browse`
only after auditing their mobile-client contracts. Keep provider credentials
on the server. Do not rebuild the catalog from the vestigial database tables.

If that pilot wins on usability, investigate a saved-stop widget, an opt-in
next-event Live Activity, and explicit Shortcuts actions. These are native
extension projects with lifecycle, privacy, and stale-data requirements, not
features gained merely by opening Xcode.
[WidgetKit](https://developer.apple.com/documentation/widgetkit),
[ActivityKit](https://developer.apple.com/documentation/ActivityKit), and
[App Intents](https://developer.apple.com/documentation/appintents/widgets-live-activities-and-controls).

## Consequences and acceptance checks

Website installation keeps public access simple and avoids two full clients
today. Native widgets and stronger native integrations remain a separate
investment. Installation does not guarantee offline data, background GPS,
cross-device sync, or notification delivery.

Home Screen Web Push requires a supported installed context and a deliberate
permission request. It does not require Apple Developer membership.
[WebKit Web Push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
Offline claims must name the tested cached resources and their age; browser
storage can be evicted. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

1. Verify `/install` in Safari, a social in-app browser, desktop, and standalone mode.
2. Verify no automatic prompt, no false installation success, and no horizontal overflow at 320px.
3. On a real iPhone, complete installation and relaunch from its Home Screen.
4. Test saved-plan persistence, denied location, and a real deployment update.
5. Test an airplane-mode cold launch before advertising specific offline coverage.
6. Approve a native pilot separately; do not create accounts, certificates, paid services, or a native release under this decision alone.

Automated browser checks can cover the rendered flow. They do not prove that
a physical iPhone has completed Apple's installation steps.
