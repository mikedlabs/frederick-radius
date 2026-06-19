import { describe, it, expect } from "vitest";
import {
  getCuratedAdvisories,
  parseCivicAlertBody,
  type CuratedAlert,
} from "@/lib/integrations/civicAlerts";

const base: CuratedAlert = {
  id: "x",
  title: "Test advisory.",
  source: "City of Frederick",
  url: "https://example.gov/#x",
  startsAt: "2026-06-19T00:00:00-04:00",
  expiresAt: "2026-06-26T23:59:59-04:00",
};
const at = (iso: string) => Date.parse(iso);

describe("getCuratedAdvisories", () => {
  it("emits an alert only inside its [startsAt, expiresAt] window", () => {
    const within = getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [base]);
    expect(within).toHaveLength(1);
    expect(within[0]).toMatchObject({ lane: "advisory", sourceShort: "City", url: base.url });

    expect(getCuratedAdvisories(at("2026-06-01T12:00:00-04:00"), [base])).toHaveLength(0); // before
    expect(getCuratedAdvisories(at("2026-07-01T12:00:00-04:00"), [base])).toHaveLength(0); // expired
  });

  it("derives the County source pip and drops malformed windows", () => {
    const county = { ...base, source: "Frederick County" as const };
    expect(getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [county])[0].sourceShort).toBe("County");

    const bad = { ...base, expiresAt: "not-a-date" };
    expect(getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [bad])).toHaveLength(0);
  });

  it("returns newest-window-first", () => {
    const older = { ...base, id: "old", startsAt: "2026-06-19T00:00:00-04:00", url: "https://example.gov/#old" };
    const newer = { ...base, id: "new", startsAt: "2026-06-21T00:00:00-04:00", url: "https://example.gov/#new" };
    const out = getCuratedAdvisories(at("2026-06-22T12:00:00-04:00"), [older, newer]);
    expect(out.map((a) => a.url)).toEqual(["https://example.gov/#new", "https://example.gov/#old"]);
  });
});

describe("parseCivicAlertBody", () => {
  const now = at("2026-06-19T12:00:00-04:00");
  const future = "2026-06-26T12:00:00-04:00";

  it("accepts a valid body and normalizes defaults", () => {
    const r = parseCivicAlertBody({ title: "Water main on N Market.", expiresAt: future }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.severity).toBe("advisory");
      expect(r.value.source).toBe("City of Frederick");
      expect(r.value.ends_at.toISOString()).toBe(new Date(future).toISOString());
    }
  });

  it("requires a title and a FUTURE expiry", () => {
    expect(parseCivicAlertBody({ expiresAt: future }, now)).toMatchObject({ ok: false, error: "title-required" });
    expect(parseCivicAlertBody({ title: "Valid title here" }, now)).toMatchObject({ ok: false, error: "expiresAt-required" });
    expect(
      parseCivicAlertBody({ title: "Valid title here", expiresAt: "2026-06-01T00:00:00-04:00" }, now),
    ).toMatchObject({ ok: false, error: "expiresAt-must-be-future" });
  });

  it("rejects a non-http url and clamps an unknown severity to advisory", () => {
    expect(parseCivicAlertBody({ title: "Valid title", expiresAt: future, url: "javascript:alert(1)" }, now)).toMatchObject({
      ok: false,
      error: "url-invalid",
    });
    const r = parseCivicAlertBody({ title: "Valid title", expiresAt: future, severity: "bogus" }, now);
    expect(r.ok && r.value.severity).toBe("advisory");
  });
});
