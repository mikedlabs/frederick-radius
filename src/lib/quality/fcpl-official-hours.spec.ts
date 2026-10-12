import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshOfficialHours } from "../../../scripts/refresh-official-hours";
import { describe, expect, it, vi } from "vitest";
import { fetchOfficialHoursPage, parseFcplOfficialHours, officialHoursNeedsReview } from "../../../scripts/lib/fcpl-official-hours";
import { FCPL_CLOSURES_URL, FCPL_HOURS_URL } from "@/lib/official-hours";
const now = new Date("2026-10-12T10:00:00Z");
const weekly = { url: FCPL_HOURS_URL, html: readFileSync("tests/fixtures/fcpl-hours-index.html", "utf8"), observedAt: "2026-10-12T09:13:00.000Z" };
const closures = { url: FCPL_CLOSURES_URL, html: readFileSync("tests/fixtures/fcpl-holiday-closings.html", "utf8"), observedAt: "2026-10-12T09:18:00.000Z" };
describe("bounded first-party source adapter", () => {
  it("maps exactly nine reviewed branches and expands inclusive full/partial closure dates", () => {
    const artifact = parseFcplOfficialHours(weekly, closures, now);
    expect(artifact.places).toHaveLength(9);
    expect(artifact.closures.exceptions).toHaveLength(29);
    expect(artifact.closures.exceptions).toContainEqual({ date: "2026-11-27", closed: true, reason: "Thanksgiving" });
    expect(artifact.closures.exceptions).toContainEqual({ date: "2026-12-31", closes_at: "17:00", reason: "New Year's Eve - Libraries close at 5pm" });
    expect(artifact.closures.coverage_through).toBe("2027-12-31");
    expect(artifact.expires_at).toBe("2026-10-19T09:13:00.000Z");
  });
  it.each(["", closures.html.replace('datetime="2026-10-12"', 'datetime="2026-02-30"'), closures.html.replace('Veteran\'s Day', 'Hours may vary'), closures.html.replaceAll('2026', '2025')])("fails closed on missing, invalid or ambiguous closure evidence", (html) => {
    expect(() => parseFcplOfficialHours(weekly, { ...closures, html }, now)).toThrow();
  });
  it("expands a published date range across a year boundary without adding a following day", () => {
    const html = `<table><caption>2026 Holidays</caption><tbody><tr><td class="views-field-title">Libraries Closed - Staff Development Day</td><td><time datetime="2026-10-12"></time></td></tr><tr><td class="views-field-title">Christmas Holiday</td><td><time datetime="2026-12-30"></time><time datetime="2027-01-02"></time></td></tr></tbody></table><table><caption>2027 Holidays</caption><tbody><tr><td class="views-field-title">Thanksgiving</td><td><time datetime="2027-11-25"></time></td></tr></tbody></table>`;
    const dates = parseFcplOfficialHours(weekly, { ...closures, html }, now).closures.exceptions.map((entry) => entry.date);
    expect(dates).toEqual(["2026-10-12", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-11-25"]);
  });
  it("rejects a missing branch/day, duplicate branch, and contradictory weekly hours", () => {
    for (const html of [weekly.html.replaceAll('/branches-hours/walkersville-branch-library', '/branches-hours/unrecognized'), weekly.html.replace('Monday - Thursday:', 'Maybe Monday:'), weekly.html + weekly.html, weekly.html.replace('10:00 am-8:00 pm', '10:00 pm-8:00 am')]) {
      expect(() => parseFcplOfficialHours({ ...weekly, html }, closures, now)).toThrow();
    }
  });
  it("does not restamp an offline observation or mutate last good data on failed parsing", () => {
    const prior = parseFcplOfficialHours(weekly, closures, now);
    const serialized = JSON.stringify(prior);
    expect(() => parseFcplOfficialHours(weekly, { ...closures, html: "Unavailable" }, now)).toThrow();
    expect(JSON.stringify(prior)).toBe(serialized);
    expect(parseFcplOfficialHours(weekly, closures, new Date("2026-10-13T09:00:00Z")).expires_at).toBe(prior.expires_at);
    expect(() => parseFcplOfficialHours({ ...weekly, observedAt: "2026-10-14T09:00:00Z" }, closures, now)).toThrow(/observation/);
  });
  it("requests only the fixed source without credentials, retries or redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>official</html>", { headers: { "content-type": "text/html" } }));
    const result = await fetchOfficialHoursPage(FCPL_HOURS_URL, fetcher);
    expect(result.url).toBe(FCPL_HOURS_URL);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Accept: "text/html" } });
    await expect(fetchOfficialHoursPage("https://example.com" as typeof FCPL_HOURS_URL, fetcher)).rejects.toThrow(/Unapproved/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized, failed and wrong-content responses without fallback requests", async () => {
    for (const response of [new Response("x", { status: 503 }), new Response("{}", { headers: { "content-type": "application/json" } }), new Response("x".repeat(256001), { headers: { "content-type": "text/html" } })]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      await expect(fetchOfficialHoursPage(FCPL_CLOSURES_URL, fetcher)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects a new active branch/weather notice even when the annual calendar is intact", () => {
    const unknown = weekly.html.replace("Frederick County Public Libraries will be closed on Monday, October 12, 2026 for Staff Development Day.", "Walkersville Branch Library is closed today due to weather.");
    expect(() => parseFcplOfficialHours({ ...weekly, html: unknown }, closures, now)).toThrow(/active FCPL closure notice/);
    const conflict = closures.html.replace('datetime="2026-10-12"', 'datetime="2026-10-13"');
    expect(() => parseFcplOfficialHours(weekly, { ...closures, html: conflict }, now)).toThrow(/not covered/);
  });
  it("bounds both response and body reads when a transport ignores the abort signal", async () => {
    await expect(fetchOfficialHoursPage(FCPL_HOURS_URL, vi.fn(() => new Promise<Response>(() => {})), 10)).rejects.toThrow(/deadline/);
    const stalled = new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } });
    await expect(fetchOfficialHoursPage(FCPL_CLOSURES_URL, vi.fn().mockResolvedValue(stalled), 10)).rejects.toThrow(/deadline/);
  });
  it("the actual refresh runner preserves last-good bytes and timestamps on fetch or closure-parse failure", async () => {
    const output = join(mkdtempSync(join(tmpdir(), "fcpl-hours-atomic-")), "hours.json");
    const previous = JSON.stringify(parseFcplOfficialHours(weekly, closures, now));
    writeFileSync(output, previous);
    const failSecond = vi.fn().mockResolvedValueOnce(weekly).mockRejectedValueOnce(new Error("closure unavailable"));
    await expect(refreshOfficialHours([], { outputPath: output, fetchPage: failSecond, now })).rejects.toThrow(/unavailable/);
    expect(readFileSync(output, "utf8")).toBe(previous);
    expect(failSecond).toHaveBeenCalledTimes(2);
    const invalidSecond = vi.fn().mockResolvedValueOnce(weekly).mockResolvedValueOnce({ ...closures, html: "Unavailable" });
    await expect(refreshOfficialHours([], { outputPath: output, fetchPage: invalidSecond, now })).rejects.toThrow();
    expect(readFileSync(output, "utf8")).toBe(previous);
    const valid = vi.fn().mockResolvedValueOnce(weekly).mockResolvedValueOnce(closures);
    await refreshOfficialHours([], { outputPath: output, fetchPage: valid, now });
    expect(JSON.parse(readFileSync(output, "utf8")).expires_at).toBe("2026-10-19T09:13:00.000Z");
  });

  it("only actual observation/hash/expiry/coverage-start refreshes are eligible for normal auto-merge", () => {
    const previous = parseFcplOfficialHours(weekly, closures, now);
    const refreshed = parseFcplOfficialHours({ ...weekly, observedAt: "2026-10-13T09:13:00.000Z", html: weekly.html + " " }, { ...closures, observedAt: "2026-10-13T09:18:00.000Z", html: closures.html + " " }, new Date("2026-10-13T10:00:00Z"));
    expect(officialHoursNeedsReview(previous, refreshed)).toBe(false);
    for (const mutate of [
      (a: typeof refreshed) => { a.places[0].hours.tue![0].close = "19:00"; },
      (a: typeof refreshed) => { a.closures.exceptions[0].reason = "Changed reason"; },
      (a: typeof refreshed) => { a.closures.exceptions.pop(); },
      (a: typeof refreshed) => { a.closures.coverage_through = "2027-11-30"; },
      (a: typeof refreshed) => { a.places[0].source_url = a.places[1].source_url; },
      (a: typeof refreshed) => { a.places[0].source_name = "Changed branch"; },
    ]) {
      const changed = structuredClone(refreshed); mutate(changed);
      expect(officialHoursNeedsReview(previous, changed)).toBe(true);
    }
    expect(officialHoursNeedsReview(undefined, refreshed)).toBe(true);
  });

});
