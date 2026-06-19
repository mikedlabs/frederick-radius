import type { Metadata } from "next";
import Link from "next/link";
import { getActiveAdvisories } from "@/lib/integrations/civicAlerts";
import CivicAlertForm from "@/components/admin/CivicAlertForm";

export const metadata: Metadata = {
  title: "Civic alerts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin: post a hyper-local civic advisory (road work / closure / emergency)
 * the live feeds don't carry. Writes go through POST /api/civic-alerts, which
 * is admin-gated (ADMIN_EMAILS) and self-expiring. The list below is the
 * combined live set (DB channel + the static fallback) — exactly what Pulse's
 * "Road work & closures" card renders right now.
 */
export default async function CivicAlertsAdmin() {
  // eslint-disable-next-line react-hooks/purity -- per-request expiry clock; the page is force-dynamic
  const live = await getActiveAdvisories(Date.now());

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Admin
      </Link>

      <h1 className="mt-3 font-serif text-2xl font-semibold" style={{ color: "var(--app-ink)" }}>
        Civic alerts
      </h1>
      <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
        Post the road work, closures, and emergencies the City/County feeds miss.
        Every alert self-expires. They render in Pulse&rsquo;s &ldquo;Road work &amp;
        closures&rdquo; card.
      </p>

      <section className="mt-6">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          Live now ({live.length})
        </h2>
        {live.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            None active. Anything you post below shows here and in Pulse.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
            {live.map((a) => (
              <li key={a.url} className="px-3 py-2.5">
                <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--app-ink)" }}>
                  {a.title}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                  {a.sourceShort}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          Post a new advisory
        </h2>
        <CivicAlertForm />
      </section>
    </div>
  );
}
