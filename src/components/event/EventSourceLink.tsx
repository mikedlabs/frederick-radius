import { ExternalLink } from "lucide-react";

/**
 * Keep the evidence for an event reachable even when its primary action is a
 * ticket or RSVP. This is deliberately a quiet metadata link, not another CTA:
 * the user can verify the listing without the source competing with the next
 * move the page recommends.
 */
export default function EventSourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-event-source-link
      className="tap-44-y inline-flex items-center gap-1 font-semibold underline decoration-current/40 underline-offset-2"
      style={{ color: "var(--app-brand-press)" }}
    >
      Official event page
      <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
    </a>
  );
}
