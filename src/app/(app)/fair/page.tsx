import type { Metadata } from "next";
import { PageColumn } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";

/**
 * /fair was printed and spoken during the 2026 Great Frederick Fair, so the
 * address stays a real page after the fair workspace was retired. It states
 * that the fair is over and offers one way forward. Other retired fair
 * addresses redirect here from next.config.ts.
 *
 * The copy makes no statement about a future fair because no dates are known.
 */
export const metadata: Metadata = {
  title: "The 2026 Great Frederick Fair has ended",
  description:
    "The 2026 Great Frederick Fair ran from September 18 to 26, 2026, and the Frederick Radius guide to it has closed. See current events in Frederick County.",
  alternates: { canonical: "/fair" },
};

export default function FairPage() {
  return (
    <PageColumn as="div" className="py-6">
      <header className="space-y-3">
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          The 2026 Great Frederick Fair has ended.
        </h1>
        <p className="text-body-lg text-pretty" style={{ color: "var(--app-ink-2)" }}>
          The fair ran from September 18 to 26, 2026. The Frederick Radius
          guide to the fair closed when the fair did.
        </p>
        <p className="text-body-lg text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Events across Frederick County are listed on the Events page.
        </p>
      </header>
      <Button href="/events">See events</Button>
    </PageColumn>
  );
}
