import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const segment = path.join(
  process.cwd(),
  "src/app/(app)/events/[slug]",
);

describe("event detail transient-failure contract", () => {
  it("keeps timeouts distinct from true 404s and offers recovery", () => {
    const boundary = readFileSync(path.join(segment, "error.tsx"), "utf8");
    const page = readFileSync(path.join(segment, "page.tsx"), "utf8");
    const recovery = readFileSync(
      path.join(
        process.cwd(),
        "src/components/event/EventLookupRecovery.tsx",
      ),
      "utf8",
    );

    expect(recovery).toContain("This event could not be confirmed yet.");
    expect(recovery).toContain("window.location.reload()");
    expect(recovery).toContain('href="/events"');
    expect(boundary).toContain("<EventLookupRecovery onRetry={reset} />");
    expect(boundary).toContain("Sentry.captureException(error)");

    // Known source outages must return the Radius-owned recovery screen as a
    // normal page response instead of throwing into a 500 boundary. The route
    // must be explicitly request-rendered: conditional noStore() during an ISR
    // render is itself a DYNAMIC_SERVER_USAGE error in Next 16.
    expect(page).toContain("isOperationalEventResolutionError(error)");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toContain("export const revalidate = 300");
    expect(page).toContain("noStore();");
    expect(page).toContain("return <EventLookupRecovery />");
  });

  it("does not add a loading boundary that would turn unknown slugs into soft 404s", () => {
    expect(() =>
      readFileSync(path.join(segment, "loading.tsx"), "utf8"),
    ).toThrow();
  });

  it("keeps operational event aggregation out of document metadata", () => {
    const source = readFileSync(path.join(segment, "page.tsx"), "utf8");
    const metadataBody = source.match(
      /export async function generateMetadata[\s\S]*?\n}\n\nexport default async function EventPage/,
    )?.[0];

    expect(metadataBody).toBeTruthy();
    expect(metadataBody).toContain("resolveEventMetadataBySlug(slug)");
    expect(metadataBody).not.toContain("resolveEventPageBySlug(slug)");
    expect(metadataBody).toContain('title: "Event in Frederick County"');
    expect(metadataBody).toContain("robots: { index: false, follow: false }");
  });

  it("does not start a countywide ingested cache fill from a detail request", () => {
    const resolver = readFileSync(
      path.join(process.cwd(), "src/lib/loaders/eventResolver.ts"),
      "utf8",
    );
    const productionSources = resolver.match(
      /const PRODUCTION_PAGE_SOURCES[\s\S]*?\n};/,
    )?.[0];

    expect(productionSources).toBeTruthy();
    expect(productionSources).toContain("allowSeriesScan: false");
  });
});
