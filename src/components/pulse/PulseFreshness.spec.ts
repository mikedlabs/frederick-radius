import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PulseFreshness, {
  formatPulseSnapshotTime,
  PULSE_AUTO_REFRESH_MS,
  PulseStatusLabel,
  pulseSnapshotNeedsRefresh,
  pulseStatusForSnapshot,
} from "./PulseFreshness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Pulse snapshot freshness", () => {
  const now = Date.parse("2026-08-01T14:00:00.000Z");

  it("keeps a recent server snapshot current", () => {
    expect(
      pulseSnapshotNeedsRefresh(now - PULSE_AUTO_REFRESH_MS + 1, now),
    ).toBe(false);
  });

  it("expires a stale or invalid quiet claim", () => {
    expect(
      pulseStatusForSnapshot(
        "All quiet",
        true,
        now - PULSE_AUTO_REFRESH_MS,
        now,
      ),
    ).toBe("Updating");
    expect(pulseStatusForSnapshot("All quiet", true, Number.NaN, now)).toBe(
      "Updating",
    );
    expect(
      pulseStatusForSnapshot(
        "Partial data",
        false,
        now - PULSE_AUTO_REFRESH_MS,
        now,
      ),
    ).toBe("Partial data");
  });

  it("gives reader mode an absolute Eastern snapshot time", () => {
    expect(formatPulseSnapshotTime(now)).toBe("Aug 1, 10:00 AM");
    expect(formatPulseSnapshotTime(Number.NaN)).toBe("time unavailable");

    const html = renderToStaticMarkup(
      createElement(PulseFreshness, { renderedAt: now }),
    );
    expect(html).toContain("As of Aug 1, 10:00 AM");
    expect(html).toContain('dateTime="2026-08-01T14:00:00.000Z"');
  });

  it("does not server-render a stale quiet claim", () => {
    const html = renderToStaticMarkup(
      createElement(PulseStatusLabel, {
        renderedAt: 0,
        status: "All quiet",
        canClaimCurrent: true,
        color: "#123456",
      }),
    );

    expect(html).toContain("Updating");
    expect(html).not.toContain("All quiet");
  });
});
