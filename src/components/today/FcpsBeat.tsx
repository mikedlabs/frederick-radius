import Link from "next/link";
import { School } from "lucide-react";
import { getFcpsAlerts, type FcpsStatus } from "@/lib/integrations/fcps";

// Only these statuses are worth a masthead line; "open"/"unknown" are not news.
const ACTIONABLE: Record<string, string> = {
  closed: "closed today",
  delayed: "on a delayed opening today",
  early_dismissal: "on early dismissal today",
};

const RECENT_MS = 18 * 60 * 60 * 1000; // a morning-of announcement window

/**
 * FcpsBeat — a single dated line that appears ONLY when Frederick County Public
 * Schools announces a closing, delay, or early dismissal today. Silent on a
 * normal school day and all summer. The single most-checked "did the boring
 * thing change" for school households, answered without opening a TV-station
 * site.
 *
 * Honest by construction: it reads FCPS's own RSS status (getFcpsAlerts already
 * infers status and drops "unknown"), states only the announced fact, and never
 * infers a closing from the weather. Async server component, streamed in its own
 * Suspense so it never blocks the I-want grid; self-hides when nothing applies.
 */
export default async function FcpsBeat({ now }: { now: Date }) {
  const alerts = await getFcpsAlerts().catch(() => []);
  const nowMs = now.getTime();
  const hit = alerts.find(
    (a) =>
      ACTIONABLE[a.status as FcpsStatus] !== undefined &&
      nowMs - new Date(a.published_at).getTime() < RECENT_MS,
  );
  if (!hit) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      <School className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-cool)" }} />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>FCPS {ACTIONABLE[hit.status]}.</span>
      <Link href={hit.url} className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
        Details →
      </Link>
    </p>
  );
}
