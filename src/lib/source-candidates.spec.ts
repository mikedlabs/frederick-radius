import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSql: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));

import {
  buildSourceCandidateIntegrationHandoff,
  candidatesFromSourceReport,
  decideSourceCandidate,
  loadSourceCandidateReviewRows,
  sourceCandidateDecisionKey,
  sourceCandidateObservationKey,
  sourceCandidateReportProvider,
} from "./source-candidates";

const NOW = new Date("2026-08-14T12:00:00.000Z");

describe("candidatesFromSourceReport", () => {
  beforeEach(() => {
    mocks.getSql.mockReset();
    mocks.getSql.mockReturnValue(null);
  });

  it("normalizes and deduplicates Tavily food-truck candidates", () => {
    const report = {
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{
        profileId: "food-truck-schedules",
        queryId: "truck-schedules",
        queryText: "Frederick food truck schedules",
        status: "fetched",
        reviewFor: ["food truck schedules"],
        candidates: [
          { url: "https://example.com/trucks#today", title: "Truck calendar", score: 0.82 },
          { url: "https://example.com/trucks", title: "Duplicate", score: 0.4 },
        ],
      }],
    };

    const candidates = candidatesFromSourceReport(report, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      provider: "tavily",
      kind: "food-truck-source",
      url: "https://example.com/trucks",
      confidence: 0.82,
    });
  });

  it("keeps only actionable Firecrawl changes", () => {
    const source = {
      id: "venue-calendar",
      name: "Venue calendar",
      url: "https://venue.example/events",
      category: "event calendar",
      purpose: "Watch lineup changes",
    };
    const report = {
      provider: { name: "firecrawl" },
      generatedAt: NOW.toISOString(),
      candidates: [
        { source, status: "same", checkedAt: NOW.toISOString() },
        { source, status: "changed", checkedAt: NOW.toISOString(), currentHash: "abc" },
      ],
    };

    const candidates = candidatesFromSourceReport(report, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      provider: "firecrawl",
      kind: "event-source",
      status: "changed",
      sourceId: "venue-calendar",
    });
  });

  it("turns only changed Apify pages into review candidates", () => {
    const source = {
      id: "weinberg-calendar",
      name: "Weinberg Center",
      url: "https://weinbergcenter.org/events",
      category: "venue",
      purpose: "Event calendar",
    };
    const report = {
      provider: { name: "apify" },
      generatedAt: NOW.toISOString(),
      reviewQueue: { expiresAt: "2026-08-28T12:00:00.000Z" },
      results: [
        { source, status: "unchanged", collectedAt: NOW.toISOString() },
        {
          source,
          status: "changed",
          confidence: "high",
          collectedAt: NOW.toISOString(),
          changedFields: ["dates"],
        },
      ],
    };

    const candidates = candidatesFromSourceReport(report, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      provider: "apify",
      kind: "event-source",
      confidence: 0.9,
      expiresAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("rejects non-public URLs and unknown provider payloads", () => {
    expect(candidatesFromSourceReport({ provider: { name: "unknown" } }, NOW)).toEqual([]);
    expect(candidatesFromSourceReport({
      provider: { name: "tavily" },
      queries: [{ candidates: [{ url: "file:///etc/passwd" }] }],
    }, NOW)).toEqual([]);
  });

  it("recognizes a valid empty report but rejects malformed parsed JSON", () => {
    expect(sourceCandidateReportProvider({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [],
    })).toBe("tavily");
    expect(sourceCandidateReportProvider({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{ status: "fetched", candidates: "not-an-array" }],
    })).toBeNull();
    expect(sourceCandidateReportProvider({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{ status: "fetched", candidates: [{}] }],
    })).toBeNull();
    expect(sourceCandidateReportProvider({
      provider: { name: "firecrawl" },
      generatedAt: NOW.toISOString(),
      candidates: [{}],
    })).toBeNull();
    expect(sourceCandidateReportProvider({
      provider: { name: "apify" },
      generatedAt: NOW.toISOString(),
      results: [{ status: "changed", source: {} }],
    })).toBeNull();
    expect(sourceCandidateReportProvider({ provider: { name: "unknown" } }))
      .toBeNull();
  });

  it("deduplicates exact retries but preserves a second same-day change", () => {
    const source = {
      id: "alive-at-five",
      name: "Alive at Five",
      url: "https://example.com/alive-at-five",
      category: "event calendar",
    };
    const [candidate] = candidatesFromSourceReport({
      provider: { name: "firecrawl" },
      generatedAt: "2026-08-14T12:00:00.000Z",
      candidates: [{
        source,
        status: "changed",
        checkedAt: "2026-08-14T12:00:00.000Z",
        currentHash: "first",
      }],
    });
    const [laterCandidate] = candidatesFromSourceReport({
      provider: { name: "firecrawl" },
      generatedAt: "2026-08-14T16:00:00.000Z",
      candidates: [{
        source,
        status: "changed",
        checkedAt: "2026-08-14T16:00:00.000Z",
        currentHash: "second",
      }],
    });

    expect(sourceCandidateObservationKey(candidate)).toBe(
      sourceCandidateObservationKey({ ...candidate }),
    );
    expect(sourceCandidateObservationKey(laterCandidate)).not.toBe(
      sourceCandidateObservationKey(candidate),
    );
    expect(sourceCandidateDecisionKey(laterCandidate)).not.toBe(
      sourceCandidateDecisionKey(candidate),
    );
  });

  it("keeps a decision across an unchanged Tavily rediscovery", () => {
    const report = (generatedAt: string) => ({
      provider: { name: "tavily" },
      generatedAt,
      queries: [{
        profileId: "event-sources",
        queryId: "calendars",
        queryText: "Frederick event calendars",
        status: "fetched",
        reviewFor: ["event calendar"],
        candidates: [{
          url: "https://example.com/events",
          title: "Example events",
          score: 0.8,
        }],
      }],
    });
    const [first] = candidatesFromSourceReport(
      report("2026-08-14T12:00:00.000Z"),
    );
    const [later] = candidatesFromSourceReport(
      report("2026-08-20T12:00:00.000Z"),
    );

    expect(sourceCandidateObservationKey(later)).not.toBe(
      sourceCandidateObservationKey(first),
    );
    expect(sourceCandidateDecisionKey(later)).toBe(
      sourceCandidateDecisionKey(first),
    );
  });

  it("ignores Tavily delivery status and score drift in a decision key", () => {
    const report = (status: string, score: number) => ({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{
        profileId: "event-sources",
        queryId: "calendars",
        queryText: "Frederick event calendars",
        status,
        reviewFor: ["event calendar"],
        candidates: [{
          url: "https://example.com/events",
          title: "Example events",
          score,
        }],
      }],
    });
    const [fetched] = candidatesFromSourceReport(report("fetched", 0.8), NOW);
    const [cached] = candidatesFromSourceReport(report("cache", 0.79), NOW);

    expect(fetched.status).not.toBe(cached.status);
    expect(fetched.confidence).not.toBe(cached.confidence);
    expect(sourceCandidateDecisionKey(cached)).toBe(
      sourceCandidateDecisionKey(fetched),
    );
  });

  it("never presents an unavailable evidence store as an empty inbox", async () => {
    await expect(loadSourceCandidateReviewRows()).resolves.toMatchObject({
      available: false,
      rows: [],
      reason: expect.stringContaining("not configured"),
    });

    mocks.getSql.mockReturnValue(vi.fn(() => Promise.reject(new Error("private database detail"))));
    const failed = await loadSourceCandidateReviewRows();
    expect(failed).toMatchObject({
      available: false,
      rows: [],
      reason: expect.stringContaining("could not be read"),
    });
    expect(JSON.stringify(failed)).not.toContain("private database detail");
  });

  it("rejects an unknown review decision before touching the database", async () => {
    await expect(
      decideSourceCandidate(
        `${"a".repeat(64)}:${"b".repeat(24)}`,
        "silently-publish" as never,
      ),
    ).rejects.toThrow("Invalid source candidate decision.");
    expect(mocks.getSql).not.toHaveBeenCalled();
  });

  it("loads the latest evidence with its stable material decision key", async () => {
    const [candidate] = candidatesFromSourceReport({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{
        profileId: "event-sources",
        queryId: "calendars",
        status: "fetched",
        reviewFor: ["event calendar"],
        candidates: [{ url: "https://example.com/events", title: "Events" }],
      }],
    });
    const observationKey = sourceCandidateObservationKey(candidate);
    const decisionKey = sourceCandidateDecisionKey(candidate);
    mocks.getSql.mockReturnValue(vi.fn(async () => [{
      entity_key: candidate.key,
      observation_key: observationKey,
      decision_key: decisionKey,
      observed_value: { ...candidate, decisionKey },
      confidence: candidate.confidence,
      observed_at: candidate.observedAt,
      valid_until: candidate.expiresAt,
      first_observed_at: candidate.observedAt,
      observation_count: 2,
      expired: false,
      decision: "approved",
      decided_at: "2026-08-14T13:00:00.000Z",
    }]));

    await expect(loadSourceCandidateReviewRows()).resolves.toMatchObject({
      available: true,
      rows: [{
        observationKey,
        decisionKey,
        decision: "approved",
        observationCount: 2,
      }],
    });
  });

  it("turns an approved Tavily discovery into a guarded adapter handoff", () => {
    const [candidate] = candidatesFromSourceReport({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{
        profileId: "event-sources",
        queryId: "calendars",
        status: "fetched",
        reviewFor: ["event calendar"],
        candidates: [{
          url: "https://venue.example/events",
          title: "Venue events",
          score: 0.84,
        }],
      }],
    });
    const handoff = buildSourceCandidateIntegrationHandoff({
      ...candidate,
      observationKey: sourceCandidateObservationKey(candidate),
      decisionKey: sourceCandidateDecisionKey(candidate),
      decision: "approved",
      decidedAt: "2026-08-14T13:00:00.000Z",
      firstObservedAt: candidate.observedAt,
      observationCount: 1,
      expired: false,
    });

    expect(handoff.mode).toBe("new-adapter");
    expect(handoff.title).toBe(
      "Integrate Venue events as a Radius event inventory source",
    );
    expect(handoff.markdown).toContain("https://venue.example/events");
    expect(handoff.markdown).toContain("`data/sources.yaml`");
    expect(handoff.markdown).toContain("fetched, parsed, normalized, accepted, published, and publicly returned");
    expect(handoff.markdown).toContain("Do not publish provider summaries");
  });

  it("turns an approved change signal into a reverification handoff, not a fact", () => {
    const [candidate] = candidatesFromSourceReport({
      provider: { name: "apify" },
      generatedAt: NOW.toISOString(),
      reviewQueue: { expiresAt: "2026-08-28T12:00:00.000Z" },
      results: [{
        source: {
          id: "alive-at-five",
          name: "Alive at Five",
          url: "https://downtownfrederick.org/alive-at-five/",
          category: "event calendar",
          purpose: "Watch lineup changes",
        },
        status: "changed",
        confidence: "high",
        collectedAt: NOW.toISOString(),
        changedFields: ["dates", "lineup"],
      }],
    });
    const handoff = buildSourceCandidateIntegrationHandoff({
      ...candidate,
      observationKey: sourceCandidateObservationKey(candidate),
      decisionKey: sourceCandidateDecisionKey(candidate),
      decision: "approved",
      decidedAt: NOW.toISOString(),
      firstObservedAt: candidate.observedAt,
      observationCount: 2,
      expired: false,
    });

    expect(handoff.mode).toBe("source-change");
    expect(handoff.title).toBe("Reverify Alive at Five source change");
    expect(handoff.markdown).toContain("Changed areas reported: dates, lineup");
    expect(handoff.markdown).toContain("Treat the provider fingerprint as a review cue only");
    expect(handoff.markdown).toContain("Only original-source facts");
  });

  it("does not let provider text inject Markdown or GitHub mentions into a handoff", () => {
    const [candidate] = candidatesFromSourceReport({
      provider: { name: "tavily" },
      generatedAt: NOW.toISOString(),
      queries: [{
        profileId: "event-sources",
        queryId: "calendars",
        status: "fetched",
        reviewFor: ["event calendar @octocat"],
        candidates: [{
          url: "https://venue.example/events",
          title: "# `Injected` @octocat <script>",
        }],
      }],
    });
    const handoff = buildSourceCandidateIntegrationHandoff({
      ...candidate,
      observationKey: sourceCandidateObservationKey(candidate),
      decisionKey: sourceCandidateDecisionKey(candidate),
      decision: "approved",
      decidedAt: NOW.toISOString(),
      firstObservedAt: candidate.observedAt,
      observationCount: 1,
      expired: false,
    });

    expect(handoff.title).toBe(
      "Integrate Injected octocat script as a Radius event inventory source",
    );
    expect(handoff.markdown).not.toContain("@octocat");
    expect(handoff.markdown).not.toContain("<script>");
  });
});
