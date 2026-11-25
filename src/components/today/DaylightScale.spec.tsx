// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaylightScale from "./DaylightScale";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";

function scaleFor(time: number) {
  const markup = renderToStaticMarkup(createElement(DaylightScale, { initialNow: time }));
  return new DOMParser().parseFromString(markup, "text/html");
}

const { sunrise, sunset } = sunTimes(new Date("2026-11-24T17:00:00Z"), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
const start = sunrise!.getTime();
const end = sunset!.getTime();

describe("Today’s daylight scale", () => {
  it("renders Frederick’s local day and a proportional marker in the first HTML", () => {
    const page = scaleFor((start + end) / 2);
    expect(page.querySelector("[data-daylight-now]")?.getAttribute("cx")).toBe("64");
    expect(page.querySelector("[data-daylight-now]")?.getAttribute("cy")).toBe("4");
    expect(page.querySelector('[aria-label="Daylight in Frederick"]')?.textContent).toMatch(/Sunrise 7:\d\d AM.*of daylight left.*Sunset 4:\d\d PM/);
    expect([...page.querySelectorAll("time")].map(time => time.dateTime)).toEqual([sunrise!.toISOString(), sunset!.toISOString()]);
  });

  it("keeps pre-sunrise, the last daylight minute, and after-sunset distinct", () => {
    expect(scaleFor(start - 60_000).body.textContent).toContain("Sunrise in 1m");
    expect(scaleFor(end - 1).body.textContent).toContain("1m of daylight left");
    expect(scaleFor(end).body.textContent).toContain("After sunset");
    expect(scaleFor(start - 1).querySelector("[data-daylight-now]")).toBeNull();
    expect(scaleFor(end).querySelector("[data-daylight-now]")).toBeNull();
  });

  it("keeps the local day’s sunset after UTC midnight", () => {
    const page = scaleFor(Date.parse("2026-11-25T02:10:00Z"));
    expect(page.querySelectorAll("time")[1].dateTime).toBe(sunset!.toISOString());
    expect(page.body.textContent).toContain("After sunset");
  });
});
