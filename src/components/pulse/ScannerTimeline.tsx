import { Radio, ExternalLink } from "lucide-react";

/**
 * ScannerTimeline — the Frederick Scanner block on /pulse.
 *
 * This used to embed X's official timeline widget (platform.twitter.com/
 * widgets.js) for @FredScanner. That path is dead: since X locked down its
 * free embeds (2023), the widget loads but the syndication timeline iframe
 * comes back EMPTY — a 0x0 frame with no tweets — so the card rendered
 * blank, and the old "did it work?" check (does an iframe exist?) was
 * satisfied by that empty frame, so even the fallback never showed. X does
 * not let third-party sites display the live posts without the paid API
 * (see src/data/social-sources.ts: "post content here is not freely
 * pullable — the X API is paywalled").
 *
 * So we stop pretending to embed and do the honest thing the rest of the
 * social catalogue already does: a clean, instant handoff to the source.
 * No third-party script, no blank box, no flaky probe. Pure server
 * component. If we ever buy X API access, ingest into a real in-app feed
 * here rather than reviving the widget.
 */

const SCANNER_HANDLE = "FredScanner";

export default function ScannerTimeline() {
  return (
    <a
      href={`https://x.com/${SCANNER_HANDLE}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the @${SCANNER_HANDLE} live scanner feed on X`}
      className="tactile tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-md)] border p-3.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--app-cool) 13%, transparent)",
          color: "var(--app-cool)",
        }}
      >
        <Radio className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
          See the live scanner feed
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          @{SCANNER_HANDLE} posts calls as they happen, live on X.
        </span>
      </span>
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold"
        style={{ color: "var(--app-cool)" }}
      >
        Open
        <ExternalLink
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
          aria-hidden
        />
      </span>
    </a>
  );
}
